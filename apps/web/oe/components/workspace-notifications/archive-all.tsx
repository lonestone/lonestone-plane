/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { runInAction } from "mobx";
// plane imports
import { ENotificationFilterType, ENotificationTab } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { ArchiveIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { AlertModalCore } from "@plane/ui";
// hooks
import { useWorkspaceNotifications } from "@/hooks/store/notifications";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { usePlatformOS } from "@/hooks/use-platform-os";
// fork
import type { TNotificationArchiveAllView } from "@/plane-web/services/notification-archive.service";
import { notificationArchiveService } from "@/plane-web/services/notification-archive.service";

type Props = {
  workspaceSlug: string;
};

/** "Archive all" in the inbox header (LONESTONEP-14): archives what the inbox shows, tab and filters included. */
export const NotificationArchiveAllButton = observer(function NotificationArchiveAllButton({ workspaceSlug }: Props) {
  const { t } = useTranslation();
  const { isMobile } = usePlatformOS();
  const { getWorkspaceBySlug } = useWorkspace();
  const {
    notifications,
    filters,
    currentNotificationTab,
    notificationIdsByWorkspaceId,
    setUnreadNotificationsCount,
    getUnreadNotificationsCount,
  } = useWorkspaceNotifications();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Archived and snoozed views list notifications that are out of the inbox already.
  if (filters.archived || filters.snoozed) return null;

  const workspace = getWorkspaceBySlug(workspaceSlug);
  const notificationIds = (workspace && notificationIdsByWorkspaceId(workspace.id)) || [];

  const handleArchiveAll = async () => {
    const view: TNotificationArchiveAllView = {
      types: Object.values(ENotificationFilterType).filter((type) => filters.type[type]),
      unread_only: filters.read,
      mentioned: currentNotificationTab === ENotificationTab.MENTIONS,
    };
    // With "Show unread", a card read since it was loaded stays listed, but the server keeps it.
    const archivedNotifications = notificationIds
      .map((id) => notifications[id])
      .filter((notification) => notification && (!filters.read || !notification.read_at));
    const unreadCount = archivedNotifications.filter((notification) => !notification.read_at).length;
    const archivedAt = new Date().toISOString();
    runInAction(() => {
      archivedNotifications.forEach((notification) => notification.mutateNotification({ archived_at: archivedAt }));
      setUnreadNotificationsCount("decrement", unreadCount);
    });
    setIsSubmitting(true);
    try {
      await notificationArchiveService.archiveAll(workspaceSlug, view);
      setIsModalOpen(false);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("notification.archive_all.success") });
    } catch {
      runInAction(() => {
        archivedNotifications.forEach((notification) => notification.mutateNotification({ archived_at: undefined }));
        setUnreadNotificationsCount("increment", unreadCount);
      });
      setToast({ type: TOAST_TYPE.ERROR, title: t("notification.archive_all.error") });
    } finally {
      setIsSubmitting(false);
      // Unloaded pages may have held unread notifications too.
      getUnreadNotificationsCount(workspaceSlug).catch(() => undefined);
    }
  };

  return (
    <>
      <Tooltip tooltipContent={t("notification.archive_all.label")} isMobile={isMobile} position="bottom">
        <IconButton
          size="base"
          variant="ghost"
          icon={ArchiveIcon}
          aria-label={t("notification.archive_all.label")}
          disabled={notificationIds.length === 0}
          onClick={() => setIsModalOpen(true)}
        />
      </Tooltip>
      <AlertModalCore
        isOpen={isModalOpen}
        handleClose={() => !isSubmitting && setIsModalOpen(false)}
        handleSubmit={handleArchiveAll}
        isSubmitting={isSubmitting}
        variant="primary"
        title={t("notification.archive_all.title")}
        content={t("notification.archive_all.content")}
        primaryButtonText={{
          default: t("notification.archive_all.confirm"),
          loading: t("notification.archive_all.loading"),
        }}
      />
    </>
  );
});
