/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export class AnnouncementService extends APIService {
  constructor(baseURL?: string) {
    super(baseURL || API_BASE_URL);
  }

  private url = "/api/extended/users/me/announcements/";

  async listSeen(): Promise<string[]> {
    return this.get(this.url)
      .then((response) => response?.data?.seen ?? [])
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
