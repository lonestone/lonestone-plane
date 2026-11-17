/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Link } from "react-router";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TSubscribedAdminProject } from "@/plane-web/services/announcement.service";
import type { TAnnouncementProps } from "./registry";
import howToUnsubscribe from "./assets/how-to-unsubscribe.png?url";

function groupByWorkspace(projects: TSubscribedAdminProject[]): [string, TSubscribedAdminProject[]][] {
  const groups = new Map<string, TSubscribedAdminProject[]>();
  for (const project of projects) {
    groups.set(project.workspace_name, [...(groups.get(project.workspace_name) ?? []), project]);
  }
  return [...groups.entries()];
}

/** LONESTONEP-8: project admins now follow their projects' new work items. */
export function ProjectSubscribersAnnouncement({ data, close }: TAnnouncementProps<"project_subscribers">) {
  const { t } = useTranslation();

  return (
    <>
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
    </>
  );
}
