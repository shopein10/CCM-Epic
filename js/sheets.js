// ============================================================
// CCM & Epic Golf — Capa de comunicación con Google Sheets
// Toda la lógica de fetch va acá; el resto de la app
// llama a estas funciones sin saber de dónde vienen los datos
// ============================================================

const Sheets = {

  // Cache en memoria para no recargar en cada cambio de tab
  _cache: {
    leaderboard: null,
    cuartos: null,
    historial: null,
    lastFetch: null,
  },

  // ¿El cache sigue fresco? (menos de REFRESH_INTERVAL segundos)
  _isFresh() {
    if (!this._cache.lastFetch) return false;
    return (Date.now() - this._cache.lastFetch) < (CONFIG.REFRESH_INTERVAL * 1000);
  },

  // Llamada base al Apps Script
  async _call(action, payload = {}) {
    const url = new URL(CONFIG.APPS_SCRIPT_URL);
    url.searchParams.set("action", action);

    const opts = {
      method: action === "getAll" ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
    };
    if (action !== "getAll") {
      opts.body = JSON.stringify(payload);
    }

    const res = await fetch(url.toString(), opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  },

  // ============================================================
  // GET — trae todos los datos de una vez
  // El Apps Script devuelve { leaderboard, cuartos, historial }
  // ============================================================
  async getAll(forceRefresh = false) {
    if (!forceRefresh && this._isFresh() && this._cache.leaderboard) {
      return this._cache;
    }
    const data = await this._call("getAll");
    this._cache = { ...data, lastFetch: Date.now() };
    return this._cache;
  },

  // ============================================================
  // POST — guarda golpes de un bloque
  // ============================================================
  async guardarScores({ cuartoId, bloqueInicio, bloqueFin, scores }) {
    // scores: { "Nico DP": [4,3,5], "Festapinto": [5,6,4], ... }
    const res = await this._call("guardarScores", {
      cuartoId,
      bloqueInicio,
      bloqueFin,
      scores,
    });
    // Invalidar cache para forzar refresh
    this._cache.lastFetch = null;
    return res;
  },

  // ============================================================
  // Helpers de formato
  // ============================================================
  formatScore(score) {
    if (score === null || score === undefined || score === "") return "–";
    const n = Number(score);
    if (isNaN(n)) return "–";
    if (n === 0)  return "E";
    if (n > 0)   return `+${n}`;
    return `${n}`;
  },

  scoreClass(score) {
    const n = Number(score);
    if (isNaN(n) || score === null) return "";
    if (n < 0) return "score-under";
    if (n === 0) return "score-even";
    return "score-over";
  },

  cellClass(golpes, par) {
    if (!golpes || !par) return "cell-par";
    const diff = golpes - par;
    if (diff <= -2) return "cell-eagle";
    if (diff === -1) return "cell-birdie";
    if (diff === 0) return "cell-par";
    if (diff === 1) return "cell-bogey";
    return "cell-double";
  },

  // Devuelve las iniciales del nombre para el podio
  initials(nombre) {
    return nombre.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2);
  },
};


// ============================================================
// APPS SCRIPT — código para pegar en Google Apps Script
// (incluido acá como referencia, no se ejecuta en la PWA)
// ============================================================

