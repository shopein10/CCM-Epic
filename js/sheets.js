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

  async _callGet(action) {
    const url = CONFIG.APPS_SCRIPT_URL + "?action=" + action;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
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
    const data = await this._callGet("getAll");

    // Normalizar cuartos (array) -> cuartosDetalle (objeto keyed por nombre)
    if (data.cuartos && !data.cuartosDetalle) {
      data.cuartosDetalle = {};
      const ids = Object.keys(data.cuartos);
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        data.cuartosDetalle[id] = {};
        const jugadores = data.cuartos[id];
        for (let j = 0; j < jugadores.length; j++) {
          const jug = jugadores[j];
          data.cuartosDetalle[id][jug.nombre] = {
            golpes: jug.golpesPorHoyo,
            neto: jug.score
          };
        }
      }
    }

    // Derivar config.cuartos de los datos reales del sheet
    if (data.cuartos && !data.config) {
      data.config = {
        cuartos: Object.keys(data.cuartos).map(function(id) {
          return {
            id: id,
            nombre: id.replace(/Cuarto(\d+)/, 'Cuarto $1'),
            jugadores: data.cuartos[id].map(function(j) { return j.nombre; })
          };
        })
      };
    }

    this._cache = Object.assign({}, data, { lastFetch: Date.now() });
    return this._cache;
  },

  async guardarScores({ cuartoId, bloqueInicio, bloqueFin, scores }) {
    const res = await this._callPost({
      action: "guardarScores",
      cuartoId,
      bloqueInicio,
      bloqueFin,
      scores,
    });
    this._cache.lastFetch = null;
    return res;
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
