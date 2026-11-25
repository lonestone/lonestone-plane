/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
import { StoreContext } from "@/lib/store-context";
import type { IModalAttachmentsStore } from "@/plane-web/store/modal-attachments.store";

export const useModalAttachments = (): IModalAttachmentsStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useModalAttachments must be used within StoreProvider");
  return context.modalAttachments;
};
