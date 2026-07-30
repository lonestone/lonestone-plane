/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, computed, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import { projectTemplateService } from "@plane/services";
import type { TProjectTemplate, TProjectTemplateCreatePayload, TProjectTemplateUpdatePayload } from "@plane/types";
import type { CoreRootStore } from "@/store/root.store";

export interface IProjectTemplateStore {
  templatesMap: Record<string, TProjectTemplate>;
  loader: boolean;
  templates: TProjectTemplate[];
  getTemplateById: (templateId: string) => TProjectTemplate | undefined;
  fetchTemplates: (workspaceSlug: string) => Promise<TProjectTemplate[]>;
  fetchTemplateById: (workspaceSlug: string, templateId: string) => Promise<TProjectTemplate>;
  createTemplate: (workspaceSlug: string, data: TProjectTemplateCreatePayload) => Promise<TProjectTemplate>;
  updateTemplate: (
    workspaceSlug: string,
    templateId: string,
    data: TProjectTemplateUpdatePayload
  ) => Promise<TProjectTemplate>;
  deleteTemplate: (workspaceSlug: string, templateId: string) => Promise<void>;
  applyTemplate: (workspaceSlug: string, templateId: string, projectId: string) => Promise<{ project_id: string }>;
}

export class ProjectTemplateStore implements IProjectTemplateStore {
  templatesMap: Record<string, TProjectTemplate> = {};
  loader = false;
  rootStore: CoreRootStore;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      templatesMap: observable,
      loader: observable.ref,
      templates: computed,
      fetchTemplates: action,
      fetchTemplateById: action,
      createTemplate: action,
      updateTemplate: action,
      deleteTemplate: action,
      applyTemplate: action,
    });
    this.rootStore = _rootStore;
  }

  get templates(): TProjectTemplate[] {
    return Object.values(this.templatesMap);
  }

  getTemplateById = computedFn((templateId: string) => this.templatesMap[templateId]);

  fetchTemplates = async (workspaceSlug: string) => {
    this.loader = true;
    try {
      const response = await projectTemplateService.list(workspaceSlug);
      runInAction(() => {
        response.forEach((template) => {
          if (template.id) this.templatesMap[template.id] = template;
        });
        this.loader = false;
      });
      return response;
    } catch (error) {
      runInAction(() => {
        this.loader = false;
      });
      throw error;
    }
  };

  fetchTemplateById = async (workspaceSlug: string, templateId: string) => {
    const response = await projectTemplateService.retrieve(workspaceSlug, templateId);
    runInAction(() => {
      this.templatesMap[response.id] = response;
    });
    return response;
  };

  createTemplate = async (workspaceSlug: string, data: TProjectTemplateCreatePayload) => {
    const response = await projectTemplateService.create(workspaceSlug, data);
    runInAction(() => {
      this.templatesMap[response.id] = response;
    });
    return response;
  };

  updateTemplate = async (workspaceSlug: string, templateId: string, data: TProjectTemplateUpdatePayload) => {
    const response = await projectTemplateService.update(workspaceSlug, templateId, data);
    runInAction(() => {
      this.templatesMap[response.id] = response;
    });
    return response;
  };

  deleteTemplate = async (workspaceSlug: string, templateId: string) => {
    await projectTemplateService.destroy(workspaceSlug, templateId);
    runInAction(() => {
      delete this.templatesMap[templateId];
    });
  };

  applyTemplate = async (workspaceSlug: string, templateId: string, projectId: string) =>
    projectTemplateService.apply(workspaceSlug, templateId, projectId);
}
