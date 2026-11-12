# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""LONESTONEP-8: tell the current project admins, once, that they now follow their projects' new work items.

Users who become project admins later get no announcement: it announces a change, not a feature tour.
"""

from django.db import migrations

ANNOUNCEMENT = "project_subscribers"
ADMIN = 20


def queue_announcement(apps, schema_editor):
    ProjectMember = apps.get_model("db", "ProjectMember")
    UserAnnouncement = apps.get_model("extended", "UserAnnouncement")
    admin_ids = (
        ProjectMember.objects.filter(
            is_active=True,
            role=ADMIN,
            deleted_at__isnull=True,
            project__deleted_at__isnull=True,
            project__archived_at__isnull=True,
            member__is_bot=False,
        )
        .values_list("member_id", flat=True)
        .distinct()
    )
    UserAnnouncement.objects.bulk_create(
        [UserAnnouncement(user_id=user_id, key=ANNOUNCEMENT) for user_id in admin_ids],
        ignore_conflicts=True,
        batch_size=1000,
    )


class Migration(migrations.Migration):
    dependencies = [
        ("extended", "0005_user_announcements"),
    ]

    operations = [
        migrations.RunPython(queue_announcement, migrations.RunPython.noop),
    ]
