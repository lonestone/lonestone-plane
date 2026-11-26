/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import archiveAll from "./assets/lonestone-13-archive-all.png?url";
import modalAttachments from "./assets/lonestone-13-modal-attachments.png?url";

/** A text in English, and in French when the fork has it: other languages read the English one. */
export type TLocalizedText = { en: string; fr?: string };

export type TReleaseNoteAudience = "admins" | "members" | "all";

export type TReleaseNote = {
  /** Recorded as seen by the server: never change it once released. */
  key: string;
  /** Users who joined on or after this day do not see the note. */
  date: string;
  /** By role in the current workspace: "members" are admins and members, without guests. */
  audience: TReleaseNoteAudience;
  items: { title: TLocalizedText; body: TLocalizedText; image: string; imageAlt: TLocalizedText }[];
};

/** One entry per release, oldest first. An entry everyone has seen can be deleted with its images. */
export const RELEASE_NOTES: TReleaseNote[] = [
  {
    key: "release-notes.lonestone.13",
    date: "2026-11-25",
    audience: "members",
    items: [
      {
        title: { en: "Archive your whole inbox", fr: "Archivez toute votre Inbox" },
        body: {
          en: "Archive all, next to Mark all as read, archives every notification of the current view after a confirmation. Find them again with Show archived.",
          fr: "Archive all, à côté de Mark all as read, archive après confirmation toutes les notifications de la vue affichée. Vous les retrouvez avec Show archived.",
        },
        image: archiveAll,
        imageAlt: {
          en: "The Archive all button in the inbox header",
          fr: "Le bouton Archive all dans l'en-tête de l'Inbox",
        },
      },
      {
        title: { en: "Attach files when creating a work item", fr: "Joignez des fichiers dès la création d'un ticket" },
        body: {
          en: "Attach file in the work item modal, or a file dropped on it, adds attachments that are sent once the work item is saved.",
          fr: "Attach file dans la fenêtre du ticket, ou un fichier glissé dessus, ajoute des pièces jointes, envoyées à l'enregistrement du ticket.",
        },
        image: modalAttachments,
        imageAlt: {
          en: "The work item modal with two files attached",
          fr: "La fenêtre de création d'un ticket avec deux fichiers joints",
        },
      },
    ],
  },
];
