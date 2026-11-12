/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { API_URL } from "./urls";

/**
 * Arrange-phase helpers that drive the real app API with the session of a throwaway user.
 *
 * They take the browser context's `request` (page.request), which shares its cookie jar with
 * the page: once `signUpFreshUser` has run, the page is logged in as that user too. Workspace,
 * project and work items go through the API rather than SQL so Plane's own defaults (default
 * states, sequence ids, memberships) apply and upstream migrations cannot break the fixtures.
 */

export type PlaneSession = {
  request: APIRequestContext;
  csrfToken: string;
  email: string;
};

export type TState = { id: string; name: string; group: string };
export type TWorkItem = {
  id: string;
  sequence_id: number;
  name: string;
  state_id: string;
  priority: string;
  start_date: string | null;
  target_date: string | null;
  assignee_ids: string[];
  label_ids: string[];
  module_ids?: string[];
};

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function call<T>(
  session: PlaneSession,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  data?: unknown
): Promise<T> {
  const response = await session.request.fetch(`${API_URL}${path}`, {
    method,
    data,
    headers: { "X-CSRFToken": session.csrfToken },
  });
  if (!response.ok()) {
    throw new Error(`${method} ${path} failed with ${response.status()}: ${await response.text()}`);
  }
  return (response.status() === 204 ? undefined : await response.json()) as T;
}

function randomByte(): number {
  return Math.floor(Math.random() * 254) + 1;
}

function fakeClientAddress(): string {
  return `10.${randomByte()}.${randomByte()}.${randomByte()}`;
}

/**
 * Signs up a brand-new user through the real email/password flow, then marks it onboarded so
 * the web app lands on the requested page instead of the onboarding wizard. A fresh user per
 * test keeps tests independent from whatever already lives in the dev database.
 */
export async function signUpFreshUser(request: APIRequestContext): Promise<PlaneSession> {
  // Anonymous API calls (the CSRF token) are throttled per client address at 30/minute
  // (REST_FRAMEWORK "anon" rate, not configurable): a full run signs up more users than that.
  // DRF reads the address from X-Forwarded-For, so each sign-up gets its own.
  const headers = { "X-Forwarded-For": fakeClientAddress() };
  const csrfResponse = await request.get(`${API_URL}/auth/get-csrf-token/`, { headers });
  const { csrf_token: csrfToken } = (await csrfResponse.json()) as { csrf_token: string };

  const email = `web-e2e-${uniqueSuffix()}@example.com`;
  const signUp = await request.post(`${API_URL}/auth/sign-up/`, {
    form: { email, password: `E2e-${randomUUID()}!`, csrfmiddlewaretoken: csrfToken },
    headers,
    maxRedirects: 0,
  });
  // The auth views always redirect; errors are reported as query params on the redirect URL.
  const location = signUp.headers()["location"] ?? "";
  if (signUp.status() !== 302 || location.includes("error_code")) {
    throw new Error(`Sign-up failed (${signUp.status()}): ${location}`);
  }

  const session = { request, csrfToken, email };
  await call(session, "PATCH", "/api/users/me/profile/", {
    is_onboarded: true,
    is_tour_completed: true,
    is_navigation_tour_completed: true,
    onboarding_step: { profile_complete: true, workspace_create: true, workspace_invite: true, workspace_join: true },
  });
  return session;
}

export async function createWorkspace(session: PlaneSession): Promise<{ slug: string }> {
  const slug = `e2e-${uniqueSuffix()}`;
  return call(session, "POST", "/api/workspaces/", { name: slug, slug, organization_size: "Just myself" });
}

export const ROLE = { guest: 5, member: 15 } as const;

export async function createProject(session: PlaneSession, workspaceSlug: string): Promise<{ id: string }> {
  return call(session, "POST", `/api/workspaces/${workspaceSlug}/projects/`, {
    name: "Bulk edit",
    identifier: "BULK",
    network: 2,
    // features used by the bulk actions bar (module menu) and the selection rules (cycles)
    module_view: true,
    cycle_view: true,
  });
}

