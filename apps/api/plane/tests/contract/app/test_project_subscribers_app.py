# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for project subscribers (LONESTONEP-8)."""

from uuid import uuid4

from django.core import mail
from django.utils import timezone

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.notification_task import notifications
from plane.db.models import (
    EmailNotificationLog,
    Issue,
    IssueSubscriber,
    Notification,
    ProjectMember,
    State,
    UserNotificationPreference,
    WorkspaceMember,
)
from plane.extended.models import ProjectSubscriber
from plane.extended.tasks import notify_project_subscribers_of_new_issue
from plane.tests.factories import ProjectFactory, ProjectMemberFactory, UserFactory, WorkspaceMemberFactory

ISSUES_URL = "/api/workspaces/{slug}/projects/{project_id}/issues/"


def _make_project(workspace, owner, identifier):
    project = ProjectFactory(name=identifier, identifier=identifier, workspace=workspace, created_by=owner)
    ProjectMemberFactory(project=project, member=owner, workspace=workspace, role=20)
    State.objects.create(
        name="Backlog",
        color="#000000",
        project=project,
        workspace=workspace,
        sequence=1,
        group="backlog",
        default=True,
        created_by=owner,
    )
    return project


def _make_user(workspace, project, role, is_active=True):
    user = UserFactory(username=uuid4().hex)  # the factory leaves the unique username empty
    WorkspaceMemberFactory(workspace=workspace, member=user, role=role)
    ProjectMemberFactory(project=project, member=user, workspace=workspace, role=role, is_active=is_active)
    return user


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _create_issue(client, workspace, project, name="New ticket"):
    response = client.post(ISSUES_URL.format(slug=workspace.slug, project_id=project.id), {"name": name}, format="json")
    assert response.status_code == status.HTTP_201_CREATED, response.data
    return response.data["id"]


def _subscriber_ids(issue_id):
    return set(IssueSubscriber.objects.filter(issue_id=issue_id).values_list("subscriber_id", flat=True))


@pytest.fixture
def project(db, workspace, create_user):
    return _make_project(workspace, create_user, "SUBS")


@pytest.fixture
def manager(db, workspace, project):
    return _make_user(workspace, project, 15)


@pytest.fixture
def author(db, workspace, project):
    return _make_user(workspace, project, 15)


@pytest.mark.contract
@pytest.mark.django_db
class TestNewWorkItemSubscribesProjectSubscribers:
    def test_project_subscriber_follows_a_new_work_item(self, workspace, project, manager, author):
        ProjectSubscriber.objects.create(project=project, subscriber=manager)
        issue_id = _create_issue(_client(author), workspace, project)
        assert manager.id in _subscriber_ids(issue_id)

    @pytest.mark.parametrize(("role", "is_active"), [(5, True), (15, False)])
    def test_guest_or_former_member_does_not_follow(self, workspace, project, author, role, is_active):
        subscriber = _make_user(workspace, project, role, is_active=is_active)
        ProjectSubscriber.objects.create(project=project, subscriber=subscriber)
        issue_id = _create_issue(_client(author), workspace, project)
        assert subscriber.id not in _subscriber_ids(issue_id)

    def test_nothing_changes_without_project_subscribers(self, workspace, project, author):
        issue_id = _create_issue(_client(author), workspace, project)
        assert IssueSubscriber.objects.filter(issue_id=issue_id).count() == 0

    def test_author_who_is_a_project_subscriber_follows_once(self, workspace, project, manager):
        ProjectSubscriber.objects.create(project=project, subscriber=manager)
        issue_id = _create_issue(_client(manager), workspace, project)
        assert IssueSubscriber.objects.filter(issue_id=issue_id, subscriber=manager).count() == 1

    def test_subscribers_of_another_project_do_not_follow(self, workspace, project, create_user, author):
        other = _make_project(workspace, create_user, "OTHR")
        outsider = _make_user(workspace, other, 15)
        ProjectSubscriber.objects.create(project=other, subscriber=outsider)
        issue_id = _create_issue(_client(author), workspace, project)
        assert outsider.id not in _subscriber_ids(issue_id)


