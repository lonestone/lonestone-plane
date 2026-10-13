/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { test as base } from "@playwright/test";
import type { PlaneSession, TState, TWorkItem } from "./helpers/plane";
import {
  createProject,
  createWorkItem,
  createWorkspace,
  getStates,
  getWorkItem,
  signUpFreshUser,
} from "./helpers/plane";

export type ProjectFixture = {
  session: PlaneSession;
  workspaceSlug: string;
  projectId: string;
  states: TState[];
};

/**
 * `project`: a fresh user (logged in in the page) owning a fresh workspace and project with
 * Plane's default states. Nothing is shared between tests.
 */
export const test = base.extend<{ project: ProjectFixture }>({
  project: async ({ page }, use) => {
    const session = await signUpFreshUser(page.request);
    const { slug: workspaceSlug } = await createWorkspace(session);
    const { id: projectId } = await createProject(session, workspaceSlug);
    const states = await getStates(session, workspaceSlug, projectId);
    await use({ session, workspaceSlug, projectId, states });
  },
});

export { expect } from "@playwright/test";

export function stateId(project: ProjectFixture, name: string): string {
  const state = project.states.find((candidate) => candidate.name === name);
  if (!state) throw new Error(`No "${name}" state in the project`);
  return state.id;
}

type TNewWorkItem = Parameters<typeof createWorkItem>[3];

/** Creates the work items one by one, so that their sequence ids and order are deterministic. */
export async function createWorkItems(project: ProjectFixture, items: (string | TNewWorkItem)[]): Promise<TWorkItem[]> {
  const created: TWorkItem[] = [];
  for (const item of items) {
    const data = typeof item === "string" ? { name: item } : item;
    // oxlint-disable-next-line no-await-in-loop
    created.push(await createWorkItem(project.session, project.workspaceSlug, project.projectId, data));
  }
  return created;
}

/** Reads a work item back from the API. */
export async function fetchWorkItem(project: ProjectFixture, item: TWorkItem): Promise<TWorkItem> {
  return getWorkItem(project.session, project.workspaceSlug, project.projectId, item.id);
}
