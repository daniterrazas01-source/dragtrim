#!/usr/bin/env node
/* analizar.js — Revisa corridas reales exportadas por Drag Tree y las compara con la boleta.
 *
 *   node analizar.js <zip|carpeta>... [--boleta "rt=0.622 60=2.650 201=9.339@132.40 402=14.043@181.71"]
 *                    [--rollout 0.5] [--lag 0.9] [--cfg '{"peso_residuo":0.3}'] [--variantes] [--json]
 *
 * --boleta     tiempos oficiales (texto o ruta a boleta.txt/.json). Si no se da, usa boleta.txt junto a la corrida.
 *              Velocidades en km/h; agrega "mph" si la boleta viene en millas (402=14.043@112.9mph).
 * --rollout    rollout en pies para recalcular (por defecto el que tenía la app al medir).
 * --lag        retraso del GPS fijo en s (por defecto lo estima la app).
 * --cfg        cualquier otro parámetro de dragcore (JSON).
 * --variantes  tabla con varias combinaciones de rollout y retraso, ordenada por error contra la boleta.
 * --json       salida en JSON (para otros scripts).
 */
'use strict';
const K = require('./comun.js');
const { isFin, f3, f1, sg, pad } = K;

const a = K.argumentos(process.argv.slice(2));
if (!a._.length) { console.error('Uso: node analizar.js <zip|carpeta>... [--boleta "..."] [--rollout X] [--lag X] [--variantes] [--json]'); process.exit(1); }
const { C, ruta } = K.cargarCore();
const extra = a.cfg ? JSON.parse(a.cfg) : {};
const corridas = K.corridasDe(a._);
if (!corridas.length) { console.error('No encontré corridas (drag_raw_gps_*.csv) en', a._.join(', ')); process.exit(1); }
const boletaCli = K.parseBoleta(a.boleta);
if (a.boleta && !boletaCli) { console.error('No entendí la boleta:', a.boleta); process.exit(1); }
if (boletaCli && corridas.length > 1) console.error('Aviso: --boleta se aplica a TODAS las corridas encontradas.');

function procesarCon(corrida, cambios) {
  const cfg = K.cfgDe(corrida, Object.assign({}, extra, cambios));
  return { R: C.procesar(corrida.gps, corrida.acc, cfg), cfg };
}

