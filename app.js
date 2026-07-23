// ============================================================
// CCM & Epic Golf PWA — App principal
// ============================================================

// ── Estado ──────────────────────────────────────────────────
const State = {
  view: "leaderboard",
  tab: "individual",
  cuartoSeleccionado: null,
  form: {
    cuarto: null,
    bloque: null,
    scores: {},
  },
  refreshTimer: null,
};

// ── Init ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(initApp, 1200); // Dejar que se vea el splash
});

async function initApp() {
  buildCuartoBtns();
  buildTarjetasBtns();
  buildFormCuartos();
  setupNav();
  setupTabs();
  setupForm();
  setupRefresh();
  setupTema();
  setupTarjetaModal();
  setupClima();

  await loadAndRender(true);

  // Ocultar splash
  document.getElementById("splash").classList.add("fade-out");
  setTimeout(() => {
    document.getElementById("splash").style.display = "none";
    document.getElementById("app").classList.remove("hidden");
  }, 400);

  // Auto-refresh
  State.refreshTimer = setInterval(() => {
    if (State.view !== "cargar") loadAndRender();
  }, CONFIG.REFRESH_INTERVAL * 1000);
}

// ── Carga y render ──────────────────────────────────────────
async function loadAndRender(showSkeleton = false, force = false) {
  if (showSkeleton) renderSkeletons();
  try {
    const data = await Sheets.getAll(force);
    renderLeaderboard(data);
    renderCuartos(data);
    renderMatchs(data);
    renderTarjetas(data);
    renderHistorial(data);
    updateLiveBadge(data);
    updateLastUpdate(data);
  } catch (err) {
    console.error("Error cargando datos:", err);
    renderError();
  }
}

// ── Navegación ───────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      navigateTo(view);
    });
  });
}

function navigateTo(view) {
  State.view = view;
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${view}`));
}

// ── Tabs ─────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const tabId = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tabId));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === `tab-${tabId}`));
    });
  });
}

// ── Tema claro / oscuro ──────────────────────────────────────
// El tema se aplica en un <script> inline del <head> ANTES del primer paint
// (si se hiciera acá se vería un flash oscuro al abrir). Acá solo el toggle.
const THEME_KEY = "ccm-theme";
const THEME_COLOR = { light: "#f2efe4", dark: "#0c1a0f" };

function aplicarTema(t) {
  // Chrome NO recalcula una transition cuyo valor sale de una variable CSS:
  // .nav-item y .icon-btn tienen `transition: color` y se quedaban pintados
  // con el color del tema anterior. Apagamos las transiciones durante el cambio.
  const root = document.documentElement;
  root.classList.add("theme-switching");
  void root.offsetHeight;
  root.setAttribute("data-theme", t);
  void root.offsetHeight;
  root.classList.remove("theme-switching");
  const btn = document.getElementById("btn-theme");
  if (btn) {
    // El ícono muestra a DÓNDE vas, no dónde estás
    btn.textContent = t === "light" ? "🌙" : "☀️";
    btn.title = t === "light" ? "Modo oscuro" : "Modo claro";
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[t] || THEME_COLOR.light);
  try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
}

function setupTema() {
  const btn = document.getElementById("btn-theme");
  if (!btn) return;
  aplicarTema(document.documentElement.getAttribute("data-theme") || "light");
  btn.addEventListener("click", () => {
    const actual = document.documentElement.getAttribute("data-theme");
    aplicarTema(actual === "light" ? "dark" : "light");
  });
}

// ── Clima del header (Open-Meteo, sin API key) ───────────────
// Falla silenciosa: si no responde, el bloque queda oculto y no rompe nada.
// Se refresca cada 15 min (el clima no cambia tan rápido; NO cuelga del polling
// de 30s del leaderboard).
const CLIMA_REFRESH_MIN = 15;

// Código WMO de Open-Meteo → emoji del estado del cielo.
function climaIcono(code, esDia) {
  if (code === 0) return esDia ? "☀️" : "🌙";
  if (code === 1 || code === 2) return esDia ? "🌤️" : "☁️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "🌨️";
  if (code >= 95) return "⛈️";
  return "🌡️";
}

function climaRumbo(dir) {
  return ["N","NE","E","SE","S","SO","O","NO"][Math.round(dir / 45) % 8];
}

async function cargarClima() {
  const el = document.getElementById("clima");
  if (!el || !CONFIG.CLIMA) return;
  const { lat, lon } = CONFIG.CLIMA;
  const url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
    "&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day" +
    "&wind_speed_unit=kmh&timezone=America%2FArgentina%2FMendoza";
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(to);
    if (!res.ok) throw new Error("clima HTTP " + res.status);
    const c = (await res.json()).current;
    if (!c || c.temperature_2m == null) throw new Error("sin datos current");
    const temp = Math.round(c.temperature_2m);
    const icono = climaIcono(c.weather_code, c.is_day === 1);
    const viento = Math.round(c.wind_speed_10m);
    const dir = c.wind_direction_10m || 0;
    // wind_direction_10m es de DÓNDE viene el viento. La flecha apunta HACIA
    // dónde sopla (lo intuitivo para el jugador), por eso +180.
    const rot = (dir + 180) % 360;
    el.innerHTML =
      '<span class="clima-icon">' + icono + '</span>' +
      '<span class="clima-temp">' + temp + '°</span>' +
      '<span class="clima-wind" title="Viento ' + viento + ' km/h del ' + climaRumbo(dir) + '">' +
        '<span class="clima-arrow" style="transform:rotate(' + rot + 'deg)">↑</span>' + viento +
      '</span>';
    el.classList.remove("hidden");
  } catch (e) {
    console.warn("Clima no disponible:", e);
    el.classList.add("hidden");
  }
}

function setupClima() {
  cargarClima();
  setInterval(cargarClima, CLIMA_REFRESH_MIN * 60 * 1000);
}

// ── Refresh ──────────────────────────────────────────────────
function setupRefresh() {
  document.getElementById("btn-refresh").addEventListener("click", async () => {
    const btn = document.getElementById("btn-refresh");
    btn.style.transform = "rotate(360deg)";
    btn.style.transition = "transform .5s";
    setTimeout(() => { btn.style.transform = ""; btn.style.transition = ""; }, 500);
    await loadAndRender(false, true); // refresh manual → directo al Apps Script, sin caché
  });
}

function updateLastUpdate(data) {
  const el = document.getElementById("last-update");
  const now = new Date();
  const hora = `${now.getHours()}:${String(now.getMinutes()).padStart(2,"0")}`;
  // Indicador de versión: v<front>/a<apps script> — para diagnosticar deploys viejos de un vistazo
  const api = data && data.version ? `/a${data.version}` : "";
  el.textContent = `${hora} · v${CONFIG.APP_VERSION}${api}`;
}

function updateLiveBadge(data) {
  // Mostrar "EN VIVO" si hay jugadores que no terminaron aún (hoyo != H18)
  const badge = document.getElementById("live-badge");
  const hayScores = data.leaderboard && data.leaderboard.some(r => r.hoyo && r.hoyo !== "H18" && r.hoyo !== "Hoyo18");
  badge.classList.toggle("hidden", !hayScores);
}

// ── RENDER: LEADERBOARD ──────────────────────────────────────
function renderLeaderboard(data) {
  renderIndividual(data.leaderboard || []);
  renderParejas(data.parejas || []);
  renderCuartosRank(data.cuartosRank || []);
}

function renderIndividual(rows) {
  // Sin podio — vaciar el elemento si existe
  const podioEl = document.getElementById("podio");
  if (podioEl) podioEl.innerHTML = "";

  // Tabla completa con empates
  const tablaEl = document.getElementById("tabla-individual");
  if (!rows.length) {
    tablaEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🏌️</div><p>El ranking individual aparece acá durante el torneo</p></div>`;
    return;
  }
  // Posición por SCORE: los empatados comparten posición, estilo golf (1, T2, T2, 4…).
  // rows viene ordenado de mejor a peor. rank = 1 + jugadores con score estrictamente mejor.
  const scoreCounts = {};
  rows.forEach(r => { const k = String(r.score); scoreCounts[k] = (scoreCounts[k] || 0) + 1; });
  tablaEl.innerHTML = rows.map(r => {
    const sc = Sheets.scoreClass(r.score);
    const rank = rows.filter(x => x.score < r.score).length + 1;
    const empatado = scoreCounts[String(r.score)] > 1;
    const posStr = empatado ? "T" + rank : String(rank);
    return `
      <div class="score-row ${rank <= 3 ? "top-3" : ""}">
        <span class="row-pos">${posStr}</span>
        <span class="row-name row-name-click" data-jugador="${r.nombre}">${r.nombre}</span>
        <span class="row-hoyo">${r.hoyo || ""}</span>
        <span class="row-score ${sc}">${Sheets.formatScore(r.score)}</span>
      </div>`;
  }).join("");
}

