# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Lonestone edition URL routes.

Add feature endpoints under this module (e.g. templates) so they stay
outside upstream `plane.app` / `plane.api` and avoid merge conflicts.
"""

urlpatterns: list = [
    # path("templates/", include("plane.lonestone.templates.urls")),
]
