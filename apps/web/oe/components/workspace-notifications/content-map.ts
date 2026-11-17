/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TNotificationContentMap } from "@/components/workspace-notifications/sidebar/notification-card/content";

/** Merged into upstream's ADDITIONAL_NOTIFICATION_CONTENT_MAP; upstream's texts are not translated either. */
export const FORK_NOTIFICATION_CONTENT_MAP: TNotificationContentMap = {
  // NEW_WORK_ITEM_FIELD of plane.extended.services.project_subscribers (LONESTONEP-8).
  project_subscription: () => ({
    action: "created the work item",
    value: null,
    showConnector: false,
  }),
};