// ── TARJETA INDIVIDUAL (click en un nombre del ranking) ──────
// El click se resuelve por NOMBRE (data-jugador), no por posición en la
// tabla; por eso el reordenamiento del ranking no rompe nada.
function setupTarjetaModal() {
  const tabla = document.getElementById("tabla-individual");
  if (tabla) {
    tabla.addEventListener("click", e => {
      const el = e.target.closest("[data-jugador]");
      if (!el) return;
      abrirTarjetaIndividual(el.dataset.jugador);
    });
  }
  const modal = document.getElementById("tarjeta-modal");
  if (modal) {
    modal.addEventListener("click", e => {
      // Cerrar al tocar el fondo o el botón ✕
      if (e.target === modal || e.target.closest("[data-close-modal]")) {
        cerrarTarjetaIndividual();
      }
    });
  }
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") cerrarTarjetaIndividual();
  });
}

// Busca el detalle de un jugador (golpes/neto/hdc/hdc85) en cualquier cuarto.
function findJugadorDetalle(data, nombre) {
  const cd = (data && data.cuartosDetalle) || {};
  for (const cid in cd) {
    if (cd[cid] && cd[cid][nombre]) return cd[cid][nombre];
  }
  return null;
}

function abrirTarjetaIndividual(nombre) {
  const modal = document.getElementById("tarjeta-modal");
  const body  = document.getElementById("tarjeta-modal-body");
  if (!modal || !body) return;
  const info = findJugadorDetalle(Sheets._cache, nombre);
  body.innerHTML = info
    ? buildTarjetaIndividualHTML(nombre, info)
    : `<p style="color:var(--text-muted)">Sin datos para ${nombre}.</p>`;
  modal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function cerrarTarjetaIndividual() {
  const modal = document.getElementById("tarjeta-modal");
  if (!modal || !modal.classList.contains("open")) return;
  modal.classList.remove("open");
  document.body.style.overflow = "";
}

// Encabezado (nombre + HDC 100% + HDC 85%) + la tarjeta de siempre para un solo jugador.
function buildTarjetaIndividualHTML(nombre, info) {
  const hdc   = info.hdc != null ? info.hdc : (info.handicap != null ? info.handicap : null);
  const hdc85 = info.hdc85 != null ? info.hdc85 : null;
  const header = `
    <div class="ti-header">
      <span class="ti-name">${nombre}</span>
      <span class="ti-hdc"><span class="ti-hdc-lbl">HDC 100%</span><span class="ti-hdc-val">${hdc != null ? hdc : "–"}</span></span>
      <span class="ti-hdc"><span class="ti-hdc-lbl">HDC 85%</span><span class="ti-hdc-val">${hdc85 != null ? hdc85 : "–"}</span></span>
    </div>`;
  const pseudoConfig = { nombre, jugadores: [nombre] };
  const detalle = { [nombre]: info };
  // El ajuste del match depende del CUARTO, no del jugador: buscamos su cuarto
  // real para no calcular el min sobre una sola persona (daría siempre 0).
  const cuartoDet = findCuartoDeJugador(Sheets._cache, nombre);
  const mn = cuartoDet ? minHdc85(cuartoDet) : 0;
  return header + buildScorecardHTML(pseudoConfig, detalle, null, mn);
}

function renderParejas(rows) {
  const el = document.getElementById("tabla-parejas");
  rows = rows.filter(r => r.score !== null && r.score !== undefined);
  if (!rows.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🤝</div><p>Los scores de parejas aparecen acá durante el torneo</p></div>`;
    return;
  }
  el.innerHTML = rows.map((r, i) => {
    const sc = Sheets.scoreClass(r.score);
    const isTop = i < 3;
    return `
      <div class="score-row ${isTop ? "top-3" : ""}">
        <span class="row-pos">${r.pos}</span>
        <span class="row-name">${r.nombres}</span>
        <span class="row-hoyo">${r.hoyo || ""}</span>
        <span class="row-score ${sc}">${Sheets.formatScore(r.score)}</span>
      </div>`;
  }).join("");
}

function renderCuartosRank(rows) {
  const el = document.getElementById("tabla-cuartos");
  rows = rows.filter(r => r.score !== null && r.score !== undefined);
  if (!rows.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>El ranking de cuartos aparece acá durante el torneo</p></div>`;
    return;
  }
  el.innerHTML = rows.map((r, i) => {
    const sc = Sheets.scoreClass(r.score);
    const isTop = i < 3;
    return `
      <div class="score-row ${isTop ? "top-3" : ""}">
        <span class="row-pos">${r.pos}</span>
        <span class="row-name" style="font-size:12px">${r.nombres}</span>
        <span class="row-hoyo">${r.hoyo || ""}</span>
        <span class="row-score ${sc}">${Sheets.formatScore(r.score)}</span>
      </div>`;
  }).join("");
}

// ── RENDER: CUARTOS DETALLE ──────────────────────────────────
function buildCuartoBtns() {
  const grid = document.getElementById("cuartos-selector");
  grid.innerHTML = CONFIG.CUARTOS.map(c => `
    <button class="cuarto-btn" data-cuarto="${c.id}">
      <div class="cuarto-btn-title">${c.nombre}</div>
      <div class="cuarto-btn-names">${c.jugadores.join("<br>")}</div>
      <div class="cuarto-btn-score" id="mini-score-${c.id}">–</div>
      <div class="cuarto-btn-hole hidden" id="mini-hole-${c.id}"></div>
    </button>
  `).join("");

  grid.querySelectorAll(".cuarto-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.cuarto;
      grid.querySelectorAll(".cuarto-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      State.cuartoSeleccionado = id;
      mostrarDetalleCuarto(id);
    });
  });
}

