# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.extended.serializers import BulkUpdateValidationError, IssueBulkUpdateSerializer
from plane.extended.services import bulk_update_issues
from plane.utils.host import base_host


class ProjectIssueBulkUpdateEndpoint(BaseAPIView):
    """POST: apply one or more properties to several work items of a project."""

    # The permission check runs first: an unknown project and a project the caller cannot access
    # both answer 403, so the endpoint does not reveal which project ids exist.
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], allow_collaborating_guest=True)
    def post(self, request, slug, project_id):
        try:
            serializer = IssueBulkUpdateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            result = bulk_update_issues(
                slug=slug,
                project_id=project_id,
                issue_ids=serializer.validated_data["issue_ids"],
                properties=serializer.validated_data["properties"],
                actor=request.user,
                origin=base_host(request=request, is_app=True),
            )
        except BulkUpdateValidationError as error:
            return Response({"error": error.message, "code": error.code}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)
