# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.


import pytest

from plane.db.models import Project
from plane.extended.models import ProjectGuestCollaboration
from plane.extended.rules.guest_assignment import assignable_member_ids
from plane.tests.fork_builders import make_project, make_user


def _configure(project, collaboration, guest_access):
    if collaboration:
        ProjectGuestCollaboration.objects.create(project=project, guest_can_collaborate=True)
    Project.objects.filter(pk=project.pk).update(guest_view_all_features=guest_access)


@pytest.fixture
def project(db, workspace, create_user):
    return make_project(workspace, create_user, "GST")


@pytest.mark.unit
@pytest.mark.django_db
class TestAssignableMemberIds:
    def test_member_is_assignable(self, workspace, project):
        member = make_user(workspace, project, 15)
        assert assignable_member_ids(project.id, [member.id]) == [str(member.id)]

    @pytest.mark.parametrize(
        ("collaboration", "guest_access"),
        [(False, False), (False, True), (True, False)],
    )
    def test_guest_is_not_assignable_without_collaboration_and_guest_access(
        self, workspace, project, collaboration, guest_access
    ):
        guest = make_user(workspace, project, 5)
        _configure(project, collaboration, guest_access)
        assert assignable_member_ids(project.id, [guest.id]) == []

    def test_guest_is_assignable_with_collaboration_and_guest_access(self, workspace, project):
        guest = make_user(workspace, project, 5)
        _configure(project, collaboration=True, guest_access=True)
        assert assignable_member_ids(project.id, [guest.id]) == [str(guest.id)]

    def test_inactive_members_and_guests_are_not_assignable(self, workspace, project):
        member = make_user(workspace, project, 15, is_active=False)
        guest = make_user(workspace, project, 5, is_active=False)
        _configure(project, collaboration=True, guest_access=True)
        assert assignable_member_ids(project.id, [member.id, guest.id]) == []

    def test_user_outside_the_project_is_not_assignable(self, workspace, project, create_user):
        other = make_project(workspace, create_user, "OTH")
        outsider = make_user(workspace, other, 15)
        _configure(project, collaboration=True, guest_access=True)
        assert assignable_member_ids(project.id, [outsider.id]) == []

    def test_current_assignee_is_kept_after_collaboration_is_turned_off(self, workspace, project):
        guest = make_user(workspace, project, 5)
        member = make_user(workspace, project, 15)
        assert assignable_member_ids(project.id, [guest.id, member.id], current_ids=[guest.id]) == [
            str(guest.id),
            str(member.id),
        ]

    def test_requested_order_is_kept_without_duplicates(self, workspace, project):
        first = make_user(workspace, project, 15)
        second = make_user(workspace, project, 20)
        requested = [second.id, first.id, str(second.id)]
        assert assignable_member_ids(project.id, requested) == [str(second.id), str(first.id)]

    def test_current_assignee_who_left_the_project_is_dropped(self, workspace, project):
        member = make_user(workspace, project, 15)
        former = make_user(workspace, project, 15, is_active=False)
        assert assignable_member_ids(project.id, [former.id, member.id], current_ids=[former.id]) == [str(member.id)]

    def test_current_assignee_of_another_project_is_dropped(self, workspace, project, create_user):
        other = make_project(workspace, create_user, "OTH")
        outsider = make_user(workspace, other, 15)
        assert assignable_member_ids(project.id, [outsider.id], current_ids=[outsider.id]) == []
