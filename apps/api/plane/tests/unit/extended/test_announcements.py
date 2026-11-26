# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The fork's announcements a user has seen: key rule, recording, order."""

import pytest

from plane.extended.models import UserAnnouncement
from plane.extended.services.announcements import is_valid_key, mark_announcement_seen, seen_announcements


@pytest.mark.unit
@pytest.mark.parametrize("key", ["release-notes.lonestone.13", "a", "0", "a" * 64, "a_b-c.d"])
def test_valid_keys(key):
    assert is_valid_key(key)


@pytest.mark.unit
@pytest.mark.parametrize("key", ["", "Release", "-release", ".release", "a" * 65, "abc\n", "a b", "a/b", "é"])
def test_invalid_keys(key):
    assert not is_valid_key(key)


@pytest.mark.unit
@pytest.mark.django_db
def test_marking_seen_twice_keeps_one_row(create_user):
    mark_announcement_seen(create_user, "release-notes.lonestone.13")
    mark_announcement_seen(create_user, "release-notes.lonestone.13")

    assert UserAnnouncement.objects.filter(user=create_user).count() == 1


@pytest.mark.unit
@pytest.mark.django_db
def test_seen_in_the_order_they_were_seen(create_user):
    for key in ("release-notes.lonestone.14", "release-notes.lonestone.13"):
        mark_announcement_seen(create_user, key)

    assert seen_announcements(create_user) == ["release-notes.lonestone.14", "release-notes.lonestone.13"]
