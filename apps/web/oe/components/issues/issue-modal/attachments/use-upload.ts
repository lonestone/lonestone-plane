/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { useTranslation } from "@plane/i18n";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
// components
import type { TCreateUpdatePropertyValuesProps } from "@/components/issues/issue-modal/context";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useModalAttachments } from "@/plane-web/hooks/store/use-modal-attachments";

/**
 * Upload of the modal's pending files, plugged into `handleCreateUpdatePropertyValues` of the issue modal
 * context: upstream calls it once the work item is created or updated, with its id. A draft has no
 * attachments in Plane: its files are dropped, with a message.
 */
export const useModalAttachmentsUpload = () => {
  const { t } = useTranslation();
  const {
    attachment: { createAttachment },
  } = useIssueDetail();
  const modalAttachments = useModalAttachments();

  return useCallback(
    async ({ issueId, projectId, workspaceSlug, isDraft }: TCreateUpdatePropertyValuesProps) => {
      const pending = modalAttachments.files;
      if (pending.length === 0) return;
      modalAttachments.clear();
      if (isDraft) {
        setToast({
          type: TOAST_TYPE.WARNING,
          title: t("issue.modal_attachments.draft_not_kept_title"),
          message: t("issue.modal_attachments.draft_not_kept"),
        });
        return;
      }
      const failed: string[] = [];
      for (const { file } of pending) {
        try {
          // one at a time, as upstream's Attach button does
          // oxlint-disable-next-line no-await-in-loop
          await createAttachment(workspaceSlug, projectId, issueId, file);
        } catch {
          failed.push(file.name);
        }
      }
      if (failed.length > 0) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("issue.modal_attachments.upload_failed_title"),
          message: t("issue.modal_attachments.upload_failed", { names: failed.join(", ") }),
        });
      }
    },
    [createAttachment, modalAttachments, t]
  );
};