const salidaJson = [];
for (const c of corridas) {
  const boleta = boletaCli || c.boleta || null;
  const base = {};
  if (a.rollout !== undefined) base.rollout_ft = Number(a.rollout);
  if (a.lag !== undefined && a.lag !== 'auto') base.latencia_gps_s = Number(a.lag);
  const { R, cfg } = procesarCon(c, base);
  const med = K.medir(C, R);
  const dif = K.diferencias(med, boleta);
  const info = { sello: c.sello, carpeta: c.carpeta, ok: R.ok, mensaje: R.mensaje, avisos: R.avisos, cfg, med, boleta, dif };

  if (!a.json) {
    console.log(`\n== Corrida ${c.sello}   (${c.carpeta})`);
    const g = c.gps, n = g.t.length;
    const dur = n ? g.t[n - 1] - g.t[0] : 0;
    console.log(`Datos: GPS ${n} lecturas en ${dur.toFixed(0)} s` + (c.acc ? ` | acelerómetro ${c.acc.t.length} muestras` : ' | SIN acelerómetro') +
      ` | ${cfg.distancia_final && cfg.distancia_final < 300 ? '1/8' : '1/4'} de milla | rollout ${cfg.rollout_ft ?? 1} ft` +
      (c.meta.version ? ` | ${c.meta.version}` : '') + (c.meta.simulada ? ' | SIMULADA' : ''));
  }
  if (!R.ok) {
    if (!a.json) console.log('No se pudo calcular:', R.mensaje);
    salidaJson.push(info);
    continue;
  }
  const q = R.calidad;
  info.calidad = q;

  // ¿Este dragcore da lo mismo que la app en su momento? (solo si se recalcula con los mismos ajustes)
  const appR = c.app && c.app.resultados;
  const mismosAjustes = a.rollout === undefined && a.lag === undefined && !a.cfg;
  if (appR && mismosAjustes) {
    const pares = [['60', 't_60ft'], ['330', 't_101m'], ['201', 't_201m'], ['305', 't_305m'], ['402', 't_1_4mi']];
    const difApp = pares.filter(([k, kk]) => isFin(med.t[k]) && appR[kk] > 0).map(([k, kk]) => med.t[k] - appR[kk]);
    info.igual_que_app = difApp.every((d) => Math.abs(d) < 0.0015);
    if (!a.json) {
      const txt = pares.filter(([, kk]) => appR[kk] > 0).map(([k, kk]) => `${K.HITOS.find((h) => h.clave === k).nombre} ${f3(appR[kk])}`).join(' | ');
      console.log(`La app dio: ${txt}${appR.trampa_kmh > 0 ? ` | trampa ${f1(appR.trampa_kmh)} km/h` : ''}`);
      console.log(info.igual_que_app ? 'Recalculado con este dragcore: igual que la app (±0.001 s).'
        : `OJO: este dragcore da distinto que la app en su momento (máx ${f3(Math.max(...difApp.map(Math.abs)))} s): el algoritmo cambió desde esa versión.`);
    }
  }
  if (!a.json) {
    console.log(`Calidad: ${q.metodo}, GPS ${f1(q.gps_hz)} Hz (precisión ${isFin(q.hacc_mediana_m) ? q.hacc_mediana_m.toFixed(0) + ' m' : '—'}), ` +
      `acel. ${isFin(q.acc_hz) ? q.acc_hz.toFixed(0) + ' Hz' : '—'}, ruido en reposo ${isFin(q.ruido_reposo) ? q.ruido_reposo.toFixed(2) + ' m/s²' : '—'}, ` +
      `g ${isFin(q.g_medida) ? q.g_medida.toFixed(2) : '—'}, retraso GPS ${f3(q.latencia_gps_s)} s${isFin(cfg.latencia_gps_s) ? ' (fijo)' : ' (estimado)'}, ` +
      `GPS descartadas ${q.gps_descartadas}`);
    console.log(`Distancia: integrada ${f1(q.dist_integrada_m)} m vs posición GPS ${f1(q.dist_pos_m)} m | pico ${f3(R.est.a_max_g)} g | ` +
      `del primer movimiento al rollout ${f3(R.tRo - R.t0)} s`);
    if (R.avisos.length) console.log('Avisos:', R.avisos.join(' / '));
    console.log('Boleta:', K.textoBoleta(boleta));

    console.log('\nHito       App     Boleta   App−boleta');
    for (const h of K.HITOS) {
      if (!isFin(med.t[h.clave]) && !(boleta && isFin(boleta.t[h.clave]))) continue;
      console.log(`${h.nombre.padEnd(8)} ${pad(f3(med.t[h.clave]), 7)} ${pad(boleta ? f3(boleta.t[h.clave]) : '—', 8)} ${pad(sg(dif[h.clave]), 10)}`);
    }
    if (Object.keys(dif).length) console.log(`RMS ${f3(K.rms(Object.values(dif)))} s`);

    console.log('\nVelocidad km/h  Boleta  Trampa66ft  En la línea  GPS Doppler  GPS posición');
    for (const clave of ['201', '402']) {
      const h = K.HITOS.find((x) => x.clave === clave);
      if (!isFin(med.t[clave])) continue;
      const vb = boleta ? boleta.v[clave] : NaN;
      console.log(`${h.nombre.padEnd(14)} ${pad(f1(vb), 7)} ${pad(f1(med.trampa[clave]), 11)} ${pad(f1(med.v[clave]), 12)} ` +
        `${pad(f1(K.vGpsEn(C, c, R, h.m)), 12)} ${pad(f1(K.vPosEn(C, c, R, h.m)), 13)}`);
    }
    console.log('(La boleta mide la velocidad como "Trampa66ft": promedio de los últimos 66 ft antes de la línea.)');
  }

  if (a.variantes) {
    const ros = [...new Set([0, 0.5, 1.0, cfg.rollout_ft ?? 1].map(Number))].sort((x, y) => x - y);
    const lags = ['auto', 0.3, 0.5, 0.7, 0.9, 1.1];
    const filas = [];
    for (const ro of ros) for (const L of lags) {
      const cambios = { rollout_ft: ro };
      if (L !== 'auto') cambios.latencia_gps_s = L;
      const { R: Rv } = procesarCon(c, cambios);
      const mv = K.medir(C, Rv), dv = K.diferencias(mv, boleta);
      filas.push({ ro, lag: L, lagUsado: Rv.ok ? Rv.calidad.latencia_gps_s : NaN, med: mv, dif: dv, rms: K.rms(Object.values(dv)) });
    }
    if (boleta) filas.sort((x, y) => (isFin(x.rms) ? x.rms : 1e9) - (isFin(y.rms) ? y.rms : 1e9));
    info.variantes = filas;
    if (!a.json) {
      console.log(`\nVariantes (${boleta ? 'App − boleta, ordenadas por RMS' : 'tiempos; sin boleta para comparar'}):`);
      console.log('rollout  retraso      ' + K.HITOS.map((h) => h.nombre.padStart(8)).join('') + '      RMS');
      for (const f of filas) {
        const vals = K.HITOS.map((h) => pad(boleta ? sg(f.dif[h.clave]) : f3(f.med.t[h.clave]), 8)).join('');
        const lagTxt = f.lag === 'auto' ? `auto ${f3(f.lagUsado)}` : `${f3(f.lag)}`;
        console.log(`${pad(f.ro.toFixed(1), 5)} ft  ${lagTxt.padEnd(11)}${vals}   ${boleta ? f3(f.rms) : ''}`);
      }
      console.log('Ojo: con UNA sola corrida, rollout y retraso se compensan entre sí; no ajustes la app con una sola boleta.');
    }
  }
  salidaJson.push(info);
}
if (a.json) console.log(JSON.stringify({ dragcore: ruta, corridas: salidaJson }, (k, v) => (typeof v === 'number' && !isFin(v) ? null : v), 1));
