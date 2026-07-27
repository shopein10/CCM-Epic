// ============================================================
// CCM & Epic Golf — MÓDULO MINI RYDER (Segunda Fecha)
// ------------------------------------------------------------
// Monchitos vs Lagartos. Por cada cuarto (2 Monchitos + 2 Lagartos)
// se juegan 5 matchs:
//   • Fourball AB vs CD  → 2 mejor bola / 1 peor bola  → Ryder: gana 2, empate 1-1
//   • 4 individuales (a-c, a-d, b-c, b-d) → 1 por hoyo  → Ryder: gana 1, empate 0,5
// En CADA match, el de menor hdc85 de ese match baja a 0 y los demás
// descuentan lo mismo (nadie queda con hándicap negativo en el match).
//
// EQUIPO POR POSICIÓN: en cada cuarto, jugadores 1 y 2 = Monchitos,
// 3 y 4 = Lagartos. Se deriva de la planilla en runtime, sin roster fijo.
//
// Es 100% de lectura: no escribe nada en la planilla. Si falla, el resto
// de la app sigue andando (está en su propio archivo, igual que Desafíos).
// ============================================================

(function () {
  "use strict";

  // Etiquetas y colores de los equipos (los colores viven en ryder.css)
  var EQUIPOS = {
    monchitos: { nombre: "Monchitos", cls: "monchitos" },
    lagartos:  { nombre: "Lagartos",  cls: "lagartos"  },
  };

  // ── Reparto de golpes de hándicap por hoyo REAL (mismo criterio que el torneo) ──
  // Un hándicap h reparte 1 golpe en los hoyos cuyo stroke index <= (h mod 18),
  // + un golpe extra en TODOS si h > 18 (y así sucesivamente). Acá h siempre es
  // >= 0 porque el ajuste "el mejor a 0" nunca deja negativos en el match.
  function repartir(h) {
    var st = new Array(18).fill(0);
    if (!h || h <= 0) return st;
    var SI = (window.CONFIG && CONFIG.STROKE_INDEX) || [];
    var base = Math.floor(h / 18);
    var resto = h % 18;
    for (var i = 0; i < 18; i++) {
      var idx = SI[i];               // dificultad 1..18 del hoyo real i
      st[i] = base + (idx && idx <= resto ? 1 : 0);
    }
    return st;
  }

  // ── Un match genérico (single si A/B tienen 1; fourball si tienen 2) ──
  // A = lado Monchitos, B = lado Lagartos. Devuelve dif = ptsA - ptsB.
  function computeMatch(A, B, det, salida) {
    var all = A.concat(B);
    // Mínimo de hdc85 SOLO de los que juegan este match (ignora nulls).
    var hs = all.map(function (n) { return det[n] ? det[n].hdc85 : null; })
                .filter(function (v) { return v != null; });
    var mn = hs.length ? Math.min.apply(null, hs) : 0;

    var strokes = {}, adj = {};
    all.forEach(function (n) {
      var h = det[n] ? det[n].hdc85 : null;
      var a = (h == null) ? 0 : Math.max(0, h - mn);
      adj[n] = (h == null) ? null : a;
      strokes[n] = repartir(a);
    });

    var neto = {};
    all.forEach(function (n) {
      var g = (det[n] && det[n].golpes) || [];
      neto[n] = g.map(function (v, i) { return v == null ? null : v - strokes[n][i]; });
    });

    var single = (A.length === 1);
    var pa = 0, pb = 0, hoyos = [];
    for (var i = 0; i < 18; i++) {
      var h = (salida - 1 + i) % 18;                 // hoyo REAL (0-based)
      var va = A.map(function (n) { return neto[n][h]; });
      var vb = B.map(function (n) { return neto[n][h]; });
      if (va.some(function (v) { return v == null; }) ||
          vb.some(function (v) { return v == null; })) {
        hoyos.push({ hoyo: h + 1, jugado: false, ga: 0, gb: 0, pa: pa, pb: pb });
        continue;
      }
      var ga = 0, gb = 0;
      if (single) {
        if (va[0] < vb[0]) ga = 1; else if (vb[0] < va[0]) gb = 1;
      } else {
        var mejorA = Math.min.apply(null, va), mejorB = Math.min.apply(null, vb);
        var peorA  = Math.max.apply(null, va), peorB  = Math.max.apply(null, vb);
        if (mejorA < mejorB) ga += 2; else if (mejorB < mejorA) gb += 2;
        if (peorA  < peorB)  ga += 1; else if (peorB  < peorA)  gb += 1;
      }
      pa += ga; pb += gb;
      hoyos.push({ hoyo: h + 1, jugado: true, ga: ga, gb: gb, pa: pa, pb: pb });
    }
    // Recortar los hoyos no jugados del FINAL; los del medio quedan como "–"
    while (hoyos.length && !hoyos[hoyos.length - 1].jugado) hoyos.pop();

    var jugados = hoyos.filter(function (h) { return h.jugado; }).length;
    return { A: A, B: B, single: single, pa: pa, pb: pb, dif: pa - pb,
             jugados: jugados, hoyos: hoyos, mn: mn, adj: adj };
  }

  // Puntos Ryder de un match según su estado actual (provisional / en vivo).
  // max = 2 (fourball) o 1 (single). Empate reparte a la mitad.
  function ryderPts(mc, max) {
    if (!mc || mc.jugados === 0) return { a: 0, b: 0, estado: "sin" };
    if (mc.dif > 0) return { a: max, b: 0, estado: "a" };
    if (mc.dif < 0) return { a: 0, b: max, estado: "b" };
    return { a: max / 2, b: max / 2, estado: "empate" };
  }

  // ── Arma TODOS los matchs de un cuarto ──────────────────────
  // roster = los 4 nombres en orden (1,2 Monchitos · 3,4 Lagartos).
  function cuartoMatches(det, salida) {
    var roster = Object.keys(det).filter(function (n) { return n !== "VACIO"; });
    if (roster.length < 4) return null;            // cuarto incompleto → se ignora
    var mon = [roster[0], roster[1]];
    var lag = [roster[2], roster[3]];

    var fourball = computeMatch(mon, lag, det, salida);
    var singles = [
      { par: "a-c", mc: computeMatch([mon[0]], [lag[0]], det, salida) },
      { par: "a-d", mc: computeMatch([mon[0]], [lag[1]], det, salida) },
      { par: "b-c", mc: computeMatch([mon[1]], [lag[0]], det, salida) },
      { par: "b-d", mc: computeMatch([mon[1]], [lag[1]], det, salida) },
    ];

    // Puntos Ryder del cuarto
    var pFour = ryderPts(fourball, 2);
    var ptsMon = pFour.a, ptsLag = pFour.b;
    singles.forEach(function (s) {
      s.pts = ryderPts(s.mc, 1);
      ptsMon += s.pts.a; ptsLag += s.pts.b;
    });

    return {
      mon: mon, lag: lag, fourball: fourball, pFour: pFour,
      singles: singles, ptsMon: ptsMon, ptsLag: ptsLag,
    };
  }

  // ── Agrega todos los cuartos con 4 jugadores ────────────────
  function computeRyder(data) {
    var cd = (data && data.cuartosDetalle) || {};
    var salidas = (data && data.salidas) || {};
    var cuartos = [];
    var totMon = 0, totLag = 0;
    // Puntos individuales de singles por jugador { nombre: {g, p, e, pts, equipo} }
    var jugMon = {}, jugLag = {};

    (window.CONFIG ? CONFIG.CUARTOS : []).forEach(function (c) {
      var det = cd[c.id];
      if (!det) return;
      var cm = cuartoMatches(det, salidas[c.id] || 1);
      if (!cm) return;
      cm.id = c.id; cm.nombre = c.nombre;
      cuartos.push(cm);
      totMon += cm.ptsMon; totLag += cm.ptsLag;

      // Acumular singles por jugador
      cm.mon.forEach(function (n) { jugMon[n] = jugMon[n] || { g: 0, p: 0, e: 0, pts: 0 }; });
      cm.lag.forEach(function (n) { jugLag[n] = jugLag[n] || { g: 0, p: 0, e: 0, pts: 0 }; });
      cm.singles.forEach(function (s) {
        var mn = s.mc.A[0], lg = s.mc.B[0];
        if (s.pts.estado === "a") { jugMon[mn].g++; jugLag[lg].p++; }
        else if (s.pts.estado === "b") { jugLag[lg].g++; jugMon[mn].p++; }
        else if (s.pts.estado === "empate") { jugMon[mn].e++; jugLag[lg].e++; }
        jugMon[mn].pts += s.pts.a; jugLag[lg].pts += s.pts.b;
      });
    });

    return { cuartos: cuartos, totMon: totMon, totLag: totLag,
             jugMon: jugMon, jugLag: jugLag };
  }

  // ════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fmtPts(n) { return (n % 1 === 0) ? String(n) : n.toFixed(1).replace(".", ","); }

  var VACIO_HTML =
    '<div class="ryd-empty"><div class="ryd-empty-ic">⛳</div>' +
    '<p>El Mini Ryder aparece acá cuando estén cargados los cuartos.</p></div>';

  // ── RYDER: marcador + diferencia + desglose por pareja de salida ──
  function renderResultado(R) {
    var el = document.getElementById("ryder-resultado");
    if (!el) return;
    if (!R.cuartos.length) { el.innerHTML = VACIO_HTML; return; }

    var totJugar = R.cuartos.length * 6;
    var difAbs = Math.abs(R.totMon - R.totLag);
    var lider = R.totMon > R.totLag ? "monchitos"
              : R.totLag > R.totMon ? "lagartos" : "empate";

    // Marcador grande = la SUMA de puntos de cada equipo
    var head =
      '<div class="ryd-score">' +
        '<div class="ryd-score-side monchitos' + (lider === "monchitos" ? " ryd-lead" : "") + '">' +
          '<div class="ryd-score-name">Monchitos</div>' +
          '<div class="ryd-score-pts">' + fmtPts(R.totMon) + '</div>' +
        '</div>' +
        '<div class="ryd-score-mid"><span class="ryd-vs">vs</span>' +
          '<span class="ryd-score-tot">de ' + totJugar + '</span></div>' +
        '<div class="ryd-score-side lagartos' + (lider === "lagartos" ? " ryd-lead" : "") + '">' +
          '<div class="ryd-score-name">Lagartos</div>' +
          '<div class="ryd-score-pts">' + fmtPts(R.totLag) + '</div>' +
        '</div>' +
      '</div>';

    // Diferencia a favor de un equipo
    var banner = (lider === "empate")
      ? '<div class="ryd-diff ryd-diff-e">Empatados</div>'
      : '<div class="ryd-diff ryd-diff-' + (lider === "monchitos" ? "m" : "l") + '">' +
          EQUIPOS[lider].nombre + ' lidera por ' + fmtPts(difAbs) + '</div>';

    // Barra de proporción (puntos ya definidos)
    var jugados = R.totMon + R.totLag;
    var pm = jugados ? (R.totMon / jugados * 100) : 50;
    var bar =
      '<div class="ryd-bar"><div class="ryd-bar-m" style="width:' + pm + '%"></div>' +
      '<div class="ryd-bar-l" style="width:' + (100 - pm) + '%"></div></div>';

    // Desglose por PAREJA de salida (los 2 de cada equipo en el cuarto)
    var filas = R.cuartos.map(function (c) {
      var lead = c.ptsMon > c.ptsLag ? "m" : c.ptsLag > c.ptsMon ? "l" : "e";
      return '<div class="ryd-pair-card">' +
        '<div class="ryd-pair-tag">' + esc(c.nombre) + '</div>' +
        '<div class="ryd-pair-row">' +
          '<div class="ryd-pair ryd-pair-m' + (lead === "m" ? " ryd-pair-win" : "") + '">' + esc(c.mon.join(" / ")) + '</div>' +
          '<div class="ryd-pair-sc"><b class="ryd-cr-m">' + fmtPts(c.ptsMon) + '</b>' +
            '<span>–</span><b class="ryd-cr-l">' + fmtPts(c.ptsLag) + '</b></div>' +
          '<div class="ryd-pair ryd-pair-l' + (lead === "l" ? " ryd-pair-win" : "") + '">' + esc(c.lag.join(" / ")) + '</div>' +
        '</div>' +
      '</div>';
    }).join("");

    el.innerHTML = head + banner + bar +
      '<div class="ryd-pairs-list"><div class="ryd-sub">Por pareja de salida</div>' + filas + '</div>' +
      '<p class="ryd-foot">Suma provisional · se actualiza con cada hoyo cargado. ' +
      'En cada match el de menor hándicap baja a 0. El detalle de los 5 matchs está en la solapa Matchs.</p>';
  }

  // ── Estado del match en FORMATO GOLF (match play) ───────────
  // perHole = puntos que se pueden ganar por hoyo (single = 1, fourball = 3),
  // sirve para saber cuándo el resultado es IRREMONTABLE.
  //   • sin jugar            → "sin jugar"
  //   • en juego, iguales    → "AS · N h"
  //   • en juego, con ventaja→ "<nombre> N UP · N h"   (single: hoyos ·  fourball: +N puntos)
  //   • irremontable         → "<nombre> X/Y"  (X arriba, Y hoyos por jugar) — partido cerrado
  //   • terminó 18 sin cerrar→ "<nombre> N UP · final"  /  "AS" (empatado)
  function golfEstado(mc, perHole, isSingle) {
    if (!mc || mc.jugados === 0) return { txt: "sin jugar", cls: "e" };

    // Buscar el hoyo donde el resultado se volvió irremontable (ventaja > lo
    // que el otro puede recuperar en los hoyos que quedan).
    var closed = null;
    for (var i = 0; i < mc.hoyos.length; i++) {
      var h = mc.hoyos[i];
      if (!h.jugado) continue;
      var rem = 18 - (i + 1);                 // hoyos por jugar tras este
      var up = Math.abs(h.pa - h.pb);
      if (rem > 0 && up > perHole * rem) { closed = { up: up, rem: rem, sign: h.pa - h.pb }; break; }
    }

    var finished = (mc.jugados === 18);
    if (closed) {
      var nmC = closed.sign > 0 ? mc.A.join("/") : mc.B.join("/");
      return { txt: esc(nmC) + " " + closed.up + "/" + closed.rem, cls: closed.sign > 0 ? "m" : "l" };
    }
    if (mc.dif === 0)
      return { txt: finished ? "AS" : "AS · " + mc.jugados + " h", cls: "e" };

    var nm = mc.dif > 0 ? mc.A.join("/") : mc.B.join("/");
    var up = Math.abs(mc.dif);
    var mark = isSingle ? (up + " UP") : ("+" + up);
    var suf = finished ? " · final" : " · " + mc.jugados + " h";
    return { txt: esc(nm) + " " + mark + suf, cls: mc.dif > 0 ? "m" : "l" };
  }

  // Grilla auditable opcional de un match (hoyo / A / B / dif)
  function gridMatch(mc) {
    if (!mc.hoyos.length) return "";
    var cell = function (v, cls) { return '<div class="rg-cell ' + (cls || "") + '">' + v + "</div>"; };
    var fH = mc.hoyos.map(function (h) { return cell(h.hoyo, "rg-hdr"); }).join("");
    var fA = mc.hoyos.map(function (h) { return cell(h.jugado ? h.ga : "–", h.jugado && h.ga > h.gb ? "rg-m" : ""); }).join("");
    var fB = mc.hoyos.map(function (h) { return cell(h.jugado ? h.gb : "–", h.jugado && h.gb > h.ga ? "rg-l" : ""); }).join("");
    var fD = mc.hoyos.map(function (h) {
      var d = h.pa - h.pb;
      return cell(d === 0 ? "=" : (d > 0 ? "+" : "−") + Math.abs(d), d > 0 ? "rg-m" : d < 0 ? "rg-l" : "");
    }).join("");
    return '<div class="rg-wrap"><div class="rg-rows">' +
      '<div class="rg-t">' + fH + '</div><div class="rg-t">' + fA + '</div>' +
      '<div class="rg-t">' + fB + '</div><div class="rg-t">' + fD + '</div>' +
      '</div></div>';
  }

  // Chip de jugador con su hándicap de match (ya ajustado)
  function chip(n, mc) {
    var a = mc.adj[n];
    return '<span class="ryd-chip">' + esc(n) +
      '<span class="ryd-chip-h">' + (a != null ? a : "–") + '</span></span>';
  }

  // ── MATCHS: por cuarto, el fourball + los 4 individuales ────
  function renderMatchsRyder(R) {
    var el = document.getElementById("ryder-matchs");
    if (!el) return;
    if (!R.cuartos.length) { el.innerHTML = VACIO_HTML; return; }

    el.innerHTML = R.cuartos.map(function (c) {
      var mon = c.mon, lag = c.lag;

      // FOURBALL
      var eF = golfEstado(c.fourball, 3, false);
      var four =
        '<div class="ryd-match ryd-four">' +
          '<div class="ryd-m-tag">Fourball · 2 mejor bola / 1 peor</div>' +
          '<div class="ryd-m-row">' +
            '<div class="ryd-m-side monchitos">' + chip(mon[0], c.fourball) + chip(mon[1], c.fourball) + '</div>' +
            '<div class="ryd-m-cen"><span class="ryd-m-pts">' + fmtPts(c.pFour.a) + '</span>' +
              '<span class="ryd-m-x">–</span><span class="ryd-m-pts">' + fmtPts(c.pFour.b) + '</span></div>' +
            '<div class="ryd-m-side lagartos ryd-m-side-r">' + chip(lag[0], c.fourball) + chip(lag[1], c.fourball) + '</div>' +
          '</div>' +
          '<div class="ryd-m-est ryd-est-' + eF.cls + '">' + eF.txt + '</div>' +
          gridMatch(c.fourball) +
        '</div>';

      // SINGLES
      var sing = c.singles.map(function (s) {
        var a = s.mc.A[0], b = s.mc.B[0];
        var e = golfEstado(s.mc, 1, true);
        return '<div class="ryd-match ryd-single">' +
          '<div class="ryd-m-row">' +
            '<div class="ryd-m-side monchitos">' + chip(a, s.mc) + '</div>' +
            '<div class="ryd-m-cen"><span class="ryd-m-pts">' + fmtPts(s.pts.a) + '</span>' +
              '<span class="ryd-m-x">–</span><span class="ryd-m-pts">' + fmtPts(s.pts.b) + '</span></div>' +
            '<div class="ryd-m-side lagartos ryd-m-side-r">' + chip(b, s.mc) + '</div>' +
          '</div>' +
          '<div class="ryd-m-est ryd-est-' + e.cls + '">' + e.txt + '</div>' +
        '</div>';
      }).join("");

      return '<div class="ryd-cuarto-card">' +
        '<div class="ryd-cuarto-hdr"><span>' + esc(c.nombre) + '</span>' +
          '<span class="ryd-cuarto-tot"><b class="ryd-t-m">' + fmtPts(c.ptsMon) + '</b> – ' +
          '<b class="ryd-t-l">' + fmtPts(c.ptsLag) + '</b></span></div>' +
        four + sing +
      '</div>';
    }).join("");
  }

  // ── EQUIPO: los dos equipos, cada jugador con lo que aporta ─
  function renderEquipo(R) {
    var el = document.getElementById("ryder-equipo");
    if (!el) return;
    if (!R.cuartos.length) { el.innerHTML = VACIO_HTML; return; }

    // Fourballs por equipo (para que el total cierre)
    var fbMon = 0, fbLag = 0;
    R.cuartos.forEach(function (c) { fbMon += c.pFour.a; fbLag += c.pFour.b; });

    function col(nombre, cls, tot, jug, fb) {
      var nombres = Object.keys(jug);
      var filas = nombres.map(function (n) {
        var j = jug[n];
        var rec = j.g + "-" + j.p + (j.e ? "-" + j.e : "");
        return '<div class="ryd-eq-row">' +
          '<span class="ryd-eq-name">' + esc(n) + '</span>' +
          '<span class="ryd-eq-rec">' + rec + '</span>' +
          '<span class="ryd-eq-pts">' + fmtPts(j.pts) + '</span>' +
        '</div>';
      }).join("");
      return '<div class="ryd-eq-col ' + cls + '">' +
        '<div class="ryd-eq-hdr">' + nombre + '<span class="ryd-eq-tot">' + fmtPts(tot) + '</span></div>' +
        '<div class="ryd-eq-sub">Individuales (G-P' + '-E)</div>' +
        filas +
        '<div class="ryd-eq-row ryd-eq-fb"><span class="ryd-eq-name">Fourballs</span>' +
          '<span class="ryd-eq-rec"></span><span class="ryd-eq-pts">' + fmtPts(fb) + '</span></div>' +
      '</div>';
    }

    el.innerHTML =
      '<div class="ryd-eq-wrap">' +
        col("Monchitos", "monchitos", R.totMon, R.jugMon, fbMon) +
        col("Lagartos", "lagartos", R.totLag, R.jugLag, fbLag) +
      '</div>' +
      '<p class="ryd-foot">G-P-E = ganados, perdidos, empatados en los 2 individuales de cada uno. ' +
      'El total del equipo suma individuales + fourballs.</p>';
  }

  // ── API pública ─────────────────────────────────────────────
  var Ryder = {
    _last: null,
    computeRyder: computeRyder,   // expuesto para tests
    render: function (data) {
      try {
        var R = computeRyder(data);
        this._last = R;
        renderResultado(R);
        renderMatchsRyder(R);
      } catch (e) {
        console.error("Ryder render error:", e);
      }
    },
  };

  window.Ryder = Ryder;
})();
