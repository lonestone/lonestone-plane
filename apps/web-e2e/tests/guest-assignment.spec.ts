/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createWorkItems, expect, fetchWorkItem, test } from "./fixtures";
import { addProjectMember, ROLE, setGuestAccess, setGuestCollaboration } from "./helpers/plane";

// LONESTONEP-4: on a project that allows guests to collaborate and has Guest access on, guests can
// be assigned to work items. They read "Name · Guest" in the assignee lists.

test("a guest is offered in the assignees and can be assigned", async ({ page, browser, project }) => {
  const guestContext = await browser.newContext();
  const guest = await addProjectMember(
    project.session,
    guestContext.request,
    project.workspaceSlug,
    project.projectId,
    ROLE.guest
  );
  const member = await addProjectMember(
    project.session,
    (await browser.newContext()).request,
    project.workspaceSlug,
    project.projectId,
    ROLE.member
  );
  await setGuestCollaboration(project.session, project.workspaceSlug, project.projectId, true);
  await setGuestAccess(project.session, project.workspaceSlug, project.projectId, true);
  const [workItem] = await createWorkItems(project, ["Review the quote"]);

  await page.goto(`/${project.workspaceSlug}/browse/BULK-${workItem.sequence_id}/`);
  await page.getByRole("button", { name: "Add assignees" }).first().click();

  // the guest is listed with the "Guest" label; members are not
  // option names start with the avatar's initial
  const guestOption = page.getByRole("option", { name: new RegExp(`${guest.displayName} · Guest$`) });
  await expect(guestOption).toBeVisible();
  await expect(page.getByRole("option", { name: new RegExp(` ${member.displayName}$`) })).toBeVisible();

  await guestOption.click();
  await page.keyboard.press("Escape");

  await expect.poll(async () => (await fetchWorkItem(project, workItem)).assignee_ids).toEqual([guest.id]);
  await page.reload();
  await expect(page.getByText(`${guest.displayName} · Guest`).first()).toBeVisible();
  await guestContext.close();
});
