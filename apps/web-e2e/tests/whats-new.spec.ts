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

// The fork's "What's new" dialog: the release notes of apps/web/oe/components/announcements/release-notes.ts

const NOTE = "release-notes.lonestone.13";

/** Users joined before a note's date see it: test users all join today. */
function joinedLongAgo(userId: string): void {
  djangoShell(`from plane.db.models import User; User.objects.filter(id="${userId}").update(date_joined="2020-01-01")`);
}

/** Opens a page and waits for what the dialog depends on: the notes seen, and the role in the workspace. */
async function openProject(page: Page, workspaceSlug: string, projectId: string): Promise<void> {
  const loaded = Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/extended/users/me/announcements/")),
    page.waitForResponse((response) => response.url().includes(`/workspaces/${workspaceSlug}/workspace-members/me/`)),
  ]);
  await page.goto(projectIssuesUrl(workspaceSlug, projectId));
  await loaded;
  // a dialog would open on the next render
  await page.waitForTimeout(1000);
}

test("a workspace member who joined before the release is told what's new, once", async ({ page, project }) => {
  joinedLongAgo((await getCurrentUser(project.session)).id);

  await page.goto(projectIssuesUrl(project.workspaceSlug, project.projectId));
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "What's new?" })).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole("heading", { name: "Archive your whole inbox" })).toBeVisible();
  await expect(dialog.getByRole("img", { name: "The Archive all button in the inbox header" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Attach files when creating a work item" })).toBeVisible();
  await expect(dialog.getByRole("img", { name: "The work item modal with two files attached" })).toBeVisible();

  const seen = page.waitForResponse(
    (response) => response.url().includes(`/announcements/${NOTE}/seen/`) && response.request().method() === "POST"
  );
  await dialog.getByRole("button", { name: "Got it" }).click();
  expect((await seen).ok()).toBe(true);
  await expect(dialog).toBeHidden();

  await openProject(page, project.workspaceSlug, project.projectId);
  await expect(page.getByRole("heading", { name: "What's new?" })).toHaveCount(0);
});

test("a guest, or a user who joined after the release, is not told", async ({ page, browser, project }) => {
  const { member: guest, context } = await addMemberWithContext(browser, project, ROLE.guest);
  joinedLongAgo(guest.id);
  const guestPage = await context.newPage();
  await openProject(guestPage, project.workspaceSlug, project.projectId);
  await expect(guestPage.getByRole("heading", { name: "What's new?" })).toHaveCount(0);
  await context.close();

  // the fixture's owner, a workspace admin, joined today
  await openProject(page, project.workspaceSlug, project.projectId);
  await expect(page.getByRole("heading", { name: "What's new?" })).toHaveCount(0);
});
