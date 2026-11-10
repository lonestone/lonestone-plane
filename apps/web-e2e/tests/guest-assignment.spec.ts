/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createWorkItems, expect, fetchWorkItem, test } from "./fixtures";
import {
  addProjectMember,
  getProject,
  ROLE,
  setProjectLayout,
  setGuestAccess,
  setGuestCollaboration,
  updateWorkItem,
} from "./helpers/plane";
import { barButton, bulkBar, toggleWorkItem } from "./helpers/ui";
import { projectIssuesUrl } from "./helpers/urls";

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

// Plane keeps "Your work" to workspace admins and members: a guest finds their work items in the project.
test("an assigned guest finds the work item in the project, opens and comments it", async ({ browser, project }) => {
  const guestContext = await browser.newContext();
  const guest = await addProjectMember(
    project.session,
    guestContext.request,
    project.workspaceSlug,
    project.projectId,
    ROLE.guest
  );
  await setGuestCollaboration(project.session, project.workspaceSlug, project.projectId, true);
  await setGuestAccess(project.session, project.workspaceSlug, project.projectId, true);
  // created by the owner, not by the guest
  const [workItem] = await createWorkItems(project, ["Validate the mockups"]);
  await updateWorkItem(project.session, project.workspaceSlug, project.projectId, workItem.id, {
    assignee_ids: [guest.id],
  });

  const guestPage = await guestContext.newPage();
  await guestPage.goto(projectIssuesUrl(project.workspaceSlug, project.projectId));
  await guestPage.getByText("Validate the mockups").first().click();

  await expect(guestPage.getByRole("textbox", { name: "Work item title" })).toHaveValue("Validate the mockups", {
    timeout: 30_000,
  });
  // the comment editor has no accessible name: its "Add comment" text is a placeholder
  await guestPage.locator('[contenteditable="true"]').last().click();
  await guestPage.keyboard.type("Looks good to me");
  await guestPage.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(guestPage.getByText("Looks good to me").first()).toBeVisible();
  await guestContext.close();
});

