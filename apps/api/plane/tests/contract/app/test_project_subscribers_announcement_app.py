# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the one-time project subscribers announcement (LONESTONEP-8)."""

import importlib

import pytest
from django.apps import apps
from rest_framework import status

from plane.extended.models import ProjectSubscriber, UserAnnouncement
from plane.tests.fork_builders import client_for, make_project, make_user

URL = "/api/extended/users/me/announcements/project-subscribers/"
KEY = "project_subscribers"


@pytest.fixture
def project(db, workspace, create_user):
    return make_project(workspace, create_user, "SITE")


@pytest.mark.contract
@pytest.mark.django_db
class TestProjectSubscribersAnnouncement:
    def test_a_waiting_admin_sees_their_projects(self, session_client, workspace, project, create_user):
        make_project(workspace, create_user, "APP")
        UserAnnouncement.objects.create(user=create_user, key=KEY)

        response = session_client.get(URL)

        assert response.status_code == status.HTTP_200_OK
        assert response.data["show"] is True
        # sorted by workspace, then project name
        assert [row["project_name"] for row in response.data["projects"]] == ["APP", "SITE"]
        assert response.data["projects"][0]["workspace_slug"] == workspace.slug

    def test_projects_the_admin_left_the_subscribers_of_are_not_listed(
        self, session_client, workspace, project, create_user
    ):
        other = make_project(workspace, create_user, "APP")
        ProjectSubscriber.objects.create(project=other, subscriber=create_user, is_subscribed=False)
        UserAnnouncement.objects.create(user=create_user, key=KEY)

        projects = session_client.get(URL).data["projects"]

        assert [row["project_id"] for row in projects] == [str(project.id)]

    def test_nothing_to_show_without_a_waiting_announcement(self, session_client, project):
        assert session_client.get(URL).data == {"show": False, "projects": []}

    def test_nothing_to_show_once_no_project_is_followed(self, session_client, project, create_user):
        ProjectSubscriber.objects.create(project=project, subscriber=create_user, is_subscribed=False)
        UserAnnouncement.objects.create(user=create_user, key=KEY)
        assert session_client.get(URL).data["show"] is False

    def test_seen_once_then_never_again(self, session_client, project, create_user):
        UserAnnouncement.objects.create(user=create_user, key=KEY)

        seen = session_client.post(URL)

        assert seen.status_code == status.HTTP_204_NO_CONTENT
        assert session_client.get(URL).data["show"] is False

    def test_a_member_sees_only_their_own(self, workspace, project, create_user):
        member = make_user(workspace, project, 15)
        UserAnnouncement.objects.create(user=create_user, key=KEY)

        response = client_for(member).get(URL)
        client_for(member).post(URL)

        assert response.data == {"show": False, "projects": []}
        assert UserAnnouncement.objects.get(user=create_user).seen_at is None

    def test_signed_out_users_are_refused(self, api_client):
        assert api_client.get(URL).status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


@pytest.mark.contract
@pytest.mark.django_db
class TestAnnouncementMigration:
    def test_current_project_admins_get_it_once(self, workspace, project, create_user):
        member = make_user(workspace, project, 15)
        former_admin = make_user(workspace, project, 20, is_active=False)
        migration = importlib.import_module("plane.extended.migrations.0006_announce_project_subscribers")

        migration.queue_announcement(apps, None)
        migration.queue_announcement(apps, None)

        assert list(UserAnnouncement.objects.values_list("user_id", flat=True)) == [create_user.id]
        assert not UserAnnouncement.objects.filter(user__in=[member, former_admin]).exists()
