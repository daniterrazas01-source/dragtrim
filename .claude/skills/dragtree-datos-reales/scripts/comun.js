/* comun.js — Piezas compartidas para analizar corridas reales de Drag Tree.
 *
 * Lee los zips que exporta la app (o carpetas con los CSV ya extraídos), sin escribir nada a disco,
 * carga dragcore.js del repo y compara los tiempos con los de la boleta oficial.
 * Sin dependencias: solo Node.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const isFin = Number.isFinite;
const PIE = 0.3048;

// Hitos de la pista (metros) y sus nombres en dragcore / en la boleta
const HITOS = [
  { clave: '60', nombre: '60 ft', m: 18.288 },
  { clave: '330', nombre: '330 ft', m: 100.584 },
  { clave: '201', nombre: '1/8 mi', m: 201.168 },
  { clave: '305', nombre: '1000 ft', m: 304.8 },
  { clave: '402', nombre: '1/4 mi', m: 402.336 },
];
const TRAMPA_M = 20.1168;   // 66 ft antes de la línea: así miden la velocidad las pistas

// ------------------------------------------------------------------ dragcore
function cargarCore() {
  const candidatos = [];
  if (process.env.DRAGCORE) candidatos.push(process.env.DRAGCORE);
  for (let d of [process.cwd(), __dirname]) {
    for (let i = 0; i < 8; i++) {
      candidatos.push(path.join(d, 'fuente', 'app', 'src', 'dragcore.js'));
      d = path.dirname(d);
    }
  }
  for (const c of candidatos) if (fs.existsSync(c)) return { C: require(path.resolve(c)), ruta: path.resolve(c) };
  throw new Error('No encontré fuente/app/src/dragcore.js. Corre desde el repo o pon DRAGCORE=/ruta/dragcore.js');
}

// ------------------------------------------------------------------ zip en memoria
// Soporta "stored" (como los genera la app) y "deflate" (si el teléfono o WhatsApp lo vuelve a comprimir).
function leerZip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('no parece un zip');
  const n = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('directorio del zip dañado');
    const metodo = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const loc = buf.readUInt32LE(p + 42);
    const nombre = buf.toString('utf8', p + 46, p + 46 + nl);
    p += 46 + nl + xl + cl;
    if (nombre.endsWith('/')) continue;
    const ini = loc + 30 + buf.readUInt16LE(loc + 26) + buf.readUInt16LE(loc + 28);
    const datos = buf.subarray(ini, ini + comp);
    let contenido = null;
    if (metodo === 0) contenido = datos;
    else if (metodo === 8) contenido = zlib.inflateRawSync(datos, { maxOutputLength: 200 * 1024 * 1024 });
    if (contenido) out.push({ nombre, contenido });
  }
  return out;
}

// Junta todos los archivos (de zips, zips dentro de zips o carpetas) como [{nombre, contenido}]
function recolectar(ruta, prof = 0, out = []) {
  const st = fs.statSync(ruta);
  if (st.isDirectory()) {
    if (prof > 6) return out;
    for (const f of fs.readdirSync(ruta).sort()) {
      if (f.startsWith('.') || f === '__MACOSX') continue;
      recolectar(path.join(ruta, f), prof + 1, out);
    }
  } else if (/\.zip$/i.test(ruta)) {
    agregarZip(fs.readFileSync(ruta), path.dirname(ruta), out, 0);
  } else {
    out.push({ nombre: path.basename(ruta), contenido: fs.readFileSync(ruta), carpeta: path.dirname(ruta) });
  }
  return out;
}
function agregarZip(buf, carpeta, out, prof) {
  for (const f of leerZip(buf)) {
    const base = path.basename(f.nombre);
    if (f.nombre.includes('__MACOSX') || base.startsWith('._')) continue;
    if (/\.zip$/i.test(base) && prof < 3) agregarZip(f.contenido, carpeta, out, prof + 1);
    else out.push({ nombre: base, contenido: f.contenido, carpeta });
  }
}

// ------------------------------------------------------------------ CSV / meta / DRAGPACK
function leerCsv(txt) {
  const lineas = txt.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  const cab = lineas[0].split(',').map((s) => s.trim());
  const cols = {};
  for (const c of cab) cols[c] = [];
  for (let i = 1; i < lineas.length; i++) {
    const v = lineas[i].split(',');
    cab.forEach((c, j) => cols[c].push(v[j] === undefined || v[j].trim() === '' ? NaN : Number(v[j])));
  }
  return cols;
}

function leerDragpack(txt) {
  const m = /DRAGPACK\|([A-Za-z0-9+/=\s]+)\|END/.exec(txt);
  if (!m) return null;
  try { return JSON.parse(Buffer.from(m[1].replace(/\s/g, ''), 'base64').toString('utf8')); } catch (e) { return null; }
}

/** Agrupa los archivos por sello (AAAAMMDD_HHMMSS) y arma cada corrida. */
function corridasDe(rutas) {
  const archivos = [];
  for (const r of rutas) recolectar(r, 0, archivos);
  const por = new Map(), boletas = [];
  const de = (sello, carpeta) => {
    if (!por.has(sello)) por.set(sello, { sello, carpeta });
    return por.get(sello);
  };
  for (const f of archivos) {
    let m;
    const txt = () => f.contenido.toString('utf8');
    if ((m = /^drag_raw_gps_(\d{8}_\d{6})\.csv$/.exec(f.nombre))) {
      const c = leerCsv(txt());
      de(m[1], f.carpeta).gps = { t: c.t_s, v: c.v_mps, hacc: c.hacc_m || [], lat: c.lat || [], lon: c.lon || [] };
    } else if ((m = /^drag_raw_acc_(\d{8}_\d{6})\.csv$/.exec(f.nombre))) {
      const c = leerCsv(txt());
      de(m[1], f.carpeta).acc = { t: c.t_s, ax: c.ax, ay: c.ay, az: c.az };
    } else if ((m = /^drag_raw_meta_(\d{8}_\d{6})\.json$/.exec(f.nombre))) {
      try { de(m[1], f.carpeta).meta = JSON.parse(txt()); } catch (e) { de(m[1], f.carpeta).meta = {}; }
    } else if ((m = /^DRAGPACK_\w*?_?(\d{8}_\d{6})\.txt$/.exec(f.nombre))) {
      de(m[1], f.carpeta).app = leerDragpack(txt());
    } else if (/^boleta.*\.(txt|json)$/i.test(f.nombre)) {
      // boleta.txt / boleta.json junto a la corrida (si la carpeta tiene una sola corrida)
      boletas.push({ carpeta: f.carpeta, texto: txt() });
    }
  }
  const lista = [...por.values()].filter((c) => c.gps).sort((a, b) => a.sello.localeCompare(b.sello));
  for (const b of boletas) {
    const mismas = lista.filter((c) => c.carpeta === b.carpeta);
    if (mismas.length === 1) mismas[0].boleta = parseBoleta(b.texto);
  }
  for (const c of lista) {
    c.meta = c.meta || {};
    if (c.acc && c.acc.t.length === 0) c.acc = null;
  }
  return lista;
}

