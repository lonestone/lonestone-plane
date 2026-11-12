# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Signal receivers of the fork, connected in ``ExtendedConfig.ready()``."""

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from plane.app.permissions.base import ROLE
from plane.db.models import Issue, IssueActivity, ProjectMember, WorkspaceMember
from plane.extended.models import ProjectSubscriber
from plane.extended.services.project_subscribers import (
    forget_member,
    revoke_unreadable_follows,
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


@receiver(post_save, sender=ProjectMember, dispatch_uid="extended_remove_departed_project_subscriber")
def remove_departed_project_subscriber(sender, instance, created, raw=False, **kwargs):
    """Leaving drops the subscription, losing admin drops the opt-out, turning guest revokes follows.

    Upstream's bulk updates send no signal; ``subscriber_entries`` reads memberships at run time anyway.
    Work item follows do not get that safety net: upstream's ``notifications`` reads them as they are, and
    every way back into a project (``ProjectMemberViewSet.create``, joining from the workspace, the
    ``create_project_member`` command) sends no signal and may make them a guest. So leaving also revokes
    the follows a guest could not read; a member who comes back does not follow those work items again.
    """
    if raw:
        return
    if not instance.is_active:
        forget_member(instance.project_id, instance.member_id)
        revoke_unreadable_follows(instance.member_id, [instance.project_id])
        return
    if instance.role != ROLE.ADMIN.value:
        ProjectSubscriber.objects.filter(
            project_id=instance.project_id, subscriber_id=instance.member_id, is_subscribed=False
        ).delete(soft=False)
    if instance.role < ROLE.MEMBER.value:
        revoke_unreadable_follows(instance.member_id, [instance.project_id])


@receiver(post_save, sender=WorkspaceMember, dispatch_uid="extended_remove_departed_workspace_subscriber")
def remove_departed_workspace_subscriber(sender, instance, created, raw=False, **kwargs):
    """Same for the workspace: upstream updates the project memberships with ``QuerySet.update()``."""
    if raw:
        return
    if not instance.is_active:
        ProjectSubscriber.objects.filter(
            project__workspace_id=instance.workspace_id, subscriber_id=instance.member_id
        ).delete(soft=False)
        # As when leaving a project: the ways back send no signal.
        project_ids = ProjectMember.objects.filter(
            workspace_id=instance.workspace_id, member_id=instance.member_id
        ).values_list("project_id", flat=True)
        revoke_unreadable_follows(instance.member_id, project_ids)
        return
    if instance.role < ROLE.MEMBER.value:
        project_ids = ProjectMember.objects.filter(
            workspace_id=instance.workspace_id, member_id=instance.member_id, is_active=True
        ).values_list("project_id", flat=True)
        revoke_unreadable_follows(instance.member_id, project_ids)
