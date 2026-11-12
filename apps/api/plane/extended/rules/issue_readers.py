# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Who is told of a work item's changes (LONESTONEP-8).

In ``rules`` rather than ``services``: upstream's notification task imports it, as the serializers import
``guest_assignment`` (circular import otherwise).
"""

from __future__ import annotations

from uuid import UUID

from django.db.models import Q

from plane.app.permissions.base import ROLE
from plane.db.models import Issue, Project, ProjectMember


def issue_reader_ids(project_id: UUID | str, issue_id: UUID | str):
    """Active project members who can open the work item, as ``IssueViewSet.retrieve`` decides.

    Replaces the active project members in upstream's ``notifications``: a guest who cannot open the work
    item (not its author, "Guest access" off) is not told of it, however they came to follow it.
    """
    members = ProjectMember.objects.filter(project_id=project_id, is_active=True)
    if not Project.objects.filter(pk=project_id, guest_view_all_features=True).exists():
        author_id = Issue.all_objects.filter(pk=issue_id).values_list("created_by_id", flat=True).first()
        members = members.filter(~Q(role=ROLE.GUEST.value) | Q(member_id=author_id))
    return members.values_list("member_id", flat=True)
