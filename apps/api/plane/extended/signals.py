# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Signal receivers of the fork, connected in ``ExtendedConfig.ready()``."""

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from plane.db.models import Issue, ProjectMember, WorkspaceMember
from plane.extended.models import ProjectSubscriber
from plane.extended.services.project_subscribers import remove_subscriber, subscribe_new_issue
from plane.extended.tasks import notify_project_subscribers_of_new_issue


@receiver(post_save, sender=Issue, dispatch_uid="extended_subscribe_project_subscribers")
def subscribe_project_subscribers(sender, instance, created, raw=False, **kwargs):
    """Project subscribers (LONESTONEP-8) follow each new work item of the project, and are told of it.

    The subscription relies on upstream's order in the work item views (``app/views/issue/base.py`` and the other
    create paths): ``serializer.save()``, then ``issue_activity.delay(type="issue.activity.created",
    notification=True)``. The subscriptions therefore exist when the ``notifications`` task reads the
    work item subscribers, and upstream notifies them of the changes that follow. Upstream sends nothing
    for the creation itself: the fork's task does, once the work item is committed. ``Issue.objects.bulk_create``
    (demo data only) does not send ``post_save``. Re-check both on the next upstream merge.
    """
    if not created or raw:
        return
    subscribe_new_issue(instance)
    issue_id = str(instance.id)
    transaction.on_commit(lambda: notify_project_subscribers_of_new_issue.delay(issue_id))


@receiver(post_save, sender=ProjectMember, dispatch_uid="extended_remove_departed_project_subscriber")
def remove_departed_project_subscriber(sender, instance, created, raw=False, **kwargs):
    """A member who leaves the project, or is removed from it, is no longer a project subscriber (LONESTONEP-8).

    Upstream deactivates the membership (``is_active=False``) rather than deleting it. Coming back to
    the project does not make them a subscriber again: an admin decides.
    """
    if raw or instance.is_active:
        return
    remove_subscriber(instance.project_id, instance.member_id)


@receiver(post_save, sender=WorkspaceMember, dispatch_uid="extended_remove_departed_workspace_subscriber")
def remove_departed_workspace_subscriber(sender, instance, created, raw=False, **kwargs):
    """Same, for a member who leaves the workspace: upstream deactivates their project memberships with
    ``QuerySet.update()``, which sends no ``post_save`` for ``ProjectMember``."""
    if raw or instance.is_active:
        return
    ProjectSubscriber.objects.filter(
        project__workspace_id=instance.workspace_id, subscriber_id=instance.member_id
    ).delete(soft=False)
