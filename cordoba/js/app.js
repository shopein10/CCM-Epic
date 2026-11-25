// ============================================================
// APP VIAJE — interfaz. Los cálculos están en calc.js.
// ============================================================
(function () {
  "use strict";

  var S = {
    data: null, M: null, view: "equipos", diaSel: null, ultimoOk: 0,
    cargando: false, fresco: false,
    carga: { dia: null, cuarto: null, hoyo: null, paso: 1, valores: {} },
    cap: { pin: null, info: null, dia: null, equipo: null, borrador: null },
    hdcDia: null, abiertos: {}
  };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtPts(n) { return n % 1 === 0 ? String(n) : String(Math.floor(n)) + "½"; }
  function hoyos(n) { return n + (n === 1 ? " hoyo" : " hoyos"); }
  function fmtVs(v) { return v === 0 ? "E" : (v > 0 ? "+" + v : String(v)); }
  function fmtIdx(v) { return v == null ? "–" : (v < 0 ? "+" + String(-v) : String(v)).replace(".", ","); }
  function fmtHdc(v) { return v == null ? "–" : (v < 0 ? "+" + (-v) : String(v)); } // plus con "+"
  function hoyISO() {
    var d = new Date(), z = function (n) { return ("0" + n).slice(-2); };
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  }
  function hhmm(t) { var d = new Date(t), z = function (n) { return ("0" + n).slice(-2); }; return z(d.getHours()) + ":" + z(d.getMinutes()); }
  var DIAS_SEM = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  function fechaCorta(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return iso || "";
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return DIAS_SEM[d.getDay()] + " " + (+m[3]) + "/" + (+m[2]);
  }

  function eq(id) { return (S.M && S.M.ix.eq[id]) || { id: id, nombre: "Equipo " + id, color: id === "A" ? "#2f6db3" : "#c0392b" }; }
  function eqDe(nombre) { var j = S.M && S.M.ix.jug[nombre]; return j ? j.equipo : null; }
  function dotEq(nombre) { var e = eqDe(nombre); return '<span class="dot" style="background:' + esc(eq(e).color) + '"></span>'; }
  function dotTee(h) { return h && h.tee ? '<span class="tee-dot" style="background:' + esc(h.color) + '" title="' + esc(h.tee) + '"></span>' : ""; }

  // ── API ────────────────────────────────────────────────────
  function timeout(ms) {
    var c = new AbortController(); setTimeout(function () { c.abort(); }, ms); return c.signal;
  }
  function apiGet(fresh) {
    var url = CONFIG.API_URL + "?action=getAll" + (fresh ? "&fresh=1&t=" + Date.now() : "");
    return fetch(url, { signal: timeout(25000) }).then(function (r) { return r.json(); })
      .then(function (d) { if (d.error) throw new Error(d.error); return d; });
  }
  function apiPost(body) {
    return fetch(CONFIG.API_URL, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body), signal: timeout(30000)
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error && /ocupado/i.test(d.error) && !body._reintento) {
        body._reintento = true;
        return new Promise(function (res) { setTimeout(res, 1500); }).then(function () { return apiPost(body); });
      }
      return d;
    });
  }

  // ── Datos ──────────────────────────────────────────────────
  function aplicar(data, desdeServidor) {
    S.data = data;
    S.M = Calc.build(data, hoyISO());
    if (S.diaSel == null) S.diaSel = S.M.diaActual;
    if (S.carga.dia == null) S.carga.dia = S.M.diaActual;
    if (S.hdcDia == null) S.hdcDia = S.M.diaActual;
    if (desdeServidor) {
      S.ultimoOk = Date.now(); S.fresco = true;
      try { localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ t: S.ultimoOk, data: data })); } catch (e) {}
    }
    render();
  }

  function cargar(fresh) {
    if (S.cargando) { if (fresh) S.otraFresca = true; return Promise.resolve(); }
    S.cargando = true; pintarEstado();
    return apiGet(fresh).then(function (d) { S.bg = true; try { aplicar(d, true); } finally { S.bg = false; } })
      .catch(function (e) {
        if (!S.data) $("#main").innerHTML = '<div class="card error">No se pudo leer la planilla (' + esc(e.message) + '). Reintento solo en unos segundos.</div>';
      })
      .then(function () {
        S.cargando = false; pintarEstado();
        if (S.otraFresca) { S.otraFresca = false; return cargar(true); }
      });
  }

  function pintarEstado() {
    var el = $("#estado"); if (!el) return;
    var t = S.ultimoOk ? hhmm(S.ultimoOk) : "–";
    var txt = S.cargando ? (S.data ? t + " · actualizando…" : "cargando…")
      : (S.fresco ? t : "sin conexión · datos de " + t);
    el.textContent = txt + " · v" + CONFIG.APP_VERSION + (S.data ? "/a" + S.data.version : "");
  }

  // ── Render general ─────────────────────────────────────────
  function render() {
    if (!S.data) return;
    $("#titulo").textContent = S.data.nombre || "Viaje";
    var av = $("#aviso");
    av.hidden = !S.data.aviso; av.textContent = S.data.aviso || "";
    $$(".nav-item").forEach(function (b) {
      var v = b.dataset.view;
      b.classList.toggle("active", v === S.view || (v === "mas" && ["capitanes", "hdc", "ayuda"].indexOf(S.view) >= 0));
    });
    var f = { equipos: vEquipos, ranking: vRanking, matchs: vMatchs, cargar: vCargar,
              mas: vMas, capitanes: vCapitanes, hdc: vHdc, ayuda: vAyuda }[S.view] || vEquipos;
    // En Cargar no se re-pinta encima de lo que se está escribiendo
    if (S.bg && S.view === "cargar" && S.carga.paso >= 3) { pintarEstado(); return; }
    if (S.bg && S.view === "capitanes" && $("#cap-form")) { pintarEstado(); return; }
    $("#main").innerHTML = f();
    if (S.view === "cargar") engancharCarga();
    if (S.view === "capitanes") engancharCap();
    pintarEstado();
  }

  function chipsDias(sel, attr) {
    return '<div class="chips">' + S.M.dias.map(function (d) {
      return '<button class="chip' + (d.dia === sel ? " on" : "") + '" data-' + attr + '="' + d.dia + '">Día ' + d.dia +
        '<small>' + esc(fechaCorta(d.prog.fecha)) + "</small></button>";
    }).join("") + "</div>";
  }

  // ── EQUIPOS ────────────────────────────────────────────────
  function estadoDia(d) {
    if (!d.cuartos.length) return "sin cuartos";
    var tot = 0, fin = 0;
    d.cuartos.forEach(function (c) {
      if (!c.res) return;
      c.res.partidos.forEach(function (p) { tot++; if (p.mc.terminado) fin++; });
    });
    if (!d.hayGolpes) return "por jugar";
    return fin === tot ? "terminado" : "en juego";
  }

  function vEquipos() {
    var A = eq("A"), B = eq("B"), M = S.M;
    var h = '<section class="card marcador">' +
      '<div class="mc-eq" style="--c:' + esc(A.color) + '"><div class="mc-nom">' + esc(A.nombre) + '</div><div class="mc-pts">' + fmtPts(M.totA) + "</div></div>" +
      '<div class="mc-mid">de ' + M.maxPts + '<br><small>gana con ' + fmtPts(M.paraGanar) + "</small></div>" +
      '<div class="mc-eq" style="--c:' + esc(B.color) + '"><div class="mc-nom">' + esc(B.nombre) + '</div><div class="mc-pts">' + fmtPts(M.totB) + "</div></div></section>";

    h += '<section class="card"><h3>Por día</h3>' + M.dias.map(function (d) {
      return '<div class="fila-dia"><div><b>Día ' + d.dia + "</b> · " + esc(fechaCorta(d.prog.fecha)) + "<br><small>" +
        esc(d.prog.cancha) + " · " + esc(d.prog.tee) + " · " + esc(estadoDia(d)) + "</small></div>" +
        '<div class="fd-pts"><span style="color:' + esc(A.color) + '">' + fmtPts(d.ptsA) + '</span> – <span style="color:' +
        esc(B.color) + '">' + fmtPts(d.ptsB) + "</span></div></div>";
    }).join("") + "</section>";

    var roster = function (id) {
      var e = eq(id);
      var js = S.data.jugadores.filter(function (j) { return j.equipo === id; });
      return '<div class="roster"><h4 style="color:' + esc(e.color) + '">' + esc(e.nombre) + "</h4>" +
        (e.capitan ? '<div class="cap">Capitán: ' + esc(e.capitan) + "</div>" : "") +
        js.map(function (j) { return "<div>" + esc(j.nombre) + ' <small>' + fmtIdx(j.index) + "</small></div>"; }).join("") + "</div>";
    };
    h += '<section class="card rosters">' + roster("A") + roster("B") + "</section>";
    return h;
  }

  // ── RANKING ────────────────────────────────────────────────
  function vRanking() {
    var R = S.M.ranking;
    if (!R.length) return '<section class="card vacio">Todavía no hay golpes cargados.</section>';
    var cols = S.M.dias.map(function (d) { return "<th>D" + d.dia + "</th>"; }).join("");
    var filas = R.map(function (f) {
      var donde;
      if (f.completo) donde = "F";
      else if (f.ultimo) donde = "D" + f.ultimo.dia + "·" + (f.ultimo.jugados === 18 ? "F" : f.ultimo.jugados);
      else donde = "–";
      var porDia = f.dias.map(function (d) {
        return '<td class="num ' + (d.jugados ? (d.vsPar < 0 ? "bajo" : d.vsPar > 0 ? "sobre" : "") : "") + '">' +
          (d.jugados ? fmtVs(d.vsPar) + (d.jugados < 18 ? "<sup>" + d.jugados + "</sup>" : "") : "") + "</td>";
      }).join("");
      return '<tr class="' + (f.incompleto ? "inc" : "") + '"><td class="pos">' + (f.empate ? "T" : "") + f.pos + "</td>" +
        '<td class="nom" data-jug="' + esc(f.nombre) + '">' + dotEq(f.nombre) + esc(f.nombre) +
        (f.incompleto ? ' <small class="tag">incompleto</small>' : "") + "</td>" +
        '<td class="num tot ' + (f.vsPar < 0 ? "bajo" : f.vsPar > 0 ? "sobre" : "") + '">' + fmtVs(f.vsPar) + "</td>" +
        '<td class="num">' + donde + "</td>" + porDia + "</tr>";
    }).join("");
    return '<section class="card"><h3>Neto medal 54 hoyos</h3><p class="nota">Neto contra el par de los hoyos jugados (hdc ' +
      (S.M.dias[0] ? S.M.dias[0].prog.pctInd : 100) + '% con el tee de cada uno). Tocá un nombre para ver sus tarjetas.</p>' +
      '<div class="tabla-wrap"><table class="rank"><thead><tr><th>#</th><th>Jugador</th><th>Neto</th><th>Hoyo</th>' + cols +
      "</tr></thead><tbody>" + filas + "</tbody></table></div></section>";
  }

  function tarjetaJugador(nombre) {
    var f = S.M.ranking.filter(function (x) { return x.nombre === nombre; })[0];
    if (!f) return;
    var html = "<h3>" + dotEq(nombre) + esc(nombre) + "</h3>" + f.dias.map(function (d) {
      var h = d.hdc;
      return '<div class="tj-dia"><div class="tj-cab"><b>Día ' + d.dia + "</b> · " + esc(S.M.ix.prog[d.dia].cancha) + " · " +
        dotTee(h) + esc(h.tee || "") + " · hdc " + fmtHdc(h.ind) + (h.topado ? " (tope)" : "") + "</div>" +
        scorecard([nombre], function () { return d.golpes; }, function () { return h; }, d.salida, h.ind, "ind") +
        '<div class="tj-tot">Gross ' + (d.jugados ? d.gross : "–") + " · neto " + (d.jugados ? fmtVs(d.vsPar) : "–") +
        (d.netoTotal != null ? " · total neto " + d.netoTotal : "") + "</div></div>";
    }).join("");
    abrirModal(html);
  }

  // Tarjeta de hoyos. getG(n) → golpes[18]; getH(n) → hdc (con si/par).
  // hdcCampo: "ind" = golpes del ranking; número por jugador vía mapa en modo match.
  function scorecard(nombres, getG, getH, salida, _x, modo, mapaHdc) {
    var orden = Calc.ordenHoyos(salida || 1);
    var h0 = getH(nombres[0]);
    var cab = '<tr><th class="sc-n">Hoyo</th>' + orden.map(function (i) { return "<th>" + (i + 1) + "</th>"; }).join("") + "<th>Tot</th></tr>";
    var par = '<tr class="sc-par"><td class="sc-n">Par</td>' + orden.map(function (i) { return "<td>" + (h0.par[i] || "") + "</td>"; }).join("") +
      "<td>" + h0.par.reduce(function (s, v) { return s + (v || 0); }, 0) + "</td></tr>";
    var filas = nombres.map(function (n) {
      var g = getG(n), h = getH(n);
      var hc = modo === "match" ? (mapaHdc[n] || 0) : (h.ind || 0);
      var st = Calc.repartir(hc, h.si);
      var tot = 0, any = false;
      var celdas = orden.map(function (i) {
        var v = g[i], dif = v == null ? null : v - (h.par[i] || 0);
        if (v != null) { tot += v; any = true; }
        var cls = dif == null ? "" : dif <= -2 ? "eagle" : dif === -1 ? "birdie" : dif === 1 ? "bogey" : dif >= 2 ? "doble" : "";
        var dots = st[i] > 0 ? '<i class="st">' + "•".repeat(st[i]) + "</i>" : st[i] < 0 ? '<i class="st give">+</i>' : "";
        return '<td class="' + cls + '">' + (v == null ? "" : v) + dots + "</td>";
      }).join("");
      return "<tr><td class=\"sc-n\">" + dotTee(h) + esc(n) + "</td>" + celdas + "<td><b>" + (any ? tot : "") + "</b></td></tr>";
    }).join("");
    return '<div class="sc-wrap"><table class="sc">' + cab + par + filas + "</table></div>";
  }

  // ── MATCHS ─────────────────────────────────────────────────
  function nomsLado(ns) { return ns.join(" / "); }

  function estadoMatch(mc, A, B) {
    var nA = eq("A").nombre, nB = eq("B").nombre;
    if (!mc.jugados) return "sin empezar";
    var lider = mc.dif > 0 ? nA : nB, d = Math.abs(mc.dif);
    if (mc.single) {
      if (mc.dif === 0) return mc.jugados === 18 ? "empatado (AS)" : "AS · " + hoyos(mc.jugados);
      if (mc.cerrado && mc.quedan > 0) return "gana " + lider + " " + d + "&" + mc.quedan;
      if (mc.jugados === 18) return "gana " + lider + " " + d + " UP";
      return lider + " " + d + " UP · " + hoyos(mc.jugados);
    }
    var txt = mc.pa + "–" + mc.pb;
    if (mc.dif === 0) return "empatado " + txt + (mc.jugados < 18 ? " · " + hoyos(mc.jugados) : "");
    if (mc.terminado) return "gana " + lider + " " + txt;
    return lider + " +" + d + " (" + txt + ") · " + hoyos(mc.jugados);
  }

  function vMatchs() {
    var d = S.M.dias.filter(function (x) { return x.dia === S.diaSel; })[0];
    var h = chipsDias(S.diaSel, "dia-match");
    if (!d) return h;
    h += '<p class="nota">' + esc(d.prog.cancha) + " · tee " + esc(d.prog.tee) + " · " + esc(d.modalidad.nombre) +
      " · hdc match " + d.prog.pctMatch + "% (el menor de cada match juega 0)</p>";
    d.avisos.forEach(function (a) { h += '<div class="card warn">' + esc(a) + "</div>"; });
    if (!d.cuartos.length) return h + '<section class="card vacio">Los capitanes todavía no armaron los cuartos de este día.</section>';
    var A = eq("A"), B = eq("B");
    h += '<div class="card tot-dia"><span style="color:' + esc(A.color) + '">' + esc(A.nombre) + " " + fmtPts(d.ptsA) +
      '</span> – <span style="color:' + esc(B.color) + '">' + fmtPts(d.ptsB) + " " + esc(B.nombre) + "</span></div>";
    h += d.cuartos.map(function (c) {
      if (!c.res) return '<section class="card">Cuarto ' + c.cuarto + ": " + esc(c.jugadores.join(", ")) + "</section>";
      var key = d.dia + "-" + c.cuarto, open = !!S.abiertos[key];
      var lado = function (ns, col) {
        return '<div class="lado" style="--c:' + esc(col) + '">' + ns.map(function (n) {
          var hh = c.ctx[n].hdc;
          return "<div>" + dotTee(hh) + esc(n) + ' <small>' + fmtHdc(c.res.partidos[0].mc.hdcMatch[n]) + "</small></div>";
        }).join("") + "</div>";
      };
      var partidos = c.res.partidos.map(function (p) {
        var cls = p.pts.estado === "a" ? "va-a" : p.pts.estado === "b" ? "va-b" : "";
        return '<div class="partido ' + cls + '"><div class="p-q">' + (p.fourball ? "Fourball <small>2 pts</small>" :
          esc(p.mc.A[0]) + " vs " + esc(p.mc.B[0])) + '</div><div class="p-e">' + esc(estadoMatch(p.mc)) +
          (p.mc.terminado ? " ✓" : "") + "</div></div>";
      }).join("");
      var det = "";
      if (open) {
        var four = c.res.partidos[0].mc;
        det = '<div class="det"><div class="nota">Golpes de match del fourball (puntitos):</div>' +
          scorecard(c.a.concat(c.b), function (n) { return c.ctx[n].golpes; }, function (n) { return c.ctx[n].hdc; },
            c.salida, null, "match", four.hdcMatch) + gridPuntos(four) + "</div>";
      }
      return '<section class="card cuarto" style="--ca:' + esc(A.color) + ';--cb:' + esc(B.color) + '">' +
        '<div class="cq-cab"><b>Cuarto ' + c.cuarto + "</b><small> · sale del " + c.salida + "</small>" +
        '<span class="cq-pts">' + fmtPts(c.res.ptsA) + " – " + fmtPts(c.res.ptsB) + "</span></div>" +
        '<div class="lados">' + lado(c.a, A.color) + '<div class="vs">vs</div>' + lado(c.b, B.color) + "</div>" +
        partidos + '<button class="btn-link" data-abrir="' + key + '">' + (open ? "Ocultar hoyo por hoyo" : "Ver hoyo por hoyo") + "</button>" +
        det + "</section>";
    }).join("");
    return h;
  }

  function gridPuntos(mc) {
    if (!mc.hoyos.length) return "";
    return '<div class="sc-wrap"><table class="sc grid"><tr><th class="sc-n">Hoyo</th>' +
      mc.hoyos.map(function (x) { return "<th>" + x.hoyo + "</th>"; }).join("") +
      '</tr><tr><td class="sc-n">' + esc(eq("A").nombre) + "</td>" + mc.hoyos.map(function (x) { return "<td>" + (x.jugado ? x.ga : "–") + "</td>"; }).join("") +
      '</tr><tr><td class="sc-n">' + esc(eq("B").nombre) + "</td>" + mc.hoyos.map(function (x) { return "<td>" + (x.jugado ? x.gb : "–") + "</td>"; }).join("") +
      '</tr><tr class="sc-par"><td class="sc-n">Dif</td>' + mc.hoyos.map(function (x) { var v = x.pa - x.pb; return "<td>" + (v > 0 ? "+" + v : v) + "</td>"; }).join("") +
      "</tr></table></div>";
  }

  // ── CARGAR ─────────────────────────────────────────────────
  function cuartoCarga() {
    var d = S.M.dias.filter(function (x) { return x.dia === S.carga.dia; })[0];
    return d && d.cuartos.filter(function (c) { return c.cuarto === S.carga.cuarto; })[0];
  }

  function vCargar() {
    var C = S.carga;
    var h = chipsDias(C.dia, "dia-carga");
    var d = S.M.dias.filter(function (x) { return x.dia === C.dia; })[0];
    if (!d || !d.cuartos.length) return h + '<section class="card vacio">Todavía no hay cuartos armados para este día.</section>';
    h += '<div class="chips">' + d.cuartos.map(function (c) {
      return '<button class="chip' + (c.cuarto === C.cuarto ? " on" : "") + '" data-cuarto="' + c.cuarto + '">Cuarto ' + c.cuarto +
        "<small>" + esc(c.jugadores.join(", ")) + "</small></button>";
    }).join("") + "</div>";
    var c = cuartoCarga();
    if (!c) return h + '<p class="nota">Elegí tu cuarto.</p>';

    if (C.paso <= 2 || C.hoyo == null) {
      h += '<section class="card"><h3>Hoyo</h3><div class="hoyos">' + Calc.ordenHoyos(c.salida).map(function (i, k) {
        var n = c.jugadores.filter(function (j) { return c.ctx[j].golpes[i] != null; }).length;
        return '<button class="hoyo' + (n === c.jugadores.length ? " lleno" : n ? " medio" : "") + (k === 0 ? " salida" : "") +
          '" data-hoyo="' + (i + 1) + '">' + (i + 1) + "</button>";
      }).join("") + '</div><p class="nota">Verde: cargado. Ámbar: a medias. El primero es el de salida.</p></section>';
      return h;
    }
    var i = C.hoyo - 1;
    if (C.paso === 3) {
      h += '<section class="card" id="cg-inputs"><h3>Hoyo ' + C.hoyo + "</h3>" + c.jugadores.map(function (n, k) {
        var hh = c.ctx[n].hdc, st = Calc.repartir(hh.ind || 0, hh.si)[i];
        var previo = c.ctx[n].golpes[i];
        var val = C.valores[n] != null ? C.valores[n] : (previo != null ? previo : "");
        return '<label class="in-fila">' + dotEq(n) + '<span class="in-nom">' + esc(n) + '<small>' + dotTee(hh) + "par " + (hh.par[i] || "?") +
          (st > 0 ? " · recibe " + st : st < 0 ? " · devuelve 1" : "") + '</small></span><input class="in-g" inputmode="numeric" pattern="[0-9]*" maxlength="2" data-n="' +
          esc(n) + '" data-k="' + k + '" value="' + esc(val) + '"></label>';
      }).join("") + '<div class="botones"><button class="btn sec" data-paso="2">‹ Hoyos</button><button class="btn" id="cg-revisar">Revisar</button></div></section>';
      return h;
    }
    // paso 4: revisar
    var pisa = false;
    h += '<section class="card"><h3>Revisar hoyo ' + C.hoyo + "</h3>" + c.jugadores.map(function (n) {
      var v = C.valores[n], previo = c.ctx[n].golpes[i];
      var cambia = previo != null && v !== "" && v != null && +v !== previo;
      if (cambia) pisa = true;
      return '<div class="rev-fila">' + dotEq(n) + esc(n) + '<b class="' + (cambia ? "pisa" : "") + '">' +
        (cambia ? previo + " → " : "") + (v === "" || v == null ? "–" : esc(v)) + "</b></div>";
    }).join("") + (pisa ? '<div class="warn">Estás cambiando golpes que ya estaban cargados.</div>' : "") +
      '<div class="botones"><button class="btn sec" data-paso="3">‹ Corregir</button><button class="btn" id="cg-enviar">Enviar</button></div></section>';
    return h;
  }

  function engancharCarga() {
    var ins = $$(".in-g");
    if (!ins.length) return;
    var C = S.carga;
    var sig = function (k) {
      leer();
      if (k + 1 < ins.length) { ins[k + 1].focus(); ins[k + 1].select(); }
      else { C.paso = 4; render(); }
    };
    ins.forEach(function (inp, k) {
      inp.addEventListener("focus", function () { inp.select(); });
      inp.addEventListener("input", function () {
        inp.value = inp.value.replace(/\D/g, "").slice(0, 2);
        var v = inp.value;
        if ((v.length === 1 && v >= "2" && v <= "9") || v.length === 2) sig(k);
      });
      inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); sig(k); } });
    });
    var primero = ins.filter(function (x) { return !x.value; })[0] || ins[0];
    setTimeout(function () { primero.focus(); primero.select(); }, 50);
  }
  function leer() {
    $$(".in-g").forEach(function (inp) { S.carga.valores[inp.dataset.n] = inp.value; });
  }

  function enviarScores(btn) {
    var C = S.carga, c = cuartoCarga();
    var scores = {}, n = 0;
    c.jugadores.forEach(function (j) { var v = C.valores[j]; if (v !== "" && v != null) { scores[j] = +v; n++; } });
    if (!n) { toast("No hay nada para enviar"); return; }
    btn.disabled = true; btn.textContent = "Enviando…";
    apiPost({ action: "guardarScores", token: CONFIG.TOKEN, dia: C.dia, hoyo: C.hoyo, scores: scores })
      .then(function (r) {
        if (!r.ok) throw new Error(r.error || "Error");
        // aplicar local para ver el cambio ya
        c.jugadores.forEach(function (j) {
          if (scores[j] == null) return;
          S.data.golpes[C.dia] = S.data.golpes[C.dia] || {};
          S.data.golpes[C.dia][j] = S.data.golpes[C.dia][j] || Calc.nul18();
          S.data.golpes[C.dia][j][C.hoyo - 1] = scores[j];
        });
        toast("Hoyo " + C.hoyo + " guardado ✓");
        var orden = Calc.ordenHoyos(c.salida), pos = orden.indexOf(C.hoyo - 1);
        C.valores = {};
        if (pos < 17) { C.hoyo = orden[pos + 1] + 1; C.paso = 3; } else { C.hoyo = null; C.paso = 2; }
        aplicar(S.data, false);
        cargar(true);
      })
      .catch(function (e) { toast("No se guardó: " + e.message, true); btn.disabled = false; btn.textContent = "Enviar"; });
  }

  // ── MÁS ────────────────────────────────────────────────────
  function vMas() {
    return '<section class="card mas">' +
      '<button class="mas-item" data-goto="capitanes"><b>Capitanes</b><small>Armar las parejas de cada día</small></button>' +
      '<button class="mas-item" data-goto="hdc"><b>Hándicaps y tees</b><small>Hdc de juego de cada uno, por día</small></button>' +
      '<button class="mas-item" data-goto="ayuda"><b>Cómo corregir cosas</b><small>Desde la planilla, sin tocar la app</small></button></section>';
  }
  function volverMas() { return '<button class="btn-link volver" data-goto="mas">‹ Más</button>'; }

  function vHdc() {
    var dia = S.hdcDia, p = S.M.ix.prog[dia];
    var h = volverMas() + chipsDias(dia, "dia-hdc");
    if (!p) return h;
    h += '<p class="nota">' + esc(p.cancha) + " · tee por defecto " + esc(p.tee) +
      (p.teeAlt && p.indexDesde != null ? " · index ≥ " + fmtIdx(p.indexDesde) + " sale de " + esc(p.teeAlt) : "") +
      (p.tope != null ? " · tope de hdc " + p.tope : "") + "</p>";
    var filas = S.data.jugadores.slice().sort(function (a, b) { return (a.index || 0) - (b.index || 0); }).map(function (j) {
      var x = S.M.hdcDia(dia, j.nombre);
      return '<tr class="' + (x.error ? "err" : "") + '"><td>' + dotEq(j.nombre) + esc(j.nombre) +
        (j.indexManual != null ? ' <small class="tag">manual</small>' : "") + "</td><td class=\"num\">" + fmtIdx(j.index) + "</td><td>" +
        dotTee(x) + esc(x.tee || "") + (x.teeMotivo && x.teeMotivo !== "defecto" ? '<br><small>' + esc(x.teeMotivo) + "</small>" : "") +
        "</td><td class=\"num\">" + fmtHdc(x.ind) + (x.topado ? '<small> (' + fmtHdc(x.chSinTope) + ")</small>" : "") +
        "</td><td class=\"num\">" + fmtHdc(x.match) + "</td></tr>" + (x.error ? '<tr class="err"><td colspan="5">⚠ ' + esc(x.error) + "</td></tr>" : "");
    }).join("");
    return h + '<section class="card"><div class="tabla-wrap"><table class="rank"><thead><tr><th>Jugador</th><th>Index</th><th>Tee</th><th>Hdc ' +
      p.pctInd + "%</th><th>Match " + p.pctMatch + "%</th></tr></thead><tbody>" + filas +
      '</tbody></table></div><p class="nota">Hdc = redondear(Index × Slope/113 + (CR − Par)) con el tee de cada uno. En el match, al menor de los que juegan se lo baja a 0 y los demás descuentan lo mismo.</p></section>';
  }

  function vAyuda() {
    return volverMas() + '<section class="card ayuda"><h3>Todo se corrige en la planilla</h3>' +
      "<p>La app recalcula sola con lo que diga la planilla. No hay que tocar la página.</p><ul>" +
      "<li><b>Index de alguien:</b> pestaña Jugadores, columna <i>index_manual</i>. Si tiene algo, gana sobre el automático.</li>" +
      "<li><b>Cambiar de equipo:</b> Jugadores, columna <i>equipo</i> (A o B).</li>" +
      "<li><b>Que alguien salga de otro tee:</b> pestaña Tees, una fila con día, jugador y tee (día vacío o * = los tres días).</li>" +
      "<li><b>Que todos los de index alto salgan de otro tee:</b> Programa, columnas <i>tee_alt</i> e <i>index_desde</i> de ese día.</li>" +
      "<li><b>Tope de hándicap:</b> Programa, columna <i>tope_hdc</i>.</li>" +
      "<li><b>Rating, slope, par o SI:</b> pestaña Canchas.</li>" +
      "<li><b>Cuartos:</b> los arman los capitanes; se pueden pisar en la pestaña Cuartos (j1 y j2 contra j3 y j4; salida 1 o 10).</li>" +
      "<li><b>Un golpe mal cargado:</b> se vuelve a cargar el hoyo desde la app, o se corrige en Golpes.</li>" +
      "<li><b>Nombre o color de un equipo, capitán y PIN:</b> pestaña Equipos.</li></ul></section>";
  }

  // ── CAPITANES ──────────────────────────────────────────────
  function vCapitanes() {
    var K = S.cap;
    if (!K.info) {
      return volverMas() + '<section class="card"><h3>Capitanes</h3><p class="nota">Entrá con el PIN de tu equipo.</p>' +
        '<input id="cap-pin" class="in-pin" inputmode="numeric" type="password" placeholder="PIN" autocomplete="off">' +
        '<div class="botones"><button class="btn" id="cap-entrar">Entrar</button></div></section>';
    }
    var equipo = K.info.admin ? (K.equipo || "A") : K.info.equipo;
    var dia = K.dia || S.M.diaActual;
    var e = eq(equipo), rival = eq(equipo === "A" ? "B" : "A");
    var h = volverMas() + '<section class="card cap-cab"><b style="color:' + esc(e.color) + '">' + esc(e.nombre) + "</b>" +
      (K.info.admin ? ' <small class="tag">admin</small>' : "") + '<button class="btn-link" id="cap-salir">Salir</button></section>';
    if (K.info.admin) h += '<div class="chips">' + ["A", "B"].map(function (id) {
      return '<button class="chip' + (id === equipo ? " on" : "") + '" data-cap-eq="' + id + '">' + esc(eq(id).nombre) + "</button>";
    }).join("") + "</div>";
    h += chipsDias(dia, "dia-cap");

    var d = S.M.dias.filter(function (x) { return x.dia === dia; })[0];
    var est = (S.data.alineaciones || {})[dia] || {};
    if (d && d.cuartos.length) {
      h += '<section class="card"><h3>Día ' + dia + ' revelado</h3>' + d.cuartos.map(function (c) {
        return '<div class="fila-dia"><b>Cuarto ' + c.cuarto + "</b><span>" + esc(nomsLado(c.a)) + " vs " + esc(nomsLado(c.b)) + "</span></div>";
      }).join("") + (K.info.admin ? '<button class="btn sec" id="cap-reabrir">Reabrir día ' + dia + "</button>" : "") + "</section>";
      return h;
    }
    var mia = (K.info.alineaciones || []).filter(function (a) { return a.dia === dia && a.equipo === equipo; })[0];
    if (!K.borrador || K.borrador.key !== equipo + dia)
      K.borrador = { key: equipo + dia, p: mia ? mia.parejas.map(function (x) { return x.slice(); }) : [["", ""], ["", ""], ["", ""]] };
    var mios = S.data.jugadores.filter(function (j) { return j.equipo === equipo; }).map(function (j) { return j.nombre; });
    var usados = {};
    K.borrador.p.forEach(function (pp) { pp.forEach(function (n) { if (n) usados[n] = (usados[n] || 0) + 1; }); });

    h += '<section class="card" id="cap-form"><div class="cap-est">Tu equipo: <b>' + (est[equipo] ? "confirmado" : mia ? "borrador" : "sin armar") +
      "</b> · " + esc(rival.nombre) + ": <b>" + (est[rival.id] ? "confirmado" : "todavía no") + "</b></div>" +
      '<p class="nota">Pareja 1 juega contra la pareja 1 del otro equipo, y así. El orden es el de salida. Lo del otro capitán no se ve hasta que confirman los dos.</p>' +
      K.borrador.p.map(function (pp, k) {
        var sel = function (j) {
          return '<select data-p="' + k + '" data-j="' + j + '"><option value="">—</option>' + mios.map(function (n) {
            return '<option' + (pp[j] === n ? " selected" : "") + (usados[n] && pp[j] !== n ? ' class="usado"' : "") + ">" + esc(n) + "</option>";
          }).join("") + "</select>";
        };
        return '<div class="pareja"><span>Pareja ' + (k + 1) + "</span>" + sel(0) + sel(1) + "</div>";
      }).join("") +
      '<div class="botones"><button class="btn sec" id="cap-guardar">Guardar borrador</button><button class="btn" id="cap-confirmar">Confirmar</button></div>' +
      '<p class="nota">Después de confirmar podés cambiarlo mientras el otro no confirme.</p></section>';
    return h;
  }

  function engancharCap() {
    var pin = $("#cap-pin");
    if (pin) {
      pin.focus();
      pin.addEventListener("keydown", function (e) { if (e.key === "Enter") $("#cap-entrar").click(); });
    }
    $$("#cap-form select").forEach(function (s) {
      s.addEventListener("change", function () {
        S.cap.borrador.p[+s.dataset.p][+s.dataset.j] = s.value;
        $("#main").innerHTML = vCapitanes(); engancharCap();
      });
    });
  }

  function capLogin(pin) {
    return apiPost({ action: "login", pin: pin }).then(function (r) {
      if (!r.ok) throw new Error(r.error || "PIN incorrecto");
      S.cap.pin = pin; S.cap.info = r; S.cap.borrador = null;
      try { localStorage.setItem("viaje-cap", pin); } catch (e) {}
      render();
    });
  }

  function capGuardar(confirmar, btn) {
    var K = S.cap, equipo = K.info.admin ? (K.equipo || "A") : K.info.equipo, dia = K.dia || S.M.diaActual;
    btn.disabled = true;
    apiPost({ action: "guardarAlineacion", pin: K.pin, equipo: equipo, dia: dia, parejas: K.borrador.p, confirmar: confirmar })
      .then(function (r) {
        if (!r.ok) throw new Error(r.error);
        K.info.alineaciones = K.info.admin ? r.alineaciones : r.alineaciones;
        toast(r.revelado ? "¡Confirmaron los dos! Cuartos armados." : confirmar ? "Confirmado ✓" : "Borrador guardado");
        return cargar(true);
      })
      .catch(function (e) { toast(e.message, true); })
      .then(function () { btn.disabled = false; render(); });
  }

  // ── Modal / toast ──────────────────────────────────────────
  function abrirModal(html) { $("#modal-body").innerHTML = html; $("#modal").hidden = false; }
  function toast(t, err) {
    var el = $("#toast"); el.textContent = t; el.className = "toast show" + (err ? " err" : "");
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.className = "toast"; }, err ? 5000 : 2200);
  }

  // ── Eventos (delegación) ───────────────────────────────────
  var confirmarReabrir = 0;
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button, [data-jug]");
    if (!t) { if (e.target.id === "modal") $("#modal").hidden = true; return; }
    var ds = t.dataset;
    if (t.classList.contains("nav-item")) { S.view = ds.view; window.scrollTo(0, 0); render(); return; }
    if (ds.goto) { S.view = ds.goto; window.scrollTo(0, 0); render(); return; }
    if (ds.jug) { tarjetaJugador(ds.jug); return; }
    if (t.id === "modal-cerrar") { $("#modal").hidden = true; return; }
    if (t.id === "btn-refresh") { cargar(true); return; }
    if (ds.diaMatch) { S.diaSel = +ds.diaMatch; render(); return; }
    if (ds.diaHdc) { S.hdcDia = +ds.diaHdc; render(); return; }
    if (ds.diaCap) { S.cap.dia = +ds.diaCap; S.cap.borrador = null; render(); return; }
    if (ds.capEq) { S.cap.equipo = ds.capEq; S.cap.borrador = null; render(); return; }
    if (ds.abrir) { S.abiertos[ds.abrir] = !S.abiertos[ds.abrir]; render(); return; }
    if (ds.diaCarga) { S.carga = { dia: +ds.diaCarga, cuarto: null, hoyo: null, paso: 1, valores: {} }; render(); return; }
    if (ds.cuarto) { S.carga.cuarto = +ds.cuarto; S.carga.hoyo = null; S.carga.paso = 2; S.carga.valores = {}; render(); return; }
    if (ds.hoyo) { S.carga.hoyo = +ds.hoyo; S.carga.paso = 3; S.carga.valores = {}; render(); return; }
    if (ds.paso) {
      if (S.carga.paso === 3) leer();
      S.carga.paso = +ds.paso; if (S.carga.paso === 2) S.carga.valores = {};
      render(); return;
    }
    if (t.id === "cg-revisar") { leer(); S.carga.paso = 4; render(); return; }
    if (t.id === "cg-enviar") { enviarScores(t); return; }
    if (t.id === "cap-entrar") {
      var p = $("#cap-pin").value.trim(); if (!p) return;
      t.disabled = true; capLogin(p).catch(function (er) { toast(er.message, true); t.disabled = false; });
      return;
    }
    if (t.id === "cap-salir") { S.cap = { pin: null, info: null, dia: null, equipo: null, borrador: null }; try { localStorage.removeItem("viaje-cap"); } catch (er) {} render(); return; }
    if (t.id === "cap-guardar") { capGuardar(false, t); return; }
    if (t.id === "cap-confirmar") { capGuardar(true, t); return; }
    if (t.id === "cap-reabrir") {
      if (Date.now() - confirmarReabrir > 4000) { confirmarReabrir = Date.now(); t.textContent = "Tocá otra vez para reabrir"; return; }
      apiPost({ action: "reabrirDia", pin: S.cap.pin, dia: S.cap.dia || S.M.diaActual }).then(function (r) {
        if (!r.ok) throw new Error(r.error); toast("Día reabierto"); return cargar(true);
      }).catch(function (er) { toast(er.message, true); });
      return;
    }
  });

  // ── Arranque ───────────────────────────────────────────────
  function init() {
    if (CONFIG.API_URL === "PENDIENTE") { $("#main").innerHTML = '<div class="card error">Falta configurar la URL del Apps Script.</div>'; return; }
    try {
      var c = JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY) || "null");
      if (c && c.data && Date.now() - c.t < CONFIG.CACHE_MAX_HORAS * 3600e3) { S.ultimoOk = c.t; aplicar(c.data, false); }
    } catch (e) {}
    cargar(false).then(function () {
      var pin = null; try { pin = localStorage.getItem("viaje-cap"); } catch (e) {}
      if (pin) capLogin(pin).catch(function () {});
    });
    setInterval(function () {
      if (document.hidden || S.view === "cargar" || S.view === "capitanes") return;
      S.fresco = false; cargar(false);
    }, CONFIG.REFRESH_MS);
    var volver = function () { if (!document.hidden && Date.now() - S.ultimoOk > 15000 && S.view !== "cargar") cargar(false); };
    document.addEventListener("visibilitychange", volver);
    window.addEventListener("pageshow", volver);
    setTimeout(function () { var sp = $("#splash"); if (sp) sp.classList.add("fuera"); }, 500);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  document.addEventListener("DOMContentLoaded", init);
})();
