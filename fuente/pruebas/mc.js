const C = require('../app/src/dragcore.js');
for (const [hz, lag] of [[1, 0.25], [1, 0.6], [10, 0.3]]) {
  const N = 40, E = [], EG = [], T0 = []; let live = 0, fus = 0;
  for (let n = 0; n < N; n++) {
    const s = C.simularSesion({ gps_hz: hz, lag_gps: lag, seed: 1000 + n, acc_hz: 60 });
    const det = new C.DetectorVivo({}); let launch = null, fin = null;
    s.gps.t.forEach((t, i) => { for (const e of det.feed(t, s.gps.v[i])) { if (e.tipo === 'arranque') launch = e; if (e.tipo === 'fin') fin = e; } });
    if (launch && Math.abs(launch.tBajo - s.verdad.t_arranque) < 1.5 && fin) live++;
    const R = C.procesar(s.gps, s.acc, { t_inicio_busqueda: launch ? launch.tBajo - 0.5 : -Infinity });
    const Rg = C.procesar(s.gps, s.acc, { usar_acc: false });
    if (R.calidad.metodo.startsWith('GPS +')) fus++;
    E.push(R.hitos.map((h, i) => Math.abs(h.t - s.verdad.t_hitos[i])));
    EG.push(Rg.hitos.map((h, i) => Math.abs(h.t - s.verdad.t_hitos[i])));
    T0.push(Math.abs(R.t0 - s.verdad.t_arranque));
  }
  const stat = (M, k) => { const c = M.map(r => r[k]); return (c.reduce((a, b) => a + b, 0) / c.length).toFixed(3) + '/' + Math.max(...c).toFixed(3); };
  console.log(`GPS ${hz} Hz, retraso ${lag}s: vivo OK ${live}/${N}, fusión ${fus}/${N}, max err t0 ${Math.max(...T0).toFixed(2)}s`);
  ['60ft', '330ft', '1/8', '1000ft', '1/4'].forEach((nm, k) => console.log(`  ${nm.padEnd(7)} fus ${stat(E, k)}   soloGPS ${stat(EG, k)}`));
}
