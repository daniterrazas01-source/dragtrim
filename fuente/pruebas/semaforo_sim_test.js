// Validación del simulador del árbol (fuente/app/src/semaforo_sim.js) por sí mismo:
//  A. integral exacta de la lámpara contra muestreo fino
//  B. lo pintado corresponde a los tiempos verdaderos (fracción encendida por cuadro y por fila)
//  C. posiciones de los focos, "abajo" y "derecha" con rotaciones
//  D. reproducible con la semilla
//  E. conversión YUV idéntica a Semaforo.Anillo
//  F. hora de los cuadros (cap / media / indice) contra la verdad
//  G. giroscopio e imagen con el mismo θ(t): δ recuperado = verdad.k1.delta_s
//  H. desenfoque conserva la luz; I. tramos por foco (Pro/Full, roja, otro carril); J. velocidad
// Uso: node semaforo_sim_test.js [--rapido]. Sale con código 1 si algo falla.
'use strict';
const path = require('path');
const S = require(path.join(__dirname, '../app/src/semaforo_sim.js'));
const Sem = require(path.join(__dirname, '../app/src/semaforo.js'));
const crypto = require('crypto');
const rapido = process.argv.includes('--rapido');

let fallas = 0;
function ok(cond, msg) { console.log((cond ? '  ok   ' : '  FALLA ') + msg); if (!cond) fallas++; }
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : String(x));
const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const hash = (...arrs) => { const h = crypto.createHash('sha1'); for (const a of arrs) h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); return h.digest('hex').slice(0, 12); };
const mediana = (a) => { const b = Array.from(a).sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const std = (a) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
const p95abs = (a) => { const b = a.map(Math.abs).sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(0.95 * b.length))]; };

// luz lineal (canal G + R + B) sumada en el disco de radio rr alrededor de (x, y), desde RGBA
function energiaRGBA(rgba, w, h, x, y, rr, filas) {
  let s = 0;
  for (let j = Math.max(0, Math.floor(y - rr)); j <= Math.min(h - 1, Math.ceil(y + rr)); j++) {
    if (filas && !filas(j)) continue;
    for (let i = Math.max(0, Math.floor(x - rr)); i <= Math.min(w - 1, Math.ceil(x + rr)); i++) {
      if ((i - x) ** 2 + (j - y) ** 2 > rr * rr) continue;
      const q = (j * w + i) * 4; s += LIN[rgba[q]] + LIN[rgba[q + 1]] + LIN[rgba[q + 2]];
    }
  }
  return s;
}

// ------------------------------------------------------------------ A
console.log('A. Integral exacta de la lámpara vs muestreo fino (punto medio, dt = 2e-7 s)');
{
  const rnd = S._util.mulberry32(5);
  let peor = 0, n = 0;
  const casos = [
    { tipo: 'led' }, { tipo: 'inc', tr_s: 0.02 }, { tipo: 'inc', tr_s: 0.045, tf_s: 0.01 }, { tipo: 'inc', tr_s: 0.08 },
    { tipo: 'led', pwm: { f_hz: 200, duty: 0.5, fase: 0.3 } }, { tipo: 'led', pwm: { f_hz: 1000, duty: 0.3, fase: 0.7 } },
  ];
  for (const c of casos) for (let rep = 0; rep < (rapido ? 15 : 40); rep++) {
    // tramos con huecos cortos (memoria de la incandescente)
    const t0 = 10 * rnd(), tr = [[t0, t0 + 0.03 + 0.2 * rnd()]]; tr.push([tr[0][1] + 0.01 + 0.05 * rnd(), tr[0][1] + 0.3]);
    const L = S.lampara(tr, c);
    const E = [0.0003, 0.004, 0.008, 0.016][rep % 4], a = t0 - 0.01 + 0.45 * rnd();
    const ex = L.integral(a, a + E);
    const dt = 2e-7, m = Math.round(E / dt); let num = 0;
    for (let k = 0; k < m; k++) num += L.valor(a + (k + 0.5) * dt) * dt;
    const err = Math.abs(ex - num) / E; if (err > peor) peor = err; n++;
  }
  // continuidad de la incandescente: la integral sobre [a,c] = [a,b] + [b,c]
  const L = S.lampara([[1, 1.05], [1.07, 2]], { tipo: 'inc', tr_s: 0.03 });
  const ad = Math.abs(L.integral(0.99, 1.2) - L.integral(0.99, 1.061) - L.integral(1.061, 1.2));
  ok(peor < 2e-3, `${n} ventanas, error máximo ${(peor * 100).toFixed(4)} % de E (cota del muestreo: discontinuidades × dt/E)`);
  ok(ad < 1e-12, `aditividad de la integral (inc): ${ad.toExponential(1)}`);
}

