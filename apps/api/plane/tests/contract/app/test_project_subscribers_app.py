# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for project subscribers (LONESTONEP-8)."""

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.notification_task import notifications
from plane.db.models import (
    EmailNotificationLog,
    IssueSubscriber,
    Notification,
    State,
    UserNotificationPreference,
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
        assert EmailNotificationLog.objects.filter(receiver=manager, entity_identifier=issue_id).count() == 1

    def test_email_follows_the_property_changes_preference(
        self, django_capture_on_commit_callbacks, workspace, project, manager, author
    ):
        ProjectSubscriber.objects.create(project=project, subscriber=manager)
        UserNotificationPreference.objects.filter(user=manager).update(property_change=False)
        issue_id = self._create(django_capture_on_commit_callbacks, _client(author), workspace, project)

        assert Notification.objects.filter(receiver=manager, entity_identifier=issue_id).exists()
        assert not EmailNotificationLog.objects.filter(receiver=manager, entity_identifier=issue_id).exists()

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
