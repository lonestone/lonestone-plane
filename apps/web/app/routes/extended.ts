/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { layout, route } from "@react-router/dev/routes";
import type { RouteConfigEntry } from "@react-router/dev/routes";

/**
 * Lonestone-only routes. Deep-merged into core via `mergeRoutes` in `routes.ts`.
 * Keep additions here so `routes/core.ts` stays upstream-clean.
 */
export const extendedRoutes: RouteConfigEntry[] = [
  layout("./(all)/layout.tsx", [
    layout("./(all)/[workspaceSlug]/layout.tsx", [
      layout("./(all)/[workspaceSlug]/(settings)/layout.tsx", [
        layout("./(all)/[workspaceSlug]/(settings)/settings/(workspace)/layout.tsx", [
          route(
            ":workspaceSlug/settings/templates",
            "./(all)/[workspaceSlug]/(settings)/settings/(workspace)/templates/page.tsx"
          ),
        ]),
      ]),
    ]),
  ]),
];
