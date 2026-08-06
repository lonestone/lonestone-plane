# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models import Issue, Label, Project, ProjectMember, State
from plane.extended.models import ProjectTemplate, Template
from plane.extended.services import apply_project_template


@pytest.mark.unit
@pytest.mark.django_db
class TestApplyProjectTemplate:
    def test_apply_copies_features_states_labels_and_work_items(self, workspace, create_user):
        template = Template.objects.create(
            workspace=workspace,
            name="Sprint kit",
            description="Reusable sprint setup",
            template_type=Template.TemplateType.PROJECT,
        )
        ProjectTemplate.objects.create(
            workspace=workspace,
            template=template,
            name="Sprint kit",
            description="",
            network=2,
            cycle_view=True,
            module_view=False,
            issue_views_view=True,
            page_view=False,
            intake_view=True,
            states=[
                {"name": "Ready", "color": "#3f76ff", "group": "unstarted", "sequence": 1000, "default": True},
                {"name": "Shipping", "color": "#16a34a", "group": "started", "sequence": 2000, "default": False},
            ],
            labels=[
                {"name": "backend", "color": "#858e96"},
                {"name": "frontend", "color": "#f59e0b"},
            ],
            work_items=[
                {"name": "Kickoff", "description_html": "<p>Start here</p>"},
                {"name": "Ship checklist", "description_html": "<p></p>"},
            ],
        )

        project = Project.objects.create(
            name="Fresh Project",
            identifier="FRESH",
            workspace=workspace,
            network=2,
            cycle_view=False,
            module_view=True,
            issue_views_view=False,
            page_view=True,
            intake_view=False,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20, workspace=workspace)
        State.objects.create(
            workspace=workspace,
            project=project,
            name="Old Default",
            color="#000000",
            group="backlog",
            sequence=1,
            default=True,
        )

        apply_project_template(
            template_id=str(template.id),
            project_id=str(project.id),
            user_id=str(create_user.id),
        )
        project.refresh_from_db()

        assert project.cycle_view is True
        assert project.module_view is False
        assert project.issue_views_view is True
        assert project.page_view is False
        assert project.intake_view is True

        state_names = set(
            State.objects.filter(project=project).exclude(group="triage").values_list("name", flat=True)
        )
        assert state_names == {"Ready", "Shipping"}
        assert "Old Default" not in state_names
        assert State.objects.filter(project=project, name="Ready", default=True).exists()

        assert set(Label.objects.filter(project=project).values_list("name", flat=True)) == {
            "backend",
            "frontend",
        }
        assert set(Issue.objects.filter(project=project).values_list("name", flat=True)) == {
            "Kickoff",
            "Ship checklist",
        }
        kickoff = Issue.objects.get(project=project, name="Kickoff")
        assert kickoff.description_html == "<p>Start here</p>"
        assert kickoff.state_id is not None

    def test_apply_sanitizes_work_item_description_html(self, workspace, create_user):
        template = Template.objects.create(
            workspace=workspace,
            name="XSS kit",
            template_type=Template.TemplateType.PROJECT,
        )
        ProjectTemplate.objects.create(
            workspace=workspace,
            template=template,
            name="XSS kit",
            description="",
            network=2,
            states=[{"name": "Todo", "color": "#3f76ff", "group": "unstarted", "sequence": 1000, "default": True}],
            work_items=[
                {
                    "name": "Poisoned",
                    "description_html": '<p>hi</p><script>alert("xss")</script><img src=x onerror=alert(1)>',
                }
            ],
        )
        project = Project.objects.create(name="Safe Project", identifier="SAFE", workspace=workspace, network=2)
        ProjectMember.objects.create(project=project, member=create_user, role=20, workspace=workspace)
        State.objects.create(
            workspace=workspace,
            project=project,
            name="Old",
            color="#000000",
            group="backlog",
            sequence=1,
            default=True,
        )

        apply_project_template(
            template_id=str(template.id),
            project_id=str(project.id),
            user_id=str(create_user.id),
        )

        issue = Issue.objects.get(project=project, name="Poisoned")
        assert "<script" not in (issue.description_html or "").lower()
        assert "onerror" not in (issue.description_html or "").lower()
        assert "hi" in (issue.description_html or "")