export async function getStates(session: PlaneSession, workspaceSlug: string, projectId: string): Promise<TState[]> {
  return call(session, "GET", `/api/workspaces/${workspaceSlug}/projects/${projectId}/states/`);
}

export async function createWorkItem(
  session: PlaneSession,
  workspaceSlug: string,
  projectId: string,
  data: { name: string } & Partial<Pick<TWorkItem, "start_date" | "target_date" | "state_id" | "priority">>
): Promise<TWorkItem> {
  return call(session, "POST", `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`, data);
}

export async function getWorkItem(
  session: PlaneSession,
  workspaceSlug: string,
  projectId: string,
  workItemId: string
): Promise<TWorkItem> {
  return call(session, "GET", `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${workItemId}/`);
}

export type TProjectDisplayFilters = {
  layout: "list" | "kanban" | "spreadsheet" | "gantt_chart";
  group_by?: string | null;
  sub_group_by?: string | null;
};

/** Sets the current user's layout (and grouping) for the project's work item views. */
export async function setProjectLayout(
  session: PlaneSession,
  workspaceSlug: string,
  projectId: string,
  displayFilters: TProjectDisplayFilters
): Promise<void> {
  const path = `/api/workspaces/${workspaceSlug}/projects/${projectId}/user-properties/`;
  const current = await call<{ display_filters?: Record<string, unknown> }>(session, "GET", path);
  await call(session, "PATCH", path, { display_filters: { ...current.display_filters, ...displayFilters } });
}

export async function updateWorkItem(
  session: PlaneSession,
  workspaceSlug: string,
  projectId: string,
  workItemId: string,
  data: Partial<Pick<TWorkItem, "assignee_ids">>
): Promise<void> {
  await call(session, "PATCH", `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${workItemId}/`, data);
}

export async function createModule(
  session: PlaneSession,
  workspaceSlug: string,
  projectId: string,
  name: string
): Promise<{ id: string; name: string }> {
  return call(session, "POST", `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/`, { name });
}

export async function createCycle(
  session: PlaneSession,
  workspaceSlug: string,
  projectId: string,
  name: string
): Promise<{ id: string; name: string }> {
  return call(session, "POST", `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/`, { name });
}

export async function addCycleWorkItems(
  session: PlaneSession,
  workspaceSlug: string,
  projectId: string,
  cycleId: string,
  issueIds: string[]
): Promise<void> {
  await call(
    session,
    "POST",
    `/api/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/cycle-issues/`,
    {
      issues: issueIds,
    }
  );
}

export async function addModuleWorkItems(
  session: PlaneSession,
  workspaceSlug: string,
  projectId: string,
  moduleId: string,
  issueIds: string[]
): Promise<void> {
  await call(session, "POST", `/api/workspaces/${workspaceSlug}/projects/${projectId}/modules/${moduleId}/issues/`, {
    issues: issueIds,
  });
}

/**
 * Adds a second, freshly signed-up user to the project (member by default, role 15), through the real
 * invitation flow: workspace invite, acceptance by the invitee, then project membership.
 * `memberRequest` must come from a separate browser context (its own cookie jar).
 */
