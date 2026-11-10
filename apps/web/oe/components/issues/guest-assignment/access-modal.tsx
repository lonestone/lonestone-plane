/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";

type Props = {
  isOpen: boolean;
  workspaceSlug: string | undefined;
  projectId: string | undefined;
  onClose: () => void;
  /** Called once Guest access is on, to assign the guest that was picked. */
  onEnabled: () => void;
};

/**
 * Explains why a guest cannot be assigned while "Guest access" is off. A project admin can turn it on
 * from here (the same project update as the project settings) and assign the guest in one go.
 */
export const GuestAccessModal = observer(function GuestAccessModal(props: Props) {
  const { isOpen, workspaceSlug, projectId, onClose, onEnabled } = props;
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const { updateProject } = useProject();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdmin =
    !!workspaceSlug &&
    !!projectId &&
    allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);

  const enableAndAssign = async () => {
    if (!workspaceSlug || !projectId) return;
    setIsSubmitting(true);
    try {
      await updateProject(workspaceSlug, projectId, { guest_view_all_features: true });
      onEnabled();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: t("something_went_wrong") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="px-4 py-4">
        <h3 className="text-16 leading-6 font-medium text-primary">
          {t("bulk_operations.guest_assignment.modal_title")}
        </h3>
        <p className="my-4 text-13 text-secondary">
          {t(
            isAdmin
              ? "bulk_operations.guest_assignment.modal_body"
              : "bulk_operations.guest_assignment.modal_body_member"
          )}
        </p>
      </div>
      <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-4 py-4">
        {isAdmin ? (
          <>
            <Button type="button" variant="secondary" size="lg" onClick={onClose}>
              {t("bulk_operations.guest_assignment.cancel")}
            </Button>
            <Button type="button" variant="primary" size="lg" disabled={isSubmitting} onClick={enableAndAssign}>
              {t("bulk_operations.guest_assignment.enable_and_assign")}
            </Button>
          </>
        ) : (
          <Button type="button" variant="secondary" size="lg" onClick={onClose}>
            {t("bulk_operations.guest_assignment.close")}
          </Button>
        )}
      </div>
    </ModalCore>
  );
});
