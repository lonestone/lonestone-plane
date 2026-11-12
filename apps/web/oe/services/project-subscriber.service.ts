/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TProjectSubscriber = {
  id: string;
  project_id: string;
  subscriber_id: string;
  created_by: string | null;
  created_at: string;
};

/** Project subscribers API of the fork (LONESTONEP-8), `/api/extended/.../subscribers/`. */
export class ProjectSubscriberService extends APIService {
  constructor(baseURL?: string) {
    super(baseURL || API_BASE_URL);
  }

  private url(workspaceSlug: string, projectId: string): string {
    return `/api/extended/workspaces/${workspaceSlug}/projects/${projectId}/subscribers/`;
  }

  async list(workspaceSlug: string, projectId: string): Promise<TProjectSubscriber[]> {
    return this.get(this.url(workspaceSlug, projectId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async add(workspaceSlug: string, projectId: string, subscriberId: string): Promise<TProjectSubscriber> {
    return this.post(this.url(workspaceSlug, projectId), { subscriber_id: subscriberId })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, subscriberId: string): Promise<void> {
    return this.delete(`${this.url(workspaceSlug, projectId)}${subscriberId}/`)
      .then(() => undefined)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const projectSubscriberService = new ProjectSubscriberService();
