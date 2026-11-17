# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for who is told of a work item's changes (LONESTONEP-8)."""

import pytest

from plane.db.models import Project, ProjectMember
from plane.extended.rules.issue_readers import issue_reader_ids
from plane.tests.fork_builders import make_issue, make_project, make_user


@pytest.fixture
def project(db, workspace, create_user):
    return make_project(workspace, create_user, "READ")


@pytest.mark.unit
@pytest.mark.django_db
class TestIssueReaderIds:
    def test_a_guest_only_reads_their_own_work_items(self, workspace, project, create_user):
        member = make_user(workspace, project, 15)
        guest = make_user(workspace, project, 5)
        others = make_issue(project, "Item")
        own = make_issue(project, "Own", author=guest)

        assert set(issue_reader_ids(project.id, others.id)) == {create_user.id, member.id}
        assert set(issue_reader_ids(project.id, own.id)) == {create_user.id, member.id, guest.id}

    def test_guest_access_lets_guests_read_every_work_item(self, workspace, project, create_user):
        guest = make_user(workspace, project, 5)
        Project.objects.filter(pk=project.pk).update(guest_view_all_features=True)

        assert guest.id in set(issue_reader_ids(project.id, make_issue(project, "Item").id))

    def test_inactive_members_are_left_out(self, workspace, project, create_user):
        member = make_user(workspace, project, 15)
        ProjectMember.objects.filter(project=project, member=member).update(is_active=False)

        assert member.id not in set(issue_reader_ids(project.id, make_issue(project, "Item").id))
