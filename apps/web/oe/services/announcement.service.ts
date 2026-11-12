/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TSubscribedAdminProject = {
  project_id: string;
  project_name: string;
  workspace_slug: string;
  workspace_name: string;
};

/** Data of each announcement, by key (`ANNOUNCEMENTS` in plane/extended/services/announcements.py). */
export type TAnnouncementData = {
  project_subscribers: { projects: TSubscribedAdminProject[] };
};

export type TAnnouncementKey = keyof TAnnouncementData;

export type TAnnouncement = { [K in TAnnouncementKey]: { key: K; data: TAnnouncementData[K] } }[TAnnouncementKey];

export class AnnouncementService extends APIService {
  constructor(baseURL?: string) {
    super(baseURL || API_BASE_URL);
  }

  private url = "/api/extended/users/me/announcements/";

  /** Pending announcements, oldest first. The server may know keys this build does not. */
  async list(): Promise<{ key: string; data: unknown }[]> {
    return this.get(this.url)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async markSeen(key: string): Promise<void> {
    return this.post(`${this.url}${key}/seen/`, {})
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const announcementService = new AnnouncementService();
