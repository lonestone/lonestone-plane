/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
// hooks
import { useMember } from "@/hooks/store/use-member";
import {
  includeGuestAssignees,
  useGuestAssignmentGuard,
  useGuestUserDetails,
} from "@/plane-web/components/issues/guest-assignment";
// local imports
import { MemberDropdownBase } from "./base";
import type { MemberDropdownProps } from "./types";

type TMemberDropdownProps = {
  icon?: LucideIcon;
  memberIds?: string[];
  onClose?: () => void;
  optionsClassName?: string;
  projectId?: string;
  renderByDefault?: boolean;
} & MemberDropdownProps;

export const MemberDropdown = observer(function MemberDropdown(props: TMemberDropdownProps) {
  const { memberIds: propsMemberIds, projectId } = props;
  // router params
  const { workspaceSlug } = useParams();
  // store hooks
  const {
    getUserDetails,
    project: { getProjectMemberIds, fetchProjectMembers },
    workspace: { workspaceMemberIds },
  } = useMember();
  const guestUserDetails = useGuestUserDetails(projectId, getUserDetails);
  const { guardedOnChange, modal } = useGuestAssignmentGuard({
    ...props,
    projectId,
    workspaceSlug: workspaceSlug?.toString(),
    onChange: props.onChange,
  });
  const guardedProps = { ...props, onChange: guardedOnChange } as typeof props;

  const memberIds = propsMemberIds
    ? propsMemberIds
    : projectId
      ? getProjectMemberIds(projectId, props.multiple && includeGuestAssignees(projectId))
      : workspaceMemberIds;

  const onDropdownOpen = () => {
    if (!memberIds && projectId && workspaceSlug) fetchProjectMembers(workspaceSlug.toString(), projectId);
  };

  return (
    <>
      <MemberDropdownBase
        {...guardedProps}
        getUserDetails={guestUserDetails}
        memberIds={memberIds ?? []}
        onDropdownOpen={onDropdownOpen}
      />
      {modal}
    </>
  );
});
