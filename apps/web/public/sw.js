const CACHE_NAME = "3d-print-posters-v2";
const APP_SHELL = ["/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseCopy = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseCopy));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(event.request)
            .then((cached) => cached ?? caches.match("/")),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          if (response.ok && event.request.mode !== "navigate") {
            const responseCopy = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, responseCopy));
          }
          return response;
        })
        .catch(() => {
          throw new Error("Offline and no cached response is available.");
        });
    }),
  );
});
