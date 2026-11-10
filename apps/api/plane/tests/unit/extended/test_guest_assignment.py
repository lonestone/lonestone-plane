# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from uuid import uuid4

import pytest

from plane.db.models import Project, ProjectMember, User, WorkspaceMember
from plane.extended.models import ProjectGuestCollaboration
from plane.extended.rules.guest_assignment import assignable_member_ids


def _make_project(workspace, owner, identifier):
    project = Project.objects.create(name=identifier, identifier=identifier, workspace=workspace, created_by=owner)
    ProjectMember.objects.create(project=project, member=owner, workspace=workspace, role=20)
    return project


def _make_user(workspace, project, prefix, role, is_active=True):
    unique_id = uuid4().hex[:8]
    user = User.objects.create(email=f"{prefix}-{unique_id}@plane.so", username=f"{prefix}_{unique_id}")
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    if project is not None:
        ProjectMember.objects.create(project=project, member=user, workspace=workspace, role=role, is_active=is_active)
    return user


def _configure(project, collaboration, guest_access):
    if collaboration:
        ProjectGuestCollaboration.objects.create(project=project, guest_can_collaborate=True)
    Project.objects.filter(pk=project.pk).update(guest_view_all_features=guest_access)


@pytest.fixture
def project(db, workspace, create_user):
    return _make_project(workspace, create_user, "GST")


@pytest.mark.unit
@pytest.mark.django_db
class TestAssignableMemberIds:
    def test_member_is_assignable(self, workspace, project):
        member = _make_user(workspace, project, "member", 15)
        assert assignable_member_ids(project.id, [member.id]) == [str(member.id)]

    @pytest.mark.parametrize(
        ("collaboration", "guest_access"),
        [(False, False), (False, True), (True, False)],
    )
    def test_guest_is_not_assignable_without_collaboration_and_guest_access(
        self, workspace, project, collaboration, guest_access
    ):
        guest = _make_user(workspace, project, "guest", 5)
        _configure(project, collaboration, guest_access)
        assert assignable_member_ids(project.id, [guest.id]) == []

    def test_guest_is_assignable_with_collaboration_and_guest_access(self, workspace, project):
        guest = _make_user(workspace, project, "guest", 5)
        _configure(project, collaboration=True, guest_access=True)
        assert assignable_member_ids(project.id, [guest.id]) == [str(guest.id)]

    def test_inactive_members_and_guests_are_not_assignable(self, workspace, project):
        member = _make_user(workspace, project, "member", 15, is_active=False)
        guest = _make_user(workspace, project, "guest", 5, is_active=False)
        _configure(project, collaboration=True, guest_access=True)
        assert assignable_member_ids(project.id, [member.id, guest.id]) == []

    def test_user_outside_the_project_is_not_assignable(self, workspace, project, create_user):
        other = _make_project(workspace, create_user, "OTH")
        outsider = _make_user(workspace, other, "outsider", 15)
        _configure(project, collaboration=True, guest_access=True)
        assert assignable_member_ids(project.id, [outsider.id]) == []

    def test_current_assignee_is_kept_after_collaboration_is_turned_off(self, workspace, project):
        guest = _make_user(workspace, project, "guest", 5)
        member = _make_user(workspace, project, "member", 15)
        assert assignable_member_ids(project.id, [guest.id, member.id], current_ids=[guest.id]) == [
            str(guest.id),
            str(member.id),
        ]

    def test_requested_order_is_kept_without_duplicates(self, workspace, project):
        first = _make_user(workspace, project, "first", 15)
        second = _make_user(workspace, project, "second", 20)
        requested = [second.id, first.id, str(second.id)]
        assert assignable_member_ids(project.id, requested) == [str(second.id), str(first.id)]
