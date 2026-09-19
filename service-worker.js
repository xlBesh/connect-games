/*
  Connect Games Service Worker
  Version: v1.1
*/

const CACHE_NAME = "connect-games-v1.1";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./connect4.js",
  "./connect5.js",
  "./script.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];


// ========================================
// INSTALL
// ========================================

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(
          FILES_TO_CACHE
        );
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});


// ========================================
// ACTIVATE
// ========================================

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (
              cacheName !==
              CACHE_NAME
            ) {
              return caches.delete(
                cacheName
              );
            }

            return null;
          })
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});


// ========================================
// FETCH
// ========================================

self.addEventListener("fetch", event => {
  if (
    event.request.method !== "GET"
  ) {
    return;
  }

  event.respondWith(
    caches
      .match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request)
          .then(networkResponse => {
            if (
              !networkResponse ||
              networkResponse.status !== 200 ||
              networkResponse.type === "opaque"
            ) {
              return networkResponse;
            }

            const copy =
              networkResponse.clone();

            caches
              .open(CACHE_NAME)
              .then(cache => {
                cache.put(
                  event.request,
                  copy
                );
              });

            return networkResponse;
          });
      })
  );
});
