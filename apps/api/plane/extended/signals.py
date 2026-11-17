# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Signal receivers of the fork, connected in ``ExtendedConfig.ready()``."""

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from plane.app.permissions.base import ROLE
from plane.db.models import Issue, IssueActivity, IssueAssignee, Project, ProjectMember, WorkspaceMember
from plane.extended.models import ProjectSubscriber
from plane.extended.services.project_subscribers import (
    forget_member,
    subscribe_new_issue,
)
from plane.extended.tasks import notify_project_subscribers_of_new_issue


@receiver(post_save, sender=Issue, dispatch_uid="extended_subscribe_project_subscribers")
def subscribe_project_subscribers(sender, instance, created, raw=False, **kwargs):
    """Project subscribers follow each new work item (LONESTONEP-8)."""
    if not created or raw:
        return
    subscribe_new_issue(instance)


@receiver(post_save, sender=IssueActivity, dispatch_uid="extended_notify_project_subscribers")
def notify_project_subscribers(sender, instance, created, raw=False, **kwargs):
    """Notify on the "created" activity, not on ``Issue`` save: the assignees are not saved yet then."""
    if not created or raw or instance.verb != "created" or instance.field or not instance.issue_id:
        return
    issue_id = str(instance.issue_id)
    transaction.on_commit(lambda: notify_project_subscribers_of_new_issue.delay(issue_id))


@receiver(post_save, sender=IssueAssignee, dispatch_uid="extended_notify_default_assignee")
def notify_default_assignee(sender, instance, created, raw=False, **kwargs):
    """The project's default assignee follows a new work item but upstream tells them nothing.

    Upstream saves explicit assignees with ``bulk_create`` (no signal) and the default assignee with
    ``objects.create``; ``notify_new_issue`` skips assignees, so the default one is notified here.
    Only while the work item is being created: its "created" activity is logged after this, by the
    ``issue_activity`` task, so a later assignment never announces an old work item.
    """
    if not created or raw:
        return
    if not Project.objects.filter(pk=instance.project_id, default_assignee_id=instance.assignee_id).exists():
        return
    if IssueActivity.objects.filter(issue_id=instance.issue_id, verb="created", field__isnull=True).exists():
        return
    issue_id, assignee_id = str(instance.issue_id), str(instance.assignee_id)
    transaction.on_commit(lambda: notify_project_subscribers_of_new_issue.delay(issue_id, assignee_id))


@receiver(post_save, sender=ProjectMember, dispatch_uid="extended_remove_departed_project_subscriber")
def remove_departed_project_subscriber(sender, instance, created, raw=False, **kwargs):
    """Leaving drops the subscription, losing admin drops the opt-out.

    Upstream's bulk updates send no signal; ``subscriber_entries`` reads memberships at run time anyway.
    A guest's follows of work items they cannot open are left alone: ``issue_reader_ids`` keeps them silent.
    """
    if raw:
        return
    if not instance.is_active:
        forget_member(instance.project_id, instance.member_id)
        return
    if instance.role != ROLE.ADMIN.value:
        ProjectSubscriber.objects.filter(
            project_id=instance.project_id, subscriber_id=instance.member_id, is_subscribed=False
        ).delete(soft=False)


@receiver(post_save, sender=WorkspaceMember, dispatch_uid="extended_remove_departed_workspace_subscriber")
def remove_departed_workspace_subscriber(sender, instance, created, raw=False, **kwargs):
    """Leaving the workspace: upstream deactivates the project memberships with ``QuerySet.update()``."""
    if raw or instance.is_active:
        return
    ProjectSubscriber.objects.filter(
        project__workspace_id=instance.workspace_id, subscriber_id=instance.member_id
    ).delete(soft=False)
