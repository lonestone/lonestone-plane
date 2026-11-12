# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from uuid import uuid4

import pytest

from plane.db.models import Issue, IssueActivity, IssueSubscriber, Notification, State
from plane.extended.models import ProjectSubscriber
from plane.extended.services.project_subscribers import (
    eligible_subscriber_ids,
    is_eligible_member,
    subscribe_to_issues,
)
from plane.tests.factories import ProjectFactory, ProjectMemberFactory, UserFactory, WorkspaceMemberFactory


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


def _make_issue(project, name):
    issue = Issue(name=name, project=project, workspace=project.workspace)
    issue.save(created_by_id=project.created_by_id)
    return issue


def _subscribe_project(project, user):
    return ProjectSubscriber.objects.create(project=project, subscriber=user)


def _subscriptions(issue):
    return list(IssueSubscriber.objects.filter(issue=issue).values_list("subscriber_id", flat=True))


@pytest.fixture
def project(db, workspace, create_user):
    return _make_project(workspace, create_user, "SUB")


@pytest.mark.unit
@pytest.mark.django_db
class TestEligibility:
    @pytest.mark.parametrize("role", [15, 20])
    def test_active_member_or_admin_is_eligible(self, workspace, project, role):
        user = _make_user(workspace, project, role)
        _subscribe_project(project, user)
        assert is_eligible_member(project.id, user.id)
        assert eligible_subscriber_ids(project.id) == [user.id]

    def test_guest_is_not_eligible(self, workspace, project):
        guest = _make_user(workspace, project, 5)
        _subscribe_project(project, guest)
        assert not is_eligible_member(project.id, guest.id)
        assert eligible_subscriber_ids(project.id) == []

    def test_inactive_member_is_not_eligible(self, workspace, project):
        former = _make_user(workspace, project, 15, is_active=False)
        _subscribe_project(project, former)
        assert not is_eligible_member(project.id, former.id)
        assert eligible_subscriber_ids(project.id) == []

    def test_member_of_another_project_is_not_eligible(self, workspace, project, create_user):
        other = _make_project(workspace, create_user, "OTH")
        outsider = _make_user(workspace, other, 15)
        assert not is_eligible_member(project.id, outsider.id)

    def test_subscribers_of_another_project_are_not_listed(self, workspace, project, create_user):
        other = _make_project(workspace, create_user, "OTH")
        member = _make_user(workspace, other, 15)
        _subscribe_project(other, member)
        assert eligible_subscriber_ids(project.id) == []


@pytest.mark.unit
@pytest.mark.django_db
class TestSubscribeToIssues:
    def test_subscribes_each_pair_once(self, workspace, project):
        first, second = _make_user(workspace, project, 15), _make_user(workspace, project, 15)
        issues = [_make_issue(project, "One"), _make_issue(project, "Two")]
        IssueSubscriber.objects.all().delete(soft=False)

        subscribe_to_issues(project.id, [first.id, second.id], [issue.id for issue in issues])
        subscribe_to_issues(project.id, [first.id, second.id], [issue.id for issue in issues])

        for issue in issues:
            assert sorted(_subscriptions(issue)) == sorted([first.id, second.id])

    def test_creates_no_activity_and_no_notification(self, workspace, project):
        member = _make_user(workspace, project, 15)
        issue = _make_issue(project, "One")
        activities, notifications = IssueActivity.objects.count(), Notification.objects.count()

        subscribe_to_issues(project.id, [member.id], [issue.id])

        assert IssueActivity.objects.count() == activities
        assert Notification.objects.count() == notifications

    def test_nothing_to_do(self, workspace, project):
        member = _make_user(workspace, project, 15)
        subscribe_to_issues(project.id, [], [uuid4()])
        subscribe_to_issues(project.id, [member.id], [])
        assert not IssueSubscriber.objects.filter(subscriber=member).exists()
