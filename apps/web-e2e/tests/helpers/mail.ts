/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { execFileSync } from "node:child_process";

/** Mailpit of docker-compose-e2e.yml. Each test signs up fresh users, so a recipient isolates its emails. */
export const MAILPIT_URL = "http://localhost:8225";
const WORKER_CONTAINER = "plane-e2e-e2e-worker-1";

export type TEmail = { ID: string; Subject: string; To: { Address: string }[] };

/** Upstream batches work item emails in a beat task, absent from the e2e stack: run it now. */
export function sendQueuedNotificationEmails(): void {
  djangoShell("from plane.bgtasks.email_notification_task import stack_email_notification; stack_email_notification()");
}

/** For what the API cannot do: run a beat task, create the rows of a data migration. */
export function djangoShell(code: string): void {
  execFileSync("docker", ["exec", WORKER_CONTAINER, "python", "manage.py", "shell", "-c", code]);
}

/** Emails received by this address, newest first. */
export async function emailsTo(address: string): Promise<TEmail[]> {
  const query = encodeURIComponent(`to:"${address}"`);
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
  if (!response.ok) throw new Error(`Mailpit search failed with ${response.status}`);
  return ((await response.json()) as { messages: TEmail[] }).messages;
}

/** Plain-text body of an email. */
export async function emailText(email: TEmail): Promise<string> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${email.ID}`);
  return ((await response.json()) as { Text: string }).Text;
}