test("guests stay out of the assignees without collaboration, and out of the lead fields", async ({
  page,
  browser,
  project,
}) => {
  const guestContext = await browser.newContext();
  const guest = await addProjectMember(
    project.session,
    guestContext.request,
    project.workspaceSlug,
    project.projectId,
    ROLE.guest
  );
  await setGuestAccess(project.session, project.workspaceSlug, project.projectId, true);
  const [workItem] = await createWorkItems(project, ["Internal task"]);
  const guestOption = page.getByRole("option", { name: new RegExp(guest.displayName) });

  // no collaboration: the assignees are the members only
  await page.goto(`/${project.workspaceSlug}/browse/BULK-${workItem.sequence_id}/`);
  await page.getByRole("button", { name: "Add assignees" }).first().click();
  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(guestOption).toHaveCount(0);

  // with collaboration, a lead is still a member
  await setGuestCollaboration(project.session, project.workspaceSlug, project.projectId, true);
  await page.goto(`/${project.workspaceSlug}/projects/${project.projectId}/modules`);
  await page
    .getByRole("button", { name: /add module|create module|new module/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Lead" }).first().click();
  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(guestOption).toHaveCount(0);
  await guestContext.close();
});

test.describe("Guest access off: a guest is shown but cannot be assigned yet", () => {
  test("an admin turns Guest access on from the explanation and assigns the guest", async ({
    page,
    browser,
    project,
  }) => {
    const guestContext = await browser.newContext();
    const guest = await addProjectMember(
      project.session,
      guestContext.request,
      project.workspaceSlug,
      project.projectId,
      ROLE.guest
    );
    await setGuestCollaboration(project.session, project.workspaceSlug, project.projectId, true);
    await setGuestAccess(project.session, project.workspaceSlug, project.projectId, false);
    const [workItem] = await createWorkItems(project, ["Send the invoice"]);

    await page.goto(`/${project.workspaceSlug}/browse/BULK-${workItem.sequence_id}/`);
    const guestOption = page.getByRole("option", { name: new RegExp(`${guest.displayName} · Guest$`) });
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: "Add assignees" }).first().click();
    await guestOption.click();

    // the guest is not assigned: a dialog explains why
    await expect(dialog.getByText("This guest can't see the work item yet")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    expect((await fetchWorkItem(project, workItem)).assignee_ids).toEqual([]);
    expect((await getProject(project.session, project.workspaceSlug, project.projectId)).guest_view_all_features).toBe(
      false
    );

    // the admin turns Guest access on and assigns in one go
    if (!(await guestOption.isVisible())) await page.getByRole("button", { name: "Add assignees" }).first().click();
    await guestOption.click();
    await dialog.getByRole("button", { name: "Turn on Guest access and assign" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await fetchWorkItem(project, workItem)).assignee_ids).toEqual([guest.id]);
    expect((await getProject(project.session, project.workspaceSlug, project.projectId)).guest_view_all_features).toBe(
      true
    );
    await guestContext.close();
  });

  test("a member who is not admin is asked to contact an admin, and nothing changes", async ({ browser, project }) => {
    const guestContext = await browser.newContext();
    const guest = await addProjectMember(
      project.session,
      guestContext.request,
      project.workspaceSlug,
      project.projectId,
      ROLE.guest
    );
    const memberContext = await browser.newContext();
    await addProjectMember(
      project.session,
      memberContext.request,
      project.workspaceSlug,
      project.projectId,
      ROLE.member
    );
    await setGuestCollaboration(project.session, project.workspaceSlug, project.projectId, true);
    await setGuestAccess(project.session, project.workspaceSlug, project.projectId, false);
    const [workItem] = await createWorkItems(project, ["Book the room"]);

    const memberPage = await memberContext.newPage();
    await memberPage.goto(`/${project.workspaceSlug}/browse/BULK-${workItem.sequence_id}/`);
    await memberPage.getByRole("button", { name: "Add assignees" }).first().click();
    await memberPage.getByRole("option", { name: new RegExp(`${guest.displayName} · Guest$`) }).click();

    const dialog = memberPage.getByRole("dialog");
    await expect(dialog.getByText("Ask a project admin to turn on Guest access")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Turn on Guest access and assign" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    expect((await fetchWorkItem(project, workItem)).assignee_ids).toEqual([]);
    expect((await getProject(project.session, project.workspaceSlug, project.projectId)).guest_view_all_features).toBe(
      false
    );
    await guestContext.close();
    await memberContext.close();
  });
});

test("guests are assigned from the bulk actions bar and get their own column when grouping by assignees", async ({
  page,
  browser,
  project,
}) => {
  const guestContext = await browser.newContext();
  const guest = await addProjectMember(
    project.session,
    guestContext.request,
    project.workspaceSlug,
    project.projectId,
    ROLE.guest
  );
  await setGuestCollaboration(project.session, project.workspaceSlug, project.projectId, true);
  await setGuestAccess(project.session, project.workspaceSlug, project.projectId, true);
  const items = await createWorkItems(project, ["Kickoff deck", "Budget sheet"]);

  // bulk actions bar: the guest is offered and assigned to every selected work item
  await page.goto(projectIssuesUrl(project.workspaceSlug, project.projectId));
  for (const item of items) {
    // oxlint-disable-next-line no-await-in-loop
    await toggleWorkItem(page, item.id);
  }
  await expect(bulkBar(page)).toContainText("2 selected");
  await barButton(page, "Assignees").click();
  await page
    .getByRole("menu", { name: "Assignees" })
    .getByRole("menuitemcheckbox", { name: new RegExp(`${guest.displayName} · Guest`) })
    .click();
  for (const item of items) {
    // oxlint-disable-next-line no-await-in-loop
    await expect.poll(async () => (await fetchWorkItem(project, item)).assignee_ids).toEqual([guest.id]);
  }

  // grouping by assignees: the guest has a column with both work items
  await setProjectLayout(project.session, project.workspaceSlug, project.projectId, {
    layout: "kanban",
    group_by: "assignees",
  });
  await page.goto(projectIssuesUrl(project.workspaceSlug, project.projectId));
  // column header: the guest's name and the count of its work items (the header shows the bare name)
  await expect(page.getByText(new RegExp(`${guest.displayName}\\s*2$`)).first()).toBeVisible({ timeout: 30_000 });
  for (const item of items) {
    // oxlint-disable-next-line no-await-in-loop
    await expect(page.getByText(item.name).first()).toBeVisible();
  }
  await guestContext.close();
});
