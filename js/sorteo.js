// ============================================================
// CCM & Epic — SORTEO DE CUARTOS (módulo independiente)
// ============================================================
// NO modifica nada de app.js / sheets.js / config.js / desafios.js.
// Si este archivo no carga, la app del torneo funciona exactamente igual.
//
// Ojo con las clases: setupTabs() de app.js engancha TODOS los `.tab` del
// documento y apaga TODOS los `.tab-content`. Por eso acá todo es `.srt-`.
//
// Los sorteos se ACUMULAN por semana (lunes a domingo): 12 jugadores dan
// Cuartos 1-3, y una segunda tanda de 8 sigue en el Cuarto 4.
// ============================================================

(function () {
  "use strict";

  var SRT_CONFIG = {
    // Misma Web App que Desafíos (el sorteo vive en ese proyecto Apps Script)
    URL: "https://script.google.com/macros/s/AKfycbwgJPP6hGJoUtCqlvZ_hPChbAPZtT3BpizogQMT5tFXEFqWT0fLmEmAacZGGzZz3k0C/exec",
    TOKEN: "ccm-desafios-2026",
    REFRESH: 30,        // segundos, solo mientras la solapa está abierta
    TIMEOUT: 20000,
  };

  var LS_PRESENTES = "ccm-sorteo-presentes";

  var S = {
    padron: [],
    presentes: {},      // { nombre: true } — selección local, no compartida
    asignados: {},      // { nombre: "Cuarto3" } — ya sorteados esta semana
    cuartos: [],
    tandas: [],
    semana: null,
    libres: 8,
    puedeVolcar: false,
    data: null,
    timer: null,
    cargando: false,
    error: null,
    vista: null,        // "resultado" | "seleccion"
  };

  // ══════════════════════════════════════════════════════════
  // Utilidades
  // ══════════════════════════════════════════════════════════

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function conTimeout(ms) {
    return new Promise(function (_, rej) {
      setTimeout(function () { rej(new Error("tardó demasiado")); }, ms);
    });
  }

  function cargarPresentes() {
    try {
      var raw = localStorage.getItem(LS_PRESENTES);
      if (raw) S.presentes = JSON.parse(raw) || {};
    } catch (e) { S.presentes = {}; }
  }

  function guardarPresentes() {
    // Se persiste a propósito: el domingo suele jugar casi la misma gente que
    // el sábado, y volver a tildar 20 nombres en el teléfono es tedioso.
    try { localStorage.setItem(LS_PRESENTES, JSON.stringify(S.presentes)); } catch (e) {}
  }

  /** Tildados que todavía NO fueron sorteados esta semana. */
  function listaPresentes() {
    var out = [];
    for (var i = 0; i < S.padron.length; i++) {
      var n = S.padron[i];
      if (S.presentes[n] && !S.asignados[n]) out.push(n);
    }
    return out;
  }

  function cantCuartos() { return S.cuartos.length; }

  // ══════════════════════════════════════════════════════════
  // Backend
  // ══════════════════════════════════════════════════════════

  async function apiGet() {
    var res = await Promise.race([
      fetch(SRT_CONFIG.URL + "?action=sorteo", { method: "GET" }),
      conTimeout(SRT_CONFIG.TIMEOUT),
    ]);
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async function apiPost(payload) {
    payload.token = SRT_CONFIG.TOKEN;
    var res = await Promise.race([
      fetch(SRT_CONFIG.URL, {
        method: "POST",
        // text/plain evita el preflight CORS que Apps Script no responde
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      }),
      conTimeout(SRT_CONFIG.TIMEOUT),
    ]);
    return await res.json();
  }

  function aplicar(d) {
    S.data = d;
    S.padron = d.padron || [];
    S.cuartos = d.cuartos || [];
    S.tandas = d.tandas || [];
    S.asignados = d.asignados || {};
    S.semana = d.semana || null;
    S.libres = typeof d.libres === "number" ? d.libres : 8;
    S.puedeVolcar = !!d.puedeVolcar;

    // Un nombre que salió del padrón, o que ya quedó sorteado, no puede
    // seguir tildado: al sortear la próxima tanda lo rechazaría el backend.
    var vivos = {};
    for (var i = 0; i < S.padron.length; i++) {
      var n = S.padron[i];
      if (S.presentes[n] && !S.asignados[n]) vivos[n] = true;
    }
    S.presentes = vivos;
    guardarPresentes();

    if (!S.vista) S.vista = S.cuartos.length ? "resultado" : "seleccion";
  }

  async function cargar(mostrarSpinner) {
    if (S.cargando) return;
    S.cargando = true;
    if (mostrarSpinner) pintarCargando();
    try {
      aplicar(await apiGet());
      S.error = null;
    } catch (err) {
      S.error = String(err.message || err);
    } finally {
      S.cargando = false;
      pintar();
    }
  }

  function arrancarPolling() {
    pararPolling();
    S.timer = setInterval(function () { cargar(false); }, SRT_CONFIG.REFRESH * 1000);
  }

  function pararPolling() {
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
  }

  // ══════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════

  function root() { return $("sorteo-body"); }

  function pintarCargando() {
    var r = root();
    if (r) r.innerHTML = '<div class="srt-msg">Cargando…</div>';
  }

  function pintar() {
    var r = root();
    if (!r) return;

    if (S.error) {
      r.innerHTML =
        '<div class="srt-msg srt-error">No se pudo cargar el sorteo.<br>' +
        "<small>" + esc(S.error) + "</small></div>" +
        '<button class="srt-btn" id="srt-reintentar">Reintentar</button>';
      var b = $("srt-reintentar");
      if (b) b.addEventListener("click", function () { cargar(true); });
      return;
    }

    if (!S.data) { pintarCargando(); return; }

    r.innerHTML = S.vista === "seleccion" ? htmlSeleccion() : htmlResultado();
    enganches();
  }

  // ── Selección de presentes ────────────────────────────────

  function htmlSeleccion() {
    var n = listaPresentes().length;
    var resto = n % 4;
    var necesita = n / 4;
    var entra = necesita <= S.libres;
    var ok = n >= 4 && resto === 0 && entra;

    var h = '<div class="srt-head">' +
            '<span class="srt-count' + (ok ? " srt-ok" : "") + '">' + n + " anotados</span>";
    if (n === 0)          h += '<span class="srt-hint">Tildá quiénes juegan</span>';
    else if (n < 4)       h += '<span class="srt-hint">Mínimo 4</span>';
    else if (resto)       h += '<span class="srt-hint srt-warn">Sobra' + (resto > 1 ? "n " : " ") +
                               resto + " — tienen que ser múltiplo de 4</span>";
    else if (!entra)      h += '<span class="srt-hint srt-warn">No entran: quedan ' +
                               S.libres + " cuartos libres</span>";
    else                  h += '<span class="srt-hint srt-ok">' + necesita + " cuartos nuevos</span>";
    h += "</div>";

    if (cantCuartos()) {
      h += '<div class="srt-banner">Esta semana ya hay <b>' + cantCuartos() +
           " cuartos</b> sorteados. Los que siguen arrancan en el Cuarto " +
           (cantCuartos() + 1) + ".</div>";
    }

    if (!S.padron.length) {
      return h + '<div class="srt-msg">La solapa <b>jugadores</b> de la planilla del ' +
             "torneo está vacía.</div>";
    }

    var libres = [], tomados = [];
    for (var i = 0; i < S.padron.length; i++) {
      (S.asignados[S.padron[i]] ? tomados : libres).push(S.padron[i]);
    }

    h += '<div class="srt-grid">';
    for (var j = 0; j < libres.length; j++) {
      var nom = libres[j];
      h += '<button type="button" class="srt-chip' + (S.presentes[nom] ? " srt-chip-on" : "") +
           '" data-nombre="' + esc(nom) + '">' + esc(nom) + "</button>";
    }
    h += "</div>";

    // Los ya sorteados se muestran igual, apagados: si no, uno los busca en la
    // lista, no los encuentra y cree que se perdió el padrón.
    if (tomados.length) {
      h += '<p class="srt-sub">Ya sorteados esta semana</p><div class="srt-grid">';
      for (var k = 0; k < tomados.length; k++) {
        h += '<span class="srt-chip srt-chip-off">' + esc(tomados[k]) +
             ' <small>' + esc(S.asignados[tomados[k]].replace("Cuarto", "C")) + "</small></span>";
      }
      h += "</div>";
    }

    h += '<div class="srt-acciones">' +
         '<button class="srt-btn srt-btn-ghost" id="srt-limpiar">Destildar</button>' +
         '<button class="srt-btn srt-btn-primary" id="srt-sortear"' + (ok ? "" : " disabled") +
         ">Sortear ⚄</button></div>";

    if (cantCuartos()) {
      h += '<button class="srt-link" id="srt-ver-ultimo">← Ver los cuartos de la semana</button>';
    }
    return h;
  }

  // ── Resultado ─────────────────────────────────────────────

  function htmlResultado() {
    if (!S.cuartos.length) return '<div class="srt-msg">Todavía no hay ningún sorteo.</div>';

    var volcadoTodo = S.tandas.length && S.tandas.every(function (t) { return t.volcado; });

    var h = '<div class="srt-head">' +
            '<span class="srt-count">' + S.cuartos.length + " cuartos</span>" +
            '<span class="srt-hint">Semana del ' + esc(S.semana || "") +
            (S.tandas.length > 1 ? " · " + S.tandas.length + " tandas" : "") + "</span></div>";

    if (volcadoTodo) {
      h += '<div class="srt-banner srt-banner-ok">✓ Ya cargado en la planilla</div>';
    }

    for (var i = 0; i < S.cuartos.length; i++) {
      var c = S.cuartos[i];
      h += '<div class="srt-cuarto">' +
           '<div class="srt-cuarto-tit">' + esc(c.cuarto.replace("Cuarto", "Cuarto ")) + "</div>" +
           '<div class="srt-parejas">' +
           '<div class="srt-pareja">' + jugadoresHtml(c.parejaA) + "</div>" +
           '<div class="srt-vs">vs</div>' +
           '<div class="srt-pareja">' + jugadoresHtml(c.parejaB) + "</div>" +
           "</div></div>";
    }

    h += '<div class="srt-acciones">' +
         '<button class="srt-btn srt-btn-ghost" id="srt-compartir">Compartir</button>' +
         '<button class="srt-btn" id="srt-otra"' + (S.libres > 0 ? "" : " disabled") +
         ">Sortear otra tanda</button></div>";

    // El volcado es la única acción que escribe en la planilla del torneo:
    // va aparte, nunca pegado a los otros botones.
    if (S.puedeVolcar) {
      h += '<button class="srt-btn srt-btn-vol" id="srt-volcar">' +
           (volcadoTodo ? "Volver a cargar en la planilla" : "Cargar en la planilla") +
           "</button>" +
           '<p class="srt-nota">Escribe los nombres en las pestañas Cuarto. ' +
           "No toca las salidas ni los hándicaps.</p>";
    } else {
      h += '<div class="srt-banner srt-banner-warn">No se puede cargar en la planilla: ' +
           "todavía tiene los scores de la vuelta anterior. Limpialos primero.</div>";
    }

    var ult = S.tandas[S.tandas.length - 1];
    if (ult && !ult.volcado) {
      h += '<button class="srt-link" id="srt-bajar" data-id="' + esc(ult.id) + '">' +
           "Bajar la última tanda (" + ult.cuartos + " cuarto" +
           (ult.cuartos > 1 ? "s" : "") + ")</button>";
    }
    return h;
  }

  function jugadoresHtml(arr) {
    var h = "";
    for (var i = 0; i < (arr || []).length; i++) {
      h += '<span class="srt-jug">' + esc(arr[i]) + "</span>";
    }
    return h;
  }

  function textoParaCompartir() {
    var l = ["⛳ CCM & Epic — Cuartos\n"];
    for (var i = 0; i < S.cuartos.length; i++) {
      var c = S.cuartos[i];
      l.push(c.cuarto.replace("Cuarto", "Cuarto ") + ": " +
             c.parejaA.join(" + ") + "  vs  " + c.parejaB.join(" + "));
    }
    return l.join("\n");
  }

  // ══════════════════════════════════════════════════════════
  // Enganches
  // ══════════════════════════════════════════════════════════

  function enganches() {
    var r = root();
    if (!r) return;

    r.querySelectorAll(".srt-chip[data-nombre]").forEach(function (b) {
      b.addEventListener("click", function () {
        var nom = b.getAttribute("data-nombre");
        if (S.presentes[nom]) delete S.presentes[nom]; else S.presentes[nom] = true;
        guardarPresentes();
        pintar();
      });
    });

    on("srt-limpiar", function () { S.presentes = {}; guardarPresentes(); pintar(); });
    on("srt-ver-ultimo", function () { S.vista = "resultado"; pintar(); });
    on("srt-otra", function () { S.vista = "seleccion"; pintar(); });
    on("srt-sortear", hacerSorteo);
    on("srt-volcar", hacerVolcado);
    on("srt-compartir", compartir);
    on("srt-bajar", bajarTanda);
  }

  function on(id, fn) {
    var b = $(id);
    if (b) b.addEventListener("click", fn);
  }

  async function hacerSorteo() {
    var btn = $("srt-sortear");
    if (btn) { btn.disabled = true; btn.textContent = "Sorteando…"; }
    try {
      var res = await apiPost({
        action: "sortear",
        presentes: listaPresentes(),
        autor: autorProbable(),
      });
      if (res.error) alert(res.error);
      else { aplicar(res.estado); S.vista = "resultado"; }
    } catch (err) {
      alert("No se pudo sortear: " + (err.message || err));
    } finally {
      // Siempre se re-habilita, pase lo que pase: el bug del botón "Enviando…"
      // tildado para siempre vino justo de no hacer esto.
      if (btn) { btn.disabled = false; btn.textContent = "Sortear ⚄"; }
      pintar();
    }
  }

  async function hacerVolcado() {
    if (!S.cuartos.length) return;
    if (!confirm("Esto escribe los " + S.cuartos.length + " cuartos de la semana en la " +
                 "planilla del torneo y vacía los que sobren.\n\n¿Seguro?")) return;

    var btn = $("srt-volcar");
    if (btn) { btn.disabled = true; btn.textContent = "Cargando…"; }
    try {
      var res = await apiPost({ action: "volcar" });
      if (res.error) alert(res.error);
      else {
        alert("Listo. Cargados: " + (res.escritos || []).join(", ") +
              ((res.vaciados || []).length ? "\nVaciados: " + res.vaciados.join(", ") : ""));
        aplicar(res.estado);
      }
    } catch (err) {
      alert("No se pudo cargar en la planilla: " + (err.message || err));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Cargar en la planilla"; }
      await cargar(false);
    }
  }

  async function bajarTanda() {
    var b = $("srt-bajar");
    if (!b) return;
    if (!confirm("¿Bajar la última tanda sorteada?")) return;
    b.disabled = true;
    try {
      var res = await apiPost({ action: "borrarSorteo", id: b.getAttribute("data-id") });
      if (res.error) alert(res.error);
      else aplicar(res.estado);
    } catch (err) {
      alert("No se pudo: " + (err.message || err));
    } finally {
      pintar();
    }
  }

  function compartir() {
    var txt = textoParaCompartir();
    if (navigator.share) {
      navigator.share({ text: txt }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).then(function () { alert("Copiado."); });
    } else {
      prompt("Copiá los cuartos:", txt);
    }
  }

  /** Si el tipo ya se registró en Desafíos, reusamos ese nombre como autor. */
  function autorProbable() {
    try {
      var raw = localStorage.getItem("ccm-desafios-yo");
      if (raw) return (JSON.parse(raw) || {}).nombre || "";
    } catch (e) {}
    return "";
  }

  // ══════════════════════════════════════════════════════════
  // Arranque — se engancha SIN tocar setupNav() de app.js
  // ══════════════════════════════════════════════════════════

  function init() {
    var btn = document.querySelector('.nav-item[data-view="sorteo"]');
    if (!btn) return;

    cargarPresentes();

    btn.addEventListener("click", function () {
      cargar(true);
      arrancarPolling();
    });

    document.querySelectorAll('.nav-item:not([data-view="sorteo"])').forEach(function (b) {
      b.addEventListener("click", pararPolling);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.Sorteo = { cargar: cargar, estado: S };
})();
