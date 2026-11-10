/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Locator, Page } from "@playwright/test";
import type { ProjectFixture } from "./fixtures";
import { createWorkItems, expect, fetchWorkItem, stateId, test } from "./fixtures";
import type { TWorkItem } from "./helpers/plane";
import { setProjectLayout } from "./helpers/plane";
import { applyOption, bulkBar, expectPeek, toggleWorkItem, workItem } from "./helpers/ui";
import { projectIssuesUrl } from "./helpers/urls";

/** Creates work items in the given states and opens the project board, grouped by state. */
async function openBoard(page: Page, project: ProjectFixture, items: [string, string][]): Promise<TWorkItem[]> {
  const created = await createWorkItems(
    project,
    items.map(([name, state]) => ({ name, state_id: stateId(project, state) }))
  );
  await setProjectLayout(project.session, project.workspaceSlug, project.projectId, {
    layout: "kanban",
    group_by: "state",
    sub_group_by: null,
  });
  await page.goto(projectIssuesUrl(project.workspaceSlug, project.projectId));
  await expect(workItem(page, created[0].id)).toBeVisible({ timeout: 30_000 });
  return created;
}

function title(page: Page, item: TWorkItem): Locator {
  return workItem(page, item.id).getByText(item.name, { exact: true });
}

/** Dispatches a touch long press (pointer down, hold, pointer up) on the target. */
async function longPress(target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (!box) throw new Error("Card is not visible");
  const point = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  await target.dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, button: 0, ...point });
  await target.page().waitForTimeout(700);
  await target.dispatchEvent("pointerup", { pointerType: "touch", isPrimary: true, button: 0, ...point });
}

test("board: checkboxes select cards, a bulk change moves them, a plain click still opens a card", async ({
  page,
  project,
}) => {
  const items = await openBoard(page, project, [
    ["First", "Todo"],
    ["Second", "Todo"],
    ["Opened", "Todo"],
  ]);

  await toggleWorkItem(page, items[0].id);
  await toggleWorkItem(page, items[1].id);
  await applyOption(page, "State", "In Progress", 2);

  for (const item of items.slice(0, 2)) {
    // oxlint-disable-next-line no-await-in-loop
    expect((await fetchWorkItem(project, item)).state_id).toBe(stateId(project, "In Progress"));
    // the moved cards stay selected
    // oxlint-disable-next-line no-await-in-loop
    await expect(workItem(page, item.id).getByRole("checkbox")).toBeChecked();
  }

  await title(page, items[2]).click();
  await expectPeek(page, items[2].name);
  await expect(bulkBar(page)).toContainText("2 selected");
});

test.describe("board on a touch screen", () => {
  test.use({ hasTouch: true });

  test("a long press starts the selection, taps toggle cards, a tap on a card control still opens it", async ({
    page,
    project,
  }) => {
    const items = await openBoard(page, project, [
      ["Pressed", "Todo"],
      ["Tapped", "Todo"],
    ]);

    await longPress(title(page, items[0]));
    await expect(bulkBar(page)).toContainText("1 selected");
    await title(page, items[1]).tap();
    await expect(bulkBar(page)).toContainText("2 selected");
    await title(page, items[1]).tap();
    await expect(bulkBar(page)).toContainText("1 selected");
    await expectPeek(page, null);

    // the state button of a card opens its dropdown instead of toggling the card
    await workItem(page, items[1].id).getByRole("button", { name: "Todo" }).first().tap();
    await expect(page.getByRole("option", { name: "In Progress" })).toBeVisible();
    await expect(bulkBar(page)).toContainText("1 selected");
    await page.keyboard.press("Escape");

    // once the selection is cleared, a tap opens the card again
    await bulkBar(page).getByRole("button", { name: "Clear selection" }).click();
    await expect(bulkBar(page)).toBeHidden();
    await title(page, items[1]).tap();
    await expectPeek(page, items[1].name);
  });
});
