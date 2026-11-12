# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The signed-in user's one-time announcement about project subscribers (LONESTONEP-8)."""

from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.extended.services.announcements import (
    mark_project_subscribers_announcement_seen,
    project_subscribers_announcement,
)


class ProjectSubscribersAnnouncementEndpoint(BaseAPIView):
    """GET whether to show it and the projects it lists; POST once it has been read. Own data only."""

    def get(self, request):
        return Response(project_subscribers_announcement(request.user), status=status.HTTP_200_OK)

    def post(self, request):
        mark_project_subscribers_announcement_seen(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
