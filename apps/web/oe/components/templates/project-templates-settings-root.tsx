/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Pencil, Trash2 } from "lucide-react";
import useSWR from "swr";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProjectTemplate } from "@plane/types";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { CreateProjectModal } from "@/components/project/create-project-modal";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import { CreateProjectTemplateModal } from "@/plane-web/components/templates/create-project-template-modal";
import { useProjectTemplates } from "@/plane-web/hooks/store/use-project-templates";

type Props = {
  workspaceSlug: string;
  header: React.ReactNode;
};

export const ProjectTemplatesSettingsRoot = observer(function ProjectTemplatesSettingsRoot(props: Props) {
  const { workspaceSlug, header } = props;
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { templates, loader, fetchTemplates, deleteTemplate } = useProjectTemplates();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TProjectTemplate | null>(null);
  const [useTemplateId, setUseTemplateId] = useState<string | null>(null);

  const canManage = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const canCreate = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  useSWR(canManage ? `EXTENDED_PROJECT_TEMPLATES_${workspaceSlug}` : null, () => fetchTemplates(workspaceSlug));

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace.name} - ${t("workspace_settings.settings.templates.title")}`
    : undefined;

  const handleCloseModal = () => {
    setIsCreateModalOpen(false);
    setEditingTemplate(null);
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
      <CreateProjectTemplateModal
        isOpen={isCreateModalOpen || Boolean(editingTemplate)}
        onClose={handleCloseModal}
        workspaceSlug={workspaceSlug}
        template={editingTemplate}
      />
      {useTemplateId ? (
        <CreateProjectModal
          isOpen
          onClose={() => setUseTemplateId(null)}
          workspaceSlug={workspaceSlug}
          templateId={useTemplateId}
        />
      ) : null}
      <div className="w-full space-y-6">
        <SettingsHeading
          title={t("workspace_settings.settings.templates.title")}
          description={t("workspace_settings.settings.templates.description")}
          control={
            canCreate ? (
              <Button variant="primary" size="lg" onClick={() => setIsCreateModalOpen(true)}>
                {t("templates.settings.create_template.label")}
              </Button>
            ) : undefined
          }
        />

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-primary">{t("templates.settings.options.project.label")}</h3>
          {loader && templates.length === 0 ? (
            <p className="text-sm text-tertiary">{t("loading")}</p>
          ) : templates.length === 0 ? (
            <EmptyStateCompact
              assetKey="template"
              title={t("settings_empty_state.template_setting.title")}
              description={t("settings_empty_state.template_setting.description")}
              actions={
                canCreate
                  ? [
                      {
                        label: t("settings_empty_state.template_setting.cta_primary"),
                        onClick: () => setIsCreateModalOpen(true),
                      },
                    ]
                  : undefined
              }
              align="start"
              rootClassName="py-20"
            />
          ) : (
            <ul className="divide-y divide-subtle rounded-lg border border-subtle">
              {templates.map((template) => {
                const snapshot = template.template_data?.[0];
                const summaryParts = [
                  snapshot?.states?.length ? `${snapshot.states.length} states` : null,
                  snapshot?.labels?.length ? `${snapshot.labels.length} labels` : null,
                  snapshot?.work_items?.length ? `${snapshot.work_items.length} work items` : null,
                ].filter(Boolean);

                return (
                  <li key={template.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate font-medium text-primary">{template.name}</p>
                      {template.description ? (
                        <p className="text-xs truncate text-tertiary">{template.description}</p>
                      ) : null}
                      {summaryParts.length > 0 ? (
                        <p className="text-xs mt-0.5 text-tertiary">{summaryParts.join(" · ")}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="secondary" size="sm" onClick={() => setUseTemplateId(template.id)}>
                        {t("templates.settings.use_template.button.default")}
                      </Button>
                      {canCreate && (
                        <>
                          <button
                            type="button"
                            className="rounded p-2 text-tertiary hover:bg-layer-1 hover:text-primary"
                            onClick={() => setEditingTemplate(template)}
                            aria-label={t("edit")}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="hover:text-danger rounded p-2 text-tertiary hover:bg-layer-1"
                            onClick={() => handleDelete(template)}
                            aria-label={t("delete")}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </SettingsContentWrapper>
  );
});
