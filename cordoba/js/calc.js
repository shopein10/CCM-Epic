// ============================================================
// APP VIAJE — cálculos (sin DOM). Todo sale de lo que diga la planilla.
// Se puede probar en Node: module.exports = Calc.
// ============================================================
(function (root) {
  "use strict";

  var HOYOS = 18;

  function nul18() { var a = []; for (var i = 0; i < HOYOS; i++) a.push(null); return a; }
  function suma(a) { return a.reduce(function (s, v) { return s + (v || 0); }, 0); }
  function redondear(x) { var r = Math.round(x); return r === 0 ? 0 : r; } // sin "-0"

  // ── Índices de búsqueda ────────────────────────────────────
  function indexar(data) {
    var ix = { jug: {}, eq: {}, prog: {}, tee: {} };
    (data.jugadores || []).forEach(function (j) { ix.jug[j.nombre] = j; });
    (data.equipos || []).forEach(function (e) { ix.eq[e.id] = e; });
    (data.programa || []).forEach(function (p) { ix.prog[p.dia] = p; });
    (data.canchas || []).forEach(function (c) { ix.tee[norm(c.cancha) + "|" + norm(c.tee)] = c; });
    return ix;
  }
  function norm(s) { return String(s || "").trim().toLowerCase(); }

  function teeData(ix, cancha, tee) { return ix.tee[norm(cancha) + "|" + norm(tee)] || null; }

  // ── De qué tee sale un jugador un día ──────────────────────
  // 1) fila en Tees para ese día · 2) fila en Tees con día "*" (los 3 días)
  // 3) regla del Programa: index >= index_desde → tee_alt · 4) tee por defecto
  function teeDe(data, ix, dia, nombre) {
    var p = ix.prog[dia];
    if (!p) return { tee: null, motivo: "sin programa" };
    var esp = null, todos = null;
    (data.tees || []).forEach(function (t) {
      if (t.jugador !== nombre) return;
      if (t.dia === dia) esp = t.tee;
      else if (t.dia === "*") todos = t.tee;
    });
    var j = ix.jug[nombre];
    var cand = [];
    if (esp) cand.push({ tee: esp, motivo: "excepción del día" });
    if (todos) cand.push({ tee: todos, motivo: "excepción (todos los días)" });
    if (p.teeAlt && p.indexDesde != null && j && j.index != null && j.index >= p.indexDesde)
      cand.push({ tee: p.teeAlt, motivo: "index ≥ " + fmtIdx(p.indexDesde) });
    cand.push({ tee: p.tee, motivo: "defecto" });
    var faltan = [];
    for (var i = 0; i < cand.length; i++) {
      if (teeData(ix, p.cancha, cand[i].tee)) {
        if (faltan.length) cand[i].error = "El tee " + faltan.join(", ") + " no está en Canchas para " + p.cancha;
        return cand[i];
      }
      faltan.push(cand[i].tee);
    }
    return { tee: p.tee, motivo: "defecto", error: "No existe el tee " + p.tee + " de " + p.cancha + " en Canchas" };
  }

  function fmtIdx(v) { return v == null ? "–" : String(v).replace(".", ","); }

  // ── Hándicap de juego del día (WHS) ────────────────────────
  // CH = redondear(Index × Slope/113 + (CR − Par)) con el tee de CADA jugador.
  // Si el Programa tiene tope_hdc, el CH no pasa de ese tope.
  function hdcDia(data, ix, dia, nombre) {
    var p = ix.prog[dia], j = ix.jug[nombre];
    var t = teeDe(data, ix, dia, nombre);
    var td = p ? teeData(ix, p.cancha, t.tee) : null;
    var r = { nombre: nombre, dia: dia, tee: t.tee, teeMotivo: t.motivo, error: t.error || null,
              color: td ? td.color : "#888", index: j ? j.index : null,
              ch: null, chSinTope: null, topado: false, ind: null, match: null,
              si: td ? td.si : nul18(), par: td ? td.par : nul18() };
    if (!j) { r.error = "No está en Jugadores"; return r; }
    if (!td) { r.error = r.error || "Falta el tee en Canchas"; return r; }
    if (j.index == null) { r.error = "Sin index"; return r; }
    var par = suma(td.par);
    var ch = redondear(j.index * td.slope / 113 + (td.cr - par));
    r.chSinTope = ch;
    if (p.tope != null && ch > p.tope) { ch = p.tope; r.topado = true; }
    r.ch = ch;
    r.ind = redondear(ch * p.pctInd / 100);
    r.match = redondear(ch * p.pctMatch / 100);
    return r;
  }

  // ── Reparto de golpes por hoyo según el SI del tee ─────────
  // h > 0: recibe en los SI más difíciles. h < 0 (plus): devuelve en los más fáciles.
  function repartir(h, si) {
    var st = [];
    for (var i = 0; i < HOYOS; i++) st.push(0);
    if (!h) return st;
    var n = Math.abs(h), base = Math.floor(n / HOYOS), resto = n % HOYOS;
    for (var k = 0; k < HOYOS; k++) {
      var s = si[k] || 0, extra;
      if (h > 0) extra = (s >= 1 && s <= resto) ? 1 : 0;
      else extra = (s > HOYOS - resto) ? 1 : 0;
      st[k] = (h > 0 ? 1 : -1) * (base + extra);
    }
    return st;
  }

  // Orden de juego según la salida (1 o 10). Devuelve índices 0-based.
  function ordenHoyos(salida) {
    var o = [];
    for (var i = 0; i < HOYOS; i++) o.push((salida - 1 + i) % HOYOS);
    return o;
  }

  function golpesDe(data, dia, nombre) {
    var g = data.golpes && data.golpes[dia] && data.golpes[dia][nombre];
    return g ? g.slice() : nul18();
  }

  // ── Un match (single 1v1 o fourball 2v2) ───────────────────
  // ctx[nombre] = { golpes[18], si[18], match (hdc 85%) }
  // Hdc del match: el menor de los que juegan baja a 0 y los demás descuentan lo mismo.
  // Fourball: 2 pts a la mejor bola + 1 a la peor, por hoyo. Single: 1 por hoyo ganado.
  function match(A, B, ctx, salida) {
    var todos = A.concat(B);
    var hs = todos.map(function (n) { return ctx[n] ? ctx[n].match : null; })
                  .filter(function (v) { return v != null; });
    var mn = hs.length ? Math.min.apply(null, hs) : 0;
    var adj = {}, neto = {};
    todos.forEach(function (n) {
      var c = ctx[n] || { golpes: nul18(), si: nul18(), match: null };
      adj[n] = c.match == null ? 0 : Math.max(0, c.match - mn);
      var st = repartir(adj[n], c.si);
      neto[n] = c.golpes.map(function (v, i) { return v == null ? null : v - st[i]; });
      adj[n + "__st"] = st;
    });
    var single = A.length === 1;
    var maxH = single ? 1 : 3;
    var pa = 0, pb = 0, hoyos = [], jugados = 0;
    ordenHoyos(salida || 1).forEach(function (h) {
      var va = A.map(function (n) { return neto[n][h]; });
      var vb = B.map(function (n) { return neto[n][h]; });
      if (va.concat(vb).some(function (v) { return v == null; })) {
        hoyos.push({ hoyo: h + 1, jugado: false, pa: pa, pb: pb });
        return;
      }
      var ga = 0, gb = 0;
      if (single) {
        if (va[0] < vb[0]) ga = 1; else if (vb[0] < va[0]) gb = 1;
      } else {
        var ma = Math.min.apply(null, va), mb = Math.min.apply(null, vb);
        var pA = Math.max.apply(null, va), pB = Math.max.apply(null, vb);
        if (ma < mb) ga += 2; else if (mb < ma) gb += 2;
        if (pA < pB) ga += 1; else if (pB < pA) gb += 1;
      }
      pa += ga; pb += gb; jugados++;
      hoyos.push({ hoyo: h + 1, jugado: true, ga: ga, gb: gb, pa: pa, pb: pb });
    });
    while (hoyos.length && !hoyos[hoyos.length - 1].jugado) hoyos.pop();
    var dif = pa - pb, quedan = HOYOS - jugados;
    var cerrado = jugados > 0 && Math.abs(dif) > quedan * maxH;
    var golpesAdj = {};
    todos.forEach(function (n) { golpesAdj[n] = adj[n]; });
    return { A: A, B: B, single: single, pa: pa, pb: pb, dif: dif, jugados: jugados,
             quedan: quedan, cerrado: cerrado, terminado: jugados === HOYOS || cerrado,
             hoyos: hoyos, min: mn, hdcMatch: golpesAdj, maxH: maxH };
  }

  // ── Modalidades: cómo un cuarto se convierte en puntos de equipo ──
  // Agregar una modalidad = agregar una entrada acá y su nombre en la
  // validación de la columna "modalidad" del Programa. Nada más.
  function ptsMatch(mc, max) {
    if (!mc || mc.jugados === 0) return { a: 0, b: 0, estado: "sin" };
    if (mc.dif > 0) return { a: max, b: 0, estado: "a" };
    if (mc.dif < 0) return { a: 0, b: max, estado: "b" };
    return { a: max / 2, b: max / 2, estado: "empate" };
  }

  var MODALIDADES = {
    ryder: {
      nombre: "Ryder (fourball 2 pts + 4 individuales de 1)",
      ptsPorCuarto: 6,
      cuarto: function (a, b, ctx, salida) {
        var four = match(a, b, ctx, salida);
        var singles = [[0, 0], [0, 1], [1, 0], [1, 1]].map(function (x) {
          var mc = match([a[x[0]]], [b[x[1]]], ctx, salida);
          return { mc: mc, pts: ptsMatch(mc, 1), vale: 1 };
        });
        var partidos = [{ mc: four, pts: ptsMatch(four, 2), vale: 2, fourball: true }].concat(singles);
        var ptsA = 0, ptsB = 0;
        partidos.forEach(function (p) { ptsA += p.pts.a; ptsB += p.pts.b; });
        return { partidos: partidos, ptsA: ptsA, ptsB: ptsB };
      }
    }
  };

  // ── Arma un día completo ───────────────────────────────────
  function armarDia(data, ix, dia) {
    var p = ix.prog[dia];
    var mod = MODALIDADES[(p && p.modalidad) || "ryder"] || MODALIDADES.ryder;
    var cuartos = (data.cuartos || []).filter(function (c) { return c.dia === dia; });
    var out = { dia: dia, prog: p, modalidad: mod, cuartos: [], ptsA: 0, ptsB: 0,
                maxPts: 0, hayGolpes: false, avisos: [] };
    cuartos.forEach(function (c) {
      var js = c.jugadores;
      var ctx = {};
      js.forEach(function (n) {
        var h = hdcDia(data, ix, dia, n);
        ctx[n] = { golpes: golpesDe(data, dia, n), si: h.si, par: h.par, match: h.match, hdc: h };
        if (ctx[n].golpes.some(function (v) { return v != null; })) out.hayGolpes = true;
      });
      // lados por equipo (no por posición): A = equipo A, B = equipo B
      var a = js.filter(function (n) { return ix.jug[n] && ix.jug[n].equipo === "A"; });
      var b = js.filter(function (n) { return ix.jug[n] && ix.jug[n].equipo === "B"; });
      var ok = a.length === 2 && b.length === 2;
      if (!ok) { a = js.slice(0, 2); b = js.slice(2, 4); }
      var cq = { dia: dia, cuarto: c.cuarto, salida: c.salida, jugadores: js, a: a, b: b,
                 ctx: ctx, aviso: null, res: null };
      if (js.length !== 4) cq.aviso = "El cuarto " + c.cuarto + " no tiene 4 jugadores";
      else if (!ok) cq.aviso = "El cuarto " + c.cuarto + " no es 2 contra 2 por equipo (se usó el orden 1-2 vs 3-4)";
      if (js.length === 4) {
        cq.res = mod.cuarto(a, b, ctx, c.salida);
        out.ptsA += cq.res.ptsA; out.ptsB += cq.res.ptsB;
        out.maxPts += mod.ptsPorCuarto;
      }
      if (cq.aviso) out.avisos.push(cq.aviso);
      out.cuartos.push(cq);
    });
    if (!out.maxPts && p) out.maxPts = mod.ptsPorCuarto * 3; // previsto: 3 cuartos
    return out;
  }

  // ── Ranking individual: neto medal 54 hoyos ────────────────
  function ranking(data, ix, dias) {
    var ultimoActivo = 0;
    dias.forEach(function (d) {
      var g = data.golpes && data.golpes[d.dia];
      if (g && Object.keys(g).some(function (n) { return g[n].some(function (v) { return v != null; }); }))
        ultimoActivo = Math.max(ultimoActivo, d.dia);
    });
    var salidaDe = {};
    (data.cuartos || []).forEach(function (c) {
      c.jugadores.forEach(function (n) { salidaDe[c.dia + "|" + n] = c.salida; });
    });

    var filas = (data.jugadores || []).map(function (j) {
      var f = { nombre: j.nombre, equipo: j.equipo, vsPar: 0, gross: 0, neto: 0, hoyos: 0,
                dias: [], incompleto: false, completo: true, ultimo: null };
      dias.forEach(function (d) {
        var h = hdcDia(data, ix, d.dia, j.nombre);
        var g = golpesDe(data, d.dia, j.nombre);
        var st = repartir(h.ind || 0, h.si);
        var jug = 0, gross = 0, vs = 0;
        var netoHoyo = nul18();
        for (var i = 0; i < HOYOS; i++) {
          if (g[i] == null) continue;
          jug++; gross += g[i];
          netoHoyo[i] = g[i] - st[i];
          vs += netoHoyo[i] - (h.par[i] || 0);
        }
        var dd = { dia: d.dia, hdc: h, golpes: g, neto: netoHoyo, jugados: jug, gross: gross,
                   vsPar: vs, netoTotal: jug === HOYOS ? gross - (h.ind || 0) : null,
                   salida: salidaDe[d.dia + "|" + j.nombre] || 1 };
        f.dias.push(dd);
        f.vsPar += vs; f.gross += gross; f.hoyos += jug;
        if (jug > 0) f.ultimo = dd;
        if (jug < HOYOS) f.completo = false;
        if (jug < HOYOS && d.dia < ultimoActivo) f.incompleto = true;
      });
      f.neto = f.completo ? f.dias.reduce(function (s, d) { return s + d.netoTotal; }, 0) : null;
      f.desempate = desempate(f);
      return f;
    }).filter(function (f) { return f.hoyos > 0; });

    filas.sort(function (x, y) {
      if (x.incompleto !== y.incompleto) return x.incompleto ? 1 : -1;
      if (x.vsPar !== y.vsPar) return x.vsPar - y.vsPar;
      for (var k = 0; k < x.desempate.length; k++)
        if (x.desempate[k] !== y.desempate[k]) return x.desempate[k] - y.desempate[k];
      return x.nombre.localeCompare(y.nombre);
    });
    // posiciones estilo golf (T2, T2…) por total y estado
    filas.forEach(function (f, i) {
      var prev = filas[i - 1];
      if (prev && prev.vsPar === f.vsPar && prev.incompleto === f.incompleto) f.pos = prev.pos;
      else f.pos = i + 1;
    });
    filas.forEach(function (f) {
      f.empate = filas.filter(function (o) { return o !== f && o.pos === f.pos; }).length > 0;
    });
    return filas;
  }

  // Desempate (a confirmar): neto del último día, después últimos 9, 6, 3 y 1
  // hoyos del último día, en orden de juego (respeta la salida por el 10).
  function desempate(f) {
    var d = null;
    for (var i = f.dias.length - 1; i >= 0; i--) if (f.dias[i].jugados > 0) { d = f.dias[i]; break; }
    if (!d) return [0, 0, 0, 0, 0];
    var orden = ordenHoyos(d.salida);
    var vs = function (desde) {
      var s = 0;
      for (var k = desde; k < HOYOS; k++) {
        var h = orden[k];
        if (d.neto[h] != null) s += d.neto[h] - (d.hdc.par[h] || 0);
      }
      return s;
    };
    return [vs(0), vs(9), vs(12), vs(15), vs(17)];
  }

  // ── Día "actual" ───────────────────────────────────────────
  function diaActual(data, hoyISO) {
    var prog = data.programa || [];
    if (!prog.length) return null;
    if (data.diaForzado && prog.some(function (p) { return p.dia === data.diaForzado; })) return data.diaForzado;
    for (var i = 0; i < prog.length; i++) if (prog[i].fecha === hoyISO) return prog[i].dia;
    if (hoyISO < prog[0].fecha) return prog[0].dia;
    return prog[prog.length - 1].dia;
  }

  // ── Todo junto ─────────────────────────────────────────────
  function build(data, hoyISO) {
    var ix = indexar(data);
    var dias = (data.programa || []).map(function (p) { return armarDia(data, ix, p.dia); });
    var totA = 0, totB = 0, max = 0;
    dias.forEach(function (d) { totA += d.ptsA; totB += d.ptsB; max += d.maxPts; });
    return {
      ix: ix, dias: dias, totA: totA, totB: totB, maxPts: max,
      paraGanar: max / 2 + 0.5,
      ranking: ranking(data, ix, dias),
      diaActual: diaActual(data, hoyISO),
      hdcDia: function (dia, n) { return hdcDia(data, ix, dia, n); }
    };
  }

  var Calc = { build: build, repartir: repartir, match: match, hdcDia: hdcDia, teeDe: teeDe,
               indexar: indexar, ordenHoyos: ordenHoyos, MODALIDADES: MODALIDADES, nul18: nul18 };
  if (typeof module !== "undefined" && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(this);
