/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useContext } from "react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { StoreContext } from "@/lib/store-context";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";

/**
 * Project-scoped collaboration checks that treat guests with
 * ``guest_can_collaborate`` like members for work-item edit / Cycles / Modules.
 */
export const useProjectCollaboration = () => {
  const store = useContext(StoreContext);
  const { allowPermissions, getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  const { getProjectById, getPartialProjectById } = useProject();

  const resolveIds = useCallback(
    (workspaceSlug?: string, projectId?: string) => {
      const { workspaceSlug: currentWorkspaceSlug, projectId: currentProjectId } = store?.router ?? {};
      return {
        workspaceSlug: workspaceSlug || currentWorkspaceSlug,
        projectId: projectId || currentProjectId,
      };
    },
    [store?.router]
  );

  const isCollaboratingGuest = useCallback(
    (workspaceSlug?: string, projectId?: string) => {
      const ids = resolveIds(workspaceSlug, projectId);
      if (!ids.workspaceSlug || !ids.projectId) return false;
      const role = getProjectRoleByWorkspaceSlugAndProjectId(ids.workspaceSlug, ids.projectId);
      if (role !== EUserPermissions.GUEST) return false;
      const project = getProjectById(ids.projectId) ?? getPartialProjectById(ids.projectId);
      return !!project?.guest_can_collaborate;
    },
    [getPartialProjectById, getProjectById, getProjectRoleByWorkspaceSlugAndProjectId, resolveIds]
  );

  const canEditProjectWorkItems = useCallback(
    (workspaceSlug?: string, projectId?: string) => {
      const ids = resolveIds(workspaceSlug, projectId);
      if (
        allowPermissions(
          [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
          EUserPermissionsLevel.PROJECT,
          ids.workspaceSlug,
          ids.projectId
        )
      ) {
        return true;
      }
      return isCollaboratingGuest(ids.workspaceSlug, ids.projectId);
    },
    [allowPermissions, isCollaboratingGuest, resolveIds]
  );

  const canAccessCyclesAndModules = useCallback(
    (workspaceSlug?: string, projectId?: string) => canEditProjectWorkItems(workspaceSlug, projectId),
    [canEditProjectWorkItems]
  );

  return {
    isCollaboratingGuest,
    canEditProjectWorkItems,
    canAccessCyclesAndModules,
  };
};
