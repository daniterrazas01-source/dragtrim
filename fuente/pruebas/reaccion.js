// reaccion.js — Reacción de punta a punta: DragCore.simularSesion → procesar() (tRo) + semaforo_sim (árbol) → Semaforo.analizar
// Criterios: archivo/ideas/semaforo_real/plan.md §6 (reaccion.js). Uso: node reaccion.js [corridas] — sale con 1 si algo falla.
'use strict';
const P = __dirname + '/../app/src/';
const C = require(P + 'dragcore.js'), S = require(P + 'semaforo.js'), Sim = require(P + 'semaforo_sim.js');
const N = +(process.argv[2] || 16), LAT_IMU = 0.010;

function stats(a) {
  const m = a.reduce((x, y) => x + y, 0) / a.length, s = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
  const ab = a.map(Math.abs).sort((x, y) => x - y);
  return { n: a.length, m, s, p95: ab[Math.min(ab.length - 1, Math.floor(0.95 * ab.length))] };
}
// sesión de sensores + árbol simulado con el mismo arranque
function caso(i, o) {
  o = o || {};
  const ses = C.simularSesion({ seed: 4000 + i });
  const desf = (a) => Object.assign({}, a, { t: a.t.map((x) => x + LAT_IMU) });     // mismo reloj que el giroscopio
  const gps = desf(ses.gps), acc = desf(ses.acc);
  const cfg = Object.assign(C.defaultConfig(), o.cfgCore || {});
  const R = C.procesar(gps, acc, cfg);
  const rt = isFinite(o.rt_s) ? o.rt_s : 0.03 + 0.45 * ((i * 0.6180339887) % 1);
  const esc = Sim.desdeSesion(ses, Object.assign({ rt_s: rt, tipo: i % 3 ? 'pro' : 'full', carril: i % 2 ? 'der' : 'izq', fps: o.fps || 60, seed: 4000 + i,
    lat_cam_s: 0.02 + 0.06 * ((i * 0.37) % 1), lat_imu_s: LAT_IMU }, o.escena || {}));
  const r = Sim.simular(esc), v = r.verdad;
  const ctx = Object.assign({ carril: esc.carril, arbol: 'auto', tRo: R.tRo, R, giro: o.sinGiro ? null : r.giro, hora_quieto: v.hora_quieto }, o.ctx || {});
  const A = S.analizar(r.cuadros, ctx);
  return { ses, R, r, v, A, ctx, verdad_rt: v.rt_boleta_s };
}

const fallas = [];
const meta = (nombre, val, lim, cmp) => {
  const bien = cmp === '>=' ? val >= lim : (cmp === '==' ? val === lim : Math.abs(val) <= lim);
  console.log(`  ${bien ? 'bien' : 'FALLA'}  ${nombre}: ${typeof val === 'number' ? val.toFixed(2) : val} (meta ${cmp === '>=' ? '≥' : cmp === '==' ? '=' : '≤'} ${lim})`);
  if (!bien) fallas.push(nombre);
};

