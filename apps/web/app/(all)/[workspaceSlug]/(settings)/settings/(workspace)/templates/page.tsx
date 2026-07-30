/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ProjectTemplatesSettingsRoot } from "@/plane-web/components/templates/project-templates-settings-root";
import type { Route } from "./+types/page";
import { TemplatesWorkspaceSettingsHeader } from "./header";

function TemplatesSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;

  return <ProjectTemplatesSettingsRoot workspaceSlug={workspaceSlug} header={<TemplatesWorkspaceSettingsHeader />} />;
}

export default observer(TemplatesSettingsPage);