export async function addProjectMember(
  owner: PlaneSession,
  memberRequest: APIRequestContext,
  workspaceSlug: string,
  projectId: string,
  role: (typeof ROLE)[keyof typeof ROLE] = ROLE.member
): Promise<{ id: string; email: string; displayName: string }> {
  const member = await signUpFreshUser(memberRequest);
  await call(owner, "POST", `/api/workspaces/${workspaceSlug}/invitations/`, {
    emails: [{ email: member.email, role }],
  });
  const invitations = await call<{ id: string; workspace: { slug: string } }[]>(
    member,
    "GET",
    "/api/users/me/workspaces/invitations/"
  );
  const invitation = invitations.find((candidate) => candidate.workspace?.slug === workspaceSlug) ?? invitations[0];
  if (!invitation) throw new Error(`No workspace invitation found for ${member.email}`);
  await call(member, "POST", "/api/users/me/workspaces/invitations/", { invitations: [invitation.id] });
  const me = await call<{ id: string; display_name: string }>(member, "GET", "/api/users/me/");
  await call(owner, "POST", `/api/workspaces/${workspaceSlug}/projects/${projectId}/members/`, {
    members: [{ member_id: me.id, role }],
  });
  return { id: me.id, email: member.email, displayName: me.display_name };
}

export async function getCurrentUser(session: PlaneSession): Promise<{ id: string; displayName: string }> {
  const me = await call<{ id: string; display_name: string }>(session, "GET", "/api/users/me/");
  return { id: me.id, displayName: me.display_name };
}

export async function listProjectWorkItems(
  session: PlaneSession,
  workspaceSlug: string,
  projectId: string
): Promise<TWorkItem[]> {
  const response = await call<{ results: TWorkItem[] } | TWorkItem[]>(
    session,
    "GET",
    `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/`
  );
  return Array.isArray(response) ? response : response.results;
}

export async function listProjects(
  session: PlaneSession,
  workspaceSlug: string
): Promise<{ id: string; name: string }[]> {
  return call(session, "GET", `/api/workspaces/${workspaceSlug}/projects/`);
}

export type TAttachment = { id: string; attributes: { name: string; type: string; size: number } };

/** Attachments of a work item whose upload completed (the API lists only those). */
export async function listAttachments(
  session: PlaneSession,
  workspaceSlug: string,
  projectId: string,
  workItemId: string
): Promise<TAttachment[]> {
  return call(
    session,
    "GET",
    `/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectId}/issues/${workItemId}/attachments/`
  );
}

/** "Allow guests to collaborate" (fork setting): guests edit work items and use cycles and modules. */
export async function setGuestCollaboration(
  session: PlaneSession,
  workspaceSlug: string,
  projectId: string,
  enabled: boolean
): Promise<void> {
  await call(session, "PATCH", `/api/extended/workspaces/${workspaceSlug}/projects/${projectId}/guest-collaboration/`, {
    guest_can_collaborate: enabled,
  });
}

/** "Guest access" (upstream setting): guests see every work item of the project. */
export async function setGuestAccess(
  session: PlaneSession,
  workspaceSlug: string,
  projectId: string,
  enabled: boolean
): Promise<void> {
  await call(session, "PATCH", `/api/workspaces/${workspaceSlug}/projects/${projectId}/`, {
    guest_view_all_features: enabled,
  });
}

/** Reads the project settings the guest assignment depends on. */
export async function getProject(
  session: PlaneSession,
  workspaceSlug: string,
  projectId: string
): Promise<{ id: string; guest_view_all_features: boolean }> {
  return call(session, "GET", `/api/workspaces/${workspaceSlug}/projects/${projectId}/`);
}

/** Makes a project member a project subscriber (LONESTONEP-8): they follow every work item of the project. */
export async function addProjectSubscriber(
  session: PlaneSession,
  workspaceSlug: string,
  projectId: string,
  subscriberId: string
): Promise<void> {
  await call(session, "POST", `/api/extended/workspaces/${workspaceSlug}/projects/${projectId}/subscribers/`, {
    subscriber_id: subscriberId,
  });
}

/** Whether the session's user is a subscriber of the work item. */
export async function isSubscribed(
  session: PlaneSession,
  workspaceSlug: string,
  projectId: string,
  workItemId: string
): Promise<boolean> {
  const status = await call<{ subscribed: boolean }>(
    session,
    "GET",
    `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${workItemId}/subscribe/`
  );
  return status.subscribed;
}
