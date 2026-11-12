/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { addMemberWithContext, expect, test } from "./fixtures";
import { ROLE } from "./helpers/plane";
import { projectIssuesUrl, projectMembersSettingsUrl } from "./helpers/urls";

test("a guest can create work items and use cycles once the project allows guests to collaborate", async ({
  page,
  browser,
  project,
}) => {
  const { context: guestContext } = await addMemberWithContext(browser, project, ROLE.guest);
  const guestPage = await guestContext.newPage();
  const issuesUrl = projectIssuesUrl(project.workspaceSlug, project.projectId);
  const addWorkItem = guestPage.getByRole("button", { name: "Add work item" });
  const cycles = guestPage.getByRole("link", { name: "Cycles" }).first();

  // upstream: a guest can neither create work items nor see cycles
  await guestPage.goto(issuesUrl);
  await expect(guestPage.getByText("Bulk edit").first()).toBeVisible({ timeout: 30_000 });
  await expect(addWorkItem).toBeHidden();
  await expect(cycles).toBeHidden();

  // the project admin allows guests to collaborate
  await page.goto(projectMembersSettingsUrl(project.workspaceSlug, project.projectId));
  const setting = page
    .getByText("Allow guests to collaborate", { exact: true })
    .locator("xpath=ancestor::div[.//button[@role='switch']][1]");
  await setting.getByRole("switch").click();
  await expect(setting.getByRole("switch")).toHaveAttribute("aria-checked", "true");

  await guestPage.goto(issuesUrl);
  await expect(addWorkItem).toBeVisible({ timeout: 30_000 });
  await expect(cycles).toBeVisible();
  await guestContext.close();
});
