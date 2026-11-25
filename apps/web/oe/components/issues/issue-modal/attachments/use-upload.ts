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
 */
export const useModalAttachmentsUpload = () => {
  const { t } = useTranslation();
  const {
    attachment: { createAttachment },
  } = useIssueDetail();
  const modalAttachments = useModalAttachments();
  // the generation this modal opened
  const generationRef = useRef<number | null>(null);
  const savedFilesRef = useRef<TPendingAttachment[] | null>(null);
  const closedFilesRef = useRef<TPendingAttachment[] | null>(null);
  const isCurrentModal = useCallback(() => modalAttachments.generation === generationRef.current, [modalAttachments]);

  // Runs after the child list's mount effect, which opens the generation. On close, the files are kept:
  // a draft saved on close is reported after the modal is gone, maybe once another one is open.
  // (reset on mount: React's strict mode unmounts and mounts again once in development)
  useEffect(() => {
    generationRef.current = modalAttachments.generation;
    closedFilesRef.current = null;
    return () => {
      if (isCurrentModal()) closedFilesRef.current = [...modalAttachments.files];
    };
  }, [modalAttachments, isCurrentModal]);

  const keepSavedFiles = useCallback(() => {
    savedFilesRef.current = isCurrentModal() ? [...modalAttachments.files] : [];
    return true;
  }, [modalAttachments, isCurrentModal]);

  const uploadSavedFiles = useCallback(
    async ({ issueId, projectId, workspaceSlug, isDraft }: TCreateUpdatePropertyValuesProps) => {
      const isCurrent = isCurrentModal();
      // saving a draft on close does not go through `keepSavedFiles`
      let saved = savedFilesRef.current ?? closedFilesRef.current ?? (isCurrent ? [...modalAttachments.files] : []);
      savedFilesRef.current = null;
      closedFilesRef.current = null;
      if (isCurrent) {
        // a file removed from the list while the work item saves is not sent
        const listedIds = new Set(modalAttachments.files.map(({ id }) => id));
        saved = saved.filter(({ id }) => listedIds.has(id));
        modalAttachments.remove(saved.map(({ id }) => id));
      }
      if (saved.length === 0) return;
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
    [createAttachment, modalAttachments, isCurrentModal, t]
  );

  return { keepSavedFiles, uploadSavedFiles };
};