// ------------------------------------------------------------------ B
console.log('B. Lo pintado corresponde a los tiempos verdaderos');
{
  const base = { fondo: 'liso', ruido: 0, vibracion: null, cabeceo: null, ganancia: { deriva: 0 }, contraste: 1.5, seed: 3 };
  for (const [nm, extra] of [['LED E=T/2', { E_T: 0.5 }], ['LED E=0.3 ms', { E_s: 0.0003 }], ['incand. τr 40 ms E=T/2', { E_T: 0.5, lampara: { tipo: 'inc', tr_s: 0.04 } }]]) {
    const E = S.escena(Object.assign({}, base, extra)), V = E.verdad, F = V.disp.focos.izq.a3, Ex = V.E_s;
    const L = E.lamparas.find((l) => l.id === 'izq.a3').L;
    const off = energiaRGBA(S.pintar(E, V.t_ambar_ref - 0.2), E.w, E.h, F.x, F.y, 1.6 * F.r);
    const on = energiaRGBA(S.pintar(E, V.t_ambar_ref + 0.3), E.w, E.h, F.x, F.y, 1.6 * F.r);
    let peor = 0;
    for (let k = -30; k <= 30; k++) {
      const t = V.t_ambar_ref + k * 0.0011;
      const fr = (energiaRGBA(S.pintar(E, t), E.w, E.h, F.x, F.y, 1.6 * F.r) - off) / (on - off);
      const esp = L.integral(t - Ex / 2, t + Ex / 2) / Ex / (L.integral(V.t_ambar_ref + 0.3 - Ex / 2, V.t_ambar_ref + 0.3 + Ex / 2) / Ex);
      peor = Math.max(peor, Math.abs(fr - esp));
    }
    ok(peor < 0.01, `${nm}: fracción encendida medida vs ∫lámpara/E, error máx ${peor.toFixed(4)}`);
  }
  // rolling shutter: cada fila con su propio retraso; y la verde/stage en su lugar
  const E = S.escena(Object.assign({}, base, { E_T: 0.5, R_s: 0.03 })), V = E.verdad, F = V.disp.focos.izq.a3, Ex = V.E_s;
  let peor = 0;
  const offI = S.pintar(E, V.t_ambar_ref - 0.2), onI = S.pintar(E, V.t_ambar_ref + 0.3);
  for (let k = -12; k <= 12; k++) {
    const t = V.t_ambar_ref + k * 0.0013, im = S.pintar(E, t);
    for (const j of [Math.round(F.y) - 2, Math.round(F.y), Math.round(F.y) + 2]) {
      const fil = (jj) => jj === j;
      const fr = (energiaRGBA(im, E.w, E.h, F.x, F.y, 1.2 * F.r, fil) - energiaRGBA(offI, E.w, E.h, F.x, F.y, 1.2 * F.r, fil)) /
        (energiaRGBA(onI, E.w, E.h, F.x, F.y, 1.2 * F.r, fil) - energiaRGBA(offI, E.w, E.h, F.x, F.y, 1.2 * F.r, fil));
      const dtf = E.dtFila(j), esp = Math.max(0, Math.min(1, (t + dtf + Ex / 2 - V.t_ambar_ref) / Ex));
      peor = Math.max(peor, Math.abs(fr - esp));
    }
  }
  ok(peor < 0.015, `rolling shutter R_s = 30 ms: fracción por fila vs t + R_s·(y − centro)/H, error máx ${peor.toFixed(4)}`);
}