function renderCuartos(data) {
  if (!data.cuartosDetalle) return;

  // Actualizar nombres reales de jugadores desde el sheet
  CONFIG.CUARTOS.forEach(c => {
    const det = data.cuartosDetalle[c.id];

    // Cuarto vacío o inexistente → ocultar en todos los selectores
    const isEmpty = !det || Object.keys(det).filter(n => n !== "VACIO").length === 0;
    ["#cuartos-selector", "#cuarto-btns", "#tarjetas-selector"].forEach(sel => {
      const btn = document.querySelector(`${sel} [data-cuarto="${c.id}"]`);
      if (btn) btn.style.display = isEmpty ? "none" : "";
    });
    if (isEmpty) return;

    const names = Object.keys(det).filter(n => n !== "VACIO");
    c.jugadores = names;
    const el1 = document.querySelector(`#cuartos-selector [data-cuarto="${c.id}"] .cuarto-btn-names`);
    if (el1) el1.innerHTML = names.map(n => {
      const h85 = det[n] && det[n].hdc85 != null ? det[n].hdc85 : null;
      return h85 != null ? `${n} <span style="color:var(--gold-dim);font-size:11px;font-family:'DM Mono',monospace">${h85}</span>` : n;
    }).join("<br>");
    const el2 = document.querySelector(`#cuarto-btns [data-cuarto="${c.id}"] .form-cuarto-jugadores`);
    if (el2) el2.innerHTML = names.join("<br>");
    const el3 = document.querySelector(`#tarjetas-selector [data-cuarto="${c.id}"] .cuarto-btn-names`);
    if (el3) el3.innerHTML = names.join("<br>");
  });

  // Actualizar mini-scores y hoyo actual en las tarjetas
  CONFIG.CUARTOS.forEach(c => {
    const el = document.getElementById(`mini-score-${c.id}`);
    if (!el) return;
    const detalle = data.cuartosDetalle[c.id];
    if (!detalle) return;
    // Score del cuarto desde cuartosRank
    const rankItem = (data.cuartosRank || []).find(r =>
      c.jugadores.some(j => r.nombres && r.nombres.includes(j))
    );
    if (rankItem) {
      el.textContent = Sheets.formatScore(rankItem.score);
      el.className = `cuarto-btn-score ${Sheets.scoreClass(rankItem.score)}`;
    }
    // Hoyo actual: usar hoyo de rankItem si está disponible, sino contar golpes
    // (el conteo se traduce a hoyo REAL según la salida del cuarto)
    const holesPlayed = Object.values(detalle).map(j => j.golpes ? j.golpes.filter(g => g != null).length : 0);
    const maxHole = holesPlayed.length ? Math.max(...holesPlayed) : 0;
    const salidaC = (data.salidas && data.salidas[c.id]) || 1;
    const hoyoFallback = maxHole > 0 ? "H" + (((salidaC - 1 + maxHole - 1) % 18) + 1) : null;
    const hoyoStr = rankItem?.hoyo ? rankItem.hoyo.replace("Hoyo","H") : hoyoFallback;
    const holeEl = document.getElementById(`mini-hole-${c.id}`);
    if (holeEl) {
      if (hoyoStr) { holeEl.textContent = hoyoStr; holeEl.classList.remove("hidden"); }
      else { holeEl.classList.add("hidden"); }
    }
  });

  // Si hay un cuarto seleccionado, refrescar su detalle
  if (State.cuartoSeleccionado) {
    mostrarDetalleCuarto(State.cuartoSeleccionado);
  }
}

async function mostrarDetalleCuarto(cuartoId) {
  const detailEl = document.getElementById("cuarto-detail");
  detailEl.classList.remove("hidden");
  const cuartoConfig = CONFIG.CUARTOS.find(c => c.id === cuartoId);
  if (!cuartoConfig) return;
  try {
    const data = await Sheets.getAll();
    const detalle = data.cuartosDetalle && data.cuartosDetalle[cuartoId];
    if (!detalle) {
      detailEl.innerHTML = `<p style="color:var(--text-muted)">Sin datos para este cuarto</p>`;
      return;
    }
    const evo = data.evolucionCuartos && data.evolucionCuartos[cuartoId];
    // Mismo min que usa el match, así los puntitos del 85% coinciden con los puntos.
    const mcx = calcularMatch(data, cuartoId);
    detailEl.innerHTML = `<h3>${cuartoConfig.nombre}</h3>` + buildScorecardHTML(cuartoConfig, detalle, evo, mcx ? mcx.min : undefined);
  } catch(e) {
    detailEl.innerHTML = `<p style="color:var(--red-over)">Error al cargar. Intentá de nuevo.</p>`;
  }
}

// ── REPARTO DE GOLPES DE HÁNDICAP ────────────────────────────
// Reparte un total de golpes sobre los 18 hoyos según el stroke index.
// Positivo: los golpes van a los hoyos MÁS difíciles (índice 1,2,3…).
// Negativo (hándicap plus): DEVUELVE golpes en los hoyos MÁS fáciles (índice 18,17…).
function repartirGolpes(total) {
  const si = CONFIG.STROKE_INDEX;
  const arr = new Array(18).fill(0);
  if (!total) return arr;
  const s = total < 0 ? -1 : 1;
  const n = Math.abs(total);
  const full = Math.floor(n / 18);
  const rem  = n % 18;
  for (let i = 0; i < 18; i++) arr[i] = s * full;
  for (let k = 1; k <= rem; k++) {
    const idxObjetivo = s > 0 ? k : (19 - k);      // índice de hoyo que recibe el extra
    const hoyo = si.indexOf(idxObjetivo);          // hoyo REAL con ese stroke index
    if (hoyo >= 0) arr[hoyo] += s;
  }
  return arr;
}

// ── MATCH: HDC 85% AJUSTADO ("el mejor baja a 0") ────────────
// En los MATCHS no se juega con el hdc85 crudo: el jugador de MENOR hdc85 del
// CUARTO baja a 0 y los otros tres descuentan esa misma cantidad. Es decir,
// golpes de match = hdc85 - min(hdc85 de los 4).
// Consecuencia útil: después del ajuste nadie queda en negativo, así que
// desaparece por completo el caso de "devolver" golpes dentro del match.
// (El HDC 100% del juego individual NO se toca: eso sigue crudo.)
function minHdc85(detalle) {
  const vals = Object.keys(detalle || {})
    .filter(n => n !== "VACIO" && detalle[n] && detalle[n].hdc85 != null)
    .map(n => detalle[n].hdc85);
  return vals.length ? Math.min.apply(null, vals) : 0;
}

