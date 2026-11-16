// Genera sesiones (simuladas y la corrida real del 15 nov 2026) y lo que da dragcore.js con ellas,
// para comparar con drag_procesar.m corrido en Octave (ver igual.sh). Uso: node gen.js <carpeta de salida>
const fs = require('fs'), path = require('path');
const C = require('../../app/src/dragcore.js');
const X = require('../../../.claude/skills/dragtree-datos-reales/scripts/comun.js');
const out = process.argv[2];
const REAL = { gps_hz: 1, lag_gps: 0.08, gps_vel_media_s: 1, pos_ruido_m: 0.4, pos_deriva_m: 0.15, vib_corrida: 1.8, cuant: 0.1 };
const casos = [];
for (let n = 0; n < 6; n++) casos.push(['clas' + n, C.simularSesion({ gps_hz: 1, lag_gps: 0.25, seed: 1000 + n, acc_hz: 60 })]);
for (let n = 0; n < 3; n++) casos.push(['diez' + n, C.simularSesion({ gps_hz: 10, lag_gps: 0.3, seed: 1100 + n, acc_hz: 60 })]);
for (let n = 0; n < 8; n++) casos.push(['real' + n, C.simularSesion(Object.assign({ seed: 9000 + n, acc_hz: 60, rapido: n % 2 === 0, incl_salto_deg: 12, incl_yaw_deg: 12 }, REAL))]);
{ // un salto falso del GPS
  const s = C.simularSesion({ gps_hz: 1, lag_gps: 0.3, seed: 9003, acc_hz: 60 });
  const k = s.gps.t.findIndex(t => t > s.verdad.t_arranque + 6); s.gps.v[k] += 4; casos.push(['salto', s]);
}
const zip = path.join(__dirname, '..', 'datos', 'reales', 'dragtrim_20261115_154941', 'dragtrim_20261115_154941.zip');
if (fs.existsSync(zip)) { const c = X.corridasDe([zip])[0]; casos.push(['pista', { gps: c.gps, acc: c.acc }]); }
const lin = [];
for (const [nom, s] of casos) {
  const g = s.gps, a = s.acc;
  fs.writeFileSync(path.join(out, nom + '_gps.csv'), g.t.map((_, i) => [g.t[i], g.v[i], g.hacc[i], g.lat[i], g.lon[i]].join(',')).join('\n') + '\n');
  fs.writeFileSync(path.join(out, nom + '_acc.csv'), a.t.map((_, i) => [a.t[i], a.ax[i], a.ay[i], a.az[i]].join(',')).join('\n') + '\n');
  for (const [modo, cfg] of [['nodos', {}], ['modelo', { fusion: 'modelo' }]]) {
    const R = C.procesar(g, a, cfg);
    lin.push([nom, modo, R.t0, R.tRo, R.calidad.latencia_gps_s, R.calidad.gps_descartadas, ...R.hitos.map(h => h.t), R.trampa_kmh].join(' '));
  }
}
fs.writeFileSync(path.join(out, 'js.txt'), lin.join('\n') + '\n');
fs.writeFileSync(path.join(out, 'casos.txt'), casos.map(x => x[0]).join('\n') + '\n');
console.log(casos.length + ' sesiones');
