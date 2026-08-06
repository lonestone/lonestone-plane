# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Apply a project template snapshot onto an existing project."""

from __future__ import annotations

import random

from django.db import transaction

from plane.db.models import DraftIssue, Issue, Label, Project, State
from plane.extended.models import ProjectTemplate, Template
from plane.utils.content_validator import validate_html_content


def _random_color() -> str:
    return f"#{random.randint(0, 0xFFFFFF):06x}"


def _sanitize_description_html(raw_html: str | None) -> str:
    """Match issue create/update serializers: sanitize before persisting Issue HTML."""
    _, _, sanitized_html = validate_html_content(raw_html or "<p></p>")
    return sanitized_html if sanitized_html is not None else "<p></p>"


def _project_has_work_items(project_id) -> bool:
    """Issues/drafts CASCADE when their state is hard-deleted — treat either as blocking."""
    return (
        Issue.objects.filter(project_id=project_id).exists()
        or DraftIssue.objects.filter(project_id=project_id).exists()
    )


def _normalize_state_payloads(states: list) -> list[dict]:
    payloads = []
    for state in states:
        if not isinstance(state, dict) or not state.get("name"):
            continue
        payloads.append(
            {
                "name": str(state["name"])[:255],
                "color": state.get("color") or _random_color(),
                "group": state.get("group", "backlog"),
                "sequence": state.get("sequence", 15000),
                "default": bool(state.get("default", False)),
            }
        )
    if payloads and not any(state["default"] for state in payloads):
        payloads[0]["default"] = True
    return payloads


def _apply_project_states(*, project: Project, states: list) -> None:
    """Replace states only when safe; otherwise upsert by name (never cascade-delete issues)."""
    payloads = _normalize_state_payloads(states)
    if not payloads:
        return

    existing_qs = State.objects.filter(project_id=project.id).exclude(group="triage")

    if not _project_has_work_items(project.id):
        for existing in existing_qs:
            existing.delete(soft=False)
        State.objects.bulk_create(
            [
                State(
                    workspace_id=project.workspace_id,
                    project_id=project.id,
                    name=payload["name"],
                    color=payload["color"],
                    group=payload["group"],
                    sequence=payload["sequence"],
                    default=payload["default"],
                )
                for payload in payloads
            ]
        )
        return

    # Non-empty project: match Plane's "only empty states can be deleted" invariant.
    existing_by_name = {state.name.lower(): state for state in existing_qs}
    default_name = next((payload["name"] for payload in payloads if payload["default"]), None)

    for payload in payloads:
        key = payload["name"].lower()
        existing = existing_by_name.get(key)
        if existing is None:
            created = State.objects.create(
                workspace_id=project.workspace_id,
                project_id=project.id,
                name=payload["name"],
                color=payload["color"],
                group=payload["group"],
                sequence=payload["sequence"],
                default=False,
            )
            existing_by_name[key] = created
            continue

        existing.color = payload["color"]
        existing.group = payload["group"]
        existing.sequence = payload["sequence"]
        existing.save(update_fields=["color", "group", "sequence", "updated_at"])

    if default_name:
        State.objects.filter(project_id=project.id).exclude(group="triage").update(default=False)
        State.objects.filter(project_id=project.id, name=default_name).exclude(group="triage").update(default=True)


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
        _apply_project_states(project=project, states=snapshot.states)

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
