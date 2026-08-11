/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "../api.service";

export type TProjectGuestCollaboration = {
  id: string;
  project_id: string;
  guest_can_collaborate: boolean;
  created_at?: string;
  updated_at?: string;
};

/**
 * Extended guest collaboration API client (`/api/extended/...`).
 */
export class ProjectGuestCollaborationService extends APIService {
  constructor(baseURL?: string) {
    super(baseURL || API_BASE_URL);
  }

  async retrieve(workspaceSlug: string, projectId: string): Promise<TProjectGuestCollaboration> {
    return this.get(`/api/extended/workspaces/${workspaceSlug}/projects/${projectId}/guest-collaboration/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    data: { guest_can_collaborate: boolean }
  ): Promise<TProjectGuestCollaboration> {
    return this.patch(`/api/extended/workspaces/${workspaceSlug}/projects/${projectId}/guest-collaboration/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const projectGuestCollaborationService = new ProjectGuestCollaborationService();
