/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Trash2 } from "lucide-react";
import useSWR from "swr";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input, TextArea } from "@plane/ui";
import type { TProjectTemplate } from "@plane/types";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import { useProjectTemplates } from "@/plane-web/hooks/store/use-project-templates";

type Props = {
  workspaceSlug: string;
  header: React.ReactNode;
};

export const ProjectTemplatesSettingsRoot = observer(function ProjectTemplatesSettingsRoot(props: Props) {
  const { workspaceSlug, header } = props;
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const { getProjectById } = useProject();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { templates, loader, fetchTemplates, createTemplate, deleteTemplate } = useProjectTemplates();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceProjectId, setSourceProjectId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canManage = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const canCreate = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  useSWR(canManage ? `LONESTONE_PROJECT_TEMPLATES_${workspaceSlug}` : null, () => fetchTemplates(workspaceSlug));

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("workspace_settings.settings.templates.title")}`
    : undefined;

  const handleSourceProjectChange = (projectId: string) => {
    setSourceProjectId(projectId);
    const project = getProjectById(projectId);
    if (!name.trim() && project?.name) {
      setName(project.name);
    }
    if (!description.trim() && project?.description) {
      setDescription(project.description);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("templates.settings.form.project.template.name.validation.required"),
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await createTemplate(workspaceSlug, {
        name: name.trim(),
        description: description.trim(),
        project_id: sourceProjectId ?? undefined,
        template_data: sourceProjectId
          ? {
              name: name.trim(),
              description: description.trim(),
            }
          : {
              name: name.trim(),
              description: description.trim(),
              network: 2,
              states: [],
              labels: [],
              work_items: [],
            },
      });
      setName("");
      setDescription("");
      setSourceProjectId(null);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("templates.settings.create_template.label"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("something_went_wrong_please_try_again"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (template: TProjectTemplate) => {
    try {
      await deleteTemplate(workspaceSlug, template.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("success"), message: template.name });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("something_went_wrong_please_try_again"),
      });
    }
  };

  if (workspaceUserInfo && !canManage) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={header}>
      <PageHead title={pageTitle} />
      <div className="w-full space-y-6">
        <SettingsHeading
          title={t("workspace_settings.settings.templates.title")}
          description={t("workspace_settings.settings.templates.description")}
        />

        {canCreate && (
          <div className="space-y-3 rounded-lg border border-subtle p-4">
            <h3 className="text-sm font-medium text-primary">{t("templates.settings.new_project_template")}</h3>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-secondary">
                {t("templates.settings.form.project.source_project.label")}
              </p>
              <ProjectDropdown
                value={sourceProjectId}
                onChange={handleSourceProjectChange}
                multiple={false}
                buttonVariant="border-with-text"
                placeholder={t("templates.settings.form.project.source_project.placeholder")}
              />
              <p className="text-xs text-tertiary">{t("templates.settings.form.project.source_project.helper")}</p>
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("templates.settings.form.project.template.name.placeholder")}
              className="w-full"
            />
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("templates.settings.form.project.template.description.placeholder")}
              className="min-h-20 w-full"
            />
            <Button variant="primary" size="sm" onClick={handleCreate} disabled={isSubmitting}>
              {t("templates.settings.form.project.button.create")}
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-primary">{t("templates.settings.options.project.label")}</h3>
          {loader && templates.length === 0 ? (
            <p className="text-sm text-tertiary">{t("loading")}</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-tertiary">{t("templates.settings.description")}</p>
          ) : (
            <ul className="divide-y divide-subtle rounded-lg border border-subtle">
              {templates.map((template) => (
                <li key={template.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm truncate font-medium text-primary">{template.name}</p>
                    {template.description ? (
                      <p className="text-xs truncate text-tertiary">{template.description}</p>
                    ) : null}
                  </div>
                  {canCreate && (
                    <button
                      type="button"
                      className="hover:text-danger rounded p-2 text-tertiary hover:bg-layer-1"
                      onClick={() => handleDelete(template)}
                      aria-label={t("delete")}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SettingsContentWrapper>
  );
});
