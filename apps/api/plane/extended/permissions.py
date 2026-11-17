# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Access checks shared by the fork's project settings endpoints."""

from __future__ import annotations

from plane.app.permissions import ROLE
from plane.db.models import ProjectMember, WorkspaceMember


def can_manage_project(*, user, slug: str, project_id) -> bool:
    """Workspace admin or project admin may change the project's fork settings."""
    if WorkspaceMember.objects.filter(
        member=user,
        workspace__slug=slug,
        role=ROLE.ADMIN.value,
        is_active=True,
    ).exists():
        return True

    return ProjectMember.objects.filter(
        member=user,
        workspace__slug=slug,
        project_id=project_id,
        role=ROLE.ADMIN.value,
        is_active=True,
    ).exists()
