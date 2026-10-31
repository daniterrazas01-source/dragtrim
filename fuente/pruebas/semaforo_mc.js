// semaforo_mc.js — Monte Carlo de la lectura del semáforo con cuadros simulados (semaforo_sim.js → Semaforo.analizar)
// Criterios: archivo/ideas/semaforo_real/plan.md §6. Errores contra la verdad en el reloj de la cámara (verdad.en_camara).
// Uso: node semaforo_mc.js [rapido|completo] [semilla] [--base archivo]     (rapido: 12 corridas por celda; completo: 60)
//      node semaforo_mc.js detalle <fps> <condición> <pro|full> [corridas, p. ej. 0-11 o 3,7] [roja|handicap]
//      (una línea por corrida, con las mismas semillas que la celda del Monte Carlo)
// Sale con código 1 si algún criterio del plan no se cumple. Con --base (p. ej. archivo/ideas/semaforo_real/resultados_mc.txt,
// la salida guardada de la última versión aceptada) solo cuentan los retrocesos contra esa salida: varios criterios del plan
// todavía no se cumplen (PWM, 30 fps, sol) y así una prueba sirve para saber si un cambio empeoró algo.
'use strict';
const P = __dirname + '/../app/src/';
const S = require(P + 'semaforo.js'), Sim = require(P + 'semaforo_sim.js');

const iBase = process.argv.indexOf('--base'), BASE = iBase > 0 ? process.argv[iBase + 1] : null;
const argv = process.argv.filter((_, i) => iBase < 0 || (i !== iBase && i !== iBase + 1));
const modo = argv[2] || 'rapido', N = modo === 'completo' ? 60 : 12, SEM = +((modo === 'detalle' ? process.env.SEMILLA : argv[3]) || 1000);
const CONDS = ['dia', 'sombra', 'noche', 'inc40', 'pwm400', 'pwm1000', 'sol'];

function stats(a) {
  if (!a.length) return { n: 0, m: NaN, s: NaN, p95: NaN };
  const m = a.reduce((x, y) => x + y, 0) / a.length, s = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
  const ab = a.map(Math.abs).sort((x, y) => x - y);
  return { n: a.length, m, s, p95: ab[Math.min(ab.length - 1, Math.floor(0.95 * ab.length))] };
}
const f1 = (x) => (isFinite(x) ? x.toFixed(1) : '—').padStart(6);

// una corrida simulada → errores (ms) y banderas
function corrida(cond, fps, tipo, i, extra) {
  const seed = SEM + i * 7919 + fps * 13 + (tipo === 'full' ? 1 : 0) + CONDS.indexOf(cond) * 101;
  const carril = i % 2 ? 'der' : 'izq';
  const rt = extra && isFinite(extra.rt_s) ? extra.rt_s : 0.03 + 0.45 * ((seed * 0.6180339887) % 1);
  const o = Object.assign({}, Sim.condicion(cond), { tipo, carril, fps, rt_s: rt, seed, rot: i % 4 === 3 ? 90 : 0 }, (extra && extra.escena) || {});
  const r = Sim.simular(o), v = r.verdad, ec = v.en_camara;
  const tRo = ec.t_stage_off + v.k1.delta_s;          // el acelerómetro "perfecto" en su propio reloj
  const A = S.analizar(r.cuadros, { carril, arbol: 'auto', tRo, giro: r.giro, hora_quieto: v.hora_quieto });
  const s = A.sec || {}, R = A.rt || {};
  const out = { ok: !!s.ok, tipo_ok: s.tipo === tipo, ms: A.ms, roja_v: !!v.roja, roja: !!R.roja, ev: [], stg: NaN, rt: NaN, otro: false,
                carril, rot: o.rot, rt_s: rt, motivo: A.motivo || s.motivo || null, avisos: s.avisos || [], metodo: R.metodo, nivel: R.nivel,
                tipo_det: s.tipo, delta_s: s.delta_s, verde_v: v.verde_visible, dudosa: (s.avisos || []).includes('verde_dudosa') };
  if (!s.ok) return out;
  out.ev.push((s.t_ambar_ref - ec.t_ambar_ref) * 1e3);
  if (isFinite(s.t_verde_vista) && isFinite(ec.t_verde)) out.ev.push((s.t_verde_vista - ec.t_verde) * 1e3);
  if (isFinite(s.t_stage_off)) out.stg = (s.t_stage_off - ec.t_stage_off) * 1e3;
  if (R.ok && !v.roja) out.rt = (R.rt_boleta - (ec.t_stage_off - ec.t_ambar_ref)) * 1e3;
  // ¿leyó la otra columna? (handicap: la secuencia del otro carril va desfasada)
  if (v.otro && isFinite(v.otro.desfase_s) && Math.abs(out.ev[0]) > 50 && Math.abs(out.ev[0] - v.otro.desfase_s * 1e3) < 50) out.otro = true;
  return out;
}

