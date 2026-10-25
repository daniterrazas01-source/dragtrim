#!/usr/bin/env node
/* calibrar.js — Busca el rollout y el retraso del GPS que mejor empatan VARIAS corridas con sus boletas.
 *
 *   node calibrar.js <carpeta|zip>... [--boletas boletas.json] [--hitos 60,201,402] [--cfg '{...}'] [--json]
 *
 * Cada corrida necesita su boleta: un boleta.txt (o .json) en la misma carpeta que su zip/CSV,
 * o un archivo --boletas con {"<sello>": "rt=0.622 60=2.650 201=9.339@132.4 402=14.043@181.7", ...}.
 * Prueba rollout 0.0–1.5 ft y retraso GPS "auto" o fijo 0.00–1.50 s; minimiza el RMS de (app − boleta)
 * en los tiempos (las velocidades no entran: la de 1/4 de la primera boleta no cuadra con el GPS).
 * Con 3 o más corridas hace validación "dejando una fuera": calibra sin esa corrida y mide el error en ella.
 */
'use strict';
const fs = require('fs');
const K = require('./comun.js');
const { isFin, f3, sg, pad } = K;

const a = K.argumentos(process.argv.slice(2));
if (!a._.length) { console.error('Uso: node calibrar.js <carpeta|zip>... [--boletas boletas.json] [--hitos 60,201,402] [--json]'); process.exit(1); }
const { C } = K.cargarCore();
const extra = a.cfg ? JSON.parse(a.cfg) : {};
const hitosUsar = a.hitos ? String(a.hitos).split(',').map((s) => { const b = K.parseBoleta(`${s.trim()}=1`); return b && Object.keys(b.t)[0]; }).filter(Boolean) : null;

let corridas = K.corridasDe(a._);
if (a.boletas) {
  const mapa = JSON.parse(fs.readFileSync(a.boletas, 'utf8'));
  for (const c of corridas) if (mapa[c.sello] != null) c.boleta = K.parseBoleta(typeof mapa[c.sello] === 'string' ? mapa[c.sello] : JSON.stringify(mapa[c.sello]));
}
const sinBoleta = corridas.filter((c) => !c.boleta);
corridas = corridas.filter((c) => c.boleta);
if (sinBoleta.length) console.error('Sin boleta (se omiten):', sinBoleta.map((c) => c.sello).join(', '));
if (!corridas.length) { console.error('Ninguna corrida tiene boleta.'); process.exit(1); }

const ROS = []; for (let r = 0; r <= 1.5001; r += 0.1) ROS.push(+r.toFixed(1));
const LAGS = ['auto']; for (let L = 0; L <= 1.5001; L += 0.05) LAGS.push(+L.toFixed(2));

// errores[iCorrida][combo] = lista de (app − boleta)
const combos = [];
for (const ro of ROS) for (const lag of LAGS) combos.push({ ro, lag });
const errores = corridas.map((c) => combos.map(({ ro, lag }) => {
  const cambios = Object.assign({}, extra, { rollout_ft: ro });
  if (lag !== 'auto') cambios.latencia_gps_s = lag;
  const R = C.procesar(c.gps, c.acc, K.cfgDe(c, cambios));
  const d = K.diferencias(K.medir(C, R), c.boleta);
  if (hitosUsar) for (const k of Object.keys(d)) if (!hitosUsar.includes(k)) delete d[k];
  return { d, lagUsado: R.ok ? R.calidad.latencia_gps_s : NaN };
}));

function rmsDe(indicesCorridas, j) {
  const todos = [];
  for (const i of indicesCorridas) {
    const vals = Object.values(errores[i][j].d);
    if (!vals.length) return NaN;   // esa combinación no dio tiempos para esa corrida
    todos.push(...vals);
  }
  return K.rms(todos);
}
function mejorPara(indices) {
  let mj = -1, mr = Infinity;
  combos.forEach((_, j) => { const r = rmsDe(indices, j); if (r < mr) { mr = r; mj = j; } });
  return { j: mj, rms: mr };
}

