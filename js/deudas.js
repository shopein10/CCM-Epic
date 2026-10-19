// ============================================================
// CCM & Epic — DEUDAS DE PELOTAS (módulo independiente)
// ============================================================
// Cada uno carga quién LE debe pelotas (mejor cuarto, match, desafío…).
// El deudor, cuando paga, la saca de la lista. El acreedor también puede
// borrarla (se equivocó / se la perdonó). Todo de buena fe.
//
// Backend: el MISMO Apps Script de Desafíos (acciones `deudas`, `cargarDeuda`,
// `saldarDeuda`), mismo token y MISMO LOGIN: comparte la clave de localStorage
// `ccm-desafios-yo`, así quien ya entró a Desafíos ya está adentro acá.
//
// No modifica app.js / sheets.js / config.js / desafios.js. Usa de afuera,
// solo lectura: Sheets.getAll() (para los atajos "mis rivales del match" y
// "los otros cuartos"). Si este archivo no carga, el resto anda igual.
//
// Clases propias (deu-*) + reuso de las dsf-* de desafios.css. NUNCA `.tab`
// (app.js engancha todos los .tab del documento).
// ============================================================

(function () {
  "use strict";

  var DEU_CONFIG = {
    URL: "https://script.google.com/macros/s/AKfycbwgJPP6hGJoUtCqlvZ_hPChbAPZtT3BpizogQMT5tFXEFqWT0fLmEmAacZGGzZz3k0C/exec",
    TOKEN: "ccm-desafios-2026",
    REFRESH: 30,
    TIMEOUT: 20000,
    MAX_PELOTAS: 12,
  };

  var LS_YO = "ccm-desafios-yo";       // compartido con Desafíos
  var LS_CACHE = "ccm-deudas-cache";

  var MOTIVOS = ["Mejor cuarto", "Match", "Desafío", "Otro"];

  var S = {
    yo: null,
    data: null,          // { pendientes, saldadas, padron }
    torneo: null,
    timer: null,
    cargando: false,
    form: null,          // { deudores:{}, pelotas, motivo, otro, error, enviando }
    confirmar: null,     // id de la deuda que espera el 2do toque
    verSaldadas: false,
  };

  // ── Utilidades ───────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pelLbl(n) { n = Number(n) || 0; return n === 1 ? "pelota" : "pelotas"; }
  function mismo(a, b) { return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase(); }

  function fechaLbl(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    var dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
    return dias[d.getDay()] + " " + d.getDate() + "/" + (d.getMonth() + 1);
  }

  function deviceId() {
    var k = "ccm-device-id", v = null;
    try { v = localStorage.getItem(k); } catch (e) {}
    if (!v) {
      v = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      try { localStorage.setItem(k, v); } catch (e) {}
    }
    return v;
  }
  function cargarYo() {
    try { var raw = localStorage.getItem(LS_YO); S.yo = raw ? JSON.parse(raw) : null; }
    catch (e) { S.yo = null; }
  }
  function guardarYo(nombre, pin) {
    S.yo = { nombre: nombre, pin: pin, deviceId: deviceId() };
    try { localStorage.setItem(LS_YO, JSON.stringify(S.yo)); } catch (e) {}
    // Si Desafíos ya está cargado, que se entere sin recargar la página.
    try { if (window.Desafios && window.Desafios.estado) window.Desafios.estado.yo = S.yo; } catch (e) {}
  }
  function olvidarYo() {
    S.yo = null;
    try { localStorage.removeItem(LS_YO); } catch (e) {}
    try { if (window.Desafios && window.Desafios.estado) window.Desafios.estado.yo = null; } catch (e) {}
  }

  // ── Backend ──────────────────────────────────────────────
  async function req(url, opts) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, DEU_CONFIG.TIMEOUT);
    opts.signal = ctrl.signal; opts.redirect = "follow";
    try {
      var res = await fetch(url, opts);
      clearTimeout(t);
      if (!res.ok) throw new Error("HTTP " + res.status);
      var d = await res.json();
      if (d.error) throw new Error(d.error);
      return d;
    } catch (e) {
      clearTimeout(t);
      if (e.name === "AbortError") throw new Error("Sin respuesta del servidor. Reintentá.");
      throw e;
    }
  }
  function apiGet() { return req(DEU_CONFIG.URL + "?action=deudas", { method: "GET" }); }
  async function apiPost(payload, reintento) {
    payload.token = DEU_CONFIG.TOKEN;
    try {
      return await req(DEU_CONFIG.URL, {
        method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "text/plain" },
      });
    } catch (e) {
      if (!reintento && String(e.message).indexOf("ocupado") !== -1) {
        await new Promise(function (r) { setTimeout(r, 1500); });
        return apiPost(payload, true);
      }
      throw e;
    }
  }

  // ── Datos del torneo (solo para atajos) ──────────────────
  function cuartosDelFinde() {
    var t = S.torneo, out = {};
    if (!t || !t.cuartosDetalle) return out;
    Object.keys(t.cuartosDetalle).forEach(function (cid) {
      var ros = Object.keys(t.cuartosDetalle[cid] || {}).filter(function (n) { return n !== "VACIO"; });
      if (ros.length) out[cid] = ros;
    });
    return out;
  }
  function miCuarto() {
    var c = cuartosDelFinde(), yo = S.yo && S.yo.nombre;
    for (var cid in c) if (c[cid].some(function (n) { return mismo(n, yo); })) return cid;
    return null;
  }
  // Mismas parejas que el match: los dos primeros contra los dos últimos.
  function rivalesMatch() {
    var cid = miCuarto(); if (!cid) return [];
    var ros = cuartosDelFinde()[cid], yo = S.yo.nombre;
    if (ros.length < 4) return [];
    var a = ros.slice(0, 2), b = ros.slice(2, 4);
    return a.some(function (n) { return mismo(n, yo); }) ? b : a;
  }
  function otrosCuartos() {
    var c = cuartosDelFinde(), mc = miCuarto(), out = [];
    Object.keys(c).forEach(function (cid) { if (cid !== mc) out = out.concat(c[cid]); });
    return out.filter(function (n) { return !mismo(n, S.yo.nombre); });
  }

  function padron() {
    var p = (S.data && S.data.padron) || [];
    if (p.length) return p;
    var c = cuartosDelFinde(), out = [];
    Object.keys(c).forEach(function (cid) { out = out.concat(c[cid]); });
    return out.sort();
  }

  // ── Cuentas ──────────────────────────────────────────────
  function misCuentas() {
    var yo = S.yo.nombre, pend = (S.data && S.data.pendientes) || [];
    var debo = pend.filter(function (d) { return mismo(d.deudor, yo); });
    var meDeben = pend.filter(function (d) { return mismo(d.acreedor, yo); });
    var otras = pend.filter(function (d) { return !mismo(d.deudor, yo) && !mismo(d.acreedor, yo); });
    var suma = function (arr) { return arr.reduce(function (s, d) { return s + (d.pelotas || 0); }, 0); };
    return { debo: debo, meDeben: meDeben, otras: otras, totDebo: suma(debo), totMeDeben: suma(meDeben) };
  }

  // ── Carga / cache / polling ──────────────────────────────
  function guardarCache() {
    try { localStorage.setItem(LS_CACHE, JSON.stringify({ t: Date.now(), data: S.data, torneo: S.torneo })); } catch (e) {}
  }
  function leerCache() {
    try { var o = JSON.parse(localStorage.getItem(LS_CACHE)); return (o && o.data) ? o : null; } catch (e) { return null; }
  }

  async function cargar(mostrar) {
    if (!S.data) {
      var c = leerCache();
      if (c) { S.data = c.data; if (!S.torneo && c.torneo) S.torneo = c.torneo; }
    }
    var hay = !!S.data;
    if (mostrar) { if (hay) pintar(); else pintarMsg("Cargando…"); }
    if (S.cargando) return;
    S.cargando = true;
    try {
      var tareas = [apiGet()];
      if (typeof Sheets !== "undefined") tareas.push(Sheets.getAll().catch(function () { return null; }));
      var r = await Promise.all(tareas);
      S.data = r[0];
      if (r[1]) S.torneo = r[1];
      guardarCache();
      if (!S.form || !S.form.enviando) pintar();
    } catch (e) {
      if (!hay) pintarMsg("No se pudo cargar.<br><span>" + esc(e.message || e) + "</span>", true);
    } finally {
      S.cargando = false;
    }
  }
  function arrancarPolling() {
    pararPolling();
    S.timer = setInterval(function () { if (!S.form) cargar(false); }, DEU_CONFIG.REFRESH * 1000);
  }
  function pararPolling() { if (S.timer) { clearInterval(S.timer); S.timer = null; } }

  // ── Render ───────────────────────────────────────────────
  function root() { return $("deudas-body"); }

  function pintarMsg(html, conReintento) {
    var el = root(); if (!el) return;
    el.innerHTML = '<div class="dsf-empty' + (conReintento ? " dsf-empty--err" : "") + '">' + html +
      (conReintento ? '<button class="dsf-btn dsf-btn-line" id="deu-reintentar">Reintentar</button>' : "") + "</div>";
    var b = $("deu-reintentar");
    if (b) b.addEventListener("click", function () { cargar(true); });
  }

  function pintar() {
    var el = root(); if (!el) return;
    if (!S.yo) { el.innerHTML = htmlLogin(); enganchesLogin(); return; }
    if (S.form) { el.innerHTML = htmlForm(); enganchesForm(); return; }
    el.innerHTML = htmlPrincipal();
    enganches();
  }

  // Login (mismo backend que Desafíos: `registrar`)
  function htmlLogin() {
    var opts = padron().map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + "</option>"; }).join("");
    return '<div class="dsf-login">' +
      '<p class="dsf-login-t">¿Quién sos?</p>' +
      '<p class="dsf-login-s">Mismo usuario y PIN que en Desafíos. Queda guardado en este teléfono.</p>' +
      '<select id="deu-nombre" class="dsf-input"><option value="">— elegí tu nombre —</option>' + opts + "</select>" +
      '<input id="deu-pin" class="dsf-input" type="tel" inputmode="numeric" maxlength="4" placeholder="PIN de 4 dígitos">' +
      '<button id="deu-entrar" class="dsf-btn dsf-btn-oro">Entrar</button>' +
      '<p class="dsf-login-err" id="deu-login-err"></p></div>';
  }
  function enganchesLogin() {
    var btn = $("deu-entrar"); if (!btn) return;
    btn.addEventListener("click", async function () {
      var nombre = $("deu-nombre").value, pin = $("deu-pin").value.trim(), err = $("deu-login-err");
      err.textContent = "";
      if (!nombre) { err.textContent = "Elegí tu nombre."; return; }
      if (!/^\d{4}$/.test(pin)) { err.textContent = "El PIN son 4 números."; return; }
      btn.disabled = true; btn.textContent = "Entrando…";
      try {
        await apiPost({ action: "registrar", nombre: nombre, pin: pin, deviceId: deviceId() });
        guardarYo(nombre, pin);
        pintar();
      } catch (e) {
        err.textContent = e.message || String(e);
        btn.disabled = false; btn.textContent = "Entrar";
      }
    });
  }

  function htmlPrincipal() {
    var c = misCuentas();
    var neto = c.totMeDeben - c.totDebo;
    var h = "";

    h += '<div class="dsf-hdr deu-hdr">' +
           '<div class="deu-hola">Tus cuentas</div>' +
           '<button class="dsf-yo" id="deu-yo" title="Cambiar de jugador">' + esc(S.yo.nombre) + "</button>" +
         "</div>";

    h += '<div class="deu-resumen">' +
           '<div class="deu-res-b' + (c.totMeDeben ? " deu-res-b--pos" : "") + '"><span class="deu-res-n">' + c.totMeDeben + '</span><span class="deu-res-l">te deben</span></div>' +
           '<div class="deu-res-b' + (c.totDebo ? " deu-res-b--neg" : "") + '"><span class="deu-res-n">' + c.totDebo + '</span><span class="deu-res-l">debés</span></div>' +
           '<div class="deu-res-b"><span class="deu-res-n ' + (neto > 0 ? "pos" : neto < 0 ? "neg" : "") + '">' +
             (neto > 0 ? "+" : "") + neto + '</span><span class="deu-res-l">neto</span></div>' +
         "</div>";

    h += '<button class="dsf-btn dsf-btn-oro dsf-btn-full deu-nueva" id="deu-nueva">＋ Cargar quién me debe</button>';

    if (c.debo.length) {
      h += '<p class="dsf-sec">DEBÉS</p>' + c.debo.map(function (d) { return tarjeta(d, "debo"); }).join("");
    }
    if (c.meDeben.length) {
      h += '<p class="dsf-sec">TE DEBEN</p>' + c.meDeben.map(function (d) { return tarjeta(d, "meDeben"); }).join("");
    }
    if (!c.debo.length && !c.meDeben.length) {
      h += '<p class="deu-vacio">No debés nada ni te deben nada. Cuentas claras.</p>';
    }

    if (c.otras.length) {
      h += '<p class="dsf-sec">LAS DEMÁS</p><div class="deu-lista">' +
        c.otras.slice().sort(function (a, b) { return a.deudor.localeCompare(b.deudor); }).map(function (d) {
          return '<div class="deu-fila"><span class="deu-fila-q"><b>' + esc(d.deudor) + '</b> <span class="dsf-dim">→</span> ' + esc(d.acreedor) + "</span>" +
                 '<span class="deu-fila-m">' + esc(d.motivo || "") + "</span>" +
                 '<span class="deu-fila-p">' + d.pelotas + "</span></div>";
        }).join("") + "</div>";
    }

    var sald = (S.data && S.data.saldadas) || [];
    if (sald.length) {
      h += '<button class="deu-toggle" id="deu-ver-saldadas">' + (S.verSaldadas ? "▾" : "▸") + " Saldadas hace poco (" + sald.length + ")</button>";
      if (S.verSaldadas) {
        h += '<div class="deu-lista deu-lista--muerta">' + sald.map(function (d) {
          var como = d.estado === "pagada" ? "pagó" : "borrada por " + esc(d.cerradoPor || d.acreedor);
          return '<div class="deu-fila"><span class="deu-fila-q">' + esc(d.deudor) + ' <span class="dsf-dim">→</span> ' + esc(d.acreedor) + "</span>" +
                 '<span class="deu-fila-m">' + como + " · " + fechaLbl(d.tsCierre) + "</span>" +
                 '<span class="deu-fila-p">' + d.pelotas + "</span></div>";
        }).join("") + "</div>";
      }
    }
    return h;
  }

  function tarjeta(d, lado) {
    var titulo = lado === "debo"
      ? '<span class="dsf-dim">Le debés a</span> ' + esc(d.acreedor)
      : esc(d.deudor) + ' <span class="dsf-dim">te debe</span>';
    var sub = [d.motivo, fechaLbl(d.ts)].filter(Boolean).join(" · ");
    var esperando = S.confirmar === d.id;
    var btnTxt = lado === "debo"
      ? (esperando ? "¿Seguro? Tocá de nuevo" : "Ya le pagué ✓")
      : (esperando ? "¿Borrarla? Tocá de nuevo" : "Me pagó / borrar");
    var btnCls = lado === "debo" ? "dsf-btn-oro" : "dsf-btn-line";
    return '<div class="dsf-card">' +
        '<div class="dsf-card-top"><div class="dsf-card-txt">' +
          '<p class="dsf-card-t">' + titulo + "</p>" +
          (sub ? '<p class="dsf-card-s">' + esc(sub) + "</p>" : "") +
        "</div>" +
        '<span class="dsf-pel">' + d.pelotas + "<span>" + pelLbl(d.pelotas) + "</span></span></div>" +
        '<button class="dsf-btn ' + btnCls + ' dsf-btn-full' + (esperando ? " deu-confirmar" : "") + '" data-deu-saldar="' + esc(d.id) + '">' + btnTxt + "</button>" +
      "</div>";
  }

  function enganches() {
    var yo = $("deu-yo");
    if (yo) yo.addEventListener("click", function () {
      if (yo.dataset.ok !== "1") { yo.dataset.ok = "1"; yo.textContent = "¿Salir? tocá de nuevo"; return; }
      olvidarYo(); pintar();
    });
    var n = $("deu-nueva");
    if (n) n.addEventListener("click", function () {
      S.form = { deudores: {}, pelotas: 1, motivo: "Mejor cuarto", otro: "", error: "", enviando: false };
      S.confirmar = null;
      pintar();
      window.scrollTo(0, 0);
    });
    var vs = $("deu-ver-saldadas");
    if (vs) vs.addEventListener("click", function () { S.verSaldadas = !S.verSaldadas; pintar(); });
    document.querySelectorAll("[data-deu-saldar]").forEach(function (b) {
      b.addEventListener("click", function () { saldar(b.dataset.deuSaldar, b); });
    });
  }

  async function saldar(id, btn) {
    if (String(id).indexOf("tmp-") === 0) { btn.textContent = "Un segundo, se está guardando…"; cargar(false); return; }
    if (S.confirmar !== id) { S.confirmar = id; pintar(); return; }
    S.confirmar = null;
    btn.disabled = true; btn.textContent = "…";
    try {
      await apiPost({ action: "saldarDeuda", nombre: S.yo.nombre, pin: S.yo.pin, deudaId: id });
      // Optimista: la sacamos ya de la lista, después refrescamos.
      if (S.data && S.data.pendientes) S.data.pendientes = S.data.pendientes.filter(function (d) { return d.id !== id; });
      pintar();
      cargar(false);
    } catch (e) {
      btn.disabled = false; btn.textContent = "Error: " + (e.message || e);
      if (/PIN/.test(String(e.message))) { olvidarYo(); setTimeout(pintar, 1800); }
    }
  }

  // ── Formulario ───────────────────────────────────────────
  function elegidos() {
    return Object.keys(S.form.deudores).filter(function (k) { return S.form.deudores[k]; });
  }

  function htmlForm() {
    var f = S.form, yo = S.yo.nombre;
    var lista = padron().filter(function (n) { return !mismo(n, yo); });
    var riv = rivalesMatch(), otros = otrosCuartos();
    var sel = elegidos();

    var h = '<div class="dsf-form">';
    h += '<div class="dsf-form-hdr"><p class="dsf-form-t">¿Quién te debe?</p>' +
         '<button class="dsf-x" id="deu-cerrar" aria-label="Cerrar">✕</button></div>';

    if (riv.length || otros.length) {
      h += '<div class="deu-atajos">';
      if (riv.length) h += '<button class="deu-atajo" data-deu-atajo="riv">Mis rivales del match</button>';
      if (otros.length) h += '<button class="deu-atajo" data-deu-atajo="otros">Los otros cuartos (' + otros.length + ")</button>";
      if (sel.length) h += '<button class="deu-atajo deu-atajo--x" data-deu-atajo="limpiar">Limpiar</button>';
      h += "</div>";
    }

    h += '<div class="deu-chips">' + lista.map(function (n) {
      return '<button class="deu-chip' + (f.deudores[n] ? " active" : "") + '" data-deu-chip="' + esc(n) + '">' + esc(n) + "</button>";
    }).join("") + "</div>";

    h += '<label class="dsf-lbl">¿Cuántas pelotas' + (sel.length > 1 ? " cada uno" : "") + "?</label><div class=\"dsf-pelotas\">";
    for (var p = 1; p <= DEU_CONFIG.MAX_PELOTAS; p++) {
      h += '<button class="dsf-pel-b' + (f.pelotas === p ? " active" : "") + '" data-deu-pel="' + p + '">' + p + "</button>";
    }
    h += "</div>";

    h += '<label class="dsf-lbl">¿Por qué?</label><div class="dsf-seg deu-motivos">' +
      MOTIVOS.map(function (m) {
        return '<button class="dsf-seg-b' + (f.motivo === m ? " active" : "") + '" data-deu-mot="' + esc(m) + '">' + esc(m) + "</button>";
      }).join("") + "</div>";
    if (f.motivo === "Otro") {
      h += '<input id="deu-otro" class="dsf-input deu-otro" maxlength="60" placeholder="Ej: apuesta del hoyo 7" value="' + esc(f.otro) + '">';
    }

    if (f.error) h += '<p class="dsf-form-err">' + esc(f.error) + "</p>";

    var total = sel.length * f.pelotas;
    h += '<button class="dsf-btn dsf-btn-oro dsf-btn-full deu-enviar" id="deu-enviar"' + (sel.length && !f.enviando ? "" : " disabled") + ">" +
         (f.enviando ? "Cargando…" :
          !sel.length ? "Elegí quién te debe" :
          sel.length === 1 ? sel[0] + " te debe " + f.pelotas + " " + pelLbl(f.pelotas) :
          sel.length + " te deben " + f.pelotas + " c/u (" + total + " en total)") +
         "</button>";
    h += "</div>";
    return h;
  }

  function enganchesForm() {
    var f = S.form;
    var c = $("deu-cerrar");
    if (c) c.addEventListener("click", function () { S.form = null; pintar(); });

    // Guardamos el texto de "Otro" antes de cada re-render para no perderlo.
    var otro = $("deu-otro");
    var keep = function () { if ($("deu-otro")) f.otro = $("deu-otro").value; };
    if (otro) otro.addEventListener("input", function () { f.otro = otro.value; });

    document.querySelectorAll("[data-deu-chip]").forEach(function (b) {
      b.addEventListener("click", function () {
        keep(); var n = b.dataset.deuChip; f.deudores[n] = !f.deudores[n]; f.error = "";
        var y = window.scrollY; pintar(); window.scrollTo(0, y);
      });
    });
    document.querySelectorAll("[data-deu-atajo]").forEach(function (b) {
      b.addEventListener("click", function () {
        keep();
        var a = b.dataset.deuAtajo;
        if (a === "limpiar") f.deudores = {};
        var pon = a === "riv" ? rivalesMatch() : a === "otros" ? otrosCuartos() : [];
        pon.forEach(function (n) { f.deudores[n] = true; });
        if (a === "riv") f.motivo = "Match";
        if (a === "otros") f.motivo = "Mejor cuarto";
        pintar();
      });
    });
    document.querySelectorAll("[data-deu-pel]").forEach(function (b) {
      b.addEventListener("click", function () { keep(); f.pelotas = Number(b.dataset.deuPel); var y = window.scrollY; pintar(); window.scrollTo(0, y); });
    });
    document.querySelectorAll("[data-deu-mot]").forEach(function (b) {
      b.addEventListener("click", function () { keep(); f.motivo = b.dataset.deuMot; var y = window.scrollY; pintar(); window.scrollTo(0, y); });
    });

    var env = $("deu-enviar");
    if (env) env.addEventListener("click", enviar);
  }

  async function enviar() {
    var f = S.form;
    if (f.enviando) return;
    if ($("deu-otro")) f.otro = $("deu-otro").value;
    var sel = elegidos();
    if (!sel.length) { f.error = "Elegí quién te debe."; pintar(); return; }
    var motivo = f.motivo === "Otro" ? (f.otro.trim() || "Otro") : f.motivo;
    f.enviando = true; f.error = ""; pintar();
    try {
      await apiPost({ action: "cargarDeuda", nombre: S.yo.nombre, pin: S.yo.pin,
                      deudores: sel, pelotas: f.pelotas, motivo: motivo });
      // Optimista: las mostramos ya (el Apps Script tarda ~5s en releer) y
      // refrescamos por detrás. Los ids temporales se pisan con los reales.
      var ahora = Date.now();
      if (S.data && S.data.pendientes) {
        sel.forEach(function (n, i) {
          S.data.pendientes.push({ id: "tmp-" + ahora + "-" + i, ts: ahora, acreedor: S.yo.nombre,
                                   deudor: n, pelotas: f.pelotas, motivo: motivo, estado: "pendiente" });
        });
      }
      S.form = null;
      pintar();
      window.scrollTo(0, 0);
      cargar(false);
    } catch (e) {
      f.enviando = false; f.error = e.message || String(e);
      if (/PIN/.test(f.error)) { S.form = null; olvidarYo(); }
      pintar();
    }
  }

  // ── Arranque ─────────────────────────────────────────────
  function init() {
    var btn = document.querySelector('.nav-item[data-view="deudas"]');
    if (!btn) return;
    cargarYo();
    btn.addEventListener("click", function () {
      cargarYo();            // por si entró o salió desde Desafíos
      S.confirmar = null;
      cargar(true);
      arrancarPolling();
    });
    document.querySelectorAll('.nav-item:not([data-view="deudas"])').forEach(function (b) {
      b.addEventListener("click", pararPolling);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.Deudas = { cargar: cargar, estado: S, _test: { misCuentas: misCuentas, rivalesMatch: rivalesMatch, otrosCuartos: otrosCuartos } };
})();