/*

// ── Pegar esto en Google Apps Script ──────────────────────

const SHEET_ID = "REEMPLAZAR_CON_ID_DEL_SHEET";

// Mapeo de cuartos: cuartoId → { jugador: filaEnSheet }
// Ajustar filas según tu sheet real
const FILAS = {
  Cuarto1: { "Nico DP": 5, "Festapinto": 13, "Pichon": 21, "Cuca": 29 },
  Cuarto2: { "Nacho": 5, "Emi": 13, "Mani": 21, "Maxi": 29 },
  Cuarto3: { "Matungo": 5, "Bocha": 13, "Tato": 21, "Edu": 29 },
  Cuarto4: { "Zorro": 5, "Crazy": 13, "Pera": 21, "Juli": 29 },
  Cuarto5: { "Lucas": 5, "Polino": 13, "Pancho": 21, "Andy": 29 },
  Cuarto6: { "Pui": 5, "Nole": 13, "Mosk": 21, "Principe": 29 },
};

// Columna de cada hoyo (1-indexed, considerando el gap en Hoyo10)
function hoyoACol(h) {
  return h <= 9 ? 2 + h : 3 + h; // C=3 para H1, M=13 para H10
}

function doGet(e) {
  return handleRequest(e);
}
function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const action = e.parameter.action || (e.postData && JSON.parse(e.postData.contents).action);
  try {
    let result;
    if (action === "getAll") {
      result = getAllData();
    } else if (action === "guardarScores") {
      const body = JSON.parse(e.postData.contents);
      result = guardarScores(body);
    } else {
      result = { error: "Acción desconocida: " + action };
    }
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getAllData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  // Leaderboard individual
  const sheetVivo = ss.getSheetByName("Score Vs PAR en VIVO");
  const vivoData = sheetVivo.getDataRange().getValues();
  const leaderboard = [];
  for (let i = 1; i < vivoData.length; i++) {
    const nombre = vivoData[i][2];
    if (!nombre || nombre.toString().trim() === "") break;
    leaderboard.push({
      pos:    vivoData[i][0],
      score:  vivoData[i][1],
      nombre: vivoData[i][2],
      hoyo:   vivoData[i][3],
    });
  }

  // Scores finales (parejas, cuartos)
  const sheetFinal = ss.getSheetByName("Scores Final");
  const finalData = sheetFinal.getDataRange().getValues();

  const parejas = [];
  const cuartosRank = [];
  let modoParejas = false, modoCuartos = false;
  for (let i = 0; i < finalData.length; i++) {
    const col0 = finalData[i][0] ? finalData[i][0].toString() : "";
    if (col0 === "PAREJAS RANKING") { modoParejas = true; modoCuartos = false; continue; }
    if (col0 === "CUARTOS RAKING")  { modoCuartos = true; modoParejas = false; continue; }
    if (modoParejas && finalData[i][3]) {
      parejas.push({ pos: finalData[i][0], score: finalData[i][1], hoyo: finalData[i][2], nombres: finalData[i][3] });
    }
    if (modoCuartos && finalData[i][3]) {
      cuartosRank.push({ pos: finalData[i][0], score: finalData[i][1], hoyo: finalData[i][2], nombres: finalData[i][3] });
    }
  }

  // Scores por cuarto (hoyo a hoyo)
  const cuartosDetalle = {};
  for (const cuartoId of Object.keys(FILAS)) {
    const sheet = ss.getSheetByName(cuartoId);
    if (!sheet) continue;
    const jugadores = FILAS[cuartoId];
    const detalle = {};
    for (const [jugador, fila] of Object.entries(jugadores)) {
      const golpes = [];
      for (let h = 1; h <= 18; h++) {
        const col = hoyoACol(h);
        const val = sheet.getRange(fila, col).getValue();
        golpes.push(val !== "" ? Number(val) : null);
      }
      // Total, handicap, neto
      const filaData = sheet.getRange(fila, 1, 1, 25).getValues()[0];
      detalle[jugador] = {
        golpes,
        total: filaData[21] || null,
        hdc:   filaData[22] || null,
        neto:  filaData[23] || null,
      };
    }
    cuartosDetalle[cuartoId] = detalle;
  }

  // Historial — pestaña opcional "Historial"
  let historial = [];
  const sheetHist = ss.getSheetByName("Historial");
  if (sheetHist) {
    const histData = sheetHist.getDataRange().getValues();
    for (let i = 1; i < histData.length; i++) {
      if (!histData[i][0]) break;
      historial.push({
        fecha:     histData[i][0],
        ganador:   histData[i][1],
        score:     histData[i][2],
        jugadores: histData[i][3],
        polla:     histData[i][4],
        notas:     histData[i][5],
      });
    }
    historial.reverse(); // más reciente primero
  }

  return { leaderboard, parejas, cuartosRank, cuartosDetalle, historial };
}

function guardarScores({ cuartoId, bloqueInicio, bloqueFin, scores }) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(cuartoId);
  if (!sheet) throw new Error("Cuarto no encontrado: " + cuartoId);

  const filasJugadores = FILAS[cuartoId];
  for (const [jugador, golpesArr] of Object.entries(scores)) {
    const fila = filasJugadores[jugador];
    if (!fila) continue;
    for (let h = bloqueInicio; h <= bloqueFin; h++) {
      const col = hoyoACol(h);
      const idx = h - bloqueInicio;
      sheet.getRange(fila, col).setValue(golpesArr[idx]);
    }
  }
  SpreadsheetApp.flush();
  return { ok: true };
}

// ── Fin del código de Apps Script ─────────────────────────
*/
