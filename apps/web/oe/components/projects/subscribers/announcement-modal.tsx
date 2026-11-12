/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Link } from "react-router";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { announcementService } from "@/plane-web/services/announcement.service";
import type { TSubscribedAdminProject } from "@/plane-web/services/announcement.service";
import howToUnsubscribe from "./assets/how-to-unsubscribe.png?url";

const SWR_KEY = "EXTENDED_PROJECT_SUBSCRIBERS_ANNOUNCEMENT";

function groupByWorkspace(projects: TSubscribedAdminProject[]): [string, TSubscribedAdminProject[]][] {
  const groups = new Map<string, TSubscribedAdminProject[]>();
  for (const project of projects) {
    groups.set(project.workspace_name, [...(groups.get(project.workspace_name) ?? []), project]);
  }
  return [...groups.entries()];
}

/**
 * Shown once to the users who were project admins when LONESTONEP-8 shipped (the server keeps who has
 * seen it): project admins now follow every new work item of their projects, and can remove themselves.
 * Rendered by upstream's GlobalModals (core/components/common/modal/global.tsx).
 */
export function ProjectSubscribersAnnouncementModal() {
  const { t } = useTranslation();
  const { data, mutate } = useSWR(SWR_KEY, () => announcementService.projectSubscribers(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const close = () => {
    void mutate({ show: false, projects: [] }, { revalidate: false });
    void announcementService.markProjectSubscribersSeen().catch(() => undefined);
  };

  if (!data?.show) return null;

  return (
    <ModalCore isOpen handleClose={close} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-16 font-medium">{t("project_settings.subscribers.announcement.title")}</h3>
        <p className="text-13 text-secondary">{t("project_settings.subscribers.announcement.projects")}</p>
        <ul className="flex max-h-40 flex-col gap-2 overflow-y-auto text-13">
          {groupByWorkspace(data.projects).map(([workspaceName, projects]) => (
            <li key={workspaceName}>
              <span className="font-medium">{workspaceName}</span>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 pl-3">
                {projects.map((project) => (
                  <li key={project.project_id}>
                    <Link
                      to={`/${project.workspace_slug}/settings/projects/${project.project_id}/members/`}
                      onClick={close}
                      className="text-accent-primary hover:underline"
                    >
                      {project.project_name}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <p className="text-13 text-secondary">{t("project_settings.subscribers.announcement.body")}</p>
        <p className="text-13 text-secondary">{t("project_settings.subscribers.announcement.how_to")}</p>
        <img
          src={howToUnsubscribe}
          alt={t("project_settings.subscribers.announcement.image_alt")}
          className="w-full rounded-md border-[0.5px] border-subtle"
        />
      </div>
      <div className="flex justify-end border-t-[0.5px] border-subtle px-5 py-4">
        <Button variant="primary" onClick={close}>
          {t("project_settings.subscribers.announcement.got_it")}
        </Button>
      </div>
    </ModalCore>
  );
}
