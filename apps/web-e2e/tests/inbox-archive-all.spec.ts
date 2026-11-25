/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { BrowserContext, Page } from "@playwright/test";
import { addMemberWithContext, createWorkItems, expect, test } from "./fixtures";
import type { ProjectFixture } from "./fixtures";
import { addProjectSubscriber, listMentions, listNotifications, updateWorkItem } from "./helpers/plane";
import { inboxUrl } from "./helpers/urls";

// LONESTONEP-14: "Archive all" in the inbox header archives every notification of the view.

/** A project subscriber (LONESTONEP-8), told of each new work item, with their inbox open. */
async function subscriberWithInbox(
  browser: Parameters<typeof addMemberWithContext>[0],
  project: ProjectFixture,
  workItemNames: string[]
): Promise<{
  member: Awaited<ReturnType<typeof addMemberWithContext>>["member"];
  context: BrowserContext;
  page: Page;
}> {
  const { member, context } = await addMemberWithContext(browser, project);
  await addProjectSubscriber(project.session, project.workspaceSlug, project.projectId, member.id);
  await createWorkItems(project, workItemNames);
  await expect
    .poll(async () => (await listNotifications(member.session, project.workspaceSlug)).length, { timeout: 30_000 })
    .toBe(workItemNames.length);
  const page = await context.newPage();
  await page.goto(inboxUrl(project.workspaceSlug));
  return { member, context, page };
}

/** The unread count shown next to a tab label. */
function tab(page: Page, label: "All" | "Mentions") {
  return page.getByText(label, { exact: true }).locator("..");
}

test("a member archives their whole inbox at once, after confirming", async ({ browser, project }) => {
  const { member, context, page } = await subscriberWithInbox(browser, project, ["Homepage mock-up", "Pricing page"]);
  const cards = page.getByText("created the work item");
  await expect(cards).toHaveCount(2, { timeout: 30_000 });
  await expect(tab(page, "All")).toHaveText(/2$/);
  // the header button is labelled; the confirm button of the dialog bears the same text
  const archiveAll = page.getByLabel("Archive all");

  await archiveAll.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Archive all notifications?")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(cards).toHaveCount(2);

  await archiveAll.click();
  await dialog.getByRole("button", { name: "Archive all" }).click();
  await expect(page.getByText("Notifications archived")).toBeVisible();
  await expect(cards).toHaveCount(0);
  await expect(tab(page, "All")).toHaveText("All");
  expect(await listNotifications(member.session, project.workspaceSlug)).toEqual([]);

  await page.reload();
  await expect(archiveAll).toBeDisabled({ timeout: 30_000 });
  await expect(cards).toHaveCount(0);
  await context.close();
});

test("the cards come back when the archive fails", async ({ browser, project }) => {
  const { member, context, page } = await subscriberWithInbox(browser, project, ["Homepage mock-up", "Pricing page"]);
  const cards = page.getByText("created the work item");
  await expect(cards).toHaveCount(2, { timeout: 30_000 });
  await page.route("**/notifications/archive-all/", (route) => route.fulfill({ status: 500, json: {} }));

  await page.getByLabel("Archive all").click();
  await page.getByRole("dialog").getByRole("button", { name: "Archive all" }).click();

  await expect(page.getByText("The notifications could not be archived. Try again.")).toBeVisible();
  await expect(cards).toHaveCount(2);
  await expect(tab(page, "All")).toHaveText(/2$/);
  expect(await listNotifications(member.session, project.workspaceSlug)).toHaveLength(2);
  await context.close();
});

test("archiving the Mentions tab leaves the other notifications", async ({ browser, project }) => {
  const { member, context, page } = await subscriberWithInbox(browser, project, ["Homepage mock-up"]);
  const [workItem] = await listNotifications(member.session, project.workspaceSlug);
  await updateWorkItem(project.session, project.workspaceSlug, project.projectId, workItem.entity_identifier, {
    description_html: `<p>Over to you <mention-component entity_identifier="${member.id}" entity_name="user_mention"></mention-component></p>`,
  });
  await expect
    .poll(async () => (await listMentions(member.session, project.workspaceSlug)).length, { timeout: 30_000 })
    .toBe(1);
  const before = (await listNotifications(member.session, project.workspaceSlug)).length;

  await page.reload();
  await tab(page, "Mentions").click();
  await expect(tab(page, "Mentions")).toHaveText(/1$/, { timeout: 30_000 });
  await page.getByLabel("Archive all").click();
  await page.getByRole("dialog").getByRole("button", { name: "Archive all" }).click();
  await expect(page.getByText("Notifications archived")).toBeVisible();

  await expect(tab(page, "Mentions")).toHaveText("Mentions");
  expect(await listMentions(member.session, project.workspaceSlug)).toEqual([]);
  expect(await listNotifications(member.session, project.workspaceSlug)).toHaveLength(before);
  await tab(page, "All").click();
  await expect(page.getByText("created the work item")).toBeVisible();
  await context.close();
});