// Busca el detalle COMPLETO del cuarto donde juega un jugador (para conocer el
// min del cuarto cuando se abre la tarjeta individual desde el ranking).
function findCuartoDeJugador(data, nombre) {
  const cd = (data && data.cuartosDetalle) || {};
  for (const cid in cd) {
    if (cd[cid] && cd[cid][nombre]) return cd[cid];
  }
  return null;
}

// El 85% viene calculado sobre el index en la planilla (B10/B19/B28/B37);
// no lo derivamos acá, lo recibimos en hdc85 desde el getAll.
// base  = golpes al 85% CRUDO (con "+" ámbar si el jugador es plus, hdc85 < 0).
// match = golpes al 85% AJUSTADO (el mejor del cuarto a 0): max(0, hdc85 - min).
// minMatch = min(hdc85) del cuarto; si no se pasa, no se ajusta (0).
function computeReparto(hdc85, minMatch) {
  const mn = minMatch || 0;
  const ajust = hdc85 == null ? null : Math.max(0, hdc85 - mn);
  return { base: repartirGolpes(hdc85), match: repartirGolpes(ajust) };
}

// Puntitos de hándicap en la esquina de la celda. DOS marcas INDEPENDIENTES:
//   • verde (rep-juego) = golpe al 85% CRUDO (b). Si b < 0 (jugador plus) → "+" ámbar (devuelve golpe).
//   • azul  (rep-match) = golpe en el MATCH (m, 85% ajustado con el mejor del cuarto a 0).
// Un hoyo puede tener las dos → se ven dos puntos distintos, uno de cada color.
function repartoDots(b, m) {
  b = b || 0; m = m || 0;
  if (!b && !m) return "";
  let out = "";
  if (b < 0) {
    for (let k = 0; k < Math.abs(b); k++) out += `<span class="rep-give">+</span>`;
  } else {
    for (let k = 0; k < b; k++) out += `<span class="rep-dot rep-juego"></span>`;
  }
  for (let k = 0; k < m; k++) out += `<span class="rep-dot rep-match"></span>`;
  return out ? `<span class="rep-wrap">${out}</span>` : "";
}

// ── SCORECARD HELPER ─────────────────────────────────────────
function buildScorecardHTML(cuartoConfig, detalle, evo, minMatch) {
  // Los puntitos del 85% se dibujan con el hdc85 YA AJUSTADO (el mejor a 0).
  const mnMatch = (minMatch != null) ? minMatch : minHdc85(detalle);
  const pars   = CONFIG.PAR_HOYOS;
  const parOut = pars.slice(0, 9).reduce((a, b) => a + b, 0);
  const parIn  = pars.slice(9).reduce((a, b) => a + b, 0);

  const filas = cuartoConfig.jugadores.map(jugador => {
    const info = detalle[jugador];
    if (!info) return "";
    const g = info.golpes;
    const rep = info.hdc85 != null ? computeReparto(info.hdc85, mnMatch) : null;

    const cel = (v, i) => {
      const dots = rep ? repartoDots(rep.base[i], rep.match[i]) : "";
      return v == null
        ? `<td class="cell-par sc-cell">–${dots}</td>`
        : `<td class="${Sheets.cellClass(v, pars[i])} sc-cell"><span class="sc-badge">${v}</span>${dots}</td>`;
    };

    const cOut = g.slice(0, 9).map((v, i) => cel(v, i)).join("");
    const cIn  = g.slice(9).map((v, i) => cel(v, i + 9)).join("");

    const sumOut = g.slice(0, 9).filter(v => v != null).reduce((a, b) => a + b, 0);
    const hasOut = g.slice(0, 9).some(v => v != null);
    const sumIn  = g.slice(9).filter(v => v != null).reduce((a, b) => a + b, 0);
    const hasIn  = g.slice(9).some(v => v != null);
    const bruto  = (hasOut || hasIn) ? sumOut + sumIn : null;

    const hdcVal = info.hdc != null ? info.hdc : (info.handicap != null ? info.handicap : null);
    const neto   = info.neto != null ? info.neto : null;
    const netoVsPar = neto != null ? neto - CONFIG.PAR_TOTAL : null;

    return `
      <tr>
        <td class="td-name">${jugador}</td>
        ${cOut}
        <td class="td-total" style="font-weight:600">${hasOut ? sumOut : "–"}</td>
        ${cIn}
        <td class="td-total" style="font-weight:600">${hasIn ? sumIn : "–"}</td>
        <td class="td-total" style="font-weight:700">${bruto != null ? bruto : "–"}</td>
        <td class="td-total" style="color:var(--text-muted);font-size:11px">${hdcVal != null ? hdcVal : "–"}</td>
        <td class="td-total ${Sheets.scoreClass(netoVsPar)}">${neto != null ? neto : "–"}</td>
      </tr>`;
  }).join("");

  const th9  = Array.from({length:9}, (_, i) => `<th>${i+1}</th>`).join("");
  const th9b = Array.from({length:9}, (_, i) => `<th>${i+10}</th>`).join("");
  const p9   = pars.slice(0,9).map(p => `<th style="color:var(--text-muted)">${p}</th>`).join("");
  const p9b  = pars.slice(9).map(p  => `<th style="color:var(--text-muted)">${p}</th>`).join("");

  // Fila de evolución del cuarto (fila 50 del sheet) — se usa como desempate.
  // Viene del backend ya indexada por hoyo REAL 1..18, así que cae alineada con las columnas.
  // Es acumulativa, no aditiva: por eso OUT/IN/Total se dejan vacíos (sumarlos no significaría nada).
  const evoCel = v => `<td class="${v != null ? Sheets.scoreClass(v) : ""}">${v != null ? Sheets.formatScore(v) : "–"}</td>`;
  const filaEvo = (Array.isArray(evo) && evo.some(v => v != null)) ? `
      <tr class="sc-evo-row">
        <td class="td-name">Evolución</td>
        ${evo.slice(0, 9).map(evoCel).join("")}
        <td></td>
        ${evo.slice(9).map(evoCel).join("")}
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>` : "";

  return `
    <table class="scorecard-table">
      <thead>
        <tr>
          <th>Jugador</th>
          ${th9}
          <th>OUT</th>
          ${th9b}
          <th>IN</th>
          <th>Total</th>
          <th title="Handicap">HDC</th>
          <th>Neto</th>
        </tr>
        <tr>
          <th style="text-align:left;color:var(--copper)">Par</th>
          ${p9}
          <th style="color:var(--text-muted);font-weight:600">${parOut}</th>
          ${p9b}
          <th style="color:var(--text-muted);font-weight:600">${parIn}</th>
          <th style="color:var(--text-muted);font-weight:700">${CONFIG.PAR_TOTAL}</th>
          <th></th>
          <th style="color:var(--text-muted)">${CONFIG.PAR_TOTAL}</th>
        </tr>
      </thead>
      <tbody>${filas}${filaEvo}</tbody>
    </table>
    <div class="rep-legend">
      <span><span class="rep-dot rep-juego"></span> golpe 85%</span>
      <span><span class="rep-dot rep-match"></span> golpe match (85% ajustado)</span>
      <span><span class="rep-give">+</span> devuelve golpe (hdc &minus;)</span>
    </div>`;
}

