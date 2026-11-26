/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Page } from "@playwright/test";
import { addMemberWithContext, expect, test } from "./fixtures";
import { getCurrentUser, ROLE } from "./helpers/plane";
import { djangoShell } from "./helpers/mail";
import { projectIssuesUrl } from "./helpers/urls";

// The fork's "What's new" dialog: the latest entry of apps/web/oe/components/announcements/release-notes.ts

const NOTE = { key: "release-notes.lonestone.13", date: "2026-11-25" };
/** Keys of the entries before NOTE, still in RELEASE_NOTES: marked seen, since the dialog shows the oldest unseen. */
const OLDER_NOTES: string[] = [];

/** Test users join today, after the note: move their sign-up date, and mark the older notes seen. */
function joinedOn(userId: string, dateJoined: string): void {
  const seen = OLDER_NOTES.map((key) => `UserAnnouncement.objects.get_or_create(user_id="${userId}", key="${key}")`);
  djangoShell(
    [
      "from plane.db.models import User",
      "from plane.extended.models import UserAnnouncement",
      `User.objects.filter(id="${userId}").update(date_joined="${dateJoined}")`,
      ...seen,
    ].join("; ")
  );
}

function whatsNew(page: Page) {
  return page.getByRole("heading", { name: "What's new?" });
}

/** Opens a project once the dialog has what it needs (the notes seen, the role) and the page is drawn. */
async function openProject(page: Page, workspaceSlug: string, projectId: string): Promise<void> {
  const loaded = Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/extended/users/me/announcements/")),
    page.waitForResponse((response) => response.url().includes(`/workspaces/${workspaceSlug}/workspace-members/me/`)),
  ]);
  await page.goto(projectIssuesUrl(workspaceSlug, projectId));
  await loaded;
  await expect(page.getByRole("link", { name: "Projects", exact: true }).first()).toBeVisible({ timeout: 30_000 });
}

function seenRequest(page: Page) {
  return page.waitForResponse(
    (response) => response.url().includes(`/announcements/${NOTE.key}/seen/`) && response.request().method() === "POST"
  );
}

test("a workspace admin who joined before the release is told what's new, once", async ({ page, project }) => {
  joinedOn((await getCurrentUser(project.session)).id, "2020-01-01T09:00:00Z");

  await page.goto(projectIssuesUrl(project.workspaceSlug, project.projectId));
  await expect(whatsNew(page)).toBeVisible({ timeout: 30_000 });
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Archive your whole inbox" })).toBeVisible();
  await expect(dialog.getByRole("img", { name: "The Archive all button in the inbox header" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Attach files when creating a work item" })).toBeVisible();
  await expect(dialog.getByRole("img", { name: "The work item modal with two files attached" })).toBeVisible();

  const seen = seenRequest(page);
  await dialog.getByRole("button", { name: "Got it" }).click();
  expect((await seen).ok()).toBe(true);
  await expect(whatsNew(page)).toBeHidden();

  await openProject(page, project.workspaceSlug, project.projectId);
  await expect(whatsNew(page)).toHaveCount(0);
});

test("a workspace member is told too, and closing the dialog marks it seen", async ({ browser, project }) => {
  const { member, context } = await addMemberWithContext(browser, project, ROLE.member);
  joinedOn(member.id, "2020-01-01T09:00:00Z");
  const page = await context.newPage();

  await page.goto(projectIssuesUrl(project.workspaceSlug, project.projectId));
  await expect(whatsNew(page)).toBeVisible({ timeout: 30_000 });
  const seen = seenRequest(page);
  await page.keyboard.press("Escape");
  expect((await seen).ok()).toBe(true);
  await expect(whatsNew(page)).toBeHidden();

  await openProject(page, project.workspaceSlug, project.projectId);
  await expect(whatsNew(page)).toHaveCount(0);
  await context.close();
});

test("a guest, or a user who joined on the release day or after, is not told", async ({ page, browser, project }) => {
  const { member: guest, context } = await addMemberWithContext(browser, project, ROLE.guest);
  joinedOn(guest.id, "2020-01-01T09:00:00Z");
  const guestPage = await context.newPage();
  await openProject(guestPage, project.workspaceSlug, project.projectId);
  await expect(whatsNew(guestPage)).toHaveCount(0);
  await context.close();

  // the fixture's owner, a workspace admin, joined on the release day (local noon)
  const ownerId = (await getCurrentUser(project.session)).id;
  joinedOn(ownerId, new Date(`${NOTE.date}T12:00:00`).toISOString());
  await openProject(page, project.workspaceSlug, project.projectId);
  await expect(whatsNew(page)).toHaveCount(0);
});
