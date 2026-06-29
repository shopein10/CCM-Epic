// Service worker minimo — sin cache para evitar conflictos
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});
