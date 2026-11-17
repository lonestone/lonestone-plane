/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { createWorkItems, expect, test } from "./fixtures";
import { listProjects, listProjectWorkItems } from "./helpers/plane";

test("a template made from a project creates a new project with its work items", async ({ page, project }) => {
  await createWorkItems(project, ["Kickoff", "Ship checklist"]);

  // create the template from the fixture project ("Bulk edit")
  await page.goto(`/${project.workspaceSlug}/settings/templates`);
  await page.getByRole("button", { name: "Create template" }).first().click();
  await page.getByRole("button", { name: "Select a project to snapshot" }).first().click();
  await page.getByRole("option", { name: /Bulk edit/ }).click();
  await page.getByPlaceholder("Name your project template.").fill("Sprint kit");
  await page.getByRole("button", { name: "Create project template" }).click();
  await expect(page.getByText("Sprint kit", { exact: true })).toBeVisible();

  // create a project from it
  await page.getByRole("button", { name: "Use template" }).click();
  // the form is filled from the template. The name is kept: the prefill can land after typing (known gap).
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("Sprint kit");
  await page.getByRole("textbox", { name: "Project ID" }).fill("KIT");
  await page.getByRole("button", { name: "Create project" }).click();

  // the template is applied once the project exists
  await expect
    .poll(async () => {
      const created = (await listProjects(project.session, project.workspaceSlug)).find(
        (item) => item.name === "Sprint kit"
      );
      if (!created) return [];
      const workItems = await listProjectWorkItems(project.session, project.workspaceSlug, created.id);
      return workItems.map((item) => item.name).toSorted();
    })
    .toEqual(["Kickoff", "Ship checklist"]);
});
