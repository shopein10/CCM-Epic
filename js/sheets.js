// ============================================================
// CCM & Epic Golf — Capa de comunicación con Google Sheets
// ============================================================

const Sheets = {

  _cache: {
    leaderboard: null,
    cuartos: null,
    historial: null,
    lastFetch: null,
  },

  _isFresh() {
    if (!this._cache.lastFetch) return false;
    return (Date.now() - this._cache.lastFetch) < (CONFIG.REFRESH_INTERVAL * 1000);
  },

  // Después de guardar, el próximo getAll va directo al Apps Script (dato fresco garantizado)
  _freshNext: false,

  async _callGet(action) {
    const url = CONFIG.APPS_SCRIPT_URL + "?action=" + action;
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  },

  // GET via Worker (rápido, caché ~20s) — solo para polling
  async _callWorker(action) {
    const url = CONFIG.WORKER_URL + "/?action=" + action;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, { method: "GET", signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch(e) {
      clearTimeout(timeoutId);
      throw e;
    }
  },

  async _callPost(payload) {
    const url = CONFIG.APPS_SCRIPT_URL;
    // Timeout de 25 segundos para evitar que el botón quede tildado indefinidamente
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(url, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "text/plain" },
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch(e) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") {
        throw new Error("Sin respuesta del servidor (25s). Verificá la conexión y reintentá.");
      }
      throw e;
    }
  },

  async getAll(forceRefresh = false) {
    if (!forceRefresh && this._isFresh() && this._cache.leaderboard) {
      return this._cache;
    }
    let data;
    if (this._freshNext || forceRefresh || !CONFIG.WORKER_URL) {
      // Directo al Apps Script: fresco garantizado (post-envío o refresh manual)
      data = await this._callGet("getAll");
      this._freshNext = false;
    } else {
      // Polling normal: Worker (rápido); si falla, fallback directo
      try {
        data = await this._callWorker("getAll");
      } catch(e) {
        data = await this._callGet("getAll");
      }
    }
    this._cache = { ...data, lastFetch: Date.now() };
    return this._cache;
  },

  async guardarScores({ cuartoId, bloqueInicio, bloqueFin, scores }) {
    const res = await this._callPost({
      action: "guardarScores",
      token: CONFIG.SCORE_TOKEN,
      cuartoId,
      bloqueInicio,
      bloqueFin,
      scores,
    });
    this._cache.lastFetch = null;
    this._freshNext = true; // el próximo getAll trae el dato recién escrito, sin caché
    return res;
  },

  formatScore(score) {
    if (score === null || score === undefined || score === "") return "–";
    const n = Number(score);
    if (isNaN(n)) return "–";
    if (n === 0) return "E";
    if (n > 0) return "+" + n;
    return "" + n;
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

  initials(nombre) {
    return nombre.split(" ").map(function(w) { return w[0]; }).join("").toUpperCase().slice(0,2);
  },
};
