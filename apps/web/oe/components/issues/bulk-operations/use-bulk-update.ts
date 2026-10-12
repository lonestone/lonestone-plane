/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { chunk, isEqual, pick, uniq } from "lodash-es";
import { runInAction } from "mobx";
import { useParams } from "react-router";
import { EIssuesStoreType } from "@plane/types";
import type { TIssue } from "@plane/types";
import { useCycle } from "@/hooks/store/use-cycle";
import { useIssues } from "@/hooks/store/use-issues";
import { useModule } from "@/hooks/store/use-module";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { IssueService } from "@/services/issue";
import type { TBulkIssueRemovals, TBulkProperties } from "./types";

// Work items read back per request after an update: their ids go in the query string.
const SYNC_CHUNK_SIZE = 100;

// bulk removal key -> multi-value field it removes values from
const REMOVAL_FIELDS: Record<keyof TBulkIssueRemovals, "assignee_ids" | "label_ids" | "module_ids"> = {
  remove_assignee_ids: "assignee_ids",
  remove_label_ids: "label_ids",
  remove_module_ids: "module_ids",
};

// Upstream `issueUpdate`, exposed by every work item store as `updateIssue`. With `shouldSync` set to
// false it only updates the store (the work item and the grouped lists), without calling the API. The
// store interfaces leave that parameter out.
type TLocalIssueUpdate = (
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  data: Partial<TIssue>,
  shouldSync: false
) => Promise<void>;

const issueService = new IssueService();

// The values a work item gets once the bulk change is applied: added values are merged with the
// existing ones, removed values are filtered out, other properties are replaced.
const getLocalChanges = (issue: TIssue, properties: TBulkProperties): Partial<TIssue> => {
  const changes: Record<string, unknown> = {};
  Object.entries(properties).forEach(([key, value]) => {
    const removedField = REMOVAL_FIELDS[key as keyof TBulkIssueRemovals];
    if (removedField) {
      const removedValues = new Set(value as string[]);
      changes[removedField] = (issue[removedField] ?? []).filter((id) => !removedValues.has(id));
    } else if (Array.isArray(value)) {
      const field = key as "assignee_ids" | "label_ids" | "module_ids";
      changes[field] = uniq([...(issue[field] ?? []), ...value]);
    } else {
      changes[key] = value;
    }
  });
  return changes as Partial<TIssue>;
};

/**
 * Applies a bulk change optimistically: the store is updated first through upstream's own local
 * update, the request is sent, and the change is reverted if the API rejects it. Once saved, the
 * work items are read back in the background and the cycle or module progress is refreshed.
 */
export const useBulkUpdate = () => {
  const { workspaceSlug, projectId, cycleId, moduleId } = useParams();
  const storeType = useIssueStoreType();
  const { issues, issueMap } = useIssues(storeType);
  const { issues: moduleIssues } = useIssues(EIssuesStoreType.MODULE);
  const { getCycleById, fetchCycleDetails, fetchActiveCycleProgressPro } = useCycle();
  const { fetchModuleDetails } = useModule();

  const updateLocally = useCallback(
    (issueId: string, data: Partial<TIssue>) => {
      if (!workspaceSlug || !projectId) return;
      void (issues.updateIssue as TLocalIssueUpdate)(workspaceSlug, projectId, issueId, data, false);
    },
    [issues, projectId, workspaceSlug]
  );

  // Reads the saved work items back and applies whatever differs from the store (server-side
  // changes, or a concurrent edit). Never clears the list, unlike a view refetch.
  const syncFromServer = useCallback(
    async (issueIds: string[]) => {
      if (!workspaceSlug || !projectId) return;
      for (const ids of chunk(issueIds, SYNC_CHUNK_SIZE)) {
        // oxlint-disable-next-line no-await-in-loop
        const savedIssues = await issueService.retrieveIssues(workspaceSlug, projectId, ids);
        runInAction(() => {
          savedIssues.forEach((savedIssue) => {
            const issue = issueMap[savedIssue.id];
            if (!issue) return;
            const changedKeys = (Object.keys(savedIssue) as (keyof TIssue)[]).filter(
              (key) => !isEqual(issue[key], savedIssue[key])
            );
            if (changedKeys.length > 0) updateLocally(savedIssue.id, pick(savedIssue, changedKeys));
          });
        });
      }
    },
    [issueMap, projectId, updateLocally, workspaceSlug]
  );

  const refreshParentStats = useCallback(() => {
    if (!workspaceSlug || !projectId) return;
    if (cycleId) {
      void fetchCycleDetails(workspaceSlug, projectId, cycleId);
      if (getCycleById(cycleId)?.version === 2) void fetchActiveCycleProgressPro(workspaceSlug, projectId, cycleId);
    }
    if (moduleId) void fetchModuleDetails(workspaceSlug, projectId, moduleId);
  }, [
    cycleId,
    fetchActiveCycleProgressPro,
    fetchCycleDetails,
    fetchModuleDetails,
    getCycleById,
    moduleId,
    projectId,
    workspaceSlug,
  ]);

  // Sends one request; throws the API error after reverting the store.
  const bulkUpdate = useCallback(
    async (issueIds: string[], properties: TBulkProperties) => {
      if (!workspaceSlug || !projectId) return;
      // values before the change, to revert it if the request is rejected
      const previousValues: { id: string; values: Partial<TIssue> }[] = [];
      runInAction(() => {
        issueIds.forEach((issueId) => {
          const issue = issueMap[issueId];
          if (!issue) return;
          const changes = getLocalChanges(issue, properties);
          previousValues.push({ id: issueId, values: pick(issue, Object.keys(changes) as (keyof TIssue)[]) });
          updateLocally(issueId, changes);
        });
      });
      try {
        await issueService.bulkOperations(workspaceSlug, projectId, { issue_ids: issueIds, properties });
      } catch (error) {
        runInAction(() => previousValues.forEach(({ id, values }) => updateLocally(id, values)));
        throw error;
      }
      // in a module's view, work items taken out of that module leave the list
      if (moduleId && properties.remove_module_ids?.includes(moduleId)) {
        runInAction(() => issueIds.forEach((issueId) => moduleIssues.removeIssueFromList(issueId)));
      }
      refreshParentStats();
      syncFromServer(issueIds).catch((error) => console.error("Failed to read back bulk updated work items", error));
    },
    [issueMap, moduleId, moduleIssues, projectId, refreshParentStats, syncFromServer, updateLocally, workspaceSlug]
  );

  return bulkUpdate;
};