if (modo === 'detalle') {
  const fps = +argv[3], cond = argv[4], tipo = argv[5], sel = argv[6] || '0-11', caso = argv[7] || '';
  const ids = []; for (const p of sel.split(',')) { const [a, b] = p.split('-').map(Number); for (let i = a; i <= (isFinite(b) ? b : a); i++) ids.push(i); }
  for (const i0 of ids) {
    // mismas corridas que el Monte Carlo: rojas = 500+i, handicap = 700+i, normales = i
    const i = caso === 'roja' ? 500 + i0 : caso === 'handicap' ? 700 + i0 : i0;
    const extra = caso === 'roja' ? { rt_s: -(0.02 + 0.28 * ((i0 * 0.618) % 1)) }
      : caso === 'handicap' ? { escena: { otro: { desfase_s: 0.1 + 1.4 * ((i0 * 0.618) % 1), presente: true } } } : null;
    const r = corrida(cond, fps, tipo, i, extra);
    console.log(`${String(i0).padStart(3)} ${r.carril} rot${String(r.rot).padEnd(3)} rt ${r.rt_s.toFixed(3)} ${r.ok ? 'lee' : 'NO '} ${(r.tipo_det || '-').padEnd(4)}` +
      ` ámbar ${f1(r.ev[0])} verde ${f1(r.ev[1])} stage ${f1(r.stg)} RT ${f1(r.rt)} roja ${r.roja ? 'sí' : 'no'}${r.roja_v ? '(verdad sí)' : ''}` +
      ` ${r.metodo || ''} ${r.nivel || ''} Δ ${isFinite(r.delta_s) ? r.delta_s.toFixed(3) : '—'} ${r.motivo || ''} ${r.avisos.join(',')}`);
  }
  process.exit(0);
}

const fallas = [], filas = [];
function revisar(nombre, val, lim, cmp) {
  if (!isFinite(lim)) return;
  const bien = cmp === '>=' ? val >= lim : Math.abs(val) <= lim;
  if (!bien) fallas.push(`${nombre}: ${isFinite(val) ? val.toFixed(2) : 'sin dato'} (meta ${cmp === '>=' ? '≥' : '≤'} ${lim})`);
}
// metas por condición y fps: ev = ámbar/verde [|sesgo|, σ, p95]; stg y rt = [σ, p95]
const META = {
  dia: { 60: { ev: [2, 7, 12] }, 30: { ev: [3, 12, 20] } },
  sombra: { 60: { ev: [NaN, 3, NaN] }, 30: { ev: [NaN, 7, NaN] } },
  noche: { 60: { ev: [NaN, 2, NaN] }, 30: { ev: [NaN, 3, NaN] } },
  inc40: { 60: { ev: [4, 3, NaN] }, 30: { ev: [5, 5, NaN] } },
  pwm400: { 60: { ev: [NaN, 6, 12] }, 30: { ev: [NaN, 11, 20] } },
  pwm1000: { 60: { ev: [NaN, 6, 12] }, 30: { ev: [NaN, 11, 20] } },
  sol: { 60: { ev: [NaN, NaN, NaN] }, 30: { ev: [NaN, NaN, NaN] } },
};
const STG = { 60: [7, 13], 30: [13, 24] }, RT = { 60: [9, 16], 30: [16, 28] };
const t0 = Date.now(), sdDia = {}, dudosas = [];   // verdes descartadas por caer lejos del intervalo nominal

