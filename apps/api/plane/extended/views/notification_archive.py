# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers, status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.extended.services.notification_archive import NOTIFICATION_TYPES, archive_all_notifications


class NotificationArchiveAllSerializer(serializers.Serializer):
    """The inbox view to archive: its tab and filters."""

    types = serializers.ListField(
        child=serializers.ChoiceField(choices=NOTIFICATION_TYPES), required=False, default=list
    )
    unread_only = serializers.BooleanField(required=False, default=False)
    mentioned = serializers.BooleanField(required=False, default=False)


class NotificationArchiveAllEndpoint(BaseAPIView):
    """POST: archive every notification of the signed-in user's inbox view (LONESTONEP-14)."""

    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        serializer = NotificationArchiveAllSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        archived_count = archive_all_notifications(slug=slug, user=request.user, **serializer.validated_data)
        return Response({"archived_count": archived_count}, status=status.HTTP_200_OK)