// ── RENDER: HISTORIAL ────────────────────────────────────────
function renderHistorial(data) {
  const el = document.getElementById("historial-list");
  const historial = data.historial || [];

  if (!historial.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📅</div>
        <p>El historial de torneos aparecerá acá.<br>Agregá una pestaña "Historial" al Sheet con las columnas:<br>Fecha / Ganador / Score / Jugadores / Polla / Notas</p>
      </div>`;
    return;
  }

  el.innerHTML = historial.map(t => `
    <div class="historial-card">
      <div class="historial-fecha">${formatFecha(t.fecha)}</div>
      <div class="historial-ganador">🥇 ${t.ganador}</div>
      <div class="historial-score">${Sheets.formatScore(t.score)}</div>
      <div class="historial-meta">${t.jugadores} jugadores · $${Number(t.polla||0).toLocaleString("es-AR")} en juego</div>
      ${t.notas ? `<div class="historial-meta" style="margin-top:6px;font-style:italic">${t.notas}</div>` : ""}
    </div>`).join("");
}

function formatFecha(fecha) {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (isNaN(d)) return String(fecha);
  return d.toLocaleDateString("es-AR", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
}

// ── FORM: CARGAR SCORES ──────────────────────────────────────
function buildFormCuartos() {
  const grid = document.getElementById("cuarto-btns");
  grid.innerHTML = CONFIG.CUARTOS.map(c => `
    <button type="button" class="option-btn" data-cuarto="${c.id}">
      <div class="form-cuarto-nombre">${c.nombre}</div>
      <div class="form-cuarto-jugadores">${c.jugadores.join("<br>")}</div>
    </button>
  `).join("");
}

function setupForm() {
  // Paso 1: seleccionar cuarto
  document.getElementById("cuarto-btns").querySelectorAll(".option-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#cuarto-btns .option-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      State.form.cuarto = btn.dataset.cuarto;
      goToStep(2);
      markBloqueButtons(btn.dataset.cuarto);
    });
  });

  // Paso 2: seleccionar bloque
  document.getElementById("bloque-btns").querySelectorAll(".option-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#bloque-btns .option-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      State.form.bloque = btn.dataset.bloque;
      goToStep(3); // goToStep ya llama buildInputsGolpes — no llamar dos veces
    });
  });

  // Paso 4: confirmar/editar/enviar
  document.getElementById("btn-edit").addEventListener("click", () => goToStep(3));
  document.getElementById("btn-enviar").addEventListener("click", enviarScores);
  document.getElementById("btn-nuevo").addEventListener("click", resetForm);
}

function goToStep(n) {
  document.querySelectorAll(".form-step").forEach(s => s.classList.remove("active"));
  const step = document.getElementById(`step-${n}`);
  if (step) {
    step.classList.add("active");
    if (n === 3) buildInputsGolpes();
    if (n === 4) buildConfirmPreview();
  }
}

function buildInputsGolpes() {
  const cuartoConfig = CONFIG.CUARTOS.find(c => c.id === State.form.cuarto);
  if (!cuartoConfig || !State.form.bloque) return;

  const [ini, fin] = State.form.bloque.split("-").map(Number);
  const container = document.getElementById("inputs-golpes");

  container.innerHTML = cuartoConfig.jugadores.map(jugador => {
    const hoyos = Array.from({length: fin - ini + 1}, (_, i) => {
      const h = ini + i;
      const par = CONFIG.PAR_HOYOS[h - 1];
      return `
        <div class="hoyo-input-wrap">
          <label>H${h} <span style="color:var(--text-muted)">(P${par})</span></label>
          <input type="number" min="1" max="12" inputmode="numeric"
                 data-jugador="${jugador}" data-hoyo="${h}"
                 placeholder="${par}"
                 value="${(State.form.scores[jugador] && State.form.scores[jugador][h]) || ""}">
        </div>`;
    }).join("");

    return `
      <div class="jugador-block">
        <div class="jugador-label">${jugador}</div>
        <div class="hoyo-inputs">${hoyos}</div>
      </div>`;
  }).join("");

  // Colorear inputs vs par al escribir
  container.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("input", () => {
      const h = parseInt(inp.dataset.hoyo);
      const par = CONFIG.PAR_HOYOS[h - 1];
      const val = parseInt(inp.value);
      inp.classList.remove("vs-par-under", "vs-par-over");
      inp.closest(".hoyo-input-wrap")?.classList.remove("already-loaded");
      if (!isNaN(val)) {
        if (val < par) inp.classList.add("vs-par-under");
        if (val > par) inp.classList.add("vs-par-over");
      }
      // Guardar en state
      const jugador = inp.dataset.jugador;
      if (!State.form.scores[jugador]) State.form.scores[jugador] = {};
      State.form.scores[jugador][h] = val;
    });

    // Avanzar al siguiente input al completar
    inp.addEventListener("keyup", e => {
      if (e.key === "Enter" || inp.value.length >= 2) {
        const all = [...container.querySelectorAll("input")];
        const idx = all.indexOf(inp);
        if (idx < all.length - 1) all[idx + 1].focus();
        else { collectScores(); goToStep(4); } // último input → ir a revisar
      }
    });
  });

  // Botón continuar al paso 4
  let btnCont = container.parentElement.querySelector(".btn-continue-step3");
  if (!btnCont) {
    btnCont = document.createElement("button");
    btnCont.type = "button";
    btnCont.className = "btn-primary btn-continue-step3";
    btnCont.style.marginTop = "8px";
    btnCont.textContent = "Revisar →";
    btnCont.addEventListener("click", () => {
      collectScores();
      goToStep(4);
    });
    container.after(btnCont);
  }

  // Marcar hoyos que ya tienen datos cargados en el servidor
  const _cuartoId = State.form.cuarto;
  const _bloque = State.form.bloque;
  const aplicarPrePopulate = (detalle) => {
    if (!detalle) return;
    // Si el usuario cambió de cuarto/hoyo mientras cargaba, no pisar los inputs
    if (State.form.cuarto !== _cuartoId || State.form.bloque !== _bloque) return;
    container.querySelectorAll("input").forEach(inp => {
      const jugador = inp.dataset.jugador;
      const h = parseInt(inp.dataset.hoyo);
      const jugData = detalle[jugador];
      if (jugData && jugData.golpes && jugData.golpes[h - 1] != null) {
        inp.closest(".hoyo-input-wrap")?.classList.add("already-loaded");
        // Pre-poblar state Y el input visible para que collectScores() lea el valor correcto
        if (!State.form.scores[jugador]) State.form.scores[jugador] = {};
        if (!State.form.scores[jugador][h]) {
          const val = jugData.golpes[h - 1];
          State.form.scores[jugador][h] = val;
          inp.value = val; // mostrar en el campo para que el usuario lo vea y collectScores lo lea
        }
      }
    });
  };
  // 1) Aplicar YA desde la caché local (aunque tenga hasta 30s) → feedback inmediato
  if (Sheets._cache && Sheets._cache.cuartosDetalle) {
    aplicarPrePopulate(Sheets._cache.cuartosDetalle[_cuartoId]);
  }
  // 2) Refrescar del servidor y re-aplicar por si hay datos más nuevos
  (async () => {
    try {
      const data = await Sheets.getAll();
      aplicarPrePopulate(data.cuartosDetalle && data.cuartosDetalle[_cuartoId]);
    } catch(e) { /* silent */ }
  })();
}

async function markBloqueButtons(cuartoId) {
  try {
    const data = await Sheets.getAll();
    const detalle = data.cuartosDetalle && data.cuartosDetalle[cuartoId];
    if (!detalle) return;
    const holesWithData = new Set();
    Object.values(detalle).forEach(jug => {
      (jug.golpes || []).forEach((g, i) => { if (g != null) holesWithData.add(i + 1); });
    });
    const salida = (data.salidas && data.salidas[cuartoId]) || 1;
    document.querySelectorAll("#bloque-btns .option-btn").forEach(btn => {
      const parts = (btn.dataset.bloque || "").split("-").map(Number);
      if (parts.length < 2) return;
      const [ini, fin] = parts;
      let hasData = false;
      for (let h = ini; h <= fin; h++) { if (holesWithData.has(h)) { hasData = true; break; } }
      btn.classList.toggle("has-data", hasData);
      // Marcar el hoyo de SALIDA del cuarto (anillo cobre + etiqueta)
      const esSalida = ini === salida;
      btn.style.boxShadow = esSalida ? "inset 0 0 0 2px #b87333" : "";
      const tagPrevio = btn.querySelector(".salida-tag");
      if (esSalida && !tagPrevio) {
        btn.style.position = "relative";
        const tag = document.createElement("span");
        tag.className = "salida-tag";
        tag.textContent = "★";
        tag.style.cssText = "position:absolute;top:1px;right:3px;font-size:9px;color:#b87333;line-height:1;pointer-events:none";
        btn.appendChild(tag);
      } else if (!esSalida && tagPrevio) {
        tagPrevio.remove();
      }
    });
  } catch(e) { /* silent */ }
}

function collectScores() {
  const inputs = document.querySelectorAll("#inputs-golpes input");
  inputs.forEach(inp => {
    const jugador = inp.dataset.jugador;
    const hoyo = parseInt(inp.dataset.hoyo);
    const val = parseInt(inp.value);
    if (!State.form.scores[jugador]) State.form.scores[jugador] = {};
    if (!isNaN(val)) State.form.scores[jugador][hoyo] = val;
  });
}

function buildConfirmPreview() {
  collectScores();
  const cuartoConfig = CONFIG.CUARTOS.find(c => c.id === State.form.cuarto);
  if (!cuartoConfig) return;

  const [ini, fin] = State.form.bloque.split("-").map(Number);

  let html = `
    <div class="confirm-row">
      <span class="confirm-label">Cuarto</span>
      <span class="confirm-value">${cuartoConfig.nombre}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">Hoyos</span>
      <span class="confirm-value">${ini} – ${fin}</span>
    </div>`;

  // Comparar contra lo ya cargado en el servidor para avisar si se pisa un score distinto
  const detalleSrv = (Sheets._cache && Sheets._cache.cuartosDetalle && Sheets._cache.cuartosDetalle[State.form.cuarto]) || {};
  let hayPisadas = false;

  cuartoConfig.jugadores.forEach(jugador => {
    const golpes = State.form.scores[jugador] || {};
    const srv = detalleSrv[jugador] && detalleSrv[jugador].golpes;
    const vals = Array.from({length: fin - ini + 1}, (_, i) => {
      const h = ini + i;
      const nuevo = golpes[h];
      if (!nuevo) return "–";
      const previo = srv ? srv[h - 1] : null;
      if (previo != null && Number(previo) !== Number(nuevo)) {
        hayPisadas = true;
        return `<span style="color:#e5484d;font-weight:700">${previo}→${nuevo}</span>`;
      }
      return String(nuevo);
    }).join(" · ");
    html += `
      <div class="confirm-row">
        <span class="confirm-label">${jugador}</span>
        <span class="confirm-value" style="font-family:'DM Mono',monospace">${vals}</span>
      </div>`;
  });

  if (hayPisadas) {
    html += `
      <div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:rgba(229,72,77,.12);color:#e5484d;font-size:13px;line-height:1.45">
        ⚠️ Estás cambiando scores que ya estaban cargados (marcados en rojo). Revisá antes de enviar.
      </div>`;
  }

  document.getElementById("confirm-preview").innerHTML = html;
}

async function enviarScores() {
  const btn = document.getElementById("btn-enviar");
  btn.disabled = true;
  btn.textContent = "Enviando…";

  try {
    collectScores();
    const [ini, fin] = State.form.bloque.split("-").map(Number);

    // Formatear scores: { jugador: [g1, g2, g3] }
    const cuartoConfig = CONFIG.CUARTOS.find(c => c.id === State.form.cuarto);
    const scoresFormateados = {};
    cuartoConfig.jugadores.forEach(jugador => {
      const golpes = State.form.scores[jugador] || {};
      scoresFormateados[jugador] = Array.from({length: fin - ini + 1}, (_, i) => golpes[ini + i] || 0);
    });

    await Sheets.guardarScores({
      cuartoId: State.form.cuarto,
      bloqueInicio: ini,
      bloqueFin: fin,
      scores: scoresFormateados,
    });

    // Mostrar éxito
    document.getElementById("score-form").querySelectorAll(".form-step").forEach(s => s.classList.remove("active"));
    document.getElementById("form-success").classList.remove("hidden");

    // Re-habilitar el botón para el próximo envío (si no, queda "Enviando…" para siempre)
    btn.disabled = false;
    btn.textContent = "Enviar ✓";

    // Refrescar datos en background (cache ya invalidado → trae datos frescos)
    loadAndRender();

  } catch(err) {
    btn.disabled = false;
    btn.textContent = "Enviar ✓";
    alert("Error al enviar: " + err.message + "\n\nVerificá tu conexión e intentá de nuevo.");
  }
}

function resetForm() {
  State.form = { cuarto: null, bloque: null, scores: {} };
  document.getElementById("form-success").classList.add("hidden");
  // Asegurar que el botón Enviar quede usable
  const btnEnviar = document.getElementById("btn-enviar");
  btnEnviar.disabled = false;
  btnEnviar.textContent = "Enviar ✓";
  document.querySelectorAll(".option-btn").forEach(b => b.classList.remove("selected"));
  document.getElementById("inputs-golpes").innerHTML = "";
  const btnCont = document.querySelector(".btn-continue-step3");
  if (btnCont) btnCont.remove();
  goToStep(1);
}

// ── Skeletons / Error ────────────────────────────────────────
function renderSkeletons() {
  ["tabla-individual","tabla-parejas","tabla-cuartos"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = Array(5).fill('<div class="skeleton"></div>').join("");
  });
}

function renderError() {
  const el = document.getElementById("tabla-individual");
  if (el) el.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">📡</div>
      <p>No se pudo conectar con el Sheet.<br>Verificá tu conexión o revisá la URL en config.js</p>
    </div>`;
}

// ── RENDER: TARJETAS ─────────────────────────────────────────
function buildTarjetasBtns() {
  const grid = document.getElementById("tarjetas-selector");
  if (!grid) return;
  grid.innerHTML = CONFIG.CUARTOS.map(c => `
    <button class="cuarto-btn" data-cuarto="${c.id}">
      <div class="cuarto-btn-title">${c.nombre}</div>
      <div class="cuarto-btn-names">${c.jugadores.join("<br>")}</div>
      <div class="cuarto-btn-score" id="tarjeta-mini-score-${c.id}">–</div>
    </button>
  `).join("");
  grid.querySelectorAll(".cuarto-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      grid.querySelectorAll(".cuarto-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      mostrarTarjetaCuarto(btn.dataset.cuarto);
    });
  });
}

