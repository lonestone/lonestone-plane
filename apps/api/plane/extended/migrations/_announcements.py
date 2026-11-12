# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Helper for the data migrations that queue an announcement (skipped by the migration loader: ``_`` prefix)."""


def queue_announcement_for(apps, key: str, user_ids) -> None:
    UserAnnouncement = apps.get_model("extended", "UserAnnouncement")
    UserAnnouncement.objects.bulk_create(
        [UserAnnouncement(user_id=user_id, key=key) for user_id in user_ids],
        ignore_conflicts=True,
        batch_size=1000,
    )
