/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TNotificationContentMap } from "@/components/workspace-notifications/sidebar/notification-card/content";

/**
 * Notification texts of the fork, merged into upstream's ADDITIONAL_NOTIFICATION_CONTENT_MAP
 * (core/components/workspace-notifications/notification-card/content.ts). Upstream's own texts are
 * not translated either.
 */
export const FORK_NOTIFICATION_CONTENT_MAP: TNotificationContentMap = {
  // Project subscribers (LONESTONEP-8): "<author> created the work item." Sent by
  // plane.extended.services.project_subscribers.notify_new_issue (field NEW_WORK_ITEM_FIELD).
  project_subscription: () => ({
    action: "created the work item",
    value: null,
    showConnector: false,
  }),
};