// ------------------------------------------------------------------ C
console.log('C. Posiciones de los focos, "abajo" y "derecha" (rotaciones)');
for (const rot of [0, 90, 180, 270, 17]) {
  // sin halo: el halo de los vecinos mueve el centroide (eso es físico y también lo ve el detector)
  const E = S.escena({ rot, fondo: 'negro', ruido: 0, vibracion: null, cabeceo: null, ganancia: { deriva: 0 }, halo: { k: 0 }, tipo: 'pro', seed: 9, w: 256, h: 256 });
  const V = E.verdad, t = V.t_ambar_ref + 0.1, im = S.pintar(E, t);
  let peor = 0;
  for (const lado of ['izq', 'der']) for (const f of ['a1', 'a2', 'a3']) {
    const F = V.disp.focos[lado][f], rr = 1.4 * F.r;
    let sw = 0, sx = 0, sy = 0;
    for (let j = Math.floor(F.y - rr); j <= Math.ceil(F.y + rr); j++) for (let i = Math.floor(F.x - rr); i <= Math.ceil(F.x + rr); i++) {
      if (i < 0 || j < 0 || i >= E.w || j >= E.h || (i - F.x) ** 2 + (j - F.y) ** 2 > rr * rr) continue;
      const q = (j * E.w + i) * 4, v = LIN[im[q]] + LIN[im[q + 1]] + LIN[im[q + 2]]; sw += v; sx += v * i; sy += v * j;
    }
    peor = Math.max(peor, Math.hypot(sx / sw - F.x, sy / sw - F.y));
  }
  const fz = V.disp.focos, u = [fz.izq.a3.x - fz.izq.a1.x, fz.izq.a3.y - fz.izq.a1.y], nu = Math.hypot(...u);
  const du = Math.hypot(u[0] / nu - V.disp.abajo[0], u[1] / nu - V.disp.abajo[1]);
  const der = [V.disp.abajo[1], -V.disp.abajo[0]];      // convención de la visión: derecha = (û_y, −û_x)
  const pi = fz.izq.a1.x * der[0] + fz.izq.a1.y * der[1], pd = fz.der.a1.x * der[0] + fz.der.a1.y * der[1];
  ok(peor < 0.03 && du < 1e-9 && pi < pd && Math.hypot(der[0] - V.disp.derecha[0], der[1] - V.disp.derecha[1]) < 1e-9,
    `rot ${String(rot).padStart(3)}°: centroide vs verdad ≤ ${peor.toFixed(3)} px; û = a1→a3; izquierda = menor proyección sobre (û_y, −û_x)`);
}

// ------------------------------------------------------------------ D
console.log('D. Reproducible con la semilla');
{
  const o = { seed: 42, t_inicio: 3.0, t_fin: 6.5, distractores: [{ tipo: 'freno' }, { tipo: 'reflejo' }], R_s: 0.02, pwm: { f_hz: 400, duty: 0.5 } };
  const a = S.simular(o), b = S.simular(o), c = S.simular(Object.assign({}, o, { seed: 43 }));
  const ha = hash(a.cuadros.datos, a.cuadros.t, a.giro.t, a.giro.b), hb = hash(b.cuadros.datos, b.cuadros.t, b.giro.t, b.giro.b), hc = hash(c.cuadros.datos, c.cuadros.t);
  ok(ha === hb, `misma semilla → mismos bytes (${ha}, ${a.cuadros.n} cuadros)`);
  ok(ha !== hc, `otra semilla → otros bytes (${hc})`);
  const E = a.escena, k = 20, im = S.pintar(E, a.verdad.t_cuadros[k]);
  const y = S.aYUV(im, E.w, E.h, 'yuv420'), d = a.cuadros.datos.subarray(k * a.cuadros.tam, (k + 1) * a.cuadros.tam);
  ok(Buffer.compare(Buffer.from(y), Buffer.from(d)) === 0, 'cuadro k de simular = pintar(escena, verdad.t_cuadros[k]) byte a byte');
  const f = S.simular(Object.assign({}, o, { anillo: false }));
  ok(Buffer.compare(Buffer.from(f.cuadros.datos), Buffer.from(a.cuadros.datos)) === 0 && f.cuadros.t.every((x, i) => Math.abs(x - a.cuadros.t[i]) < 1e-9),
    'sin Semaforo.Anillo (anillo:false) salen los mismos cuadros y horas (fuente cap)');
  const m = S.simular(Object.assign({}, o, { mem_mb: 4 }));
  ok(m.cuadros.n < a.cuadros.n && m.verdad.t_cuadros.length === m.cuadros.n && Math.abs(m.verdad.t_cuadros[m.cuadros.n - 1] - a.verdad.t_cuadros[a.cuadros.n - 1]) < 1e-12,
    `anillo de 4 MB: quedan los últimos ${m.cuadros.n} de ${a.cuadros.n} cuadros, con su verdad alineada`);
  const y8 = S.simular(Object.assign({}, o, { fmt: 'y8' }));
  ok(y8.cuadros.fmt === 'y8' && y8.cuadros.tam === E.w * E.h && Buffer.compare(Buffer.from(y8.cuadros.datos.subarray(0, E.w * E.h)), Buffer.from(a.cuadros.datos.subarray(0, E.w * E.h))) === 0, 'fmt y8: mismo plano Y');
}

