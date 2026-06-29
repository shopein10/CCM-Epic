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

  async _callGet(action, bustCache = false) {
    let url = CONFIG.APPS_SCRIPT_URL + "?action=" + action;
    if (bustCache) url += "&_t=" + Date.now();
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  },

  async _callPost(payload) {
    // Para POST usamos un form encode para evitar CORS preflight
    const url = CONFIG.APPS_SCRIPT_URL;
    const params = new URLSearchParams();
    params.append("payload", JSON.stringify(payload));
    const res = await fetch(url, {
      method: "POST",
      body: params,
      redirect: "follow",
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  },

  async getAll(forceRefresh = false) {
    if (!forceRefresh && this._isFresh() && this._cache.leaderboard) {
      return this._cache;
    }
    const data = await this._callGet("getAll", forceRefresh);;
    this._cache = { ...data, lastFetch: Date.now() };
    return this._cache;
  },

  async guardarScores({ cuartoId, bloqueInicio, bloqueFin, scores }) {
    const params = new URLSearchParams({
      action: "guardarScores",
      cuartoId: cuartoId,
      bloqueInicio: bloqueInicio,
      bloqueFin: bloqueFin,
      scores: JSON.stringify(scores),
    });
    const url = "https://script.google.com/macros/s/AKfycbxRrd-8X6oOTLzTwTKCiU1QJiWxxrTP6ISFOroXq75nfomSk9oqdxfhh65tTTLSLH7kHA/exec" + "?" + params.toString();
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    this._cache.lastFetch = null;
    return data;
  },

  formatScore(score) {
    if (score === null || score === undefined || score === "") return "–";
    const n = Number(score);
    if (isNaN(n)) return "–";
    if (n === 0)  return "E";
    if (n > 0)   return "+" + n;
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
