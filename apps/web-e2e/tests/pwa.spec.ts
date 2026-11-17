/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

type TManifest = {
  name: string;
  short_name: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
};

const CACHE_NAME = "plane-pwa-v1";

/** Waits until pwa-sw.js controls the page, and returns the URL of the active service worker. */
async function waitForServiceWorker(page: Page): Promise<string | undefined> {
  const scriptUrl = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  return scriptUrl;
}

test("the web app is installable, caches only the offline page and shows it without network", async ({
  page,
  context,
  project,
}) => {
  await page.goto(`/${project.workspaceSlug}/`);
  const home = page.getByRole("link", { name: "Home", exact: true }).first();
  await expect(home).toBeVisible({ timeout: 30_000 });

  // upstream links two manifests: browsers use the first one
  const manifestUrl = await page.locator('link[rel="manifest"]').first().getAttribute("href");
  expect(manifestUrl).toBe("/site.webmanifest.json");
  const manifest = (await (await page.request.get(manifestUrl ?? "")).json()) as TManifest;
  expect(manifest).toMatchObject({ name: "Plane", short_name: "Plane", display: "standalone" });
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(manifest.icons.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512")).toBe(true);
  const icons = await Promise.all(
    manifest.icons.map(async (icon) => {
      const response = await page.request.get(icon.src);
      return { src: icon.src, status: response.status(), type: response.headers()["content-type"] };
    })
  );
  expect(icons).toEqual(manifest.icons.map((icon) => ({ src: icon.src, status: 200, type: "image/png" })));
  // iOS names the home screen icon after this tag, not after the manifest
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Plane");

  expect(await waitForServiceWorker(page)).toMatch(/\/pwa-sw\.js$/);

  // no data is cached: only the offline page
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const entries = await Promise.all(
      keys.map(async (key) => (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname))
    );
    return { keys, entries: entries.flat() };
  });
  expect(cached).toEqual({ keys: [CACHE_NAME], entries: ["/offline.html"] });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();

  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(home).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "You are offline" })).toBeHidden();
});

test("a server error is shown as is, not as the offline page", async ({ page, context }) => {
  await page.goto("/");
  await waitForServiceWorker(page);

  await context.route("**/sign-up**", (route) =>
    route.fulfill({ status: 503, contentType: "text/html", body: "<h1>Service unavailable</h1>" })
  );
  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { name: "Service unavailable" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "You are offline" })).toBeHidden();
});

test.describe("in French", () => {
  test.use({ locale: "fr-FR" });

  test("the offline page is in French", async ({ page, context }) => {
    await page.goto("/");
    await waitForServiceWorker(page);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Vous êtes hors ligne" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Réessayer" })).toBeVisible();
    await context.setOffline(false);
  });
});
