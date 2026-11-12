# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Project subscribers (LONESTONEP-8), as Plane's Enterprise Grid "Project subscribers".

A project subscriber is subscribed to each work item of the project: upstream then sends them the
in-app notification and, per their email preferences, the email of every tracked change, as to any
work item subscriber. The fork only creates ``IssueSubscriber`` rows; it never deletes any.
"""

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

NOT_ELIGIBLE = "subscriber_not_eligible"

# ``data.issue_activity.field`` of the "created the work item" notification. The web app renders it
# through the fork's entry in ADDITIONAL_NOTIFICATION_CONTENT_MAP (oe/components/workspace-notifications).
NEW_WORK_ITEM_FIELD = "project_subscription"


class SubscriberNotEligible(ValueError):
    """The user is not an active member of the project with the Member or Admin role."""


def _eligible_members(project_id: UUID | str):
    return ProjectMember.objects.filter(project_id=project_id, is_active=True, role__gte=ROLE.MEMBER.value)


def is_eligible_member(project_id: UUID | str, user_id: UUID | str) -> bool:
    """Only active project members with the Member or Admin role can be project subscribers."""
    return _eligible_members(project_id).filter(member_id=user_id).exists()


def eligible_subscriber_ids(project_id: UUID | str) -> list[UUID]:
    """Project subscribers that are still active members with the Member or Admin role."""
    eligible = _eligible_members(project_id).filter(member_id=OuterRef("subscriber_id"))
    return list(
        ProjectSubscriber.objects.filter(project_id=project_id)
        .filter(Exists(eligible))
        .values_list("subscriber_id", flat=True)
    )


def subscribe_to_issues(
    project_id: UUID | str,
    subscriber_ids: Iterable[UUID | str],
    issue_ids: Iterable[UUID | str],
) -> None:
    """Subscribe each subscriber to each work item, skipping the subscriptions that already exist.

    ``bulk_create`` never calls ``save()``: no activity and no notification come with these
    subscriptions. Upstream's unique constraint on live work item subscribers makes
    ``ignore_conflicts`` skip a subscription that exists, even one created at the same time.
    """
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
    """Subscribe the project subscribers to a work item that was just created."""
    subscribe_to_issues(issue.project_id, eligible_subscriber_ids(issue.project_id), [issue.id])


def add_subscriber(project: Project, user_id: UUID | str) -> tuple[ProjectSubscriber, bool]:
    """Make an eligible project member a project subscriber; returns the row and whether it is new.

    Raises ``SubscriberNotEligible`` for anyone but an active member with the Member or Admin role. Adding
    someone who is already a subscriber subscribes them again to the current work items.
    """
    if not is_eligible_member(project.id, user_id):
        raise SubscriberNotEligible(NOT_ELIGIBLE)
    subscriber, created = ProjectSubscriber.objects.get_or_create(project=project, subscriber_id=user_id)
    # As in Plane, a new project subscriber also follows the project's current work items.
    # ``issue_objects`` leaves out archived and deleted work items, drafts and intake items in triage.
    subscribe_to_issues(
        project.id, [user_id], Issue.issue_objects.filter(project_id=project.id).values_list("id", flat=True)
    )
    return subscriber, created


def remove_subscriber(project_id: UUID | str, user_id: UUID | str) -> None:
    """Stop subscribing the member to new work items; the work items they follow stay followed.

    The row is deleted for good (``soft=False``): a project subscription has nothing to restore.
    """
    ProjectSubscriber.objects.filter(project_id=project_id, subscriber_id=user_id).delete(soft=False)


def _activity(issue: Issue) -> dict:
    """The ``issue_activity`` part of upstream's notification data, for "created the work item"."""
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
    """Tell the project subscribers of a new work item: in-app notification and email.

    Upstream never notifies a work item's creation: ``create_issue_activity`` keeps the "created"
    activity out of the activities it hands to the ``notifications`` task. The author is left out (no
    notification for one's own action), and so are the assignees, whom upstream already notifies of
    the assignment. The email follows the "Property changes" preference, as upstream's emails of
    property changes do.
    """
    issue = (
        Issue.issue_objects.filter(pk=issue_id)
        .select_related("project", "project__workspace", "state", "created_by")
        .first()
    )
    if issue is None or issue.created_by_id is None:
        return  # nobody to show as the author
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
    """Email the new work item with the fork's template, through the instance's SMTP settings.

    Upstream's batched work item emails (``EmailNotificationLog``, ``issue-updates.html``) only know
    updates: their text would read "Updates were made to the issue". The connection and the message
    are built as in upstream's email tasks (``bgtasks/project_add_user_email_task.py``).
    """
    if not receiver_ids:
        return
    host, user, password, port, use_tls, use_ssl, sender = get_email_configuration()
    if not host:
        return  # email is not configured on this instance

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
        message.send()
