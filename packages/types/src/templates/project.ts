/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TLonestoneTemplateType = "project" | "workitem" | "page";

/** Snapshot applied when creating a project from a Lonestone template. */
export type TProjectTemplateState = {
  id?: string;
  name: string;
  color?: string;
  group?: string;
  sequence?: number;
  default?: boolean;
  description?: string;
};

export type TProjectTemplateLabel = {
  name: string;
  color?: string;
  description?: string;
  sort_order?: number;
};

export type TProjectTemplateWorkItem = {
  name: string;
  description_html?: string;
};

export type TProjectTemplateSnapshot = {
  id?: string;
  template?: string;
  workspace?: string;
  name: string;
  description?: string;
  description_text?: Record<string, unknown> | null;
  description_html?: Record<string, unknown> | null;
  network?: number;
  default_assignee?: Record<string, unknown>;
  project_lead?: Record<string, unknown>;
  logo_props?: Record<string, unknown>;
  cover_image?: string;
  module_view?: boolean;
  cycle_view?: boolean;
  issue_views_view?: boolean;
  page_view?: boolean;
  intake_view?: boolean;
  is_time_tracking_enabled?: boolean;
  is_issue_type_enabled?: boolean;
  guest_view_all_features?: boolean;
  timezone?: string;
  archive_in?: number;
  close_in?: number;
  states?: TProjectTemplateState[];
  labels?: TProjectTemplateLabel[];
  estimates?: Record<string, unknown>;
  workitem_types?: unknown[];
  members?: unknown[];
  intake_settings?: Record<string, unknown>;
  work_items?: TProjectTemplateWorkItem[];
  start_date?: string | null;
  target_date?: string | null;
};

/** Workspace template row returned by Lonestone project-template APIs. */
export type TProjectTemplate = {
  id: string;
  name: string;
  description: string;
  description_html: string;
  description_stripped: string | null;
  template_type: TLonestoneTemplateType;
  cover_image: string;
  workspace: string;
  template_data: TProjectTemplateSnapshot[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type TProjectTemplateCreatePayload = {
  name: string;
  description?: string;
  description_html?: string;
  cover_image?: string;
  /** When set, server snapshots this project's states/labels/features/work items. */
  project_id?: string;
  template_data?: Partial<TProjectTemplateSnapshot>;
};

export type TProjectTemplateUpdatePayload = Partial<TProjectTemplateCreatePayload>;
