/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { CoreRootStore } from "@/store/root.store";
import type { IModalAttachmentsStore } from "./modal-attachments.store";
import { ModalAttachmentsStore } from "./modal-attachments.store";
import type { IProjectTemplateStore } from "./templates/project-template.store";
import { ProjectTemplateStore } from "./templates/project-template.store";

/**
 * Extended edition root store.
 *
 * Extend CoreRootStore here with edition-only stores (templates, etc.).
 * Instantiated via StoreProvider — do not construct CoreRootStore directly in app code.
 */
export class RootStore extends CoreRootStore {
  projectTemplates: IProjectTemplateStore;
  modalAttachments: IModalAttachmentsStore;

  constructor() {
    super();
    this.projectTemplates = new ProjectTemplateStore(this);
    this.modalAttachments = new ModalAttachmentsStore();
  }
}
