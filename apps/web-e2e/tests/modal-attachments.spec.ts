/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { writeFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { createWorkItems, expect, fetchWorkItem, test } from "./fixtures";
import type { ProjectFixture } from "./fixtures";
import type { TWorkItem } from "./helpers/plane";
import type { TUploadFile } from "./helpers/files";
import { pdfFile, pngFile } from "./helpers/files";
import { listAttachments, listProjectWorkItems } from "./helpers/plane";
import { draftsUrl, projectIssuesUrl, workItemUrl } from "./helpers/urls";
import { workItem } from "./helpers/ui";

// LONESTONEP-16: attachments added from the work item modal, sent once the work item is saved

/** The work item modal; upstream's toasts are dialogs too. */
function workItemModal(page: Page): Locator {
  return page.getByRole("dialog").filter({ has: page.getByRole("textbox", { name: "Title" }) });
}

async function openCreateModal(page: Page, project: ProjectFixture): Promise<Locator> {
  await page.goto(projectIssuesUrl(project.workspaceSlug, project.projectId));
  await page.getByRole("button", { name: "Add work item" }).first().click();
  return workItemModal(page);
}

/**
 * Drags files from the desktop as the browser sees it (DevTools protocol `Input.dispatchDragEvent`): the drag
 * goes through Chrome's own drag and drop, unlike events built in the page. Returns the drop.
 */
async function dragFiles(page: Page, target: Locator, files: TUploadFile[]): Promise<() => Promise<void>> {
  const paths = files.map((file) => {
    const path = test.info().outputPath(file.name);
    writeFileSync(path, file.buffer);
    return path;
  });
  const box = await target.boundingBox();
  if (!box) throw new Error("The drag target is not visible");
  const cdp = await page.context().newCDPSession(page);
  const data = { items: [], files: paths, dragOperationsMask: 1 };
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send("Input.dispatchDragEvent", { type: "dragEnter", x, y, data });
  // a browser repeats dragover while the files are over the page
  for (let step = 0; step < 4; step += 1) {
    // oxlint-disable-next-line no-await-in-loop
    await cdp.send("Input.dispatchDragEvent", { type: "dragOver", x: x + step, y, data });
  }
  return async () => {
    await cdp.send("Input.dispatchDragEvent", { type: "drop", x, y, data });
    await cdp.detach();
  };
}

/** The work item the modal created: the only one of the fresh project. */
async function createdWorkItem(project: ProjectFixture): Promise<TWorkItem> {
  const [created] = await listProjectWorkItems(project.session, project.workspaceSlug, project.projectId);
  return created;
}

async function createdWorkItemId(project: ProjectFixture): Promise<string> {
  return (await createdWorkItem(project)).id;
}

/** Delays the creation of work items, as on a slow network; `failFirst` makes the first one fail. */
async function slowWorkItemCreation(page: Page, { failFirst = false } = {}): Promise<void> {
  let calls = 0;
  await page.route("**/issues/", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (failFirst && calls === 1) return route.fulfill({ status: 500, json: { error: "Unavailable" } });
    return route.fallback();
  });
}

/** Saves and waits for upstream's success toast, shown once the attachments are sent. */
async function saveAndWait(page: Page, dialog: Locator, button: string, toast: string): Promise<void> {
  await dialog.getByRole("button", { name: button, exact: true }).click();
  await expect(page.getByText(toast, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toBeHidden();
}

async function attachWithButton(page: Page, dialog: Locator, files: TUploadFile[]): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "Attach file", exact: true }).click();
  await (await chooser).setFiles(files);
}

async function attachmentNames(project: ProjectFixture, workItemId: string): Promise<string[]> {
  const attachments = await listAttachments(project.session, project.workspaceSlug, project.projectId, workItemId);
  return attachments.map((attachment) => attachment.attributes.name).toSorted();
}

