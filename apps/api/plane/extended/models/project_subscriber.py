# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Project subscribers (LONESTONEP-8), as Plane's Enterprise Grid "Project subscribers"."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from plane.db.models import BaseModel


class ProjectSubscriber(BaseModel):
    """A project member that the project subscribes to each of its work items.

    ``BaseModel`` soft-deletes, but removing a subscriber deletes the row for good
    (``plane.extended.services.project_subscribers.remove_subscriber``). The unique constraint only
    covers live rows, as upstream does for work item subscribers, so a row soft-deleted with its
    project never blocks a new one.
    """

    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="extended_subscribers",
    )
    subscriber = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="extended_project_subscriptions",
    )

    class Meta:
        db_table = "extended_project_subscribers"
        verbose_name = "Project Subscriber"
        verbose_name_plural = "Project Subscribers"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["project", "subscriber"],
                condition=models.Q(deleted_at__isnull=True),
                name="extended_project_subscriber_unique_when_deleted_at_null",
            )
        ]

    def __str__(self) -> str:
        return f"{self.project_id}: {self.subscriber_id}"