function renderTarjetas(data) {
  const grid = document.getElementById("tarjetas-selector");
  if (!grid || !data.cuartosDetalle) return;
  CONFIG.CUARTOS.forEach(c => {
    const scoreEl = document.getElementById(`tarjeta-mini-score-${c.id}`);
    if (!scoreEl) return;
    const rankItem = (data.cuartosRank || []).find(r =>
      c.jugadores.some(j => r.nombres && r.nombres.includes(j))
    );
    if (rankItem) {
      scoreEl.textContent = Sheets.formatScore(rankItem.score);
      scoreEl.className = `cuarto-btn-score ${Sheets.scoreClass(rankItem.score)}`;
    }
  });
}

async function mostrarTarjetaCuarto(cuartoId) {
  const detailEl = document.getElementById("tarjeta-detail");
  if (!detailEl) return;
  detailEl.classList.remove("hidden");
  const cuartoConfig = CONFIG.CUARTOS.find(c => c.id === cuartoId);
  if (!cuartoConfig) return;
  try {
    const data = await Sheets.getAll();
    const detalle = data.cuartosDetalle && data.cuartosDetalle[cuartoId];
    if (!detalle) {
      detailEl.innerHTML = "<p style=\"color:var(--text-muted)\">Sin datos para este cuarto</p>";
      return;
    }
    const evo = data.evolucionCuartos && data.evolucionCuartos[cuartoId];
    // Mismo min que usa el match, así los puntitos del 85% coinciden con los puntos.
    const mcx = calcularMatch(data, cuartoId);
    detailEl.innerHTML = `<h3>${cuartoConfig.nombre}</h3>` + buildScorecardHTML(cuartoConfig, detalle, evo, mcx ? mcx.min : undefined);
  } catch(e) {
    detailEl.innerHTML = "<p style=\"color:var(--red-over)\">Error al cargar.</p>";
  }
}

