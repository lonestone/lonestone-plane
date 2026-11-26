# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the fork's announcements: which ones the signed-in user has seen."""

import importlib

import pytest
from django.apps import apps
from rest_framework import status

from plane.extended.models import UserAnnouncement
from plane.tests.fork_builders import client_for, make_project, make_user

URL = "/api/extended/users/me/announcements/"
KEY = "release-notes.lonestone.13"


def seen_url(key):
    return f"{URL}{key}/seen/"


@pytest.fixture
def project(db, workspace, create_user):
    return make_project(workspace, create_user, "SITE")


@pytest.mark.contract
@pytest.mark.django_db
class TestAnnouncements:
    def test_nothing_seen(self, session_client, project):
        response = session_client.get(URL)

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"seen": []}

    def test_seen_announcements_in_the_order_they_were_seen(self, session_client, project):
        session_client.post(seen_url(KEY))
        session_client.post(seen_url("release-notes.lonestone.14"))

        assert session_client.get(URL).data == {"seen": [KEY, "release-notes.lonestone.14"]}

    def test_marking_an_announcement_seen_twice_keeps_one_row(self, session_client, project, create_user):
        first = session_client.post(seen_url(KEY))
        second = session_client.post(seen_url(KEY))

        assert first.status_code == second.status_code == status.HTTP_204_NO_CONTENT
        assert UserAnnouncement.objects.filter(user=create_user, key=KEY).count() == 1

    @pytest.mark.parametrize("key", ["Release", "-release", "a" * 65, "notes%20lonestone", "abc%0A", "a" * 64 + "%0A"])
    def test_rejects_a_malformed_key(self, session_client, project, key):
        assert session_client.post(seen_url(key)).status_code == status.HTTP_400_BAD_REQUEST
        assert not UserAnnouncement.objects.exists()

    def test_a_member_sees_and_marks_only_their_own(self, workspace, project, create_user):
        member = make_user(workspace, project, 15)
        UserAnnouncement.objects.create(user=create_user, key=KEY)

        response = client_for(member).get(URL)
        client_for(member).post(seen_url("release-notes.lonestone.14"))

        assert response.data == {"seen": []}
        assert list(UserAnnouncement.objects.filter(user=create_user).values_list("key", flat=True)) == [KEY]

    def test_signed_out_users_are_refused(self, api_client):
        assert api_client.get(URL).status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        assert api_client.post(seen_url(KEY)).status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

    def test_migration_0007_drops_only_the_project_subscribers_announcement(self, workspace, project, create_user):
        member = make_user(workspace, project, 15)
        for user in (create_user, member):
            UserAnnouncement.objects.create(user=user, key="project_subscribers")
        UserAnnouncement.objects.create(user=member, key=KEY)
        migration = importlib.import_module("plane.extended.migrations.0007_announcements_seen_only")

        migration.drop_project_subscribers_announcement(apps, None)

        assert list(UserAnnouncement.objects.values_list("user_id", "key")) == [(member.id, KEY)]
