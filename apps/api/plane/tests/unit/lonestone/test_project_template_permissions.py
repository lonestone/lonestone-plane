# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

import pytest

from plane.db.models import Project, ProjectMember, User, WorkspaceMember
from plane.lonestone.views.project_template import _can_mutate_project


def _make_user(email: str) -> User:
    suffix = uuid.uuid4().hex[:8]
    return User.objects.create(email=email, username=f"{email.split('@')[0]}_{suffix}")


@pytest.mark.unit
@pytest.mark.django_db
class TestCanMutateProject:
    def test_workspace_admin_can_mutate_any_project(self, workspace, create_user):
        project = Project.objects.create(
            name="Admin Target",
            identifier="ADMT",
            workspace=workspace,
        )

        assert _can_mutate_project(user=create_user, slug=workspace.slug, project_id=project.id) is True

    def test_project_admin_can_mutate_their_project(self, workspace):
        member = _make_user("project-admin@plane.so")
        WorkspaceMember.objects.create(workspace=workspace, member=member, role=15)
        project = Project.objects.create(
            name="Member Project",
            identifier="MBRP",
            workspace=workspace,
        )
        ProjectMember.objects.create(project=project, member=member, role=20, workspace=workspace)

        assert _can_mutate_project(user=member, slug=workspace.slug, project_id=project.id) is True

    def test_workspace_member_without_project_admin_cannot_mutate(self, workspace):
        member = _make_user("workspace-member@plane.so")
        WorkspaceMember.objects.create(workspace=workspace, member=member, role=15)
        project = Project.objects.create(
            name="Other Project",
            identifier="OTHP",
            workspace=workspace,
        )
        ProjectMember.objects.create(project=project, member=member, role=15, workspace=workspace)

        assert _can_mutate_project(user=member, slug=workspace.slug, project_id=project.id) is False

    def test_non_member_cannot_mutate_project(self, workspace):
        outsider = _make_user("outsider@plane.so")
        project = Project.objects.create(
            name="Closed Project",
            identifier="CLSD",
            workspace=workspace,
        )

        assert _can_mutate_project(user=outsider, slug=workspace.slug, project_id=project.id) is False
