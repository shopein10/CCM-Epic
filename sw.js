// ============================================================
// CCM & Epic — Service Worker (minimal, NO cachea)
// ============================================================
// Existe solo para que la app sea instalable como PWA.
//
// ⚠️ NO agregar un handler de `fetch`. La versión anterior tenía:
//
//     self.addEventListener('fetch', e => { e.respondWith(fetch(e.request)); });
//
// que no cachea nada — se limitaba a reenviar la request — pero rompía los
// POST en iPhone. El Apps Script responde a los POST con un 302 a
// script.googleusercontent.com, y Safari falla al re-emitir una request POST
// cross-origin redirigida dentro de respondWith. El síntoma era el cartel
// "FetchEvent.respondWith received an error: TypeError: Load failed", y la
// acción (aceptar un desafío, cargar scores, sortear) no llegaba al servidor.
//
// Sin handler de fetch, el browser maneja las requests directamente y todo
// funciona. No se pierde nada porque acá nunca hubo caché.
// (Diagnosticado el 21 de julio de 2026.)
// ============================================================

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
