/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Page } from "@playwright/test";
import { createWorkItems, expect, fetchWorkItem, stateId, test } from "./fixtures";
import type { TWorkItem } from "./helpers/plane";
import { addCycleWorkItems, addModuleWorkItems, createCycle, createModule, setProjectLayout } from "./helpers/plane";
import { applyOption, barButton, bulkBar, toggleWorkItem, workItem } from "./helpers/ui";
import { cycleIssuesUrl, moduleIssuesUrl, projectIssuesUrl } from "./helpers/urls";

async function selectAll(page: Page, items: TWorkItem[]): Promise<void> {
  await expect(workItem(page, items[0].id)).toBeVisible({ timeout: 30_000 });
  for (const item of items) {
    // oxlint-disable-next-line no-await-in-loop
    await toggleWorkItem(page, item.id);
  }
  await expect(bulkBar(page)).toContainText(`${items.length} selected`);
}

/**
 * Opens the cycle or module sidebar, which shows the "completed/total" progress. It starts collapsed
 * because it would cover the bulk actions bar. The button has no accessible name upstream.
 */
async function openSidebar(page: Page): Promise<void> {
  await page.locator("button:has(svg.lucide-panel-right)").click();
}

test("spreadsheet layout: a bulk state change updates every selected work item", async ({ page, project }) => {
  const items = await createWorkItems(project, ["Row A", "Row B"]);
  await setProjectLayout(project.session, project.workspaceSlug, project.projectId, { layout: "spreadsheet" });

  await page.goto(projectIssuesUrl(project.workspaceSlug, project.projectId));
  await selectAll(page, items);
  await applyOption(page, "State", "In Progress", 2);

  for (const item of items) {
    // oxlint-disable-next-line no-await-in-loop
    expect((await fetchWorkItem(project, item)).state_id).toBe(stateId(project, "In Progress"));
  }
});

test("module view: the progress follows a bulk change, and removing the module drops the work items", async ({
  page,
  project,
}) => {
  const items = await createWorkItems(project, ["Done A", "Done B", "Kept"]);
  const module = await createModule(project.session, project.workspaceSlug, project.projectId, "Paiement");
  const ids = items.map((item) => item.id);
  await addModuleWorkItems(project.session, project.workspaceSlug, project.projectId, module.id, ids);

  await page.addInitScript(() => window.localStorage.setItem("module_sidebar_collapsed", JSON.stringify("true")));
  await page.goto(moduleIssuesUrl(project.workspaceSlug, project.projectId, module.id));
  await selectAll(page, items.slice(0, 2));

  // the module details are refreshed without a reload
  await applyOption(page, "State", "Done", 2);
  await openSidebar(page);
  await expect(page.getByText("2/3", { exact: true })).toBeVisible();
  await openSidebar(page);

  // the removed work items leave the module view
  await barButton(page, "Modules").click();
  const paiement = page.getByRole("menu", { name: "Modules" }).getByRole("menuitemcheckbox", { name: /Paiement/ });
  await expect(paiement).toHaveAttribute("aria-checked", "true");
  await paiement.click();
  await page.keyboard.press("Escape");
  await expect(workItem(page, items[0].id)).toBeHidden();
  await expect(workItem(page, items[1].id)).toBeHidden();
  await expect(workItem(page, items[2].id)).toBeVisible();
});

test("cycle view: the progress follows a bulk change", async ({ page, project }) => {
  const items = await createWorkItems(project, ["Done A", "Done B", "Open"]);
  const cycle = await createCycle(project.session, project.workspaceSlug, project.projectId, "Sprint 1");
  const ids = items.map((item) => item.id);
  await addCycleWorkItems(project.session, project.workspaceSlug, project.projectId, cycle.id, ids);

  // unlike the module page, the cycle page reads a boolean
  await page.addInitScript(() => window.localStorage.setItem("cycle_sidebar_collapsed", JSON.stringify(true)));
  await page.goto(cycleIssuesUrl(project.workspaceSlug, project.projectId, cycle.id));
  await selectAll(page, items.slice(0, 2));

  await applyOption(page, "State", "Done", 2);
  await openSidebar(page);
  await expect(page.getByText("2/3", { exact: true })).toBeVisible();
});
