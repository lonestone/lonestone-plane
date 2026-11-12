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
from plane.db.models import Issue, IssueSubscriber, Project, ProjectMember
from plane.extended.models import ProjectSubscriber

NOT_ELIGIBLE = "subscriber_not_eligible"


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
