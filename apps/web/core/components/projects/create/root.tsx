/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { FormProvider, useForm } from "react-hook-form";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EFileAssetType } from "@plane/types";
import type { TProject } from "@plane/types";
// components
import ProjectCommonAttributes from "@/components/project/create/common-attributes";
import ProjectCreateHeader from "@/components/project/create/header";
import ProjectCreateButtons from "@/components/project/create/project-create-buttons";
// hooks
import { getCoverImageType, uploadCoverImage } from "@/helpers/cover-image.helper";
import { useProject } from "@/hooks/store/use-project";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useProjectTemplates } from "@/plane-web/hooks/store/use-project-templates";
import { ProjectAttributes } from "./attributes";
import { getProjectFormValues } from "./utils";

export type TCreateProjectFormProps = {
  setToFavorite?: boolean;
  workspaceSlug: string;
  onClose: () => void;
  handleNextStep: (projectId: string) => void;
  data?: Partial<TProject>;
  templateId?: string;
  updateCoverImageStatus: (projectId: string, coverImage: string) => Promise<void>;
};

export const CreateProjectForm = observer(function CreateProjectForm(props: TCreateProjectFormProps) {
  const { setToFavorite, workspaceSlug, data, onClose, handleNextStep, updateCoverImageStatus, templateId } = props;
  // store
  const { t } = useTranslation();
  const { addProjectToFavorites, createProject, updateProject, fetchProjectDetails } = useProject();
  const { fetchTemplateById, getTemplateById, applyTemplate } = useProjectTemplates();
  // states
  const [shouldAutoSyncIdentifier, setShouldAutoSyncIdentifier] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(templateId ?? null);
  // form info
  const methods = useForm<TProject>({
    defaultValues: { ...getProjectFormValues(), ...data },
    reValidateMode: "onChange",
  });
  const { handleSubmit, reset, setValue } = methods;
  const { isMobile } = usePlatformOS();

  const applySnapshotToForm = (
    snapshot:
      | { name?: string; description?: string; network?: number; logo_props?: unknown; cover_image?: string }
      | undefined
  ) => {
    if (!snapshot) return;
    if (snapshot.name) setValue("name", snapshot.name, { shouldDirty: true });
    if (snapshot.description !== undefined) setValue("description", snapshot.description, { shouldDirty: true });
    if (snapshot.network !== undefined) setValue("network", snapshot.network, { shouldDirty: true });
    if (snapshot.logo_props)
      setValue("logo_props", snapshot.logo_props as TProject["logo_props"], { shouldDirty: true });
    if (snapshot.cover_image) setValue("cover_image_url", snapshot.cover_image, { shouldDirty: true });
  };

  useEffect(() => {
    if (!templateId) return;
    void fetchTemplateById(workspaceSlug, templateId).then((template) => {
      applySnapshotToForm(template.template_data?.[0]);
      return undefined;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once for initial templateId
  }, [templateId, workspaceSlug]);

  const handleTemplateSelect = (nextTemplateId: string | null) => {
    setSelectedTemplateId(nextTemplateId);
    if (!nextTemplateId) return;
    const cached = getTemplateById(nextTemplateId);
    if (cached) {
      applySnapshotToForm(cached.template_data?.[0]);
      return;
    }
    void fetchTemplateById(workspaceSlug, nextTemplateId).then((template) => {
      applySnapshotToForm(template.template_data?.[0]);
      return undefined;
    });
  };

  const handleAddToFavorites = (projectId: string) => {
    if (!workspaceSlug) return;

    addProjectToFavorites(workspaceSlug.toString(), projectId).catch(() => {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("failed_to_remove_project_from_favorites"),
      });
    });
  };

  const onSubmit = async (formData: Partial<TProject>) => {
    // Upper case identifier
    formData.identifier = formData.identifier?.toUpperCase();
    const coverImage = formData.cover_image_url;
    let uploadedAssetUrl: string | null = null;

    if (coverImage) {
      const imageType = getCoverImageType(coverImage);

      if (imageType === "local_static") {
        try {
          uploadedAssetUrl = await uploadCoverImage(coverImage, {
            workspaceSlug: workspaceSlug.toString(),
            entityIdentifier: "",
            entityType: EFileAssetType.PROJECT_COVER,
            isUserAsset: false,
          });
        } catch (error) {
          console.error("Error uploading cover image:", error);
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("toast.error"),
            message: error instanceof Error ? error.message : "Failed to upload cover image",
          });
          return Promise.reject(error);
        }
      } else {
        formData.cover_image = coverImage;
        formData.cover_image_asset = null;
      }
    }

    return createProject(workspaceSlug.toString(), formData)
      .then(async (res) => {
        try {
          if (uploadedAssetUrl) {
            await updateCoverImageStatus(res.id, uploadedAssetUrl);
            await updateProject(workspaceSlug.toString(), res.id, { cover_image_url: uploadedAssetUrl });
          } else if (coverImage && coverImage.startsWith("http")) {
            await updateCoverImageStatus(res.id, coverImage);
            await updateProject(workspaceSlug.toString(), res.id, { cover_image_url: coverImage });
          }
        } catch (error) {
          // Cover asset linking is best-effort; do not block template apply / project open.
          console.error("Failed to finalize project cover image:", error);
        }

        if (selectedTemplateId) {
          try {
            await applyTemplate(workspaceSlug.toString(), selectedTemplateId, res.id);
            // Refresh project so feature toggles / sidebar reflect the template snapshot.
            await fetchProjectDetails(workspaceSlug.toString(), res.id);
          } catch (error) {
            console.error("Failed to apply project template:", error);
            setToast({
              type: TOAST_TYPE.ERROR,
              title: t("toast.error"),
              message: t("something_went_wrong"),
            });
          }
        }

        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("success"),
          message: t("project_created_successfully"),
        });

        if (setToFavorite) {
          handleAddToFavorites(res.id);
        }
        return handleNextStep(res.id);
      })
      .catch((err) => {
        try {
          // Handle the new error format where codes are nested in arrays under field names
          const errorData = err?.data ?? {};

          const nameError = errorData.name?.includes("PROJECT_NAME_ALREADY_EXIST");
          const identifierError = errorData?.identifier?.includes("PROJECT_IDENTIFIER_ALREADY_EXIST");
          const nameSpecialCharError = errorData?.name?.includes("PROJECT_NAME_CANNOT_CONTAIN_SPECIAL_CHARACTERS");

          if (nameError || identifierError || nameSpecialCharError) {
            if (nameError) {
              setToast({
                type: TOAST_TYPE.ERROR,
                title: t("toast.error"),
                message: t("project_name_already_taken"),
              });
            }

            if (identifierError) {
              setToast({
                type: TOAST_TYPE.ERROR,
                title: t("toast.error"),
                message: t("project_identifier_already_taken"),
              });
            }

            if (nameSpecialCharError) {
              setToast({
                type: TOAST_TYPE.ERROR,
                title: t("toast.error"),
                message: t("project_name_cannot_contain_special_characters"),
              });
            }
          } else {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: t("toast.error"),
              message: t("something_went_wrong"),
            });
          }
        } catch (error) {
          // Fallback error handling if the error processing fails
          console.error("Error processing API error:", error);
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t("toast.error"),
            message: t("something_went_wrong"),
          });
        }
      });
  };

  const handleClose = () => {
    onClose();
    setShouldAutoSyncIdentifier(true);
    setSelectedTemplateId(null);
    setTimeout(() => {
      reset();
    }, 300);
  };

  return (
    <FormProvider {...methods}>
      <ProjectCreateHeader
        handleClose={handleClose}
        isMobile={isMobile}
        onTemplateSelect={handleTemplateSelect}
        selectedTemplateId={selectedTemplateId}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="px-3">
        <div className="mt-9 space-y-6 pb-5">
          <ProjectCommonAttributes
            setValue={setValue}
            isMobile={isMobile}
            shouldAutoSyncIdentifier={shouldAutoSyncIdentifier}
            setShouldAutoSyncIdentifier={setShouldAutoSyncIdentifier}
          />
          <ProjectAttributes isMobile={isMobile} />
        </div>
        <ProjectCreateButtons handleClose={handleClose} />
      </form>
    </FormProvider>
  );
});
