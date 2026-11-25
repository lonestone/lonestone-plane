/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Paperclip, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "@plane/i18n";
import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { cn, convertBytesToSize, getFileExtension } from "@plane/utils";
// components
import { getFileIcon } from "@/components/icons";
// hooks
import { useFileSize } from "@/hooks/use-file-size";
import { useModalAttachments } from "@/plane-web/hooks/store/use-modal-attachments";

// Upstream's description editor sits in `.editor-container`, whose parent is the bordered, positioned frame of
// the field: the list and the drop overlay go in that frame. The modal itself is the dialog.
const DESCRIPTION_FRAME_SELECTOR = '[role="dialog"] .editor-container';

const hasFiles = (event: DragEvent) => !!event.dataTransfer?.types.includes("Files");

/**
 * The description frame of the open modal. The edit modal renders its editor once the work item is fetched, and
 * may render it again: the frame is looked up as long as the modal is open.
 */
const useDescriptionFrame = (enabled: boolean) => {
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const lookUp = () => {
      const found = document.querySelector(DESCRIPTION_FRAME_SELECTOR)?.parentElement ?? null;
      setFrame((current) => (current === found ? current : found));
    };
    lookUp();
    const domObserver = new MutationObserver(lookUp);
    domObserver.observe(document.body, { childList: true, subtree: true });
    return () => domObserver.disconnect();
  }, [enabled]);
  return frame;
};

type Props = {
  isDraft?: boolean;
};

/** Hidden for drafts, which have no attachments in Plane. */
export const IssueModalAttachments = observer(function IssueModalAttachments(props: Props) {
  const { isDraft = false } = props;
  const { t } = useTranslation();
  const { maxFileSize } = useFileSize();
  const modalAttachments = useModalAttachments();
  const frame = useDescriptionFrame(!isDraft);
  const [isDragging, setIsDragging] = useState(false);

  // Emptied when a modal opens, not when it closes: upstream may close the modal before the upload reads the
  // files (`draft-issue-layout.tsx` saving a draft).
  useEffect(() => {
    modalAttachments.clear();
  }, [modalAttachments]);

  const addFiles = useCallback(
    (selected: File[]) => {
      const accepted = selected.filter((file) => {
        if (file.size <= maxFileSize) return true;
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("toast.error"),
          message: t("attachment.file_size_limit", { size: maxFileSize / 1024 / 1024 }),
        });
        return false;
      });
      if (accepted.length > 0) modalAttachments.add(accepted);
    },
    [maxFileSize, modalAttachments, t]
  );

  // the drag listeners stay for the whole modal: they read the latest `addFiles` (`t` changes between renders)
  const addFilesRef = useRef(addFiles);
  useEffect(() => {
    addFilesRef.current = addFiles;
  }, [addFiles]);

  // Capture phase on the dialog: the editor never sees a dropped file, and the browser does not open it.
  // The overlay follows `dragover`, sent every few milliseconds while files are over the dialog: counting
  // `dragenter` and `dragleave` drifts when the elements under the pointer change during the drag.
  useEffect(() => {
    const dialog = frame?.closest<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    let hideTimer: number | undefined;
    // a drag started in the page (an image moved in the description) can carry files: it stays the editor's
    let isDragFromPage = false;
    const hideOverlay = () => {
      window.clearTimeout(hideTimer);
      setIsDragging(false);
    };
    const onDragStart = () => {
      isDragFromPage = true;
    };
    const onDragEnd = () => {
      isDragFromPage = false;
      hideOverlay();
    };
    const onDragOver = (event: DragEvent) => {
      if (isDragFromPage || !hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      setIsDragging(true);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(hideOverlay, 200);
    };
    const onDrop = (event: DragEvent) => {
      if (isDragFromPage || !hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      hideOverlay();
      addFilesRef.current(Array.from(event.dataTransfer?.files ?? []));
    };
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("dragend", onDragEnd, true);
    dialog.addEventListener("dragenter", onDragOver, true);
    dialog.addEventListener("dragover", onDragOver, true);
    dialog.addEventListener("drop", onDrop, true);
    return () => {
      window.clearTimeout(hideTimer);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("dragend", onDragEnd, true);
      dialog.removeEventListener("dragenter", onDragOver, true);
      dialog.removeEventListener("dragover", onDragOver, true);
      dialog.removeEventListener("drop", onDrop, true);
    };
  }, [frame]);

  // An input outside the modal: in the edit modal, an upstream ancestor cancels the click that would reach an
  // input inside it, and a cancelled click on a file input opens no file picker. On upstream merges, re-check
  // with the edit modal's "Attach file" (e2e: "attaches a file while editing a work item").
  const pickFiles = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.addEventListener("change", () => addFiles(Array.from(input.files ?? [])));
    input.click();
  };

  if (isDraft || !frame) return null;

  return createPortal(
    <>
      <div className="flex flex-col gap-1 px-3 pb-2">
        {modalAttachments.files.map(({ id, file }) => (
          <div key={id} className="flex items-center gap-2 rounded-md bg-layer-2 px-2 py-1.5 text-13">
            <span className="flex-shrink-0">{getFileIcon(getFileExtension(file.name), 18)}</span>
            <span className="truncate font-medium text-secondary">{file.name}</span>
            <span className="flex-shrink-0 text-12 text-tertiary">{convertBytesToSize(file.size)}</span>
            <button
              type="button"
              aria-label={t("issue.modal_attachments.remove", { name: file.name })}
              className="ml-auto flex-shrink-0 rounded-sm p-0.5 text-tertiary hover:bg-layer-1-hover hover:text-primary"
              onClick={() => modalAttachments.remove(id)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <div className="flex justify-end">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md border-[0.5px] border-strong px-2 py-1 text-12 text-secondary transition-colors hover:bg-layer-1-hover"
            onClick={pickFiles}
          >
            <Paperclip className="size-3.5" />
            {t("issue.modal_attachments.attach_file")}
          </button>
        </div>
      </div>
      {isDragging && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg",
            "border-2 border-dashed border-accent-strong bg-accent-primary/10 backdrop-blur-[1px]"
          )}
        >
          <span className="rounded-md bg-surface-1 px-3 py-1.5 text-13 font-medium text-accent-primary shadow-raised-100">
            {t("issue.modal_attachments.drop_overlay")}
          </span>
        </div>
      )}
    </>,
    frame
  );
});
