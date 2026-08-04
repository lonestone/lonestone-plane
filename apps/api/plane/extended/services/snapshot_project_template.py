# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Build a ProjectTemplate snapshot payload from an existing project."""

from __future__ import annotations

from plane.db.models import Issue, Label, Project, State

# Cap seed work items so template rows stay small.
MAX_SEED_WORK_ITEMS = 50


def build_project_template_snapshot(project: Project) -> dict:
    """Serialize project config into the shape expected by ProjectTemplateSerializer."""
    states = list(
        State.objects.filter(project_id=project.id)
        .exclude(group="triage")
        .order_by("sequence")
        .values("name", "color", "group", "sequence", "default")
    )
    labels = list(
        Label.objects.filter(project_id=project.id)
        .order_by("sort_order")
        .values("name", "color", "description", "sort_order")
    )
    work_items = [
        {
            "name": issue.name,
            "description_html": issue.description_html or "<p></p>",
        }
        for issue in Issue.objects.filter(project_id=project.id)
        .order_by("created_at")[:MAX_SEED_WORK_ITEMS]
        .only("name", "description_html")
    ]

    cover_image = ""
    if getattr(project, "cover_image_asset", None) is not None:
        cover_image = project.cover_image_asset.asset_url or ""
    elif project.cover_image:
        cover_image = project.cover_image

    return {
        "name": project.name,
        "description": project.description or "",
        "description_text": project.description_text,
        "description_html": project.description_html,
        "network": project.network,
        "default_assignee": {"id": str(project.default_assignee_id)} if project.default_assignee_id else {},
        "project_lead": {"id": str(project.project_lead_id)} if project.project_lead_id else {},
        "logo_props": project.logo_props or {},
        "cover_image": cover_image or "",
        "module_view": project.module_view,
        "cycle_view": project.cycle_view,
        "issue_views_view": project.issue_views_view,
        "page_view": project.page_view,
        "intake_view": project.intake_view,
        "is_time_tracking_enabled": project.is_time_tracking_enabled,
        "is_issue_type_enabled": project.is_issue_type_enabled,
        "guest_view_all_features": project.guest_view_all_features,
        "timezone": project.timezone or "UTC",
        "archive_in": project.archive_in,
        "close_in": project.close_in,
        "states": list(states),
        "labels": list(labels),
        "work_items": work_items,
        "estimates": {},
        "workitem_types": [],
        "members": [],
        "intake_settings": {},
    }
