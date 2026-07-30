# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import transaction
from django.db.models import Prefetch
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Project, Workspace
from plane.lonestone.models import ProjectTemplate, Template
from plane.lonestone.serializers import (
    ProjectTemplateDataSerializer,
    ProjectTemplateSerializer,
    TemplateSerializer,
)
from plane.lonestone.services import apply_project_template


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
        template_data = request.data.get("template_data") or {}

        with transaction.atomic():
            template = Template.objects.create(
                workspace=workspace,
                name=request.data.get("name", ""),
                description=request.data.get("description", ""),
                description_html=request.data.get("description_html", "<p></p>"),
                cover_image=request.data.get("cover_image", ""),
                template_type=Template.TemplateType.PROJECT,
            )

            payload = {
                **template_data,
                "template": str(template.id),
                "workspace": str(workspace.id),
                "name": template_data.get("name") or request.data.get("name", ""),
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

        try:
            apply_project_template(
                template_id=str(pk),
                project_id=str(project_id),
                user_id=str(request.user.id) if request.user else None,
            )
        except ProjectTemplate.DoesNotExist:
            return Response({"error": "Project template snapshot not found"}, status=status.HTTP_404_NOT_FOUND)

        return Response({"project_id": str(project_id)}, status=status.HTTP_200_OK)
