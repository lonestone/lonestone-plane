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

export type TProjectSubscribersAnnouncement = {
  show: boolean;
  projects: TSubscribedAdminProject[];
};

/** One-time announcement of the fork (LONESTONEP-8), `/api/extended/users/me/announcements/…`. */
export class AnnouncementService extends APIService {
  constructor(baseURL?: string) {
    super(baseURL || API_BASE_URL);
  }

  private url = "/api/extended/users/me/announcements/project-subscribers/";

  async projectSubscribers(): Promise<TProjectSubscribersAnnouncement> {
    return this.get(this.url)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async markProjectSubscribersSeen(): Promise<void> {
    return this.post(this.url, {})
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const announcementService = new AnnouncementService();
