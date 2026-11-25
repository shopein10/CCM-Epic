// APP VIAJE — Service Worker mínimo, NO cachea.
// ⚠️ NO agregar handler de `fetch`: rompe los POST al Apps Script en iPhone
// (ver sw.js del torneo, 21/7/2026).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
