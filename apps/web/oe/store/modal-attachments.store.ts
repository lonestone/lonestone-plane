/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable } from "mobx";
import { v4 as uuidv4 } from "uuid";

export type TPendingAttachment = { id: string; file: File };

export interface IModalAttachmentsStore {
  files: TPendingAttachment[];
  /** Incremented when a modal opens: a modal only touches the list of its own generation. */
  generation: number;
  open: () => void;
  add: (files: File[]) => void;
  remove: (ids: string[]) => void;
}

/**
 * Files added in the work item modal, sent as attachments once the work item is saved. Its list (rendered by
 * `modal.tsx`) and its upload (run by `provider.tsx`) share this store. A modal can open over another one (a
 * create shortcut): the newest owns the list.
 */
export class ModalAttachmentsStore implements IModalAttachmentsStore {
  files: TPendingAttachment[] = [];
  generation = 0;

  constructor() {
    makeObservable(this, {
      files: observable.shallow,
      generation: observable,
      open: action,
      add: action,
      remove: action,
    });
  }

  open = () => {
    this.generation += 1;
    this.files = [];
  };

  add = (files: File[]) => {
    this.files = [...this.files, ...files.map((file) => ({ id: uuidv4(), file }))];
  };

  remove = (ids: string[]) => {
    this.files = this.files.filter((pending) => !ids.includes(pending.id));
  };
}
