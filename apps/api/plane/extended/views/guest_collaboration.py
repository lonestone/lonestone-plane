# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Project, ProjectMember, WorkspaceMember
from plane.extended.serializers import ProjectGuestCollaborationSerializer
from plane.extended.services.guest_collaboration import get_or_create_guest_collaboration


def _can_mutate_project(*, user, slug: str, project_id) -> bool:
    """Workspace admin or project admin may change guest collaboration settings."""
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


class ProjectGuestCollaborationEndpoint(BaseAPIView):
    """GET/PATCH guest collaboration settings for a project."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        if not Project.objects.filter(id=project_id, workspace__slug=slug).exists():
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        collab = get_or_create_guest_collaboration(project_id)
        return Response(
            ProjectGuestCollaborationSerializer(collab).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN])
    def patch(self, request, slug, project_id):
        if not Project.objects.filter(id=project_id, workspace__slug=slug).exists():
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        if not _can_mutate_project(user=request.user, slug=slug, project_id=project_id):
            return Response(
                {"error": "You don't have the required permissions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        collab = get_or_create_guest_collaboration(project_id)
        serializer = ProjectGuestCollaborationSerializer(collab, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
