# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the fork's one-time announcements, and the project subscribers one (LONESTONEP-8)."""

import importlib

import pytest
from django.apps import apps
from rest_framework import status

from plane.extended.models import ProjectSubscriber, UserAnnouncement
from plane.extended.services import announcements
from plane.tests.fork_builders import client_for, make_project, make_user

URL = "/api/extended/users/me/announcements/"
KEY = "project_subscribers"


def seen_url(key):
    return f"{URL}{key}/seen/"


@pytest.fixture
def project(db, workspace, create_user):
    return make_project(workspace, create_user, "SITE")


@pytest.mark.contract
@pytest.mark.django_db
class TestAnnouncements:
    def test_nothing_pending(self, session_client, project):
        response = session_client.get(URL)

        assert response.status_code == status.HTTP_200_OK
        assert response.data == []

    def test_pending_announcements_in_queue_order(self, session_client, project, create_user, monkeypatch):
        monkeypatch.setitem(announcements.ANNOUNCEMENTS, "later", lambda user: {"n": 2})
        UserAnnouncement.objects.create(user=create_user, key=KEY)
        UserAnnouncement.objects.create(user=create_user, key="later")

        assert [row["key"] for row in session_client.get(URL).data] == [KEY, "later"]

    def test_an_announcement_with_nothing_to_say_is_not_shown(self, session_client, project, create_user, monkeypatch):
        monkeypatch.setitem(announcements.ANNOUNCEMENTS, "empty", lambda user: None)
        UserAnnouncement.objects.create(user=create_user, key="empty")

        assert session_client.get(URL).data == []

    def test_unknown_keys_are_ignored(self, session_client, project, create_user):
        UserAnnouncement.objects.create(user=create_user, key="removed_since")

        assert session_client.get(URL).data == []
        assert session_client.post(seen_url("removed_since")).status_code == status.HTTP_404_NOT_FOUND

    def test_seen_once_then_never_again(self, session_client, project, create_user):
        UserAnnouncement.objects.create(user=create_user, key=KEY)

        seen = session_client.post(seen_url(KEY))

        assert seen.status_code == status.HTTP_204_NO_CONTENT
        assert session_client.get(URL).data == []

    def test_a_member_sees_and_marks_only_their_own(self, workspace, project, create_user):
        member = make_user(workspace, project, 15)
        UserAnnouncement.objects.create(user=create_user, key=KEY)

        response = client_for(member).get(URL)
        client_for(member).post(seen_url(KEY))

        assert response.data == []
        assert UserAnnouncement.objects.get(user=create_user).seen_at is None

    def test_signed_out_users_are_refused(self, api_client):
        assert api_client.get(URL).status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
        assert api_client.post(seen_url(KEY)).status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )


@pytest.mark.contract
@pytest.mark.django_db
class TestProjectSubscribersAnnouncement:
    def test_lists_the_admin_projects(self, session_client, workspace, project, create_user):
        make_project(workspace, create_user, "APP")
        UserAnnouncement.objects.create(user=create_user, key=KEY)

        [announcement] = session_client.get(URL).data

        assert announcement["key"] == KEY
        projects = announcement["data"]["projects"]
        # sorted by workspace, then project name
        assert [row["project_name"] for row in projects] == ["APP", "SITE"]
        assert projects[0]["workspace_slug"] == workspace.slug

    def test_projects_the_admin_opted_out_of_are_not_listed(self, session_client, workspace, project, create_user):
        other = make_project(workspace, create_user, "APP")
        ProjectSubscriber.objects.create(project=other, subscriber=create_user, is_subscribed=False)
        UserAnnouncement.objects.create(user=create_user, key=KEY)

        [announcement] = session_client.get(URL).data

        assert [row["project_id"] for row in announcement["data"]["projects"]] == [str(project.id)]

    def test_not_shown_once_no_project_is_followed(self, session_client, project, create_user):
        ProjectSubscriber.objects.create(project=project, subscriber=create_user, is_subscribed=False)
        UserAnnouncement.objects.create(user=create_user, key=KEY)

        assert session_client.get(URL).data == []

    def test_migration_queues_the_current_project_admins_once(self, workspace, project, create_user):
        member = make_user(workspace, project, 15)
        former_admin = make_user(workspace, project, 20, is_active=False)
        migration = importlib.import_module("plane.extended.migrations.0006_announce_project_subscribers")

        migration.queue_announcement(apps, None)
        migration.queue_announcement(apps, None)

        assert list(UserAnnouncement.objects.values_list("user_id", flat=True)) == [create_user.id]
        assert not UserAnnouncement.objects.filter(user__in=[member, former_admin]).exists()
