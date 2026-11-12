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

from django.db.models import Exists, OuterRef

from plane.app.permissions.base import ROLE
from plane.db.models import (
    EmailNotificationLog,
    Issue,
    IssueAssignee,
    IssueSubscriber,
    Notification,
    Project,
    ProjectMember,
    UserNotificationPreference,
)
from plane.extended.models import ProjectSubscriber

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


def _activity(issue: Issue) -> dict:
    """The ``issue_activity`` part of upstream's notification data, for "created the work item".

    ``new_value`` holds the work item name: upstream's email payload (``create_payload``) only keeps an
    activity whose old or new value is set.
    """
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
    """Send the project subscribers the in-app notification and the email of a new work item.

    Upstream never notifies a work item's creation: ``create_issue_activity`` keeps the "created"
    activity out of the activities it hands to the ``notifications`` task. The author is left out (no
    notification for one's own action), and so are the assignees, whom upstream already notifies of
    the assignment. The email follows the "Property changes" preference, as upstream's emails of
    property changes do, and goes through upstream's email log and template.
    """
    issue = Issue.issue_objects.filter(pk=issue_id).select_related("project", "project__workspace", "state").first()
    if issue is None or issue.created_by_id is None:
        return  # nobody to show as the author (upstream logs need one)
    assignees = set(IssueAssignee.objects.filter(issue_id=issue.id).values_list("assignee_id", flat=True))
    receivers = [
        subscriber_id
        for subscriber_id in eligible_subscriber_ids(issue.project_id)
        if subscriber_id != issue.created_by_id and subscriber_id not in assignees
    ]
    if not receivers:
        return

    project = issue.project
    details = {
        "id": str(issue.id),
        "name": issue.name,
        "identifier": project.identifier,
        "sequence_id": issue.sequence_id,
        "state_name": issue.state.name if issue.state else "",
        "state_group": issue.state.group if issue.state else "",
    }
    activity = _activity(issue)
    emailed = set(
        UserNotificationPreference.objects.filter(user_id__in=receivers, property_change=True).values_list(
            "user_id", flat=True
        )
    )
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
                data={"issue": details, "issue_activity": activity},
            )
            for receiver_id in receivers
        ]
    )
    EmailNotificationLog.objects.bulk_create(
        [
            EmailNotificationLog(
                triggered_by_id=issue.created_by_id,
                receiver_id=receiver_id,
                entity_identifier=issue.id,
                entity_name="issue",
                data={
                    "issue": {
                        **details,
                        "project_id": str(project.id),
                        "workspace_slug": project.workspace.slug,
                    },
                    "issue_activity": activity,
                },
            )
            for receiver_id in receivers
            if receiver_id in emailed
        ]
    )
