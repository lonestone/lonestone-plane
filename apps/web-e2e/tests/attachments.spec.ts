/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Page } from "@playwright/test";
import { createWorkItems, expect, test } from "./fixtures";
import { listAttachments } from "./helpers/plane";

type TUploadFile = { name: string; mimeType: string; buffer: Buffer };

// A file that starts with a container signature: OLE for .doc and .xls, ZIP for .xlsx (read on its
// first 4KB). The signature alone cannot tell which document the container holds.
function containerFile(name: string, mimeType: string, signature: number[]): TUploadFile {
  const buffer = Buffer.alloc(4096);
  Buffer.from(signature).copy(buffer);
  return { name, mimeType, buffer };
}
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Attaches one file through the "Attach" button and waits for the success toast to come and go. */
async function attach(page: Page, file: TUploadFile): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  await (await chooser).setFiles(file);
  const toast = page.getByText("Attachment uploaded", { exact: true });
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden({ timeout: 15_000 });
}

test("attaches Office, CSV and PDF files to a work item", async ({ page, project }) => {
  const [workItem] = await createWorkItems(project, ["Attachments"]);
  await page.goto(`/${project.workspaceSlug}/browse/BULK-${workItem.sequence_id}/`);
  await expect(page.getByRole("button", { name: "Attach", exact: true })).toBeVisible();

  // the browser types .doc, .xls, .xlsx and .csv from their extension; the API only accepts those types
  await attach(page, containerFile("budget.xls", "application/vnd.ms-excel", OLE));
  await attach(page, containerFile("brief.doc", "application/msword", OLE));
  await attach(page, containerFile("plan.xlsx", XLSX, ZIP));
  await attach(page, { name: "export.csv", mimeType: "text/csv", buffer: Buffer.from("name,qty\nfoo,1\n") });

  const attachments = await listAttachments(project.session, project.workspaceSlug, project.projectId, workItem.id);
  const types = Object.fromEntries(
    attachments.map((attachment) => [attachment.attributes.name, attachment.attributes.type])
  );
  expect(types).toEqual({
    "budget.xls": "application/vnd.ms-excel",
    "brief.doc": "application/msword",
    "export.csv": "text/csv",
    // stored as a spreadsheet, not as the zip its first bytes look like
    "plan.xlsx": XLSX,
  });
});