test("attaches files from the create modal's Attach file button", async ({ page, project }) => {
  const dialog = await openCreateModal(page, project);
  await dialog.getByRole("textbox", { name: "Title" }).fill("Review the spec");

  await attachWithButton(page, dialog, [pdfFile("spec.pdf"), pngFile("screen.png")]);
  await expect(dialog.getByText("spec.pdf", { exact: true })).toBeVisible();
  await expect(dialog.getByText("screen.png", { exact: true })).toBeVisible();

  // a file removed from the list is not sent
  await dialog.getByRole("button", { name: "Remove screen.png" }).click();
  await expect(dialog.getByText("screen.png", { exact: true })).toBeHidden();
  await saveAndWait(page, dialog, "Save", "Work item created successfully");

  // a work item attachment, listed with the others on the work item page
  await page.goto(workItemUrl(project.workspaceSlug, 1));
  await expect(page.getByText("spec.pdf", { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(await attachmentNames(project, await createdWorkItemId(project))).toEqual(["spec.pdf"]);
});

test("a file dragged anywhere over the modal is added to its attachments", async ({ page, project }) => {
  const dialog = await openCreateModal(page, project);
  const title = dialog.getByRole("textbox", { name: "Title" });
  await title.fill("Budget");

  // while dragging, the description field says where the file goes; a drop on the title adds it too
  const drop = await dragFiles(page, title, [pdfFile("budget.pdf"), pngFile("chart.png")]);
  await expect(dialog.getByText("Add as attachment", { exact: true })).toBeVisible();
  await drop();
  await expect(dialog.getByText("Add as attachment", { exact: true })).toBeHidden();
  await expect(dialog.getByText("budget.pdf", { exact: true })).toBeVisible();
  await expect(dialog.getByText("chart.png", { exact: true })).toBeVisible();

  await saveAndWait(page, dialog, "Save", "Work item created successfully");
  await page.goto(workItemUrl(project.workspaceSlug, 1));
  await expect(page.getByText("budget.pdf", { exact: true })).toBeVisible({ timeout: 30_000 });
  const created = await fetchWorkItem(project, await createdWorkItem(project));
  expect(await attachmentNames(project, created.id)).toEqual(["budget.pdf", "chart.png"]);
  // the image went to the attachments, not into the description
  expect(created.description_html ?? "").not.toContain("<image-component");
});

test("attaches a file while editing a work item", async ({ page, project }) => {
  const [item] = await createWorkItems(project, ["Notes"]);
  await page.goto(projectIssuesUrl(project.workspaceSlug, project.projectId));
  await workItem(page, item.id).hover();
  // the row's quick actions: its last button, without accessible name (listed under "Upstream dependencies")
  await workItem(page, item.id).getByRole("button").last().click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const dialog = workItemModal(page);

  await attachWithButton(page, dialog, [pdfFile("minutes.pdf")]);
  await expect(dialog.getByText("minutes.pdf", { exact: true })).toBeVisible();
  await saveAndWait(page, dialog, "Update", "Work item updated successfully");

  await expect.poll(() => attachmentNames(project, item.id), { timeout: 15_000 }).toEqual(["minutes.pdf"]);
});

test("a draft has no attachments", async ({ page, project }) => {
  await page.goto(draftsUrl(project.workspaceSlug));
  await page.getByRole("button", { name: "Create draft work item" }).click();
  const dialog = workItemModal(page);
  // the description editor (a contenteditable without accessible name) is where the list would show
  await expect(dialog.locator('[contenteditable="true"]')).toBeVisible();
  // The list would show a render after the editor: a check for absence right away would pass even if drafts
  // showed it. Waiting is the only way to check that something does not appear.
  await page.waitForTimeout(500);
  await expect(dialog.getByRole("button", { name: "Attach file", exact: true })).toHaveCount(0);
});

test("pending files saved as a draft are not kept, with a message", async ({ page, project }) => {
  const dialog = await openCreateModal(page, project);
  await dialog.getByRole("textbox", { name: "Title" }).fill("Half done");
  await attachWithButton(page, dialog, [pdfFile("notes.pdf")]);
  await expect(dialog.getByText("notes.pdf", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Discard" }).click();
  await page.getByRole("button", { name: "Save to Drafts" }).click();
  await expect(page.getByText("Attachments not kept", { exact: true })).toBeVisible({ timeout: 15_000 });
});

test("a file larger than the instance's limit is not added", async ({ page, project }) => {
  const dialog = await openCreateModal(page, project);
  // the e2e instance keeps the default limit, 5MB
  const tooLarge: TUploadFile = {
    name: "huge.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  };
  await attachWithButton(page, dialog, [tooLarge]);
  await expect(page.getByText("File must be of 5MB or less in size.", { exact: true })).toBeVisible();
  await expect(dialog.getByText("huge.pdf", { exact: true })).toHaveCount(0);
});

test("a file that fails to upload is named, and the work item is kept", async ({ page, project }) => {
  await page.route("**/attachments/", (route) =>
    route.request().method() === "POST" ? route.fulfill({ status: 500, json: {} }) : route.fallback()
  );
  const dialog = await openCreateModal(page, project);
  await dialog.getByRole("textbox", { name: "Title" }).fill("Upload fails");
  await attachWithButton(page, dialog, [pdfFile("lost.pdf")]);
  await saveAndWait(page, dialog, "Save", "Work item created successfully");

  await expect(page.getByText("Some attachments were not uploaded", { exact: true })).toBeVisible();
  await expect(page.getByText(/Not uploaded: lost\.pdf\./)).toBeVisible();
  const items = await listProjectWorkItems(project.session, project.workspaceSlug, project.projectId);
  expect(items.map((item) => item.name)).toEqual(["Upload fails"]);
});

test("with Create more, the modal stays open and its list is emptied", async ({ page, project }) => {
  const dialog = await openCreateModal(page, project);
  await dialog.getByRole("textbox", { name: "Title" }).fill("First");
  await attachWithButton(page, dialog, [pdfFile("first.pdf")]);
  await dialog.getByText("Create more", { exact: true }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Work item created successfully", { exact: true })).toBeVisible({ timeout: 15_000 });

  await expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue("");
  await expect(dialog.getByText("first.pdf", { exact: true })).toHaveCount(0);
  expect(await attachmentNames(project, await createdWorkItemId(project))).toEqual(["first.pdf"]);
});

test("a file added while the work item saves stays for the next one", async ({ page, project }) => {
  await slowWorkItemCreation(page);
  const dialog = await openCreateModal(page, project);
  await dialog.getByRole("textbox", { name: "Title" }).fill("Saved first");
  await attachWithButton(page, dialog, [pdfFile("saved.pdf")]);
  await dialog.getByText("Create more", { exact: true }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await attachWithButton(page, dialog, [pdfFile("late.pdf")]);
  await expect(dialog.getByText("late.pdf", { exact: true })).toBeVisible();
  // the work item is not created yet: late.pdf was added while it saves
  expect(await listProjectWorkItems(project.session, project.workspaceSlug, project.projectId)).toHaveLength(0);

  await expect(page.getByText("Work item created successfully", { exact: true })).toBeVisible({ timeout: 15_000 });
  expect(await attachmentNames(project, await createdWorkItemId(project))).toEqual(["saved.pdf"]);
  await expect(dialog.getByText("late.pdf", { exact: true })).toBeVisible();
  await expect(dialog.getByText("saved.pdf", { exact: true })).toHaveCount(0);
});

test("a file removed while the work item saves is not sent", async ({ page, project }) => {
  await slowWorkItemCreation(page);
  const dialog = await openCreateModal(page, project);
  await dialog.getByRole("textbox", { name: "Title" }).fill("Second thoughts");
  await attachWithButton(page, dialog, [pdfFile("keep.pdf"), pdfFile("drop.pdf")]);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await dialog.getByRole("button", { name: "Remove drop.pdf" }).click();
  expect(await listProjectWorkItems(project.session, project.workspaceSlug, project.projectId)).toHaveLength(0);

  await expect(page.getByText("Work item created successfully", { exact: true })).toBeVisible({ timeout: 15_000 });
  expect(await attachmentNames(project, await createdWorkItemId(project))).toEqual(["keep.pdf"]);
});

test("after a failed save, saving again sends the files listed then", async ({ page, project }) => {
  await slowWorkItemCreation(page, { failFirst: true });
  const dialog = await openCreateModal(page, project);
  await dialog.getByRole("textbox", { name: "Title" }).fill("Retried");
  await attachWithButton(page, dialog, [pdfFile("first-try.pdf")]);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Unavailable", { exact: true })).toBeVisible({ timeout: 15_000 });

  await attachWithButton(page, dialog, [pdfFile("second-try.pdf")]);
  await saveAndWait(page, dialog, "Save", "Work item created successfully");
  expect(await attachmentNames(project, await createdWorkItemId(project))).toEqual(["first-try.pdf", "second-try.pdf"]);
});

test("a modal closed while its work item saves keeps its files apart from the next modal", async ({
  page,
  project,
}) => {
  await slowWorkItemCreation(page);
  const first = await openCreateModal(page, project);
  await first.getByRole("textbox", { name: "Title" }).fill("Closed early");
  await attachWithButton(page, first, [pdfFile("first.pdf")]);
  await first.getByRole("button", { name: "Save", exact: true }).click();
  // closed while saving, without keeping a draft
  await first.getByRole("button", { name: "Discard", exact: true }).click();
  const saveDraft = page.getByRole("dialog").filter({ hasText: "Save this draft?" });
  if (await saveDraft.isVisible()) await saveDraft.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(first).toHaveCount(0);

  await page.getByRole("button", { name: "Add work item" }).first().click();
  const next = workItemModal(page);
  await attachWithButton(page, next, [pdfFile("next.pdf")]);
  await expect(next.getByText("next.pdf", { exact: true })).toBeVisible();

  await expect
    .poll(async () => (await listProjectWorkItems(project.session, project.workspaceSlug, project.projectId)).length, {
      timeout: 15_000,
    })
    .toBe(1);
  await expect.poll(async () => attachmentNames(project, await createdWorkItemId(project))).toEqual(["first.pdf"]);
  await expect(next.getByText("next.pdf", { exact: true })).toBeVisible();
});
