/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The bulk actions bar: the element around the live "N selected" counter. */
export function bulkBar(page: Page): Locator {
  return page
    .locator('span[aria-live="polite"]')
    .filter({ hasText: /selected/ })
    .locator("xpath=../..");
}

/** A property button of the bulk actions bar ("State", "Priority", "Assignees"…). */
export function barButton(page: Page, name: string): Locator {
  return bulkBar(page).getByRole("button", { name, exact: true }).first();
}

/** A work item row or board card (upstream renders each one with `id="issue-<id>"`). */
export function workItem(page: Page, id: string): Locator {
  return page.locator(`[id="issue-${id}"]`).first();
}

/** Selects or unselects a work item with its checkbox, which shows on hover. */
export async function toggleWorkItem(page: Page, id: string): Promise<void> {
  await workItem(page, id).hover();
  await workItem(page, id).getByRole("checkbox").click();
}

/** Applies a single value (state, priority) from the bulk actions bar and waits for the success toast. */
export async function applyOption(page: Page, property: string, option: string, count: number): Promise<void> {
  await barButton(page, property).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(page.getByText(`${count} work items updated`)).toBeVisible();
}

/** The peek overview shows the given work item (its title field), or no peek overview is open. */
export async function expectPeek(page: Page, name: string | null): Promise<void> {
  const titleField = page.getByRole("textbox", { name: "Work item title" });
  if (name === null) await expect(titleField).toBeHidden();
  else await expect(titleField).toHaveValue(name);
}