// ------------------------------------------------------------------ E
console.log('E. YUV idéntico a Semaforo.Anillo');
{
  const rnd = S._util.mulberry32(77), w = 34, h = 22, rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = Math.floor(256 * rnd());
  for (const fmt of ['yuv420', 'y8']) {
    const an = new Sem.Anillo({ w, h, fmt, capacidad: 2 }); an.push(rgba, { cb: 1 });
    const mio = S.aYUV(rgba, w, h, fmt);
    ok(Buffer.compare(Buffer.from(mio), Buffer.from(an.datos.subarray(0, an.tam))) === 0, `aYUV(${fmt}) = Anillo.push`);
  }
}

// ------------------------------------------------------------------ F
console.log('F. Hora de los cuadros (Semaforo.reloj sobre lo que entrega el simulador)');
for (const ft of ['cap', 'media', 'indice']) for (const fps of [60, 30]) {
  const R = [];
  let fuenteOk = true, perd = [];
  for (let s = 0; s < (rapido ? 3 : 8); s++) {
    const r = S.simular({ seed: 100 + s, fps, fuente_t: ft, t_inicio: 0.5, t_fin: 9.5, fondo: 'negro', ruido: 0, vibracion: null, cabeceo: null, lat_cam_s: 0.03 + 0.01 * s });
    const c = r.cuadros, v = r.verdad;
    if (c.reloj.fuente !== ft) fuenteOk = false;
    const d = []; for (let i = 0; i < c.n; i++) d.push(c.t[i] - v.t_cuadros[i]);
    const m = mediana(d), esp = ft === 'cap' ? 0 : v.lat_cam_s;
    R.push({ sesgo: (m - esp) * 1000, disp: std(d.map((x) => x - m)) * 1000, p95: p95abs(d.map((x) => x - m)) * 1000 });
    perd.push(`${c.reloj.perdidos}/${v.perdidos_entrega}`);
  }
  const sg = R.map((x) => x.sesgo), ds = R.map((x) => x.disp), pp = R.map((x) => x.p95);
  const lim = ft === 'cap' ? 1e-6 : 1.0;
  ok(fuenteOk && Math.max(...ds) < (ft === 'cap' ? 1e-6 : 0.5), `${ft.padEnd(6)} ${fps} fps: fuente '${ft}'; t − verdad: desfase medio ${(sg.reduce((a, b) => a + b, 0) / sg.length).toFixed(3)} ms ` +
     `(vs lat_cam si no es cap), σ entre cuadros ${Math.max(...ds).toFixed(3)} ms, p95 ${Math.max(...pp).toFixed(3)} ms; perdidos reloj/entrega ${perd.slice(0, 3).join(' ')}`);
  if (ft !== 'cap') ok(Math.max(...sg.map(Math.abs)) < 4 * lim + 2, `${ft.padEnd(6)} ${fps} fps: el desfase de la envolvente ≈ lat_cam (|dif| máx ${Math.max(...sg.map(Math.abs)).toFixed(2)} ms; lo absorben K1/K3)`);
}

