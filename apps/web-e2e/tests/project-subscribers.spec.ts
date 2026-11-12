/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Browser, Page } from "@playwright/test";
import { createWorkItems, expect, test } from "./fixtures";
import type { ProjectFixture } from "./fixtures";
import {
  addProjectMember,
  addProjectSubscriber,
  isSubscribed,
  listNotifications,
  ROLE,
  setEmailPreferences,
} from "./helpers/plane";
import { emailsTo, sendQueuedNotificationEmails } from "./helpers/mail";
import { WEB_URL, workItemUrl } from "./helpers/urls";

// LONESTONEP-8: project admins choose project subscribers in Project Settings → Members; a project
// subscriber follows every new work item of the project and is told of it (Inbox and email).

/** The subscribers picker: upstream's dropdown nests its button in another one, the one that is disabled. */
function picker(page: Page, name: string | RegExp) {
  return page.getByRole("button", { name }).first();
}

function membersSettingsUrl(project: ProjectFixture): string {
  return `${WEB_URL}/${project.workspaceSlug}/settings/projects/${project.projectId}/members/`;
}

/** A project member logged in in their own browser context. */
async function addMember(browser: Browser, project: ProjectFixture) {
  const context = await browser.newContext();
  const member = await addProjectMember(
    project.session,
    context.request,
    project.workspaceSlug,
    project.projectId,
    ROLE.member
  );
  return { member, context };
}

test("an admin adds and removes a project subscriber", async ({ page, browser, project }) => {
  const { member, context } = await addMember(browser, project);

  await page.goto(membersSettingsUrl(project));
  await picker(page, "Add subscribers").click();
  // option names start with the avatar's initial
  await page.getByRole("option", { name: new RegExp(` ${member.displayName}$`) }).click();
  await page.keyboard.press("Escape");

  await page.reload();
  // the button shows the subscriber's avatar initial, then their name
  await expect(picker(page, new RegExp(` ${member.displayName}$`))).toBeVisible();

  await picker(page, new RegExp(` ${member.displayName}$`)).click();
  await page.getByRole("option", { name: new RegExp(` ${member.displayName}$`) }).click();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(picker(page, "Add subscribers")).toBeVisible();
  await context.close();
});

test("a member sees the project subscribers without changing them", async ({ browser, project }) => {
  const { member, context } = await addMember(browser, project);
  await addProjectSubscriber(project.session, project.workspaceSlug, project.projectId, member.id);

  const memberPage = await context.newPage();
  await memberPage.goto(membersSettingsUrl(project));
  const subscribers = picker(memberPage, new RegExp(` ${member.displayName}$`));
  await expect(subscribers).toBeVisible();
  await expect(subscribers).toBeDisabled();
  await context.close();
});

test("a project subscriber follows a new work item and is told of it in the Inbox and by email", async ({
  browser,
  project,
}) => {
  const { member, context } = await addMember(browser, project);
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

  // and by email
  await expect
    .poll(
      async () => {
        sendQueuedNotificationEmails();
        return (await emailsTo(member.email)).map((email) => email.Subject);
      },
      { timeout: 30_000, intervals: [1_000, 2_000] }
    )
    .toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`-${workItem.sequence_id} Homepage mock-up$`))]));
  await context.close();
});

test("a project subscriber who turned off property change emails is only told in the Inbox", async ({
  browser,
  project,
}) => {
  const { member, context } = await addMember(browser, project);
  await addProjectSubscriber(project.session, project.workspaceSlug, project.projectId, member.id);
  await setEmailPreferences(member.session, { property_change: false });
  await createWorkItems(project, ["Footer links"]);

  await expect
    .poll(async () => (await listNotifications(member.session, project.workspaceSlug)).length, { timeout: 30_000 })
    .toBe(1);
  sendQueuedNotificationEmails();
  const subjects = (await emailsTo(member.email)).map((email) => email.Subject);
  expect(subjects.filter((subject) => subject.includes("Footer links"))).toEqual([]);
  await context.close();
});