const todas = corridas.map((_, i) => i);
const ranking = combos.map((cb, j) => ({ ...cb, j, rms: rmsDe(todas, j) })).filter((x) => isFin(x.rms)).sort((x, y) => x.rms - y.rms);
const mejor = ranking[0];
// combinaciones casi igual de buenas: muestran qué tan "plano" es el mínimo (rollout y retraso se compensan)
const casi = ranking.filter((x) => x.rms <= mejor.rms + Math.max(0.005, 0.1 * mejor.rms));
const rango = (k) => { const v = casi.map((x) => x[k]).filter((x) => x !== 'auto'); return v.length ? `${Math.min(...v)}–${Math.max(...v)}` : '—'; };

// lo que usa hoy la app: rollout guardado + retraso automático
const actual = corridas.map((c, i) => {
  const ro = isFin(c.meta.rollout_ft) ? +(+c.meta.rollout_ft).toFixed(1) : 1;
  const j = combos.findIndex((x) => x.ro === ro && x.lag === 'auto');
  return { ro, d: errores[i][j].d };
});

let loo = null;
if (corridas.length >= 3) {
  loo = corridas.map((c, i) => {
    const resto = todas.filter((x) => x !== i), m = mejorPara(resto);
    return { sello: c.sello, ro: combos[m.j].ro, lag: combos[m.j].lag, d: errores[i][m.j].d, rms: K.rms(Object.values(errores[i][m.j].d)) };
  });
}

if (a.json) {
  console.log(JSON.stringify({ n: corridas.length, mejor: { ro: mejor.ro, lag: mejor.lag, rms: mejor.rms }, top: ranking.slice(0, 15).map(({ ro, lag, rms }) => ({ ro, lag, rms })),
    casi_igual: { rollout: rango('ro'), lag: rango('lag'), n: casi.length }, loo }, null, 1));
  process.exit(0);
}

const lagTxt = (x) => (x.lag === 'auto' ? 'auto' : x.lag.toFixed(2) + ' s');
console.log(`Corridas con boleta: ${corridas.length}  (${corridas.map((c) => c.sello).join(', ')})`);
if (hitosUsar) console.log('Hitos usados:', hitosUsar.join(', '));
console.log('\nMejores combinaciones (RMS de app − boleta, todas las corridas juntas):');
for (const x of ranking.slice(0, 10)) console.log(`  rollout ${x.ro.toFixed(1)} ft, retraso ${lagTxt(x).padEnd(7)}  RMS ${f3(x.rms)} s`);
console.log(`\nCasi igual de buenas (hasta +${f3(Math.max(0.005, 0.1 * mejor.rms))} s): ${casi.length} combinaciones; rollout ${rango('ro')} ft, retraso fijo ${rango('lag')} s` +
  (casi.some((x) => x.lag === 'auto') ? ' (incluye "auto")' : ''));

console.log('\nPor corrida (app − boleta), con la mejor combinación y con lo que usa hoy la app:');
console.log('corrida           ' + K.HITOS.map((h) => h.nombre.padStart(8)).join('') + '   | hoy (rollout guardado, retraso auto)');
corridas.forEach((c, i) => {
  const d = errores[i][mejor.j].d, h = actual[i];
  console.log(`${c.sello}  ${K.HITOS.map((x) => pad(sg(d[x.clave]), 8)).join('')}   | ro ${h.ro.toFixed(1)}: ${K.HITOS.map((x) => sg(h.d[x.clave])).filter((s) => s !== '—').join(' ')}`);
});

if (loo) {
  console.log('\nValidación dejando una fuera (se calibra sin esa corrida y se mide el error en ella):');
  for (const x of loo) console.log(`  ${x.sello}: calibrado con las demás → rollout ${x.ro.toFixed(1)}, retraso ${lagTxt(x)}; error en esta corrida RMS ${f3(x.rms)} s`);
  console.log(`  RMS fuera de muestra: ${f3(K.rms(loo.flatMap((x) => Object.values(x.d))))} s  (si es mucho mayor que el de arriba, la calibración no se sostiene)`);
} else {
  console.log('\nCon menos de 3 corridas no se puede validar: toma el resultado como pista, no como ajuste final.');
}