// ------------------------------------------------------------------ boleta
/**
 * Acepta JSON ({"60": 2.65, "201": [9.339, 132.4], "402": {"t": 14.043, "v": 181.71}, "rt": 0.622, "unidad": "kmh"})
 * o texto: "rt=0.622 60=2.650 330=6.9 201=9.339@132.40 305=11.9 402=14.043@181.71"
 * (velocidad en km/h; agrega "mph" para millas: 402=14.043@112.9mph). Alias: 1/8, 660 y 1/4, 1320, 1000, 101.
 */
function parseBoleta(entrada) {
  if (entrada == null) return null;
  let txt = String(entrada).trim();
  if (!txt) return null;
  if (fs.existsSync(txt) && fs.statSync(txt).isFile()) txt = fs.readFileSync(txt, 'utf8').trim();
  const alias = { '60': '60', '60ft': '60', '18': '60', '330': '330', '330ft': '330', '101': '330', '100': '330',
    '201': '201', '1/8': '201', '660': '201', '660ft': '201', '305': '305', '1000': '305', '1000ft': '305',
    '402': '402', '1/4': '402', '1320': '402', '1320ft': '402' };
  const b = { rt: NaN, t: {}, v: {} };
  const ponerV = (k, v, mph) => { if (isFin(v)) b.v[k] = mph ? v * 1.609344 : v; };
  if (txt.startsWith('{')) {
    const j = JSON.parse(txt);
    const mph = /mph/i.test(j.unidad || '');
    for (const [kk, val] of Object.entries(j)) {
      const k = alias[String(kk).toLowerCase()];
      if (String(kk).toLowerCase() === 'rt') b.rt = Number(val);
      if (!k || val == null) continue;
      if (typeof val === 'number') b.t[k] = val;
      else if (Array.isArray(val)) { b.t[k] = Number(val[0]); ponerV(k, Number(val[1]), mph); }
      else { b.t[k] = Number(val.t); ponerV(k, Number(val.v), mph || /mph/i.test(val.unidad || '')); }
    }
  } else {
    for (const tok of txt.replace(/,/g, ' ').split(/\s+/)) {
      const m = /^([^=:]+)[=:]([-\d.]+)(?:@([\d.]+)\s*(mph|kmh|km\/h)?)?$/i.exec(tok);
      if (!m) continue;
      const kk = m[1].toLowerCase();
      if (kk === 'rt') { b.rt = Number(m[2]); continue; }
      const k = alias[kk];
      if (!k) continue;
      b.t[k] = Number(m[2]);
      if (m[3]) ponerV(k, Number(m[3]), /mph/i.test(m[4] || ''));
    }
  }
  return Object.keys(b.t).length || isFin(b.rt) ? b : null;
}

