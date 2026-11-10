/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { ReactNode } from "react";
import { GuestAccessModal } from "./access-modal";
import { guestAssignmentState } from "./helpers";

type TOnChange = ((value: string | null) => void) | ((value: string[]) => void);

type TGuardArgs = {
  projectId?: string | null;
  workspaceSlug: string | undefined;
  multiple?: boolean;
  value?: string | string[] | null;
  onChange: TOnChange;
};

/**
 * Wraps the member dropdown's `onChange`: picking a guest who cannot see the work item yet
 * (collaboration on, "Guest access" off) does not assign them and opens GuestAccessModal instead.
 * Any other change goes through untouched.
 *
 * Relies on MemberDropdownBase calling `onChange` with the full new list when `multiple` is set
 * (core/components/dropdowns/member/base.tsx): re-check on the next upstream merge.
 */
export function useGuestAssignmentGuard({ projectId, workspaceSlug, multiple, value, onChange }: TGuardArgs): {
  guardedOnChange: TOnChange;
  modal: ReactNode;
} {
  const [pending, setPending] = useState<string[] | null>(null);
  const apply = onChange as (value: string | string[] | null) => void;

  const guardedOnChange = ((next: string | string[] | null) => {
    if (multiple && Array.isArray(next)) {
      const current = Array.isArray(value) ? value : [];
      const added = next.filter((id) => !current.includes(id));
      if (added.some((id) => guestAssignmentState(projectId, id) === "blocked-guest")) {
        setPending(next);
        return;
      }
    }
    apply(next);
  }) as TOnChange;

  const modal = (
    <GuestAccessModal
      isOpen={pending !== null}
      workspaceSlug={workspaceSlug}
      projectId={projectId ?? undefined}
      onClose={() => setPending(null)}
      onEnabled={() => {
        if (pending !== null) apply(pending);
        setPending(null);
      }}
    />
  );

  return { guardedOnChange, modal };
}
