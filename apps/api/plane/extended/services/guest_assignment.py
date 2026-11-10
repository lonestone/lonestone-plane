# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Who can be assigned to a work item (LONESTONEP-4).

Upstream only accepts active project members with at least the member role. The fork also
accepts active guests when the project allows guests to collaborate and has "Guest access"
on (``Project.guest_view_all_features``), so that a guest never gets a work item they cannot see.
"""

from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from plane.db.models import Project, ProjectMember

from .guest_collaboration import guest_can_collaborate

GUEST_ROLE = 5
MEMBER_ROLE = 15


def guests_are_assignable(project_id: UUID | str) -> bool:
    """True when the project lets its guests be assigned to work items."""
    if not guest_can_collaborate(project_id):
        return False
    return Project.objects.filter(pk=project_id, guest_view_all_features=True).exists()


def assignable_member_ids(
    project_id: UUID | str,
    member_ids: Iterable[UUID | str],
    current_ids: Iterable[UUID | str] = (),
) -> list[str]:
    """Keep the requested ids that may be assigned, in the requested order.

    ``current_ids`` are the work item's assignees before the change: they stay assignable, so that
    editing the other assignees never drops a guest assigned before collaboration was turned off.
    """
    requested = [str(member_id) for member_id in member_ids]
    if not requested:
        return []

    members = ProjectMember.objects.filter(project_id=project_id, is_active=True, member_id__in=requested)
    if guests_are_assignable(project_id):
        members = members.filter(role__gte=GUEST_ROLE)
    else:
        members = members.filter(role__gte=MEMBER_ROLE)
    eligible = {str(member_id) for member_id in members.values_list("member_id", flat=True)}
    eligible.update(str(member_id) for member_id in current_ids)

    kept: list[str] = []
    for member_id in requested:
        if member_id in eligible and member_id not in kept:
            kept.append(member_id)
    return kept
