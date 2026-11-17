/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import type { TAnnouncementData, TAnnouncementKey } from "@/plane-web/services/announcement.service";
import { ProjectSubscribersAnnouncement } from "./project-subscribers";

export type TAnnouncementProps<K extends TAnnouncementKey> = {
  data: TAnnouncementData[K];
  /** Closes the dialog and marks the announcement as seen. */
  close: () => void;
};

/** Body of each announcement, inside the dialog `Announcements` opens. */
export const ANNOUNCEMENT_CONTENTS: { [K in TAnnouncementKey]: FC<TAnnouncementProps<K>> } = {
  project_subscribers: ProjectSubscribersAnnouncement,
};