// 1) Solo cámara (se ve el stage apagarse), 60 fps
const vistos = [];   // se reutilizan en 2b
let sesgoCam = NaN;
{
  const e = [], met = {};
  for (let i = 0; i < N; i++) {
    const c = caso(i);
    if (!c.A.rt || !c.A.rt.ok) { met.sin = (met.sin || 0) + 1; continue; }
    met[c.A.rt.metodo] = (met[c.A.rt.metodo] || 0) + 1;
    if (c.A.rt.metodo === 'camara') { e.push((c.A.rt.rt_boleta - c.verdad_rt) * 1e3); vistos.push(c); }
  }
  const s = stats(e); sesgoCam = s.m;
  console.log(`Solo cámara 60 fps: ${s.n}/${N} (${JSON.stringify(met)}) error ${s.m.toFixed(1)} ± ${s.s.toFixed(1)} ms, p95 ${s.p95.toFixed(1)}`);
  meta('cámara: corridas con stage visto', s.n / N, 0.9, '>=');
  meta('cámara: |sesgo| ms', s.m, 2); meta('cámara: σ ms', s.s, 9);
}
// 2) Sin stage visible (no se apaga): acelerómetro + K1. El error tiene dos partes: la de procesar() (cruce de 1 ft; σ ~12 ms,
//    ya medida por mc.js) y la del semáforo (K1 + ámbar). Con 16 corridas el promedio de la primera varía ±3 ms, así que el
//    sesgo se mide por partes: procesar() en 200 sesiones (rápido, sin cámara) + el semáforo en estas corridas.
{
  const e = [], es = [], eRo = [], k1 = [];
  for (let i = 0; i < N; i++) {
    const c = caso(i, { escena: { stage_se_apaga: false } });
    if (!c.A.rt || !c.A.rt.ok) continue;
    if (c.A.k1 && c.A.k1.ok) k1.push((c.A.k1.delta_s - c.v.k1.delta_s) * 1e3);
    if (c.A.rt.metodo === 'acel' && c.A.rt.delta.fuente === 'k1') {
      const r = (c.R.tRo - LAT_IMU - c.ses.verdad.t_ro_abs) * 1e3, x = (c.A.rt.rt_boleta - c.verdad_rt) * 1e3;
      e.push(x); eRo.push(r); es.push(x - r);
    }
  }
  const ro = [];
  for (let i = 0; i < 200; i++) {
    const ses = C.simularSesion({ seed: 4000 + i }), R = C.procesar(ses.gps, ses.acc, C.defaultConfig());
    if (R.ok) ro.push((R.tRo - ses.verdad.t_ro_abs) * 1e3);
  }
  const s = stats(e), ss = stats(es), sr = stats(eRo), s200 = stats(ro), sk = k1.length ? stats(k1) : null;
  console.log(`Acelerómetro + K1: ${s.n}/${N} error ${s.m.toFixed(1)} ± ${s.s.toFixed(1)} ms, p95 ${s.p95.toFixed(1)} · K1 ${sk ? sk.m.toFixed(1) + ' ± ' + sk.s.toFixed(1) + ' ms (' + sk.n + ')' : '—'}`);
  console.log(`  por partes: procesar() ${sr.m.toFixed(1)} ± ${sr.s.toFixed(1)} ms en estas corridas (${s200.m.toFixed(1)} ± ${s200.s.toFixed(1)} en ${s200.n}) · semáforo ${ss.m.toFixed(1)} ± ${ss.s.toFixed(1)} ms`);
  meta('acel+K1: corridas con K1', s.n / N, 0.8, '>=');
  meta('acel+K1, parte del semáforo: |sesgo| ms', ss.m, 2); meta('acel+K1, parte del semáforo: σ ms', ss.s, 9);
  meta('acel+K1: |sesgo| ms (procesar en 200 + semáforo)', s200.m + ss.m, 5); meta('acel+K1: σ ms', s.s, 18); meta('acel+K1: p95 ms', s.p95, 35);
}
// 2b) Fusión cámara + acelerómetro con el sesgo aprendido (K2) de 5 corridas con el stage visto: σ ≤ 8 (las corridas de 1 sirven
//     de prueba; el sesgo se aprende de otras 5). El acelerómetro pesa ~10 %: lo que mueve el sesgo es el azar de procesar() entre
//     las 5 corridas y estas, por eso se compara con el de solo cámara en las mismas corridas.
{
  const runs = [];
  for (let i = 0; i < 5; i++) { const c = caso(50 + i); if (c.A.rt && c.A.rt.ok) runs.push({ cfg: { rollout_ft: 1 }, cam: { rt: c.A.rt, k1: c.A.k1, cfg: { carril: c.ctx.carril } } }); }
  const cal = S.calibracion(runs, { rollout_ft: 1 });
  const e = []; let fus = 0;
  for (const c of vistos) {
    const r = S.reaccionDe(c.A.sec, Object.assign({}, c.ctx, { k1: c.A.k1, sesgo_acel_s: cal.sesgo_acel_s, n_sesgo: cal.n_sesgo }));
    if (!r.ok) continue;
    if (r.metodo === 'camara+acel') fus++;
    e.push((r.rt_boleta - c.verdad_rt) * 1e3);
  }
  const s = stats(e);
  console.log(`Fusión (sesgo aprendido ${(cal.sesgo_acel_s * 1e3).toFixed(1)} ms de ${cal.n_sesgo}): ${fus}/${vistos.length} fusionadas, error ${s.m.toFixed(1)} ± ${s.s.toFixed(1)} ms, p95 ${s.p95.toFixed(1)}`);
  meta('fusión: sesgo aprendido de 5 corridas', cal.n_sesgo, 5, '==');
  meta('fusión: corridas fusionadas', vistos.length ? fus / vistos.length : 0, 0.9, '>=');
  meta('fusión: sesgo agregado sobre solo cámara (ms)', s.m - sesgoCam, 2); meta('fusión: σ ms', s.s, 8);
}
// 3) Sin giroscopio ni stage: δ supuesto → siempre nivel 'baja'
{
  let baja = 0, n = 0;
  for (let i = 0; i < Math.min(N, 6); i++) {
    const c = caso(i, { sinGiro: true, escena: { stage_se_apaga: false } });
    if (!c.A.rt || !c.A.rt.ok) continue;
    n++; if (c.A.rt.nivel === 'baja' && c.A.rt.calibrado === false) baja++;
  }
  meta(`δ supuesto → nivel baja (${baja}/${n})`, n ? baja / n : 0, 1, '>=');
}
// 4) Recalcular con otro rollout: la RT por acelerómetro cambia lo mismo que tRo; la de cámara no cambia
{
  const c = caso(3, { escena: { stage_se_apaga: false } }), c2 = caso(4);
  const R05 = C.procesar(desfTodo(c.ses.gps), desfTodo(c.ses.acc), Object.assign(C.defaultConfig(), { rollout_ft: 0.5 }));
  const a = S.reaccionDe(c.A.sec, Object.assign({}, c.ctx, { tRo: c.R.tRo, R: c.R, k1: c.A.k1 }));
  const b = S.reaccionDe(c.A.sec, Object.assign({}, c.ctx, { tRo: R05.tRo, R: R05, k1: c.A.k1 }));
  meta('acel: ΔRT − ΔtRo (s)', (b.rt_boleta - a.rt_boleta) - (R05.tRo - c.R.tRo), 1e-6);
  const R05b = C.procesar(desfTodo(c2.ses.gps), desfTodo(c2.ses.acc), Object.assign(C.defaultConfig(), { rollout_ft: 0.5 }));
  const ca = S.reaccionDe(c2.A.sec, Object.assign({}, c2.ctx, { tRo: c2.R.tRo, R: c2.R, k1: c2.A.k1 }));
  const cb = S.reaccionDe(c2.A.sec, Object.assign({}, c2.ctx, { tRo: R05b.tRo, R: R05b, k1: c2.A.k1 }));
  if (ca.metodo === 'camara') meta('cámara: RT igual con otro rollout (s)', cb.rt_boleta - ca.rt_boleta, 1e-6);
  // rollout medido por la cámara con el configurado en 0.5 ft: el haz real va a 1 ft
  const rm = S.rolloutMedido(R05b, c2.A.rt.L_cam + (c2.A.k1 && c2.A.k1.ok ? c2.A.k1.delta_s : 0));
  if (isFinite(rm)) meta('rollout medido ≈ 1 ft (diferencia)', rm - 1.0, 0.1);
}
function desfTodo(a) { return Object.assign({}, a, { t: a.t.map((x) => x + LAT_IMU) }); }
// 4b) El rollout configurado no cambia dónde se busca el apagado del stage (se centra en el cruce de 1 ft):
//     con rollout 0 (tRo = primer movimiento, ~0.4 s antes) la reacción por cámara sale igual
{
  let n = 0, iguales = 0;
  for (let i = 0; i < 6; i++) {
    const c = caso(30 + i), R0 = C.procesar(desfTodo(c.ses.gps), desfTodo(c.ses.acc), Object.assign(C.defaultConfig(), { rollout_ft: 0 }));
    const A0 = S.analizar(c.r.cuadros, Object.assign({}, c.ctx, { tRo: R0.tRo, R: R0 }));
    if (!(c.A.rt && c.A.rt.ok && c.A.rt.metodo === 'camara')) continue;
    n++;
    if (A0.rt && A0.rt.ok && A0.rt.metodo === 'camara' && Math.abs(A0.rt.rt_boleta - c.A.rt.rt_boleta) < 1e-6) iguales++;
  }
  meta(`rollout 0: misma reacción por cámara (${iguales}/${n})`, n ? iguales / n : 0, 1, '>=');
}
// 5) CSV de ida y vuelta: reanalizar da la misma RT
{
  const c = caso(5);
  const csv = S.aCSV(c.A.rasgos, c.A.crudos);
  const back = S.deCSV(csv);
  const re = S.reanalizar({ rasgos: back.rasgos, disp: c.A.disp, mov: c.A.mov, k1: c.A.k1 }, c.ctx);
  meta('CSV → reanalizar: misma RT (s)', (re.rt && re.rt.ok ? re.rt.rt_boleta : NaN) - c.A.rt.rt_boleta, 1e-6);
}
// 5b) Árbol Pro a .370 o .350 (NHRA/Accutime): la verde vista sí se usa (no cae en "verde_dudosa") y las dos reacciones salen bien
{
  let n = 0, bien = 0;
  for (const [i, d] of [[40, 0.370], [41, 0.350], [42, 0.370], [43, 0.350]]) {
    const c = caso(i, { escena: { tipo: 'pro', delta_s: d } }), s = c.A.sec || {}, r = c.A.rt || {};
    n++;
    const verde = s.ok && !(s.avisos || []).includes('verde_dudosa') && Math.abs(s.delta_s - d) < 0.03;
    if (verde && r.ok && Math.abs(r.rt_boleta - c.verdad_rt) < 0.03 && Math.abs(r.rt_verde - c.v.rt_s) < 0.03) bien++;
  }
  meta(`árbol Pro .370/.350: verde usada y reacciones bien (${bien}/${n})`, bien / n, 1, '>=');
}
// 5c) Árbol elegido en Medir (Pro .400 o Full .500): con el correcto da lo mismo que leyendo los dos tipos; con el
//     equivocado se lee el otro y se avisa ('otro_arbol'), con la misma reacción
{
  let n = 0, igual = 0, avisa = 0;
  for (let k = 60; k < 66; k++) {
    const tipo = k % 3 ? 'pro' : 'full', otro = tipo === 'pro' ? 'full' : 'pro';   // el mismo tipo que arma caso()
    const c = caso(k);
    if (!(c.A.rt && c.A.rt.ok)) continue;
    n++;
    const bien = S.analizar(c.r.cuadros, Object.assign({}, c.ctx, { arbol: tipo }));
    const mal = S.analizar(c.r.cuadros, Object.assign({}, c.ctx, { arbol: otro }));
    const av = (A) => (A.sec && A.sec.avisos) || [];
    if (bien.rt && bien.rt.ok && Math.abs(bien.rt.rt_boleta - c.A.rt.rt_boleta) < 1e-6 && !av(bien).some((a) => /^otro_arbol/.test(a))) igual++;
    if (mal.rt && mal.rt.ok && mal.sec.tipo === tipo && av(mal).includes('otro_arbol ' + tipo) && Math.abs(mal.rt.rt_boleta - c.A.rt.rt_boleta) < 1e-6) avisa++;
  }
  meta(`árbol elegido correcto: igual que leyendo los dos tipos (${igual}/${n})`, n ? igual / n : 0, 1, '>=');
  meta(`árbol elegido equivocado: lee el otro y avisa (${avisa}/${n})`, n ? avisa / n : 0, 1, '>=');
}
// 6) Luz roja con RT de −0.05
{
  let roja = 0, n = 0;
  for (let i = 0; i < 6; i++) { const c = caso(20 + i, { rt_s: -0.05 }); n++; if (c.A.rt && c.A.rt.roja) roja++; }
  meta(`roja con RT −0.05 (${roja}/${n})`, roja / n, 1, '>=');
}
if (fallas.length) { console.log(`\nNO CUMPLE: ${fallas.join(', ')}`); process.exit(1); }
console.log('\nTodo cumple.');
