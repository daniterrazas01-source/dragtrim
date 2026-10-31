// Prueba de carrera_nucleo.js (Race 1 vs 1): programa del árbol, luces, ganador con las reglas de pista, filas de la
// boleta y, de punta a punta con dragcore.js, que la reacción medida (cruce del rollout − verde) se parezca a la real.
// Uso: node carrera_nucleo_test.js   (termina con "FALLAS: 0")
const N = require('../app/src/carrera_nucleo.js');
const C = require('../app/src/dragcore.js');
let fallas = 0;
const ok = (c, m) => { console.log((c ? 'ok    ' : 'FALLA ') + m); if (!c) fallas++; };
const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ---- programa y luces
for (const arbol of ['pro', 'full']) {
  for (const azar of [0, 0.999]) {
    const p = N.programa({ arbol, t0: 1000, azar });
    const espera = 1000 + 1500 * azar, verde = arbol === 'pro' ? 400 : 1500;
    ok(p.tPre === 1000 && p.tStage === 2000 && cerca(p.tArbol, 2000 + espera, 1e-6) && cerca(p.tVerde, p.tArbol + verde) && cerca(p.tFin, p.tVerde + 1200),
      `${arbol} azar ${azar}: pre-stage, stage +1 s, árbol +${(espera / 1000).toFixed(2)} s, verde +${verde / 1000} s`);
    const a = p.tAmbar.map(([i, f]) => [i - p.tArbol, f - p.tArbol]);
    ok(JSON.stringify(a) === JSON.stringify(arbol === 'pro' ? [[0, 400], [0, 400], [0, 400]] : [[0, 500], [500, 1000], [1000, 1500]]), `${arbol}: ámbares como Práctica ${JSON.stringify(a)}`);
  }
}
const p = N.programa({ arbol: 'full', t0: 0, azar: 0.5 });
const L = (t) => N.luces(p, t);
ok(!L(-1).pre && L(0).pre && !L(0).stage && L(1000).stage && !L(1000).ambar[0], 'luces: nada antes, pre-stage en t0, stage a 1 s');
ok(L(p.tArbol).ambar.join() === 'true,false,false' && L(p.tArbol + 600).ambar.join() === 'false,true,false' && L(p.tArbol + 1100).ambar.join() === 'false,false,true',
  'luces Full: los ámbares bajan uno por uno');
ok(!L(p.tVerde - 1).verde && L(p.tVerde).verde && L(p.tVerde).ambar.every((x) => !x) && L(p.tVerde).pre, 'luces: verde sin ámbar, pre y stage siguen');
ok(!L(p.tFin).verde && !L(p.tFin).pre, 'luces: todo se apaga en tFin');
const m = N.moverPrograma(p, 250);
ok(m.tPre === 250 && m.tVerde === p.tVerde + 250 && m.tAmbar[2][0] === p.tAmbar[2][0] + 250 && p.tPre === 0, 'moverPrograma corre todos los tiempos y no toca el original');

// ---- ganador (reglas de pista)
const r = (rt, et, extra) => Object.assign({ ok: true, rt_verde: rt, rt_boleta: rt + 0.4, roja: rt < 0, et, v_kmh: 150, hitos: [], completo: true }, extra || {});
const casos = [
  ['limpias: gana quien llega primero (reacción + ET)', r(0.10, 8.0), r(0.20, 7.95), 'izq'],
  ['roja pierde aunque llegue antes', r(-0.01, 7.0), r(0.30, 9.0), 'der'],
  ['dos rojas: pierde quien salió primero', r(-0.05, 8.0), r(-0.01, 8.5), 'der'],
  ['el que no terminó pierde', r(0.1, NaN), r(0.3, 9.0), 'der'],
  ['sin datos de un carril (ok:false) pierde', { ok: false, motivo: 'No salió' }, r(0.3, 9.0), 'der'],
  ['nadie terminó: sin ganador', r(0.1, NaN), { ok: false, motivo: 'No salió' }, null],
  ['empate exacto', r(0.1, 8.0), r(0.1, 8.0), null],
];
for (const [nombre, izq, der, esperado] of casos) {
  const g = N.ganador(izq, der);
  ok(g && g.ganador === esperado && typeof g.texto === 'string' && g.texto.length > 3, `ganador: ${nombre} → ${g && g.ganador} ("${g && g.texto}")`);
}
const cerrada = N.ganador(r(0.10, 8.00), r(0.10, 8.05));
ok(cerrada.ganador === 'izq' && cerrada.dudosa && /cerrada/i.test(cerrada.texto) && cerca(cerrada.margen, 0.05, 1e-9), `ganador: diferencia de 0.05 s = "muy cerrada" ("${cerrada.texto}")`);
const clara = N.ganador(r(0.10, 8.00), r(0.10, 8.30));
ok(!clara.dudosa && /0\.300/.test(clara.texto), `ganador: margen claro con 3 decimales ("${clara.texto}")`);