// ── MATCH: CÁLCULO EN EL FRONT ───────────────────────────────
// Sistema de puntos POR HOYO (reemplaza a la fila 90 del Sheet):
//   · 2 puntos para la pareja con la MEJOR bola neta del hoyo
//   · 1 punto  para la pareja con la MEJOR "peor bola" neta del hoyo
//   · empate en cualquiera de las dos → esos puntos NO se otorgan a nadie
// El neto usa el HDC 85% AJUSTADO (ver minHdc85 / computeReparto).
// Se recorre en ORDEN DE JUEGO: un cuarto que sale del 10 empieza por el 10.
function calcularMatch(data, cuartoId) {
  const det = (data && data.cuartosDetalle && data.cuartosDetalle[cuartoId]) || null;
  const m   = (data && data.matchsData    && data.matchsData[cuartoId])    || null;
  if (!det) return null;

  const split = t => String(t).trim().split(/\s+/).filter(n => det[n]);
  let A = (m && m.a) ? split(m.a) : [];
  let B = (m && m.b) ? split(m.b) : [];

  // Las parejas del sheet (A89/B89) recién se llenan cuando arranca la vuelta.
  // Antes de eso vienen null y el match no se podía mostrar. Las derivamos del
  // ORDEN del roster —los dos primeros contra los dos últimos, misma regla que el
  // sorteo (filas 45-48)— así el match se ve con los HDC ya ajustados a cero
  // aunque no haya un solo golpe cargado. Cuando el sheet cargue las parejas
  // reales, esas mandan (no se deriva).
  let derivado = false;
  if (!A.length || !B.length) {
    const roster = Object.keys(det).filter(n => n !== "VACIO");
    if (roster.length < 2) return null;
    const mitad = Math.ceil(roster.length / 2);
    A = roster.slice(0, mitad);
    B = roster.slice(mitad);
    derivado = true;
  }
  if (!A.length || !B.length) return null;

  // El mínimo se toma sobre los 4 que EFECTIVAMENTE juegan el match (A ∪ B),
  // no sobre todo lo que haya en la pestaña. Como los cuartos se rearman cada
  // semana, si quedó un nombre viejo colgado en el detalle no arrastra el mínimo.
  const enMatch = {};
  A.concat(B).forEach(n => { enMatch[n] = det[n]; });
  const mn = minHdc85(enMatch);
  const st = {};
  A.concat(B).forEach(n => {
    const h = det[n].hdc85 != null ? det[n].hdc85 : null;
    st[n] = repartirGolpes(h == null ? 0 : Math.max(0, h - mn));
  });
  const neto = {};
  A.concat(B).forEach(n => {
    const g = det[n].golpes || [];
    neto[n] = g.map((v, h) => v == null ? null : v - st[n][h]);
  });

  const salida = (data.salidas && data.salidas[cuartoId]) || 1;
  let pa = 0, pb = 0;
  const hoyos = [];
  for (let i = 0; i < 18; i++) {
    const h = (salida - 1 + i) % 18;                 // hoyo REAL (0-based)
    const va = A.map(n => neto[n][h]);
    const vb = B.map(n => neto[n][h]);
    if (va.some(v => v == null) || vb.some(v => v == null)) {
      hoyos.push({ hoyo: h + 1, jugado: false, ga: 0, gb: 0, pa, pb });
      continue;
    }
    const mejorA = Math.min.apply(null, va), mejorB = Math.min.apply(null, vb);
    const peorA  = Math.max.apply(null, va), peorB  = Math.max.apply(null, vb);
    let ga = 0, gb = 0;
    if (mejorA < mejorB) ga += 2; else if (mejorB < mejorA) gb += 2;
    if (peorA  < peorB)  ga += 1; else if (peorB  < peorA)  gb += 1;
    pa += ga; pb += gb;
    hoyos.push({ hoyo: h + 1, jugado: true, ga, gb, pa, pb });
  }
  // Recortar los hoyos no jugados del final (los del medio se dejan como "–")
  while (hoyos.length && !hoyos[hoyos.length - 1].jugado) hoyos.pop();

  const ajustados = {};
  A.concat(B).forEach(n => {
    ajustados[n] = det[n].hdc85 != null ? Math.max(0, det[n].hdc85 - mn) : null;
  });

  // Chequeo de consistencia: los nombres de A89/B89 tienen que cubrir EXACTO el
  // roster de la pestaña (filas 45-48). Si alguien rearma el cuarto y se olvida de
  // actualizar las parejas, el match se calcularía sobre gente equivocada en
  // silencio. Preferimos gritarlo en pantalla.
  const roster = Object.keys(det).filter(n => n !== "VACIO");
  const enM = A.concat(B);
  const faltan = roster.filter(n => enM.indexOf(n) === -1);
  const sinHdc = enM.filter(n => det[n].hdc85 == null);
  let aviso = null;
  // Si derivamos las parejas del roster, A∪B cubre exacto y no hay falso "faltan".
  if (!derivado && faltan.length) aviso = `En la pestaña juegan ${roster.length} (${roster.join(", ")}) pero el match solo nombra a ${enM.length}. Falta(n): ${faltan.join(", ")}. Revisá A89/B89.`;
  else if (sinHdc.length) aviso = `Sin HDC 85% en la planilla: ${sinHdc.join(", ")}. El ajuste se calcula sin ellos.`;

  return { A, B, hoyos, ptsA: pa, ptsB: pb, dif: pa - pb, min: mn, ajustados, aviso, derivado };
}

