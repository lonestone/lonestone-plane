/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

const CACHE_NAME = "plane-pwa-v1";
const OFFLINE_URL = "/offline.html";

// `no-cache` revalidates with the server, so a deploy that only changes offline.html reaches installed apps
function cacheOfflinePage() {
  return caches.open(CACHE_NAME).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "no-cache" })));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheOfflinePage().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // the network is up: refresh the offline page in the background (a full page load is rare in this SPA)
        event.waitUntil(cacheOfflinePage().catch(() => undefined));
        return response;
      })
      .catch(() =>
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.match(OFFLINE_URL))
          .then((response) => response || Response.error())
      )
  );
});