// ---- filas de la boleta
const conHitos = (rt, f) => r(rt, f * 8, { hitos: [['60 ft', 1.6], ['330 ft', 4.5], ['1/8 mi', 7.0], ['1000 ft', 9.0], ['1/4 mi', 11.0]].map(([n, t]) => ({ n, t: t * f, v: 100 * f })) });
const f14 = N.filasTicket(conHitos(0.1, 1), conHitos(0.2, 1.1), { dist: 402.336, formato: 'boleta', unidad: 'kmh' });
ok(f14.map((x) => x.etiqueta).join('|') === "R/T|60'|330'|1/8|KM/H|1000'|1/4|KM/H" && f14[0].izq === '0.500', `boleta 1/4: ${f14.map((x) => x.etiqueta).join(' ')}; R/T boleta ${f14[0].izq}`);
const f18 = N.filasTicket(conHitos(-0.02, 1), null, { dist: 201.168, formato: 'verde', unidad: 'mph' });
ok(f18.length === 5 && /ROJA/.test(f18[0].izq) && /-0\.020/.test(f18[0].izq) && f18[0].der === '—' && f18[4].etiqueta === 'MPH', `boleta 1/8 desde la verde, roja y carril vacío: ${f18[0].izq} / ${f18[0].der}`);

// ---- de punta a punta: sesiones simuladas, verde puesta para una reacción conocida
const errores = [], malas = [];
for (let n = 0; n < 60; n++) {
  const s = C.simularSesion({ gps_hz: 1, lag_gps: 0.3, acc_hz: 60, seed: 7000 + n });
  const rt = -0.05 + 0.35 * ((n * 37) % 60) / 60;
  const tVerde = (s.verdad.t_ro_abs - rt) * 1000;
  const det = new C.DetectorVivo({}); let arr = null;
  s.gps.t.forEach((t, i) => { for (const e of det.feed(t, s.gps.v[i])) if (e.tipo === 'arranque') arr = e; });
  const R = C.procesar(s.gps, s.acc, { distancia_final: 402.336, rollout_ft: 1, t_inicio_busqueda: arr ? arr.tBajo - 0.5 : -Infinity });
  const res = N.resultadoPropio({ R, tVerde, tUltimoAmbar: tVerde - 400, ajusteMs: 0, arbol: 'pro', dist: 402.336 });
  if (!res.ok) { malas.push('sin resultado'); continue; }
  errores.push(res.rt_verde - rt);
  if ((rt < 0) !== res.roja && Math.abs(rt) > 0.03) malas.push(`roja mal: r=${rt.toFixed(3)} medida ${res.rt_verde.toFixed(3)}`);
}
const abs = errores.map(Math.abs).sort((a, b) => a - b);
const prom = errores.reduce((a, b) => a + b, 0) / errores.length;
console.log(`      reacción medida − real en ${errores.length} sesiones: promedio ${(prom * 1000).toFixed(1)} ms, mediana |error| ${(abs[abs.length >> 1] * 1000).toFixed(1)} ms, peor ${(abs[abs.length - 1] * 1000).toFixed(1)} ms`);
ok(errores.length >= 58 && abs[abs.length >> 1] < 0.030, 'de punta a punta: la reacción medida queda a menos de 30 ms (mediana) de la real');
ok(malas.length === 0, `de punta a punta: rojas bien clasificadas lejos de cero (${malas.join('; ') || 'sin errores'})`);

console.log(`\nFALLAS: ${fallas}`);
process.exit(fallas ? 1 : 0);
