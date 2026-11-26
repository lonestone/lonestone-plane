# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""LONESTONEP-8 queued a one-time announcement to the project admins here.

That announcement is gone (0007): the migration stays, empty, for the migration history.
"""

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("extended", "0005_user_announcements"),
    ]

    operations = []
