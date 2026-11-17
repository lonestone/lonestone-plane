/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import type { IUserLite } from "@plane/types";
import type { MemberDropdownProps } from "@/components/dropdowns/member/types";
import { GuestAccessModal } from "./access-modal";
import { guestAssignmentState, includeGuestAssignees } from "./helpers";
import { useGuestUserDetails } from "./use-guest-user-details";

type TGuestAssigneeDropdown<P> = {
  /** The dropdown props, with `onChange` guarded. */
  guestProps: P;
  /** Second argument of `getProjectMemberIds`: true for an assignee list of a collaborating project. */
  includeGuests: boolean;
  guestUserDetails: (userId: string) => IUserLite | undefined;
  /** GuestAccessModal, to render next to the dropdown. */
  guestModal: ReactNode;
};

/**
 * Everything the upstream member dropdown (core/components/dropdowns/member/dropdown.tsx) needs to
 * offer guests as assignees (LONESTONEP-4):
 * - guests are listed in multiple-select dropdowns of a project that allows guests to collaborate;
 * - they read "Name · Guest";
 * - picking a guest who cannot see the work item yet ("Guest access" off) does not assign them and
 *   opens GuestAccessModal instead.
 *
 * Relies on MemberDropdownBase (core/components/dropdowns/member/base.tsx) calling `onChange` with the
 * full new list when `multiple` is set: re-check on the next upstream merge.
 */
export function useGuestAssigneeDropdown<P extends MemberDropdownProps & { projectId?: string }>(
  props: P,
  getUserDetails: (userId: string) => IUserLite | undefined,
  workspaceSlug: string | undefined
): TGuestAssigneeDropdown<P> {
  const { projectId, multiple, value } = props;
  const [pending, setPending] = useState<string[] | null>(null);
  const guestUserDetails = useGuestUserDetails(projectId, getUserDetails);

  // MemberDropdownProps is a union split on `multiple`; `onChange` takes `string[]` when `multiple`
  // is set and `string | null` otherwise. The guard only intercepts arrays, and passes any other
  // value through unchanged, so one signature covers both members of the union.
  const onChange = props.onChange as (next: string | string[] | null) => void;

  const guardedOnChange = (next: string | string[] | null) => {
    if (multiple && Array.isArray(next)) {
      const current = Array.isArray(value) ? value : [];
      const added = next.filter((id) => !current.includes(id));
      if (added.some((id) => guestAssignmentState(projectId, id) === "blocked-guest")) {
        setPending(next);
        return;
      }
    }
    onChange(next);
  };

  return {
    // Same props, `onChange` replaced by a function that accepts what the original accepted.
    guestProps: { ...props, onChange: guardedOnChange } as P,
    includeGuests: !!multiple && includeGuestAssignees(projectId),
    guestUserDetails,
    guestModal: (
      <GuestAccessModal
        isOpen={pending !== null}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        onClose={() => setPending(null)}
        onEnabled={() => {
          if (pending !== null) onChange(pending);
          setPending(null);
        }}
      />
    ),
  };
}
