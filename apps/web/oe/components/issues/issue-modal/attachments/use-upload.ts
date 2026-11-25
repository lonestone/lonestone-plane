/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "@plane/i18n";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
// components
import type { TCreateUpdatePropertyValuesProps } from "@/components/issues/issue-modal/context";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useModalAttachments } from "@/plane-web/hooks/store/use-modal-attachments";
// plane web types
import type { TPendingAttachment } from "@/plane-web/store/modal-attachments.store";

/**
 * Upload of the modal's files, plugged into two empty callbacks of upstream's issue modal context, per modal:
 * - `handlePropertyValuesValidation`, called when the user saves, before the first await: the files listed at
 *   that moment are the ones of this work item; files added while it saves stay for the next one;
 * - `handleCreateUpdatePropertyValues`, called once the work item is created or updated, with its id.
 * A draft has no attachments in Plane: its files are dropped, with a message.
 */
export const useModalAttachmentsUpload = () => {
  const { t } = useTranslation();
  const {
    attachment: { createAttachment },
  } = useIssueDetail();
  const modalAttachments = useModalAttachments();
  // this modal's generation: the list of a modal opened since then is not this one's
  const generationRef = useRef<number | null>(null);
  const savedFilesRef = useRef<TPendingAttachment[] | null>(null);

  // after the child list's own mount effect, which opens the generation
  useEffect(() => {
    generationRef.current = modalAttachments.generation;
  }, [modalAttachments]);

  const keepSavedFiles = useCallback(() => {
    savedFilesRef.current = [...modalAttachments.files];
    return true;
  }, [modalAttachments]);

  const uploadSavedFiles = useCallback(
    async ({ issueId, projectId, workspaceSlug, isDraft }: TCreateUpdatePropertyValuesProps) => {
      const isCurrentModal = modalAttachments.generation === generationRef.current;
      // saving a draft on close does not go through `keepSavedFiles`
      const saved = savedFilesRef.current ?? (isCurrentModal ? [...modalAttachments.files] : []);
      savedFilesRef.current = null;
      if (saved.length === 0) return;
      if (isCurrentModal) modalAttachments.removeMany(saved.map(({ id }) => id));
      if (isDraft) {
        setToast({
          type: TOAST_TYPE.WARNING,
          title: t("issue.modal_attachments.draft_not_kept_title"),
          message: t("issue.modal_attachments.draft_not_kept"),
        });
        return;
      }
      const failed: string[] = [];
      for (const { file } of saved) {
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

  return { keepSavedFiles, uploadSavedFiles };
};
