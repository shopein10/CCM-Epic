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

    // Actualizar nombres reales de jugadores desde el sheet
    if (data.cuartosDetalle) {
      let needsRebuild = false;
      CONFIG.CUARTOS.forEach(c => {
        const detalle = data.cuartosDetalle[c.id];
        if (detalle) {
          const realNames = Object.keys(detalle).filter(n => n);
          if (realNames.length > 0 && realNames[0] !== c.jugadores[0]) {
            c.jugadores = realNames;
            needsRebuild = true;
          }
        }
      });
      if (needsRebuild) {
        buildCuartoBtns();
        buildFormCuartos();
      }
    }

    renderLeaderboard(data);
    renderCuartos(data);
    renderHistorial(data);
    renderMatchs(data);
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
  const badge = document.getElementById("live-badge");
  const hayScores = data.leaderboard && data.leaderboard.some(r => r.hoyo && r.hoyo !== '');
  badge.classList.toggle("hidden", !hayScores);
}

// ── RENDER: LEADERBOARD ──────────────────────────────────────
function renderLeaderboard(data) {
  renderIndividual(data.leaderboard || []);
  renderParejas(data.parejas || []);
  renderCuartosRank(data.cuartosRank || []);
}

function renderIndividual(rows) {
  // Podio top 3
  const podioEl = document.getElementById("podio");
  const top3 = rows.slice(0, 3);
  // Reordenar: 2do - 1ro - 3ro (para el podio visual)
  const ordenPodio = [top3[1], top3[0], top3[2]].filter(Boolean);
  podioEl.innerHTML = ordenPodio.map(r => {
    const scoreClass = Sheets.scoreClass(r.score);
    return `
      <div class="podio-item podio-rank-${r.pos}">
        <div class="podio-pos podio-pos-${r.pos}">${r.pos}</div>
        <div class="podio-avatar">${Sheets.initials(r.nombre)}</div>
        <div class="podio-name">${r.nombre}</div>
        ${r.hdc != null && r.hdc !== 0 ? `<div class="podio-hdc">HDC ${r.hdc}</div>` : ''}
        <div class="podio-score ${scoreClass}">${Sheets.formatScore(r.score)}</div>
      </div>`;
  }).join("");

  // Tabla resto
  const tablaEl = document.getElementById("tabla-individual");
  const resto = rows.slice(3);
  if (!resto.length) { tablaEl.innerHTML = ""; return; }
  tablaEl.innerHTML = resto.map(r => {
    const sc = Sheets.scoreClass(r.score);
    return `
      <div class="score-row">
        <span class="row-pos">${r.pos}</span>
        <span class="row-name">${r.nombre}${r.hdc != null && r.hdc !== 0 ? `<span class="row-hdc"> HDC ${r.hdc}</span>` : ''}</span>
        <span class="row-hoyo">${r.hoyo || ""}</span>
        <span class="row-score ${sc}">${Sheets.formatScore(r.score)}</span>
      </div>`;
  }).join("");
}

function renderParejas(rows) {
  const el = document.getElementById("tabla-parejas");
  if (!rows.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">\u{1F91D}</div><p>Los scores de parejas aparecen acá durante el torneo</p></div>`;
    return;
  }
  el.innerHTML = rows.map((r, i) => {
    const sc = Sheets.scoreClass(r.score);
    const isTop = i < 3;
    return `
      <div class="score-row ${isTop ? "top-3" : ""}">
        <span class="row-pos">${r.pos}</span>
        <span class="row-name">${r.nombres}</span>
        <span class="row-score ${sc}">${Sheets.formatScore(r.score)}</span>
      </div>`;
  }).join("");
}

