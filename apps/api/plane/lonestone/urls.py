# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Lonestone edition URL routes."""

from django.urls import path

from plane.lonestone.views import ProjectTemplateEndpoint

urlpatterns = [
    path(
        "workspaces/<str:slug>/project-templates/",
        ProjectTemplateEndpoint.as_view(),
        name="lonestone-project-templates",
    ),
    path(
        "workspaces/<str:slug>/project-templates/<uuid:pk>/",
        ProjectTemplateEndpoint.as_view(),
        name="lonestone-project-template-detail",
    ),
]
