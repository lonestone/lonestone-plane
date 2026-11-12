# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Project subscribers (LONESTONEP-8), as Plane's Enterprise Grid "Project subscribers"."""

from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.db.models import Exists, OuterRef
from django.template.loader import render_to_string

from plane.app.permissions.base import ROLE
from plane.db.models import (
    Issue,
    IssueAssignee,
    IssueSubscriber,
    Notification,
    Project,
    ProjectMember,
    User,
    UserNotificationPreference,
)
from plane.extended.models import ProjectSubscriber
from plane.license.utils.instance_value import get_email_configuration
from plane.utils.email import generate_plain_text_from_html
from plane.utils.exception_logger import log_exception

NOT_ELIGIBLE = "subscriber_not_eligible"

# Rendered by the web app's FORK_NOTIFICATION_CONTENT_MAP.
NEW_WORK_ITEM_FIELD = "project_subscription"


class SubscriberNotEligible(ValueError):
    pass


def _eligible_members(project_id: UUID | str):
    return ProjectMember.objects.filter(project_id=project_id, is_active=True, role__gte=ROLE.MEMBER.value)


def is_eligible_member(project_id: UUID | str, user_id: UUID | str) -> bool:
    return _eligible_members(project_id).filter(member_id=user_id).exists()


def _active_admin_ids(project_id: UUID | str) -> list[UUID]:
    return list(
        ProjectMember.objects.filter(project_id=project_id, is_active=True, role=ROLE.ADMIN.value).values_list(
            "member_id", flat=True
        )
    )


def subscriber_entries(project_id: UUID | str) -> list[dict]:
    """Active admins (``default``, unless they opted out) then the members an admin added."""
    eligible = _eligible_members(project_id).filter(member_id=OuterRef("subscriber_id"))
    rows = ProjectSubscriber.objects.filter(project_id=project_id)
    added = list(rows.filter(is_subscribed=True).filter(Exists(eligible)).values_list("subscriber_id", flat=True))
    opted_out = set(rows.filter(is_subscribed=False).values_list("subscriber_id", flat=True))
    admins = [admin_id for admin_id in _active_admin_ids(project_id) if admin_id not in opted_out]
    entries = [{"subscriber_id": admin_id, "default": True} for admin_id in admins]
    entries += [{"subscriber_id": member_id, "default": False} for member_id in added if member_id not in admins]
    return entries


def eligible_subscriber_ids(project_id: UUID | str) -> list[UUID]:
    return [entry["subscriber_id"] for entry in subscriber_entries(project_id)]


def subscribe_to_issues(
    project_id: UUID | str,
    subscriber_ids: Iterable[UUID | str],
    issue_ids: Iterable[UUID | str],
) -> None:
    """No activity nor notification (``bulk_create``); existing subscriptions are skipped."""
    subscriber_ids = list(subscriber_ids)
    if not subscriber_ids:
        return
    issue_ids = list(issue_ids)
    if not issue_ids:
        return
    workspace_id = Project.objects.filter(pk=project_id).values_list("workspace_id", flat=True).first()
    IssueSubscriber.objects.bulk_create(
        [
            IssueSubscriber(
                project_id=project_id,
                workspace_id=workspace_id,
                issue_id=issue_id,
                subscriber_id=subscriber_id,
            )
            for issue_id in issue_ids
            for subscriber_id in subscriber_ids
        ],
        ignore_conflicts=True,
        batch_size=1000,
    )


def subscribe_new_issue(issue: Issue) -> None:
    subscribe_to_issues(issue.project_id, eligible_subscriber_ids(issue.project_id), [issue.id])


def add_subscriber(project: Project, user_id: UUID | str) -> tuple[ProjectSubscriber, bool]:
    """Also subscribes them to the current work items, as Plane does."""
    if not is_eligible_member(project.id, user_id):
        raise SubscriberNotEligible(NOT_ELIGIBLE)
    subscriber, created = ProjectSubscriber.objects.get_or_create(project=project, subscriber_id=user_id)
    if not subscriber.is_subscribed:  # an admin who had opted out
        subscriber.is_subscribed = True
        subscriber.save(update_fields=["is_subscribed", "updated_at"])
        created = True
    subscribe_to_issues(
        project.id, [user_id], Issue.issue_objects.filter(project_id=project.id).values_list("id", flat=True)
    )
    return subscriber, created


def remove_subscriber(project_id: UUID | str, user_id: UUID | str) -> None:
    """The work items they follow stay followed. An admin keeps an opt-out row."""
    if str(user_id) in {str(admin_id) for admin_id in _active_admin_ids(project_id)}:
        ProjectSubscriber.objects.update_or_create(
            project_id=project_id, subscriber_id=user_id, defaults={"is_subscribed": False}
        )
        return
    forget_member(project_id, user_id)


def forget_member(project_id: UUID | str, user_id: UUID | str) -> None:
    ProjectSubscriber.objects.filter(project_id=project_id, subscriber_id=user_id).delete(soft=False)


def subscribed_admin_projects(user) -> list[dict]:
    """Projects where the user is an active admin and has not opted out, by workspace then name."""
    opted_out = ProjectSubscriber.objects.filter(subscriber=user, is_subscribed=False).values_list(
        "project_id", flat=True
    )
    memberships = (
        ProjectMember.objects.filter(
            member=user,
            is_active=True,
            role=ROLE.ADMIN.value,
            project__archived_at__isnull=True,
            project__deleted_at__isnull=True,
        )
        .exclude(project_id__in=opted_out)
        .select_related("project", "project__workspace")
        .order_by("project__workspace__name", "project__name")
    )
    return [
        {
            "project_id": str(membership.project_id),
            "project_name": membership.project.name,
            "workspace_slug": membership.project.workspace.slug,
            "workspace_name": membership.project.workspace.name,
        }
        for membership in memberships
    ]


