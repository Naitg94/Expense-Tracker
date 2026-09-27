const CACHE_NAME = "expense-tracker-v9";

const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json",
    "./icon-48.png",
    "./icon-72.png",
    "./icon-96.png",
    "./icon-128.png",
    "./icon-144.png",
    "./icon-192.png",
    "./icon-256.png",
    "./icon-384.png",
    "./icon-512.png",
    "./apple-touch-icon.png",
    "./favicon.ico",
    "./favicon-32x32.png",
    "./favicon-16x16.png",
    "./screenshot-wide.png",
    "./screenshot-narrow.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(FILES_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200 && event.request.method === "GET") {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => cachedResponse);
        })
    );
});