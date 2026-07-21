// ============================================================
// CCM & Epic — DESAFÍOS (módulo independiente)
// ============================================================
// NO modifica nada de app.js / sheets.js / config.js.
// Lo único que USA de afuera (todo de solo lectura):
//   - Sheets.getAll()      → datos del torneo (leaderboard, cuartosDetalle…)
//   - calcularMatch(...)   → para liquidar los desafíos modo "match"
//   - navigateTo(...)      → no se usa; el nav lo maneja app.js solo
//
// Si este archivo no carga, la app del torneo funciona exactamente igual.
// ============================================================

(function () {
  "use strict";

  // ── Config propia (no toca config.js) ─────────────────────
  var DSF_CONFIG = {
    // Web App URL del Apps Script NUEVO de desafíos (no el del torneo)
    URL: "https://script.google.com/macros/s/AKfycbwgJPP6hGJoUtCqlvZ_hPChbAPZtT3BpizogQMT5tFXEFqWT0fLmEmAacZGGzZz3k0C/exec",
    TOKEN: "ccm-desafios-2026",
    REFRESH: 30,           // segundos, solo mientras la solapa está abierta
    TIMEOUT: 20000,
    MAX_PELOTAS: 12,       // tope por desafío
  };

  var LS_YO = "ccm-desafios-yo";

  var S = {
    yo: null,              // { nombre, pin, deviceId }
    data: null,            // respuesta del backend
    torneo: null,          // respuesta de Sheets.getAll()
    tab: "desafios",       // "desafios" | "enjuego"
    timer: null,
    cargando: false,
    form: null,
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

  function pelotasLbl(n) {
    n = Math.abs(Number(n) || 0);
    return n === 1 ? "1 pelota" : n + " pelotas";
  }

  function deviceId() {
    var k = "ccm-device-id";
    var v = null;
    try { v = localStorage.getItem(k); } catch (e) {}
    if (!v) {
      v = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      try { localStorage.setItem(k, v); } catch (e) {}
    }
    return v;
  }

  function cargarYo() {
    try {
      var raw = localStorage.getItem(LS_YO);
      if (raw) S.yo = JSON.parse(raw);
    } catch (e) { S.yo = null; }
  }

  function guardarYo(nombre, pin) {
    S.yo = { nombre: nombre, pin: pin, deviceId: deviceId() };
    try { localStorage.setItem(LS_YO, JSON.stringify(S.yo)); } catch (e) {}
  }

  function olvidarYo() {
    S.yo = null;
    try { localStorage.removeItem(LS_YO); } catch (e) {}
  }

  // ══════════════════════════════════════════════════════════
  // Backend
  // ══════════════════════════════════════════════════════════

  function conTimeout(promesa, ms) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, ms);
    return { signal: ctrl.signal, limpiar: function () { clearTimeout(t); } };
  }

  async function apiGet() {
    var w = conTimeout(null, DSF_CONFIG.TIMEOUT);
    try {
      var res = await fetch(DSF_CONFIG.URL + "?action=listar", {
        method: "GET", redirect: "follow", signal: w.signal,
      });
      w.limpiar();
      if (!res.ok) throw new Error("HTTP " + res.status);
      var d = await res.json();
      if (d.error) throw new Error(d.error);
      return d;
    } catch (e) {
      w.limpiar();
      if (e.name === "AbortError") throw new Error("Sin respuesta del servidor.");
      throw e;
    }
  }

  // El LockService del Apps Script a veces devuelve "Servidor ocupado" si dos
  // acciones caen muy pegadas. Es transitorio: se reintenta una sola vez.
  async function apiPost(payload, _reintento) {
    try {
      return await apiPostRaw(payload);
    } catch (e) {
      var msg = String(e.message || e);
      if (!_reintento && msg.indexOf("ocupado") !== -1) {
        await new Promise(function (r) { setTimeout(r, 1500); });
        return apiPost(payload, true);
      }
      throw e;
    }
  }

  async function apiPostRaw(payload) {
    payload.token = DSF_CONFIG.TOKEN;
    var w = conTimeout(null, DSF_CONFIG.TIMEOUT);
    try {
      var res = await fetch(DSF_CONFIG.URL, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "text/plain" },
        redirect: "follow",
        signal: w.signal,
      });
      w.limpiar();
      if (!res.ok) throw new Error("HTTP " + res.status);
      var d = await res.json();
      if (d.error) throw new Error(d.error);
      return d;
    } catch (e) {
      w.limpiar();
      if (e.name === "AbortError") throw new Error("Sin respuesta del servidor (20s). Reintentá.");
      throw e;
    }
  }

  // ══════════════════════════════════════════════════════════
  // Datos del torneo (solo lectura)
  // ══════════════════════════════════════════════════════════

  function jugadoresDelTorneo() {
    var t = S.torneo;
    if (!t || !t.cuartosDetalle) return [];
    var out = [];
    Object.keys(t.cuartosDetalle).forEach(function (cid) {
      Object.keys(t.cuartosDetalle[cid]).forEach(function (n) {
        if (n !== "VACIO") out.push(n);
      });
    });
    return out.sort();
  }

  function cuartoDe(nombre) {
    var t = S.torneo;
    if (!t || !t.cuartosDetalle) return null;
    var found = null;
    Object.keys(t.cuartosDetalle).forEach(function (cid) {
      if (t.cuartosDetalle[cid][nombre]) found = cid;
    });
    return found;
  }

  function detalleDe(nombre) {
    var cid = cuartoDe(nombre);
    return cid ? S.torneo.cuartosDetalle[cid][nombre] : null;
  }

  /** Cuántos hoyos lleva jugados. Sirve para saber si un desafío está cerrado. */
  function hoyosJugados(nombre) {
    var d = detalleDe(nombre);
    if (!d || !d.golpes) return 0;
    return d.golpes.filter(function (g) { return g != null && g !== "" && Number(g) > 0; }).length;
  }

  function yaSalio(nombres) {
    // El backend manda `salieron` (autoritativo). Esto es solo para la UI:
    // deshabilitar botones antes de que el servidor los rechace.
    var sal = (S.data && S.data.salieron) || {};
    for (var i = 0; i < nombres.length; i++) {
      var c = cuartoDe(nombres[i]);
      if (c && sal[c]) return true;
      if (hoyosJugados(nombres[i]) > 0) return true;
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════
  // Jornada — qué desafíos están vigentes
  // ══════════════════════════════════════════════════════════
  //
  // La liquidación NO guarda el resultado: lo calcula en vivo contra los scores
  // que hay AHORA en la planilla del torneo. Si dejáramos ver los desafíos de la
  // semana pasada, al limpiar los scores para la vuelta nueva se re-liquidarían
  // contra datos que no son los suyos y darían cualquier cosa.
  //
  // Por eso solo se muestra y se liquida la JORNADA VIGENTE: el día calendario
  // del desafío más reciente. Los anteriores quedan guardados en la planilla,
  // pero la app no los toca. La jornada avanza sola: el primero que cuelga un
  // desafío un día nuevo, mueve la jornada a ese día.

  /** "2026-07-21" en hora local (la del teléfono, o sea Argentina). */
  function jornadaDe(ts) {
    if (!ts) return null;
    var d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.getFullYear() + "-" +
           String(d.getMonth() + 1).padStart(2, "0") + "-" +
           String(d.getDate()).padStart(2, "0");
  }

  function jornadaVigente() {
    var ds = (S.data && S.data.desafios) || [];
    var max = null;
    for (var i = 0; i < ds.length; i++) {
      var j = jornadaDe(ds[i].ts);
      if (j && (max === null || j > max)) max = j;   // ISO ordena como string
    }
    return max || jornadaDe(Date.now());
  }

  /** Los de la jornada vigente. Uno sin fecha se considera vigente (fail-open). */
  function desafiosVigentes() {
    var hoy = jornadaVigente();
    return ((S.data && S.data.desafios) || []).filter(function (d) {
      var j = jornadaDe(d.ts);
      return j === null || j === hoy;
    });
  }

  function cuantosViejos() {
    var total = ((S.data && S.data.desafios) || []).length;
    return total - desafiosVigentes().length;
  }

  function jornadaLbl() {
    var j = jornadaVigente();
    if (!j) return "";
    var p = j.split("-");
    var hoy = jornadaDe(Date.now());
    if (j === hoy) return "hoy";
    return p[2] + "/" + p[1];
  }

  // ══════════════════════════════════════════════════════════
  // Liquidación — se calcula acá, con los scores que ya tiene la app
  // ══════════════════════════════════════════════════════════
  //
  // Devuelve: { estado: "esperando"|"jugando"|"listo", ganador: "A"|"B"|"empate"|null,
  //             valorA, valorB, etiqueta, detalle }

  function liquidar(d) {
    if (d.modo === "match") return liquidarMatch(d);
    return liquidarNeto(d);
  }

  function liquidarNeto(d) {
    var A = d.equipoA, B = d.equipoB;
    if (!A.length || !B.length) return { estado: "esperando", ganador: null, etiqueta: "Esperando rival" };

    var faltan = [];
    var sum = function (lado) {
      var tot = 0, minHoyos = 18;
      for (var i = 0; i < lado.length; i++) {
        var det = detalleDe(lado[i]);
        var jug = hoyosJugados(lado[i]);
        if (jug < minHoyos) minHoyos = jug;
        if (jug < 18) faltan.push(lado[i]);
        if (!det || det.neto == null) return { v: null, h: jug };
        tot += Number(det.neto);
      }
      return { v: tot, h: minHoyos };
    };

    var a = sum(A), b = sum(B);
    if (a.v == null || b.v == null) {
      return { estado: "jugando", ganador: null, valorA: a.v, valorB: b.v,
               hoyosA: a.h, hoyosB: b.h, etiqueta: "Sin score todavía" };
    }

    var listo = faltan.length === 0;
    var ganador = a.v < b.v ? "A" : (b.v < a.v ? "B" : "empate");

    return {
      estado: listo ? "listo" : "jugando",
      ganador: listo ? ganador : null,
      valorA: a.v, valorB: b.v,
      hoyosA: a.h, hoyosB: b.h,
      // Mientras no terminaron los dos, comparar netos es engañoso: el que va
      // por el hoyo 9 tiene la mitad de golpes. Por eso no se declara ganador
      // parcial y la tarjeta muestra cuántos hoyos lleva cada uno.
      etiqueta: listo ? "Neto final" : "Todavía en la cancha",
      detalle: "neto " + a.v + " vs " + b.v,
    };
  }

  function liquidarMatch(d) {
    // Solo tiene sentido si los dos lados son las parejas del match de un mismo cuarto.
    var cid = cuartoDe(d.equipoA[0]);
    if (!cid || typeof calcularMatch !== "function") {
      return { estado: "jugando", ganador: null, etiqueta: "No se puede liquidar por match" };
    }
    var mc = null;
    try { mc = calcularMatch(S.torneo, cid); } catch (e) { mc = null; }
    if (!mc) return { estado: "jugando", ganador: null, etiqueta: "Match no disponible" };

    var mismoLado = d.equipoA.every(function (n) { return mc.A.indexOf(n) !== -1; });
    var vA = mismoLado ? mc.ptsA : mc.ptsB;
    var vB = mismoLado ? mc.ptsB : mc.ptsA;

    var todos = d.equipoA.concat(d.equipoB);
    var completo = todos.every(function (n) { return hoyosJugados(n) >= 18; });
    var ganador = vA > vB ? "A" : (vB > vA ? "B" : "empate");

    return {
      estado: completo ? "listo" : "jugando",
      ganador: completo ? ganador : null,
      valorA: vA, valorB: vB,
      etiqueta: completo ? "Match final" : "Match en juego",
      detalle: vA + " a " + vB + " puntos",
    };
  }

  /** Balance del día para el jugador logueado, en pelotas. */
  function cuentaDelDia() {
    var yo = S.yo && S.yo.nombre;
    var res = { ganadas: 0, perdidas: 0, pendientes: 0, filas: [] };
    if (!yo || !S.data) return res;

    desafiosVigentes().forEach(function (d) {
      if (d.estado !== "aceptado") return;
      var enA = d.equipoA.indexOf(yo) !== -1;
      var enB = d.equipoB.indexOf(yo) !== -1;
      if (!enA && !enB) return;

      var l = liquidar(d);
      var rival = (enA ? d.equipoB : d.equipoA).join(" y ");

      if (l.estado !== "listo" || !l.ganador) {
        res.pendientes += d.pelotas;
        res.filas.push({ rival: rival, pelotas: d.pelotas, estado: "en juego" });
        return;
      }
      if (l.ganador === "empate") {
        res.filas.push({ rival: rival, pelotas: 0, estado: "empate" });
        return;
      }
      var gane = (l.ganador === "A" && enA) || (l.ganador === "B" && enB);
      if (gane) { res.ganadas += d.pelotas; res.filas.push({ rival: rival, pelotas: d.pelotas, estado: "ganado" }); }
      else { res.perdidas += d.pelotas; res.filas.push({ rival: rival, pelotas: -d.pelotas, estado: "perdido" }); }
    });

    return res;
  }

  // ══════════════════════════════════════════════════════════
  // Carga
  // ══════════════════════════════════════════════════════════

  async function cargar(mostrarSpinner) {
    if (S.cargando) return;
    S.cargando = true;
    if (mostrarSpinner) pintarCargando();
    try {
      var tareas = [apiGet()];
      // Sheets.getAll() usa su propia caché: no genera tráfico extra ni la invalida.
      if (typeof Sheets !== "undefined") tareas.push(Sheets.getAll().catch(function () { return null; }));
      var r = await Promise.all(tareas);
      S.data = r[0];
      if (r[1]) S.torneo = r[1];
      pintar();
    } catch (e) {
      pintarError(e.message || String(e));
    } finally {
      S.cargando = false;
    }
  }

  function arrancarPolling() {
    pararPolling();
    S.timer = setInterval(function () { cargar(false); }, DSF_CONFIG.REFRESH * 1000);
  }

  function pararPolling() {
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
  }

  // ══════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════

  function root() { return $("desafios-body"); }

  function pintarCargando() {
    var el = root();
    if (el) el.innerHTML = '<div class="dsf-empty">Cargando…</div>';
  }

  function pintarError(msg) {
    var el = root();
    if (!el) return;
    el.innerHTML =
      '<div class="dsf-empty dsf-empty--err">No se pudo cargar.<br><span>' + esc(msg) + '</span>' +
      '<button class="dsf-btn dsf-btn-line" id="dsf-reintentar">Reintentar</button></div>';
    var b = $("dsf-reintentar");
    if (b) b.addEventListener("click", function () { cargar(true); });
  }

  function pintar() {
    var el = root();
    if (!el) return;

    if (!S.yo) { el.innerHTML = htmlLogin(); enganchesLogin(); return; }
    if (S.form) { el.innerHTML = htmlForm(); enganchesForm(); return; }

    el.innerHTML =
      htmlTabs() +
      (S.tab === "desafios" ? htmlSolapaDesafios() : htmlSolapaEnJuego());
    enganches();
  }

  // ── Login ────────────────────────────────────────────────
  function htmlLogin() {
    var jug = jugadoresDelTorneo();
    var opts = jug.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + "</option>"; }).join("");
    return '' +
      '<div class="dsf-login">' +
        '<p class="dsf-login-t">¿Quién sos?</p>' +
        '<p class="dsf-login-s">Elegí tu nombre y poné un PIN de 4 dígitos. Queda guardado en este teléfono; el PIN es para recuperarlo si cambiás de aparato.</p>' +
        '<select id="dsf-nombre" class="dsf-input"><option value="">— elegí tu nombre —</option>' + opts + '</select>' +
        '<input id="dsf-pin" class="dsf-input" type="tel" inputmode="numeric" maxlength="4" placeholder="PIN de 4 dígitos">' +
        '<button id="dsf-entrar" class="dsf-btn dsf-btn-oro">Entrar</button>' +
        '<p class="dsf-login-err" id="dsf-login-err"></p>' +
      '</div>';
  }

  function enganchesLogin() {
    var btn = $("dsf-entrar");
    if (!btn) return;
    btn.addEventListener("click", async function () {
      var nombre = $("dsf-nombre").value;
      var pin = $("dsf-pin").value.trim();
      var err = $("dsf-login-err");
      err.textContent = "";
      if (!nombre) { err.textContent = "Elegí tu nombre."; return; }
      if (!/^\d{4}$/.test(pin)) { err.textContent = "El PIN son 4 números."; return; }
      btn.disabled = true; btn.textContent = "Entrando…";
      try {
        await apiPost({ action: "registrar", nombre: nombre, pin: pin, deviceId: deviceId() });
        guardarYo(nombre, pin);
        await cargar(true);
      } catch (e) {
        err.textContent = e.message || String(e);
        btn.disabled = false; btn.textContent = "Entrar";
      }
    });
  }

  // ── Tabs ─────────────────────────────────────────────────
  // Clases propias (dsf-tab) a propósito: app.js engancha TODOS los `.tab` del
  // documento y apagaría las del leaderboard.
  function htmlTabs() {
    var c = cuentaDelDia();
    var neto = c.ganadas - c.perdidas;
    return '' +
      '<div class="dsf-hdr">' +
        '<div class="dsf-tabs">' +
          '<button class="dsf-tab' + (S.tab === "desafios" ? " active" : "") + '" data-dsf-tab="desafios">Desafíos</button>' +
          '<button class="dsf-tab' + (S.tab === "enjuego" ? " active" : "") + '" data-dsf-tab="enjuego">En juego</button>' +
        '</div>' +
        '<button class="dsf-yo" id="dsf-yo" title="Cambiar de jugador">' + esc(S.yo.nombre) +
          '<span class="dsf-yo-neto ' + (neto > 0 ? "pos" : neto < 0 ? "neg" : "") + '">' +
            (neto > 0 ? "+" : "") + neto + '</span>' +
        '</button>' +
      '</div>';
  }

  // ── Solapa 1: Desafíos ───────────────────────────────────
  function htmlSolapaDesafios() {
    var ds = desafiosVigentes();
    var yo = S.yo.nombre;

    var meTocan = ds.filter(function (d) {
      return d.estado === "pendiente" && d.requeridos.indexOf(yo) !== -1 && d.confirmados.indexOf(yo) === -1;
    });
    var abiertos = ds.filter(function (d) { return d.estado === "abierto"; });
    var pendientes = ds.filter(function (d) {
      return d.estado === "pendiente" && meTocan.indexOf(d) === -1;
    });
    var cerrados = ds.filter(function (d) {
      return d.estado === "rechazado" || d.estado === "anulado";
    }).slice(-6).reverse();

    var h = '<button class="dsf-btn dsf-btn-oro dsf-btn-full" id="dsf-nuevo">＋ Tirar un desafío</button>';

    if (meTocan.length) {
      h += seccion("TE TOCA RESPONDER", meTocan.map(function (d) { return tarjeta(d, true); }).join(""));
    }

    h += seccion("EN LA PARED · agarralo el que quiera",
      abiertos.length ? abiertos.map(function (d) { return tarjeta(d, true); }).join("")
                      : '<div class="dsf-empty">No hay ninguno colgado. Colgá vos.</div>');

    if (pendientes.length) {
      h += seccion("ESPERANDO CONFIRMACIONES",
        pendientes.map(function (d) { return tarjeta(d, false); }).join(""));
    }

    if (cerrados.length) {
      h += seccion("SE CAYERON", cerrados.map(function (d) { return tarjetaMuerta(d); }).join(""));
    }

    h += htmlPieJornada();
    return h;
  }

  function htmlPieJornada() {
    var viejos = cuantosViejos();
    if (!viejos) return "";
    return '<p class="dsf-pie">Se muestra solo la jornada del ' + esc(jornadaLbl()) +
           '. Hay ' + viejos + (viejos === 1 ? " desafío" : " desafíos") +
           ' de jornadas anteriores, guardados pero fuera de juego.</p>';
  }

  function seccion(titulo, contenido) {
    return '<p class="dsf-sec">' + esc(titulo) + "</p>" + contenido;
  }

  function nombresLbl(arr) {
    if (!arr || !arr.length) return "—";
    return arr.join(" + ");
  }

  function modoLbl(d) {
    return (d.modo === "match" ? "Match" : "Score neto") +
           (d.tipo === "parejas" ? " · parejas" : " · individual");
  }

  function tarjeta(d, accionable) {
    var yo = S.yo.nombre;
    var abierto = d.estado === "abierto";
    var mio = d.creador === yo;
    var cerrado = yaSalio(d.equipoA.concat(d.equipoB));

    var titulo = abierto
      ? esc(nombresLbl(d.equipoA)) + ' <span class="dsf-dim">le tira a cualquiera</span>'
      : esc(nombresLbl(d.equipoA)) + ' <span class="dsf-dim">vs</span> ' + esc(nombresLbl(d.equipoB));

    // Los que faltan confirmar, SIN contarme a mí: si me toca a mí, ya lo dicen
    // los botones de Acepto/Paso. Nombrarme en el cartel es ruido.
    var falta = d.requeridos.filter(function (n) {
      return n !== yo && d.confirmados.indexOf(n) === -1;
    });

    var acciones = "";
    if (cerrado) {
      acciones = '<p class="dsf-cerrado">Ese cuarto ya salió. Cerrado.</p>';
    } else if (mio && d.estado !== "aceptado") {
      acciones = '<button class="dsf-btn dsf-btn-line dsf-btn-full" data-dsf-anular="' + esc(d.id) + '">Bajarlo de la pared</button>';
    } else if (accionable && abierto) {
      acciones = d.tipo === "parejas"
        ? '<button class="dsf-btn dsf-btn-oro dsf-btn-full" data-dsf-agarrar="' + esc(d.id) + '">Se la acepto (elijo compañero)</button>'
        : '<button class="dsf-btn dsf-btn-oro dsf-btn-full" data-dsf-agarrar="' + esc(d.id) + '">Se la acepto</button>';
    } else if (accionable) {
      acciones =
        '<div class="dsf-acciones">' +
          '<button class="dsf-btn dsf-btn-oro" data-dsf-resp="aceptar" data-dsf-id="' + esc(d.id) + '">Acepto</button>' +
          '<button class="dsf-btn dsf-btn-gris" data-dsf-resp="rechazar" data-dsf-id="' + esc(d.id) + '">Paso</button>' +
        '</div>';
    }

    return '' +
      '<div class="dsf-card">' +
        '<div class="dsf-card-top">' +
          '<div class="dsf-card-txt">' +
            '<p class="dsf-card-t">' + titulo + '</p>' +
            '<p class="dsf-card-s">' + esc(modoLbl(d)) + (d.nota ? " · " + esc(d.nota) : "") + '</p>' +
          '</div>' +
          '<span class="dsf-pel">' + d.pelotas + '<span>' + (d.pelotas === 1 ? "pelota" : "pelotas") + '</span></span>' +
        '</div>' +
        (falta.length && !abierto
          ? '<p class="dsf-falta">Falta que confirme: ' + esc(falta.join(", ")) + '</p>' : "") +
        acciones +
      '</div>';
  }

  function tarjetaMuerta(d) {
    var etiqueta = d.estado === "anulado" ? "Bajado" : "Pasó";
    var quien = d.rechazadores.length ? d.rechazadores.join(", ") : "";
    return '' +
      '<div class="dsf-card dsf-card--muerta">' +
        '<div class="dsf-card-top">' +
          '<p class="dsf-card-t">' + esc(nombresLbl(d.equipoA)) + " vs " + esc(nombresLbl(d.equipoB)) + '</p>' +
          '<span class="dsf-tag dsf-tag--no">' + esc(etiqueta) + (quien ? " · " + esc(quien) : "") + '</span>' +
        '</div>' +
      '</div>';
  }

  // ── Solapa 2: En juego ───────────────────────────────────
  function htmlSolapaEnJuego() {
    var ds = desafiosVigentes().filter(function (d) { return d.estado === "aceptado"; });

    if (!ds.length) {
      return '<div class="dsf-empty">Todavía no hay ningún desafío cerrado. Andá a la otra solapa y tirá uno.</div>';
    }

    var mios = ds.filter(function (d) { return participo(d); });
    var otros = ds.filter(function (d) { return !participo(d); });

    var h = "";
    if (mios.length) h += seccion("LOS TUYOS", mios.map(tarjetaJuego).join(""));
    if (otros.length) h += seccion("EL RESTO DE LA MESA", otros.map(tarjetaJuego).join(""));
    h += htmlCuenta();
    h += htmlPieJornada();
    return h;
  }

  function participo(d) {
    var yo = S.yo.nombre;
    return d.equipoA.indexOf(yo) !== -1 || d.equipoB.indexOf(yo) !== -1;
  }

  function tarjetaJuego(d) {
    var l = liquidar(d);
    var ganaA = l.ganador === "A", ganaB = l.ganador === "B";

    var estadoTxt, estadoCls;
    if (l.estado === "listo" && l.ganador === "empate") { estadoTxt = "Empate · no se paga"; estadoCls = "dsf-st--emp"; }
    else if (l.estado === "listo") {
      estadoTxt = "Gana " + nombresLbl(ganaA ? d.equipoA : d.equipoB) + " · " + pelotasLbl(d.pelotas);
      estadoCls = "dsf-st--fin";
    } else { estadoTxt = l.etiqueta; estadoCls = "dsf-st--vivo"; }

    var lado = function (nombres, valor, hoyos, gana, pierde) {
      var cls = gana ? " dsf-lado--gana" : (pierde ? " dsf-lado--pierde" : "");
      // Si todavía está jugando, el número solo se entiende con los hoyos al lado.
      var sub = (l.estado !== "listo" && hoyos != null && hoyos < 18)
        ? '<p class="dsf-lado-h">' + hoyos + " hoyos</p>" : "";
      return '<div class="dsf-lado' + cls + '">' +
        '<p class="dsf-lado-n">' + esc(nombresLbl(nombres)) + '</p>' +
        '<p class="dsf-lado-v">' + (valor == null ? "–" : valor) + '</p>' + sub +
      '</div>';
    };

    return '' +
      '<div class="dsf-card">' +
        '<p class="dsf-card-s">' + esc(modoLbl(d)) + ' · se juegan ' + esc(pelotasLbl(d.pelotas)) + '</p>' +
        '<div class="dsf-vs">' +
          lado(d.equipoA, l.valorA, l.hoyosA, ganaA, ganaB) +
          '<span class="dsf-vs-lbl">vs</span>' +
          lado(d.equipoB, l.valorB, l.hoyosB, ganaB, ganaA) +
        '</div>' +
        '<p class="dsf-st ' + estadoCls + '">' + esc(estadoTxt) + '</p>' +
      '</div>';
  }

  function htmlCuenta() {
    var c = cuentaDelDia();
    var neto = c.ganadas - c.perdidas;
    return '' +
      '<div class="dsf-cuenta">' +
        '<p class="dsf-cuenta-t">TU CUENTA DE LA JORNADA · ' + esc(jornadaLbl()) + '</p>' +
        // El signo solo si hay algo: "−0" queda horrible.
        '<div class="dsf-cuenta-r"><span>Te deben</span><span class="pos">' +
          (c.ganadas ? "+" + c.ganadas : "0") + '</span></div>' +
        '<div class="dsf-cuenta-r"><span>Debés</span><span class="neg">' +
          (c.perdidas ? "−" + c.perdidas : "0") + '</span></div>' +
        (c.pendientes ? '<div class="dsf-cuenta-r"><span>En juego</span><span>' + c.pendientes + '</span></div>' : "") +
        '<div class="dsf-cuenta-neto"><span>Neto</span><span>' +
          (neto > 0 ? "+" : "") + neto + " " + (Math.abs(neto) === 1 ? "pelota" : "pelotas") +
        '</span></div>' +
      '</div>';
  }

  // ── Form de creación ─────────────────────────────────────
  function abrirForm(preset) {
    S.form = Object.assign({
      tipo: "individual",
      modo: "neto",
      pelotas: 2,
      companero: "",
      rival1: "",
      rival2: "",
      abierto: true,
      agarrarId: null,
      error: "",
    }, preset || {});
    pintar();
  }

  function cerrarForm() { S.form = null; pintar(); }

  function selectJug(id, valor, excluir, placeholder) {
    var lista = jugadoresDelTorneo().filter(function (n) { return excluir.indexOf(n) === -1; });
    var opts = lista.map(function (n) {
      return '<option value="' + esc(n) + '"' + (n === valor ? " selected" : "") + ">" + esc(n) + "</option>";
    }).join("");
    return '<select id="' + id + '" class="dsf-input"><option value="">' + esc(placeholder) + "</option>" + opts + "</select>";
  }

  function htmlForm() {
    var f = S.form;
    var yo = S.yo.nombre;
    var agarrando = !!f.agarrarId;

    var h = '<div class="dsf-form">';
    h += '<div class="dsf-form-hdr"><p class="dsf-form-t">' +
         (agarrando ? "Elegí tu compañero" : "Tirar un desafío") +
         '</p><button class="dsf-x" id="dsf-cerrar" aria-label="Cerrar">✕</button></div>';

    if (agarrando) {
      h += '<label class="dsf-lbl">Con quién jugás</label>' +
           selectJug("f-companero", f.companero, [yo], "— elegí compañero —");
    } else {
      h += '<label class="dsf-lbl">Tipo</label>' +
           '<div class="dsf-seg">' +
             '<button class="dsf-seg-b' + (f.tipo === "individual" ? " active" : "") + '" data-f-tipo="individual">Individual</button>' +
             '<button class="dsf-seg-b' + (f.tipo === "parejas" ? " active" : "") + '" data-f-tipo="parejas">Parejas</button>' +
           '</div>';

      h += '<label class="dsf-lbl">Qué se mide</label>' +
           '<div class="dsf-seg">' +
             '<button class="dsf-seg-b' + (f.modo === "neto" ? " active" : "") + '" data-f-modo="neto">Score neto</button>' +
             '<button class="dsf-seg-b' + (f.modo === "match" ? " active" : "") + '" data-f-modo="match">Match</button>' +
           '</div>';

      if (f.modo === "match") {
        h += '<p class="dsf-nota">El match solo se puede liquidar entre las dos parejas de un mismo cuarto (las de A89/B89). Si no, usá score neto.</p>';
      }

      if (f.tipo === "parejas") {
        h += '<label class="dsf-lbl">Tu compañero <span class="dsf-dim">(te tiene que confirmar)</span></label>' +
             selectJug("f-companero", f.companero, [yo], "— elegí compañero —");
      }

      h += '<label class="dsf-lbl">Contra quién</label>' +
           '<div class="dsf-seg">' +
             '<button class="dsf-seg-b' + (f.abierto ? " active" : "") + '" data-f-abierto="1">Al que la agarre</button>' +
             '<button class="dsf-seg-b' + (!f.abierto ? " active" : "") + '" data-f-abierto="0">A alguien puntual</button>' +
           '</div>';

      if (!f.abierto) {
        h += selectJug("f-rival1", f.rival1, [yo, f.companero].filter(Boolean), "— rival —");
        if (f.tipo === "parejas") {
          h += selectJug("f-rival2", f.rival2, [yo, f.companero, f.rival1].filter(Boolean), "— rival 2 —");
        }
      }
    }

    h += '<label class="dsf-lbl">Cuántas pelotas</label><div class="dsf-pelotas">';
    for (var p = 1; p <= DSF_CONFIG.MAX_PELOTAS; p++) {
      h += '<button class="dsf-pel-b' + (f.pelotas === p ? " active" : "") + '" data-f-pel="' + p + '">' + p + "</button>";
    }
    h += "</div>";

    if (f.error) h += '<p class="dsf-form-err">' + esc(f.error) + "</p>";

    h += '<button class="dsf-btn dsf-btn-oro dsf-btn-full" id="dsf-enviar">' +
         (agarrando ? "Aceptar el desafío" : "Colgarlo en la pared") + "</button>";
    h += "</div>";
    return h;
  }

  function enganchesForm() {
    var f = S.form;

    var b = $("dsf-cerrar");
    if (b) b.addEventListener("click", cerrarForm);

    document.querySelectorAll("[data-f-tipo]").forEach(function (el) {
      el.addEventListener("click", function () {
        f.tipo = el.dataset.fTipo;
        if (f.tipo === "individual") { f.companero = ""; f.rival2 = ""; }
        pintar();
      });
    });
    document.querySelectorAll("[data-f-modo]").forEach(function (el) {
      el.addEventListener("click", function () { f.modo = el.dataset.fModo; pintar(); });
    });
    document.querySelectorAll("[data-f-abierto]").forEach(function (el) {
      el.addEventListener("click", function () { f.abierto = el.dataset.fAbierto === "1"; pintar(); });
    });
    document.querySelectorAll("[data-f-pel]").forEach(function (el) {
      el.addEventListener("click", function () { f.pelotas = Number(el.dataset.fPel); pintar(); });
    });

    ["f-companero", "f-rival1", "f-rival2"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("change", function () {
        if (id === "f-companero") f.companero = el.value;
        if (id === "f-rival1") f.rival1 = el.value;
        if (id === "f-rival2") f.rival2 = el.value;
        pintar();
      });
    });

    var env = $("dsf-enviar");
    if (env) env.addEventListener("click", enviarForm);
  }

  async function enviarForm() {
    var f = S.form, yo = S.yo.nombre;
    var btn = $("dsf-enviar");
    f.error = "";

    var payload;
    if (f.agarrarId) {
      if (f.companero === "") { f.error = "Elegí tu compañero."; pintar(); return; }
      payload = { action: "responder", nombre: yo, pin: S.yo.pin, desafioId: f.agarrarId,
                  respuesta: "aceptar", companero: f.companero };
    } else {
      var equipoA = [yo];
      if (f.tipo === "parejas") {
        if (!f.companero) { f.error = "Elegí tu compañero."; pintar(); return; }
        equipoA.push(f.companero);
      }
      var equipoB = [];
      if (!f.abierto) {
        if (!f.rival1) { f.error = "Elegí contra quién."; pintar(); return; }
        equipoB.push(f.rival1);
        if (f.tipo === "parejas") {
          if (!f.rival2) { f.error = "Falta el segundo rival."; pintar(); return; }
          equipoB.push(f.rival2);
        }
      }
      payload = { action: "crear", creador: yo, pin: S.yo.pin, tipo: f.tipo, modo: f.modo,
                  pelotas: f.pelotas, equipoA: equipoA, equipoB: equipoB };
    }

    if (btn) { btn.disabled = true; btn.textContent = "Mandando…"; }
    try {
      await apiPost(payload);
      S.form = null;
      await cargar(true);
    } catch (e) {
      f.error = e.message || String(e);
      pintar();
    }
  }

  // ── Enganches de la lista ────────────────────────────────
  function enganches() {
    document.querySelectorAll("[data-dsf-tab]").forEach(function (el) {
      el.addEventListener("click", function () { S.tab = el.dataset.dsfTab; pintar(); });
    });

    var yoBtn = $("dsf-yo");
    if (yoBtn) yoBtn.addEventListener("click", function () {
      if (confirm("¿Salir de " + S.yo.nombre + "? Vas a tener que volver a poner el PIN.")) {
        olvidarYo(); pintar();
      }
    });

    var nuevo = $("dsf-nuevo");
    if (nuevo) nuevo.addEventListener("click", function () { abrirForm(); });

    document.querySelectorAll("[data-dsf-agarrar]").forEach(function (el) {
      el.addEventListener("click", function () {
        var id = el.dataset.dsfAgarrar;
        var d = S.data.desafios.filter(function (x) { return x.id === id; })[0];
        if (d && d.tipo === "parejas") { abrirForm({ agarrarId: id, pelotas: d.pelotas }); }
        else { responder(id, "aceptar", null, el); }
      });
    });

    document.querySelectorAll("[data-dsf-resp]").forEach(function (el) {
      el.addEventListener("click", function () {
        responder(el.dataset.dsfId, el.dataset.dsfResp, null, el);
      });
    });

    document.querySelectorAll("[data-dsf-anular]").forEach(function (el) {
      el.addEventListener("click", async function () {
        if (!confirm("¿Bajar el desafío?")) return;
        el.disabled = true; el.textContent = "Bajando…";
        try {
          await apiPost({ action: "anular", nombre: S.yo.nombre, pin: S.yo.pin, desafioId: el.dataset.dsfAnular });
          await cargar(true);
        } catch (e) { alert(e.message || String(e)); el.disabled = false; el.textContent = "Bajarlo de la pared"; }
      });
    });
  }

  async function responder(id, respuesta, companero, btn) {
    if (respuesta === "rechazar" && !confirm("¿Pasás? Va a quedar a la vista de todos.")) return;
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      await apiPost({ action: "responder", nombre: S.yo.nombre, pin: S.yo.pin,
                      desafioId: id, respuesta: respuesta, companero: companero });
      await cargar(true);
    } catch (e) {
      alert(e.message || String(e));
      await cargar(true);
    }
  }

  // ══════════════════════════════════════════════════════════
  // Arranque — se engancha SIN tocar setupNav() de app.js
  // ══════════════════════════════════════════════════════════

  function init() {
    var btn = document.querySelector('.nav-item[data-view="desafios"]');
    if (!btn) return; // el HTML no tiene la solapa: el módulo no hace nada

    cargarYo();

    // Listener propio, adicional al de app.js. No lo reemplaza.
    btn.addEventListener("click", function () {
      cargar(true);
      arrancarPolling();
    });

    document.querySelectorAll('.nav-item:not([data-view="desafios"])').forEach(function (b) {
      b.addEventListener("click", pararPolling);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // `_test` está expuesto a propósito: permite verificar la liquidación desde
  // la consola del browser sobre datos reales, sin tocar nada.
  //   Desafios.estado.torneo = await Sheets.getAll();
  //   Desafios._test.liquidar({modo:"neto",tipo:"individual",equipoA:["Cuca"],equipoB:["Nacho"]})
  window.Desafios = {
    cargar: cargar,
    estado: S,
    _test: {
      liquidar: liquidar,
      cuentaDelDia: cuentaDelDia,
      hoyosJugados: hoyosJugados,
      jornadaDe: jornadaDe,
      jornadaVigente: jornadaVigente,
      desafiosVigentes: desafiosVigentes,
    },
  };
})();
