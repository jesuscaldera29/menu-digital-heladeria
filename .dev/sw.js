// Service Worker - MenuPro PWA
const CACHE_NAME = 'menupro-v2';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
