# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.extended.models import ProjectGuestCollaboration


class ProjectGuestCollaborationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectGuestCollaboration
        fields = ("id", "project_id", "guest_can_collaborate", "created_at", "updated_at")
        read_only_fields = ("id", "project_id", "created_at", "updated_at")