// ── RENDER: MATCHS ───────────────────────────────────────────
function renderMatchs(data) {
  const el = document.getElementById("matchs-list");
  if (!el) return;
  const cd = data.cuartosDetalle || {};
  // Se muestra un match por cada cuarto que tenga jugadores en la planilla, aunque
  // no haya scores ni parejas cargadas todavía (calcularMatch deriva las parejas).
  const hayAlguno = CONFIG.CUARTOS.some(c =>
    cd[c.id] && Object.keys(cd[c.id]).filter(n => n !== "VACIO").length);
  if (!hayAlguno) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚔️</div><p>Los datos de match aparecen acá durante el torneo</p></div>`;
    return;
  }
  el.innerHTML = CONFIG.CUARTOS.map(c => {
    const det = cd[c.id];
    const roster = det ? Object.keys(det).filter(n => n !== "VACIO") : [];
    if (!roster.length) return "";   // cuarto vacío → no se muestra

    const mc = calcularMatch(data, c.id);
    if (!mc) return "";

    const jugados = mc.hoyos.filter(h => h.jugado).length;
    const decidido = jugados > 0 && mc.dif !== 0;
    const ganaA = mc.dif > 0;
    const lider = ganaA ? mc.A.join(" ") : mc.B.join(" ");

    const standingText = jugados === 0
      ? `<span style="color:var(--text-muted)">SIN JUGAR</span>`
      : decidido
        ? `${lider} <span class="mh-lead">+${Math.abs(mc.dif)}</span>`
        : `<span style="color:var(--text-muted)">EMPATADOS</span>`;
    const standingCls = !decidido ? "mh-standing-even" : (ganaA ? "mh-standing-a" : "mh-standing-b");

    // Cada jugador con SU hándicap de match (85% ya ajustado, el mejor del cuarto
    // en 0). Va pegado al nombre para que se pueda auditar de dónde sale el neto.
    const jug = n => `<span class="mj-chip">${n}<span class="mj-g">${mc.ajustados[n] != null ? mc.ajustados[n] : "–"}</span></span>`;
    const lado = (arr, der) => `<div class="match-side${der ? " match-side-r" : ""}">
            <div class="match-side-players">${arr.map(jug).join("")}</div>
          </div>`;

    let tabla = "";
    if (mc.hoyos.length) {
      const cell = (v, cls) => `<div class="mh-cell ${cls || ""}">${v}</div>`;
      const fHoyo = mc.hoyos.map(h => cell(h.hoyo, "mh-hdr")).join("");
      const fA = mc.hoyos.map(h => cell(h.jugado ? h.ga : "–", h.jugado && h.ga > h.gb ? "mh-a" : "mh-even")).join("");
      const fB = mc.hoyos.map(h => cell(h.jugado ? h.gb : "–", h.jugado && h.gb > h.ga ? "mh-b" : "mh-even")).join("");
      const fD = mc.hoyos.map(h => {
        const d = h.pa - h.pb;
        return cell(d === 0 ? "AS" : (d > 0 ? "+" : "−") + Math.abs(d), d > 0 ? "mh-a" : d < 0 ? "mh-b" : "mh-even");
      }).join("");
      tabla = `
        <div class="match-evo-wrap">
          <div class="match-grid">
            <div class="match-grid-lbls">
              <div class="mh-lbl">HOYO</div>
              <div class="mh-lbl mh-lbl-a">${mc.A.join("/")}</div>
              <div class="mh-lbl mh-lbl-b">${mc.B.join("/")}</div>
              <div class="mh-lbl">DIF</div>
            </div>
            <div class="match-grid-rows">
              <div class="match-evo-t">${fHoyo}</div>
              <div class="match-evo-t">${fA}</div>
              <div class="match-evo-t">${fB}</div>
              <div class="match-evo-t">${fD}</div>
            </div>
          </div>
        </div>`;
    }

    return `
      <div class="match-card">
        <div class="match-card-hdr">
          <span class="match-cuarto-lbl">${c.nombre}</span>
          <span class="match-hdc-note">HDC 85% ajustado · el mejor a 0${mc.derivado ? " · parejas por orden de salida" : ""}</span>
        </div>
        <div class="match-teams">
          <div class="match-col${decidido ? (ganaA ? ' match-team--win' : ' match-team--loss') : ''}">
            ${lado(mc.A, false)}
            <div class="match-pts">${mc.ptsA}<span class="match-pts-lbl">pts</span></div>
          </div>
          <span class="match-vs">vs</span>
          <div class="match-col match-col-r${decidido ? (ganaA ? ' match-team--loss' : ' match-team--win') : ''}">
            ${lado(mc.B, true)}
            <div class="match-pts">${mc.ptsB}<span class="match-pts-lbl">pts</span></div>
          </div>
        </div>
        <div class="match-standing ${standingCls}">${standingText}</div>
        ${mc.aviso ? `<div class="match-aviso">⚠ ${mc.aviso}</div>` : ""}
        ${tabla}
      </div>`;
  }).filter(Boolean).join("");
}
