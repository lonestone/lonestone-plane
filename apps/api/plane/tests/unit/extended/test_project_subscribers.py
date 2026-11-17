# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from uuid import uuid4

import pytest
from django.utils import timezone

from plane.db.models import ProjectMember, Issue, IssueActivity, IssueAssignee, IssueSubscriber, Notification, Project
from plane.extended.models import ProjectSubscriber
from plane.extended.services.project_subscribers import (
    add_subscriber,
    eligible_subscriber_ids,
    is_eligible_member,
    notify_new_issue,
    remove_subscriber,
    subscriber_entries,
    subscribe_to_issues,
)
from plane.tests.fork_builders import make_issue, make_project, make_user


def _subscribe_project(project, user):
    return ProjectSubscriber.objects.create(project=project, subscriber=user)


def _subscriptions(issue):
    return list(IssueSubscriber.objects.filter(issue=issue).values_list("subscriber_id", flat=True))


@pytest.fixture
def project(db, workspace, create_user):
    project = make_project(workspace, create_user, "SUB")
    # The owner is a project admin, so a subscriber by default: these tests start without them.
    ProjectSubscriber.objects.create(project=project, subscriber=create_user, is_subscribed=False)
    return project


@pytest.mark.unit
@pytest.mark.django_db
class TestEligibility:
    @pytest.mark.parametrize("role", [15, 20])
    def test_active_member_or_admin_is_eligible(self, workspace, project, role):
        user = make_user(workspace, project, role)
        _subscribe_project(project, user)
        assert is_eligible_member(project.id, user.id)
        assert eligible_subscriber_ids(project.id) == [user.id]

    def test_guest_is_not_eligible(self, workspace, project):
        guest = make_user(workspace, project, 5)
        _subscribe_project(project, guest)
        assert not is_eligible_member(project.id, guest.id)
        assert eligible_subscriber_ids(project.id) == []

    def test_inactive_member_is_not_eligible(self, workspace, project):
        former = make_user(workspace, project, 15, is_active=False)
        _subscribe_project(project, former)
        assert not is_eligible_member(project.id, former.id)
        assert eligible_subscriber_ids(project.id) == []

    def test_member_of_another_project_is_not_eligible(self, workspace, project, create_user):
        other = make_project(workspace, create_user, "OTH")
        outsider = make_user(workspace, other, 15)
        assert not is_eligible_member(project.id, outsider.id)

    def test_subscribers_of_another_project_are_not_listed(self, workspace, project, create_user):
        other = make_project(workspace, create_user, "OTH")
        member = make_user(workspace, other, 15)
        _subscribe_project(other, member)
        assert eligible_subscriber_ids(project.id) == []


@pytest.mark.unit
@pytest.mark.django_db
class TestSubscribeToIssues:
    def test_subscribes_each_pair_once(self, workspace, project):
        first, second = make_user(workspace, project, 15), make_user(workspace, project, 15)
        issues = [make_issue(project, "One"), make_issue(project, "Two")]
        IssueSubscriber.objects.all().delete(soft=False)

        subscribe_to_issues(project.id, [first.id, second.id], [issue.id for issue in issues])
        subscribe_to_issues(project.id, [first.id, second.id], [issue.id for issue in issues])

        for issue in issues:
            assert sorted(_subscriptions(issue)) == sorted([first.id, second.id])

    def test_creates_no_activity_and_no_notification(self, workspace, project):
        member = make_user(workspace, project, 15)
        issue = make_issue(project, "One")
        activities, notifications = IssueActivity.objects.count(), Notification.objects.count()

        subscribe_to_issues(project.id, [member.id], [issue.id])

        assert IssueActivity.objects.count() == activities
        assert Notification.objects.count() == notifications

    def test_nothing_to_do(self, workspace, project):
        member = make_user(workspace, project, 15)
        subscribe_to_issues(project.id, [], [uuid4()])
        subscribe_to_issues(project.id, [member.id], [])
        assert not IssueSubscriber.objects.filter(subscriber=member).exists()


@pytest.mark.unit
@pytest.mark.django_db
class TestNewIssueSignal:
    def test_new_issue_subscribes_the_project_subscribers(self, workspace, project):
        manager = make_user(workspace, project, 15)
        _subscribe_project(project, manager)
        issue = make_issue(project, "New")
        assert _subscriptions(issue) == [manager.id]

    def test_updating_an_issue_subscribes_nobody(self, workspace, project):
        issue = make_issue(project, "Existing")
        manager = make_user(workspace, project, 15)
        _subscribe_project(project, manager)
        issue.name = "Renamed"
        issue.save()
        assert _subscriptions(issue) == []


