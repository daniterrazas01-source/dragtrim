const C = require('../app/src/dragcore.js');
// GPS con salto falso a mitad de corrida + reposo largo en stage (como el sim anterior)
for (const opt of [{ stage_min: 0.8, stage_max: 3 }, { stage_min: 3, stage_max: 6 }]) {
  const e = [], ePts = []; let desc = 0, live = 0;
  for (let n = 0; n < 40; n++) {
    const s = C.simularSesion(Object.assign({ gps_hz: 1, lag_gps: 0.3, seed: 9000 + n, acc_hz: 60 }, opt));
    const k = s.gps.t.findIndex(t => t > s.verdad.t_arranque + 6); s.gps.v[k] += 4;   // salto de +14 km/h
    const det = new C.DetectorVivo({}); let L = null;
    s.gps.t.forEach((t, i) => det.feed(t, s.gps.v[i]).forEach(ev => { if (ev.tipo === 'arranque') L = ev; }));
    if (L && Math.abs(L.tBajo - s.verdad.t_arranque) < 1.5) live++;
    const R = C.procesar(s.gps, s.acc, { t_inicio_busqueda: L.tBajo - 0.5 });
    const Rp = C.procesar(s.gps, s.acc, { t_inicio_busqueda: L.tBajo - 0.5, fusion: 'puntos' });
    desc += R.calidad.gps_descartadas;
    e.push(Math.abs(R.hitos[4].t - s.verdad.t_hitos[4])); ePts.push(Math.abs(Rp.hitos[4].t - s.verdad.t_hitos[4]));
  }
  const f = a => `${(a.reduce((x, y) => x + y) / a.length * 1000).toFixed(0)} / ${(Math.max(...a) * 1000).toFixed(0)} ms`;
  console.log(JSON.stringify(opt), `vivo ${live}/40 | 1/4 con salto GPS: modelo ${f(e)} (descartadas ${desc}) | puntos ${f(ePts)}`);
}
