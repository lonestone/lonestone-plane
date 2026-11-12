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
from plane.extended.services.project_subscribers import forget_member, subscribe_new_issue
from plane.extended.tasks import notify_project_subscribers_of_new_issue


@receiver(post_save, sender=Issue, dispatch_uid="extended_subscribe_project_subscribers")
def subscribe_project_subscribers(sender, instance, created, raw=False, **kwargs):
    """Project subscribers (LONESTONEP-8) follow each new work item of the project.

    Every path that saves an ``Issue`` sends ``post_save`` (``Issue.objects.bulk_create``, used by demo
    data only, does not). The subscriptions exist before upstream's ``notifications`` task runs: the views
    queue ``issue_activity`` after ``serializer.save()``, so upstream notifies the subscribers of every
    change that follows. Re-check on the next upstream merge.
    """
    if not created or raw:
        return
    subscribe_new_issue(instance)


@receiver(post_save, sender=IssueActivity, dispatch_uid="extended_notify_project_subscribers")
def notify_project_subscribers(sender, instance, created, raw=False, **kwargs):
    """Tell the project subscribers of a new work item, once upstream has recorded its creation.

    Upstream records the "created" activity (``create_issue_activity`` in ``bgtasks/issue_activities_task.py``)
    in the ``issue_activity`` task, which the create paths queue once the work item, its assignees and its
    labels are saved. ``Issue.save()`` commits in its own transaction before the assignees: notifying from
    the ``Issue`` signal would race them. A path that records no "created" activity (the fork's project
    templates, which build a new project) notifies nobody. Re-check on the next upstream merge.
    """
    if not created or raw or instance.verb != "created" or instance.field or not instance.issue_id:
        return
    issue_id = str(instance.issue_id)
    transaction.on_commit(lambda: notify_project_subscribers_of_new_issue.delay(issue_id))


@receiver(post_save, sender=ProjectMember, dispatch_uid="extended_remove_departed_project_subscriber")
def remove_departed_project_subscriber(sender, instance, created, raw=False, **kwargs):
    """Keep project subscribers (LONESTONEP-8) in step with ``save()`` on a project membership.

    - Leaving the project, or being removed from it (``is_active=False``): no longer a subscriber; coming
      back does not make them one again, unless they come back as an admin.
    - No longer an admin: an admin who had removed themselves forgets it, so that becoming an admin
      again subscribes them again.

    Upstream also changes memberships with ``bulk_create``, ``bulk_update`` and ``QuerySet.update()``,
    which send no signal: the rules read memberships when they run (``subscriber_entries``), so a missed
    signal only leaves a row that no longer counts.
    """
    if raw:
        return
    if not instance.is_active:
        forget_member(instance.project_id, instance.member_id)
    elif instance.role != ROLE.ADMIN.value:
        ProjectSubscriber.objects.filter(
            project_id=instance.project_id, subscriber_id=instance.member_id, is_subscribed=False
        ).delete(soft=False)


@receiver(post_save, sender=WorkspaceMember, dispatch_uid="extended_remove_departed_workspace_subscriber")
def remove_departed_workspace_subscriber(sender, instance, created, raw=False, **kwargs):
    """Same, for a member who leaves the workspace: upstream deactivates their project memberships with
    ``QuerySet.update()``, which sends no ``post_save`` for ``ProjectMember``."""
    if raw or instance.is_active:
        return
    ProjectSubscriber.objects.filter(
        project__workspace_id=instance.workspace_id, subscriber_id=instance.member_id
    ).delete(soft=False)
