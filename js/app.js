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
async function loadAndRender(showSkeleton = false) {
  if (showSkeleton) renderSkeletons();
  try {
    const data = await Sheets.getAll();
    renderLeaderboard(data);
    renderCuartos(data);
    renderMatchs(data);
    renderTarjetas(data);
    renderHistorial(data);
    updateLiveBadge(data);
    updateLastUpdate();
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

// ── Refresh ──────────────────────────────────────────────────
function setupRefresh() {
  document.getElementById("btn-refresh").addEventListener("click", async () => {
    const btn = document.getElementById("btn-refresh");
    btn.style.transform = "rotate(360deg)";
    btn.style.transition = "transform .5s";
    setTimeout(() => { btn.style.transform = ""; btn.style.transition = ""; }, 500);
    await loadAndRender(false);
  });
}

function updateLastUpdate() {
  const el = document.getElementById("last-update");
  const now = new Date();
  el.textContent = `${now.getHours()}:${String(now.getMinutes()).padStart(2,"0")}`;
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
  const posCounts = {};
  rows.forEach(r => { posCounts[r.pos] = (posCounts[r.pos] || 0) + 1; });
  tablaEl.innerHTML = rows.map((r, i) => {
    const sc = Sheets.scoreClass(r.score);
    const posStr = posCounts[r.pos] > 1 ? "T" + r.pos : String(r.pos);
    return `
      <div class="score-row ${i < 3 ? "top-3" : ""}">
        <span class="row-pos">${posStr}</span>
        <span class="row-name">${r.nombre}</span>
        <span class="row-hoyo">${r.hoyo || ""}</span>
        <span class="row-score ${sc}">${Sheets.formatScore(r.score)}</span>
      </div>`;
  }).join("");
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
    if (!det) return;
    const names = Object.keys(det).filter(n => n !== "VACIO");
    if (!names.length) return;
    c.jugadores = names;
    const el1 = document.querySelector(`#cuartos-selector [data-cuarto="${c.id}"] .cuarto-btn-names`);
    if (el1) el1.innerHTML = names.join("<br>");
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
    const holesPlayed = Object.values(detalle).map(j => j.golpes ? j.golpes.filter(g => g != null).length : 0);
    const maxHole = holesPlayed.length ? Math.max(...holesPlayed) : 0;
    const hoyoStr = rankItem?.hoyo ? rankItem.hoyo.replace("Hoyo","H") : (maxHole > 0 ? `H${maxHole}` : null);
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
    detailEl.innerHTML = `<h3>${cuartoConfig.nombre}</h3>` + buildScorecardHTML(cuartoConfig, detalle);
  } catch(e) {
    detailEl.innerHTML = `<p style="color:var(--red-over)">Error al cargar. Intentá de nuevo.</p>`;
  }
}

// ── SCORECARD HELPER ─────────────────────────────────────────
function buildScorecardHTML(cuartoConfig, detalle) {
  const pars   = CONFIG.PAR_HOYOS;
  const parOut = pars.slice(0, 9).reduce((a, b) => a + b, 0);
  const parIn  = pars.slice(9).reduce((a, b) => a + b, 0);

  const filas = cuartoConfig.jugadores.map(jugador => {
    const info = detalle[jugador];
    if (!info) return "";
    const g = info.golpes;

    const cel = (v, i) => v == null
      ? `<td class="cell-par">–</td>`
      : `<td class="${Sheets.cellClass(v, pars[i])}"><span class="sc-badge">${v}</span></td>`;

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
  const p9   = pars.slice(0,9).map(p => `<th style="color:var(--text-dim)">${p}</th>`).join("");
  const p9b  = pars.slice(9).map(p  => `<th style="color:var(--text-dim)">${p}</th>`).join("");

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
          <th style="color:var(--text-dim);font-weight:600">${parOut}</th>
          ${p9b}
          <th style="color:var(--text-dim);font-weight:600">${parIn}</th>
          <th style="color:var(--text-dim);font-weight:700">${CONFIG.PAR_TOTAL}</th>
          <th></th>
          <th style="color:var(--text-dim)">${CONFIG.PAR_TOTAL}</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`;
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
      buildInputsGolpes();
      goToStep(3);
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
          <label>H${h} <span style="color:var(--text-dim)">(P${par})</span></label>
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
        else buildConfirmPreview() && goToStep(4);
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
  (async () => {
    try {
      const data = await Sheets.getAll();
      const detalle = data.cuartosDetalle && data.cuartosDetalle[_cuartoId];
      if (!detalle) return;
      container.querySelectorAll("input").forEach(inp => {
        const jugador = inp.dataset.jugador;
        const h = parseInt(inp.dataset.hoyo);
        const jugData = detalle[jugador];
        if (jugData && jugData.golpes && jugData.golpes[h - 1] != null) {
          inp.closest(".hoyo-input-wrap")?.classList.add("already-loaded");
          // Pre-poblar state para que al enviar no se mande 0
          if (!State.form.scores[jugador]) State.form.scores[jugador] = {};
          if (!State.form.scores[jugador][h]) {
            State.form.scores[jugador][h] = jugData.golpes[h - 1];
          }
        }
      });
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
    document.querySelectorAll("#bloque-btns .option-btn").forEach(btn => {
      const parts = (btn.dataset.bloque || "").split("-").map(Number);
      if (parts.length < 2) return;
      const [ini, fin] = parts;
      let hasData = false;
      for (let h = ini; h <= fin; h++) { if (holesWithData.has(h)) { hasData = true; break; } }
      btn.classList.toggle("has-data", hasData);
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

  cuartoConfig.jugadores.forEach(jugador => {
    const golpes = State.form.scores[jugador] || {};
    const vals = Array.from({length: fin - ini + 1}, (_, i) => golpes[ini + i] || "–").join(" · ");
    html += `
      <div class="confirm-row">
        <span class="confirm-label">${jugador}</span>
        <span class="confirm-value" style="font-family:'DM Mono',monospace">${vals}</span>
      </div>`;
  });

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

    // Refrescar datos en background
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
    detailEl.innerHTML = `<h3>${cuartoConfig.nombre}</h3>` + buildScorecardHTML(cuartoConfig, detalle);
  } catch(e) {
    detailEl.innerHTML = "<p style=\"color:var(--red-over)\">Error al cargar.</p>";
  }
}

// ── RENDER: MATCHS ───────────────────────────────────────────
function renderMatchs(data) {
  const el = document.getElementById("matchs-list");
  if (!el) return;
  const matchs = data.matchsData;
  if (!matchs || !Object.keys(matchs).length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚔️</div><p>Los datos de match aparecen acá durante el torneo</p></div>`;
    return;
  }
  el.innerHTML = CONFIG.CUARTOS.map(c => {
    const m = matchs[c.id];
    // Skip cuartos sin jugadores asignados
    if (!m || (!m.a && !m.b)) return "";
    const evo = m.evo || [];

    // evo[i] = diferencial ACUMULADO hasta el hoyo i+1
    // positivo = equipo A adelante, negativo = equipo B adelante
    let evoHtml = "";
    let finalLead = 0;

    if (evo.length) {
      let prev = 0;
      const cells = evo.map((e, i) => {
        const delta = e - prev;
        prev = e;
        const cls = delta > 0 ? "mh-a" : delta < 0 ? "mh-b" : "mh-even";
        return `<div class="mh-cell ${cls}" title="H${i+1}">${i+1}</div>`;
      }).join("");

      finalLead = evo[evo.length - 1];
      const upCount = Math.abs(finalLead);
      const standingText = finalLead > 0
        ? `${m.a || "A"} <span class="mh-lead">+${upCount}</span>`
        : finalLead < 0
          ? `${m.b || "B"} <span class="mh-lead">+${upCount}</span>`
          : `<span style="color:var(--text-muted)">ALL SQUARE</span>`;
      const standingCls = finalLead > 0 ? "mh-standing-a" : finalLead < 0 ? "mh-standing-b" : "mh-standing-even";
      evoHtml = `
        <div class="match-standing ${standingCls}">${standingText}</div>
        <div class="match-evo-wrap">
          <div class="match-evo-t">${cells}</div>
        </div>`;
    }

    const upCount = Math.abs(finalLead);
    const upBadge = upCount > 0 ? `<span class="match-up-badge">${upCount}UP</span>` : '';
    return `
      <div class="match-card">
        <div class="match-card-hdr">
          <span class="match-cuarto-lbl">${c.nombre}</span>
        </div>
        <div class="match-teams">
          <span class="match-team${finalLead > 0 ? ' match-team--win' : finalLead < 0 ? ' match-team--loss' : ''}">${m.a || "–"}${finalLead > 0 ? upBadge : ''}</span>
          <span class="match-vs">vs</span>
          <span class="match-team match-team-r${finalLead < 0 ? ' match-team--win' : finalLead > 0 ? ' match-team--loss' : ''}">${m.b || "–"}${finalLead < 0 ? upBadge : ''}</span>
        </div>
        ${evoHtml}
      </div>`;
  }).filter(Boolean).join("");
}
