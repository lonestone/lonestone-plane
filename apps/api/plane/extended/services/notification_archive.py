# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Archive every notification the inbox shows (LONESTONEP-14).

The selection copies upstream's ``NotificationViewSet.list``: keep them in step.
"""

from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from plane.db.models import Issue, IssueAssignee, IssueSubscriber, Notification, WorkspaceMember

NOTIFICATION_TYPES = ("assigned", "created", "subscribed")


def _type_filter(slug, user, types):
    """Same rules as upstream's ``type`` filter: the selected types add up, none selected keeps them all.

    ``None`` means the view is empty.
    """
    if not types:
        return Q()

    q_filters = Q()
    if "subscribed" in types:
        issue_ids = (
            IssueSubscriber.objects.filter(workspace__slug=slug, subscriber_id=user.id)
            .annotate(created=Exists(Issue.objects.filter(created_by=user, pk=OuterRef("issue_id"))))
            .annotate(assigned=Exists(IssueAssignee.objects.filter(pk=OuterRef("issue_id"), assignee=user)))
            .filter(created=False, assigned=False)
            .values_list("issue_id", flat=True)
        )
        q_filters |= Q(entity_identifier__in=issue_ids)
    if "assigned" in types:
        issue_ids = IssueAssignee.objects.filter(workspace__slug=slug, assignee_id=user.id).values_list(
            "issue_id", flat=True
        )
        q_filters |= Q(entity_identifier__in=issue_ids)
    if "created" in types:
        # Upstream lists nothing at all for a guest who selects "created".
        if WorkspaceMember.objects.filter(workspace__slug=slug, member=user, role__lt=15, is_active=True).exists():
            return None
        issue_ids = Issue.objects.filter(workspace__slug=slug, created_by=user).values_list("pk", flat=True)
        q_filters |= Q(entity_identifier__in=issue_ids)
    return q_filters


def archive_all_notifications(*, slug, user, types=(), unread_only=False, mentioned=False):
    """Archive the notifications of the inbox view and return how many were archived."""
    notifications = Notification.objects.filter(
        workspace__slug=slug,
        receiver=user,
        entity_name="issue",
        archived_at__isnull=True,
        snoozed_till__isnull=True,
    )
    if unread_only:
        notifications = notifications.filter(read_at__isnull=True)
    if mentioned:
        notifications = notifications.filter(sender__icontains="mentioned")
    else:
        notifications = notifications.exclude(sender__icontains="mentioned")

    type_filter = _type_filter(slug, user, types)
    if type_filter is None:
        return 0
    notifications = notifications.filter(type_filter)

    return notifications.update(archived_at=timezone.now(), updated_at=timezone.now(), updated_by=user)
