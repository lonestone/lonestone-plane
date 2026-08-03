# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import transaction
from django.db.models import Prefetch
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Project, ProjectMember, Workspace, WorkspaceMember
from plane.lonestone.models import ProjectTemplate, Template
from plane.lonestone.serializers import (
    ProjectTemplateDataSerializer,
    ProjectTemplateSerializer,
    TemplateSerializer,
)
from plane.lonestone.services import apply_project_template, build_project_template_snapshot


def _can_mutate_project(*, user, slug: str, project_id) -> bool:
    """Match ProjectViewSet.partial_update: workspace admin or project admin."""
    if WorkspaceMember.objects.filter(
        member=user,
        workspace__slug=slug,
        role=ROLE.ADMIN.value,
        is_active=True,
    ).exists():
        return True

    return ProjectMember.objects.filter(
        member=user,
        workspace__slug=slug,
        project_id=project_id,
        role=ROLE.ADMIN.value,
        is_active=True,
    ).exists()


class ProjectTemplateEndpoint(BaseAPIView):
    """CRUD for workspace project templates under `/api/lonestone/`."""

    def _project_templates_qs(self, slug: str):
        return Template.objects.filter(
            workspace__slug=slug,
            template_type=Template.TemplateType.PROJECT,
        ).prefetch_related(
            Prefetch(
                "project_templates",
                queryset=ProjectTemplate.objects.filter(workspace__slug=slug),
                to_attr="template_data",
            )
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, pk=None):
        if pk:
            template = self._project_templates_qs(slug).filter(pk=pk).first()
            if template is None:
                return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
            return Response(
                ProjectTemplateDataSerializer(template).data,
                status=status.HTTP_200_OK,
            )

        templates = self._project_templates_qs(slug)
        return Response(
            ProjectTemplateDataSerializer(templates, many=True).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        template_data = dict(request.data.get("template_data") or {})
        project_id = request.data.get("project_id")

        if project_id:
            project = (
                Project.objects.filter(id=project_id, workspace=workspace)
                .select_related("cover_image_asset")
                .first()
            )
            if project is None:
                return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
            if not _can_mutate_project(user=request.user, slug=slug, project_id=project_id):
                return Response(
                    {"error": "You don't have the required permissions."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            # Snapshot is the base. Drop empty list/dict overrides so clients cannot
            # accidentally wipe states/labels/work_items when also sending project_id.
            overrides = {
                key: value
                for key, value in template_data.items()
                if value not in (None, "", [], {})
            }
            template_data = {**build_project_template_snapshot(project), **overrides}

        name = (request.data.get("name") or template_data.get("name") or "").strip()
        if not name:
            return Response({"name": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            template = Template.objects.create(
                workspace=workspace,
                name=name,
                description=request.data.get("description") or template_data.get("description") or "",
                description_html=request.data.get("description_html", "<p></p>"),
                cover_image=request.data.get("cover_image") or template_data.get("cover_image") or "",
                template_type=Template.TemplateType.PROJECT,
            )

            payload = {
                **template_data,
                "template": str(template.id),
                "workspace": str(workspace.id),
                "name": template_data.get("name") or template.name,
            }
            serializer = ProjectTemplateSerializer(data=payload)
            if not serializer.is_valid():
                transaction.set_rollback(True)
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

            serializer.save(workspace=workspace, template=template)

        template = self._project_templates_qs(slug).filter(pk=template.id).first()
        return Response(
            ProjectTemplateDataSerializer(template).data,
            status=status.HTTP_201_CREATED,
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug, pk):
        template = Template.objects.filter(
            workspace__slug=slug,
            template_type=Template.TemplateType.PROJECT,
            pk=pk,
        ).first()
        if template is None:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)

        data = request.data.copy()
        template_data = data.pop("template_data", None)

        template_serializer = TemplateSerializer(template, data=data, partial=True)
        if not template_serializer.is_valid():
            return Response(template_serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        template_serializer.save()

        if template_data is not None:
            project_template = ProjectTemplate.objects.filter(workspace__slug=slug, template_id=pk).first()
            if project_template is None:
                return Response({"error": "Project template snapshot not found"}, status=status.HTTP_404_NOT_FOUND)

            project_serializer = ProjectTemplateSerializer(project_template, data=template_data, partial=True)
            if not project_serializer.is_valid():
                return Response(project_serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            project_serializer.save()

        template = self._project_templates_qs(slug).filter(pk=pk).first()
        return Response(
            ProjectTemplateDataSerializer(template).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk):
        template = Template.objects.filter(
            workspace__slug=slug,
            template_type=Template.TemplateType.PROJECT,
            pk=pk,
        ).first()
        if template is None:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)

        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectTemplateApplyEndpoint(BaseAPIView):
    """Apply a project template snapshot to an existing project."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug, pk):
        project_id = request.data.get("project_id")
        if not project_id:
            return Response({"error": "project_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        template = Template.objects.filter(
            workspace__slug=slug,
            template_type=Template.TemplateType.PROJECT,
            pk=pk,
        ).first()
        if template is None:
            return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)

        if not Project.objects.filter(id=project_id, workspace__slug=slug).exists():
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        if not _can_mutate_project(user=request.user, slug=slug, project_id=project_id):
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            apply_project_template(
                template_id=str(pk),
                project_id=str(project_id),
                user_id=str(request.user.id) if request.user else None,
            )
        except ProjectTemplate.DoesNotExist:
            return Response({"error": "Project template snapshot not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response({"project_id": str(project_id)}, status=status.HTTP_200_OK)
