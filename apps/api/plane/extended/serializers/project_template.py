# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.extended.models import ProjectTemplate, Template
from plane.utils.content_validator import validate_html_content


def _sanitize_html_field(value: str | None) -> str | None:
    if not value:
        return value
    is_valid, _error_msg, sanitized_html = validate_html_content(value)
    if not is_valid:
        raise serializers.ValidationError({"error": "html content is not valid"})
    return sanitized_html if sanitized_html is not None else value


def _sanitize_work_items(work_items):
    if not isinstance(work_items, list):
        return work_items

    sanitized_items = []
    for item in work_items:
        if not isinstance(item, dict):
            sanitized_items.append(item)
            continue
        next_item = dict(item)
        if next_item.get("description_html"):
            next_item["description_html"] = _sanitize_html_field(str(next_item["description_html"]))
        sanitized_items.append(next_item)
    return sanitized_items


class TemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Template
        fields = (
            "id",
            "name",
            "description",
            "description_html",
            "description_stripped",
            "template_type",
            "cover_image",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )
        read_only_fields = (
            "id",
            "description_stripped",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )

    def validate(self, attrs):
        if "description_html" in attrs and attrs["description_html"]:
            attrs["description_html"] = _sanitize_html_field(str(attrs["description_html"]))
        return attrs


class ProjectTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectTemplate
        fields = (
            "id",
            "template",
            "workspace",
            "name",
            "description",
            "description_text",
            "description_html",
            "network",
            "default_assignee",
            "project_lead",
            "logo_props",
            "cover_image",
            "module_view",
            "cycle_view",
            "issue_views_view",
            "page_view",
            "intake_view",
            "is_time_tracking_enabled",
            "is_issue_type_enabled",
            "guest_view_all_features",
            "timezone",
            "archive_in",
            "close_in",
            "states",
            "labels",
            "estimates",
            "workitem_types",
            "members",
            "intake_settings",
            "work_items",
            "start_date",
            "target_date",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )
        read_only_fields = (
            "id",
            # Clients must not re-point snapshot ↔ template across workspaces.
            "template",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )

    def validate(self, attrs):
        if "work_items" in attrs:
            attrs["work_items"] = _sanitize_work_items(attrs["work_items"])

        template = attrs.get("template") or getattr(self.instance, "template", None)
        workspace = attrs.get("workspace") or getattr(self.instance, "workspace", None)
        if template is not None and workspace is not None:
            template_workspace_id = getattr(template, "workspace_id", None) or getattr(template, "workspace", None)
            workspace_id = getattr(workspace, "id", workspace)
            if template_workspace_id is not None and str(template_workspace_id) != str(workspace_id):
                raise serializers.ValidationError(
                    {"template": ["Template must belong to the same workspace as the snapshot."]}
                )
        return attrs


class ProjectTemplateDataSerializer(TemplateSerializer):
    """Template row with nested project snapshot payload (EE-compatible shape)."""

    template_data = serializers.SerializerMethodField()

    class Meta(TemplateSerializer.Meta):
        fields = (*TemplateSerializer.Meta.fields, "template_data")

    def get_template_data(self, obj):
        snapshots = getattr(obj, "template_data", None)
        if snapshots is None:
            snapshots = list(obj.project_templates.all())
        return ProjectTemplateSerializer(snapshots, many=True).data
