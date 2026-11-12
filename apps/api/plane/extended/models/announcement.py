# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""One-time announcements of the fork to a user."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from plane.db.models import BaseModel


class UserAnnouncement(BaseModel):
    """Waiting while ``seen_at`` is empty; a user without a row never sees it."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="extended_announcements",
    )
    key = models.CharField(max_length=64)
    seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "extended_user_announcements"
        verbose_name = "User Announcement"
        verbose_name_plural = "User Announcements"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "key"],
                condition=models.Q(deleted_at__isnull=True),
                name="extended_user_announcement_unique_when_deleted_at_null",
            )
        ]

    def __str__(self) -> str:
        return f"{self.user_id}: {self.key}"
