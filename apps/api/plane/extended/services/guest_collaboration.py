# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Helpers for project guest collaboration flags."""

from __future__ import annotations

from uuid import UUID

from plane.extended.models import ProjectGuestCollaboration


def guest_can_collaborate(project_id: UUID | str | None) -> bool:
    """Return True when the project allows guests to collaborate."""
    if project_id is None:
        return False
    return ProjectGuestCollaboration.objects.filter(
        project_id=project_id,
        guest_can_collaborate=True,
        deleted_at__isnull=True,
    ).exists()


def get_or_create_guest_collaboration(project_id: UUID | str) -> ProjectGuestCollaboration:
    """Return the collaboration row for a project, creating it if missing."""
    obj, _ = ProjectGuestCollaboration.objects.get_or_create(project_id=project_id)
    return obj