// ------------------------------------------------------------------ G
console.log('G. Giroscopio e imagen con el mismo θ(t): δ recuperado vs verdad.k1');
function centroides(c, x0, y0, rr) {        // centroide del punto brillante (plano Y lineal) cuadro a cuadro
  const out = [];
  for (let k = 0; k < c.n; k++) {
    const off = k * c.tam; let sw = 0, sx = 0, sy = 0;
    for (let j = Math.max(0, y0 - rr); j <= Math.min(c.h - 1, y0 + rr); j++) for (let i = Math.max(0, x0 - rr); i <= Math.min(c.w - 1, x0 + rr); i++) {
      const v = LIN[c.datos[off + j * c.w + i]]; sw += v; sx += v * i; sy += v * j;
    }
    out.push([sx / sw, sy / sw]);
  }
  return out;
}
function deltaK1(t, pos, giro, eje) {       // pos(t) ≈ c + f·θ(t + δ) + d·t  (mínimos cuadrados, rejilla 0.1 ms)
  const gt = giro.t, g = giro[eje], th = new Float64Array(gt.length);
  for (let i = 1; i < gt.length; i++) th[i] = th[i - 1] + 0.5 * (g[i] + g[i - 1]) * (gt[i] - gt[i - 1]) * Math.PI / 180;
  const interp = (x) => { let lo = 0, hi = gt.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (gt[m] <= x) lo = m; else hi = m; } return th[lo] + (th[hi] - th[lo]) * (x - gt[lo]) / (gt[hi] - gt[lo]); };
  const n = t.length, tm = t.reduce((a, b) => a + b, 0) / n;
  const fit = (dl) => {
    const X = t.map((x) => interp(x + dl));
    // regresión con 3 columnas [1, θ, t]: resolver 3×3
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
    for (let i = 0; i < n; i++) { const v = [1, X[i], t[i] - tm]; for (let p = 0; p < 3; p++) { b[p] += v[p] * pos[i]; for (let q = 0; q < 3; q++) A[p][q] += v[p] * v[q]; } }
    const M = A.map((r, i) => r.concat([b[i]]));
    for (let i = 0; i < 3; i++) { let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; [M[i], M[p]] = [M[p], M[i]]; for (let k = i + 1; k < 3; k++) { const f = M[k][i] / M[i][i]; for (let c2 = i; c2 < 4; c2++) M[k][c2] -= f * M[i][c2]; } }
    const cc = [0, 0, 0]; for (let i = 2; i >= 0; i--) { let s2 = M[i][3]; for (let k = i + 1; k < 3; k++) s2 -= M[i][k] * cc[k]; cc[i] = s2 / M[i][i]; }
    let e = 0; for (let i = 0; i < n; i++) { const r = pos[i] - cc[0] - cc[1] * X[i] - cc[2] * (t[i] - tm); e += r * r; }
    return { e, f: cc[1] };
  };
  let best = 0, be = Infinity;
  for (let dl = -0.15; dl <= 0.15; dl += 1e-4) { const e = fit(dl).e; if (e < be) { be = e; best = dl; } }
  return { delta: best, f: fit(best).f };
}
for (const [nm, extra, P0] of [['cap, R_s 0', { fuente_t: 'cap' }, [40, 100]], ['media, R_s 0', { fuente_t: 'media' }, [40, 100]], ['cap, R_s 25 ms', { fuente_t: 'cap', R_s: 0.025 }, [40, 100]],
                               ['indice 30 fps', { fuente_t: 'indice', fps: 30 }, [40, 100]], ['cap rot 90', { fuente_t: 'cap', rot: 90 }, [140, 128]], ['media vibración', { fuente_t: 'media', vibracion: { amp_px: 2, f_hz: 31 } }, [40, 100]]]) {
  const errs = [], fs = [];
  for (let s = 0; s < (rapido ? 3 : 6); s++) {
    const o = Object.assign({ seed: 300 + s, fondo: 'negro', ruido: 0, vibracion: null, cabeceo: { amp_px: 30 + 10 * s, dur_s: 0.2 }, lat_cam_s: 0.04, lat_imu_s: 0.012,
      giro_ruido_dps: 0, giro_jitter_ms: 0, giro_sesgo_dps: 0, giro_hz: 100, distractores: [{ tipo: 'reflejo', pos: P0, vel: [0, 0], tramos: [[-1e9, 1e9]], r_px: 2.5, amp: 4 }] }, extra);
    const r = S.simular(o), c = r.cuadros, v = r.verdad;
    const ventana = [];
    for (let k = 0; k < c.n; k++) if (c.t[k] > v.cabeceo.t0 - 0.8 && c.t[k] < v.cabeceo.t0 + 0.6) ventana.push(k);
    const ax = v.k1.eje.img === 'x' ? 0 : 1;
    // el punto se mueve con el cabeceo: buscarlo siguiendo su desplazamiento verdadero
    const pos = [], tt = [];
    for (const k of ventana) {
      const d = S.desplazamiento(r.escena, v.t_cuadros[k]);
      const cc = centroides({ n: 1, tam: c.tam, w: c.w, h: c.h, datos: c.datos.subarray(k * c.tam, (k + 1) * c.tam) }, Math.round(P0[0] + d[0]), Math.round(P0[1] + d[1]), 9)[0];
      pos.push(cc[ax]); tt.push(c.t[k]);
    }
    const res = deltaK1(tt, pos, r.giro, v.k1.eje.giro);
    const dm = S.desplazamiento(r.escena, v.cabeceo.t0 + v.cabeceo.dur_s / 2);
    const dtSpot = r.escena.dtFila(P0[1] + dm[1]);                   // fila del punto a media subida del cabeceo
    const verdadSpot = v.lat_imu_s - v.desfase_cam_s + dtSpot;
    errs.push((res.delta - verdadSpot) * 1000); fs.push(Math.abs(res.f));
  }
  ok(Math.max(...errs.map(Math.abs)) < (extra.vibracion ? 2.0 : 0.5), `${nm.padEnd(15)}: δ recuperado − verdad = ${errs.map((x) => x.toFixed(2)).join(' ')} ms; |f| ${fs.map((x) => x.toFixed(0)).join(' ')} px/rad (f = 1000)`);
}