@pytest.mark.unit
@pytest.mark.django_db
class TestNewWorkItemEmail:
    @pytest.fixture(autouse=True)
    def email_configured(self, monkeypatch):
        monkeypatch.setattr(
            "plane.extended.services.project_subscribers.get_email_configuration",
            lambda: ("smtp.test", "", "", "25", "0", "0", "Plane <plane@test.local>"),
        )

    def test_email_says_who_created_what_and_links_it(self, workspace, project, create_user):
        from django.core import mail

        from plane.extended.services.project_subscribers import notify_new_issue

        manager = make_user(workspace, project, 15)
        _subscribe_project(project, manager)
        issue = make_issue(project, "Homepage mock-up")
        Issue.objects.filter(pk=issue.pk).update(created_by=create_user, priority="high")
        notify_new_issue(issue.id)

        (message,) = mail.outbox
        assert message.to == [manager.email]
        assert message.subject == f"{create_user.display_name} created SUB-1 Homepage mock-up"
        assert "created a new work item in" in message.body
        assert "high" in message.body
        assert f"/{workspace.slug}/browse/SUB-1/" in message.alternatives[0][0]

    def test_no_email_without_smtp_settings(self, monkeypatch, workspace, project, create_user):
        from django.core import mail

        from plane.extended.services.project_subscribers import notify_new_issue

        monkeypatch.setattr(
            "plane.extended.services.project_subscribers.get_email_configuration",
            lambda: ("", "", "", "587", "1", "0", ""),
        )
        manager = make_user(workspace, project, 15)
        _subscribe_project(project, manager)
        issue = make_issue(project, "Homepage mock-up")
        Issue.objects.filter(pk=issue.pk).update(created_by=create_user)
        notify_new_issue(issue.id)

        assert mail.outbox == []
        assert Notification.objects.filter(receiver=manager).count() == 1

    def test_a_failed_email_does_not_stop_the_others(self, monkeypatch, workspace, project, create_user):
        from django.core import mail
        from django.core.mail import EmailMultiAlternatives

        from plane.extended.services.project_subscribers import notify_new_issue

        first, second = make_user(workspace, project, 15), make_user(workspace, project, 15)
        _subscribe_project(project, first)
        _subscribe_project(project, second)
        send = EmailMultiAlternatives.send

        def failing_send(message, *args, **kwargs):
            if message.to == [first.email]:
                raise OSError("SMTP refused")
            return send(message, *args, **kwargs)

        monkeypatch.setattr(EmailMultiAlternatives, "send", failing_send)
        monkeypatch.setattr("plane.extended.services.project_subscribers.log_exception", lambda exception: None)
        issue = make_issue(project, "Homepage mock-up", author=create_user)
        notify_new_issue(issue.id)

        assert [message.to for message in mail.outbox] == [[second.email]]


@pytest.mark.unit
@pytest.mark.django_db
class TestAdminsAreSubscribersByDefault:
    def test_active_admin_without_a_row_is_a_subscriber(self, workspace, create_user):
        project = make_project(workspace, create_user, "ADM")
        assert subscriber_entries(project.id) == [{"subscriber_id": create_user.id, "default": True}]
        assert ProjectSubscriber.objects.filter(project=project).count() == 0

    def test_admin_who_removed_themselves_is_not(self, workspace, create_user):
        project = make_project(workspace, create_user, "ADM")
        remove_subscriber(project.id, create_user.id)
        assert eligible_subscriber_ids(project.id) == []
        assert ProjectSubscriber.objects.get(project=project, subscriber=create_user).is_subscribed is False

    def test_admin_who_adds_themselves_back_is_again(self, workspace, create_user):
        project = make_project(workspace, create_user, "ADM")
        remove_subscriber(project.id, create_user.id)
        _, created = add_subscriber(project, create_user.id)
        assert created
        assert eligible_subscriber_ids(project.id) == [create_user.id]

    def test_member_promoted_admin_is_a_subscriber_whatever_the_path(self, workspace, project):
        member = make_user(workspace, project, 15)
        # upstream promotes with bulk_update or QuerySet.update(): no signal
        ProjectMember.objects.filter(project=project, member=member).update(role=20)
        assert {"subscriber_id": member.id, "default": True} in subscriber_entries(project.id)

    def test_demoted_admin_forgets_the_opt_out(self, workspace, project):
        admin = make_user(workspace, project, 20)
        remove_subscriber(project.id, admin.id)
        membership = ProjectMember.objects.get(project=project, member=admin)
        membership.role = 15
        membership.save()
        assert not ProjectSubscriber.objects.filter(project=project, subscriber=admin).exists()
        membership.role = 20
        membership.save()
        assert admin.id in eligible_subscriber_ids(project.id)

    def test_inactive_admin_is_not_a_subscriber(self, workspace, project):
        former = make_user(workspace, project, 20, is_active=False)
        assert former.id not in eligible_subscriber_ids(project.id)

    def test_removing_a_member_who_is_not_admin_deletes_the_row(self, workspace, project):
        member = make_user(workspace, project, 15)
        _subscribe_project(project, member)
        remove_subscriber(project.id, member.id)
        assert not ProjectSubscriber.objects.filter(project=project, subscriber=member).exists()

    def test_work_items_of_a_bot_are_not_announced(self, workspace, project, create_user):
        from plane.extended.services.project_subscribers import notify_new_issue

        manager = make_user(workspace, project, 15)
        _subscribe_project(project, manager)
        bot = make_user(workspace, project, 20)
        type(bot).objects.filter(pk=bot.pk).update(is_bot=True)
        issue = make_issue(project, "Sample work item", author=bot)

        notify_new_issue(issue.id)

        assert manager.id in _subscriptions(issue)
        assert not Notification.objects.filter(receiver=manager).exists()


