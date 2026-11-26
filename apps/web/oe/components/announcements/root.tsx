/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { renderFormattedPayloadDate } from "@plane/utils";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { announcementService } from "@/plane-web/services/announcement.service";
import { RELEASE_NOTES } from "./release-notes";
import type { TLocalizedText, TReleaseNoteAudience } from "./release-notes";

const SWR_KEY = "EXTENDED_ANNOUNCEMENTS_SEEN";

const AUDIENCE_ROLES: Record<TReleaseNoteAudience, EUserPermissions[]> = {
  admins: [EUserPermissions.ADMIN],
  members: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
  all: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
};

/** The oldest release note the user has not seen and is meant for, in a dialog, once. */
export const Announcements = observer(function Announcements() {
  const { t, currentLocale } = useTranslation();
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  // Closed for this session: the next note waits for the next load, so one close never skips an unread note.
  const [isClosed, setIsClosed] = useState(false);
  const { data: seen, mutate } = useSWR(SWR_KEY, () => announcementService.listSeen(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  if (isClosed || !seen || !currentUser) return null;
  // The local day: a string would be cut to its UTC day
  const joined = renderFormattedPayloadDate(new Date(currentUser.date_joined)) ?? "";
  const note = RELEASE_NOTES.find(
    (candidate) =>
      !seen.includes(candidate.key) &&
      joined < candidate.date &&
      allowPermissions(AUDIENCE_ROLES[candidate.audience], EUserPermissionsLevel.WORKSPACE)
  );
  if (!note) return null;

  const text = (value: TLocalizedText) => (currentLocale === "fr" && value.fr) || value.en;
  const close = () => {
    setIsClosed(true);
    void mutate([...seen, note.key], { revalidate: false });
    // Not reopened on failure: the note shows again at the next load.
    announcementService.markSeen(note.key).catch((error) => console.error("Announcements -> markSeen", error));
  };

  return (
    <ModalCore isOpen handleClose={close} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto p-5">
        <h3 className="text-16 font-medium">{t("whats_new")}</h3>
        {note.items.map((item) => (
          <section key={item.title.en} className="flex flex-col gap-2">
            <h4 className="text-14 font-medium">{text(item.title)}</h4>
            <p className="text-13 text-secondary">{text(item.body)}</p>
            <img
              src={item.image}
              alt={text(item.imageAlt)}
              className="w-full rounded-md border-[0.5px] border-subtle"
            />
          </section>
        ))}
      </div>
      <div className="flex justify-end border-t-[0.5px] border-subtle px-5 py-4">
        <Button variant="primary" onClick={close}>
          {t("product_tour.actions.got_it")}
        </Button>
      </div>
    </ModalCore>
  );
});
