# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for assigning work items to guests (LONESTONEP-4)."""

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import DraftIssueAssignee, Issue, IssueAssignee, Project, State
from plane.extended.models import ProjectGuestCollaboration
from plane.tests.factories import ProjectFactory, ProjectMemberFactory, UserFactory, WorkspaceMemberFactory

ISSUES_URL = "/api/workspaces/{slug}/projects/{project_id}/issues/"
ISSUE_DETAIL_URL = "/api/workspaces/{slug}/projects/{project_id}/issues/{pk}/"
DRAFTS_URL = "/api/workspaces/{slug}/draft-issues/"


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


def _make_user(workspace, project, role):
    user = UserFactory(username=uuid4().hex)  # the factory leaves the unique username empty
    WorkspaceMemberFactory(workspace=workspace, member=user, role=role)
    ProjectMemberFactory(project=project, member=user, workspace=workspace, role=role)
    return user


def _configure(project, collaboration, guest_access):
    ProjectGuestCollaboration.objects.update_or_create(
        project=project, defaults={"guest_can_collaborate": collaboration}
    )
    Project.objects.filter(pk=project.pk).update(guest_view_all_features=guest_access)


def _assignee_ids(issue_id):
    return set(IssueAssignee.objects.filter(issue_id=issue_id).values_list("assignee_id", flat=True))


@pytest.fixture
def project(db, workspace, create_user):
    return _make_project(workspace, create_user, "CLNT")


@pytest.fixture
def member(db, workspace, project):
    return _make_user(workspace, project, 15)


@pytest.fixture
def guest(db, workspace, project):
    return _make_user(workspace, project, 5)


@pytest.fixture
def guest_client(guest):
    client = APIClient()
    client.force_authenticate(user=guest)
    return client


@pytest.fixture
def issue(db, workspace, project, create_user):
    issue = Issue(name="Staff issue", project=project, workspace=workspace)
    issue.save(created_by_id=create_user.id)
    return issue


@pytest.mark.contract
@pytest.mark.django_db
class TestCreateWithGuestAssignee:
    def _create(self, client, workspace, project, assignee_ids):
        url = ISSUES_URL.format(slug=workspace.slug, project_id=project.id)
        response = client.post(url, {"name": "Client ticket", "assignee_ids": assignee_ids}, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return response.data["id"]

    def test_guest_is_assigned_with_collaboration_and_guest_access(
        self, session_client, workspace, project, member, guest
    ):
        _configure(project, collaboration=True, guest_access=True)
        issue_id = self._create(session_client, workspace, project, [str(member.id), str(guest.id)])
        assert _assignee_ids(issue_id) == {member.id, guest.id}

    @pytest.mark.parametrize(("collaboration", "guest_access"), [(False, True), (True, False), (False, False)])
    def test_guest_is_dropped_otherwise(
        self, session_client, workspace, project, member, guest, collaboration, guest_access
    ):
        _configure(project, collaboration, guest_access)
        issue_id = self._create(session_client, workspace, project, [str(member.id), str(guest.id)])
        assert _assignee_ids(issue_id) == {member.id}


@pytest.mark.contract
@pytest.mark.django_db
class TestUpdateWithGuestAssignee:
    def _patch(self, client, workspace, project, issue, assignee_ids):
        url = ISSUE_DETAIL_URL.format(slug=workspace.slug, project_id=project.id, pk=issue.id)
        response = client.patch(url, {"assignee_ids": assignee_ids}, format="json")
        assert response.status_code == status.HTTP_204_NO_CONTENT, getattr(response, "data", None)

    def test_guest_is_assigned_with_collaboration_and_guest_access(
        self, session_client, workspace, project, issue, guest
    ):
        _configure(project, collaboration=True, guest_access=True)
        self._patch(session_client, workspace, project, issue, [str(guest.id)])
        assert _assignee_ids(issue.id) == {guest.id}

    def test_guest_is_dropped_without_guest_access(self, session_client, workspace, project, issue, member, guest):
        _configure(project, collaboration=True, guest_access=False)
        self._patch(session_client, workspace, project, issue, [str(member.id), str(guest.id)])
        assert _assignee_ids(issue.id) == {member.id}

    def test_guest_is_dropped_without_collaboration(self, session_client, workspace, project, issue, member, guest):
        _configure(project, collaboration=False, guest_access=True)
        self._patch(session_client, workspace, project, issue, [str(member.id), str(guest.id)])
        assert _assignee_ids(issue.id) == {member.id}

    def test_assigned_guest_is_kept_after_collaboration_is_turned_off(
        self, session_client, workspace, project, issue, member, guest
    ):
        _configure(project, collaboration=True, guest_access=True)
        self._patch(session_client, workspace, project, issue, [str(guest.id)])
        _configure(project, collaboration=False, guest_access=True)

        self._patch(session_client, workspace, project, issue, [str(guest.id), str(member.id)])
        assert _assignee_ids(issue.id) == {guest.id, member.id}

        self._patch(session_client, workspace, project, issue, [str(member.id)])
        assert _assignee_ids(issue.id) == {member.id}

    def test_collaborating_guest_assigns_with_the_same_rule(
        self, guest_client, workspace, project, issue, member, guest
    ):
        _configure(project, collaboration=True, guest_access=True)
        self._patch(guest_client, workspace, project, issue, [str(member.id), str(guest.id)])
        assert _assignee_ids(issue.id) == {member.id, guest.id}

    def test_guest_of_another_project_is_never_assigned(self, session_client, workspace, project, issue, create_user):
        other = _make_project(workspace, create_user, "OTH")
        foreign_guest = _make_user(workspace, other, 5)
        _configure(project, collaboration=True, guest_access=True)
        self._patch(session_client, workspace, project, issue, [str(foreign_guest.id)])
        assert _assignee_ids(issue.id) == set()


@pytest.mark.contract
@pytest.mark.django_db
class TestDraftWithGuestAssignee:
    def _create(self, client, workspace, project, assignee_ids):
        url = DRAFTS_URL.format(slug=workspace.slug)
        response = client.post(
            url, {"name": "Draft", "project_id": str(project.id), "assignee_ids": assignee_ids}, format="json"
        )
        assert response.status_code == status.HTTP_201_CREATED, response.data
        return set(
            DraftIssueAssignee.objects.filter(draft_issue_id=response.data["id"]).values_list("assignee_id", flat=True)
        )

    def test_guest_is_kept_with_collaboration_and_guest_access(self, session_client, workspace, project, member, guest):
        _configure(project, collaboration=True, guest_access=True)
        assert self._create(session_client, workspace, project, [str(member.id), str(guest.id)]) == {
            member.id,
            guest.id,
        }

    def test_guest_is_dropped_without_collaboration(self, session_client, workspace, project, member, guest):
        _configure(project, collaboration=False, guest_access=True)
        assert self._create(session_client, workspace, project, [str(member.id), str(guest.id)]) == {member.id}
