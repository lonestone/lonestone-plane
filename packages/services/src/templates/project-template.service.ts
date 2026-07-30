/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TProjectTemplate, TProjectTemplateCreatePayload, TProjectTemplateUpdatePayload } from "@plane/types";
import { APIService } from "../api.service";

/**
 * Lonestone project template API client (`/api/lonestone/...`).
 */
export class ProjectTemplateService extends APIService {
  constructor(baseURL?: string) {
    super(baseURL || API_BASE_URL);
  }

  async list(workspaceSlug: string): Promise<TProjectTemplate[]> {
    return this.get(`/api/lonestone/workspaces/${workspaceSlug}/project-templates/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, templateId: string): Promise<TProjectTemplate> {
    return this.get(`/api/lonestone/workspaces/${workspaceSlug}/project-templates/${templateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, data: TProjectTemplateCreatePayload): Promise<TProjectTemplate> {
    return this.post(`/api/lonestone/workspaces/${workspaceSlug}/project-templates/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    templateId: string,
    data: TProjectTemplateUpdatePayload
  ): Promise<TProjectTemplate> {
    return this.patch(`/api/lonestone/workspaces/${workspaceSlug}/project-templates/${templateId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, templateId: string): Promise<void> {
    return this.delete(`/api/lonestone/workspaces/${workspaceSlug}/project-templates/${templateId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export const projectTemplateService = new ProjectTemplateService();
