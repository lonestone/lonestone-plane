# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""One-time announcement to project admins (LONESTONEP-8): they now follow their projects' new work items."""

from __future__ import annotations

from django.utils import timezone

from plane.app.permissions.base import ROLE
from plane.db.models import ProjectMember
from plane.extended.models import ProjectSubscriber, UserAnnouncement

PROJECT_SUBSCRIBERS = "project_subscribers"


def subscribed_admin_projects(user) -> list[dict]:
    """Projects where the user is an active admin and has not removed themselves from the subscribers."""
    opted_out = ProjectSubscriber.objects.filter(subscriber=user, is_subscribed=False).values_list(
        "project_id", flat=True
    )
    memberships = (
        ProjectMember.objects.filter(
            member=user,
            is_active=True,
            role=ROLE.ADMIN.value,
            project__archived_at__isnull=True,
            project__deleted_at__isnull=True,
        )
        .exclude(project_id__in=opted_out)
        .select_related("project", "project__workspace")
        .order_by("project__workspace__name", "project__name")
    )
    return [
        {
            "project_id": str(membership.project_id),
            "project_name": membership.project.name,
            "workspace_slug": membership.project.workspace.slug,
            "workspace_name": membership.project.workspace.name,
        }
        for membership in memberships
    ]


def project_subscribers_announcement(user) -> dict:
    """``show`` when the announcement waits for the user and they still follow at least one project."""
    pending = UserAnnouncement.objects.filter(user=user, key=PROJECT_SUBSCRIBERS, seen_at__isnull=True).exists()
    projects = subscribed_admin_projects(user) if pending else []
    return {"show": bool(projects), "projects": projects}


def mark_project_subscribers_announcement_seen(user) -> None:
    UserAnnouncement.objects.filter(user=user, key=PROJECT_SUBSCRIBERS, seen_at__isnull=True).update(
        seen_at=timezone.now()
    )