@pytest.mark.contract
@pytest.mark.django_db
class TestNewWorkItemNotifiesProjectSubscribers:
    """Runs upstream's activity and notification tasks and the fork's task in the request, without a worker."""

    @pytest.fixture(autouse=True)
    def email_configured(self, monkeypatch):
        """The test settings send emails to ``mail.outbox``; the instance only needs an SMTP host."""
        monkeypatch.setattr(
            "plane.extended.services.project_subscribers.get_email_configuration",
            lambda: ("smtp.test", "", "", "25", "0", "0", "Plane <plane@test.local>"),
        )

    @pytest.fixture(autouse=True)
    def run_tasks_inline(self, monkeypatch):
        monkeypatch.setattr(issue_activity, "delay", issue_activity.run)
        monkeypatch.setattr(notifications, "delay", notifications.run)
        monkeypatch.setattr(
            notify_project_subscribers_of_new_issue, "delay", notify_project_subscribers_of_new_issue.run
        )

    def _create(self, django_capture_on_commit_callbacks, client, workspace, project, **data):
        with django_capture_on_commit_callbacks(execute=True):
            response = client.post(
                ISSUES_URL.format(slug=workspace.slug, project_id=project.id),
                {"name": "New ticket", **data},
                format="json",
            )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data["id"]

    def test_project_subscriber_is_told_of_a_new_work_item(
        self, django_capture_on_commit_callbacks, workspace, project, manager, author
    ):
        ProjectSubscriber.objects.create(project=project, subscriber=manager)
        issue_id = self._create(django_capture_on_commit_callbacks, _client(author), workspace, project)

        notification = Notification.objects.get(receiver=manager, entity_identifier=issue_id)
        assert notification.triggered_by_id == author.id
        assert notification.data["issue_activity"]["verb"] == "created"
        assert notification.data["issue_activity"]["field"] == "project_subscription"
        sent = [message for message in mail.outbox if message.to == [manager.email]]
        assert len(sent) == 1
        assert sent[0].subject == f"{author.display_name} created SUBS-1 New ticket"
        html = sent[0].alternatives[0][0]
        assert "New ticket" in html and "/test-workspace/browse/SUBS-1/" in html
        assert not EmailNotificationLog.objects.filter(entity_identifier=issue_id).exists()

    def test_email_follows_the_property_changes_preference(
        self, django_capture_on_commit_callbacks, workspace, project, manager, author
    ):
        ProjectSubscriber.objects.create(project=project, subscriber=manager)
        UserNotificationPreference.objects.filter(user=manager).update(property_change=False)
        issue_id = self._create(django_capture_on_commit_callbacks, _client(author), workspace, project)

        assert Notification.objects.filter(receiver=manager, entity_identifier=issue_id).exists()
        assert not [message for message in mail.outbox if message.to == [manager.email]]

    def test_author_is_not_told_of_their_own_work_item(
        self, django_capture_on_commit_callbacks, workspace, project, manager
    ):
        ProjectSubscriber.objects.create(project=project, subscriber=manager)
        issue_id = self._create(django_capture_on_commit_callbacks, _client(manager), workspace, project)
        assert not Notification.objects.filter(receiver=manager, entity_identifier=issue_id).exists()

    def test_assigned_subscriber_only_gets_the_assignment(
        self, django_capture_on_commit_callbacks, workspace, project, manager, author
    ):
        ProjectSubscriber.objects.create(project=project, subscriber=manager)
        issue_id = self._create(
            django_capture_on_commit_callbacks, _client(author), workspace, project, assignee_ids=[str(manager.id)]
        )
        fields = [
            notification.data["issue_activity"]["field"]
            for notification in Notification.objects.filter(receiver=manager, entity_identifier=issue_id)
        ]
        assert "project_subscription" not in fields
        assert "assignees" in fields

    def test_nobody_is_told_without_project_subscribers(
        self, django_capture_on_commit_callbacks, workspace, project, manager, author
    ):
        issue_id = self._create(django_capture_on_commit_callbacks, _client(author), workspace, project)
        assert not Notification.objects.filter(entity_identifier=issue_id).exists()


