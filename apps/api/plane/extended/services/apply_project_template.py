# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Apply a project template snapshot onto an existing project."""

from __future__ import annotations

import random

from django.db import transaction

from plane.db.models import Issue, Label, Project, State
from plane.extended.models import ProjectTemplate, Template
from plane.utils.content_validator import validate_html_content


def _random_color() -> str:
    return f"#{random.randint(0, 0xFFFFFF):06x}"


def _sanitize_description_html(raw_html: str | None) -> str:
    """Match issue create/update serializers: sanitize before persisting Issue HTML."""
    _, _, sanitized_html = validate_html_content(raw_html or "<p></p>")
    return sanitized_html if sanitized_html is not None else "<p></p>"


@transaction.atomic
def apply_project_template(*, template_id: str, project_id: str, user_id: str | None = None) -> Project:
    template = Template.objects.select_related("workspace").get(
        id=template_id,
        template_type=Template.TemplateType.PROJECT,
    )
    # Always bind snapshot to the template's workspace so a re-linked FK cannot
    # pull configuration from another workspace into this apply.
    snapshot = ProjectTemplate.objects.filter(
        template_id=template.id,
        workspace_id=template.workspace_id,
    ).first()
    if snapshot is None:
        raise ProjectTemplate.DoesNotExist("Project template snapshot not found")

    project = Project.objects.select_for_update().get(id=project_id, workspace_id=template.workspace_id)

    project.module_view = snapshot.module_view
    project.cycle_view = snapshot.cycle_view
    project.issue_views_view = snapshot.issue_views_view
    project.page_view = snapshot.page_view
    project.intake_view = snapshot.intake_view
    project.is_time_tracking_enabled = snapshot.is_time_tracking_enabled
    project.is_issue_type_enabled = snapshot.is_issue_type_enabled
    project.guest_view_all_features = snapshot.guest_view_all_features
    project.archive_in = snapshot.archive_in
    project.close_in = snapshot.close_in
    if snapshot.timezone:
        project.timezone = snapshot.timezone
    project.save()

    if isinstance(snapshot.labels, list) and snapshot.labels:
        Label.objects.bulk_create(
            [
                Label(
                    workspace_id=project.workspace_id,
                    project_id=project.id,
                    name=label.get("name", "Label")[:255],
                    color=label.get("color") or _random_color(),
                    sort_order=random.randint(0, 65535),
                )
                for label in snapshot.labels
                if isinstance(label, dict) and label.get("name")
            ],
            ignore_conflicts=True,
        )

    if isinstance(snapshot.states, list) and snapshot.states:
        for existing in State.objects.filter(project_id=project.id).exclude(group="triage"):
            existing.delete(soft=False)
        State.objects.bulk_create(
            [
                State(
                    workspace_id=project.workspace_id,
                    project_id=project.id,
                    name=state.get("name", "State")[:255],
                    color=state.get("color") or _random_color(),
                    group=state.get("group", "backlog"),
                    sequence=state.get("sequence", 15000),
                    default=bool(state.get("default", False)),
                )
                for state in snapshot.states
                if isinstance(state, dict) and state.get("name")
            ]
        )

    if isinstance(snapshot.work_items, list) and snapshot.work_items:
        default_state = State.objects.filter(project_id=project.id, default=True).first()
        if default_state is None:
            default_state = State.objects.filter(project_id=project.id).exclude(group="triage").first()
        for item in snapshot.work_items:
            if not isinstance(item, dict) or not item.get("name"):
                continue
            Issue.objects.create(
                workspace_id=project.workspace_id,
                project_id=project.id,
                name=str(item["name"])[:255],
                description_html=_sanitize_description_html(item.get("description_html")),
                state_id=default_state.id if default_state else None,
                created_by_id=user_id,
                updated_by_id=user_id,
            )

    return project
