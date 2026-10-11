/* dragcore.js — Algoritmo del medidor Drag Trim (port de drag_procesar.m v2.2)
 * Funciona en navegador (window.DragCore) y en Node (module.exports).
 * Unidades: tiempo [s], velocidad [m/s], distancia [m], aceleración [m/s^2].
 */
(function (root) {
  'use strict';

  const G0 = 9.80665;

  function defaultConfig() {
    return {
      version: 'beta 0.2 (algoritmo v2.3)',
      rollout_ft: 1.0,
      distancia_final: 402.336,
      hitos: [
        ['60 ft', 18.288],
        ['330 ft', 100.584],
        ['1/8 mi', 201.168],
        ['1000 ft', 304.8],
        ['1/4 mi', 402.336],
      ],
      dist_trampa_m: 20.1168,
      v_baja: 1.0,
      v_confirma: 50 / 3.6,
      t_confirma: 8.0,
      v_corrida: 3.0,
      v_quieto: 0.5,
      umbral_mov: 0.35,
      t_inicio_busqueda: -Infinity,
      usar_acc: true,
      fs: 100,
      suavizado_s: 0.10,
      ventana_fwd_s: 1.5,
      refinar_inicio: true,  // inicio por tangente + gravedad del reposo justo antes
      reposo_s: 0.7,         // s de reposo (en stage) usados para medir la gravedad
      pre_integracion_s: 0.2, // s antes del inicio desde donde se integra (auto aún quieto)
      fusion: 'modelo',      // 'modelo': corrección suave ajustada a todo el GPS; 'puntos': pasa por cada lectura
      peso_residuo: 0.5,     // en 'modelo', cuánto del residuo de cada lectura GPS se agrega
      latencia_gps_s: NaN,   // NaN = estimar
      latencia_max_s: 1.0,   // el navegador agrega algo de retraso al GPS
      t_parada_s: 5,
      margen_final_m: 15,
      t_max_corrida: 60,
    };
  }

  // ---------------------------------------------------------------- utilidades
  const isFin = Number.isFinite;

  function cruce(t, y, Y) {
    for (let k = 0; k < y.length; k++) {
      if (y[k] >= Y) {
        if (k === 0) return t[0];
        return t[k - 1] + (Y - y[k - 1]) / (y[k] - y[k - 1]) * (t[k] - t[k - 1]);
      }
    }
    return NaN;
  }

  // Interpolación lineal de (xs, ys) en x; fuera de rango -> extremo (hold)
  function interp1(xs, ys, x) {
    const n = xs.length;
    if (n === 0) return NaN;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    const f = (x - xs[lo]) / (xs[hi] - xs[lo]);
    return ys[lo] + f * (ys[hi] - ys[lo]);
  }

  // Interpolación de muchos puntos ordenados (más rápido)
  function interpMany(xs, ys, xq) {
    const out = new Float64Array(xq.length);
    const n = xs.length;
    let j = 0;
    for (let i = 0; i < xq.length; i++) {
      const x = xq[i];
      if (x <= xs[0]) { out[i] = ys[0]; continue; }
      if (x >= xs[n - 1]) { out[i] = ys[n - 1]; continue; }
      while (j < n - 2 && xs[j + 1] <= x) j++;
      while (j > 0 && xs[j] > x) j--;
      const f = (x - xs[j]) / (xs[j + 1] - xs[j]);
      out[i] = ys[j] + f * (ys[j + 1] - ys[j]);
    }
    return out;
  }

  function cumtrapz(t, y) {
    const out = new Float64Array(t.length);
    for (let i = 1; i < t.length; i++) out[i] = out[i - 1] + (y[i] + y[i - 1]) / 2 * (t[i] - t[i - 1]);
    return out;
  }

  function median(arr) {
    const a = Array.from(arr).filter(isFin).sort((p, q) => p - q);
    if (!a.length) return NaN;
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function stdev(arr) {
    const n = arr.length;
    if (n < 2) return 0;
    let s = 0; for (const x of arr) s += x;
    const mu = s / n; let q = 0;
    for (const x of arr) q += (x - mu) * (x - mu);
    return Math.sqrt(q / (n - 1));
  }

  // movmean de MATLAB (ventana centrada; k par: k/2 atrás, k/2-1 adelante)
  function movmean(y, k) {
    const n = y.length, out = new Float64Array(n);
    const b = Math.floor(k / 2), f = (k % 2) ? Math.floor(k / 2) : k - b - 1;
    const cs = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + y[i];
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - b), hi = Math.min(n, i + f + 1);
      out[i] = (cs[hi] - cs[lo]) / (hi - lo);
    }
    return out;
  }

  // PCHIP (igual que MATLAB / scipy PchipInterpolator)
  function pchip(x, y, xq) {
    const n = x.length;
    const out = new Float64Array(xq.length);
    if (n < 2) { out.fill(y[0]); return out; }
    if (n === 2) return interpMany(x, y, xq);
    const h = [], m = [];
    for (let i = 0; i < n - 1; i++) { h.push(x[i + 1] - x[i]); m.push((y[i + 1] - y[i]) / h[i]); }
    const d = new Float64Array(n);
    for (let k = 1; k < n - 1; k++) {
      if (m[k - 1] * m[k] <= 0) d[k] = 0;
      else {
        const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1];
        d[k] = (w1 + w2) / (w1 / m[k - 1] + w2 / m[k]);
      }
    }
    const edge = (h0, h1, m0, m1) => {
      let dd = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
      if (Math.sign(dd) !== Math.sign(m0)) dd = 0;
      else if (Math.sign(m0) !== Math.sign(m1) && Math.abs(dd) > Math.abs(3 * m0)) dd = 3 * m0;
      return dd;
    };
    d[0] = edge(h[0], h[1], m[0], m[1]);
    d[n - 1] = edge(h[n - 2], h[n - 3], m[n - 2], m[n - 3]);
    let j = 0;
    for (let i = 0; i < xq.length; i++) {
      const xv = xq[i];
      while (j < n - 2 && x[j + 1] <= xv) j++;
      const hh = h[j], s = (xv - x[j]) / hh;
      const h00 = (1 + 2 * s) * (1 - s) * (1 - s), h10 = s * (1 - s) * (1 - s);
      const h01 = s * s * (3 - 2 * s), h11 = s * s * (s - 1);
      out[i] = h00 * y[j] + h10 * hh * d[j] + h01 * y[j + 1] + h11 * hh * d[j + 1];
    }
    return out;
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000, r = Math.PI / 180;
    const p1 = lat1 * r, p2 = lat2 * r, dp = (lat2 - lat1) * r, dl = (lon2 - lon1) * r;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function range(a, b, dt) {
    const n = Math.floor((b - a) / dt + 1e-9) + 1;
    const out = new Float64Array(Math.max(n, 0));
    for (let i = 0; i < n; i++) out[i] = a + i * dt;
    return out;
  }

  // ------------------------------------------------------------ detección
  function buscarArranque(tG, vG, cfg) {
    for (let kc = 0; kc < vG.length; kc++) {
      if (!(vG[kc] >= cfg.v_confirma && tG[kc] >= cfg.t_inicio_busqueda)) continue;
      let kb = -1;
      for (let i = kc; i >= 0; i--) if (vG[i] <= cfg.v_baja) { kb = i; break; }
      if (kb < 0 || tG[kb] < cfg.t_inicio_busqueda) continue;
      if (tG[kc] - tG[kb] <= cfg.t_confirma) {
        let iRun = kc;
        for (let i = kb + 1; i <= kc; i++) if (vG[i] >= cfg.v_corrida) { iRun = i; break; }
        return { iRun, iQ: kb };
      }
    }
    return null;
  }

  function movimientosPrevios(tG, vG, iQ, cfg) {
    let n = 0, vmax = 0, enMov = false, vm = 0;
    for (let i = 0; i <= iQ; i++) {
      if (tG[i] < cfg.t_inicio_busqueda) continue;
      const mov = vG[i] > cfg.v_baja;
      if (mov) { vm = enMov ? Math.max(vm, vG[i]) : vG[i]; enMov = true; }
      if ((!mov || i === iQ) && enMov) {
        if (vm >= cfg.v_corrida) { n++; vmax = Math.max(vmax, vm); }
        enMov = false; vm = 0;
      }
    }
    return { n, vmax };
  }

  function t0PorGps(tG, vG, iQ, iRun) {
    let i1 = (iQ == null) ? iRun : iQ + 1;
    i1 = Math.min(i1, tG.length - 2);
    const t1 = tG[i1], v1 = vG[i1];
    const acc = (vG[i1 + 1] - v1) / (tG[i1 + 1] - t1);
    let t0 = acc > 0.5 ? t1 - v1 / acc : t1 - 0.5;
    if (iQ != null) t0 = Math.max(t0, tG[iQ]);
    return Math.min(t0, t1);
  }

  // Afina el instante de arranque:
  //  - eje "adelante" alrededor del pico de aceleración
  //  - inicio = donde la recta del frente de subida (20%-80% del pico) cruza cero
  //  - gravedad = mediana del reposo justo antes de ese inicio (auto en stage)
  // Se repite para que gravedad e inicio se ajusten entre sí.
  function refinarInicio(tq, Af, g0, kPk, cfg) {
    const fs = cfg.fs, n = tq.length;
    let g = g0.slice(), tOn = NaN, u = null, aL = null;
    for (let it = 0; it < 3; it++) {
      const Dyn = [0, 1, 2].map(c => Af[c].map(x => x - g[c]));
      const s = [0, 0, 0];
      for (let i = Math.max(0, kPk - Math.round(0.2 * fs)); i <= Math.min(n - 1, kPk + fs); i++) { s[0] += Dyn[0][i]; s[1] += Dyn[1][i]; s[2] += Dyn[2][i]; }
      const ns = Math.hypot(...s); if (!(ns > 0)) return null;
      u = s.map(x => x / ns);
      aL = new Float64Array(n);
      for (let i = 0; i < n; i++) aL[i] = Dyn[0][i] * u[0] + Dyn[1][i] * u[1] + Dyn[2][i] * u[2];
      let pk = -Infinity, kp = kPk;
      for (let i = Math.max(0, kPk - Math.round(0.3 * fs)); i <= Math.min(n - 1, kPk + Math.round(0.3 * fs)); i++) if (aL[i] > pk) { pk = aL[i]; kp = i; }
      if (!(pk > cfg.umbral_mov)) return null;
      let k50 = -1;
      for (let i = kp; i > 0; i--) if (aL[i - 1] < 0.5 * pk) { k50 = i; break; }
      if (k50 < 0) return null;
      let k20 = k50; while (k20 > 0 && aL[k20] >= 0.2 * pk) k20--;
      let k80 = k50; while (k80 < kp && aL[k80] < 0.8 * pk) k80++;
      let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
      for (let i = k20; i <= k80; i++) { const x = tq[i] - tq[k50]; sx += x; sy += aL[i]; sxx += x * x; sxy += x * aL[i]; m++; }
      const den = m * sxx - sx * sx;
      const p1 = den > 0 ? (m * sxy - sx * sy) / den : 0, p0 = (sy - p1 * sx) / m;
      tOn = p1 > 0 ? tq[k50] - p0 / p1 : tq[k20];
      tOn = Math.min(Math.max(tOn, tq[k20] - 0.2), tq[k50]);
      if (it === 2) break;
      const w = [];
      for (let i = 0; i < n; i++) if (tq[i] >= tOn - cfg.reposo_s && tq[i] <= tOn - 0.1) w.push(i);
      if (w.length < 10) break;
      g = [0, 1, 2].map(c => median(w.map(i => Af[c][i])));
    }
    return { t0: tOn, gvec: g, u, aL };
  }

  // Mínimos cuadrados sin término independiente: e ≈ p0*x1 + p1*x2
  function mc2(x1, x2, e) {
    let a = 0, b = 0, c = 0, d = 0, f = 0;
    for (let i = 0; i < e.length; i++) { a += x1[i] * x1[i]; b += x1[i] * x2[i]; c += x2[i] * x2[i]; d += x1[i] * e[i]; f += x2[i] * e[i]; }
    const det = a * c - b * b;
    if (Math.abs(det) < 1e-12) return [a > 0 ? d / a : 0, 0];
    return [(d * c - b * f) / det, (a * f - b * d) / det];
  }

  function estimarLatencia(tG, vG, t, vAcc, t0, tLim, lmax, modelo) {
    let lag = 0, mejor = Infinity;
    const tEnd = Math.min(t[t.length - 1], tLim);
    for (let L = 0; L <= lmax + 1e-9; L += 0.02) {
      if (modelo) {
        const x1 = [], x2 = [], e = [];
        for (let i = 0; i < tG.length; i++) {
          const tg = tG[i] - L;
          if (tg > t0 + 1e-3 && tg < tEnd) { const va = interp1(t, vAcc, tg); x1.push(tg - t0); x2.push(va); e.push(vG[i] - va); }
        }
        if (e.length < 4) continue;
        const p = mc2(x1, x2, e);
        let r = 0; for (let i = 0; i < e.length; i++) r += (e[i] - p[0] * x1[i] - p[1] * x2[i]) ** 2;
        r /= e.length;
        if (r < mejor) { mejor = r; lag = Math.round(L * 100) / 100; }
        continue;
      }
      const tc = [0], ec = [0];
      for (let i = 0; i < tG.length; i++) {
        const tg = tG[i] - L;
        if (tg > t[0] + 1e-3 && tg < tEnd) { tc.push(tg - t[0]); ec.push(vG[i] - interp1(t, vAcc, tg)); }
      }
      if (tc.length < 5) continue;
      // recta por mínimos cuadrados
      const n = tc.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (let i = 0; i < n; i++) { sx += tc[i]; sy += ec[i]; sxx += tc[i] * tc[i]; sxy += tc[i] * ec[i]; }
      const den = n * sxx - sx * sx;
      const p1 = den ? (n * sxy - sx * sy) / den : 0, p0 = (sy - p1 * sx) / n;
      let r = 0; for (let i = 0; i < n; i++) r += (ec[i] - p0 - p1 * tc[i]) ** 2;
      if (r < mejor) { mejor = r; lag = Math.round(L * 100) / 100; }
    }
    return lag;
  }

  // ------------------------------------------------------------ procesar
  /**
   * gps: {t:[], v:[], hacc?:[], lat?:[], lon?:[]}
   * acc: {t:[], ax:[], ay:[], az:[]} o null
   */
  function procesar(gps, acc, cfgIn) {
    const cfg = Object.assign(defaultConfig(), cfgIn || {});
    const avisos = [];
    const R = { ok: false, mensaje: '', avisos, cfg };
    const dt = 1 / cfg.fs;

    // 1) GPS: limpiar y ordenar
    let idx = [];
    for (let i = 0; i < gps.t.length; i++) if (isFin(gps.t[i]) && isFin(gps.v[i]) && gps.v[i] >= 0) idx.push(i);
    idx.sort((a, b) => gps.t[a] - gps.t[b] || a - b);
    idx = idx.filter((k, j) => j === 0 || gps.t[k] !== gps.t[idx[j - 1]]);
    const pick = (arr) => idx.map(i => (arr && isFin(arr[i])) ? arr[i] : NaN);
    const tG = idx.map(i => gps.t[i]), vG = idx.map(i => gps.v[i]);
    const hG = pick(gps.hacc), latG = pick(gps.lat), lonG = pick(gps.lon);
    if (tG.length < 3) { R.mensaje = 'Muy pocos datos de GPS.'; return R; }

    const arr = buscarArranque(tG, vG, cfg);
    if (!arr) {
      let vm = 0; for (let i = 0; i < tG.length; i++) if (tG[i] >= cfg.t_inicio_busqueda) vm = Math.max(vm, vG[i]);
      R.mensaje = `No se detectó un arranque: ningún movimiento llegó a ${Math.round(cfg.v_confirma * 3.6)} km/h ` +
        `en menos de ${cfg.t_confirma} s desde detenido (vel. máxima registrada ${Math.round(vm * 3.6)} km/h).`;
      return R;
    }
    const { iRun, iQ } = arr;
    const tRun = tG[iRun], tQ = tG[iQ];
    const prev = movimientosPrevios(tG, vG, iQ, cfg);
    const t0g = t0PorGps(tG, vG, iQ, iRun);

    // 2-4) Acelerómetro
    let usarAcc = !!(cfg.usar_acc && acc && acc.t && acc.t.length >= 20);
    let ruido = NaN, gvec = [NaN, NaN, NaN], u = [NaN, NaN, NaN], accHz = NaN;
    let tq, aL, t0, tIni;
    if (usarAcc) {
      let ia = [];
      for (let i = 0; i < acc.t.length; i++)
        if (isFin(acc.t[i]) && isFin(acc.ax[i]) && isFin(acc.ay[i]) && isFin(acc.az[i])) ia.push(i);
      ia.sort((a, b) => acc.t[a] - acc.t[b] || a - b);
      ia = ia.filter((k, j) => j === 0 || acc.t[k] !== acc.t[ia[j - 1]]);
      var tA = ia.map(i => acc.t[i]);
      var A = [ia.map(i => acc.ax[i]), ia.map(i => acc.ay[i]), ia.map(i => acc.az[i])];
      if (tA.length > 1) {
        const d = []; for (let i = 1; i < tA.length; i++) d.push(tA[i] - tA[i - 1]);
        accHz = 1 / median(d);
      }
      if (tA.length < 20 || tA[0] > tQ - 0.5 || tA[tA.length - 1] < tRun + 1.0) {
        usarAcc = false; avisos.push('El acelerómetro no cubre el arranque; se usó solo GPS.');
      }
    }
    let win;
    if (usarAcc) {
      // ¿reporta en g?
      const pre = []; for (let i = 0; i < tA.length; i++) if (tA[i] <= tQ) pre.push(i);
      const gm = Math.hypot(median(pre.map(i => A[0][i])), median(pre.map(i => A[1][i])), median(pre.map(i => A[2][i])));
      if (gm < 3) {
        for (let c = 0; c < 3; c++) A[c] = A[c].map(x => x * G0);
        avisos.push('El acelerómetro reportaba en g; se convirtió a m/s².');
      }
      tq = range(Math.max(tA[0], tQ - 5), tA[tA.length - 1], dt);
      const k = Math.max(1, Math.round(cfg.suavizado_s * cfg.fs));
      var Af = [0, 1, 2].map(c => movmean(interpMany(tA, A[c], tq), k));
      win = []; for (let i = 0; i < tq.length; i++) if (tq[i] >= tQ - 3 && tq[i] <= tQ - 1) win.push(i);
      if (win.length < 0.3 * cfg.fs) { win = []; for (let i = 0; i < tq.length; i++) if (tq[i] <= tQ - 0.5) win.push(i); }
      if (win.length < 10) { usarAcc = false; avisos.push('No hubo reposo suficiente para calibrar la gravedad; se usó solo GPS.'); }
    }
    if (usarAcc) {
      gvec = [0, 1, 2].map(c => median(win.map(i => Af[c][i])));
      const Dyn = [0, 1, 2].map(c => Af[c].map(x => x - gvec[c]));
      const dmag = new Float64Array(tq.length);
      for (let i = 0; i < tq.length; i++) dmag[i] = Math.hypot(Dyn[0][i], Dyn[1][i], Dyn[2][i]);
      ruido = stdev(win.map(i => dmag[i]));
      const gn = Math.hypot(...gvec);
      if (Math.abs(gn - 9.81) > 1.0) avisos.push(`Gravedad medida rara (${gn.toFixed(2)} m/s²): ¿se movió el teléfono?`);
      const umbral = Math.max(cfg.umbral_mov, 4 * ruido);
      let kPk = -1, pk = -Infinity;
      for (let i = 0; i < tq.length; i++) if (tq[i] >= tQ - 1 && tq[i] <= tRun && dmag[i] > pk) { pk = dmag[i]; kPk = i; }
      if (kPk < 0 || pk < umbral) {
        usarAcc = false; avisos.push('No se distinguió el arranque en el acelerómetro; se usó solo GPS.');
      } else {
        let k0 = kPk;
        for (let i = kPk; i >= 0; i--) if (dmag[i] < umbral / 2) { k0 = i; break; }
        t0 = tq[k0];
        const s = [0, 0, 0]; let nf = 0;
        for (let i = 0; i < tq.length; i++) if (tq[i] >= t0 && tq[i] <= t0 + cfg.ventana_fwd_s) { s[0] += Dyn[0][i]; s[1] += Dyn[1][i]; s[2] += Dyn[2][i]; nf++; }
        const nu = Math.hypot(...s); u = s.map(x => x / nu);
        aL = new Float64Array(tq.length);
        for (let i = 0; i < tq.length; i++) aL[i] = Dyn[0][i] * u[0] + Dyn[1][i] * u[1] + Dyn[2][i] * u[2];
        tIni = t0;
        if (cfg.refinar_inicio) {
          const ref = refinarInicio(tq, Af, gvec, kPk, cfg);
          if (ref) { t0 = ref.t0; gvec = ref.gvec; u = ref.u; aL = ref.aL; tIni = Math.max(tq[0], t0 - cfg.pre_integracion_s); }
          else avisos.push('No se pudo afinar el instante de arranque; se usó la detección básica.');
        }
        if (Math.abs(t0 - t0g) > 1.5) avisos.push(`El arranque del acelerómetro y el del GPS difieren ${(t0 - t0g).toFixed(1)} s.`);
      }
    }

    // 5) Velocidad
    let t, v, a, lag, metodo, descartadasGps = 0;
    if (usarAcc) {
      let i0 = 0; while (tq[i0] < tIni) i0++;
      t = tq.slice(i0); a = aL.slice(i0);
      const vAcc = cumtrapz(t, a);
      const modelo = cfg.fusion === 'modelo';
      lag = isFin(cfg.latencia_gps_s) ? cfg.latencia_gps_s
        : estimarLatencia(tG, vG, t, vAcc, t0, t0 + 20, cfg.latencia_max_s, modelo);
      const tc = [t[0]], ec = [0];
      for (let i = 0; i < tG.length; i++) {
        const tg = tG[i] - lag;
        if (tg > t0 + 1e-3 && tg < t[t.length - 1]) { tc.push(tg); ec.push(vG[i] - interp1(t, vAcc, tg)); }
      }
      let c, tcM;
      if (modelo && tc.length >= 4) {
        // error = deriva lineal + error de escala (inclinación del auto, eje no perfecto)
        let vc = tc.map(x => interp1(t, vAcc, x));
        let x1 = tc.map(x => Math.max(x - t0, 0));
        let p = mc2(x1, vc, ec);
        // descartar lecturas GPS atípicas (saltos) y volver a ajustar
        const r0 = ec.map((e, i) => e - p[0] * x1[i] - p[1] * vc[i]);
        const lim = Math.max(0.5, 4 * 1.4826 * median(r0.map(Math.abs)));
        const ok = r0.map((r, i) => i === 0 || Math.abs(r) <= lim);
        const nOk = ok.filter(Boolean).length;
        if (nOk >= 4 && nOk < ok.length) {
          descartadasGps = ok.length - nOk;
          const f = (arr) => arr.filter((_, i) => ok[i]);
          tcM = f(tc); x1 = f(x1); vc = f(vc); const ecM = f(ec);
          p = mc2(x1, vc, ecM);
          ec.length = 0; ec.push(...ecM);
        } else tcM = tc;
        const res = ec.map((e, i) => (e - p[0] * x1[i] - p[1] * vc[i]) * cfg.peso_residuo);
        res[0] = 0;
        const r = interpMany(tcM, res, t);
        c = new Float64Array(t.length);
        for (let i = 0; i < t.length; i++) c[i] = p[0] * Math.max(t[i] - t0, 0) + p[1] * vAcc[i] + r[i];
      } else {
        c = interpMany(tc, ec, t);
      }
      v = new Float64Array(t.length);
      for (let i = 0; i < t.length; i++) v[i] = Math.max(vAcc[i] + c[i], 0);
      metodo = 'GPS + acelerómetro';
    } else {
      t0 = t0g;
      const tc = [t0], vc = [0];
      for (let i = 0; i < tG.length; i++) if (tG[i] > t0 + 1e-3) { tc.push(tG[i]); vc.push(vG[i]); }
      t = range(t0, tc[tc.length - 1], dt);
      v = pchip(tc, vc, t).map(x => Math.max(x, 0));
      a = new Float64Array(t.length);
      for (let i = 0; i < t.length; i++) {
        if (i === 0) a[i] = (v[1] - v[0]) / dt;
        else if (i === t.length - 1) a[i] = (v[i] - v[i - 1]) / dt;
        else a[i] = (v[i + 1] - v[i - 1]) / (2 * dt);
      }
      lag = 0;
      metodo = 'Solo GPS';
    }

    // 6) Distancia y rollout
    const d = cumtrapz(t, v);
    const ro = cfg.rollout_ft * 0.3048;
    const tRo = ro > 0 ? cruce(t, d, ro) : t0;
    if (!isFin(tRo)) { R.mensaje = 'El vehículo no avanzó ni el rollout.'; return R; }

    // 7) Hitos
    const hitos = cfg.hitos.map(([nombre, D]) => {
      const tk = cruce(t, d, D);
      return isFin(tk) ? { nombre, dist_m: D, t: tk - tRo, v_kmh: interp1(t, v, tk) * 3.6 }
        : { nombre, dist_m: D, t: NaN, v_kmh: NaN };
    });
    const t_0_100 = cruce(t, v, 100 / 3.6) - t0;
    const t_0_60mph = cruce(t, v, 26.8224) - t0;
    const Df = cfg.distancia_final;
    const tF1 = cruce(t, d, Df - cfg.dist_trampa_m);
    let tFin = cruce(t, d, Df);
    const trampa = cfg.dist_trampa_m / (tFin - tF1) * 3.6;
    const completo = isFin(tFin);
    if (!completo) tFin = t[t.length - 1];

    // Estadísticas
    let amax = -Infinity, asum = 0, an = 0, vmax = 0;
    for (let i = 0; i < t.length; i++) {
      vmax = Math.max(vmax, v[i]);
      if (t[i] <= tFin) { amax = Math.max(amax, a[i]); asum += a[i]; an++; }
    }
    const est = {
      tiempo_total: tFin - tRo,
      distancia_total: d[d.length - 1],
      v_max_kmh: vmax * 3.6,
      a_max_g: amax / G0,
      a_prom_g: an ? asum / an / G0 : NaN,
    };

    const dG = []; for (let i = 1; i < tG.length; i++) dG.push(tG[i] - tG[i - 1]);
    const segH = []; let nSeg = 0;
    for (let i = 0; i < tG.length; i++) if (tG[i] >= t0 && tG[i] <= tFin) { nSeg++; segH.push(hG[i]); }
    const cal = {
      metodo,
      gps_hz: 1 / median(dG),
      acc_hz: accHz,
      n_gps_corrida: nSeg,
      hacc_mediana_m: median(segH),
      ruido_reposo: ruido,
      g_medida: Math.hypot(...gvec),
      latencia_gps_s: lag,
      gps_descartadas: descartadasGps,
      mov_ignorados: prev.n,
      v_max_ignorado_kmh: prev.vmax * 3.6,
      dist_pos_m: NaN,
      dist_integrada_m: interp1(t, d, tFin),
    };
    if (latG.some(isFin)) {
      const ok = []; for (let i = 0; i < tG.length; i++) if (isFin(latG[i]) && isFin(lonG[i])) ok.push(i);
      const tt = ok.map(i => tG[i]), la = ok.map(i => latG[i]), lo = ok.map(i => lonG[i]);
      if (tt.length > 1) cal.dist_pos_m = haversine(interp1(tt, la, t0), interp1(tt, lo, t0), interp1(tt, la, tFin), interp1(tt, lo, tFin));
    }
    if (cal.gps_hz < 2 && !usarAcc) avisos.push('GPS a ~1 Hz sin acelerómetro: los tiempos son solo aproximados.');
    if (descartadasGps) avisos.push(`Se descartaron ${descartadasGps} lecturas GPS atípicas.`);
    if (cal.hacc_mediana_m > 10) avisos.push(`Precisión GPS baja (${Math.round(cal.hacc_mediana_m)} m).`);

    Object.assign(R, {
      ok: true, mensaje: 'OK',
      t: Array.from(t), v: Array.from(v), d: Array.from(d), a: Array.from(a),
      t0, tRo, tFin, tQ, hitos, t_0_100, t_0_60mph, trampa_kmh: trampa, completo, est, calidad: cal,
      gps: { t: tG.map(x => x - lag), v: vG.slice() },
    });
    return R;
  }

  // ------------------------------------------------------------ detección en vivo
  // Misma regla que buscarArranque, lectura por lectura.
  class DetectorVivo {
    constructor(cfg) {
      this.cfg = Object.assign(defaultConfig(), cfg || {});
      this.fase = 'espera';
      this.tPrev = NaN; this.vPrev = 0;
      this.tBajo = NaN; this.dSeg = 0; this.vMaxSeg = 0;
      this.dVivo = 0; this.tQuieto = 0; this.tConf = NaN; this.tArr = NaN;
      this.hitosVivo = [];
    }
    // Devuelve una lista de eventos
    feed(tN, vN) {
      const c = this.cfg, ev = [];
      if (!(tN > this.tPrev) && isFin(this.tPrev)) return ev;
      vN = Math.max(vN, 0);
      const dtg = isFin(this.tPrev) ? tN - this.tPrev : 0;
      const paso = (vN + this.vPrev) / 2 * dtg;
      if (this.fase === 'espera') {
        if (vN <= c.v_baja) {
          if (this.vMaxSeg >= c.v_corrida) ev.push({ tipo: 'ignorado', vmax: this.vMaxSeg, dist: this.dSeg });
          this.tBajo = tN; this.dSeg = 0; this.vMaxSeg = 0;
        } else if (isFin(this.tBajo)) {
          this.dSeg += paso; this.vMaxSeg = Math.max(this.vMaxSeg, vN);
          if (vN >= c.v_confirma && tN - this.tBajo <= c.t_confirma) {
            this.fase = 'corrida'; this.dVivo = this.dSeg; this.tConf = tN; this.tArr = this.tBajo;
            ev.push({ tipo: 'arranque', v: vN, dt: tN - this.tBajo, tBajo: this.tBajo });
          }
        }
      } else if (this.fase === 'corrida') {
        this.dVivo += paso;
        for (const [nombre, D] of c.hitos) {
          if (D <= c.distancia_final + 0.01 && this.dVivo >= D && !this.hitosVivo.includes(nombre)) {
            this.hitosVivo.push(nombre); ev.push({ tipo: 'hito', nombre });
          }
        }
        ev.push({ tipo: 'progreso', d: this.dVivo, v: vN });
        if (this.dVivo >= c.distancia_final + c.margen_final_m) { this.fase = 'fin'; ev.push({ tipo: 'fin', motivo: 'meta' }); }
        else {
          this.tQuieto = vN <= c.v_quieto ? this.tQuieto + dtg : 0;
          if (this.tQuieto >= c.t_parada_s) { this.fase = 'fin'; ev.push({ tipo: 'fin', motivo: 'detenido' }); }
          else if (tN - this.tConf > c.t_max_corrida) { this.fase = 'fin'; ev.push({ tipo: 'fin', motivo: 'tiempo' }); }
        }
      }
      this.tPrev = tN; this.vPrev = vN;
      return ev;
    }
  }

  // ------------------------------------------------------------ simulador
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /** Sesión completa: reposo, burnout, salida, alineación, stage y arranque. */
  function simularSesion(opts) {
    const o = Object.assign({ gps_hz: 1, lag_gps: 0.25, seed: Date.now() & 0xffff, acc_hz: 60, stage_min: 0.8, stage_max: 3.0 }, opts || {});
    const rnd = mulberry32(o.seed);
    const randn = () => { let u = 0, w = 0; while (!u) u = rnd(); w = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w); };
    const dtS = 0.002, tMax = 90;
    const aT = 4.5 + 2.5 * rnd(), Pm = 90 + 90 * rnd(), k = 3.5e-4, cr = 0.15;
    const vC = [14, 26, 38, 50].map(x => x * (0.9 + 0.2 * rnd()));
    const tB0 = 3, tB1 = tB0 + 3 + 2 * rnd(), vPull = (10 + 20 * rnd()) / 3.6;
    // En pista: del stage al arranque pasan ~0.8-3 s (encendido del árbol + reacción)
    const tStage = o.stage_min + (o.stage_max - o.stage_min) * rnd();
    const tRampa = 0.05 + 0.25 * rnd();          // qué tan brusco aplica la tracción
    const pitch = (0.1 + 0.5 * rnd()) * Math.PI / 180;   // "sentada" del auto por m/s^2
    const ts = [0], xs = [0], vs = [0], as = [0];
    let corte = -1, iC = 0, fase = 1, tF = 0, tPre = NaN, tStg0 = NaN, vi = 0, x = 0;
    for (let tt = dtS; tt <= tMax; tt += dtS) {
      let ai = 0;
      switch (fase) {
        case 1: ai = 0; if (tt >= tB1) fase = 2; break;
        case 2: ai = 3; if (vi >= vPull) fase = 3; break;
        case 3: ai = -4; if (vi <= 0) { fase = 4; tF = tt; } break;
        case 4: ai = 0; if (tt >= tF + 2) fase = 5; break;
        case 5: ai = 0.6; if (vi >= 0.8) { fase = 6; tF = tt; } break;
        case 6: ai = 0; if (tt >= tF + 1.5) fase = 7; break;
        case 7: ai = -0.8; if (vi <= 0) { fase = 8; tF = tt; } break;
        case 8: ai = 0; if (tt >= tF + 1) fase = 9; break;
        case 9: ai = 0.5; if (vi >= 0.5) { fase = 10; tF = tt; } break;
        case 10: ai = 0; if (tt >= tF + 0.6) fase = 11; break;
        case 11: ai = -0.8; if (vi <= 0) { fase = 12; tF = tt; tStg0 = tt; } break;
        case 12: ai = 0; if (tt >= tF + tStage) { fase = 13; tPre = tt; } break;
        default:
          if (iC < 4 && vi >= vC[iC]) { corte = tt + 0.25; iC++; }
          ai = tt < corte ? -cr - k * vi * vi : Math.min(aT * Math.min(1, (tt - tPre) / tRampa), Pm / Math.max(vi, 1)) - cr - k * vi * vi;
      }
      if (vi <= 0 && ai < 0) ai = 0;
      const vn = Math.max(vi + ai * dtS, 0);
      x += (vi + vn) / 2 * dtS; vi = vn;
      ts.push(tt); xs.push(x); vs.push(vi); as.push(ai);
      if (isFin(tPre) && tt > tPre + 30) break;
    }
    const T = ts[ts.length - 1];
    const xL = interp1(ts, xs, tPre);
    const xr = xs.map(q => q - xL);
    const ro = 0.3048, tRo = cruce(ts, xr, ro);
    const D = defaultConfig().hitos.map(h => h[1]);
    const verdad = { t_arranque: tPre, t_ro_abs: tRo, t_hitos: D.map(Dj => cruce(ts, xr, Dj) - tRo), t_hitos_sin_ro: D.map(Dj => cruce(ts, xr, Dj) - tPre) };

    // GPS
    const gps = { t: [], v: [], hacc: [], lat: [], lon: [] };
    const rumbo = 2 * Math.PI * rnd(), lat0 = 28.6, lon0 = -106.1;
    for (let tg = 1 + rnd() / o.gps_hz; tg < T; tg += 1 / o.gps_hz) {
      const vt = interp1(ts, vs, tg - o.lag_gps);
      let vg = vt < 0.05 ? 0.15 * Math.abs(randn()) : Math.max(vt + 0.12 * randn(), 0);
      const xg = interp1(ts, xs, tg);
      gps.t.push(tg); gps.v.push(vg); gps.hacc.push(4);
      gps.lat.push(lat0 + (xg * Math.cos(rumbo) + 1.5 * randn()) / 111320);
      gps.lon.push(lon0 + (xg * Math.sin(rumbo) + 1.5 * randn()) / (111320 * Math.cos(lat0 * Math.PI / 180)));
    }
    // Acelerómetro en marco del teléfono (ángulo aleatorio)
    const ang = [(rnd() - 0.5) * 2 * Math.PI, (rnd() - 0.5) * Math.PI / 2, (rnd() - 0.5) * Math.PI / 2];
    const rz = q => [[Math.cos(q), -Math.sin(q), 0], [Math.sin(q), Math.cos(q), 0], [0, 0, 1]];
    const ry = q => [[Math.cos(q), 0, Math.sin(q)], [0, 1, 0], [-Math.sin(q), 0, Math.cos(q)]];
    const rx = q => [[1, 0, 0], [0, Math.cos(q), -Math.sin(q)], [0, Math.sin(q), Math.cos(q)]];
    const mm = (P, Q) => P.map((r, i) => Q[0].map((_, j) => r.reduce((s, _, kk) => s + P[i][kk] * Q[kk][j], 0)));
    const Rm = mm(mm(rz(ang[0]), ry(ang[1])), rx(ang[2]));
    const bias = [0.15 * randn(), 0.15 * randn(), 0.15 * randn()];
    const pend = (rnd() - 0.5) * 0.02 * G0;          // pendiente de la pista (±1%)
    const bw = [0, 0, 0];                             // deriva lenta del sensor
    const vib = [rnd(), rnd(), rnd()], ph = 2 * Math.PI * rnd();
    const acc = { t: [], ax: [], ay: [], az: [] };
    for (let ta = 0; ta <= T; ta += 1 / o.acc_hz) {
      const aLv = interp1(ts, as, ta), th = pitch * aLv;
      const f = [aLv - G0 * Math.sin(th) + (ta >= tPre ? pend : 0), 0.15 * randn(), G0 * Math.cos(th)];
      for (let i = 0; i < 3; i++) bw[i] += 0.01 * Math.sqrt(1 / o.acc_hz) * randn();
      let extra = 0.25;
      if (ta >= tB0 && ta <= tB1) extra = 1.5;
      else if (ta >= tStg0 && ta < tPre) extra = 0.6;
      const s = 0.3 * Math.sin(2 * Math.PI * 31 * ta + ph);
      const out = [0, 1, 2].map(i => Rm[i][0] * f[0] + Rm[i][1] * f[1] + Rm[i][2] * f[2] + bias[i] + bw[i] + 0.25 * randn() + (extra > 0.25 ? extra * randn() : 0) + s * vib[i]);
      acc.t.push(ta); acc.ax.push(out[0]); acc.ay.push(out[1]); acc.az.push(out[2]);
    }
    return { gps, acc, verdad };
  }

  const api = { defaultConfig, procesar, DetectorVivo, simularSesion, cruce, interp1, haversine, G0 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DragCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
