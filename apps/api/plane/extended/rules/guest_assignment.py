# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Who can be assigned to a work item (LONESTONEP-4).

Kept out of ``plane.extended.services``: upstream serializers import this module, and importing the
services package loads bgtasks that import those serializers back (circular import).

Upstream only accepts active project members with at least the member role. The fork also
accepts active guests when the project allows guests to collaborate and has "Guest access"
on (``Project.guest_view_all_features``), so that a guest never gets a work item they cannot see.
"""

from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from plane.app.permissions.base import ROLE
from plane.db.models import DraftIssue, DraftIssueAssignee, IssueAssignee, Project, ProjectMember


def guests_are_assignable(project_id: UUID | str) -> bool:
    """True when the project lets its guests be assigned to work items."""
    # Imported here, as in plane.app.permissions.base: the services package must not load with this module.
    from plane.extended.services.guest_collaboration import guest_can_collaborate

    return (
        guest_can_collaborate(project_id)
        and Project.objects.filter(pk=project_id, guest_view_all_features=True).exists()
    )


def assignable_member_ids(
    project_id: UUID | str,
    member_ids: Iterable[UUID | str],
    current_ids: Iterable[UUID | str] = (),
) -> list[str]:
    """Keep the requested ids that may be assigned, in the requested order.

    ``current_ids`` are the work item's assignees before the change: those still active in the project
    stay assignable, so that editing the other assignees never drops a guest assigned before
    collaboration was turned off.
    """
    requested = [str(member_id) for member_id in member_ids]
    if not requested:
        return []

    min_role = ROLE.GUEST.value if guests_are_assignable(project_id) else ROLE.MEMBER.value
    members = ProjectMember.objects.filter(
        project_id=project_id, is_active=True, member_id__in=requested, role__gte=min_role
    )
    eligible = {str(member_id) for member_id in members.values_list("member_id", flat=True)}
    # Current assignees stay assignable only while they are active members of the project (any role):
    # someone who left the project is dropped, as upstream does.
    current = [str(member_id) for member_id in current_ids]
    if current:
        eligible.update(
            str(member_id)
            for member_id in ProjectMember.objects.filter(
                project_id=project_id, is_active=True, member_id__in=current
            ).values_list("member_id", flat=True)
        )

    kept: list[str] = []
    for member_id in requested:
        if member_id in eligible and member_id not in kept:
            kept.append(member_id)
    return kept


def assignable_assignee_ids(project_id: UUID | str, requested: Iterable, instance=None) -> list[str]:
    """``assignable_member_ids`` for the work item and draft serializers.

    ``requested`` holds ``User`` objects (the serializers' ``assignee_ids`` field) or ids; ``instance`` is
    the work item or draft being updated (``None`` on create), whose current assignees stay assignable.
    """
    if isinstance(instance, DraftIssue):
        current = DraftIssueAssignee.objects.filter(draft_issue=instance).values_list("assignee_id", flat=True)
    elif instance is not None:
        current = IssueAssignee.objects.filter(issue=instance).values_list("assignee_id", flat=True)
    else:
        current = ()
    ids = [getattr(item, "id", item) for item in requested]
    return assignable_member_ids(project_id, ids, current_ids=current)