function textoBoleta(b) {
  if (!b) return '—';
  const p = [];
  if (isFin(b.rt)) p.push(`RT ${b.rt.toFixed(3)}`);
  for (const h of HITOS) if (isFin(b.t[h.clave])) p.push(`${h.nombre} ${b.t[h.clave].toFixed(3)}${isFin(b.v[h.clave]) ? ' @' + b.v[h.clave].toFixed(1) : ''}`);
  return p.join(' | ');
}

// ------------------------------------------------------------------ procesar y medir
function cfgDe(corrida, extra) {
  const m = corrida.meta || {};
  const cfg = {};
  if (isFin(m.distancia_final)) cfg.distancia_final = m.distancia_final;
  cfg.t_inicio_busqueda = isFin(m.t_inicio_busqueda) ? m.t_inicio_busqueda : -Infinity;
  if (isFin(m.rollout_ft)) cfg.rollout_ft = m.rollout_ft;
  return Object.assign(cfg, extra || {});
}

/** Tiempo absoluto (s del log) en que la distancia integrada llega a D; NaN si no llegó. */
function tCruce(C, R, D) { return C.cruce(R.t, R.d, D); }

/** Velocidad de trampa (km/h) en los 66 ft antes de D, como en la pista. */
function trampa(C, R, D) {
  const t1 = tCruce(C, R, D - TRAMPA_M), t2 = tCruce(C, R, D);
  return isFin(t1) && isFin(t2) ? TRAMPA_M / (t2 - t1) * 3.6 : NaN;
}

/** Velocidad del GPS crudo (Doppler, km/h) al cruzar D, ya corrigiendo el retraso estimado. */
function vGpsEn(C, corrida, R, D) {
  const tk = tCruce(C, R, D);
  if (!isFin(tk)) return NaN;
  const lag = R.calidad.latencia_gps_s || 0;
  return C.interp1(corrida.gps.t, corrida.gps.v, tk + lag) * 3.6;
}

/** Velocidad por posición GPS (km/h) entre las lecturas que rodean el cruce de D. */
function vPosEn(C, corrida, R, D) {
  const g = corrida.gps, tk = tCruce(C, R, D);
  if (!isFin(tk) || !g.lat || !g.lat.some(isFin)) return NaN;
  const lag = R.calidad.latencia_gps_s || 0, tt = tk + lag;
  let i = g.t.findIndex((x) => x > tt);
  if (i <= 0) return NaN;
  const a = i - 1, b = Math.min(i, g.t.length - 1);
  if (!(isFin(g.lat[a]) && isFin(g.lat[b])) || g.t[b] <= g.t[a]) return NaN;
  return C.haversine(g.lat[a], g.lon[a], g.lat[b], g.lon[b]) / (g.t[b] - g.t[a]) * 3.6;
}

/** Tiempos y velocidades de un resultado de procesar(): {t:{60:..}, v:{..}, trampa:{..}} */
function medir(C, R) {
  const out = { t: {}, v: {}, trampa: {} };
  if (!R || !R.ok) return out;
  const Df = R.cfg && isFin(R.cfg.distancia_final) ? R.cfg.distancia_final : 402.336;
  for (const h of HITOS) {
    if (h.m > Df + 0.01) continue;   // como la app: nada después de la meta elegida
    const x = R.hitos.find((y) => Math.abs(y.dist_m - h.m) < 0.01);
    if (x && isFin(x.t)) { out.t[h.clave] = x.t; out.v[h.clave] = x.v_kmh; out.trampa[h.clave] = trampa(C, R, h.m); }
  }
  return out;
}

/** Diferencias app − boleta (s) en los hitos que tengan las dos. */
function diferencias(med, boleta) {
  const d = {};
  if (!boleta) return d;
  for (const h of HITOS) if (isFin(boleta.t[h.clave]) && isFin(med.t[h.clave])) d[h.clave] = med.t[h.clave] - boleta.t[h.clave];
  return d;
}
const rms = (vals) => vals.length ? Math.sqrt(vals.reduce((s, x) => s + x * x, 0) / vals.length) : NaN;

// ------------------------------------------------------------------ formato
const f3 = (x) => (isFin(x) ? x.toFixed(3) : '—');
const f1 = (x) => (isFin(x) ? x.toFixed(1) : '—');
const sg = (x) => (isFin(x) ? (x >= 0 ? '+' : '') + x.toFixed(3) : '—');
const pad = (s, n) => String(s).padStart(n);

function argumentos(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x.startsWith('--')) {
      const [k, v] = x.slice(2).split('=');
      if (v !== undefined) a[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) a[k] = argv[++i];
      else a[k] = true;
    } else a._.push(x);
  }
  return a;
}

module.exports = {
  HITOS, TRAMPA_M, PIE, isFin, cargarCore, leerZip, corridasDe, leerCsv, leerDragpack, parseBoleta, textoBoleta,
  cfgDe, medir, diferencias, rms, trampa, vGpsEn, vPosEn, tCruce, f3, f1, sg, pad, argumentos,
};