def revoke_unreadable_follows(user_id: UUID | str, project_ids: Iterable[UUID | str]) -> None:
    """Unsubscribe a guest from the work items they can no longer open.

    Upstream notifies subscribers whatever their role, but a guest only opens their own work items
    unless ``guest_view_all_features`` is on: the notifications would leak to a member turned guest.
    """
    project_ids = list(
        Project.objects.filter(pk__in=list(project_ids), guest_view_all_features=False).values_list("id", flat=True)
    )
    if not project_ids:
        return
    IssueSubscriber.objects.filter(project_id__in=project_ids, subscriber_id=user_id).exclude(
        issue__created_by_id=user_id
    ).delete()


def _activity(issue: Issue) -> dict:
    return {
        "id": "",
        "verb": "created",
        "field": NEW_WORK_ITEM_FIELD,
        "actor": str(issue.created_by_id),
        "new_value": issue.name,
        "old_value": "",
        "issue_comment": "",
        "old_identifier": None,
        "new_identifier": None,
        "activity_time": issue.created_at.isoformat(),
    }


def notify_new_issue(issue_id: UUID | str) -> None:
    """Inbox notification and email; upstream never notifies a creation.

    Skips the author and the assignees (upstream tells them of the assignment). The email follows the
    "Property changes" preference. ``Issue.objects``, not ``issue_objects``, to include intake items.
    """
    issue = (
        Issue.objects.filter(pk=issue_id, is_draft=False, archived_at__isnull=True)
        .select_related("project", "project__workspace", "state", "created_by")
        .first()
    )
    if issue is None or issue.created_by_id is None:
        return
    if issue.created_by.is_bot:  # the sample work items seeded in a new workspace
        return
    assignees = set(IssueAssignee.objects.filter(issue_id=issue.id).values_list("assignee_id", flat=True))
    receivers = [
        subscriber_id
        for subscriber_id in eligible_subscriber_ids(issue.project_id)
        if subscriber_id != issue.created_by_id and subscriber_id not in assignees
    ]
    if not receivers:
        return

    project = issue.project
    Notification.objects.bulk_create(
        [
            Notification(
                workspace=project.workspace,
                project=project,
                sender="in_app:issue_activities:subscribed",
                triggered_by_id=issue.created_by_id,
                receiver_id=receiver_id,
                entity_identifier=issue.id,
                entity_name="issue",
                title="created the work item",
                data={
                    "issue": {
                        "id": str(issue.id),
                        "name": issue.name,
                        "identifier": project.identifier,
                        "sequence_id": issue.sequence_id,
                        "state_name": issue.state.name if issue.state else "",
                        "state_group": issue.state.group if issue.state else "",
                    },
                    "issue_activity": _activity(issue),
                },
            )
            for receiver_id in receivers
        ]
    )
    emailed = UserNotificationPreference.objects.filter(user_id__in=receivers, property_change=True).values_list(
        "user_id", flat=True
    )
    send_new_issue_emails(issue, list(emailed))


NEW_WORK_ITEM_TEMPLATE = "emails/extended/new-work-item.html"


def send_new_issue_emails(issue: Issue, receiver_ids: list[UUID]) -> None:
    """Fork template: upstream's work item email only says "Updates were made to the issue"."""
    if not receiver_ids:
        return
    host, user, password, port, use_tls, use_ssl, sender = get_email_configuration()
    if not host:
        return

    project = issue.project
    slug = project.workspace.slug
    app_url = (settings.APP_BASE_URL or settings.WEB_URL or "").rstrip("/")
    identifier = f"{project.identifier}-{issue.sequence_id}"
    author = issue.created_by
    author_name = author.display_name or author.first_name or author.email
    assignee_names = list(
        User.objects.filter(issue_assignee__issue_id=issue.id, issue_assignee__deleted_at__isnull=True).values_list(
            "display_name", flat=True
        )
    )
    context = {
        "author_name": author_name,
        "work_item_identifier": identifier,
        "work_item_name": issue.name,
        "project_name": project.name,
        "workspace_name": project.workspace.name,
        "state_name": issue.state.name if issue.state else "",
        "priority": issue.priority if issue.priority and issue.priority != "none" else "",
        "assignees": ", ".join(assignee_names),
        "work_item_url": f"{app_url}/{slug}/browse/{identifier}/",
        "preferences_url": f"{app_url}/{slug}/settings/account/notifications/",
    }
    subject = " ".join(f"{author_name} created {identifier} {issue.name}".split())  # no line breaks in headers

    connection = get_connection(
        host=host,
        port=int(port),
        username=user,
        password=password,
        use_tls=use_tls == "1",
        use_ssl=use_ssl == "1",
    )
    for receiver in User.objects.filter(id__in=receiver_ids).only("email"):
        html = render_to_string(NEW_WORK_ITEM_TEMPLATE, {**context, "email": receiver.email})
        message = EmailMultiAlternatives(
            subject=subject,
            body=generate_plain_text_from_html(html),
            from_email=sender,
            to=[receiver.email],
            connection=connection,
        )
        message.attach_alternative(html, "text/html")
        try:
            message.send()
        except Exception as exception:  # noqa: BLE001  one failed address must not stop the others
            log_exception(exception)