@pytest.mark.unit
@pytest.mark.django_db
class TestDefaultAssigneeIsTold:
    """Upstream assigns the project's default assignee without telling them: the fork does, once."""

    def _notified(self, user):
        return Notification.objects.filter(receiver=user).count()

    def _issue(self, project, name, author, **fields):
        """``make_issue`` leaves ``created_by`` empty here, and a work item without author is never announced."""
        issue = make_issue(project, name, **fields)
        Issue.objects.filter(pk=issue.pk).update(created_by=author)
        return issue

    def test_only_the_default_assignee_is_told(self, workspace, project, create_user):
        default_assignee = make_user(workspace, project, 15)
        other = make_user(workspace, project, 15)
        _subscribe_project(project, default_assignee)
        _subscribe_project(project, other)
        issue = self._issue(project, "New", create_user)

        notify_new_issue(issue.id, default_assignee.id)

        assert self._notified(default_assignee) == 1
        assert self._notified(other) == 0

    def test_author_who_is_the_default_assignee_is_not_told(self, workspace, project, create_user):
        author = make_user(workspace, project, 15)
        _subscribe_project(project, author)
        issue = self._issue(project, "Mine", author)

        notify_new_issue(issue.id, author.id)

        assert self._notified(author) == 0

    def test_default_assignee_who_is_not_a_subscriber_is_not_told(self, workspace, project, create_user):
        default_assignee = make_user(workspace, project, 15)
        issue = self._issue(project, "New", create_user)

        notify_new_issue(issue.id, default_assignee.id)

        assert self._notified(default_assignee) == 0

    def test_work_item_of_a_bot_is_not_announced(self, workspace, project, create_user):
        default_assignee = make_user(workspace, project, 15)
        _subscribe_project(project, default_assignee)
        bot = make_user(workspace, project, 20)
        type(bot).objects.filter(pk=bot.pk).update(is_bot=True)
        issue = self._issue(project, "Sample work item", bot)

        notify_new_issue(issue.id, default_assignee.id)

        assert self._notified(default_assignee) == 0

    @pytest.mark.parametrize("fields", [{"is_draft": True}, {"archived_at": timezone.now()}])
    def test_draft_or_archived_work_item_is_not_announced(self, workspace, project, create_user, fields):
        default_assignee = make_user(workspace, project, 15)
        _subscribe_project(project, default_assignee)
        issue = self._issue(project, "Not live", create_user, **fields)

        notify_new_issue(issue.id, default_assignee.id)

        assert self._notified(default_assignee) == 0


@pytest.mark.unit
@pytest.mark.django_db
class TestDefaultAssigneeSignal:
    @pytest.fixture
    def queued(self, monkeypatch):
        calls = []
        monkeypatch.setattr(
            "plane.extended.signals.notify_project_subscribers_of_new_issue.delay",
            lambda *args: calls.append(args),
        )
        monkeypatch.setattr("plane.extended.signals.transaction.on_commit", lambda func, *args, **kwargs: func())
        return calls

    def _assign(self, issue, user):
        IssueAssignee.objects.create(issue=issue, assignee=user, project=issue.project, workspace=issue.workspace)

    def test_default_assignee_of_a_new_work_item_is_queued(self, workspace, project, queued):
        default_assignee = make_user(workspace, project, 15)
        Project.objects.filter(pk=project.pk).update(default_assignee=default_assignee)
        issue = make_issue(project, "New")

        self._assign(issue, default_assignee)

        assert queued == [(str(issue.id), str(default_assignee.id))]

    def test_another_assignee_is_not_queued(self, workspace, project, queued):
        default_assignee = make_user(workspace, project, 15)
        other = make_user(workspace, project, 15)
        Project.objects.filter(pk=project.pk).update(default_assignee=default_assignee)
        issue = make_issue(project, "New")

        self._assign(issue, other)

        assert queued == []

    def test_default_assignee_added_to_an_existing_work_item_is_not_queued(self, workspace, project, queued):
        default_assignee = make_user(workspace, project, 15)
        Project.objects.filter(pk=project.pk).update(default_assignee=default_assignee)
        issue = make_issue(project, "Old")
        IssueActivity.objects.create(
            issue=issue, project=project, workspace=workspace, verb="created", comment="created the issue"
        )
        queued.clear()

        self._assign(issue, default_assignee)

        assert queued == []
