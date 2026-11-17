/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { expect, test } from "./fixtures";
import { inboxUrl } from "./helpers/urls";

// LONESTONEP-7: the inbox replaces the sidebar; upstream's App Rail, enabled by the fork, leads back home.
test("the app rail leads back home from the inbox", async ({ page, project }) => {
  await page.goto(inboxUrl(project.workspaceSlug));
  const projects = page.getByRole("link", { name: "Projects", exact: true });
  await expect(projects).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Home", exact: true })).toBeHidden();

  // a click before the page is hydrated is lost: click again until it navigates
  await expect(async () => {
    await projects.click();
    await expect(page).toHaveURL(new RegExp(`/${project.workspaceSlug}/?$`), { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  await expect(page.getByRole("link", { name: "Home", exact: true }).first()).toBeVisible();
});
