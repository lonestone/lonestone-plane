# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The fork's announcements a user has seen (docs/architecture/fork-maintenance.md, "Announcements")."""

import re

from plane.extended.models import UserAnnouncement

KEY_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")


def seen_announcements(user) -> list[str]:
    return list(UserAnnouncement.objects.filter(user=user).order_by("created_at").values_list("key", flat=True))


def mark_announcement_seen(user, key: str) -> None:
    UserAnnouncement.objects.get_or_create(user=user, key=key)
