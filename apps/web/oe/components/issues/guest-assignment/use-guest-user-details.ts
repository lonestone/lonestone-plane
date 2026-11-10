/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { useTranslation } from "@plane/i18n";
import type { IUserLite } from "@plane/types";
import { guestAssignmentState } from "./helpers";

/**
 * Wraps the member dropdown's `getUserDetails` so that a guest reads "Name · Guest" in the options,
 * in the search and on the dropdown button. Members are returned untouched.
 *
 * Why not a badge component: rendering one means editing the upstream member options, which carry
 * lint warnings of their own that the fork's pre-commit rejects (decided on 2026-11-10).
 * Re-check on the next upstream merge that the options and the button still read `display_name`.
 */
export function useGuestUserDetails(
  projectId: string | null | undefined,
  getUserDetails: (userId: string) => IUserLite | undefined
): (userId: string) => IUserLite | undefined {
  const { t } = useTranslation();
  const guestLabel = t("bulk_operations.guest_assignment.badge");

  return useCallback(
    (userId: string) => {
      const details = getUserDetails(userId);
      if (!details || guestAssignmentState(projectId, userId) === "member") return details;
      return { ...details, display_name: `${details.display_name} · ${guestLabel}` };
    },
    [getUserDetails, guestLabel, projectId]
  );
}