SUBSCRIBERS_URL = "/api/extended/workspaces/{slug}/projects/{project_id}/subscribers/"
SUBSCRIBER_DETAIL_URL = "/api/extended/workspaces/{slug}/projects/{project_id}/subscribers/{subscriber_id}/"


def _list_url(workspace, project):
    return SUBSCRIBERS_URL.format(slug=workspace.slug, project_id=project.id)


def _detail_url(workspace, project, user_id):
    return SUBSCRIBER_DETAIL_URL.format(slug=workspace.slug, project_id=project.id, subscriber_id=user_id)


def _listed(workspace, project):
    return set(ProjectSubscriber.objects.filter(project=project).values_list("subscriber_id", flat=True))


@pytest.mark.contract
@pytest.mark.django_db
class TestProjectSubscribersApi:
    def test_admin_and_member_list_guest_does_not(self, session_client, workspace, project, manager):
        ProjectSubscriber.objects.create(project=project, subscriber=manager)
        guest = _make_user(workspace, project, 5)

        response = session_client.get(_list_url(workspace, project))
        assert response.status_code == status.HTTP_200_OK
        assert [str(row["subscriber_id"]) for row in response.data] == [str(manager.id)]
        assert _client(manager).get(_list_url(workspace, project)).status_code == status.HTTP_200_OK
        assert _client(guest).get(_list_url(workspace, project)).status_code == status.HTTP_403_FORBIDDEN

    def test_admin_adds_a_subscriber_once(self, session_client, workspace, project, manager):
        first = session_client.post(_list_url(workspace, project), {"subscriber_id": str(manager.id)}, format="json")
        again = session_client.post(_list_url(workspace, project), {"subscriber_id": str(manager.id)}, format="json")

        assert first.status_code == status.HTTP_201_CREATED
        assert str(first.data["subscriber_id"]) == str(manager.id)
        assert again.status_code == status.HTTP_200_OK
        assert ProjectSubscriber.objects.filter(project=project, subscriber=manager).count() == 1

    @pytest.mark.parametrize(("role", "is_active"), [(5, True), (15, False)])
    def test_guest_or_former_member_cannot_be_added(self, session_client, workspace, project, role, is_active):
        user = _make_user(workspace, project, role, is_active=is_active)
        response = session_client.post(_list_url(workspace, project), {"subscriber_id": str(user.id)}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data == {"error": "subscriber_not_eligible"}

    def test_outsider_cannot_be_added(self, session_client, workspace, project, create_user):
        other = _make_project(workspace, create_user, "OTHR")
        outsider = _make_user(workspace, other, 15)
        response = session_client.post(
            _list_url(workspace, project), {"subscriber_id": str(outsider.id)}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.parametrize("payload", [{}, {"subscriber_id": "not-a-uuid"}])
    def test_invalid_subscriber_id(self, session_client, workspace, project, payload):
        response = session_client.post(_list_url(workspace, project), payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_member_cannot_change_the_subscribers(self, workspace, project, manager, author):
        ProjectSubscriber.objects.create(project=project, subscriber=author)
        client = _client(manager)
        add = client.post(_list_url(workspace, project), {"subscriber_id": str(manager.id)}, format="json")
        remove = client.delete(_detail_url(workspace, project, author.id))

        assert add.status_code == status.HTTP_403_FORBIDDEN
        assert remove.status_code == status.HTTP_403_FORBIDDEN
        assert _listed(workspace, project) == {author.id}

    def test_workspace_admin_member_of_the_project_adds(self, workspace, project, manager):
        workspace_admin = UserFactory(username=uuid4().hex)
        WorkspaceMemberFactory(workspace=workspace, member=workspace_admin, role=20)
        ProjectMemberFactory(project=project, member=workspace_admin, workspace=workspace, role=15)

        response = _client(workspace_admin).post(
            _list_url(workspace, project), {"subscriber_id": str(manager.id)}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED

    def test_remove_keeps_the_work_items_followed(self, session_client, workspace, project, manager, author):
        ProjectSubscriber.objects.create(project=project, subscriber=manager)
        issue_id = _create_issue(_client(author), workspace, project)

        first = session_client.delete(_detail_url(workspace, project, manager.id))
        again = session_client.delete(_detail_url(workspace, project, manager.id))

        assert first.status_code == status.HTTP_204_NO_CONTENT
        assert again.status_code == status.HTTP_204_NO_CONTENT
        assert _listed(workspace, project) == set()
        assert manager.id in _subscriber_ids(issue_id)
        assert manager.id not in _subscriber_ids(_create_issue(_client(author), workspace, project))

    def test_project_of_another_workspace(self, session_client, workspace, project, manager):
        response = session_client.get(
            SUBSCRIBERS_URL.format(slug="no-such-workspace", project_id=project.id)
        )
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)

    def test_member_removed_from_the_project_is_no_longer_listed(self, session_client, workspace, project, manager):
        ProjectSubscriber.objects.create(project=project, subscriber=manager)
        membership = ProjectMember.objects.get(project=project, member=manager)

        response = session_client.delete(
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/members/{membership.id}/"
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert _listed(workspace, project) == set()

    def test_member_removed_from_the_workspace_is_no_longer_listed(self, session_client, workspace, project, manager):
        ProjectSubscriber.objects.create(project=project, subscriber=manager)
        membership = WorkspaceMember.objects.get(workspace=workspace, member=manager)

        response = session_client.delete(f"/api/workspaces/{workspace.slug}/members/{membership.id}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert _listed(workspace, project) == set()


@pytest.mark.contract
@pytest.mark.django_db
class TestNewSubscriberFollowsExistingWorkItems:
    def _issue(self, workspace, project, author, name, **fields):
        issue = Issue(name=name, project=project, workspace=workspace, **fields)
        issue.save(created_by_id=author.id)
        return issue

    def test_follows_every_current_work_item_once(self, session_client, workspace, project, manager, author):
        open_item = self._issue(workspace, project, author, "Open")
        followed = self._issue(workspace, project, author, "Already followed")
        archived = self._issue(workspace, project, author, "Archived")
        Issue.objects.filter(pk=archived.pk).update(archived_at=timezone.now())
        deleted = self._issue(workspace, project, author, "Deleted")
        deleted.delete()
        IssueSubscriber.objects.create(project=project, workspace=workspace, issue=followed, subscriber=manager)
        notifications_before = Notification.objects.count()

        response = session_client.post(
            _list_url(workspace, project), {"subscriber_id": str(manager.id)}, format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert manager.id in _subscriber_ids(open_item.id)
        assert IssueSubscriber.objects.filter(issue=followed, subscriber=manager).count() == 1
        assert manager.id not in _subscriber_ids(archived.id)
        assert not IssueSubscriber.all_objects.filter(issue=deleted, subscriber=manager).exists()
        assert Notification.objects.count() == notifications_before

    def test_work_items_of_other_projects_are_left_alone(
        self, session_client, workspace, project, create_user, manager, author
    ):
        other = _make_project(workspace, create_user, "OTHR")
        elsewhere = self._issue(workspace, other, create_user, "Elsewhere")
        session_client.post(_list_url(workspace, project), {"subscriber_id": str(manager.id)}, format="json")
        assert manager.id not in _subscriber_ids(elsewhere.id)