function renderCuartosRank(rows) {
  const el = document.getElementById("tabla-cuartos");
  if (!rows.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">\u{1F465}</div><p>El ranking de cuartos aparece acá durante el torneo</p></div>`;
    return;
  }
  el.innerHTML = rows.map((r, i) => {
    const sc = Sheets.scoreClass(r.score);
    const isTop = i < 3;
    return `
      <div class="score-row ${isTop ? "top-3" : ""}">
        <span class="row-pos">${r.pos}</span>
        <span class="row-name" style="font-size:12px">${r.nombres}</span>
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
  // Actualizar mini-scores en las tarjetas
  CONFIG.CUARTOS.forEach(c => {
    const el = document.getElementById(`mini-score-${c.id}`);
    if (!el) return;
    const detalle = data.cuartosDetalle[c.id];
    if (!detalle) return;
    // Intentar obtener score vs par del cuarto desde cuartosRank
    const jugadoresReales = Object.keys(detalle);
    const rankItem = (data.cuartosRank || []).find(r =>
      jugadoresReales.some(j => r.nombres && r.nombres.includes(j))
    );
    if (rankItem && rankItem.score !== null) {
      el.textContent = Sheets.formatScore(rankItem.score);
      el.className = `cuarto-btn-score ${Sheets.scoreClass(rankItem.score)}`;
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

    const pars = CONFIG.PAR_HOYOS;
    const parOut = pars.slice(0, 9).reduce((a, b) => a + b, 0);
    const parIn  = pars.slice(9, 18).reduce((a, b) => a + b, 0);

    // Header: H1..H9 | OUT | H10..H18 | IN | Gross | Neto
    const hoyosHeader = [
      ...Array.from({length: 9}, (_, i) => `<th>${i + 1}</th>`),
      `<th class="td-subtotal">OUT</th>`,
      ...Array.from({length: 9}, (_, i) => `<th>${i + 10}</th>`),
      `<th class="td-subtotal">IN</th>`,
      `<th class="td-subtotal">Gross</th>`,
      `<th class="td-subtotal">Neto</th>`,
    ].join("");

    // Par row
    const parRow = [
      ...pars.slice(0, 9).map(p => `<th style="color:var(--text-dim)">${p}</th>`),
      `<th class="td-subtotal" style="color:var(--text-dim)">${parOut}</th>`,
      ...pars.slice(9, 18).map(p => `<th style="color:var(--text-dim)">${p}</th>`),
      `<th class="td-subtotal" style="color:var(--text-dim)">${parIn}</th>`,
      `<th class="td-subtotal" style="color:var(--text-dim)">${CONFIG.PAR_TOTAL}</th>`,
      `<th class="td-subtotal" style="color:var(--text-dim)">E</th>`,
    ].join("");

    // Usar nombres reales del detalle (no los del config que pueden diferir)
    const jugadores = Object.keys(detalle);

    const filas = jugadores.map(jugador => {
      const info = detalle[jugador];
      if (!info) return "";
      const golpes = info.golpes || [];

      // Hoyos 1-9
      const celdas1 = golpes.slice(0, 9).map((g, i) => {
        if (!g) return `<td class="cell-par">–</td>`;
        const cls = Sheets.cellClass(g, pars[i]);
        return `<td class="${cls}">${g}</td>`;
      }).join("");

      // OUT subtotal (solo hoyos jugados)
      const played1 = golpes.slice(0, 9).filter(g => g);
      const outVal  = played1.length > 0 ? played1.reduce((a, b) => a + b, 0) : null;
      const outTd   = `<td class="td-subtotal">${outVal !== null ? outVal : "–"}</td>`;

      // Hoyos 10-18
      const celdas2 = golpes.slice(9, 18).map((g, i) => {
        if (!g) return `<td class="cell-par">–</td>`;
        const cls = Sheets.cellClass(g, pars[i + 9]);
        return `<td class="${cls}">${g}</td>`;
      }).join("");

      // IN subtotal
      const played2 = golpes.slice(9, 18).filter(g => g);
      const inVal   = played2.length > 0 ? played2.reduce((a, b) => a + b, 0) : null;
      const inTd    = `<td class="td-subtotal">${inVal !== null ? inVal : "–"}</td>`;

      // Gross total
      const grossVal = (outVal !== null || inVal !== null)
        ? (outVal || 0) + (inVal || 0) : null;
      const grossTd  = `<td class="td-subtotal">${grossVal !== null ? grossVal : "–"}</td>`;

      // Neto (score vs par ya calculado por Apps Script)
      const netoStr   = info.neto !== null && info.neto !== undefined ? Sheets.formatScore(info.neto) : "–";
      const netoClass = Sheets.scoreClass(info.neto);

      return `
        <tr>
          <td class="td-name">${jugador}${info.hdc ? ` <span style="color:var(--text-dim);font-size:10px">(${info.hdc})</span>` : ''}</td>
          ${celdas1}${outTd}
          ${celdas2}${inTd}
          ${grossTd}
          <td class="td-subtotal ${netoClass}">${netoStr}</td>
        </tr>`;
    }).join("");

    detailEl.innerHTML = `
      <h3>${cuartoConfig.nombre}</h3>
      <table class="scorecard-table">
        <thead>
          <tr>
            <th>Jugador</th>
            ${hoyosHeader}
          </tr>
          <tr>
            <th style="text-align:left;color:var(--copper)">Par</th>
            ${parRow}
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>`;
  } catch(e) {
    detailEl.innerHTML = `<p style="color:var(--red-over)">Error al cargar. Intentá de nuevo.</p>`;
  }
}

// ── RENDER: HISTORIAL ────────────────────────────────────────
function renderHistorial(data) {
  const el = document.getElementById("historial-list");
  const historial = data.historial || [];

  if (!historial.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">\u{1F4C5}</div>
        <p>El historial de torneos aparecerá acá.<br>Agregá una pestaña "Historial" al Sheet con las columnas:<br>Fecha / Ganador / Score / Jugadores / Polla / Notas</p>
      </div>`;
    return;
  }

  el.innerHTML = historial.map(t => `
    <div class="historial-card">
      <div class="historial-fecha">${formatFecha(t.fecha)}</div>
      <div class="historial-ganador">\u{1F947} ${t.ganador}</div>
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
  // Paso 1: event delegation para sobrevivir rebuilds de buildFormCuartos()
  document.getElementById("cuarto-btns").addEventListener("click", e => {
    const btn = e.target.closest(".option-btn");
    if (!btn) return;
    document.querySelectorAll("#cuarto-btns .option-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    State.form.cuarto = btn.dataset.cuarto;
    goToStep(2);
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

  // Boton continuar al paso 4
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

    // Mostrar exito
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
  // Restaurar boton enviar para que funcione en la proxima carga
  const btnEnviar = document.getElementById("btn-enviar");
  if (btnEnviar) {
    btnEnviar.disabled = false;
    btnEnviar.textContent = "Enviar ✓</ton>";
  }
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
      <div class="empty-icon">\u{1F4E1}</div>
      <p>No se pudo conectar con el Sheet.<br>Verificá tu conexión o revisá la URL en config.js</p>
    </div>`;
}

// ── RENDER: MATCHS ───────────────────────────────────────────
function renderMatchs(data) {
  const el = document.getElementById("matchs-list");
  if (!el) return;
  const matchsData = data.matchsData || {};

  if (!Object.keys(matchsData).length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚔️</div><p>Los matchs aparecen acá durante el torneo</p></div>`;
    return;
  }

  el.innerHTML = CONFIG.CUARTOS.map(cuarto => {
    const d = matchsData[cuarto.id];
    if (!d) return '';
    const valA = (d.a !== null && d.a !== undefined && d.a !== '') ? String(d.a) : null;
    const valB = (d.b !== null && d.b !== undefined && d.b !== '') ? String(d.b) : null;
    if (!valA && !valB) {
      return `<div class="match-card"><div class="match-cuarto-label">Match ${cuarto.nombre}</div><div class="match-result match-pending">No iniciado</div></div>`;
    }
    return `<div class="match-card"><div class="match-cuarto-label">Match ${cuarto.nombre}</div><div class="match-result">${valA || '—'}<span class="match-sep"> · </span>${valB || '—'}</div></div>`;
  }).join("");
}