// ------------------------------------------------------------------ H
console.log('H. Desenfoque: conserva la luz y su centro sigue la trayectoria');
{
  const o = { fondo: 'negro', ruido: 0, vibracion: { amp_px: 3, f_hz: 31 }, cabeceo: { amp_px: 50, dur_s: 0.2 }, ganancia: { deriva: 0 }, E_T: 0.98, contraste: 0.6, halo: { k: 0 },
              otro: { presente: false }, seed: 5 };
  const E1 = S.escena(o), E0 = S.escena(Object.assign({}, o, { desenfoque: false })), V = E1.verdad, F = V.disp.focos.izq.g, Ex = V.E_s;
  let peorE = 0, peorC = 0, maxBlur = 0;
  const todo = (im, w, h) => energiaRGBA(im, w, h, w / 2, h / 2, 1e4);
  for (let k = 0; k < 14; k++) {
    const t = V.cabeceo.t0 + 0.01 + k * 0.012, a = S.pintar(E1, t), b = S.pintar(E0, t);
    peorE = Math.max(peorE, Math.abs(todo(a, E1.w, E1.h) / todo(b, E0.w, E0.h) - 1));
    // posición media del foco durante la exposición
    let mx = 0, my = 0, m = 400, d0 = S.desplazamiento(E1, t - Ex / 2), d1 = S.desplazamiento(E1, t + Ex / 2);
    for (let q = 0; q < m; q++) { const d = S.desplazamiento(E1, t - Ex / 2 + (q + 0.5) * Ex / m); mx += d[0] / m; my += d[1] / m; }
    maxBlur = Math.max(maxBlur, Math.hypot(d1[0] - d0[0], d1[1] - d0[1]));
    const cx = F.x + mx, cy = F.y + my, rr = 12;
    let sw = 0, sx = 0, sy = 0;
    for (let j = Math.floor(cy - rr); j <= Math.ceil(cy + rr); j++) for (let i = Math.floor(cx - rr); i <= Math.ceil(cx + rr); i++) {
      if (i < 0 || j < 0 || i >= E1.w || j >= E1.h || (i - cx) ** 2 + (j - cy) ** 2 > rr * rr) continue;
      const q = (j * E1.w + i) * 4, v = LIN[a[q]] + LIN[a[q + 1]] + LIN[a[q + 2]]; sw += v; sx += v * i; sy += v * j;
    }
    peorC = Math.max(peorC, Math.hypot(sx / sw - cx, sy / sw - cy));
  }
  ok(peorE < 0.005, `exposición ≈ T, cabeceo 50 px/0.2 s + vibración (barrido hasta ${maxBlur.toFixed(1)} px): luz total con/sin desenfoque, dif. máx ${(peorE * 100).toFixed(2)} %`);
  ok(peorC < 0.3, `centro del foco borroso = posición media durante la exposición (error máx ${peorC.toFixed(3)} px; submuestras cada ≤ 0.5 px)`);
}

