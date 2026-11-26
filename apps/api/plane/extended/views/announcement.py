# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""The fork's announcements the signed-in user has seen."""

from rest_framework import status
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.extended.services.announcements import KEY_PATTERN, mark_announcement_seen, seen_announcements


class AnnouncementListEndpoint(BaseAPIView):
    def get(self, request):
        return Response({"seen": seen_announcements(request.user)}, status=status.HTTP_200_OK)


class AnnouncementSeenEndpoint(BaseAPIView):
    def post(self, request, key):
        if not KEY_PATTERN.match(key):
            return Response({"error": "Invalid announcement key"}, status=status.HTTP_400_BAD_REQUEST)
        mark_announcement_seen(request.user, key)
        return Response(status=status.HTTP_204_NO_CONTENT)
