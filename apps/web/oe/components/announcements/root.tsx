/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import useSWR from "swr";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { announcementService } from "@/plane-web/services/announcement.service";
import type { TAnnouncement, TAnnouncementData, TAnnouncementKey } from "@/plane-web/services/announcement.service";
import { ANNOUNCEMENT_CONTENTS } from "./registry";
import type { TAnnouncementProps } from "./registry";

const SWR_KEY = "EXTENDED_ANNOUNCEMENTS";

function isKnown(announcement: { key: string; data: unknown }): announcement is TAnnouncement {
  return announcement.key in ANNOUNCEMENT_CONTENTS;
}

/** One-time announcements of the fork, one dialog at a time. Rendered by upstream's GlobalModals. */
export function Announcements() {
  const { data, mutate } = useSWR(SWR_KEY, () => announcementService.list(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const announcement = data?.find(isKnown);
  if (!announcement) return null;

  const close = () => {
    void mutate(
      data?.filter((pending) => pending.key !== announcement.key),
      { revalidate: false }
    );
    void announcementService.markSeen(announcement.key).catch(() => undefined);
  };

  return (
    <ModalCore isOpen handleClose={close} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <AnnouncementContent announcement={announcement} close={close} />
    </ModalCore>
  );
}

function AnnouncementContent<K extends TAnnouncementKey>(props: {
  announcement: { key: K; data: TAnnouncementData[K] };
  close: () => void;
}) {
  const Content: FC<TAnnouncementProps<K>> = ANNOUNCEMENT_CONTENTS[props.announcement.key];
  return <Content data={props.announcement.data} close={props.close} />;
}
