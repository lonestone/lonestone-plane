/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Guest assignment (LONESTONEP-4): guests of a project that allows guests to collaborate can be
// assigned to work items, once the project also has "Guest access" (guest_view_all_features) on.
// The server applies the same rule (plane.extended.rules.guest_assignment).
//
// Plain functions over the root store, so that non-React upstream code (issue-layouts/utils.tsx)
// can call them too. The `guest_can_collaborate` read mirrors `isCollaboratingGuest` in
// core/hooks/use-project-collaboration.ts, a hook that non-React code cannot call: keep both in step.
// They read `projectMemberMap` (role of each membership, as `getProjectMemberIds` does) and the
// project's `guest_can_collaborate` / `guest_view_all_features`: re-check these on the next upstream
// merge.

import { EUserPermissions } from "@plane/constants";
import { store } from "@/lib/store-context";

export type TGuestAssignmentState = "member" | "assignable-guest" | "blocked-guest";

function getProject(projectId: string) {
  const { getProjectById, getPartialProjectById } = store.projectRoot.project;
  return getProjectById(projectId) ?? getPartialProjectById(projectId);
}

/** Whether the assignee lists of this project offer its guests. */
export function includeGuestAssignees(projectId: string | null | undefined): boolean {
  if (!projectId) return false;
  return !!getProject(projectId)?.guest_can_collaborate;
}

/** Whether guests of this project can be assigned right now (collaboration and Guest access on). */
export function guestsAreAssignable(projectId: string | null | undefined): boolean {
  if (!projectId) return false;
  const project = getProject(projectId);
  return !!project?.guest_can_collaborate && !!project?.guest_view_all_features;
}

/** How a person of the assignee list behaves in this project. */
export function guestAssignmentState(projectId: string | null | undefined, userId: string): TGuestAssignmentState {
  if (!projectId) return "member";
  const role = store.memberRoot.project.projectMemberMap?.[projectId]?.[userId]?.role;
  if (role !== EUserPermissions.GUEST) return "member";
  return guestsAreAssignable(projectId) ? "assignable-guest" : "blocked-guest";
}
