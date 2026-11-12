# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""One-time announcements of the fork (docs/architecture/fork-maintenance.md, "Announcements")."""

from __future__ import annotations

from collections.abc import Callable

from django.utils import timezone

from plane.extended.models import UserAnnouncement
from plane.extended.services.project_subscribers import subscribed_admin_projects

PROJECT_SUBSCRIBERS = "project_subscribers"


def _project_subscribers(user) -> dict | None:
    projects = subscribed_admin_projects(user)
    return {"projects": projects} if projects else None


# key -> data of the announcement for the user, or None when it has nothing left to say (not shown).
ANNOUNCEMENTS: dict[str, Callable[..., dict | None]] = {
    PROJECT_SUBSCRIBERS: _project_subscribers,
}


def pending_announcements(user) -> list[dict]:
    keys = (
        UserAnnouncement.objects.filter(user=user, seen_at__isnull=True, key__in=ANNOUNCEMENTS)
        .order_by("created_at")
        .values_list("key", flat=True)
    )
    pending = []
    for key in keys:
        data = ANNOUNCEMENTS[key](user)
        if data is not None:
            pending.append({"key": key, "data": data})
    return pending


def mark_announcement_seen(user, key: str) -> None:
    UserAnnouncement.objects.filter(user=user, key=key, seen_at__isnull=True).update(seen_at=timezone.now())
