# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.lonestone.models import ProjectTemplate, Template


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
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )


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
