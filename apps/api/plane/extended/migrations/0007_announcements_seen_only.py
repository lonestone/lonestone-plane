# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Announcements become content of the web app: a row now only records that a user has seen one."""

from django.db import migrations


def drop_project_subscribers_announcement(apps, schema_editor):
    UserAnnouncement = apps.get_model("extended", "UserAnnouncement")
    UserAnnouncement.objects.filter(key="project_subscribers").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("extended", "0006_announce_project_subscribers"),
    ]

    operations = [
        migrations.RunPython(drop_project_subscribers_announcement, migrations.RunPython.noop),
        migrations.RemoveField(model_name="userannouncement", name="seen_at"),
    ]
