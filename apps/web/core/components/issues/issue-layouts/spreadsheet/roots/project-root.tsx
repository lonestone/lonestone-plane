/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
// hooks
import { useProjectCollaboration } from "@/hooks/use-project-collaboration";
// local imports
import { ProjectIssueQuickActions } from "../../quick-action-dropdowns";
import { BaseSpreadsheetRoot } from "../base-spreadsheet-root";

export const ProjectSpreadsheetLayout = observer(function ProjectSpreadsheetLayout() {
  // router
  const { workspaceSlug } = useParams();
  // hooks
  const { canEditProjectWorkItems } = useProjectCollaboration();
  // derived values
  const canEditPropertiesBasedOnProject = (projectId: string) =>
    canEditProjectWorkItems(workspaceSlug?.toString(), projectId);

  return (
    <BaseSpreadsheetRoot
      QuickActions={ProjectIssueQuickActions}
      canEditPropertiesBasedOnProject={canEditPropertiesBasedOnProject}
    />
  );
});
