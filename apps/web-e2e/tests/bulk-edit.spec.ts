/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Page } from "@playwright/test";
import type { ProjectFixture } from "./fixtures";
import { createWorkItems, expect, fetchWorkItem, stateId, test } from "./fixtures";
import type { TWorkItem } from "./helpers/plane";
import { addProjectMember, getCurrentUser, updateWorkItem } from "./helpers/plane";
import { applyOption, barButton, bulkBar, toggleWorkItem } from "./helpers/ui";
import { projectIssuesUrl } from "./helpers/urls";

function toPayloadDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const today = new Date();
const firstOfMonth = toPayloadDate(new Date(today.getFullYear(), today.getMonth(), 1));
const lastOfMonth = toPayloadDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

/** Opens the project's work items (list layout by default) and selects the given ones. */
async function openAndSelect(page: Page, project: ProjectFixture, items: TWorkItem[]): Promise<void> {
  await page.goto(projectIssuesUrl(project.workspaceSlug, project.projectId));
  for (const item of items) {
    // oxlint-disable-next-line no-await-in-loop
    await toggleWorkItem(page, item.id);
  }
  await expect(bulkBar(page)).toContainText(`${items.length} selected`);
}

/** Picks a day in the calendar of a date button of the bar (the calendar opens on the current month). */
async function pickDate(page: Page, property: string, date: string): Promise<void> {
  await barButton(page, property).click();
  // react-day-picker tags each day cell with its date
  await page.locator(`[data-day="${date}"]`).click();
}

test.describe("bulk edit (list layout)", () => {
  test("changes the state of every selected work item, keeps the selection, then clears it", async ({
    page,
    project,
  }) => {
    const items = await createWorkItems(project, ["Ship the API", "Ship the bar"]);

    await openAndSelect(page, project, items);
    await applyOption(page, "State", "In Progress", 2);

    for (const item of items) {
      // oxlint-disable-next-line no-await-in-loop
      expect((await fetchWorkItem(project, item)).state_id).toBe(stateId(project, "In Progress"));
    }
    // the selection is kept so that another property can be applied
    await expect(bulkBar(page)).toContainText("2 selected");

    await bulkBar(page).getByRole("button", { name: "Clear selection" }).click();
    await expect(bulkBar(page)).toBeHidden();
  });

  test("sets the priority, the start date and the due date", async ({ page, project }) => {
    const items = await createWorkItems(project, ["First", "Second"]);

    await openAndSelect(page, project, items);
    await applyOption(page, "Priority", "High", 2);
    await pickDate(page, "Start date", firstOfMonth);
    await expect.poll(async () => (await fetchWorkItem(project, items[1])).start_date).toBe(firstOfMonth);
    await pickDate(page, "Due date", lastOfMonth);

    await expect.poll(async () => (await fetchWorkItem(project, items[1])).target_date).toBe(lastOfMonth);
    for (const item of items) {
      // oxlint-disable-next-line no-await-in-loop
      const saved = await fetchWorkItem(project, item);
      expect([saved.priority, saved.start_date, saved.target_date]).toEqual(["high", firstOfMonth, lastOfMonth]);
    }
  });

  test("rejects the whole change when one work item's dates would become inconsistent", async ({ page, project }) => {
    // starts at the end of the month: a due date on the 1st would end before it starts
    const items = await createWorkItems(project, [{ name: "Starts late", start_date: lastOfMonth }, "Fine"]);

    await openAndSelect(page, project, items);
    await pickDate(page, "Due date", firstOfMonth);

    await expect(page.getByText("The start date would be after the due date for some work items.")).toBeVisible();
    for (const item of items) {
      // oxlint-disable-next-line no-await-in-loop
      expect((await fetchWorkItem(project, item)).target_date).toBeNull();
    }
  });

  test("assignees: shows who is on all or some work items, then reassigns", async ({ page, browser, project }) => {
    const owner = await getCurrentUser(project.session);
    const memberContext = await browser.newContext();
    const member = await addProjectMember(
      project.session,
      memberContext.request,
      project.workspaceSlug,
      project.projectId
    );
    await memberContext.close();
    const items = await createWorkItems(project, ["Alpha", "Bravo"]);
    await updateWorkItem(project.session, project.workspaceSlug, project.projectId, items[0].id, {
      assignee_ids: [owner.id, member.id],
    });
    await updateWorkItem(project.session, project.workspaceSlug, project.projectId, items[1].id, {
      assignee_ids: [owner.id],
    });

    await openAndSelect(page, project, items);
    await barButton(page, "Assignees").click();
    const menu = page.getByRole("menu", { name: "Assignees" });
    // the current user is listed as "You", as in the assignee dropdown
    const you = menu.getByRole("menuitemcheckbox", { name: /You/ });
    const other = menu.getByRole("menuitemcheckbox", { name: new RegExp(member.displayName) });
    await expect(you).toHaveAttribute("aria-checked", "true");
    await expect(other).toHaveAttribute("aria-checked", "mixed");

    await you.click();
    await expect(you).toHaveAttribute("aria-checked", "false");
    await other.click();
    await expect(other).toHaveAttribute("aria-checked", "true");

    for (const item of items) {
      // oxlint-disable-next-line no-await-in-loop
      expect((await fetchWorkItem(project, item)).assignee_ids).toEqual([member.id]);
    }
  });
});
