/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { ETabIndices } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TProject } from "@plane/types";
import { getTabIndex } from "@plane/utils";
import ProjectCommonAttributes from "@/components/project/create/common-attributes";
import ProjectCreateHeader from "@/components/project/create/header";
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";
import { ProjectAttributes } from "@/components/projects/create/attributes";
import { getProjectFormValues } from "@/components/projects/create/utils";
import { useProject } from "@/hooks/store/use-project";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useProjectTemplates } from "@/plane-web/hooks/store/use-project-templates";

export type TCreateProjectTemplateFormValues = TProject & {
  project_id: string | null;
};

type Props = {
  workspaceSlug: string;
  onClose: () => void;
  onSuccess?: () => void;
};

export const CreateProjectTemplateForm = observer(function CreateProjectTemplateForm(props: Props) {
  const { workspaceSlug, onClose, onSuccess } = props;
  const { t } = useTranslation();
  const { isMobile } = usePlatformOS();
  const { getProjectById } = useProject();
  const { createTemplate } = useProjectTemplates();
  const [shouldAutoSyncIdentifier, setShouldAutoSyncIdentifier] = useState(true);
  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CREATE, isMobile);

  const methods = useForm<TCreateProjectTemplateFormValues>({
    defaultValues: {
      ...getProjectFormValues(),
      project_id: null,
    },
    reValidateMode: "onChange",
  });
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting },
  } = methods;

  const handleClose = () => {
    onClose();
    setShouldAutoSyncIdentifier(true);
    setTimeout(() => {
      reset({ ...getProjectFormValues(), project_id: null });
    }, 300);
  };

  const handleSourceProjectChange = (projectId: string) => {
    setValue("project_id", projectId, { shouldDirty: true });
    const project = getProjectById(projectId);
    if (!project) return;

    if (project.name) setValue("name", project.name, { shouldDirty: true });
    if (project.description !== undefined) setValue("description", project.description, { shouldDirty: true });
    if (project.identifier) {
      setValue("identifier", project.identifier, { shouldDirty: true });
      setShouldAutoSyncIdentifier(false);
    }
    if (project.network !== undefined) setValue("network", project.network, { shouldDirty: true });
    if (project.logo_props) setValue("logo_props", project.logo_props, { shouldDirty: true });
    if (project.cover_image_url) setValue("cover_image_url", project.cover_image_url, { shouldDirty: true });
    if (project.project_lead !== undefined) {
      const leadId =
        typeof project.project_lead === "object" && project.project_lead
          ? project.project_lead.id
          : project.project_lead;
      setValue("project_lead", leadId ?? null, { shouldDirty: true });
    }
  };

  const onSubmit = async (formData: TCreateProjectTemplateFormValues) => {
    try {
      const projectId = formData.project_id || undefined;
      const projectLeadId =
        typeof formData.project_lead === "string"
          ? formData.project_lead
          : formData.project_lead && typeof formData.project_lead === "object"
            ? formData.project_lead.id
            : undefined;
      await createTemplate(workspaceSlug, {
        name: formData.name.trim(),
        description: formData.description?.trim() || "",
        cover_image: formData.cover_image_url || "",
        project_id: projectId,
        template_data: {
          name: formData.name.trim(),
          description: formData.description?.trim() || "",
          network: formData.network,
          logo_props: formData.logo_props,
          cover_image: formData.cover_image_url || "",
          project_lead: projectLeadId ? { id: projectLeadId } : {},
          ...(projectId
            ? {}
            : {
                states: [],
                labels: [],
                work_items: [],
              }),
        },
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("templates.settings.create_template.label"),
      });
      onSuccess?.();
      handleClose();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("something_went_wrong_please_try_again"),
      });
    }
  };

  return (
    <FormProvider {...methods}>
      <ProjectCreateHeader handleClose={handleClose} isMobile={isMobile} showActionButtons={false} />

      <form onSubmit={handleSubmit(onSubmit)} className="px-3">
        <div className="mt-9 space-y-6 pb-5">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-secondary">
              {t("templates.settings.form.project.source_project.label")}
            </p>
            <Controller
              control={control}
              name="project_id"
              render={({ field: { value } }) => (
                <div className="h-7">
                  <ProjectDropdown
                    value={value}
                    onChange={handleSourceProjectChange}
                    multiple={false}
                    buttonVariant="border-with-text"
                    placeholder={t("templates.settings.form.project.source_project.placeholder")}
                    tabIndex={getIndex("cover_image")}
                  />
                </div>
              )}
            />
            <p className="text-xs text-tertiary">{t("templates.settings.form.project.source_project.helper")}</p>
          </div>

          <ProjectCommonAttributes
            setValue={setValue as never}
            isMobile={isMobile}
            shouldAutoSyncIdentifier={shouldAutoSyncIdentifier}
            setShouldAutoSyncIdentifier={setShouldAutoSyncIdentifier}
          />
          <ProjectAttributes isMobile={isMobile} />
        </div>

        <div className="flex justify-end gap-2 border-t border-subtle py-4">
          <Button variant="secondary" size="lg" onClick={handleClose} tabIndex={getIndex("cancel")}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting} tabIndex={getIndex("submit")}>
            {t("templates.settings.form.project.button.create")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
});
