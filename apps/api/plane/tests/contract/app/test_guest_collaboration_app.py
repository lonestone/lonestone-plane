# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for project guest collaboration (Lonestone extended)."""

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import (
    Cycle,
    Issue,
    Module,
    ModuleIssue,
    Project,
    ProjectMember,
    State,
    User,
    WorkspaceMember,
)
from plane.extended.models import ProjectGuestCollaboration

ISSUES_URL = "/api/workspaces/{slug}/projects/{project_id}/issues/"
ISSUE_DETAIL_URL = "/api/workspaces/{slug}/projects/{project_id}/issues/{pk}/"
ISSUE_MODULES_URL = "/api/workspaces/{slug}/projects/{project_id}/issues/{issue_id}/modules/"
CYCLES_URL = "/api/workspaces/{slug}/projects/{project_id}/cycles/"
CYCLE_DETAIL_URL = "/api/workspaces/{slug}/projects/{project_id}/cycles/{pk}/"
GUEST_COLLAB_URL = "/api/extended/workspaces/{slug}/projects/{project_id}/guest-collaboration/"
PROJECT_MEMBERS_URL = "/api/workspaces/{slug}/projects/{project_id}/members/"


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Client Project",
        identifier="CLNT",
        workspace=workspace,
        created_by=create_user,
        guest_view_all_features=True,
        cycle_view=True,
        module_view=True,
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    State.objects.create(
        name="Backlog",
        color="#000000",
        project=project,
        workspace=workspace,
        sequence=1,
        group="backlog",
        default=True,
        created_by=create_user,
    )
    return project


@pytest.fixture
def other_project(db, workspace, create_user):
    project = Project.objects.create(
        name="Other Client",
        identifier="OTH",
        workspace=workspace,
        created_by=create_user,
        guest_view_all_features=True,
    )
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    State.objects.create(
        name="Backlog",
        color="#000000",
        project=project,
        workspace=workspace,
        sequence=1,
        group="backlog",
        default=True,
        created_by=create_user,
    )
    return project


@pytest.fixture
def guest(db, workspace, project):
    unique_id = uuid4().hex[:8]
    user = User.objects.create(
        email=f"client-{unique_id}@plane.so",
        username=f"client_{unique_id}",
        first_name="Client",
        last_name="Guest",
    )
    user.set_password("test-password")
    user.save()
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=5)
    ProjectMember.objects.create(project=project, member=user, workspace=workspace, role=5)
    return user


@pytest.fixture
def guest_client(guest):
    client = APIClient()
    client.force_authenticate(user=guest)
    return client


@pytest.fixture
def cycle(db, workspace, project, create_user):
    return Cycle.objects.create(
        name="Sprint 1",
        project=project,
        workspace=workspace,
        owned_by=create_user,
        created_by=create_user,
    )


@pytest.fixture
def foreign_issue(db, workspace, project, create_user):
    issue = Issue(name="Staff issue", project=project, workspace=workspace)
    issue.save(created_by_id=create_user.id)
    return issue