console.log(`semaforo_mc (${modo}, ${N} corridas por celda, semilla ${SEM})`);
console.log('celda                      lee   tipo | ámbar/verde sesgo  σ   p95 | stage  vistos  σ    p95 | RT boleta σ   p95 | ms');
for (const fps of [60, 30]) for (const cond of CONDS) for (const tipo of ['pro', 'full']) {
  const rs = []; for (let i = 0; i < N; i++) rs.push(corrida(cond, fps, tipo, i));
  const ok = rs.filter((r) => r.ok), ev = stats(ok.flatMap((r) => r.ev)), sg = stats(ok.map((r) => r.stg).filter(isFinite));
  const rt = stats(ok.map((r) => r.rt).filter(isFinite)), lee = ok.length / N, tp = ok.filter((r) => r.tipo_ok).length / Math.max(1, ok.length);
  const ms = rs.reduce((x, r) => x + r.ms, 0) / N, celda = `${fps}fps ${cond} ${tipo}`;
  console.log(`${celda.padEnd(26)} ${(100 * lee).toFixed(0).padStart(3)}%  ${(100 * tp).toFixed(0).padStart(3)}% |   ${f1(ev.m)} ${f1(ev.s)} ${f1(ev.p95)} | ${String(sg.n).padStart(3)}/${String(ok.length).padEnd(3)} ${f1(sg.s)} ${f1(sg.p95)} |  ${f1(rt.s)} ${f1(rt.p95)} | ${ms.toFixed(0)}`);
  filas.push({ celda, lee, tp, ev, sg, rt, nOk: ok.length });
  const nd = ok.filter((r) => r.dudosa).length; if (nd) dudosas.push(`${celda} ${nd}`);
  const M = META[cond][fps], pwm = cond.startsWith('pwm');
  revisar(`${celda} lectura`, lee, pwm ? 0.9 : 0.99, '>=');
  revisar(`${celda} tipo Pro/Full`, tp, 1, '>=');
  revisar(`${celda} ámbar/verde sesgo`, ev.m, M.ev[0]); revisar(`${celda} ámbar/verde σ`, ev.s, M.ev[1]); revisar(`${celda} ámbar/verde p95`, ev.p95, M.ev[2]);
  if (!pwm) {
    revisar(`${celda} stage visto`, sg.n / Math.max(1, ok.length), 0.9, '>=');
    revisar(`${celda} stage σ`, sg.s, STG[fps][0]); revisar(`${celda} stage p95`, sg.p95, STG[fps][1]);
  }
  revisar(`${celda} RT σ`, rt.s, RT[fps][0]); revisar(`${celda} RT p95`, rt.p95, RT[fps][1]);
  if (cond === 'dia') sdDia[fps + tipo] = ev.s;
  if (cond === 'sol') { revisar(`${celda} lectura con sol`, lee, 0.95, '>='); revisar(`${celda} σ con sol / σ de día`, ev.s / sdDia[fps + tipo], 1.3); }
}

// Rojas (RT de −0.02 a −0.30) y rojas falsas; handicap (carril equivocado)
let rojas = 0, rojasV = 0, falsas = 0, otro = 0, nH = 0;
for (let i = 0; i < N; i++) for (const tipo of ['pro', 'full']) {
  const r = corrida('dia', 60, tipo, 500 + i, { rt_s: -(0.02 + 0.28 * ((i * 0.618) % 1)) });
  rojasV++; if (r.roja) rojas++;
  const h = corrida('dia', 60, tipo, 700 + i, { escena: { otro: { desfase_s: 0.1 + 1.4 * ((i * 0.618) % 1), presente: true } } });
  nH++; if (h.otro) otro++; if (h.roja && !h.roja_v) falsas++;
}
for (let i = 0; i < N; i++) { const r = corrida('dia', 60, 'pro', 900 + i); if (r.roja && !r.roja_v) falsas++; }
console.log(`rojas detectadas ${rojas}/${rojasV} · rojas falsas ${falsas} · carril equivocado con handicap ${otro}/${nH}`);
revisar('rojas detectadas', rojas / rojasV, 0.99, '>=');
revisar('rojas falsas', falsas, 0);
revisar('carril equivocado con handicap', otro, 0);

