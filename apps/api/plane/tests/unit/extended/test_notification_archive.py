# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Archive every notification of the inbox view (LONESTONEP-14)."""

from datetime import timedelta

import pytest
from django.utils import timezone

from plane.db.models import IssueAssignee, IssueSubscriber, Notification
from plane.extended.models import ProjectSubscriber
from plane.extended.services.notification_archive import archive_all_notifications
from plane.tests.factories import WorkspaceFactory, WorkspaceMemberFactory
from plane.tests.fork_builders import make_issue, make_notification, make_project, make_user

MENTION = "in_app:issue_activities:mentioned"


def archived(*notifications):
    return [Notification.objects.get(pk=n.pk).archived_at is not None for n in notifications]


@pytest.fixture
def project(db, workspace, create_user):
    project = make_project(workspace, create_user, "INB")
    # The owner is a project admin, so subscribed to new work items by default (LONESTONEP-8): not here.
    ProjectSubscriber.objects.create(project=project, subscriber=create_user, is_subscribed=False)
    return project


@pytest.fixture
def issue(project, create_user):
    return make_issue(project, "Work item", author=create_user)


@pytest.mark.unit
@pytest.mark.django_db
class TestArchiveAllNotifications:
    def test_archives_the_inbox_of_the_all_tab(self, workspace, create_user, issue):
        read = make_notification(create_user, issue, read_at=timezone.now())
        unread = make_notification(create_user, issue)

        count = archive_all_notifications(slug=workspace.slug, user=create_user)

        assert count == 2
        assert archived(read, unread) == [True, True]

    def test_the_all_tab_leaves_mentions(self, workspace, create_user, issue):
        activity = make_notification(create_user, issue)
        mention = make_notification(create_user, issue, sender=MENTION)

        archive_all_notifications(slug=workspace.slug, user=create_user, mentioned=False)
        assert archived(activity, mention) == [True, False]

    def test_the_mentions_tab_leaves_the_other_notifications(self, workspace, create_user, issue):
        activity = make_notification(create_user, issue)
        mention = make_notification(create_user, issue, sender=MENTION)

        archive_all_notifications(slug=workspace.slug, user=create_user, mentioned=True)
        assert archived(activity, mention) == [False, True]

    def test_leaves_snoozed_notifications_alone(self, workspace, create_user, issue):
        snoozed = make_notification(create_user, issue, snoozed_till=timezone.now() + timedelta(days=1))
        snooze_over = make_notification(create_user, issue, snoozed_till=timezone.now() - timedelta(days=1))

        assert archive_all_notifications(slug=workspace.slug, user=create_user) == 0
        assert archived(snoozed, snooze_over) == [False, False]

    def test_does_not_touch_already_archived_notifications(self, workspace, create_user, issue):
        before = timezone.now() - timedelta(days=3)
        old = make_notification(create_user, issue, archived_at=before)

        assert archive_all_notifications(slug=workspace.slug, user=create_user) == 0
        assert Notification.objects.get(pk=old.pk).archived_at == before

    def test_unread_only(self, workspace, create_user, issue):
        read = make_notification(create_user, issue, read_at=timezone.now())
        unread = make_notification(create_user, issue)

        archive_all_notifications(slug=workspace.slug, user=create_user, unread_only=True)
        assert archived(read, unread) == [False, True]

    def test_type_filters_add_up(self, workspace, project, create_user):
        other = make_user(workspace, project, 15)
        assigned_issue = make_issue(project, "Assigned", author=other)
        subscribed_issue = make_issue(project, "Subscribed", author=other)
        mine = make_issue(project, "Created", author=create_user)
        IssueAssignee.objects.create(issue=assigned_issue, assignee=create_user, project=project, workspace=workspace)
        IssueSubscriber.objects.create(
            issue=subscribed_issue, subscriber=create_user, project=project, workspace=workspace
        )
        assigned = make_notification(create_user, assigned_issue)
        subscribed = make_notification(create_user, subscribed_issue)
        created = make_notification(create_user, mine)

        archive_all_notifications(slug=workspace.slug, user=create_user, types=["assigned", "subscribed"])
        assert archived(assigned, subscribed, created) == [True, True, False]

    def test_created_by_me(self, workspace, project, create_user, issue):
        other = make_user(workspace, project, 15)
        theirs = make_issue(project, "Theirs", author=other)
        mine = make_notification(create_user, issue)
        not_mine = make_notification(create_user, theirs)

        archive_all_notifications(slug=workspace.slug, user=create_user, types=["created"])
        assert archived(mine, not_mine) == [True, False]

    def test_subscribed_leaves_the_work_items_created_by_the_user(self, workspace, project, create_user):
        other = make_user(workspace, project, 15)
        assigned_issue = make_issue(project, "Assigned", author=other)
        mine = make_issue(project, "Created", author=create_user)
        IssueAssignee.objects.create(issue=assigned_issue, assignee=create_user, project=project, workspace=workspace)
        for issue in (assigned_issue, mine):
            IssueSubscriber.objects.get_or_create(
                issue=issue, subscriber=create_user, project=project, workspace=workspace
            )
        assigned = make_notification(create_user, assigned_issue)
        created = make_notification(create_user, mine)

        archive_all_notifications(slug=workspace.slug, user=create_user, types=["subscribed"])
        # Upstream's list means to leave assigned work items out too, but matches the assignee row's id
        # against the work item's: they stay in the "subscribed" view, so they are archived with it.
        assert archived(assigned, created) == [True, False]

    def test_a_guest_filtering_on_created_has_nothing_to_archive(self, workspace, project, issue):
        guest = make_user(workspace, project, 5)
        IssueAssignee.objects.create(issue=issue, assignee=guest, project=project, workspace=workspace)
        notification = make_notification(guest, issue)

        assert archive_all_notifications(slug=workspace.slug, user=guest, types=["created", "assigned"]) == 0
        assert archived(notification) == [False]
        assert archive_all_notifications(slug=workspace.slug, user=guest, types=["assigned"]) == 1

    def test_only_the_users_own_notifications_of_this_workspace(self, workspace, project, create_user, issue):
        member = make_user(workspace, project, 15)
        theirs = make_notification(member, issue)
        not_an_issue = make_notification(create_user, issue, entity_name="project")
        other_workspace = WorkspaceFactory(owner=create_user)
        WorkspaceMemberFactory(workspace=other_workspace, member=create_user, role=20)
        elsewhere = make_notification(
            create_user, make_issue(make_project(other_workspace, create_user, "ELS"), "Other")
        )

        assert archive_all_notifications(slug=workspace.slug, user=create_user) == 0
        assert archived(theirs, not_an_issue, elsewhere) == [False, False, False]
