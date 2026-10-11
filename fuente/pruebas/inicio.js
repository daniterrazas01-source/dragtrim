// Precisión del punto inicial: error de tRo (cruce de 1 ft), del inicio de movimiento y de hitos
const C = require('../app/src/dragcore.js');
const variantes = JSON.parse(process.argv[2] || '[{}]');
for (const [hz, lag] of [[1, 0.3], [10, 0.3]]) {
  for (const v of variantes) {
    const N = 60, eRo = [], eT0 = [], e60 = [], eET = [], eETsr = [];
    for (let n = 0; n < N; n++) {
      const s = C.simularSesion({ gps_hz: hz, lag_gps: lag, seed: 5000 + n, acc_hz: 60 });
      const R = C.procesar(s.gps, s.acc, Object.assign({}, v));
      const R0 = C.procesar(s.gps, s.acc, Object.assign({}, v, { rollout_ft: 0 }));
      eRo.push(R.tRo - s.verdad.t_ro_abs); eT0.push(R.t0 - s.verdad.t_arranque);
      e60.push(R.hitos[0].t - s.verdad.t_hitos[0]); eET.push(R.hitos[4].t - s.verdad.t_hitos[4]);
      eETsr.push(R0.hitos[4].t - s.verdad.t_hitos_sin_ro[4]);
    }
    const st = (e) => { const m = e.reduce((a, b) => a + b, 0) / e.length; const ma = e.reduce((a, b) => a + Math.abs(b), 0) / e.length;
      return `sesgo ${(m*1000).toFixed(0).padStart(4)} ms | prom ${(ma*1000).toFixed(0).padStart(3)} | peor ${(Math.max(...e.map(Math.abs))*1000).toFixed(0).padStart(4)}`; };
    console.log(`GPS ${hz} Hz ${JSON.stringify(v)}`);
    console.log('  cruce 1 ft  ', st(eRo)); console.log('  inicio mov. ', st(eT0));
    console.log('  60 ft       ', st(e60)); console.log('  1/4 (ro)    ', st(eET)); console.log('  1/4 sin ro  ', st(eETsr));
  }
}
