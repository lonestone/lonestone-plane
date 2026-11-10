# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for project templates (Lonestone extended, `/api/extended/`)."""

from uuid import uuid4

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from plane.db.models import Issue, Label, Project, ProjectMember, State, User, WorkspaceMember
from plane.extended.models import Template


def _templates_url(workspace):
    return reverse("extended-project-templates", kwargs={"slug": workspace.slug})


def _template_url(workspace, pk):
    return reverse("extended-project-template-detail", kwargs={"slug": workspace.slug, "pk": pk})


def _preview_url(workspace):
    return reverse("extended-project-template-preview", kwargs={"slug": workspace.slug})


def _apply_url(workspace, pk):
    return reverse("extended-project-template-apply", kwargs={"slug": workspace.slug, "pk": pk})


def _user(prefix):
    unique_id = uuid4().hex[:8]
    return User.objects.create(email=f"{prefix}-{unique_id}@plane.so", username=f"{prefix}_{unique_id}")


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def source_project(db, workspace, create_user):
    """A project with one state, one label and one work item, to build a template from."""
    project = Project.objects.create(name="Source", identifier="SRC", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    state = State.objects.create(
        name="Ready", color="#3f76ff", group="unstarted", sequence=1, default=True, project=project, workspace=workspace
    )
    Label.objects.create(name="backend", color="#858e96", project=project, workspace=workspace)
    issue = Issue(name="Kickoff", project=project, workspace=workspace, state=state)
    issue.save(created_by_id=create_user.id)
    return project


@pytest.fixture
def target_project(db, workspace, create_user):
    project = Project.objects.create(name="Target", identifier="TGT", workspace=workspace, created_by=create_user)
    ProjectMember.objects.create(project=project, member=create_user, workspace=workspace, role=20)
    return project


@pytest.fixture
def template(session_client, workspace, source_project):
    response = session_client.post(
        _templates_url(workspace),
        {"name": "Sprint kit", "project_id": str(source_project.id)},
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED
    return response.data


@pytest.fixture
def member_client(db, workspace):
    """A workspace member who is not admin of any project."""
    user = _user("member")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=15)
    return _client(user)


@pytest.mark.contract
@pytest.mark.django_db
class TestProjectTemplatePermissions:
    def test_member_can_list(self, member_client, workspace, template):
        response = member_client.get(_templates_url(workspace))
        assert response.status_code == status.HTTP_200_OK
        assert [item["name"] for item in response.data] == ["Sprint kit"]

    def test_member_cannot_create(self, member_client, workspace, source_project):
        response = member_client.post(
            _templates_url(workspace),
            {"name": "Mine", "project_id": str(source_project.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not Template.objects.exists()

    def test_guest_and_outsider_cannot_list(self, db, workspace, template):
        guest = _user("guest")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        outsider = _user("outsider")
        for user in (guest, outsider):
            response = _client(user).get(_templates_url(workspace))
            assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_member_cannot_apply_to_a_project_they_do_not_administer(
        self, member_client, workspace, target_project, template
    ):
        response = member_client.post(
            _apply_url(workspace, template["id"]),
            {"project_id": str(target_project.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not Issue.objects.filter(project=target_project).exists()


@pytest.mark.contract
@pytest.mark.django_db
class TestProjectTemplateLifecycle:
    def test_create_from_a_project_snapshots_states_labels_and_work_items(self, template):
        snapshot = template["template_data"][0]
        assert [state["name"] for state in snapshot["states"]] == ["Ready"]
        assert [label["name"] for label in snapshot["labels"]] == ["backend"]
        assert [item["name"] for item in snapshot["work_items"]] == ["Kickoff"]

    def test_name_is_required(self, session_client, workspace):
        response = session_client.post(_templates_url(workspace), {"name": " "}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not Template.objects.exists()

    def test_unknown_source_project_is_not_found(self, session_client, workspace):
        response = session_client.post(
            _templates_url(workspace), {"name": "Kit", "project_id": str(uuid4())}, format="json"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_preview_returns_the_snapshot_without_saving(self, session_client, workspace, source_project):
        response = session_client.get(_preview_url(workspace), {"project_id": str(source_project.id)})
        assert response.status_code == status.HTTP_200_OK
        assert [item["name"] for item in response.data["work_items"]] == ["Kickoff"]
        assert not Template.objects.exists()

    def test_rename(self, session_client, workspace, template):
        response = session_client.patch(
            _template_url(workspace, template["id"]), {"name": "Release kit"}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Release kit"

    def test_delete(self, session_client, workspace, template):
        url = _template_url(workspace, template["id"])
        assert session_client.delete(url).status_code == status.HTTP_204_NO_CONTENT
        assert session_client.get(url).status_code == status.HTTP_404_NOT_FOUND

    def test_apply_copies_the_snapshot_into_the_project(self, session_client, workspace, target_project, template):
        response = session_client.post(
            _apply_url(workspace, template["id"]),
            {"project_id": str(target_project.id)},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        states = State.objects.filter(project=target_project).exclude(group="triage")
        assert set(states.values_list("name", flat=True)) == {"Ready"}
        assert list(Label.objects.filter(project=target_project).values_list("name", flat=True)) == ["backend"]
        assert list(Issue.objects.filter(project=target_project).values_list("name", flat=True)) == ["Kickoff"]

    def test_apply_unknown_template_is_not_found(self, session_client, workspace, target_project):
        response = session_client.post(
            _apply_url(workspace, uuid4()), {"project_id": str(target_project.id)}, format="json"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