@pytest.mark.contract
class TestGuestCollaboration:
    @pytest.mark.django_db
    def test_guest_without_flag_cannot_create_issue(self, guest_client, workspace, project):
        url = ISSUES_URL.format(slug=workspace.slug, project_id=project.id)
        response = guest_client.post(url, {"name": "Client ticket"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_guest_without_flag_cannot_retrieve_cycle(self, guest_client, workspace, project, cycle):
        url = CYCLE_DETAIL_URL.format(slug=workspace.slug, project_id=project.id, pk=cycle.id)
        response = guest_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_guest_with_flag_can_create_and_update_issue(
        self, guest_client, workspace, project, foreign_issue
    ):
        ProjectGuestCollaboration.objects.create(project=project, guest_can_collaborate=True)

        create_url = ISSUES_URL.format(slug=workspace.slug, project_id=project.id)
        create_response = guest_client.post(create_url, {"name": "Client ticket"}, format="json")
        assert create_response.status_code == status.HTTP_201_CREATED, create_response.data

        update_url = ISSUE_DETAIL_URL.format(
            slug=workspace.slug, project_id=project.id, pk=foreign_issue.id
        )
        update_response = guest_client.patch(update_url, {"name": "Updated by client"}, format="json")
        assert update_response.status_code == status.HTTP_204_NO_CONTENT

    @pytest.mark.django_db
    def test_guest_with_flag_can_retrieve_cycle_but_not_create(
        self, guest_client, workspace, project, cycle
    ):
        ProjectGuestCollaboration.objects.create(project=project, guest_can_collaborate=True)

        detail_url = CYCLE_DETAIL_URL.format(slug=workspace.slug, project_id=project.id, pk=cycle.id)
        detail_response = guest_client.get(detail_url)
        assert detail_response.status_code == status.HTTP_200_OK

        create_url = CYCLES_URL.format(slug=workspace.slug, project_id=project.id)
        create_response = guest_client.post(create_url, {"name": "Hacked cycle"}, format="json")
        assert create_response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_guest_of_other_project_still_denied(
        self, guest_client, workspace, project, other_project
    ):
        ProjectGuestCollaboration.objects.create(project=project, guest_can_collaborate=True)
        ProjectGuestCollaboration.objects.create(project=other_project, guest_can_collaborate=True)

        url = ISSUES_URL.format(slug=workspace.slug, project_id=other_project.id)
        response = guest_client.post(url, {"name": "Should fail"}, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_workspace_guest_cannot_be_promoted_to_project_member(
        self, session_client, workspace, project, guest
    ):
        member = ProjectMember.objects.get(project=project, member=guest)
        url = f"{PROJECT_MEMBERS_URL.format(slug=workspace.slug, project_id=project.id)}{member.id}/"
        response = session_client.patch(url, {"role": 15}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_project_payload_includes_guest_can_collaborate(
        self, session_client, workspace, project
    ):
        ProjectGuestCollaboration.objects.create(project=project, guest_can_collaborate=True)
        url = f"/api/workspaces/{workspace.slug}/projects/{project.id}/"
        response = session_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data.get("guest_can_collaborate") is True

    @pytest.mark.django_db
    def test_guest_cannot_attach_issues_to_foreign_project_module(
        self, guest_client, workspace, project, other_project, create_user, foreign_issue
    ):
        """Guests must not bind issues using another project's module_id."""
        ProjectGuestCollaboration.objects.create(project=project, guest_can_collaborate=True)

        foreign_module = Module.objects.create(
            name="Other Module",
            project=other_project,
            workspace=workspace,
            created_by=create_user,
        )

        url = (
            f"/api/workspaces/{workspace.slug}/projects/{project.id}/"
            f"modules/{foreign_module.id}/issues/"
        )
        response = guest_client.post(url, {"issues": [str(foreign_issue.id)]}, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not ModuleIssue.objects.filter(
            issue_id=foreign_issue.id, module_id=foreign_module.id
        ).exists()

    @pytest.mark.django_db
    def test_guest_cannot_attach_modules_to_foreign_project_issue(
        self, guest_client, workspace, project, other_project, create_user
    ):
        """Guests must not bind modules using another project's issue_id."""
        ProjectGuestCollaboration.objects.create(project=project, guest_can_collaborate=True)

        module = Module.objects.create(
            name="Client Module",
            project=project,
            workspace=workspace,
            created_by=create_user,
        )
        foreign_issue = Issue(name="Other project issue", project=other_project, workspace=workspace)
        foreign_issue.save(created_by_id=create_user.id)

        url = ISSUE_MODULES_URL.format(
            slug=workspace.slug,
            project_id=project.id,
            issue_id=foreign_issue.id,
        )
        response = guest_client.post(url, {"modules": [str(module.id)]}, format="json")
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert not ModuleIssue.objects.filter(issue_id=foreign_issue.id, module_id=module.id).exists()

    @pytest.mark.django_db
    def test_admin_can_toggle_guest_collaboration(self, session_client, workspace, project):
        url = GUEST_COLLAB_URL.format(slug=workspace.slug, project_id=project.id)
        response = session_client.patch(url, {"guest_can_collaborate": True}, format="json")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["guest_can_collaborate"] is True
        assert ProjectGuestCollaboration.objects.filter(
            project=project, guest_can_collaborate=True
        ).exists()
