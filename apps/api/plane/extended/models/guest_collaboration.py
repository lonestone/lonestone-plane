# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Per-project guest collaboration settings (Lonestone extended)."""

from __future__ import annotations

from django.db import models

from plane.db.models import BaseModel


class ProjectGuestCollaboration(BaseModel):
    """Elevates project guests to collaborate on work items / cycles / modules.

    Kept in ``extended_*`` so upstream ``plane.db`` Project stays untouched.
    """

    project = models.OneToOneField(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="guest_collaboration",
    )
    guest_can_collaborate = models.BooleanField(default=False)

    class Meta:
        db_table = "extended_project_guest_collaborations"
        verbose_name = "Project Guest Collaboration"
        verbose_name_plural = "Project Guest Collaborations"

    def __str__(self) -> str:
        return f"{self.project_id}: guest_can_collaborate={self.guest_can_collaborate}"
