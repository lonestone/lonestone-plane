/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { execFileSync } from "node:child_process";

/**
 * Emails of the e2e stack: Mailpit (docker-compose-e2e.yml) catches them all, and its API is
 * published on the host. Each test signs up fresh users, so looking a recipient up is enough to
 * isolate a test's emails.
 */
export const MAILPIT_URL = "http://localhost:8225";
const WORKER_CONTAINER = "plane-e2e-e2e-worker-1";

export type TEmail = { ID: string; Subject: string; To: { Address: string }[] };

/**
 * Plane sends work item notification emails in batches, from a beat task that runs every 5
 * minutes (`stack_email_notification`). The e2e stack has no beat: run the task now.
 */
export function sendQueuedNotificationEmails(): void {
  execFileSync("docker", [
    "exec",
    WORKER_CONTAINER,
    "python",
    "manage.py",
    "shell",
    "-c",
    "from plane.bgtasks.email_notification_task import stack_email_notification; stack_email_notification()",
  ]);
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
