/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

const SERVICE_WORKER_URL = "/pwa-sw.js";

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register(SERVICE_WORKER_URL).catch((error: unknown) => {
      console.error("Service worker registration failed", error);
    });
  };
  // after the page load, so that registering does not compete with the app's first requests
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
