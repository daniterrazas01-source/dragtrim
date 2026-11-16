// Condiciones "como en la pista" (lo que se vio en la corrida real del 15 nov 2026, S22 Ultra):
// la velocidad GPS es el promedio del último segundo, la posición GPS llega a tiempo y es suave, el acelerómetro
// vibra mucho y marca de 0.1 en 0.1, y el teléfono se inclina y gira en su soporte al arrancar (con golpe).
// Compara la fusión por nodos (v2.4, la de la app) contra la de antes (modelo: deriva + escala, v2.3).
//   node real.js [N]      N = sesiones por escenario (40)
const C = require('../app/src/dragcore.js');
const N = +(process.argv[2] || 40);
const BASE = { gps_hz: 1, lag_gps: 0.08, gps_vel_media_s: 1, pos_ruido_m: 0.4, pos_deriva_m: 0.15, vib_corrida: 1.8, cuant: 0.1 };
const ESC = [
  ['teléfono firme', BASE],
  ['teléfono que se inclina 12°', Object.assign({}, BASE, { incl_salto_deg: 12, incl_yaw_deg: 12 })],
  ['auto rápido, teléfono firme', Object.assign({}, BASE, { rapido: true })],
  ['auto rápido, se inclina 12°', Object.assign({}, BASE, { rapido: true, incl_salto_deg: 12, incl_yaw_deg: 12 })],
  ['auto rápido, 12°, posición GPS mala', Object.assign({}, BASE, { rapido: true, incl_salto_deg: 12, incl_yaw_deg: 12, pos_ruido_m: 1.5, pos_deriva_m: 0.3 })],
  ['GPS a 2 Hz, se inclina 8°', Object.assign({}, BASE, { gps_hz: 2, gps_vel_media_s: 0.5, incl_salto_deg: 8, incl_yaw_deg: 8 })],
];
const VAR = [['nodos (v2.4)', {}], ['modelo (v2.3)', { fusion: 'modelo', primer_pico: false }]];
const H = [0, 2, 4], HN = ['60 ft', '1/8', '1/4'];
let fallas = 0;
console.log('error de cada tiempo en ms: promedio / peor   (' + N + ' sesiones por escenario)');
for (const [nom, o] of ESC) {
  console.log(nom);
  for (const [vn, cfg] of VAR) {
    const e = H.map(() => []); let mal = 0;
    for (let n = 0; n < N; n++) {
      const s = C.simularSesion(Object.assign({ seed: 9000 + n, acc_hz: 60 }, o));
      const R = C.procesar(s.gps, s.acc, Object.assign({}, cfg));
      if (!R.ok || !R.completo) { mal++; continue; }
      H.forEach((h, i) => e[i].push(Math.abs(R.hitos[h].t - s.verdad.t_hitos[h])));
    }
    const pr = e.map(x => x.reduce((a, b) => a + b, 0) / x.length * 1000), pe = e.map(x => Math.max(...x) * 1000);
    console.log('  ' + vn.padEnd(14) + H.map((_, i) => `${HN[i]} ${pr[i].toFixed(0).padStart(3)} / ${pe[i].toFixed(0).padStart(3)}`).join('   ') + (mal ? `   sin terminar ${mal}` : ''));
    // la fusión de la app no debe pasar de esto (hoy anda en 15-50 ms de promedio y 50-200 de peor caso)
    if (cfg.fusion !== 'modelo' && (mal || pr[2] > 70 || pe[2] > 300)) fallas++;
  }
}
console.log('FALLAS: ' + fallas);
process.exit(fallas ? 1 : 0);
