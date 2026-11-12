# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Signal receivers of the fork, connected in ``ExtendedConfig.ready()``."""

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from plane.db.models import Issue
from plane.extended.services.project_subscribers import subscribe_new_issue
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
