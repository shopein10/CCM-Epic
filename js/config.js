// ============================================================
// CCM & Epic Golf — CONFIGURACIÓN
// Completar estos valores antes de publicar
// ============================================================

const CONFIG = {

  // Versión del front — mantener en sincronía con el ?v=N de index.html
  APP_VERSION: 35,

  // CANCHA ACTIVA: "ANDINO" o "CCM". Define par, stroke index, par total y clima (ver CANCHAS
  // al final del archivo). Tiene que coincidir con lo que dejó cancha.gs en la planilla
  // (usarCanchaAndino / usarCanchaCCM). El diseño (logo/colores) va aparte: CLUB en index.html.
  CANCHA: "ANDINO",

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

};

// ============================================================
// CANCHAS — datos por cancha (hoyos REALES 1..18). Se copian a CONFIG según CONFIG.CANCHA.
// CLIMA: coordenadas para Open-Meteo (la grilla es de varios km, alcanza con 2 decimales).
// ============================================================
const CANCHAS = {
  CCM: {
    nombre: "Club de Campo Mendoza",
    PAR_TOTAL: 72,
    PAR_HOYOS:    [4, 4, 5, 3, 4, 4, 5, 3, 4, 4, 3, 4, 5, 4, 4, 3, 4, 5],
    STROKE_INDEX: [11, 3, 9, 17, 15, 5, 7, 13, 1, 16, 14, 2, 8, 12, 4, 18, 10, 6],
    CLIMA: { lat: -32.90, lon: -68.79 },   // Guaymallén
  },
  ANDINO: {
    nombre: "Golf Club Andino",
    PAR_TOTAL: 70,
    PAR_HOYOS:    [5, 3, 4, 4, 3, 5, 4, 3, 4, 4, 3, 5, 4, 3, 5, 4, 3, 4],
    STROKE_INDEX: [9, 15, 1, 5, 13, 3, 7, 17, 11, 2, 18, 14, 16, 10, 4, 8, 12, 6],
    CLIMA: { lat: -32.89, lon: -68.87 },   // Parque General San Martín
  },
};
(function () {
  var c = CANCHAS[CONFIG.CANCHA] || CANCHAS.CCM;
  CONFIG.CANCHA_NOMBRE = c.nombre;
  CONFIG.PAR_TOTAL     = c.PAR_TOTAL;
  CONFIG.PAR_HOYOS     = c.PAR_HOYOS;
  CONFIG.STROKE_INDEX  = c.STROKE_INDEX;
  CONFIG.CLIMA         = c.CLIMA;
})();
