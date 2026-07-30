# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Lonestone template models.

Mirrors Plane EE's Template / ProjectTemplate shape, but lives in
`plane.lonestone` with namespaced tables so upstream CE/EE merges stay clean.
"""

from __future__ import annotations

import pytz
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from plane.db.models import BaseModel, WorkspaceBaseModel
from plane.utils.html_processor import strip_tags


def empty_dict() -> dict:
    return {}


def empty_list() -> list:
    return []


class Template(WorkspaceBaseModel):
    """Workspace-scoped template metadata (project / work item / page)."""

    class TemplateType(models.TextChoices):
        WORKITEM = "workitem", "Workitem"
        PAGE = "page", "Page"
        PROJECT = "project", "Project"

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    description_html = models.TextField(blank=True, default="<p></p>")
    description_stripped = models.TextField(blank=True, null=True)
    template_type = models.CharField(
        max_length=30,
        choices=TemplateType.choices,
        default=TemplateType.PROJECT,
        verbose_name="Template Type",
    )
    cover_image = models.TextField(blank=True, default="")

    class Meta:
        db_table = "lonestone_templates"
        verbose_name = "Template"
        verbose_name_plural = "Templates"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["name", "workspace", "template_type"],
                condition=models.Q(deleted_at__isnull=True),
                name="lonestone_template_unique_name_workspace_type",
            )
        ]

    def save(self, *args, **kwargs):
        self.description_stripped = (
            None
            if self.description_html in ("", None)
            else strip_tags(self.description_html)
        )
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class ProjectTemplate(BaseModel):
    """Snapshot of project settings applied when creating a project from a template."""

    NETWORK_CHOICES = ((0, "Secret"), (2, "Public"))
    TIMEZONE_CHOICES = tuple(zip(pytz.all_timezones, pytz.all_timezones, strict=False))

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="lonestone_project_templates",
    )
    template = models.ForeignKey(
        Template,
        on_delete=models.CASCADE,
        related_name="project_templates",
        null=True,
        blank=True,
    )

    # Default project basics (prefill on create)
    name = models.CharField(max_length=255, verbose_name="Project Name")
    description = models.TextField(verbose_name="Project Description", blank=True)
    description_text = models.JSONField(verbose_name="Project Description RT", blank=True, null=True)
    description_html = models.JSONField(verbose_name="Project Description HTML", blank=True, null=True)
    network = models.PositiveSmallIntegerField(default=2, choices=NETWORK_CHOICES)
    default_assignee = models.JSONField(default=empty_dict)
    project_lead = models.JSONField(default=empty_dict)
    logo_props = models.JSONField(default=empty_dict)
    cover_image = models.TextField(blank=True, default="")

    # Feature toggles
    module_view = models.BooleanField(default=True)
    cycle_view = models.BooleanField(default=True)
    issue_views_view = models.BooleanField(default=True)
    page_view = models.BooleanField(default=True)
    intake_view = models.BooleanField(default=False)
    is_time_tracking_enabled = models.BooleanField(default=False)
    is_issue_type_enabled = models.BooleanField(default=False)
    guest_view_all_features = models.BooleanField(default=False)

    timezone = models.CharField(max_length=255, default="UTC", choices=TIMEZONE_CHOICES)

    archive_in = models.IntegerField(default=0, validators=[MinValueValidator(0), MaxValueValidator(12)])
    close_in = models.IntegerField(default=0, validators=[MinValueValidator(0), MaxValueValidator(12)])

    # Snapshot payloads applied when materializing a project
    states = models.JSONField(default=empty_list)
    labels = models.JSONField(default=empty_list)
    estimates = models.JSONField(default=empty_dict)
    workitem_types = models.JSONField(default=empty_list)
    members = models.JSONField(default=empty_list)
    intake_settings = models.JSONField(default=empty_dict)
    work_items = models.JSONField(
        default=empty_list,
        help_text="Optional seed work items created when a project is started from this template.",
    )

    start_date = models.DateTimeField(null=True, blank=True)
    target_date = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "lonestone_project_templates"
        verbose_name = "Project Template"
        verbose_name_plural = "Project Templates"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["name", "workspace"],
                condition=models.Q(deleted_at__isnull=True),
                name="lonestone_project_template_unique_name_workspace",
            )
        ]

    def __str__(self) -> str:
        return self.name
