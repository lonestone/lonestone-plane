/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { MemberDropdownBase } from "@/components/dropdowns/member/base";
import { useMember } from "@/hooks/store/use-member";
import { useUserPermissions } from "@/hooks/store/user";
import { projectSubscriberService } from "@/plane-web/services/project-subscriber.service";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

/**
 * "Project subscribers" section of Project Settings → Members (LONESTONEP-8), as in Plane's Enterprise
 * Grid. Project and workspace admins pick the subscribers among the project members; other members
 * see them in the same picker, disabled, as upstream does for the project lead.
 *
 * Uses `MemberDropdownBase` rather than `MemberDropdown`: in multiple mode, the latter also lists the
 * guests of collaborating projects (LONESTONEP-4), who cannot be project subscribers. The row markup
 * repeats `DefaultSettingItem` (core/components/project/project-settings-member-defaults.tsx, not exported).
 */
export const ProjectSubscribers = observer(function ProjectSubscribers(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const {
    getUserDetails,
    project: { getProjectMemberIds, fetchProjectMembers },
  } = useMember();

  const swrKey = `PROJECT_SUBSCRIBERS_${projectId}`;
  const { data: subscribers, mutate } = useSWR(swrKey, () => projectSubscriberService.list(workspaceSlug, projectId));
  const value = (subscribers ?? []).map((subscriber) => subscriber.subscriber_id);

  // Project members without the guests, plus the current subscribers: one who became a guest stays
  // listed, so that an admin can still remove them.
  const pickableIds = Array.from(new Set([...(getProjectMemberIds(projectId, false) ?? []), ...value]));

  const canManage =
    allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId) ||
    allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug);

  const handleChange = async (ids: string[]) => {
    const added = ids.filter((id) => !value.includes(id));
    const removed = value.filter((id) => !ids.includes(id));
    const previous = subscribers;
    // Optimistic: show the new list at once, revert on error.
    void mutate(
      ids.map(
        (id) =>
          subscribers?.find((subscriber) => subscriber.subscriber_id === id) ?? { subscriber_id: id, default: false }
      ),
      { revalidate: false }
    );
    try {
      await Promise.all([
        ...added.map((id) => projectSubscriberService.add(workspaceSlug, projectId, id)),
        ...removed.map((id) => projectSubscriberService.remove(workspaceSlug, projectId, id)),
      ]);
      void mutate();
    } catch {
      void mutate(previous, { revalidate: true });
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t(
          added.length ? "project_settings.subscribers.add_error" : "project_settings.subscribers.remove_error"
        ),
      });
    }
  };

  return (
    <div className="mb-6 flex items-center justify-between gap-x-2">
      <div className="flex flex-col gap-0.5">
        <h4 className="text-13 font-medium">{t("project_settings.subscribers.title")}</h4>
        <p className="text-11 text-tertiary">
          {t(
            canManage
              ? "project_settings.subscribers.description"
              : "project_settings.subscribers.description_read_only"
          )}
        </p>
      </div>
      <div className="w-full max-w-48 sm:max-w-64">
        <MemberDropdownBase
          multiple
          value={value}
          onChange={handleChange}
          memberIds={pickableIds}
          getUserDetails={getUserDetails}
          onDropdownOpen={() => void fetchProjectMembers(workspaceSlug, projectId)}
          buttonVariant="border-with-text"
          buttonClassName="w-full"
          buttonContainerClassName="w-full"
          placeholder={
            subscribers && !value.length && !canManage
              ? t("project_settings.subscribers.empty")
              : t("project_settings.subscribers.placeholder")
          }
          disabled={!canManage || !subscribers}
          showTooltip
        />
      </div>
    </div>
  );
});
