/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// hooks
import { useProjectCollaboration } from "@/hooks/use-project-collaboration";
// local imports
import { ProjectIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseListRoot } from "../base-list-root";

export const ProfileIssuesListLayout = observer(function ProfileIssuesListLayout() {
  // router
  const { workspaceSlug, profileViewId } = useParams();
  // store
  const { canEditProjectWorkItems } = useProjectCollaboration();

  const canEditPropertiesBasedOnProject = (projectId: string) =>
    canEditProjectWorkItems(workspaceSlug.toString(), projectId);

  return (
    <BaseListRoot
      QuickActions={ProjectIssueQuickActions}
      canEditPropertiesBasedOnProject={canEditPropertiesBasedOnProject}
      viewId={profileViewId?.toString()}
    />
  );
});
