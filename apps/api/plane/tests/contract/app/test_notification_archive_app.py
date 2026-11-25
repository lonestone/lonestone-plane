# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests of the inbox "Archive all" endpoint (LONESTONEP-14)."""

from uuid import uuid4

import pytest
from django.utils import timezone
from rest_framework import status

from plane.db.models import Notification
from plane.tests.factories import UserFactory
from plane.tests.fork_builders import client_for, make_issue, make_notification, make_project, make_user


def url(slug):
    return f"/api/extended/workspaces/{slug}/notifications/archive-all/"


@pytest.fixture
def project(db, workspace, create_user):
    return make_project(workspace, create_user, "ARC")


@pytest.mark.contract
@pytest.mark.django_db
class TestNotificationArchiveAll:
    def test_archives_and_returns_the_count(self, session_client, workspace, project, create_user):
        issue = make_issue(project, "Work item")
        make_notification(create_user, issue)
        make_notification(create_user, issue)

        response = session_client.post(url(workspace.slug), {}, format="json")

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {"archived_count": 2}
        assert not Notification.objects.filter(receiver=create_user, archived_at__isnull=True).exists()

    def test_takes_the_view_of_the_inbox(self, session_client, workspace, project, create_user):
        issue = make_issue(project, "Work item")
        activity = make_notification(create_user, issue)
        mention = make_notification(create_user, issue, sender="in_app:issue_activities:mentioned")
        read_mention = make_notification(
            create_user, issue, sender="in_app:issue_activities:mentioned", read_at=timezone.now()
        )

        response = session_client.post(
            url(workspace.slug), {"mentioned": True, "unread_only": True, "types": []}, format="json"
        )

        assert response.data == {"archived_count": 1}
        assert Notification.objects.get(pk=mention.pk).archived_at is not None
        assert Notification.objects.get(pk=read_mention.pk).archived_at is None
        assert Notification.objects.get(pk=activity.pk).archived_at is None

    def test_rejects_an_unknown_type(self, session_client, workspace, project):
        response = session_client.post(url(workspace.slug), {"types": ["everything"]}, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_a_guest_archives_their_own_inbox(self, workspace, project, create_user):
        guest = make_user(workspace, project, 5)
        issue = make_issue(project, "Work item")
        theirs = make_notification(guest, issue)
        owners = make_notification(create_user, issue)

        response = client_for(guest).post(url(workspace.slug), {}, format="json")

        assert response.data == {"archived_count": 1}
        assert Notification.objects.get(pk=theirs.pk).archived_at is not None
        assert Notification.objects.get(pk=owners.pk).archived_at is None

    def test_someone_outside_the_workspace_cannot_tell_it_from_an_unknown_one(self, workspace, project, create_user):
        notification = make_notification(create_user, make_issue(project, "Work item"))
        client = client_for(UserFactory(username=uuid4().hex))

        existing = client.post(url(workspace.slug), {}, format="json")
        unknown = client.post(url("no-such-workspace"), {}, format="json")

        assert existing.status_code == unknown.status_code == status.HTTP_403_FORBIDDEN
        assert existing.json() == unknown.json()
        assert Notification.objects.get(pk=notification.pk).archived_at is None

    def test_signed_out_users_are_refused(self, api_client, workspace):
        assert api_client.post(url(workspace.slug), {}, format="json").status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )
