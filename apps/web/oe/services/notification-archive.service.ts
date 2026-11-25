/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { ENotificationFilterType } from "@plane/constants";
import { APIService } from "@/services/api.service";

/** The inbox view to archive: `NotificationArchiveAllSerializer` in plane/extended/views/notification_archive.py. */
export type TNotificationArchiveAllView = {
  types: ENotificationFilterType[];
  unread_only: boolean;
  mentioned: boolean;
};

export class NotificationArchiveService extends APIService {
  constructor(baseURL?: string) {
    super(baseURL || API_BASE_URL);
  }

  /** Archives every notification of the view, beyond the loaded pages. */
  async archiveAll(workspaceSlug: string, view: TNotificationArchiveAllView): Promise<{ archived_count: number }> {
    return this.post(`/api/extended/workspaces/${workspaceSlug}/notifications/archive-all/`, view)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const notificationArchiveService = new NotificationArchiveService();
