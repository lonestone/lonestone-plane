/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Page } from "@playwright/test";
import { addMemberWithContext, createWorkItems, expect, test } from "./fixtures";
import {
  addProjectSubscriber,
  getCurrentUser,
  isSubscribed,
  listNotifications,
  listProjectSubscriberIds,
  ROLE,
  setEmailPreferences,
} from "./helpers/plane";
import { emailsTo } from "./helpers/mail";
import { projectMembersSettingsUrl, WEB_URL, workItemUrl } from "./helpers/urls";

// LONESTONEP-8: project admins are project subscribers by default and choose the others in Project
// Settings → Members; a project subscriber follows every new work item of the project and is told of it
// (Inbox and email).

/**
 * The subscribers picker of the "Project subscribers" section. Upstream's dropdown nests its button in
 * another one, the first, which is the one that gets disabled.
 */
function picker(page: Page) {
  return page
    .getByText("Project subscribers", { exact: true })
    .locator("xpath=ancestor::div[.//button][1]")
    .getByRole("button")
    .first();
}

/** Picks an option of the open picker and waits for the API to save the change. */
async function toggleOption(page: Page, name: RegExp, method: "POST" | "DELETE") {
  const saved = page.waitForResponse(
    (response) => response.url().includes("/subscribers/") && response.request().method() === method
  );
  await page.getByRole("option", { name }).click();
  expect((await saved).ok()).toBe(true);
  await page.keyboard.press("Escape");
}

/** Subjects of the emails received by this address. */
async function subjectsTo(address: string): Promise<string[]> {
  return (await emailsTo(address)).map((email) => email.Subject);
}

test("an admin adds and removes a project subscriber, among the members only", async ({ page, browser, project }) => {
  const { member, context } = await addMemberWithContext(browser, project);
  const { member: guest, context: guestContext } = await addMemberWithContext(browser, project, ROLE.guest);
  // option names start with the avatar's initial
  const memberOption = new RegExp(` ${member.displayName}$`);

  const owner = await getCurrentUser(project.session);
  // the project admin is a subscriber by default
  expect(await listProjectSubscriberIds(project.session, project.workspaceSlug, project.projectId)).toEqual([owner.id]);

  await page.goto(projectMembersSettingsUrl(project.workspaceSlug, project.projectId));
  await picker(page).click();
  await expect(page.getByRole("option", { name: memberOption })).toBeVisible();
  // guests cannot be project subscribers
  await expect(page.getByRole("option", { name: new RegExp(` ${guest.displayName}$`) })).toHaveCount(0);
  await toggleOption(page, memberOption, "POST");
  expect(await listProjectSubscriberIds(project.session, project.workspaceSlug, project.projectId)).toEqual([
    owner.id,
    member.id,
  ]);

  await page.reload();
  await picker(page).click();
  await toggleOption(page, memberOption, "DELETE");
  expect(await listProjectSubscriberIds(project.session, project.workspaceSlug, project.projectId)).toEqual([owner.id]);

  // the admin removes themselves
  await page.reload();
  await picker(page).click();
  await toggleOption(page, / You$/, "DELETE");
  expect(await listProjectSubscriberIds(project.session, project.workspaceSlug, project.projectId)).toEqual([]);
  await page.reload();
  await expect(picker(page)).toContainText("Add subscribers");
  await context.close();
  await guestContext.close();
});

test("a member sees the project subscribers without changing them", async ({ browser, project }) => {
  const { member, context } = await addMemberWithContext(browser, project);
  await addProjectSubscriber(project.session, project.workspaceSlug, project.projectId, member.id);

  const memberPage = await context.newPage();
  await memberPage.goto(projectMembersSettingsUrl(project.workspaceSlug, project.projectId));
  const subscribers = picker(memberPage);
  await expect(subscribers).toBeVisible();
  await expect(subscribers).toBeDisabled();
  await context.close();
});

test("a project subscriber follows a new work item and is told of it in the Inbox and by email", async ({
  browser,
  project,
}) => {
  const { member, context } = await addMemberWithContext(browser, project);
  await addProjectSubscriber(project.session, project.workspaceSlug, project.projectId, member.id);
  const [workItem] = await createWorkItems(project, ["Homepage mock-up"]);

  // subscribed to the work item
  await expect
    .poll(() => isSubscribed(member.session, project.workspaceSlug, project.projectId, workItem.id))
    .toBe(true);
  const memberPage = await context.newPage();
  await memberPage.goto(workItemUrl(project.workspaceSlug, workItem.sequence_id));
  await expect(memberPage.getByRole("button", { name: "Unsubscribe" })).toBeVisible();

  // told of the creation in the Inbox (sent by the worker)
  await expect
    .poll(async () => (await listNotifications(member.session, project.workspaceSlug)).length, { timeout: 30_000 })
    .toBe(1);
  await memberPage.goto(`${WEB_URL}/${project.workspaceSlug}/notifications/`);
  await expect(memberPage.getByText("created the work item")).toBeVisible();

  // and by email, sent at once by the fork (not batched with the work item's updates)
  await expect
    .poll(() => subjectsTo(member.email), { timeout: 30_000 })
    .toEqual(
      expect.arrayContaining([
        expect.stringMatching(new RegExp(` created \\S+-${workItem.sequence_id} Homepage mock-up$`)),
      ])
    );
  await context.close();
});

test("a project subscriber who turned off property change emails is only told in the Inbox", async ({
  browser,
  project,
}) => {
  const { member, context } = await addMemberWithContext(browser, project);
  // a second subscriber keeps the emails: once theirs has arrived, the emails of this work item are sent
  const { member: witness, context: witnessContext } = await addMemberWithContext(browser, project);
  await Promise.all(
    [member, witness].map((subscriber) =>
      addProjectSubscriber(project.session, project.workspaceSlug, project.projectId, subscriber.id)
    )
  );
  await setEmailPreferences(member.session, { property_change: false });
  await createWorkItems(project, ["Footer links"]);

  await expect
    .poll(async () => (await listNotifications(member.session, project.workspaceSlug)).length, { timeout: 30_000 })
    .toBe(1);
  await expect
    .poll(() => subjectsTo(witness.email), { timeout: 30_000 })
    .toEqual(expect.arrayContaining([expect.stringMatching(/ Footer links$/)]));
  expect((await subjectsTo(member.email)).filter((subject) => subject.includes("Footer links"))).toEqual([]);
  await context.close();
  await witnessContext.close();
});
