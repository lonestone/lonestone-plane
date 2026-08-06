# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models import Issue, Label, Project, ProjectMember, State, Workspace
from plane.extended.models import ProjectTemplate, Template
from plane.extended.services import apply_project_template
from plane.extended.serializers import ProjectTemplateSerializer


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

    def test_apply_ignores_snapshot_from_another_workspace(self, workspace, create_user):
        other_workspace = Workspace.objects.create(
            name="Other Workspace",
            owner=create_user,
            slug="other-workspace",
        )
        template = Template.objects.create(
            workspace=workspace,
            name="Local template",
            template_type=Template.TemplateType.PROJECT,
        )
        # Simulate a poisoned linkage: snapshot points at this template but belongs
        # to a different workspace (e.g. after a client-controlled template FK rewrite).
        ProjectTemplate.objects.create(
            workspace=other_workspace,
            template=template,
            name="Foreign snapshot",
            description="",
            network=2,
            cycle_view=False,
            module_view=False,
            states=[
                {"name": "Injected", "color": "#ff0000", "group": "unstarted", "sequence": 1000, "default": True}
            ],
            work_items=[{"name": "Injected item", "description_html": "<p>nope</p>"}],
        )
        project = Project.objects.create(
            name="Target",
            identifier="TGT",
            workspace=workspace,
            network=2,
            cycle_view=True,
            module_view=True,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20, workspace=workspace)
        State.objects.create(
            workspace=workspace,
            project=project,
            name="Keep",
            color="#000000",
            group="backlog",
            sequence=1,
            default=True,
        )

        with pytest.raises(ProjectTemplate.DoesNotExist):
            apply_project_template(
                template_id=str(template.id),
                project_id=str(project.id),
                user_id=str(create_user.id),
            )

        project.refresh_from_db()
        assert project.cycle_view is True
        assert project.module_view is True
        assert not Issue.objects.filter(project=project).exists()
        assert set(State.objects.filter(project=project).values_list("name", flat=True)) == {"Keep"}

    def test_apply_does_not_cascade_delete_existing_issues(self, workspace, create_user):
        template = Template.objects.create(
            workspace=workspace,
            name="States kit",
            template_type=Template.TemplateType.PROJECT,
        )
        ProjectTemplate.objects.create(
            workspace=workspace,
            template=template,
            name="States kit",
            description="",
            network=2,
            cycle_view=False,
            states=[
                {"name": "Ready", "color": "#3f76ff", "group": "unstarted", "sequence": 1000, "default": True},
                {"name": "Done", "color": "#16a34a", "group": "completed", "sequence": 2000, "default": False},
            ],
            work_items=[{"name": "Seeded", "description_html": "<p></p>"}],
        )
        project = Project.objects.create(
            name="Busy Project",
            identifier="BUSY",
            workspace=workspace,
            network=2,
            cycle_view=True,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20, workspace=workspace)
        old_state = State.objects.create(
            workspace=workspace,
            project=project,
            name="In Progress",
            color="#000000",
            group="started",
            sequence=1,
            default=True,
        )
        existing_issue = Issue.objects.create(
            workspace=workspace,
            project=project,
            name="Keep me",
            state=old_state,
            created_by=create_user,
        )

        apply_project_template(
            template_id=str(template.id),
            project_id=str(project.id),
            user_id=str(create_user.id),
        )

        existing_issue.refresh_from_db()
        assert Issue.objects.filter(id=existing_issue.id).exists()
        assert existing_issue.state_id == old_state.id
        assert State.objects.filter(project=project, name="In Progress").exists()
        assert State.objects.filter(project=project, name="Ready", default=True).exists()
        assert State.objects.filter(project=project, name="Done").exists()
        assert Issue.objects.filter(project=project, name="Seeded").exists()
        project.refresh_from_db()
        assert project.cycle_view is False


@pytest.mark.unit
@pytest.mark.django_db
class TestProjectTemplateSerializerWorkspaceIsolation:
    def test_template_and_workspace_are_read_only(self, workspace):
        template = Template.objects.create(
            workspace=workspace,
            name="Locked",
            template_type=Template.TemplateType.PROJECT,
        )
        snapshot = ProjectTemplate.objects.create(
            workspace=workspace,
            template=template,
            name="Locked",
            description="",
            network=2,
        )
        serializer = ProjectTemplateSerializer(
            snapshot,
            data={"template": None, "workspace": None, "name": "Still locked"},
            partial=True,
        )
        assert serializer.is_valid(), serializer.errors
        updated = serializer.save()
        assert updated.template_id == template.id
        assert updated.workspace_id == workspace.id
        assert updated.name == "Still locked"
