#!/usr/bin/env node
/* demo_zip.js — Crea zips de prueba IGUALES a los que exporta la app, con una corrida simulada,
 * y un boleta.txt con los tiempos verdaderos del simulador (rollout real de 1 ft).
 * Sirve para probar analizar.js / calibrar.js sin datos reales.
 *
 *   node demo_zip.js <carpeta_salida> [--n 4] [--seed 100] [--lag 0.9] [--rollout_app 0.5] [--dist 402]
 *
 * Cada corrida queda en <carpeta_salida>/<sello>/ con dragtrim_<sello>.zip y boleta.txt.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const K = require('./comun.js');

const a = K.argumentos(process.argv.slice(2));
const salida = a._[0];
if (!salida) { console.error('Uso: node demo_zip.js <carpeta_salida> [--n 4] [--seed 100] [--lag 0.9] [--rollout_app 0.5] [--dist 402]'); process.exit(1); }
const { C } = K.cargarCore();
const N = parseInt(a.n || 1, 10), seed0 = parseInt(a.seed || 100, 10);
const lag = a.lag !== undefined ? Number(a.lag) : 0.9;
const rolloutApp = a.rollout_app !== undefined ? Number(a.rollout_app) : 0.5;
const dist = Number(a.dist || 402) < 300 ? 201.168 : 402.336;

// zip "stored" como el de la app
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(files) {
  const partes = [], central = []; let off = 0;
  for (const f of files) {
    const nombre = Buffer.from(f.name, 'utf8'), datos = Buffer.from(f.text, 'utf8'), crc = crc32(datos);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(datos.length, 18); h.writeUInt32LE(datos.length, 22); h.writeUInt16LE(nombre.length, 26);
    partes.push(h, nombre, datos);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(datos.length, 20); cd.writeUInt32LE(datos.length, 24);
    cd.writeUInt16LE(nombre.length, 28); cd.writeUInt32LE(off, 42);
    central.push(cd, nombre);
    off += 30 + nombre.length + datos.length;
  }
  const tam = central.reduce((s, p) => s + p.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(files.length, 8); fin.writeUInt16LE(files.length, 10);
  fin.writeUInt32LE(tam, 12); fin.writeUInt32LE(off, 16);
  return Buffer.concat([...partes, ...central, fin]);
}
const csv = (cols, b) => {
  const keys = Object.keys(cols), n = b[keys[0]].length, out = [Object.values(cols).join(',')];
  for (let i = 0; i < n; i++) out.push(keys.map((k) => { const x = b[k][i]; return Number.isFinite(x) ? +x.toFixed(6) : 'NaN'; }).join(','));
  return out.join('\n') + '\n';
};

fs.mkdirSync(salida, { recursive: true });
for (let n = 0; n < N; n++) {
  const s = C.simularSesion({ gps_hz: 1, lag_gps: lag, seed: seed0 + n, acc_hz: 60 });
  // como la app: detector en vivo, recorte de los buffers y procesar con t_inicio_busqueda
  const det = new C.DetectorVivo({ distancia_final: dist });
  let tArr = NaN, tFin = Infinity;
  s.gps.t.forEach((t, i) => det.feed(t, s.gps.v[i]).forEach((e) => {
    if (e.tipo === 'arranque') tArr = e.tBajo;
    if (e.tipo === 'fin' && tFin === Infinity) tFin = t;   // la app deja de grabar al terminar la corrida
  }));
  if (!Number.isFinite(tArr)) { console.error('semilla', seed0 + n, ': el detector no vio arranque, se omite'); continue; }
  const corta = (b, desde) => {
    const i = b.t.findIndex((x) => x >= desde), j = b.t.findIndex((x) => x > tFin);
    const o = {}; for (const k of Object.keys(b)) o[k] = i < 0 ? [] : b[k].slice(i, j < 0 ? undefined : j); return o;
  };
  const g = corta(s.gps, tArr - 20), ac = corta(s.acc, tArr - 8);
  const cfg = { distancia_final: dist, rollout_ft: rolloutApp, t_inicio_busqueda: tArr - 0.5 };
  const R = C.procesar(g, ac, cfg);
  const st = `20260101_${String(120000 + n).padStart(6, '0')}`;
  const files = [
    { name: `drag_raw_gps_${st}.csv`, text: csv({ t: 't_s', lat: 'lat', lon: 'lon', v: 'v_mps', hacc: 'hacc_m' }, g) },
    { name: `drag_raw_acc_${st}.csv`, text: csv({ t: 't_s', ax: 'ax', ay: 'ay', az: 'az' }, ac) },
    { name: `drag_raw_meta_${st}.json`, text: JSON.stringify({ version: 'app demo_zip', distancia_final: dist, t_inicio_busqueda: cfg.t_inicio_busqueda, rollout_ft: rolloutApp, simulada: true }) },
  ];
  if (R.ok) {
    const r = {};
    const hk = { '60 ft': ['t_60ft', 'v_60ft'], '330 ft': ['t_101m', 'v_101m'], '1/8 mi': ['t_201m', 'v_201m'], '1000 ft': ['t_305m', 'v_305m'], '1/4 mi': ['t_1_4mi', 'v_1_4mi'] };
    for (const h of R.hitos) { const k = hk[h.nombre]; if (k) { r[k[0]] = Number.isFinite(h.t) ? h.t : 0; r[k[1]] = Number.isFinite(h.v_kmh) ? h.v_kmh : 0; } }
    r.trampa_kmh = Number.isFinite(R.trampa_kmh) ? R.trampa_kmh : 0; r.rollout_ft = rolloutApp;
    const payload = { tipo: 'drag_trim', version: 'app demo_zip', completo: R.completo, resultados: r, calidad: { metodo: R.calidad.metodo, gps_hz: R.calidad.gps_hz } };
    files.push({ name: `DRAGPACK_dragtrim_${st}.txt`, text: `DRAGPACK|${Buffer.from(JSON.stringify(payload)).toString('base64')}|END` });
  }
  const dir = path.join(salida, st);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `dragtrim_${st}.zip`), zip(files));
  // "boleta" = verdad del simulador (su rollout es 1 ft); solo hasta la distancia de la corrida
  const claves = ['60', '330', '201', '305', '402'];
  const partes = s.verdad.t_hitos.map((t, i) => (K.HITOS[i].m <= dist + 0.01 ? `${claves[i]}=${t.toFixed(3)}` : '')).filter(Boolean);
  fs.writeFileSync(path.join(dir, 'boleta.txt'), partes.join(' ') + '\n');
  console.log(`${dir}  (lag GPS ${lag} s, rollout en la app ${rolloutApp} ft, rollout verdadero 1 ft)`);
}
