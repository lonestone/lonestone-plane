/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TBulkOperationsPayload } from "@plane/types";

// Removals for multi-value properties (assignees, labels, modules). Kept out of the shared
// `TBulkOperationsPayload` type: the upstream store indexes work items with its property keys.
export type TBulkIssueRemovals = {
  remove_assignee_ids?: string[];
  remove_label_ids?: string[];
  remove_module_ids?: string[];
};

export type TBulkProperties = TBulkOperationsPayload["properties"] & TBulkIssueRemovals;