console.log(`verdes descartadas (lejos del intervalo nominal): ${dudosas.length ? dudosas.join(', ') : 'ninguna'}`);
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (fallas.length) console.log(`NO CUMPLE (${fallas.length}):\n  ` + fallas.join('\n  '));
else console.log('Todo cumple.');
if (BASE) {
  // Retroceso: lee 2+ corridas menos, Pro/Full mal donde estaba bien, o un σ/p95 que crece más de 25 % + 2 ms (con 12
  // corridas por celda el σ varía ~20 % solo por azar, pero las semillas son fijas: sin cambios sale idéntico).
  // Rojas detectadas no bajan; rojas falsas y carril equivocado no suben.
  const txt = require('fs').readFileSync(BASE, 'utf8'), base = {}, peor = [];
  const num = (x) => (x === '—' ? NaN : +x);
  for (const l of txt.split('\n')) {
    const m = l.match(/^(\d+fps \S+ (?:pro|full))\s+(\d+)%\s+(\d+)% \|\s+(\S+)\s+(\S+)\s+(\S+) \|\s+(\d+)\/(\d+)\s+(\S+)\s+(\S+) \|\s+(\S+)\s+(\S+)/);
    if (m) base[m[1]] = { lee: +m[2] / 100, tp: +m[3] / 100, ev: [num(m[5]), num(m[6])], sg: [num(m[9]), num(m[10])], rt: [num(m[11]), num(m[12])] };
    const r = l.match(/^rojas detectadas (\d+)\/(\d+) · rojas falsas (\d+) · carril equivocado con handicap (\d+)\//);
    if (r) base.rojas = { det: +r[1] / +r[2], falsas: +r[3], otro: +r[4] };
  }
  const crece = (nuevo, viejo) => isFinite(nuevo) && (!isFinite(viejo) ? false : nuevo > 1.25 * viejo + 2);
  for (const f of filas) {
    const b = base[f.celda]; if (!b) { peor.push(`${f.celda}: no está en la base`); continue; }
    if (f.lee < b.lee - 1.5 / N) peor.push(`${f.celda} lectura ${(100 * f.lee).toFixed(0)}% (antes ${(100 * b.lee).toFixed(0)}%)`);
    if (f.tp < 1 && b.tp >= 1) peor.push(`${f.celda} tipo Pro/Full ${(100 * f.tp).toFixed(0)}% (antes 100%)`);
    for (const [k, nom] of [['ev', 'ámbar/verde'], ['sg', 'stage'], ['rt', 'RT']]) {
      const v = [f[k].s, f[k].p95];
      ['σ', 'p95'].forEach((q, j) => { if (crece(v[j], b[k][j])) peor.push(`${f.celda} ${nom} ${q} ${v[j].toFixed(1)} (antes ${b[k][j].toFixed(1)})`); });
    }
  }
  if (base.rojas) {
    if (rojas / rojasV < base.rojas.det) peor.push(`rojas detectadas ${rojas}/${rojasV} (antes ${(100 * base.rojas.det).toFixed(0)}%)`);
    if (falsas > base.rojas.falsas) peor.push(`rojas falsas ${falsas} (antes ${base.rojas.falsas})`);
    if (otro > base.rojas.otro) peor.push(`carril equivocado ${otro} (antes ${base.rojas.otro})`);
  } else peor.push('la base no trae la línea de rojas');
  console.log(peor.length ? `\nRETROCESOS contra ${BASE} (${peor.length}):\n  ` + peor.join('\n  ') : `\nSin retrocesos contra ${BASE}.`);
  process.exit(peor.length ? 1 : 0);
}
process.exit(fallas.length ? 1 : 0);