// ------------------------------------------------------------------ I
console.log('I. Tramos de cada foco: Pro/Full, ámbares que se quedan, roja, otro carril, previas');
{
  const encendido = (E, id, t) => { const L = E.lamparas.find((l) => l.id === id); return L ? L.L.integral(t - 1e-4, t + 1e-4) > 1e-4 : null; };
  const Ef = S.escena({ tipo: 'full', t_ambar_ref: 10 }), Vf = Ef.verdad;
  ok(Vf.t_ambar.map((x) => x.toFixed(3)).join() === '9.000,9.500,10.000' && Math.abs(Vf.t_verde - 10.5) < 1e-12 && Vf.delta_s === 0.5, `Full: ámbares ${Vf.t_ambar.join(', ')}, verde ${Vf.t_verde}`);
  ok(encendido(Ef, 'izq.a1', 9.2) && !encendido(Ef, 'izq.a1', 9.7) && encendido(Ef, 'izq.a3', 10.2) && !encendido(Ef, 'izq.a3', 10.7) && encendido(Ef, 'izq.g', 10.7), 'Full: cada ámbar se apaga al prender el siguiente; verde prendida');
  const Eq = S.escena({ tipo: 'pro', t_ambar_ref: 10, ambar_se_apaga: false });
  ok(encendido(Eq, 'izq.a1', 10.6) && encendido(Eq, 'izq.g', 10.6), 'Pro con ámbares que se quedan');
  const Er = S.escena({ tipo: 'pro', t_ambar_ref: 10, rt_s: -0.05 }), Vr = Er.verdad;
  ok(Vr.roja && Math.abs(Vr.t_roja - Vr.t_stage_off) < 1e-12 && !Vr.verde_visible && encendido(Er, 'izq.r', 10.4) && !encendido(Er, 'izq.g', 10.5), `RT −0.05: roja al soltar el stage (t ${f3(Vr.t_roja)}), sin verde propia`);
  const Et = S.escena({ tipo: 'pro', t_ambar_ref: 10, rt_s: -0.05, roja: { truestart: true } });
  ok(Math.abs(Et.verdad.t_roja - 10.4) < 1e-12, 'TruSTART: la roja aparece a la hora de la verde');
  const Eh = S.escena({ tipo: 'pro', t_ambar_ref: 10, otro: { desfase_s: 0.7, rt_s: 0.3 } }), Vh = Eh.verdad;
  ok(Math.abs(Vh.otro.t_ambar_ref - 10.7) < 1e-12 && encendido(Eh, 'der.a1', 10.8) && !encendido(Eh, 'der.a1', 10.2) && Math.abs(Vh.otro.t_stage_off - 11.4) < 1e-12, 'handicap: la otra columna con su desfase y su salida');
  const En = S.escena({ otro: { desfase_s: null } }), Ea = S.escena({ otro: { presente: false } });
  ok(!En.verdad.otro.activo && En.lamparas.some((l) => l.lado === 'der') && !Ea.lamparas.some((l) => l.lado === 'der') && Ea.verdad.disp.focos.der === null, 'otro carril sin auto (apagado) y ausente (no se pinta)');
  const Ep = S.escena({ t_ambar_ref: 50, previas: [10] });
  ok(encendido(Ep, 'izq.a1', 10.2) && !encendido(Ep, 'izq.g', 13.5) && encendido(Ep, 'izq.g', 50.6) && encendido(Ep, 'der.g', 10.6), 'secuencia previa (otra pareja) en las dos columnas');
  const Es = S.escena({ t_ambar_ref: 10, stage_se_apaga: false });
  ok(encendido(Es, 'izq.stg', 11) && Math.abs(Es.verdad.rt_s - 0.35) < 1e-12, 'stage que no se apaga (controlador): sigue prendido después de salir');
  const ses = require(path.join(__dirname, '../app/src/dragcore.js')).simularSesion({ seed: 11 });
  const od = S.desdeSesion(ses, { rt_s: 0.2 }), Ed = S.escena(od);
  ok(Math.abs(Ed.verdad.t_stage_off - ses.verdad.t_ro_abs) < 1e-12 && Math.abs(Ed.verdad.t_verde - (ses.verdad.t_ro_abs - 0.2)) < 1e-12 && Math.abs(Ed.verdad.cabeceo.t0 - ses.verdad.t_arranque) < 1e-12, 'desdeSesion: stage = t_ro_abs, verde = L − RT, cabeceo desde t_arranque');
}

