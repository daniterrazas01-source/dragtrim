/* carrera_nucleo.js — Race 1 vs 1: lógica pura de la carrera (programa del árbol, luces, resultado de cada carril, ganador
   con las reglas de pista y filas de la boleta). Sin pantalla: se prueba en Node (fuente/pruebas/carrera_nucleo_test.js). */
(function (root) {
  'use strict';
  const isFin = Number.isFinite;
  const SECUENCIA = {
    pro: { ambar: [[0, 0.4], [0, 0.4], [0, 0.4]], verde: 0.4 },
    full: { ambar: [[0, 0.5], [0.5, 1.0], [1.0, 1.5]], verde: 1.5 },
  };
  function programa(o) {
    const sq = SECUENCIA[o.arbol === 'full' ? 'full' : 'pro'];
    const tPre = o.t0, tStage = tPre + 1000, tArbol = tStage + 1000 + 1500 * Math.min(0.999999, Math.max(0, o.azar || 0));
    const tAmbar = sq.ambar.map(([a, b]) => [tArbol + a * 1000, tArbol + b * 1000]);
    const tVerde = tArbol + sq.verde * 1000;
    return { arbol: o.arbol === 'full' ? 'full' : 'pro', tPre, tStage, tArbol, tVerde, tAmbar, tFin: tVerde + 1200 };
  }
  function moverPrograma(p, d) {
    return Object.assign({}, p, { tPre: p.tPre + d, tStage: p.tStage + d, tArbol: p.tArbol + d, tVerde: p.tVerde + d, tFin: p.tFin + d, tAmbar: p.tAmbar.map(([a, b]) => [a + d, b + d]) });
  }
  function luces(p, t) {
    const on = t >= p.tPre && t < p.tFin;
    return { pre: on, stage: on && t >= p.tStage, ambar: p.tAmbar.map(([a, b]) => t >= a && t < b), verde: t >= p.tVerde && t < p.tFin };
  }
  function resultadoPropio(o) {
    const R = o.R;
    if (!R || !R.ok) return { ok: false, motivo: (R && R.mensaje) || 'Sin datos' };
    const rt = R.tRo - o.tVerde / 1000 - (o.ajusteMs || 0) / 1000;
    const perf = o.arbol === 'full' ? 0.5 : 0.4;
    const h = (R.hitos || []).filter((x) => x.dist_m <= o.dist + 0.01);
    const meta = h.find((x) => Math.abs(x.dist_m - o.dist) < 0.01);
    return { ok: true, rt_verde: rt, rt_boleta: rt + perf, roja: rt < 0, et: meta && isFin(meta.t) ? meta.t : NaN,
             v_kmh: meta ? (isFin(R.trampa_kmh) && Math.abs(o.dist - 402.336) < 1 ? R.trampa_kmh : meta.v_kmh) : NaN,
             hitos: h.map((x) => ({ n: x.nombre, t: x.t, v: x.v_kmh })), completo: !!R.completo, metodo: R.calidad && R.calidad.metodo };
  }
  function ganador(izq, der, opts) {
    const md = (opts && opts.margenDudoso) || 0.10;
    const valido = (r) => r && r.ok && isFin(r.et) && isFin(r.rt_verde);
    const rojo = (r) => r && r.ok && r.roja;
    let g = null, regla = '', margen = NaN, texto = '';
    if (rojo(izq) && rojo(der)) { g = izq.rt_verde < der.rt_verde ? 'der' : 'izq'; regla = 'dos_rojas'; texto = 'Las dos rojas: pierde quien salió primero. Gana carril ' + (g === 'izq' ? 'izquierdo' : 'derecho') + '.'; }
    else if (rojo(izq)) { g = 'der'; regla = 'roja'; texto = 'Carril izquierdo dio luz roja. Gana carril derecho.'; }
    else if (rojo(der)) { g = 'izq'; regla = 'roja'; texto = 'Carril derecho dio luz roja. Gana carril izquierdo.'; }
    else if (valido(izq) && valido(der)) {
      const a = izq.rt_verde + izq.et, b = der.rt_verde + der.et; margen = Math.abs(a - b);
      if (margen < 0.0005) return { ganador: null, regla: 'empate', margen, dudosa: true, texto: 'Empate.' };
      g = a < b ? 'izq' : 'der'; regla = 'tiempo';
      texto = `Gana carril ${g === 'izq' ? 'izquierdo' : 'derecho'} por ${margen.toFixed(3)} s.` + (margen < md ? ' Muy cerrada: la diferencia es menor que el margen de error de la app.' : '');
    } else if (valido(izq)) { g = 'izq'; regla = 'sin_terminar'; texto = 'Carril derecho no terminó. Gana carril izquierdo.'; }
    else if (valido(der)) { g = 'der'; regla = 'sin_terminar'; texto = 'Carril izquierdo no terminó. Gana carril derecho.'; }
    else return { ganador: null, regla: 'nadie', margen: NaN, dudosa: false, texto: 'Nadie terminó.' };
    return { ganador: g, regla, margen, dudosa: isFin(margen) && margen < md, texto };
  }
  function filasTicket(izq, der, o) {
    const perf = o.formato === 'verde' ? 0 : (o.arbol === 'full' ? 0.5 : 0.4);
    const rt = (r) => (!r ? '—' : !r.ok ? (r.motivo || '—') : (r.roja ? 'ROJA ' : '') + (o.formato === 'verde' ? (r.rt_verde > 0 ? '+' : '') + r.rt_verde.toFixed(3) : r.rt_boleta.toFixed(3)));
    const h = (r, n) => { const x = r && r.ok && (r.hitos || []).find((y) => y.n === n); return x && isFin(x.t) ? x.t.toFixed(3) : '—'; };
    const v = (r, n) => { const x = r && r.ok && (r.hitos || []).find((y) => y.n === n); const k = x && isFin(x.v) ? (o.unidad === 'mph' ? x.v / 1.609344 : x.v) : NaN; return isFin(k) ? k.toFixed(2) : '—'; };
    const f = [{ etiqueta: 'R/T', izq: rt(izq), der: rt(der), clase: 'rt' }, { etiqueta: "60'", izq: h(izq, '60 ft'), der: h(der, '60 ft') },
      { etiqueta: "330'", izq: h(izq, '330 ft'), der: h(der, '330 ft') }, { etiqueta: '1/8', izq: h(izq, '1/8 mi'), der: h(der, '1/8 mi'), clase: o.dist < 300 ? 'et' : '' },
      { etiqueta: o.unidad === 'mph' ? 'MPH' : 'KM/H', izq: v(izq, '1/8 mi'), der: v(der, '1/8 mi') }];
    if (o.dist > 300) f.push({ etiqueta: "1000'", izq: h(izq, '1000 ft'), der: h(der, '1000 ft') }, { etiqueta: '1/4', izq: h(izq, '1/4 mi'), der: h(der, '1/4 mi'), clase: 'et' },
      { etiqueta: o.unidad === 'mph' ? 'MPH' : 'KM/H', izq: v(izq, '1/4 mi'), der: v(der, '1/4 mi') });
    return f;
  }
  const api = { SECUENCIA, programa, moverPrograma, luces, resultadoPropio, ganador, filasTicket };
  root.DragCarreraNucleo = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
