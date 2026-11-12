# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import serializers

from plane.extended.models import ProjectSubscriber


class ProjectSubscriberSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectSubscriber
        fields = ("id", "project_id", "subscriber_id", "created_by", "created_at")
        read_only_fields = fields
