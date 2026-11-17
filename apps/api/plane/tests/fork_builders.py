# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Builders shared by the fork's tests (unit/extended, contract/app): projects, members, work items.

They create rows directly, without the API, and complete ``plane.tests.factories``.
"""

from uuid import uuid4

from rest_framework.test import APIClient

from plane.db.models import Issue, State
from plane.tests.factories import ProjectFactory, ProjectMemberFactory, UserFactory, WorkspaceMemberFactory


def make_project(workspace, owner, identifier):
    """A project owned by ``owner`` (project admin), with a default "Backlog" state."""
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


def make_user(workspace, project, role, is_active=True):
    """A user with this role in the workspace and in the project."""
    user = UserFactory(username=uuid4().hex)  # the factory leaves the unique username empty
    WorkspaceMemberFactory(workspace=workspace, member=user, role=role)
    ProjectMemberFactory(project=project, member=user, workspace=workspace, role=role, is_active=is_active)
    return user


def make_issue(project, name, author=None, **fields):
    """A work item saved as ``author`` (default: the project's creator)."""
    issue = Issue(name=name, project=project, workspace=project.workspace, **fields)
    issue.save(created_by_id=author.id if author else project.created_by_id)
    return issue


def client_for(user):
    """An API client authenticated as ``user``."""
    client = APIClient()
    client.force_authenticate(user=user)
    return client
