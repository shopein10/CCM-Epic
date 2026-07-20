// ============================================================
// CCM & Epic Golf — CONFIGURACIÓN
// Completar estos valores antes de publicar
// ============================================================

const CONFIG = {

  // Versión del front — mantener en sincronía con el ?v=N de index.html
  APP_VERSION: 14,

  // Token compartido para guardarScores (validado por el Apps Script)
  SCORE_TOKEN: "ccm-epic-2026",

  // URL del Google Apps Script Web App
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxRrd-8X6oOTLzTwTKCiU1QJiWxxrTP6ISFOroXq75nfomSk9oqdxfhh65tTTLSLH7kHA/exec",

  // Cloudflare Worker (caché ~20s) — usado SOLO para el polling del leaderboard.
  // El refresh post-envío y los POSTs van directo al Apps Script (datos frescos).
  // Si el Worker falla, sheets.js cae automáticamente al Apps Script directo.
  WORKER_URL: "https://ccm-epic-golf.shopein10.workers.dev",

  // Nombre del torneo actual (aparece en toda la app)
  TORNEO_ACTUAL: "Torneo CCM & Epic 2025",

  // Par total del campo
  PAR_TOTAL: 72,

  // Cada cuántos segundos se refresca el leaderboard automáticamente
  REFRESH_INTERVAL: 30,

  // Cuartos del torneo — los nombres reales se cargan desde la planilla en tiempo real.
  // Los jugadores placeholder acá no importan: se pisan con los datos del sheet.
  // Si un cuarto está VACIO en la planilla, su botón se oculta automáticamente.
  CUARTOS: [
    { id: "Cuarto1", nombre: "Cuarto 1", jugadores: ["J1", "J2", "J3", "J4"] },
    { id: "Cuarto2", nombre: "Cuarto 2", jugadores: ["J1", "J2", "J3", "J4"] },
    { id: "Cuarto3", nombre: "Cuarto 3", jugadores: ["J1", "J2", "J3", "J4"] },
    { id: "Cuarto4", nombre: "Cuarto 4", jugadores: ["J1", "J2", "J3", "J4"] },
    { id: "Cuarto5", nombre: "Cuarto 5", jugadores: ["J1", "J2", "J3", "J4"] },
    { id: "Cuarto6", nombre: "Cuarto 6", jugadores: ["J1", "J2", "J3", "J4"] },
    { id: "Cuarto7", nombre: "Cuarto 7", jugadores: ["J1", "J2", "J3", "J4"] },
    { id: "Cuarto8", nombre: "Cuarto 8", jugadores: ["J1", "J2", "J3", "J4"] },
  ],

  // Par de cada hoyo — debe coincidir con el campo
  PAR_HOYOS: [4, 4, 5, 3, 4, 4, 5, 3, 4, 4, 3, 4, 5, 4, 4, 3, 4, 5],

  // Stroke index (handicap del hoyo) por hoyo REAL 1..18 — leído de la planilla.
  // Es fijo del campo; se usa para repartir los golpes de hándicap por hoyo.
  STROKE_INDEX: [11, 3, 9, 17, 15, 5, 7, 13, 1, 16, 14, 2, 8, 12, 4, 18, 10, 6],
};
