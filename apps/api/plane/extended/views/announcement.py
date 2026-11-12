# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The signed-in user's one-time announcements."""

from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.extended.services.announcements import ANNOUNCEMENTS, mark_announcement_seen, pending_announcements


class AnnouncementListEndpoint(BaseAPIView):
    def get(self, request):
        return Response(pending_announcements(request.user), status=status.HTTP_200_OK)


class AnnouncementSeenEndpoint(BaseAPIView):
    def post(self, request, key):
        if key not in ANNOUNCEMENTS:
            return Response({"error": "Unknown announcement"}, status=status.HTTP_404_NOT_FOUND)
        mark_announcement_seen(request.user, key)
        return Response(status=status.HTTP_204_NO_CONTENT)