// ------------------------------------------------------------------ J
console.log('J. Velocidad');
{
  const casos = [
    ['día 160×256, 60 fps, 11 s', { t_inicio: 0, t_fin: 11, t_stage_off: 9 }],
    ['noche E≈T + cabeceo (desenfoque), 60 fps, 11 s', Object.assign(S.condicion('noche'), { t_inicio: 0, t_fin: 11, t_stage_off: 9 })],
    ['PWM + rolling shutter + distractores, 60 fps, 11 s', Object.assign(S.condicion('pwm400'), { t_inicio: 0, t_fin: 11, t_stage_off: 9, distractores: [{ tipo: 'freno' }, { tipo: 'intermitente' }, { tipo: 'reflejo' }] })],
    ['día + vista general 240×136 cada 6, 60 fps, 11 s', { t_inicio: 0, t_fin: 11, t_stage_off: 9, vista: true, orig: [1280, 720] }],
    ['día 30 fps, 11 s', { fps: 30, t_inicio: 0, t_fin: 11, t_stage_off: 9 }],
  ];
  for (const [nm, o] of casos) {
    const r = S.simular(o);
    console.log(`  ${nm.padEnd(52)} ${r.stats.n_cuadros} cuadros (+${r.stats.n_vista} vista): ${r.stats.ms.toFixed(0)} ms en total, ${r.stats.ms_cuadro.toFixed(2)} ms/cuadro al pintar`);
  }
  const E = S.escena({}), t0 = Date.now(); for (let i = 0; i < 200; i++) S.pintar(E, 5 + i / 60);
  console.log(`  pintar() suelto 160×256: ${((Date.now() - t0) / 200).toFixed(2)} ms/cuadro (incluye crear el RGBA)`);
  const E2 = S.escena({ w: 640, h: 360, paso_px: 20, r_px: 7, r_stage_px: 3.5, sep_col_px: 44 }); S.pintar(E2, 1); const t1 = Date.now(); for (let i = 0; i < 60; i++) S.pintar(E2, 5 + i / 60);
  console.log(`  pintar() 640×360 (para captureStream en el navegador): ${((Date.now() - t1) / 60).toFixed(2)} ms/cuadro`);
}

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo bien.');
process.exit(fallas ? 1 : 0);
