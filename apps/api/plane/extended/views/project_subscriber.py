# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Project subscribers (LONESTONEP-8): list, add and remove."""

from uuid import UUID

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Project
from plane.extended.permissions import can_manage_project
from plane.extended.serializers import ProjectSubscriberSerializer
from plane.extended.services.project_subscribers import (
    NOT_ELIGIBLE,
    SubscriberNotEligible,
    add_subscriber,
    remove_subscriber,
    subscriber_entries,
)

FORBIDDEN = {"error": "You don't have the required permissions."}


def _project(slug, project_id):
    return Project.objects.filter(id=project_id, workspace__slug=slug).first()


class ProjectSubscriberEndpoint(BaseAPIView):
    """GET the project subscribers; POST one (project or workspace admins)."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        if _project(slug, project_id) is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(subscriber_entries(project_id), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        project = _project(slug, project_id)
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_project(user=request.user, slug=slug, project_id=project_id):
            return Response(FORBIDDEN, status=status.HTTP_403_FORBIDDEN)

        try:
            subscriber_id = UUID(str(request.data.get("subscriber_id")))
        except ValueError:
            return Response({"subscriber_id": ["A valid UUID is required."]}, status=status.HTTP_400_BAD_REQUEST)

        try:
            subscriber, created = add_subscriber(project, subscriber_id)
        except SubscriberNotEligible:
            return Response({"error": NOT_ELIGIBLE}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            ProjectSubscriberSerializer(subscriber).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ProjectSubscriberDetailEndpoint(BaseAPIView):
    """DELETE a project subscriber (project or workspace admins)."""

    @allow_permission([ROLE.ADMIN])
    def delete(self, request, slug, project_id, subscriber_id):
        if _project(slug, project_id) is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_project(user=request.user, slug=slug, project_id=project_id):
            return Response(FORBIDDEN, status=status.HTTP_403_FORBIDDEN)
        remove_subscriber(project_id, subscriber_id)
        return Response(status=status.HTTP_204_NO_CONTENT)
