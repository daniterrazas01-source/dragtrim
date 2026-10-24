/* semaforo_vision.js — Visión del lector del semáforo ("Medir con el semáforo real", beta 0.6)
 * Puro y sin DOM: window.SemaforoVision en el navegador, module.exports en Node.
 * Se usa solo DESPUÉS de la corrida (y en "Apuntar"); nunca mientras la medición está armada.
 * Unidades: tiempo [s]; posiciones [px del recorte] en el cuadro de referencia de estabilizar().
 * Cuadros (de semaforo.js): fmt 'yuv420' = plano Y (w·h) + U y V de (w/2)·(h/2) por cuadro; 'y8' = solo Y.
 * Pasos (plan.md §2.4): estabilizar → eventos (encendidos/apagados) → manchasFijas → localizar
 *   → rasgos por foco y cuadro → ajustarFlanco (modelo de lámpara + exposición + PWM).
 */
(function (root) {
  'use strict';

  const VERSION = 'vision v1';
  const FOCOS = ['pre', 'stg', 'a1', 'a2', 'a3', 'g', 'r'];
  const LADOS = ['izq', 'der'];
  const RASGOS = ['e', 'p', 'c'];
  const COLUMNAS = [];
  for (const l of LADOS) for (const f of FOCOS) for (const r of RASGOS) COLUMNAS.push(l + '.' + f + '.' + r);

  // ------------------------------------------------------------------ configuración
  // Valores de plan.md §2.7. Se leen de cfg (o cfg.vision) con estas mismas rutas; lo que falte o
  // tenga otro tipo sale de aquí.
  const DEF = {
    sat: 250,                                   // Y (0–255) desde el que un píxel está quemado
    mov: { busqueda_px: 80, ref: [-1.3, -1.0], salto_max_px: 6, salto_AE: 0.10, gclip: 40, q_min: 0.2 },
    eventos: { umbral_min: 0.06, umbral_sigma: 6, area: [3, 600], persistir: 2, dedup_s: 0.25 },
    tonos: { ambar: [20, 55], verde: [70, 190], rojo: [15, 340], sin_saturar: 235, sat_min: 0.15 },
    arbol: { pro_simult: 1.5, full_paso: [0.42, 0.58], delta: [0.30, 0.60], roja: [0.0, 1.5], paso_tol: 0.30,
             col_desv: 0.5, sep_col: [1.2, 4.0], pre_stage: [0.8, 3.0], paso_px: [3, 150], puntaje_min: 2.0,
             nominal: [0.400, 0.500] /* Pro, Full */ },
    ventana: { buscar: [-3.6, 0.6] },
    rt: [-1.0, 1.5],                            // L_ref − t_verde aceptable
    disco: 1.6, anillo: [2.0, 2.8],
    fijas: { radio_px: 12 },                    // apertura (top-hat) para manchas fijas, a escala 1
    flanco: { rejilla: 1e-4, grueso: 5, atras_min_s: 0.09, atras_T: 2, adelante_T: 2, ventana_T: 6,
              ventana_extra_s: 0.02, ventana_min_s: 0.25, huber: 2.5, tr_ms: [0, 5, 10, 20, 30, 45, 60, 80],
              tf_rel: 0.6, E_s: [0.0003], E_T: [0.25, 0.5, 0.98], pwm_frac: 0.15, contraste_min: 4, bic_inc: 3 },
    carril: { quieto_s: 0.5 },
  };
  function defaultConfig() { return JSON.parse(JSON.stringify(DEF)); }

  function _ruta(o, r) {
    const p = r.split('.');
    for (let i = 0; i < p.length; i++) { if (o == null || typeof o !== 'object') return undefined; o = o[p[i]]; }
    return o;
  }
  function _valido(v, d) {
    if (typeof d === 'number') return typeof v === 'number' && !Number.isNaN(v);
    if (Array.isArray(d)) return Array.isArray(v) && (d.length === 2 ? v.length === 2 : v.length >= 1) &&
      v.every(x => typeof x === 'number' && !Number.isNaN(x));
    return v !== undefined && v !== null;
  }
  function par(cfg, rutas) {
    rutas = Array.isArray(rutas) ? rutas : [rutas];
    const d = _ruta(DEF, rutas[0]);
    const bases = [cfg, cfg && cfg.vision];
    for (const b of bases) {
      if (!b || typeof b !== 'object') continue;
      for (const r of rutas) { const v = _ruta(b, r); if (_valido(v, d)) return v; }
    }
    return d;
  }
  // Todos los parámetros que usa este módulo, ya resueltos
  function conf(cfg) {
    const p = r => par(cfg, r);
    const rtMin = cfg && isFin(cfg.rt_min_s) ? cfg.rt_min_s : NaN, rtMax = cfg && isFin(cfg.rt_max_s) ? cfg.rt_max_s : NaN;
    const C = {
      sat: p('sat'),
      busqueda_px: p('mov.busqueda_px'), mov_ref: p('mov.ref'), salto_max_px: p('mov.salto_max_px'),
      salto_AE: p('mov.salto_AE'), gclip: p('mov.gclip'), q_min: p('mov.q_min'),
      umbral_min: p('eventos.umbral_min'), umbral_sigma: p('eventos.umbral_sigma'), area: p('eventos.area'),
      persistir: p('eventos.persistir'), dedup_s: p('eventos.dedup_s'),
      ambar: p('tonos.ambar'), verde: p('tonos.verde'), rojo: p('tonos.rojo'), sin_saturar: p('tonos.sin_saturar'),
      sat_min: p('tonos.sat_min'),
      pro_simult: p('arbol.pro_simult'), full_paso: p('arbol.full_paso'), delta: p('arbol.delta'), roja: p('arbol.roja'),
      paso_tol: p('arbol.paso_tol'), col_desv: p('arbol.col_desv'), sep_col: p('arbol.sep_col'),
      pre_stage: p(['arbol.pre_stage', 'arbol.pre']), paso_px: p('arbol.paso_px'), puntaje_min: p('arbol.puntaje_min'),
      nominal: p('arbol.nominal'),
      buscar: p('ventana.buscar'),
      rt: (isFin(rtMin) && isFin(rtMax)) ? [rtMin, rtMax] : p(['rt', 'rt.rango']),
      disco: p('disco'), anillo: p('anillo'), fijas_R: p('fijas.radio_px'), quieto_s: p('carril.quieto_s'),
      fl: {
        rejilla: p(['flanco.rejilla', 'flanco.rejilla_s']), grueso: Math.max(1, Math.round(p('flanco.grueso'))),
        atras_min_s: p(['flanco.atras_min_s', 'flanco.rango_min_s']), atras_T: p(['flanco.atras_T', 'flanco.rango_T']),
        adelante_T: p(['flanco.adelante_T', 'flanco.rango_T']), ventana_T: p('flanco.ventana_T'),
        ventana_extra_s: p('flanco.ventana_extra_s'), ventana_min_s: p('flanco.ventana_min_s'), huber: p('flanco.huber'),
        tr_ms: p(['flanco.tr_ms', 'flanco.tr']), tf_rel: p(['flanco.tf_rel', 'flanco.tf_tr']), E_s: p('flanco.E_s'), E_T: p('flanco.E_T'),
        pwm_frac: p('flanco.pwm_frac'), contraste_min: p('flanco.contraste_min'), bic_inc: p('flanco.bic_inc'),
      },
    };
    // semaforo.js da los tiempos de subida en segundos (flanco.tr_s)
    const trs = cfg && cfg.flanco && cfg.flanco.tr_s;
    if (Array.isArray(trs) && trs.length && trs.every(x => typeof x === 'number' && x >= 0 && x < 1)) C.fl.tr_ms = trs.map(x => x * 1000);
    C.clave_ev = [C.umbral_min, C.umbral_sigma, C.area[0], C.area[1], C.persistir, C.dedup_s, C.sat, C.sin_saturar].join(',');
    return C;
  }

  // ------------------------------------------------------------------ utilidades
  const isFin = Number.isFinite;
  // sRGB⁻¹: nivel 0–255 → luz lineal 0–1
  const LIN = new Float32Array(257);
  for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  LIN[256] = 1;
  function lineal(y8, out) {
    const n = y8.length;
    if (!out || out.length < n) out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = LIN[y8[i]];
    return out;
  }
  function linf(v) {                            // nivel fraccionario → lineal
    if (!(v > 0)) return 0;
    if (v >= 255) return 1;
    const i = v | 0, f = v - i;
    return LIN[i] + f * (LIN[i + 1] - LIN[i]);
  }
  function clampi(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mediana(arr) {
    const b = [];
    for (let i = 0; i < arr.length; i++) if (isFin(arr[i])) b.push(arr[i]);
    if (!b.length) return NaN;
    b.sort((x, y) => x - y);
    const m = b.length >> 1;
    return b.length % 2 ? b[m] : 0.5 * (b[m - 1] + b[m]);
  }
  function percentil(arr, q) {
    const b = [];
    for (let i = 0; i < arr.length; i++) if (isFin(arr[i])) b.push(arr[i]);
    if (!b.length) return NaN;
    b.sort((x, y) => x - y);
    const x = q * (b.length - 1), i = Math.floor(x), f = x - i;
    return i + 1 < b.length ? b[i] + f * (b[i + 1] - b[i]) : b[i];
  }
  function geo(c) {
    const w = c.w | 0, h = c.h | 0, cw = w >> 1, ch = h >> 1, yuv = c.fmt !== 'y8';
    const tam = c.tam || (yuv ? w * h + 2 * cw * ch : w * h);
    return { w, h, cw, ch, yuv, tam, np: w * h };
  }
  function esc(c) { const e = +c.escala; if (!(e > 0)) return 1; return e > 1 ? 1 / e : e; }  // px del recorte por px original (≤ 1)
  function periodoT(t, n) {
    n = n === undefined ? t.length : n;
    const d = [];
    for (let i = 1; i < n; i++) { const x = t[i] - t[i - 1]; if (x > 1e-4 && x < 1) d.push(x); }
    return d.length ? mediana(d) : 1 / 60;
  }
  function periodo(c) {
    const f = c && c.reloj && c.reloj.fps;
    if (f > 1 && f < 1000) return 1 / f;
    return periodoT(c.t, c.n);
  }
  function kDeT(c, t) {                         // primer cuadro con c.t[k] ≥ t
    let a = 0, b = c.n | 0;
    while (a < b) { const m = (a + b) >> 1; if (c.t[m] < t) a = m + 1; else b = m; }
    return a;
  }
  function muestrear(a, b, m) {                 // ≤ m índices repartidos en [a, b]
    const n = b - a + 1;
    if (n <= 0) return [];
    if (n <= m) { const r = []; for (let k = a; k <= b; k++) r.push(k); return r; }
    const r = [];
    for (let j = 0; j < m; j++) r.push(a + Math.round(j * (n - 1) / (m - 1)));
    return r;
  }
  function rango(mov, c, o) {                   // kA..kB pedidos (índices de cuadro o tA/tB), dentro de mov
    const k0 = mov.k0 | 0, kM = k0 + (mov.n | 0) - 1;
    let kA = isFin(o.kA) ? Math.round(o.kA) : k0, kB = isFin(o.kB) ? Math.round(o.kB) : kM;
    if (isFin(o.tA)) kA = Math.max(kA, kDeT(c, o.tA));
    if (isFin(o.tB)) kB = Math.min(kB, kDeT(c, o.tB + 1e-9) - 1);
    return [Math.max(kA, k0), Math.min(kB, kM)];
  }
  // cambio de Y,U,V (niveles) → [tono en grados, saturación 0–1] (BT.601 de rango completo)
  function tonoDe(dY, dU, dV) {
    const R = dY + 1.402 * dV, G = dY - 0.344 * dU - 0.714 * dV, B = dY + 1.772 * dU;
    return tonoRGB(R, G, B);
  }
  function tonoRGB(R, G, B) {
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn;
    if (!(mx > 0) || !(d > 0)) return [NaN, 0];
    let h;
    if (mx === R) h = ((G - B) / d) % 6; else if (mx === G) h = (B - R) / d + 2; else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    return [h, Math.min(1, d / mx)];
  }
  function claseTono(tono, sat, cfg) {
    const C = cfg && cfg.ambar && cfg.verde ? cfg : conf(cfg);
    if (!isFin(tono) || !(sat >= C.sat_min)) return null;
    if (tono >= C.ambar[0] && tono <= C.ambar[1]) return 'ambar';
    if (tono >= C.verde[0] && tono <= C.verde[1]) return 'verde';
    if (tono <= C.rojo[0] || tono >= C.rojo[1]) return 'rojo';
    return 'otro';
  }
  // copia del plano Y del cuadro (desde off) corrido por (sx, sy) al cuadro de referencia; bordes repetidos
  function copiaEstab(D, off, w, h, sx, sy, out) {
    const xa = clampi(-sx, 0, w), xb = clampi(w - sx, 0, w);
    for (let y = 0; y < h; y++) {
      let ys = y + sy;
      ys = ys < 0 ? 0 : ys >= h ? h - 1 : ys;
      const src = off + ys * w, dst = y * w;
      if (xb > xa) out.set(D.subarray(src + xa + sx, src + xb + sx), dst + xa);
      if (xa > 0) { const v = D[src]; for (let x = 0; x < xa; x++) out[dst + x] = v; }
      if (xb < w) { const v = D[src + w - 1]; for (let x = xb; x < w; x++) out[dst + x] = v; }
    }
  }
  // mediana por píxel (Y8) de los cuadros ks; con desp = {sx, sy, k0} se estabiliza cada cuadro
  function medianaCuadros(c, ks, desp) {
    const g = geo(c), np = g.np, m = ks.length, D = c.datos;
    const out = new Uint8Array(np);
    if (!m) return out;
    const pila = new Uint8Array(m * np);
    for (let j = 0; j < m; j++) {
      const k = ks[j];
      if (desp) copiaEstab(D, k * g.tam, g.w, g.h, desp.sx[k - desp.k0], desp.sy[k - desp.k0], pila.subarray(j * np, (j + 1) * np));
      else pila.set(D.subarray(k * g.tam, k * g.tam + np), j * np);
    }
    if (m === 1) { out.set(pila.subarray(0, np)); return out; }
    const v = new Uint8Array(m), mid = m >> 1, par_ = m % 2 === 0;
    for (let i = 0; i < np; i++) {
      for (let j = 0; j < m; j++) {
        const x = pila[j * np + i];
        let q = j - 1;
        while (q >= 0 && v[q] > x) { v[q + 1] = v[q]; q--; }
        v[q + 1] = x;
      }
      out[i] = par_ ? (v[mid - 1] + v[mid] + 1) >> 1 : v[mid];
    }
    return out;
  }
  // máximo o mínimo en ventana cuadrada (2R+1)² (separable, ventana recortada en los bordes)
  function filtroMM(src, w, h, R, esMax, tmp, out) {
    for (let y = 0; y < h; y++) {
      const b = y * w;
      for (let x = 0; x < w; x++) {
        const a = x - R < 0 ? 0 : x - R, z = x + R >= w ? w - 1 : x + R;
        let v = src[b + a];
        if (esMax) { for (let q = a + 1; q <= z; q++) { const u = src[b + q]; if (u > v) v = u; } }
        else { for (let q = a + 1; q <= z; q++) { const u = src[b + q]; if (u < v) v = u; } }
        tmp[b + x] = v;
      }
    }
    for (let y = 0; y < h; y++) {
      const a = y - R < 0 ? 0 : y - R, z = y + R >= h ? h - 1 : y + R;
      for (let x = 0; x < w; x++) {
        let v = tmp[a * w + x];
        if (esMax) { for (let q = a + 1; q <= z; q++) { const u = tmp[q * w + x]; if (u > v) v = u; } }
        else { for (let q = a + 1; q <= z; q++) { const u = tmp[q * w + x]; if (u < v) v = u; } }
        out[y * w + x] = v;
      }
    }
    return out;
  }
  // media recortada (cuantiles qa–qb) en luz lineal de un histograma de niveles
  function mediaRecortada(hist, n, qa, qb) {
    if (!(n > 0)) return NaN;
    const a = qa * n, b = qb * n;
    let acc = 0, s = 0, sw = 0;
    for (let v = 0; v < 256; v++) {
      const c = hist[v];
      if (!c) continue;
      const lo = Math.max(acc, a), hi = Math.min(acc + c, b);
      if (hi > lo) { s += (hi - lo) * LIN[v]; sw += hi - lo; }
      acc += c;
      if (acc >= b) break;
    }
    return sw > 0 ? s / sw : NaN;
  }
  // mediana interpolada (nivel fraccionario) de un histograma
  function medianaHist(hist, n) {
    if (!(n > 0)) return NaN;
    const half = 0.5 * n;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      const c = hist[v];
      if (!c) continue;
      if (acc + c >= half) return v - 0.5 + (half - acc) / c;
      acc += c;
    }
    return 255;
  }
  function trasladoEntero(mov) {
    const n = mov.n | 0, sx = new Int32Array(n), sy = new Int32Array(n);
    for (let i = 0; i < n; i++) { sx[i] = Math.round(mov.dx[i]) || 0; sy[i] = Math.round(mov.dy[i]) || 0; }
    return { sx, sy, k0: mov.k0 | 0 };
  }

  // ------------------------------------------------------------------ 2. estabilizar
  // Corrimiento global de cada cuadro contra la referencia (mediana de los cuadros k_ref) con perfiles 1D del
  // gradiente (filas → dy, columnas → dx) y correlación normalizada; G = ganancia (media recortada de Ylin).
  // El contenido en (x, y) de la referencia aparece en (x + dx, y + dy) del cuadro.
  function estabilizar(c, o) {
    o = o || {};
    const C = conf(o.cfg), g = geo(c), w = g.w, h = g.h, np = g.np, tam = g.tam, D = c.datos, n = c.n | 0;
    const kA = isFin(o.kA) ? clampi(Math.round(o.kA), 0, Math.max(0, n - 1)) : 0;
    const kB = isFin(o.kB) ? clampi(Math.round(o.kB), kA, Math.max(0, n - 1)) : n - 1;
    const nm = n > 0 ? kB - kA + 1 : 0;
    const mov = { t: new Float64Array(nm), dx: new Float32Array(nm), dy: new Float32Array(nm), q: new Float32Array(nm),
                  G: new Float32Array(nm), k0: kA, n: nm, w, h, ref: [kA, kA] };
    if (!nm) return mov;
    for (let i = 0; i < nm; i++) mov.t[i] = c.t[kA + i];
    const S = Math.max(1, Math.round(isFin(o.busqueda_px) ? o.busqueda_px : C.busqueda_px));
    // cuadros de referencia
    let r0, r1;
    if (Array.isArray(o.k_ref)) { r0 = o.k_ref[0]; r1 = o.k_ref[1]; }
    else if (isFin(o.k_ref)) { r0 = o.k_ref - 2; r1 = o.k_ref + 2; }
    else if (isFin(o.L_ref)) { r0 = kDeT(c, o.L_ref + C.mov_ref[0]); r1 = kDeT(c, o.L_ref + C.mov_ref[1] + 1e-9) - 1; }
    else { r0 = kA + Math.round(0.60 * (nm - 1)); r1 = kA + Math.round(0.66 * (nm - 1)); }
    r0 = clampi(Math.round(r0), kA, kB); r1 = clampi(Math.round(r1), r0, kB);
    mov.ref = [r0, r1];
    const ref = medianaCuadros(c, muestrear(r0, r1, 9), null);
    if (w < 8 || h < 8) { for (let i = 0; i < nm; i++) mov.G[i] = NaN; return mov; }
    // máscara: fuera los píxeles que se queman en algún momento (focos, reflejos), con 2 px de margen
    const malo = new Uint8Array(np), tmp8 = new Uint8Array(np), malo2 = new Uint8Array(np);
    for (let i = 0; i < np; i++) if (ref[i] >= C.sat) malo[i] = 1;
    let kLim = kA + Math.round(0.85 * (nm - 1));
    if (isFin(o.L_ref)) kLim = clampi(kDeT(c, o.L_ref - 0.1) - 1, kA, kB);
    const pasoK = Math.max(1, Math.floor((kLim - kA + 1) / 60));
    for (let k = kA; k <= kLim; k += pasoK) { const off = k * tam; for (let i = 0; i < np; i++) if (D[off + i] >= C.sat) malo[i] = 1; }
    filtroMM(malo, w, h, 2, true, tmp8, malo2);
    const mask = new Uint8Array(np);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; mask[i] = malo2[i] ? 0 : 1; }
    // gradientes recortados de la referencia → sumas acumuladas por fila (Sx) y por columna (Sy), separadas por
    // paridad: los perfiles usan un píxel de cada dos en la dirección de la suma
    const gc = C.gclip, W2 = (w >> 1) + 2, H2 = (h >> 1) + 2;
    const Sx = [new Float64Array(W2 * h), new Float64Array(W2 * h)], Sy = [new Float64Array(H2 * w), new Float64Array(H2 * w)];
    for (let y = 0; y < h; y++) for (let pa = 0; pa < 2; pa++) {
      let acc = 0;
      const S_ = Sx[pa], b = y * W2;
      for (let x = pa; x < w; x += 2) {
        const i = y * w + x;
        if (mask[i]) { let v = ref[i + w] - ref[i - w]; if (v < 0) v = -v; acc += v > gc ? gc : v; }
        S_[b + (x >> 1) + 1] = acc;
      }
    }
    for (let x = 0; x < w; x++) for (let pa = 0; pa < 2; pa++) {
      let acc = 0;
      const S_ = Sy[pa], b = x * H2;
      for (let y = pa; y < h; y += 2) {
        const i = y * w + x;
        if (mask[i]) { let v = ref[i + 1] - ref[i - 1]; if (v < 0) v = -v; acc += v > gc ? gc : v; }
        S_[b + (y >> 1) + 1] = acc;
      }
    }
    const L = Math.max(w, h) + 2;
    const Pk = new Int32Array(h), Pr = new Float64Array(h), Qk = new Int32Array(w), Qr = new Float64Array(w);
    const AB = new Uint8Array(511);                 // |a − b| recortado, sin saltos (mucho más rápido)
    for (let i = 0; i < 511; i++) { const v = Math.abs(i - 255); AB[i] = v > gc ? gc : v; }
    const ca = new Float64Array(L), ca2 = new Float64Array(L), cb = new Float64Array(L), cb2 = new Float64Array(L);
    const ncc = new Float64Array(2 * S + 3), hist = new Float64Array(256);
    const res = { s: 0, ncc: 0 };

    function perfiles(off, ipx, ipy) {
      const xa = Math.max(1, 1 + ipx), xb0 = Math.min(w - 2, w - 2 + ipx);
      const ya = Math.max(1, 1 + ipy), yb0 = Math.min(h - 2, h - 2 + ipy);
      if (xb0 - xa < 8 || yb0 - ya < 8) return false;
      const xb = xb0 - ((xb0 - xa) & 1), yb = yb0 - ((yb0 - ya) & 1);     // misma paridad que xa / ya
      Pk.fill(0); Qk.fill(0);
      for (let y = 1; y < h - 1; y++) {
        const yr = y - ipy;
        if (yr < 1 || yr > h - 2) continue;
        let i = off + y * w + xa, m = yr * w + xa - ipx, s = 0;
        const e = i + (xb - xa);
        for (; i <= e; i += 2, m += 2) s += AB[D[i + w] - D[i - w] + 255] & -mask[m];
        Pk[y] = s;
      }
      const xs = xa - ipx, xe = xb - ipx, px_ = xs & 1, SX = Sx[px_];
      for (let y = 1; y < h - 1; y++) Pr[y] = SX[y * W2 + (xe >> 1) + 1] - SX[y * W2 + (xs >> 1)];
      for (let y = ya; y <= yb; y += 2) {
        let i = off + y * w + xa, m = (y - ipy) * w + xa - ipx;
        for (let x = xa; x <= xb0; x++, i++, m++) Qk[x] += AB[D[i + 1] - D[i - 1] + 255] & -mask[m];
      }
      const ys = ya - ipy, ye = yb - ipy, py_ = ys & 1, SY = Sy[py_];
      for (let x = 1; x < w - 1; x++) Qr[x] = SY[x * H2 + (ye >> 1) + 1] - SY[x * H2 + (ys >> 1)];
      return true;
    }
    // A[i] ≈ B[i − s], i en [lo, hi]: mejor s (sub-píxel) por correlación normalizada, con leve preferencia por prior
    function corr(A, B, lo, hi, prior) {
      ca[lo] = 0; ca2[lo] = 0; cb[lo] = 0; cb2[lo] = 0;
      for (let i = lo; i <= hi; i++) {
        const a = A[i], b = B[i];
        ca[i + 1] = ca[i] + a; ca2[i + 1] = ca2[i] + a * a; cb[i + 1] = cb[i] + b; cb2[i + 1] = cb2[i] + b * b;
      }
      const len = hi - lo + 1, smax = Math.min(S, Math.floor(len / 2));
      let best = -Infinity, bs = 0;
      for (let s = -smax; s <= smax; s++) {
        const i0 = Math.max(lo, lo + s), i1 = Math.min(hi, hi + s), m = i1 - i0 + 1;
        let r = -2;
        if (m >= 8) {
          const sa = ca[i1 + 1] - ca[i0], sa2 = ca2[i1 + 1] - ca2[i0];
          const sb = cb[i1 - s + 1] - cb[i0 - s], sb2 = cb2[i1 - s + 1] - cb2[i0 - s];
          let sab = 0;
          for (let i = i0; i <= i1; i++) sab += A[i] * B[i - s];
          const va = m * sa2 - sa * sa, vb = m * sb2 - sb * sb;
          r = (va > 1e-9 && vb > 1e-9) ? (m * sab - sa * sb) / Math.sqrt(va * vb) : 0;
        }
        ncc[s + S + 1] = r;
        const sc = r - 0.001 * Math.abs(s - prior);
        if (sc > best) { best = sc; bs = s; }
      }
      const r0 = ncc[bs + S + 1];
      let d = 0;
      if (bs > -smax && bs < smax) {
        const a = ncc[bs + S], b = ncc[bs + S + 2], den = a - 2 * r0 + b;
        if (a > -2 && b > -2 && den < 0) d = Math.max(-0.5, Math.min(0.5, 0.5 * (a - b) / den));
      }
      res.s = bs + d; res.ncc = r0;
    }
    function ganancia(off, sx, sy) {
      hist.fill(0);
      let cnt = 0;
      const xa = Math.max(1, 1 - sx), xb = Math.min(w - 2, w - 2 - sx), ya = Math.max(1, 1 - sy), yb = Math.min(h - 2, h - 2 - sy);
      for (let y = ya; y <= yb; y += 2) {
        const b = off + (y + sy) * w + sx, mb = y * w;
        for (let x = xa; x <= xb; x += 2) if (mask[mb + x]) { hist[D[b + x]]++; cnt++; }
      }
      return mediaRecortada(hist, cnt, 0.1, 0.9);
    }
    const r = { dx: 0, dy: 0, q: 0 };
    function medir(k, px, py) {
      const off = k * tam;
      let ipx = Math.round(px), ipy = Math.round(py), dx = px, dy = py, q = 0;
      for (let it = 0; it < 2; it++) {
        if (!perfiles(off, ipx, ipy)) break;
        corr(Pk, Pr, 1, h - 2, py); const sy = res.s, qy = res.ncc;
        corr(Qk, Qr, 1, w - 2, px); const sx = res.s, qx = res.ncc;
        dx = sx; dy = sy; q = Math.max(0, Math.min(qx, qy));
        const nx = Math.round(dx), ny = Math.round(dy);
        if (Math.abs(nx - ipx) <= 6 && Math.abs(ny - ipy) <= 6) break;     // con más corrimiento, rehacer con el nuevo
        ipx = nx; ipy = ny;
      }
      r.dx = dx; r.dy = dy; r.q = q;
      const i = k - kA;
      mov.dx[i] = dx; mov.dy[i] = dy; mov.q[i] = q; mov.G[i] = ganancia(off, Math.round(dx), Math.round(dy));
    }
    const kc = clampi(Math.round((r0 + r1) / 2), kA, kB);
    let px = 0, py = 0;
    for (let k = kc; k <= kB; k++) { medir(k, px, py); if (r.q > C.q_min) { px = r.dx; py = r.dy; } }
    px = mov.dx[kc - kA]; py = mov.dy[kc - kA];
    for (let k = kc - 1; k >= kA; k--) { medir(k, px, py); if (r.q > C.q_min) { px = r.dx; py = r.dy; } }
    return mov;
  }

  // ------------------------------------------------------------------ ruido por píxel
  // σ de Ylin entre cuadros seguidos (estabilizados), robusto: 1.4826·mediana|Δ|/√2
  function ruidoPix(c, tr, kA, kB) {
    const g = geo(c), w = g.w, h = g.h, np = g.np, tam = g.tam, D = c.datos, k0 = tr.k0, nmv = tr.sx.length;
    const a = new Uint8Array(np), b = new Uint8Array(np);
    const pares = muestrear(Math.max(kA, k0 + 1), Math.min(kB, k0 + nmv - 1), 16);
    const muestras = new Float32Array(pares.length * (Math.ceil(np / 5) + 1));
    let m = 0;
    for (const k of pares) {
      const i = k - k0;
      copiaEstab(D, k * tam, w, h, tr.sx[i], tr.sy[i], a);
      copiaEstab(D, (k - 1) * tam, w, h, tr.sx[i - 1], tr.sy[i - 1], b);
      const x0 = Math.max(1, -tr.sx[i], -tr.sx[i - 1]), x1 = Math.min(w - 2, w - 1 - tr.sx[i], w - 1 - tr.sx[i - 1]);
      const y0 = Math.max(1, -tr.sy[i], -tr.sy[i - 1]), y1 = Math.min(h - 2, h - 1 - tr.sy[i], h - 1 - tr.sy[i - 1]);
      for (let y = y0; y <= y1; y += 2) {
        for (let x = x0 + (y & 2); x <= x1; x += 5) {
          const j = y * w + x, va = a[j], vb = b[j];
          if (va >= 250 || vb >= 250 || (va === 0 && vb === 0)) continue;
          const d = LIN[va] - LIN[vb];
          muestras[m++] = d < 0 ? -d : d;
        }
      }
    }
    if (m < 20) return 0;
    const arr = muestras.subarray(0, m).sort();
    return 1.4826 * arr[m >> 1] / Math.SQRT2;
  }

  // ------------------------------------------------------------------ 3. eventos (encendidos y apagados)
  // D = Ylin_k(estabilizado) − max(dilatar₃ₓ₃(Ylin_{k−3..k−1})) (encendidos) o min(erosionar(...)) − Ylin_k (apagados).
  // Umbral max(umbral_min·G_k, umbral_sigma·σ); componentes 4-conexas de área [3, 600]·escala²; persistencia:
  // alguno de los 3 cuadros siguientes sigue arriba de la mitad del umbral. Se calculan los dos signos juntos.
  const _cacheEv = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  // Sin estabilizar (p. ej. la vista general): corrimiento 0 y ganancia de cada cuadro
  const _movNulo = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function movNulo(c) {
    let m = _movNulo && _movNulo.get(c);
    if (m) return m;
    const g = geo(c), n = c.n | 0, hist = new Float64Array(256);
    m = { t: Float64Array.from(c.t.subarray ? c.t.subarray(0, n) : c.t.slice(0, n)), dx: new Float32Array(n), dy: new Float32Array(n),
          q: new Float32Array(n).fill(1), G: new Float32Array(n), k0: 0, n, w: g.w, h: g.h, ref: [0, 0], nulo: true };
    for (let k = 0; k < n; k++) {
      hist.fill(0);
      const off = k * g.tam;
      let cnt = 0;
      for (let i = 0; i < g.np; i += 3) { hist[c.datos[off + i]]++; cnt++; }
      m.G[k] = mediaRecortada(hist, cnt, 0.1, 0.9);
    }
    if (_movNulo) _movNulo.set(c, m);
    return m;
  }
  function eventos(c, mov, o) {
    o = o || {};
    if (!mov) mov = movNulo(c);
    const C = conf(o.cfg), signo = o.signo < 0 ? -1 : 1;
    const [kA, kB] = rango(mov, c, o);
    const clave = kA + ',' + kB + ',' + C.clave_ev;
    let porMov = _cacheEv ? _cacheEv.get(mov) : null;
    if (!porMov || porMov.c !== c) { porMov = { c, m: new Map() }; if (_cacheEv) _cacheEv.set(mov, porMov); }
    let r = porMov.m.get(clave);
    if (!r) { r = _eventosAmbos(c, mov, kA, kB, C); porMov.m.set(clave, r); }
    return (signo > 0 ? r.on : r.off).slice();
  }
  function _tablas(thr, lOn, lOff) {
    // lOn[m] = menor v con LIN[v] − LIN[m] > thr (256: ninguno); lOff[m] = mayor v con LIN[m] − LIN[v] > thr (−1: ninguno)
    let v = 0;
    for (let m = 0; m < 256; m++) { const lim = LIN[m] + thr; while (v < 256 && LIN[v] <= lim) v++; lOn[m] = v; }
    v = 255;
    for (let m = 255; m >= 0; m--) { const lim = LIN[m] - thr; while (v >= 0 && LIN[v] >= lim) v--; lOff[m] = v; }
  }
  // Separa un componente en manchas si tiene varios máximos con un valle entre ellos (focos pegados por el halo)
  function _dividir(comp, n, dmap, cid, cc, w, lbl, cand) {
    let nc = 0;
    for (let q = 0; q < n; q++) {
      const j = comp[q], d = dmap[j];
      let esMax = true;
      for (let oy = -1; oy <= 1 && esMax; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const u = j + oy * w + ox;
        if (u >= 0 && u < cid.length && cid[u] === cc && dmap[u] > d) { esMax = false; break; }
      }
      if (esMax) cand[nc++] = q;
    }
    if (nc <= 1) return 1;
    const orden = Array.from(cand.subarray(0, nc)).sort((a, b) => dmap[comp[b]] - dmap[comp[a]]);
    const picos = [];
    for (const q of orden) {
      const j = comp[q], d = dmap[j], xj = j % w, yj = (j - xj) / w;
      let nuevo = true;
      for (const p of picos) {
        const dx = xj - p.x, dy = yj - p.y, L = Math.sqrt(dx * dx + dy * dy);
        if (L <= 2.01) { nuevo = false; break; }
        let dmin = Infinity;
        const pasos = Math.ceil(L * 2);
        for (let s = 1; s < pasos; s++) {
          const f = s / pasos, u = Math.round(p.y + f * dy) * w + Math.round(p.x + f * dx);
          const v = cid[u] === cc ? dmap[u] : 0;
          if (v < dmin) dmin = v;
        }
        if (dmin >= 0.7 * Math.min(d, p.d)) { nuevo = false; break; }
      }
      if (nuevo) picos.push({ x: xj, y: yj, d });
      if (picos.length > 12) break;
    }
    if (picos.length <= 1) return 1;
    for (let q = 0; q < n; q++) {
      const j = comp[q], xj = j % w, yj = (j - xj) / w;
      let bi = 0, bd = Infinity;
      for (let i = 0; i < picos.length; i++) { const d = (xj - picos[i].x) ** 2 + (yj - picos[i].y) ** 2; if (d < bd) { bd = d; bi = i; } }
      lbl[q] = bi;
    }
    return picos.length;
  }
  function _eventosAmbos(c, mov, kA, kB, C) {
    const g = geo(c), w = g.w, h = g.h, np = g.np, tam = g.tam, D = c.datos;
    const k0 = mov.k0 | 0, nmv = mov.n | 0, kM = k0 + nmv - 1, T = periodo(c), e = esc(c);
    const out = { on: [], off: [], sigma: NaN, T };
    kA = Math.max(kA, k0 + 1); kB = Math.min(kB, kM);
    if (!(kB >= kA) || w < 4 || h < 4) return out;
    const amin = Math.max(1, Math.round(C.area[0] * e * e)), amax = Math.max(amin + 2, Math.round(C.area[1] * e * e));
    const tr = trasladoEntero(mov), sx = tr.sx, sy = tr.sy;
    const sigma = ruidoPix(c, tr, kA, kB);
    out.sigma = sigma;
    const Sb = [new Uint8Array(np), new Uint8Array(np), new Uint8Array(np), new Uint8Array(np)];
    const Mon = new Uint8Array(np), Moff = new Uint8Array(np), mSello = new Int32Array(np).fill(-1);
    const candOn = new Int32Array(np), candOff = new Int32Array(np);
    const marca = new Int32Array(np).fill(-1), cid = new Int32Array(np).fill(-1);
    const pila = new Int32Array(np), comp = new Int32Array(np), lbl = new Int32Array(np), candI = new Int32Array(np);
    const dmap = new Float32Array(np);
    const limOn = new Int16Array(256), limOff = new Int16Array(256), limOnH = new Int16Array(256), limOffH = new Int16Array(256);
    const pend = [], acept = [];
    let sello = 0, cc = 0;
    const kIni = Math.max(k0, kA - 3), kFin = Math.min(kM, kB + 3);
    for (let k = kIni; k <= kFin; k++) {
      const i0 = k - k0, Sk = Sb[k & 3];
      copiaEstab(D, k * tam, w, h, sx[i0], sy[i0], Sk);
      // persistencia de los candidatos de cuadros anteriores
      for (let j = pend.length - 1; j >= 0; j--) {
        const p = pend[j];
        let pasa = false;
        if (p.signo > 0) { for (let q = 0; q < p.pix.length; q++) if (Sk[p.pix[q]] >= p.need[q]) { pasa = true; break; } }
        else { for (let q = 0; q < p.pix.length; q++) if (Sk[p.pix[q]] <= p.need[q]) { pasa = true; break; } }
        p.vistos++;
        if (pasa) p.hits++;
        if (p.hits >= C.persistir - 1) { acept.push(p); pend.splice(j, 1); }
        else if (p.vistos >= 3) pend.splice(j, 1);
      }
      if (k < kA || k > kB) continue;
      const nprev = Math.min(3, k - k0);
      if (nprev < 1) continue;
      // rectángulo donde los nprev+1 cuadros son válidos, menos 1 px para la dilatación
      let x0 = 0, x1 = w - 1, y0 = 0, y1 = h - 1;
      for (let j = 0; j <= nprev; j++) {
        const q = i0 - j;
        x0 = Math.max(x0, -sx[q]); x1 = Math.min(x1, w - 1 - sx[q]); y0 = Math.max(y0, -sy[q]); y1 = Math.min(y1, h - 1 - sy[q]);
      }
      x0++; y0++; x1--; y1--;
      if (x1 - x0 < 2 || y1 - y0 < 2) continue;
      // M = máximo (encendidos) o mínimo (apagados) de los cuadros k−1..k−3 en 3×3, calculado solo donde hace falta:
      // como Mon ≥ S_{k−1} y Moff ≤ S_{k−1}, un píxel solo puede pasar si ya cambió contra el cuadro anterior
      const A1 = Sb[(k - 1) & 3], A2 = nprev >= 2 ? Sb[(k - 2) & 3] : A1, A3 = nprev >= 3 ? Sb[(k - 3) & 3] : A2;
      const G = mov.G[i0];
      const thr = Math.max(C.umbral_min * (G > 0 ? G : 0), C.umbral_sigma * sigma, 2e-4);
      _tablas(thr, limOn, limOff); _tablas(0.5 * thr, limOnH, limOffH);
      let nOn = 0, nOff = 0;
      for (let y = y0; y <= y1; y++) {
        for (let i = y * w + x0, e_ = y * w + x1; i <= e_; i++) {
          const v = Sk[i], a = A1[i];
          if (v >= limOn[a]) candOn[nOn++] = i; else if (v <= limOff[a]) candOff[nOff++] = i;
        }
      }
      if (!nOn && !nOff) continue;
      sello++;
      const sM = sello;
      const MM = (j) => {                       // calcula y guarda Mon/Moff del píxel j
        if (mSello[j] === sM) return;
        let hi = 0, lo = 255;
        for (let oy = -w; oy <= w; oy += w) for (let ox = -1; ox <= 1; ox++) {
          const u = j + oy + ox;
          let v = A1[u]; if (v > hi) hi = v; if (v < lo) lo = v;
          v = A2[u]; if (v > hi) hi = v; if (v < lo) lo = v;
          v = A3[u]; if (v > hi) hi = v; if (v < lo) lo = v;
        }
        Mon[j] = hi; Moff[j] = lo; mSello[j] = sM;
      };
      const delCuadro = [];
      for (let sg = 1; sg >= -1; sg -= 2) {
        sello++;
        const M = sg > 0 ? Mon : Moff, lim = sg > 0 ? limOn : limOff, limH = sg > 0 ? limOnH : limOffH;
        const cand = sg > 0 ? candOn : candOff, nCand = sg > 0 ? nOn : nOff;
        const pasa = sg > 0
          ? (j => { if (Sk[j] < limOn[A1[j]]) return false; MM(j); return Sk[j] >= limOn[Mon[j]]; })
          : (j => { if (Sk[j] > limOff[A1[j]]) return false; MM(j); return Sk[j] <= limOff[Moff[j]]; });
        for (let ci = 0; ci < nCand; ci++) {
          const i = cand[ci];
          if (marca[i] === sello || !pasa(i)) continue;
          // relleno 4-conexo
          let n = 0, sp = 0;
          pila[sp++] = i; marca[i] = sello;
          while (sp) {
            const j = pila[--sp];
            if (n < comp.length) comp[n++] = j;
            const xj = j % w, yj = (j - xj) / w;
            let u;
            u = j - 1; if (xj > x0 && marca[u] !== sello && pasa(u)) { marca[u] = sello; pila[sp++] = u; }
            u = j + 1; if (xj < x1 && marca[u] !== sello && pasa(u)) { marca[u] = sello; pila[sp++] = u; }
            u = j - w; if (yj > y0 && marca[u] !== sello && pasa(u)) { marca[u] = sello; pila[sp++] = u; }
            u = j + w; if (yj < y1 && marca[u] !== sello && pasa(u)) { marca[u] = sello; pila[sp++] = u; }
          }
          if (n < amin || n > 8 * amax) continue;
          cc++;
          for (let q = 0; q < n; q++) {
            const j = comp[q];
            dmap[j] = sg > 0 ? LIN[Sk[j]] - LIN[M[j]] : LIN[M[j]] - LIN[Sk[j]];
            cid[j] = cc;
          }
          const nb = n >= 10 ? _dividir(comp, n, dmap, cid, cc, w, lbl, candI) : 1;
          for (let b = 0; b < nb; b++) {
            let area = 0, sd = 0, sdx = 0, sdy = 0, pico = 0, bx0 = w, by0 = h, bx1 = -1, by1 = -1;
            for (let q = 0; q < n; q++) {
              if (nb > 1 && lbl[q] !== b) continue;
              const j = comp[q], d = dmap[j], xj = j % w, yj = (j - xj) / w;
              area++; sd += d; sdx += d * xj; sdy += d * yj;
              if (d > pico) pico = d;
              if (xj < bx0) bx0 = xj; if (xj > bx1) bx1 = xj; if (yj < by0) by0 = yj; if (yj > by1) by1 = yj;
            }
            if (area < amin || !(sd > 0)) continue;
            // área a media altura (no depende del halo) y píxeles para la persistencia (los más fuertes, hasta 48)
            let a50 = 0;
            const pix = [], need = [];
            for (let q = 0; q < n; q++) {
              if (nb > 1 && lbl[q] !== b) continue;
              const j = comp[q];
              if (dmap[j] < 0.5 * pico) continue;
              a50++;
              if (pix.length < 48) { pix.push(j); need.push(limH[M[j]]); }
            }
            if (a50 > amax || (a50 < amin && area < 2 * amin)) continue;
            delCuadro.push({ k, signo: sg, x: sdx / sd, y: sdy / sd, area: a50, area_total: area, pico, suma: sd, snr: pico / thr, G,
              caja: [bx0, by0, bx1, by1], pix: Int32Array.from(pix), need: Int16Array.from(need), hits: 0, vistos: 0 });
          }
        }
      }
      if (delCuadro.length > 64) { delCuadro.sort((a, b) => b.suma - a.suma); delCuadro.length = 64; }
      for (const p of delCuadro) pend.push(p);
    }
    // al final de los datos: se aceptan si pasaron todos los cuadros que había
    for (const p of pend) if (p.k + p.vistos >= kM && p.hits >= Math.min(C.persistir - 1, p.vistos)) acept.push(p);
    // ordenar, quitar duplicados (mismo foco en ≤ dedup_s: se queda el primero) y medir el tono
    acept.sort((a, b) => a.k - b.k || b.suma - a.suma);
    const geoR = { zona: Array.isArray(c.zona) ? c.zona.slice() : null, orig: Array.isArray(c.orig) ? c.orig.slice() : null, w, h };
    for (const p of acept) {
      const L = p.signo > 0 ? out.on : out.off, t = c.t[p.k], r = Math.sqrt(p.area / Math.PI);
      let dup = null;
      for (let j = L.length - 1; j >= 0; j--) {
        const q = L[j];
        if (t - q.t > C.dedup_s) break;
        const lim = Math.max(2, 0.8 * (r + q.r));
        if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= lim * lim) { dup = q; break; }
      }
      if (dup) {
        if (p.pico > dup.pico) { dup.pico = p.pico; dup.snr = Math.max(dup.snr, p.snr); }
        if (p.area > dup.area) { dup.area = p.area; dup.r = r; }
        continue;
      }
      const ev = { k: p.k, t, x: p.x, y: p.y, area: p.area, r, pico: p.pico, suma: p.suma, snr: p.snr,
                   tono: NaN, sat: NaN, signo: p.signo, T, caja: p.caja, recorte: geoR };
      _tonoEvento(c, ev, tr, C);
      L.push(ev);
    }
    return out;
  }
  // tono del cambio de color (halo no saturado) entre el cuadro con el foco prendido y uno apagado
  function _tonoEvento(c, ev, tr, C) {
    const g = geo(c);
    if (!g.yuv) return;
    const w = g.w, h = g.h, cw = g.cw, ch = g.ch, D = c.datos, tam = g.tam, k0 = tr.k0, kM = k0 + tr.sx.length - 1;
    const kOn = ev.signo > 0 ? ev.k : ev.k - 1, kOff = ev.signo > 0 ? Math.max(k0, ev.k - 3) : ev.k;
    if (kOn < k0 || kOn > kM || kOff < k0 || kOff === kOn) return;
    const oA = kOn * tam, oB = kOff * tam, uA = oA + w * h, vA = uA + cw * ch, uB = oB + w * h, vB = uB + cw * ch;
    const ax = tr.sx[kOn - k0], ay = tr.sy[kOn - k0], bx = tr.sx[kOff - k0], by = tr.sy[kOff - k0];
    const m = 3, [x0, y0, x1, y1] = ev.caja;
    let sY = 0, sU = 0, sV = 0, n = 0;
    for (let y = y0 - m; y <= y1 + m; y++) {
      const ya = y + ay, yb = y + by;
      if (ya < 0 || yb < 0 || ya >= h || yb >= h) continue;
      for (let x = x0 - m; x <= x1 + m; x++) {
        const xa = x + ax, xb = x + bx;
        if (xa < 0 || xb < 0 || xa >= w || xb >= w) continue;
        const YA = D[oA + ya * w + xa], YB = D[oB + yb * w + xb];
        if (YA >= C.sin_saturar) continue;
        const dY = YA - YB;
        if (dY <= 3) continue;
        const ia = Math.min(ya >> 1, ch - 1) * cw + Math.min(xa >> 1, cw - 1);
        const ib = Math.min(yb >> 1, ch - 1) * cw + Math.min(xb >> 1, cw - 1);
        sY += dY; sU += D[uA + ia] - D[uB + ib]; sV += D[vA + ia] - D[vB + ib]; n++;
      }
    }
    if (!n) return;
    const [t, s] = tonoDe(sY / n, sU / n, sV / n);
    ev.tono = t; ev.sat = s;
  }

  // ------------------------------------------------------------------ 6. manchas fijas (focos ya prendidos)
  // Mediana estabilizada de [kA, kB] (≤ 15 cuadros) → top-hat (Ylin − apertura) → componentes.
  // Para pre-stage y stage se usa [τ − 0.25, τ − 0.05] (τ = primer ámbar); localizar() lo hace si le dan cuadros.
  function manchasFijas(c, mov, o) {
    o = o || {};
    if (!mov) mov = movNulo(c);
    const C = conf(o.cfg), g = geo(c), w = g.w, h = g.h, np = g.np, D = c.datos;
    const [kA, kB] = rango(mov, c, o);
    if (!(kB >= kA) || w < 6 || h < 6) return [];
    const tr = trasladoEntero(mov), k0 = tr.k0, e = esc(c);
    const ks = muestrear(kA, kB, 15);
    const med = medianaCuadros(c, ks, tr);
    const L = lineal(med);
    const R = Math.max(2, Math.round(C.fijas_R * e));
    const tmp = new Float32Array(np), ero = new Float32Array(np), op = new Float32Array(np);
    filtroMM(L, w, h, R, false, tmp, ero);
    filtroMM(ero, w, h, R, true, tmp, op);
    const th = tmp;
    for (let i = 0; i < np; i++) th[i] = L[i] - op[i];
    const hist = new Float64Array(256);
    for (let i = 0; i < np; i++) hist[med[i]]++;
    const Gm = mediaRecortada(hist, np, 0.1, 0.9);
    const sig = kB > kA ? ruidoPix(c, tr, kA, kB) : 0;
    const thr = Math.max(C.umbral_min * (Gm > 0 ? Gm : 0), C.umbral_sigma * sig * 1.25 / Math.sqrt(ks.length), 2e-4);
    const amin = Math.max(1, Math.round(C.area[0] * e * e)), amax = Math.max(amin + 2, Math.round(C.area[1] * e * e));
    const marca = new Uint8Array(np), cid = new Int32Array(np).fill(-1);
    const pila = new Int32Array(np), comp = new Int32Array(np), lbl = new Int32Array(np), candI = new Int32Array(np);
    const out = [];
    const kMid = ks[ks.length >> 1], iMid = kMid - k0;
    let cc = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i0 = y * w + x;
        if (marca[i0] || !(th[i0] > thr)) continue;
        let n = 0, sp = 0;
        pila[sp++] = i0; marca[i0] = 1;
        while (sp) {
          const j = pila[--sp];
          comp[n++] = j;
          const xj = j % w, yj = (j - xj) / w;
          if (xj > 1 && !marca[j - 1] && th[j - 1] > thr) { marca[j - 1] = 1; pila[sp++] = j - 1; }
          if (xj < w - 2 && !marca[j + 1] && th[j + 1] > thr) { marca[j + 1] = 1; pila[sp++] = j + 1; }
          if (yj > 1 && !marca[j - w] && th[j - w] > thr) { marca[j - w] = 1; pila[sp++] = j - w; }
          if (yj < h - 2 && !marca[j + w] && th[j + w] > thr) { marca[j + w] = 1; pila[sp++] = j + w; }
        }
        if (n < amin || n > amax) continue;
        cc++;
        for (let q = 0; q < n; q++) cid[comp[q]] = cc;
        const nb = n >= 10 ? _dividir(comp, n, th, cid, cc, w, lbl, candI) : 1;
        for (let b = 0; b < nb; b++) {
          let area = 0, sd = 0, sdx = 0, sdy = 0, pico = 0, bx0 = w, by0 = h, bx1 = -1, by1 = -1;
          for (let q = 0; q < n; q++) {
            if (nb > 1 && lbl[q] !== b) continue;
            const j = comp[q], d = th[j], xj = j % w, yj = (j - xj) / w;
            area++; sd += d; sdx += d * xj; sdy += d * yj;
            if (d > pico) pico = d;
            if (xj < bx0) bx0 = xj; if (xj > bx1) bx1 = xj; if (yj < by0) by0 = yj; if (yj > by1) by1 = yj;
          }
          if (area < amin || !(sd > 0)) continue;
          let nm = 0;
          for (let q = 0; q < n; q++) if ((nb === 1 || lbl[q] === b) && th[comp[q]] >= 0.5 * pico) nm++;
          const m = { x: sdx / sd, y: sdy / sd, r: Math.max(0.5, Math.sqrt(nm / Math.PI)), area, pico,
                      contraste: pico / Math.max(Gm > 0 ? Gm : 0, 1e-3), tono: NaN, sat: NaN, caja: [bx0, by0, bx1, by1] };
          if (g.yuv) _tonoMancha(c, m, kMid, tr.sx[iMid], tr.sy[iMid], C);
          out.push(m);
        }
      }
    }
    out.sort((a, b) => b.contraste - a.contraste);
    return out;
  }
  function _tonoMancha(c, m, k, sx, sy, C) {
    const g = geo(c), w = g.w, h = g.h, cw = g.cw, ch = g.ch, D = c.datos, off = k * g.tam, uo = off + w * h, vo = uo + cw * ch;
    const [x0, y0, x1, y1] = m.caja;
    const px = (x, y) => { const fx = x + sx, fy = y + sy; return (fx < 0 || fy < 0 || fx >= w || fy >= h) ? -1 : fy * w + fx; };
    const ci = j => { const fx = j % w, fy = (j - fx) / w; return Math.min(fy >> 1, ch - 1) * cw + Math.min(fx >> 1, cw - 1); };
    let rY = 0, rU = 0, rV = 0, rn = 0;
    for (let y = y0 - 4; y <= y1 + 4; y++) for (let x = x0 - 4; x <= x1 + 4; x++) {
      if (x >= x0 - 2 && x <= x1 + 2 && y >= y0 - 2 && y <= y1 + 2) continue;
      const j = px(x, y); if (j < 0) continue;
      const q = ci(j); rY += D[off + j]; rU += D[uo + q]; rV += D[vo + q]; rn++;
    }
    if (!rn) return;
    rY /= rn; rU /= rn; rV /= rn;
    let sY = 0, sU = 0, sV = 0, n = 0;
    for (let y = y0 - 2; y <= y1 + 2; y++) for (let x = x0 - 2; x <= x1 + 2; x++) {
      const j = px(x, y); if (j < 0) continue;
      const Y = D[off + j];
      if (Y >= C.sin_saturar || Y - rY <= 3) continue;
      const q = ci(j); sY += Y - rY; sU += D[uo + q] - rU; sV += D[vo + q] - rV; n++;
    }
    if (!n) return;
    const [t, s] = tonoDe(sY / n, sU / n, sV / n);
    m.tono = t; m.sat = s;
  }

  // ------------------------------------------------------------------ 4–5. localizar (columnas, carril, focos)
  function localizar(evOn, fijas, o) {
    o = o || {};
    const C = conf(o.cfg);
    const carril = o.carril === 'der' ? 'der' : 'izq';
    const arbol = o.arbol === 'pro' || o.arbol === 'full' ? o.arbol : 'auto';
    const L_ref = isFin(o.L_ref) ? o.L_ref : NaN;
    const ev = (evOn || []).filter(e => e && isFin(e.t) && isFin(e.x) && isFin(e.y) && !(e.signo < 0)).slice().sort((a, b) => a.t - b.t);
    const Ts = ev.map(e => e.T).filter(x => x > 0);
    const T = o.T > 0 ? o.T : (Ts.length ? mediana(Ts) : 1 / 60);
    const simT = C.pro_simult * T + 1e-6;
    // manchas fijas: arreglo, función (tA, tB) → Mancha[], o se calculan con o.cuadros + o.mov
    let fijasF = null, fijasA = Array.isArray(fijas) ? fijas : [];
    if (typeof fijas === 'function') fijasF = fijas;
    else if (!Array.isArray(fijas) && o.cuadros && o.mov) fijasF = (tA, tB) => manchasFijas(o.cuadros, o.mov, { tA, tB, cfg: o.cfg });
    const disp = {
      ok: false, motivo: 'sin_arbol', puntaje: 0, abajo: [NaN, NaN], derecha: [NaN, NaN], paso_px: NaN, caja: null,
      focos: { izq: focosVacios(), der: focosVacios() }, carril, carril_auto: null, carril_dudoso: false,
      evidencia_carril: { centro: null, stage_on: null }, tipo: null, hip: { izq: null, der: null },
      candidatos: [], T, avisos: [], version: VERSION,
    };
    const tMin = isFin(L_ref) ? L_ref + C.buscar[0] : -Infinity, tMax = isFin(L_ref) ? L_ref + C.buscar[1] : Infinity;
    const evV = ev.filter(e => e.t >= tMin - 1e-9 && e.t <= tMax + 1e-9);
    const pmin = Math.max(2.5, C.paso_px[0]), pmax = C.paso_px[1];
    const nomPro = C.nominal[0], nomFull = C.nominal[1];

    const clase = e => claseTono(e.tono, e.sat, C);
    function primero(lista, t) { let a = 0, b = lista.length; while (a < b) { const m = (a + b) >> 1; if (lista[m].t < t) a = m + 1; else b = m; } return a; }
    function fuerza(e) { return 1 + 0.5 * Math.min(2, Math.log2(Math.max(1, isFin(e.snr) ? e.snr : 2))); }
    function desv(e, px, py, u, s) {
      const dx = e.x - px, dy = e.y - py;
      return [Math.abs(dx * u[0] + dy * u[1]) / s, Math.abs(dx * u[1] - dy * u[0]) / s];
    }
    function buscar(lista, px, py, u, s, ta, tb, usados, pred) {
      let best = null, bd = Infinity;
      for (let i = primero(lista, ta); i < lista.length && lista[i].t <= tb; i++) {
        const e = lista[i];
        if (usados.has(e)) continue;
        const [al, pe] = desv(e, px, py, u, s);
        if (al > C.paso_tol || pe > C.col_desv) continue;
        if (pred && !pred(e)) continue;
        const d = (al / C.paso_tol) ** 2 + (pe / C.col_desv) ** 2 - 0.15 * fuerza(e);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }
    function penal(e, px, py, u, s) { const [al, pe] = desv(e, px, py, u, s); return 0.5 * ((al / C.paso_tol) ** 2 + (pe / C.col_desv) ** 2); }
    function hayStage(a1x, a1y, u, s) {          // mancha fija sobre la columna, 0.8–3 pasos arriba de a1
      for (const m of fijasA) {
        const dx = m.x - a1x, dy = m.y - a1y, al = -(dx * u[0] + dy * u[1]) / s, pe = Math.abs(dx * u[1] - dy * u[0]) / s;
        if (al >= C.pre_stage[0] - 0.15 && al <= C.pre_stage[1] && pe <= C.col_desv) return true;
      }
      return false;
    }
    // evalúa una hipótesis de columna: a1 + m·v (m = 0..2 ámbar, 3 verde, 4 roja)
    function evaluar(tipo, a1x, a1y, vx, vy, t1, P) {
      const s = Math.hypot(vx, vy);
      if (!(s >= pmin && s <= pmax)) return null;
      const u = [vx / s, vy / s], usados = new Set(), am = [null, null, null], ta = [NaN, NaN, NaN];
      for (let m = 0; m < 3; m++) {
        const tc = tipo === 'pro' ? t1 : t1 + m * P;
        const e = buscar(evV, a1x + m * vx, a1y + m * vy, u, s, tc - simT, tc + simT, usados, x => { const k = clase(x); return k !== 'verde' && k !== 'rojo'; });
        if (e) { usados.add(e); am[m] = e; ta[m] = e.t; }
      }
      const nA = am.filter(Boolean).length;
      if (nA < 2) return null;
      let tRef, tAm;
      if (tipo === 'pro') {
        tRef = mediana(ta); tAm = [tRef, tRef, tRef];
        for (let m = 0; m < 3; m++) if (am[m]) tAm[m] = am[m].t;
      } else {
        // paso de tiempo por mínimos cuadrados con los ámbares vistos
        const ms = [], ts = [];
        for (let m = 0; m < 3; m++) if (am[m]) { ms.push(m); ts.push(am[m].t); }
        const mm = ms.reduce((a, b) => a + b, 0) / ms.length, tm = ts.reduce((a, b) => a + b, 0) / ts.length;
        let sxy = 0, sxx = 0;
        for (let j = 0; j < ms.length; j++) { sxy += (ms[j] - mm) * (ts[j] - tm); sxx += (ms[j] - mm) ** 2; }
        P = sxx > 0 ? sxy / sxx : P;
        if (!(P >= C.full_paso[0] - simT && P <= C.full_paso[1] + simT)) return null;
        tAm = [0, 1, 2].map(m => am[m] ? am[m].t : tm + (m - mm) * P);
        tRef = tAm[2];
      }
      const gx = a1x + 3 * vx, gy = a1y + 3 * vy, rx = a1x + 4 * vx, ry = a1y + 4 * vy;
      const gr = buscar(ev, gx, gy, u, s, tRef + C.delta[0] - simT, Math.min(tRef + C.delta[1] + simT, tMax), usados,
        x => { const k = clase(x); return k !== 'ambar' && k !== 'rojo'; });
      if (gr) usados.add(gr);
      const rr = buscar(ev, rx, ry, u, s, tRef + C.roja[0], Math.min(tRef + C.roja[1], tMax + 1.0), usados,
        x => { const k = clase(x); return k === 'rojo' || (k === null && !gr); });
      if (!gr && !rr && nA < 3) return null;
      if (tipo === 'full' && nA < 3 && !gr && !rr) return null;
      // puntaje
      let p = 0;
      for (let m = 0; m < 3; m++) {
        if (!am[m]) { p -= 0.6; continue; }
        const k = clase(am[m]);
        p += fuerza(am[m]) - penal(am[m], a1x + m * vx, a1y + m * vy, u, s) + (k === 'ambar' ? 0.4 : k === 'otro' ? -0.3 : 0);
      }
      if (gr) { const k = clase(gr); p += fuerza(gr) - penal(gr, gx, gy, u, s) + (k === 'verde' ? 0.6 : k === 'otro' ? -0.3 : 0); }
      if (rr) { const k = clase(rr); p += fuerza(rr) - penal(rr, rx, ry, u, s) + (k === 'rojo' ? 0.6 : -0.5); }
      if (!gr && !rr) p -= 2;
      const stg = hayStage(a1x, a1y, u, s);
      if (stg) p += 0.6;
      return {
        tipo, a1: [a1x, a1y], v: [vx, vy], s, u, P: tipo === 'full' ? P : NaN, puntaje: p, stage_visto: stg,
        t_ambar: tAm, t_ambar_ref: tRef, t_verde: gr ? gr.t : NaN, t_roja: rr ? rr.t : NaN,
        t_verde_nominal: tRef + (tipo === 'pro' ? nomPro : nomFull), completo: nA === 3 && !!(gr || rr),
        ev: { a1: am[0], a2: am[1], a3: am[2], g: gr, r: rr },
      };
    }

    const H = [];
    const push = hp => { if (hp) H.push(hp); };
    // Pro: ≥ 2 encendidos simultáneos (≤ 1.5T) y colineales; verde o roja 0.30–0.60 s después
    if (arbol !== 'full') {
      const asig = [[0, 1], [1, 2], [0, 2]];
      for (let i = 0; i < evV.length; i++) {
        const ei = evV[i];
        for (let j = primero(evV, ei.t - simT); j < evV.length && evV[j].t <= ei.t + simT; j++) {
          if (j === i) continue;
          const ej = evV[j];
          for (const [mi, mj] of asig) {
            const vx = (ej.x - ei.x) / (mj - mi), vy = (ej.y - ei.y) / (mj - mi);
            push(evaluar('pro', ei.x - mi * vx, ei.y - mi * vy, vx, vy, 0.5 * (ei.t + ej.t), NaN));
          }
        }
      }
    }
    // Full: 3 encendidos colineales hacia abajo, uno cada 0.42–0.58 s; verde o roja 0.30–0.60 s después
    if (arbol !== 'pro') {
      const P0 = C.full_paso[0], P1 = C.full_paso[1];
      for (let i = 0; i < evV.length; i++) {
        const ei = evV[i];
        for (let j = primero(evV, ei.t + P0 - simT); j < evV.length && evV[j].t <= ei.t + 2 * P1 + simT; j++) {
          const ej = evV[j], dt = ej.t - ei.t;
          if (dt >= P0 - simT && dt <= P1 + simT) {
            const vx = ej.x - ei.x, vy = ej.y - ei.y;
            push(evaluar('full', ei.x, ei.y, vx, vy, ei.t, dt));                 // a1, a2
            push(evaluar('full', ei.x - vx, ei.y - vy, vx, vy, ei.t - dt, dt));  // a2, a3
          }
          if (dt >= 2 * P0 - simT && dt <= 2 * P1 + simT) {
            const vx = 0.5 * (ej.x - ei.x), vy = 0.5 * (ej.y - ei.y);
            push(evaluar('full', ei.x, ei.y, vx, vy, ei.t, 0.5 * dt));           // a1, a3
          }
        }
      }
    }
    // quitar repetidas (misma columna, mismo tipo, mismo instante)
    H.sort((a, b) => b.puntaje - a.puntaje);
    const hips = [];
    for (const hp of H) {
      const rep = hips.some(q => q.tipo === hp.tipo && Math.hypot(q.a1[0] - hp.a1[0], q.a1[1] - hp.a1[1]) < 0.5 * q.s &&
        Math.abs(hp.s / q.s - 1) < 0.25 && q.u[0] * hp.u[0] + q.u[1] * hp.u[1] > 0.95 && Math.abs(q.t_ambar_ref - hp.t_ambar_ref) < 2 * T);
      if (!rep) hips.push(hp);
    }
    // columnas: hipótesis en el mismo lugar
    const cols = [];
    for (const hp of hips) {
      if (hp.puntaje < C.puntaje_min) continue;
      let col = cols.find(cl => cl.u[0] * hp.u[0] + cl.u[1] * hp.u[1] > 0.95 && Math.abs(hp.s / cl.s - 1) < 0.3 &&
        Math.hypot(cl.a1[0] - hp.a1[0], cl.a1[1] - hp.a1[1]) < 0.6 * cl.s);
      if (!col) { col = { a1: hp.a1, u: hp.u, s: hp.s, hips: [], best: hp }; cols.push(col); }
      col.hips.push(hp);
    }
    disp.candidatos = hips.slice(0, 20).map(hp => resumen(hp, null));
    if (!cols.length) {
      disp.motivo = hips.length ? 'sin_secuencia' : 'sin_arbol';
      return disp;
    }
    // pares de columnas paralelas, a la misma altura y separadas 1.2–4 pasos
    let par_ = null, mejor = -Infinity;
    for (let a = 0; a < cols.length; a++) for (let b = a + 1; b < cols.length; b++) {
      const A = cols[a], B = cols[b];
      if (A.u[0] * B.u[0] + A.u[1] * B.u[1] < Math.cos(15 * Math.PI / 180)) continue;
      if (Math.abs(A.s / B.s - 1) > 0.3) continue;
      const s = 0.5 * (A.s + B.s), ux = A.u[0] + B.u[0], uy = A.u[1] + B.u[1], un = Math.hypot(ux, uy);
      const dx = B.a1[0] - A.a1[0], dy = B.a1[1] - A.a1[1];
      const al = Math.abs(dx * ux + dy * uy) / un / s, pe = Math.abs(dx * uy - dy * ux) / un / s;
      if (al > C.col_desv || pe < C.sep_col[0] || pe > C.sep_col[1]) continue;
      const sum = A.best.puntaje + B.best.puntaje;
      if (sum > mejor) { mejor = sum; par_ = [A, B]; }
    }
    // hipótesis elegida por columna: la última con L_ref − t_verde en rango (si no hay L_ref: la última completa)
    function elegir(col) {
      const enRango = col.hips.filter(hp => {
        if (!isFin(L_ref)) return true;
        const tv = isFin(hp.t_verde) ? hp.t_verde : hp.t_verde_nominal, d = L_ref - tv;
        return d >= C.rt[0] && d <= C.rt[1];
      });
      if (!enRango.length) return null;
      const tUlt = Math.max(...enRango.map(hp => hp.t_ambar_ref));
      const ult = enRango.filter(hp => hp.t_ambar_ref >= tUlt - 0.3);
      ult.sort((a, b) => b.puntaje - a.puntaje);
      return ult[0];
    }
    // manchas fijas en la ventana de pre-stage/stage (antes del primer ámbar de la mejor secuencia)
    if (fijasF) {
      const top = par_ ? (par_[0].best.puntaje >= par_[1].best.puntaje ? par_[0] : par_[1]) : cols.slice().sort((a, b) => b.best.puntaje - a.best.puntaje)[0];
      const hpT = elegir(top) || top.best, tau = Math.min(...hpT.t_ambar.filter(isFin));
      try { fijasA = fijasF(tau - 0.25, tau - 0.05) || []; } catch (err) { fijasA = []; }
    }
    let colIzq = null, colDer = null, ux, uy;
    if (par_) {
      const [A, B] = par_;
      ux = A.u[0] + B.u[0]; uy = A.u[1] + B.u[1];
      const un = Math.hypot(ux, uy); ux /= un; uy /= un;
      // derecha del mundo = (u_y, −u_x) (cámara trasera, sin espejo)
      const pA = A.a1[0] * uy - A.a1[1] * ux, pB = B.a1[0] * uy - B.a1[1] * ux;
      if (pA <= pB) { colIzq = A; colDer = B; } else { colIzq = B; colDer = A; }
    } else {
      cols.sort((a, b) => b.best.puntaje - a.best.puntaje);
      const A = cols[0];
      ux = A.u[0]; uy = A.u[1];
      // ¿la otra columna se ve por sus focos fijos (stage/pre-stage) a un lado?
      const lado = ladoOtra(A, ux, uy);
      if (lado > 0) colIzq = A; else if (lado < 0) colDer = A;
      else if (carril === 'izq') colIzq = A; else colDer = A;
      disp.avisos.push(lado ? 'otra_columna_por_fijas' : 'una_columna');
    }
    disp.abajo = [ux, uy]; disp.derecha = [uy, -ux];
    const hIzq = colIzq ? elegir(colIzq) : null, hDer = colDer ? elegir(colDer) : null;
    disp.hip.izq = hIzq ? resumen(hIzq, 'izq') : null;
    disp.hip.der = hDer ? resumen(hDer, 'der') : null;
    const colTuya = carril === 'izq' ? colIzq : colDer, hTuya = carril === 'izq' ? hIzq : hDer;
    // focos de cada columna
    const fI = colIzq ? focosDe(hIzq || colIzq.best) : null, fD = colDer ? focosDe(hDer || colDer.best) : null;
    if (fI) disp.focos.izq = fI;
    if (fD) disp.focos.der = fD;
    if (!fI && fD) disp.focos.izq = otraPorFijas(fD, -1);
    if (!fD && fI) disp.focos.der = otraPorFijas(fI, +1);
    const sRef = (colIzq || colDer).s;
    disp.paso_px = par_ ? 0.5 * (par_[0].s + par_[1].s) : sRef;
    disp.caja = cajaDe(disp.focos, disp.paso_px);
    // carril automático: columna más cercana al centro de la imagen y stage encendido al quedar quieto
    evidenciaCarril();
    if (!hTuya) {
      disp.ok = false;
      disp.motivo = 'sin_secuencia';
      disp.puntaje = colTuya ? colTuya.best.puntaje : 0;
      if (!colTuya) disp.avisos.push('sin_columna_' + carril);
      return disp;
    }
    disp.tipo = hTuya.tipo;
    disp.puntaje = hTuya.puntaje;
    disp.ok = true; disp.motivo = null;
    // ambigua: otra secuencia completa en tu columna, de otro tipo y casi igual de buena
    const rival = colTuya.hips.find(hp => hp !== hTuya && hp.tipo !== hTuya.tipo && hp.completo && hTuya.completo &&
      Math.abs(hp.puntaje - hTuya.puntaje) < 0.3 && Math.abs((hp.t_verde || hp.t_verde_nominal) - (hTuya.t_verde || hTuya.t_verde_nominal)) > 0.1);
    if (rival) { disp.ok = false; disp.motivo = 'ambigua'; }
    if (!hTuya.completo) disp.avisos.push('secuencia_incompleta');
    return disp;

    // ---- auxiliares de localizar
    function ladoOtra(A, ux_, uy_) {
      // +1: hay focos fijos a la derecha (A es la izquierda); −1: a la izquierda; 0: no se sabe
      const s = A.s, dxr = uy_, dyr = -ux_;
      let der = 0, izq = 0;
      for (const m of fijasA) {
        const dx = m.x - A.a1[0], dy = m.y - A.a1[1];
        const al = -(dx * ux_ + dy * uy_) / s, pe = (dx * dxr + dy * dyr) / s;
        if (al < C.pre_stage[0] - 0.3 || al > C.pre_stage[1] + 0.3) continue;
        if (pe >= C.sep_col[0] && pe <= C.sep_col[1]) der++;
        if (-pe >= C.sep_col[0] && -pe <= C.sep_col[1]) izq++;
      }
      return der > izq ? 1 : izq > der ? -1 : 0;
    }
    function focosDe(hp) {
      // recta a1 + m·v por mínimos cuadrados con los eventos asignados
      const pts = [];
      ['a1', 'a2', 'a3', 'g', 'r'].forEach((k, m) => { const e = hp.ev[k]; if (e) pts.push([m, e.x, e.y]); });
      let a1x = hp.a1[0], a1y = hp.a1[1], vx = hp.v[0], vy = hp.v[1];
      if (pts.length >= 2) {
        const n = pts.length, mm = pts.reduce((a, p) => a + p[0], 0) / n;
        const xm = pts.reduce((a, p) => a + p[1], 0) / n, ym = pts.reduce((a, p) => a + p[2], 0) / n;
        let sxx = 0, sx = 0, sy = 0;
        for (const p of pts) { sxx += (p[0] - mm) ** 2; sx += (p[0] - mm) * (p[1] - xm); sy += (p[0] - mm) * (p[2] - ym); }
        if (sxx > 0) { vx = sx / sxx; vy = sy / sxx; a1x = xm - mm * vx; a1y = ym - mm * vy; }
      }
      const s = Math.hypot(vx, vy), u = [vx / s, vy / s];
      const rAm = clampR(mediana([hp.ev.a1, hp.ev.a2, hp.ev.a3].filter(Boolean).map(e => e.r)), s);
      const rG = clampR(hp.ev.g ? hp.ev.g.r : hp.ev.r ? hp.ev.r.r : rAm, s);
      const f = focosVacios();
      for (let m = 0; m < 3; m++) f['a' + (m + 1)] = { x: a1x + m * vx, y: a1y + m * vy, r: rAm, visto: !!hp.ev['a' + (m + 1)] };
      f.g = { x: a1x + 3 * vx, y: a1y + 3 * vy, r: rG, visto: !!hp.ev.g };
      f.r = hp.ev.r ? { x: hp.ev.r.x, y: hp.ev.r.y, r: rG, visto: true } : { x: f.g.x + vx, y: f.g.y + vy, r: rG, visto: false };
      // pre-stage y stage: manchas fijas 0.8–3 pasos arriba de a1; las dobles de lado se unen
      const grupos = [];
      for (const m of fijasA) {
        const dx = m.x - a1x, dy = m.y - a1y, al = -(dx * u[0] + dy * u[1]) / s, pe = Math.abs(dx * u[1] - dy * u[0]) / s;
        if (al < C.pre_stage[0] - 0.15 || al > C.pre_stage[1] || pe > C.col_desv + 0.2) continue;
        let gp = grupos.find(q => Math.abs(q.al - al) < 0.35);
        if (!gp) { gp = { al, ms: [] }; grupos.push(gp); }
        gp.ms.push(m);
      }
      for (const gp of grupos) {
        const wsum = gp.ms.reduce((a, m) => a + m.contraste, 0) || 1;
        gp.x = gp.ms.reduce((a, m) => a + m.x * m.contraste, 0) / wsum;
        gp.y = gp.ms.reduce((a, m) => a + m.y * m.contraste, 0) / wsum;
        let r = Math.max(...gp.ms.map(m => m.r));
        for (const m of gp.ms) r = Math.max(r, Math.hypot(m.x - gp.x, m.y - gp.y) + m.r);
        gp.r = Math.min(r, 0.45 * s);
        gp.al = -((gp.x - a1x) * u[0] + (gp.y - a1y) * u[1]) / s;
      }
      grupos.sort((a, b) => a.al - b.al);
      if (grupos[0]) f.stg = { x: grupos[0].x, y: grupos[0].y, r: grupos[0].r, visto: true };
      const pre = grupos.find(gp => gp.al > grupos[0].al + 0.3);
      if (pre) f.pre = { x: pre.x, y: pre.y, r: pre.r, visto: true };
      return f;
    }
    function otraPorFijas(f, ladoSigno) {
      // la otra columna solo por sus focos fijos: misma forma, corrida de lado
      const vac = focosVacios();
      if (!f.stg) return vac;
      const dr = [disp.derecha[0] * ladoSigno, disp.derecha[1] * ladoSigno], s = disp.paso_px || 10;
      let best = null, bd = Infinity;
      for (const m of fijasA) {
        const dx = m.x - f.stg.x, dy = m.y - f.stg.y, pe = (dx * dr[0] + dy * dr[1]) / s;
        const al = Math.abs(dx * disp.abajo[0] + dy * disp.abajo[1]) / s;
        if (pe < C.sep_col[0] || pe > C.sep_col[1] || al > 0.5) continue;
        if (al < bd) { bd = al; best = m; }
      }
      if (!best) return vac;
      const ox = best.x - f.stg.x, oy = best.y - f.stg.y;
      for (const k of FOCOS) if (f[k]) vac[k] = { x: f[k].x + ox, y: f[k].y + oy, r: f[k].r, visto: k === 'stg' };
      vac.stg.r = Math.min(best.r, 0.45 * s);
      return vac;
    }
    function evidenciaCarril() {
      const ev_ = disp.evidencia_carril;
      const fx = lado => { const f = disp.focos[lado]; return f && f.a1 ? [0.5 * (f.a1.x + f.g.x), 0.5 * (f.a1.y + f.g.y)] : null; };
      const cI = fx('izq'), cD = fx('der');
      // centro de la imagen original en coordenadas del recorte
      let ctr = Array.isArray(o.centro) ? o.centro : null;
      const cu = o.cuadros || (ev.length && ev[0].recorte) || {};
      const zona = o.zona || cu.zona, orig = o.orig || cu.orig, wr = o.w || cu.w;
      if (!ctr && Array.isArray(zona) && Array.isArray(orig) && zona[2] > 0) {
        const e_ = (wr > 0 ? wr : zona[2]) / zona[2];
        ctr = [(orig[0] / 2 - zona[0]) * e_, (orig[1] / 2 - zona[1]) * e_];
      }
      const dr = disp.derecha, s = disp.paso_px;
      if (ctr && isFin(dr[0])) {
        const proj = p => (p[0] - ctr[0]) * dr[0] + (p[1] - ctr[1]) * dr[1];
        let porCercana = null, porLado = null;
        if (cI && cD) porCercana = Math.abs(proj(cI)) <= Math.abs(proj(cD)) ? 'izq' : 'der';
        const cs = [cI, cD].filter(Boolean), cm = [cs.reduce((a, p) => a + p[0], 0) / cs.length, cs.reduce((a, p) => a + p[1], 0) / cs.length];
        const pm = proj(cm);
        if (Math.abs(pm) > 0.5 * s) porLado = pm > 0 ? 'izq' : 'der';     // árbol a la derecha → vas en el carril izquierdo
        ev_.centro = porCercana && porLado && porCercana !== porLado ? null : (porCercana || porLado);
      }
      if (isFin(o.hora_quieto)) {
        const hits = { izq: Infinity, der: Infinity };
        for (const lado of LADOS) {
          const f = disp.focos[lado] && disp.focos[lado].stg;
          if (!f) continue;
          for (const e of ev) {
            const dt = Math.abs(e.t - o.hora_quieto);
            if (dt > C.quieto_s) continue;
            if (Math.hypot(e.x - f.x, e.y - f.y) <= Math.max(2, 0.6 * s)) hits[lado] = Math.min(hits[lado], dt);
          }
        }
        if (hits.izq < Infinity || hits.der < Infinity) ev_.stage_on = hits.izq <= hits.der ? 'izq' : 'der';
        if (hits.izq < Infinity && hits.der < Infinity && Math.abs(hits.izq - hits.der) < 2 * T) ev_.stage_on = null;
      }
      const a = ev_.centro, b = ev_.stage_on;
      disp.carril_auto = a && b ? (a === b ? a : null) : (a || b || null);
      if (a && b && a === b && a !== carril) { disp.carril_dudoso = true; disp.avisos.push('carril_dudoso'); }
    }
  }
  function clampR(r, s) { return Math.max(0.8, Math.min(isFin(r) ? r : 0.3 * s, 0.45 * s)); }
  function focosVacios() { const f = {}; for (const k of FOCOS) f[k] = null; return f; }
  function resumen(hp, lado) {
    return { lado, tipo: hp.tipo, puntaje: +hp.puntaje.toFixed(3), completo: hp.completo, stage_visto: hp.stage_visto,
             t_ambar: hp.t_ambar.slice(), t_ambar_ref: hp.t_ambar_ref, t_verde: hp.t_verde, t_roja: hp.t_roja,
             t_verde_nominal: hp.t_verde_nominal, P: hp.P, a1: hp.a1.slice(), paso: [hp.v[0], hp.v[1]] };
  }
  function cajaDe(focos, s) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of LADOS) for (const k of FOCOS) {
      const f = focos[l] && focos[l][k];
      if (!f) continue;
      x0 = Math.min(x0, f.x - f.r); x1 = Math.max(x1, f.x + f.r); y0 = Math.min(y0, f.y - f.r); y1 = Math.max(y1, f.y + f.r);
    }
    if (!isFin(x0)) return null;
    const m = 0.5 * (s || 0);
    return [x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m];
  }

  // ------------------------------------------------------------------ 7. rasgos por foco y cuadro
  // b = mediana del anillo [2.0, 2.8]·r sin otros focos; e = Σ max(0, Ylin − b) en el disco 1.6r (Voronoi entre
  // focos, sin píxeles que se queman); p = máximo por filas (o columnas) de la media de la fila; c = tono.
  // Se guarda e y p sin dividir: y = e/G (ver serie()).
  function rasgos(c, mov, disp, cfg) {
    if (!mov) mov = movNulo(c);
    const C = conf(cfg), g = geo(c), w = g.w, h = g.h, cw = g.cw, ch = g.ch, tam = g.tam, D = c.datos;
    const n = mov.n | 0, k0 = mov.k0 | 0, nc = COLUMNAS.length;
    const R = { n, t: new Float64Array(n), cols: COLUMNAS.slice(), datos: new Float32Array(n * nc).fill(NaN),
                peso: new Float32Array(n), G: new Float32Array(n), mov, fuente_t: (c.reloj && c.reloj.fuente) || null,
                k0, T: periodo(c), focos: null, version: VERSION };
    for (let i = 0; i < n; i++) { R.t[i] = c.t[k0 + i]; R.G[i] = mov.G[i]; }
    // pesos: 0 con salto de autoexposición, mala estabilización o sacudida. Sacudida = el cuadro se sale más de
    // salto_max_px de la recta entre sus vecinos (un golpe o una estabilización que falló); el cabeceo de la salida,
    // aunque sea rápido, es suave y no pierde peso (ahí es donde se apaga el stage).
    for (let i = 0; i < n; i++) {
      let p = mov.q[i] >= C.q_min && mov.G[i] > 0 ? 1 : 0;
      if (i > 0 && p && Math.abs(Math.log(mov.G[i] / mov.G[i - 1])) > C.salto_AE) p = 0;
      if (p && i > 0 && i < n - 1) {
        const ex = mov.dx[i] - 0.5 * (mov.dx[i - 1] + mov.dx[i + 1]), ey = mov.dy[i] - 0.5 * (mov.dy[i - 1] + mov.dy[i + 1]);
        if (Math.hypot(ex, ey) > C.salto_max_px) p = 0;
      }
      R.peso[i] = p;
    }
    const lista = [];
    const focos = disp && disp.focos ? disp.focos : {};
    R.focos = { izq: focosVacios(), der: focosVacios() };
    LADOS.forEach((lado, li) => FOCOS.forEach((f, fi) => {
      const F = focos[lado] && focos[lado][f];
      if (!F || !isFin(F.x) || !isFin(F.y)) return;
      const r = Math.max(0.7, isFin(F.r) ? F.r : 2);
      R.focos[lado][f] = { x: F.x, y: F.y, r };
      lista.push({ lado, f, col: (li * FOCOS.length + fi) * RASGOS.length, x: F.x, y: F.y, r });
    }));
    if (!lista.length || !n) return R;
    const tr = trasladoEntero(mov);
    // geometría de cada foco (desplazamientos lineales respecto al píxel central)
    for (const F of lista) {
      const rx = Math.round(F.x), ry = Math.round(F.y), rd = C.disco * F.r, ra0 = C.anillo[0] * F.r, ra1 = C.anillo[1] * F.r;
      const R1 = Math.ceil(ra1) + 1;
      const disco = [], anillo = [], filas = [], cols_ = [];
      for (let oy = -R1; oy <= R1; oy++) for (let ox = -R1; ox <= R1; ox++) {
        const px = rx + ox, py = ry + oy, d = Math.hypot(px - F.x, py - F.y);
        if (d <= rd) {
          let mio = true;
          for (const G2 of lista) if (G2 !== F && Math.hypot(px - G2.x, py - G2.y) < d) { mio = false; break; }
          if (mio) { disco.push(ox, oy); filas.push(oy); cols_.push(ox); }
        } else if (d >= ra0 && d <= ra1) {
          let libre = true;
          for (const G2 of lista) if (G2 !== F && Math.hypot(px - G2.x, py - G2.y) <= C.disco * G2.r + 0.5) { libre = false; break; }
          if (libre) anillo.push(ox, oy);
        }
      }
      F.rx = rx; F.ry = ry; F.R1 = R1;
      F.disco = Int16Array.from(disco); F.anillo = Int16Array.from(anillo);
      F.excl = new Uint8Array(disco.length >> 1);
      F.nfila = 2 * R1 + 1;
    }
    // píxeles del disco que se queman en algún cuadro (con el foco prendido): fuera
    const pasoS = n > 240 ? 2 : 1;
    for (const F of lista) {
      const nd = F.disco.length >> 1, maxv = new Uint8Array(nd);
      for (let i = 0; i < n; i += pasoS) {
        const off = (k0 + i) * tam, cx = F.rx + tr.sx[i], cy = F.ry + tr.sy[i];
        for (let q = 0; q < nd; q++) {
          const px = cx + F.disco[2 * q], py = cy + F.disco[2 * q + 1];
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          const v = D[off + py * w + px];
          if (v > maxv[q]) maxv[q] = v;
        }
      }
      let ne = 0;
      for (let q = 0; q < nd; q++) if (maxv[q] >= C.sat) { F.excl[q] = 1; ne++; }
      F.todoQuemado = nd > 0 && ne > 0.9 * nd;
      if (F.todoQuemado) F.excl.fill(0);
    }
    const hist = new Float64Array(256), accF = new Float64Array(256), cntF = new Float64Array(256), accC = new Float64Array(256), cntC = new Float64Array(256);
    const yuv = g.yuv;
    for (let i = 0; i < n; i++) {
      const k = k0 + i, off = k * tam, uo = off + w * h, vo = uo + cw * ch, base = i * nc;
      const sxk = tr.sx[i], syk = tr.sy[i];
      for (const F of lista) {
        const cx = F.rx + sxk, cy = F.ry + syk;
        // fondo: mediana del anillo (y su color medio)
        hist.fill(0);
        let nr = 0, rU = 0, rV = 0, nru = 0;
        const an = F.anillo;
        for (let q = 0; q < an.length; q += 2) {
          const px = cx + an[q], py = cy + an[q + 1];
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          hist[D[off + py * w + px]]++; nr++;
          if (yuv && !((px | py) & 1)) { const ci = Math.min(py >> 1, ch - 1) * cw + Math.min(px >> 1, cw - 1); rU += D[uo + ci]; rV += D[vo + ci]; nru++; }
        }
        if (!nr) continue;
        const b8 = medianaHist(hist, nr), b = linf(b8);
        // energía, perfil por filas/columnas y color del disco
        let e = 0, nd = 0, sY = 0, sU = 0, sV = 0, nt = 0;
        const R1 = F.R1, nf = F.nfila;
        for (let q = 0; q < nf; q++) { accF[q] = 0; cntF[q] = 0; accC[q] = 0; cntC[q] = 0; }
        const di = F.disco;
        for (let q = 0; q < di.length; q += 2) {
          if (F.excl[q >> 1]) continue;
          const ox = di[q], oy = di[q + 1], px = cx + ox, py = cy + oy;
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          const Y = D[off + py * w + px];
          let v = LIN[Y] - b;
          if (v < 0) v = 0;
          e += v; nd++;
          accF[oy + R1] += v; cntF[oy + R1]++; accC[ox + R1] += v; cntC[ox + R1]++;
          if (yuv && Y < C.sin_saturar && Y - b8 > 4) {
            const ci = Math.min(py >> 1, ch - 1) * cw + Math.min(px >> 1, cw - 1);
            sY += Y - b8; sU += D[uo + ci]; sV += D[vo + ci]; nt++;
          }
        }
        if (!nd) continue;
        let mxF = 0, mxC = 0, p = 0;
        for (let q = 0; q < nf; q++) { if (cntF[q] > mxF) mxF = cntF[q]; if (cntC[q] > mxC) mxC = cntC[q]; }
        for (let q = 0; q < nf; q++) {
          if (cntF[q] >= 0.4 * mxF && cntF[q] > 0) { const m = accF[q] / cntF[q]; if (m > p) p = m; }
          if (cntC[q] >= 0.4 * mxC && cntC[q] > 0) { const m = accC[q] / cntC[q]; if (m > p) p = m; }
        }
        let tono = NaN;
        if (nt >= 2 && nru > 0) {
          const [t_, s_] = tonoDe(sY / nt, sU / nt - rU / nru, sV / nt - rV / nru);
          if (s_ >= C.sat_min) tono = t_;
        }
        R.datos[base + F.col] = e;
        R.datos[base + F.col + 1] = p;
        R.datos[base + F.col + 2] = tono;
      }
    }
    return R;
  }
  // serie de un foco lista para ajustarFlanco: y = e/G (o p/G), con peso; lado 'izq'|'der', foco 'a3', etc.
  function serie(rasgos_, lado, foco, o) {
    o = o || {};
    const nc = rasgos_.cols.length, ie = rasgos_.cols.indexOf(lado + '.' + foco + '.e');
    const n = rasgos_.n, tA = isFin(o.tA) ? o.tA : -Infinity, tB = isFin(o.tB) ? o.tB : Infinity;
    const t = [], y = [], p = [], peso = [], c = [];
    if (ie < 0) return { t, y, p, peso, c };
    for (let i = 0; i < n; i++) {
      const ti = rasgos_.t[i];
      if (ti < tA || ti > tB) continue;
      const G = rasgos_.G[i] > 0 ? rasgos_.G[i] : NaN;
      t.push(ti); y.push(rasgos_.datos[i * nc + ie] / G); p.push(rasgos_.datos[i * nc + ie + 1] / G);
      c.push(rasgos_.datos[i * nc + ie + 2]);
      peso.push(isFin(G) ? rasgos_.peso[i] : 0);
    }
    return { t, y, p, peso, c };
  }

  // ------------------------------------------------------------------ 8. ajuste del flanco
  // pred = a + b·[C(s+E−τ) − C(s−τ)]/E, s = t_k − E/2 (t_k = centro de la exposición); C = integral de la forma de la
  // lámpara: LED = escalón; incandescente 1 − e^(−t/τr) al subir, e^(−t/τf) al bajar (τf = 0.6τr). Rejilla en τ (0.1 ms),
  // τr y E; a, b por mínimos cuadrados; pérdida Huber 2.5σ; misma ventana para todos los modelos; modelo por BIC;
  // τ̂ = media posterior. PWM (> 15 % de la meseta bajo la mitad): rasgo p y verosimilitud de mezcla.
  // serie: {t, y, peso?, p?, dt?} o un arreglo de series (ajuste conjunto con el mismo τ, cada una con su a y b).
  function ajustarFlanco(serie_, o) {
    o = o || {};
    const C = conf(o.cfg), F = C.fl, signo = o.signo < 0 ? -1 : 1;
    const lista = (Array.isArray(serie_) ? serie_ : [serie_]).filter(s => s && s.t && s.y).map(normSerie).filter(s => s.n >= 3);
    const res0 = { ok: false, motivo: 'sin_datos', t: NaN, sigma: NaN, lampara: { tipo: 'led', tr_s: 0 }, E_s: NaN, pwm: false,
                   nivel_off: NaN, nivel_on: NaN, contraste: 0, signo };
    if (!lista.length) return res0;
    const T = o.T > 0 ? o.T : periodoT(lista[0].t);
    const tA = isFin(o.tA) ? o.tA : -Infinity, tB = isFin(o.tB) ? o.tB : Infinity;
    let t0 = isFin(o.t0) ? o.t0 : NaN;
    if (!isFin(t0)) t0 = mediana(lista.map(s => flancoGrueso(s, signo, tA, tB, T)));
    if (!isFin(t0)) { res0.motivo = 'sin_flanco'; return res0; }
    let r = null;
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      r = _ajustar(lista, signo, t0, T, F, o);
      if (!r.borde || !isFin(r.t)) break;
      t0 = r.t;                                  // el flanco quedó en la orilla de la rejilla: recentrar una vez
    }
    if (r.ok) completar(r, lista[0], signo);
    return r;
  }
  function normSerie(s) {
    const n0 = s.t.length, t = [], y = [], w = [], p = [];
    const dt = isFin(s.dt) ? s.dt : 0, tienep = !!(s.p && s.p.length === n0);
    for (let i = 0; i < n0; i++) {
      const wi = s.peso ? +s.peso[i] : 1;
      if (!isFin(s.t[i]) || !isFin(s.y[i]) || !(wi > 0)) continue;
      t.push(s.t[i] + dt); y.push(s.y[i]); w.push(wi); p.push(tienep && isFin(s.p[i]) ? s.p[i] : NaN);
    }
    const idx = t.map((_, i) => i).sort((a, b) => t[a] - t[b]);
    return { n: t.length, t: Float64Array.from(idx.map(i => t[i])), y: Float64Array.from(idx.map(i => y[i])),
             w: Float64Array.from(idx.map(i => w[i])), p: Float64Array.from(idx.map(i => p[i])), tienep: tienep && p.some(isFin) };
  }
  // posición gruesa del flanco en [tA, tB]: mayor diferencia de medias (≈ 70 ms a cada lado), luego cruce del 50 %
  function flancoGrueso(s, signo, tA, tB, T) {
    const n = s.n, t = s.t, y = s.y, nb = Math.max(3, Math.round(0.07 / T));
    if (n < 2 * nb) return NaN;
    const cs = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + y[i];
    let best = 0, jb = -1;
    for (let j = nb; j <= n - nb; j++) {
      const tc = 0.5 * (t[j - 1] + t[j]);
      if (tc < tA || tc > tB) continue;
      const sc = signo * ((cs[j + nb] - cs[j]) - (cs[j] - cs[j - nb])) / nb;
      if (sc > best) { best = sc; jb = j; }
    }
    if (jb < 0) return NaN;
    const antes = mediana(Array.from(y.subarray(Math.max(0, jb - 2 * nb), jb)));
    const desp = Array.from(y.subarray(jb, Math.min(n, jb + 2 * nb)));
    const despues = signo > 0 ? percentil(desp, 0.9) : percentil(desp, 0.1);
    const mid = 0.5 * (antes + despues);
    for (let j = Math.max(1, jb - nb); j < Math.min(n, jb + nb); j++) {
      if (signo * (y[j] - mid) > 0 && signo * (y[j - 1] - mid) <= 0) return 0.5 * (t[j - 1] + t[j]);
    }
    return 0.5 * (t[jb - 1] + t[jb]);
  }
  function _ajustar(lista, signo, t0, T, F, o) {
    const res = { ok: false, motivo: null, t: NaN, sigma: NaN, lampara: { tipo: 'led', tr_s: 0 }, E_s: NaN, pwm: false,
                  nivel_off: NaN, nivel_on: NaN, contraste: 0, salto: NaN, ruido: NaN, t0, n: 0, bic: NaN, borde: false, signo };
    const wa = t0 - F.ventana_T * T - F.ventana_extra_s, wb = t0 + Math.max(F.ventana_T * T, F.ventana_min_s);
    const ser = [];
    for (const s of lista) {
      const idx = [];
      for (let i = 0; i < s.n; i++) if (s.t[i] >= wa && s.t[i] <= wb) idx.push(i);
      if (idx.length < 3) continue;
      const m = idx.length;
      const x = { n: m, t: new Float64Array(m), y: new Float64Array(m), w: new Float64Array(m), p: new Float64Array(m), tienep: s.tienep };
      idx.forEach((i, j) => { x.t[j] = s.t[i]; x.y[j] = s.y[i]; x.w[j] = s.w[i]; x.p[j] = s.p[i]; });
      ser.push(x);
    }
    if (!ser.length) { res.motivo = 'pocos_cuadros'; return res; }
    // niveles por serie (lejos del flanco) y ¿PWM?
    function niveles(x, usaP) {
      const v = usaP ? x.p : x.y, an = [], de = [];
      for (let i = 0; i < x.n; i++) {
        if (!isFin(v[i])) continue;
        if (x.t[i] < t0 - 1.5 * T) an.push(v[i]); else if (x.t[i] > t0 + 1.5 * T) de.push(v[i]);
      }
      const off = signo > 0 ? an : de, on = signo > 0 ? de : an;
      const lo = mediana(off), hiM = mediana(on), hi90 = signo > 0 ? percentil(on, 0.9) : percentil(on, 0.9);
      const madOff = mediana(off.map(z => Math.abs(z - lo))), madOn = mediana(on.map(z => Math.abs(z - hiM)));
      return { off, on, lo, hiM, hi90, madOff, madOn };
    }
    let nBajo = 0, nMes = 0;
    for (const x of ser) {
      const L = niveles(x, false), mid = 0.5 * (L.lo + L.hi90);
      for (let i = 0; i < x.n; i++) {
        const enMeseta = signo > 0 ? x.t[i] > t0 + 2 * T : x.t[i] < t0 - 2 * T;
        if (!enMeseta) continue;
        nMes++;
        if (x.y[i] < mid) nBajo++;
      }
    }
    const pwm = o.pwm === true || (o.pwm !== false && nMes >= 5 && nBajo / nMes > F.pwm_frac);
    if (pwm) for (const x of ser) if (x.tienep) { const tmp = x.y; x.y = x.p; x.p = tmp; }
    const Ls = ser.map(x => niveles(x, false));
    // escala del ruido (MAD de las mesetas), común a todos los modelos
    let sc = 1.4826 * mediana(Ls.flatMap(L => [L.madOff, L.madOn]).filter(isFin));
    const saltoMed = mediana(Ls.map(L => Math.abs(L.hiM - L.lo)));
    if (!(sc > 0)) sc = 1e-3 * (saltoMed || 1);
    sc = Math.max(sc, 1e-6 * (saltoMed || 1), 1e-12);
    const tauLo = t0 - Math.max(F.atras_T * T, F.atras_min_s), tauHi = t0 + F.adelante_T * T, du = F.rejilla;
    const NT = Math.floor((tauHi - tauLo) / du) + 1;
    let mObs = 0;
    for (const x of ser) mObs += x.n;
    res.n = mObs;
    if (pwm) return _ajustarPWM(ser, Ls, signo, tauLo, du, NT, T, F, res, sc);
    // modelos (τr, E)
    const Es = F.E_s.concat(F.E_T.map(f => f * T)).filter(E => E > 0).sort((a, b) => a - b);
    const modelos = [];
    for (const trm of F.tr_ms) for (const E of Es) modelos.push({ tr: trm / 1000, E });
    const umin = wa - tauHi - 1.0 * T - 2 * du, umax = wb - tauLo + 1.0 * T + 2 * du;
    const NU = Math.ceil((umax - umin) / du) + 3;
    const tab = new Float64Array(NU);
    const c = F.huber * sc;
    const ns = ser.length;
    // índices base de cada muestra en la tabla (u = t − τ = (t − tauLo) − i·du)
    const base = ser.map(x => { const b = new Int32Array(x.n), f = new Float64Array(x.n);
      for (let k = 0; k < x.n; k++) { const z = (x.t[k] - tauLo - umin) / du; b[k] = Math.floor(z); f[k] = z - b[k]; }
      return { b, f }; });
    const pre = ser.map(x => { let Sw = 0, Swy = 0; for (let k = 0; k < x.n; k++) { Sw += x.w[k]; Swy += x.w[k] * x.y[k]; } return { Sw, Swy }; });
    const pbuf = new Float64Array(Math.max(...ser.map(x => x.n)));
    function llenarTabla(m) {
      const tl = signo > 0 ? m.tr : F.tf_rel * m.tr, E = m.E, h = 0.5 * E;
      const Fi = tl > 0 ? (z => z <= 0 ? 0 : z - tl * (1 - Math.exp(-z / tl))) : (z => z <= 0 ? 0 : z);
      for (let j = 0; j < NU; j++) { const u = umin + j * du; tab[j] = (Fi(u + h) - Fi(u - h)) / E; }
    }
    const sal = { a: 0, b: 0 };
    function perdida(i) {
      let L = 0;
      for (let si = 0; si < ns; si++) {
        const x = ser[si], B = base[si];
        let Sw = pre[si].Sw, Swy = pre[si].Swy, Swp = 0, Swpp = 0, Swpy = 0;
        for (let k = 0; k < x.n; k++) {
          const j = B.b[k] - i, f = B.f[k];
          const p = tab[j] + f * (tab[j + 1] - tab[j]);
          pbuf[k] = p;
          const wk = x.w[k];
          Swp += wk * p; Swpp += wk * p * p; Swpy += wk * p * x.y[k];
        }
        const den = Sw * Swpp - Swp * Swp;
        let b = den > 1e-12 * Sw * Sw ? (Sw * Swpy - Swp * Swy) / den : 0;
        if (signo * b < 0) b = 0;
        const a = (Swy - b * Swp) / Sw;
        if (si === 0) { sal.a = a; sal.b = b; }
        for (let k = 0; k < x.n; k++) {
          let r = x.y[k] - a - b * pbuf[k];
          if (r < 0) r = -r;
          L += x.w[k] * (r <= c ? r * r : 2 * c * r - c * c);
        }
      }
      return L;
    }
    // Pesos exp(−(nll − min)/(2σ̂²)) sobre toda la rejilla (τ × modelo), con previa 50 % LED / 50 % incandescente.
    // Así un modelo que solo ajusta en una franja angosta de τ (p. ej. E largo con un escalón limpio) pesa poco.
    // 1) rejilla gruesa ('grueso' pasos) con todos los modelos
    const paso = F.grueso, lnm = Math.log(Math.max(2, mObs)), s2 = sc * sc;
    const nLed = modelos.filter(m => !(m.tr > 0)).length || 1, nInc = modelos.length - nLed || 1;
    const NG = Math.floor((NT - 1) / paso) + 1;
    const Lg = modelos.map(() => new Float64Array(NG));
    let Lmin = Infinity;
    modelos.forEach((m, mi) => {
      llenarTabla(m);
      m.prior = m.tr > 0 ? 0.5 / nInc : 0.5 / nLed;
      m.Lmin = Infinity;
      for (let g_ = 0; g_ < NG; g_++) { const L = perdida(g_ * paso); Lg[mi][g_] = L; if (L < m.Lmin) m.Lmin = L; }
      if (m.Lmin < Lmin) Lmin = m.Lmin;
    });
    const s2p = Math.max(s2, Lmin / Math.max(1, mObs - (2 * ns + 2)));
    // tipo de lámpara por BIC (nll mínima + k·ln m): el incandescente paga un parámetro más (τr)
    let bLed = Infinity, bInc = Infinity;
    for (const m of modelos) {
      const b_ = m.Lmin / s2p + (2 * ns + 1 + (m.tr > 0 ? 1 : 0)) * lnm;
      m.bic = b_;
      if (m.tr > 0) { if (b_ < bInc) bInc = b_; } else if (b_ < bLed) bLed = b_;
    }
    const esInc = bInc < bLed - F.bic_inc;            // + 2·ln(7): se eligió el mejor de 7 τr (mirar en todos lados)
    const delTipo = modelos.filter(m => (m.tr > 0) === esInc);
    for (const m of delTipo) m.prior = 1;
    function posterior(lista_, i0, i1, st) {   // pesos de los modelos de la lista en τ_i, i = i0..i1 cada st
      let sw = 0, swt = 0, swtt = 0;
      for (const m of lista_) {
        let z = 0, zt = 0, ztt = 0;
        for (let i = i0, g_ = 0; i <= i1; i += st, g_++) {
          const L = m.Lf ? m.Lf[g_] : Lg[m.idx][i / paso];
          const wgt = Math.exp(-(L - Lmin) / (2 * s2p)), tau = tauLo + i * du;
          z += wgt; zt += wgt * tau; ztt += wgt * tau * tau;
        }
        m.Z = m.prior * z * st; m.zt = m.prior * zt * st; m.ztt = m.prior * ztt * st;
        m.var = z > 0 ? Math.max(0, ztt / z - (zt / z) ** 2) : 0;
        sw += m.Z; swt += m.zt; swtt += m.ztt;
      }
      return { sw, t: swt / sw, var: Math.max(0, swtt / sw - (swt / sw) ** 2) };
    }
    modelos.forEach((m, mi) => { m.idx = mi; m.Lf = null; });
    let post = posterior(delTipo, 0, (NG - 1) * paso, paso);
    // 2) si la posterior es angosta, rejilla fina (0.1 ms) en ±6σ con los modelos que pesan
    if (Math.sqrt(post.var) < 2.5e-3 && paso > 1) {
      const zmax = Math.max(...delTipo.map(m => m.Z));
      const vivos = delTipo.filter(m => m.Z >= 1e-3 * zmax);
      const sd = Math.sqrt(post.var) + 1e-3;
      const i0 = clampi(Math.floor((post.t - 6 * sd - tauLo) / du), 0, NT - 1), i1 = clampi(Math.ceil((post.t + 6 * sd - tauLo) / du), i0, NT - 1);
      for (const m of vivos) {
        llenarTabla(m);
        m.Lf = new Float64Array(i1 - i0 + 1);
        for (let i = i0; i <= i1; i++) { const L = perdida(i); m.Lf[i - i0] = L; if (L < Lmin) Lmin = L; }
      }
      post = posterior(vivos, i0, i1, 1);
    }
    const tHat = post.t, sig = Math.sqrt(post.var);
    // modelo que más pesa (para informar lámpara y exposición) y sus niveles en τ̂
    let top = delTipo[0];
    for (const m of delTipo) if (m.Z > top.Z) top = m;
    llenarTabla(top);
    perdida(clampi(Math.round((tHat - tauLo) / du), 0, NT - 1));
    // σ: la de la mezcla o la del modelo dominante, la mayor (de día, con E desconocida, la mezcla sale optimista)
    // con incandescente se suma la incertidumbre de la forma real del foco (5 % de τr)
    const sSis = top.tr > 0 ? 0.05 * top.tr : 0;
    res.t = tHat; res.sigma = Math.sqrt(Math.max(sig, Math.sqrt(top.var || 0), du / Math.sqrt(12)) ** 2 + sSis * sSis);
    res.lampara = { tipo: top.tr > 0 ? 'inc' : 'led', tr_s: top.tr };
    res.E_s = top.E; res.bic = top.bic; res.bic_led = bLed; res.bic_inc = bInc; res.ruido = sc;
    const antes = sal.a, despues = sal.a + sal.b;
    res.nivel_off = signo > 0 ? antes : despues; res.nivel_on = signo > 0 ? despues : antes;
    res.salto = res.nivel_on - res.nivel_off;
    res.contraste = res.salto / sc;
    res.borde = tHat - tauLo < Math.max(1.5e-3, 1.5 * sig) || tauHi - tHat < Math.max(1.5e-3, 1.5 * sig);
    // necesita muestras a los dos lados y contraste suficiente
    let nA = 0, nD = 0;
    for (const x of ser) for (let k = 0; k < x.n; k++) { if (x.t[k] < tHat) nA++; else nD++; }
    if (res.contraste < F.contraste_min) res.motivo = 'poco_contraste';
    else if (nA < 2 || nD < 2) res.motivo = 'un_solo_lado';
    else if (res.borde) res.motivo = 'borde';
    else { res.ok = true; res.motivo = null; }
    return res;
  }
  // PWM: encendido = d_k·N(y; on, 3σ) + (1−d_k)·N(y; off, σ); apagado = N(y; off, σ) (+1e-3·N(on)).
  // d_k = probabilidad de que el cuadro k vea el foco prendido. Muestreado a fps, el PWM es periódico en el índice del
  // cuadro (frecuencia alias ν = f mod fps): se ajusta (ν, arco de fase) al patrón prendido/apagado de la meseta y se
  // predice d_k en los cuadros junto al flanco. Si nada explica la meseta, d_k = fracción vista (como pwm.js).
  function patronPWM(x, L, signo, t0, T) {
    const mid = 0.5 * (L.lo + L.hi90), n = x.n, kk = new Float64Array(n), d = new Float64Array(n);
    const tr = x.t[0];
    for (let k = 0; k < n; k++) kk[k] = Math.round((x.t[k] - tr) / T);
    const mes = [];
    for (let k = 0; k < n; k++) if (signo > 0 ? x.t[k] > t0 + 2 * T : x.t[k] < t0 - 2 * T) mes.push(k);
    const nOn = mes.filter(k => x.y[k] > mid).length;
    const dFija = clampi(mes.length ? nOn / mes.length : 0.5, 0.3, 0.98);
    d.fill(dFija);
    if (mes.length < 6 || nOn === mes.length || nOn < 2) return { d, dFija, nsol: 0 };
    // 1) patrón con periodo corto exacto (p cuadros): cada clase k mod p siempre igual en la meseta
    for (let per = 2; per <= 8; per++) {
      const cls = new Int8Array(per), cnt = new Int32Array(per);
      let ok = true;
      for (const k of mes) {
        const r = ((kk[k] % per) + per) % per, b = x.y[k] > mid ? 1 : -1;
        if (cls[r] && cls[r] !== b) { ok = false; break; }
        cls[r] = b; cnt[r]++;
      }
      if (!ok || mes.length < 2 * per) continue;
      let todas = true;
      for (let r = 0; r < per; r++) if (cnt[r] < 2) todas = false;
      if (!todas) continue;
      for (let k = 0; k < n; k++) { const r = ((kk[k] % per) + per) % per; d[k] = cls[r] > 0 ? 0.92 : 0.08; }
      return { d, dFija, nsol: 1, periodo: per };
    }
    // 2) frecuencia alias ν: promedio de las soluciones que explican la meseta
    const m = mes.length, psi = new Float64Array(m), ord = new Int32Array(m), lab = new Int8Array(m);
    const sols = [];
    let mejor = Infinity;
    const fps = 1 / T, pasoNu = 0.05;
    for (let nu = 0; nu <= fps / 2 + 1e-9; nu += pasoNu) {
      const a = nu * T;                         // ciclos por cuadro
      for (let j = 0; j < m; j++) { const v = a * kk[mes[j]]; psi[j] = v - Math.floor(v); ord[j] = j; }
      ord.sort((p_, q_) => psi[p_] - psi[q_]);
      for (let j = 0; j < m; j++) lab[j] = x.y[mes[ord[j]]] > mid ? 1 : -1;
      // arco circular con máximo (prendidos − apagados): Kadane sobre la lista duplicada, largo ≤ m
      let best = -Infinity, bi = 0, bj = 0;
      for (let i = 0; i < m; i++) {
        let acc = 0;
        for (let L_ = 0; L_ < m; L_++) { acc += lab[(i + L_) % m]; if (acc > best) { best = acc; bi = i; bj = L_; } }
      }
      const err = nOn - best;
      if (err > mejor) continue;
      if (err < mejor) { mejor = err; sols.length = 0; }
      // arco de fase: desde la mitad antes del primer punto adentro hasta la mitad después del último
      const pA = psi[ord[bi]], pAprev = psi[ord[(bi - 1 + m) % m]] - (bi === 0 ? 1 : 0);
      const iz = (bi + bj) % m, pZ = psi[ord[iz]], pZnext = psi[ord[(iz + 1) % m]] + ((iz + 1) % m === 0 ? 1 : 0);
      sols.push({ a, ini: 0.5 * (pA + pAprev), fin: 0.5 * (pZ + pZnext) + (iz < bi ? 1 : 0) });
      if (sols.length > 400) break;
    }
    if (!sols.length || mejor > Math.max(1, 0.15 * m)) return { d, dFija, nsol: 0 };
    for (let k = 0; k < n; k++) {
      let c = 0;
      for (const so of sols) {
        let v = so.a * kk[k]; v -= Math.floor(v);
        let ini = so.ini - Math.floor(so.ini), fin = ini + (so.fin - so.ini);
        if ((v >= ini && v <= fin) || (v + 1 >= ini && v + 1 <= fin)) c++;
      }
      d[k] = clampi((c + 0.5) / (sols.length + 1), 0.05, 0.95);
    }
    return { d, dFija, nsol: sols.length, err: mejor };
  }
  function _ajustarPWM(ser, Ls, signo, tauLo, du, NT, T, F, res, sc) {
    const nll = new Float64Array(NT);
    let sumD = 0, nD = 0, nsol = 0;
    const t0 = res.t0;
    for (let si = 0; si < ser.length; si++) {
      const x = ser[si], L = Ls[si];
      const lo = L.lo, hi = L.hi90, sg = Math.max(1.4826 * (L.madOff || 0), 1e-3 * Math.abs(hi - lo), 1e-12);
      const pat = patronPWM(x, L, signo, t0, T);
      sumD += pat.dFija; nD++; nsol += pat.nsol;
      const N = (y, m, s) => Math.exp(-0.5 * ((y - m) / s) ** 2) / s;
      for (let k = 0; k < x.n; k++) {
        const y = x.y[k], wk = x.w[k], dk = pat.d[k];
        const lOff = -Math.log(N(y, lo, sg) + 1e-3 * N(y, hi, 3 * sg) + 1e-300);
        const lOn = -Math.log(dk * N(y, hi, 3 * sg) + (1 - dk) * N(y, lo, sg) + 1e-300);
        // τ_i ≤ t_k ⇔ i ≤ (t_k − tauLo)/du: en la subida ese cuadro está prendido
        const iCorte = Math.floor((x.t[k] - tauLo) / du);
        for (let i = 0; i < NT; i++) {
          const prendido = signo > 0 ? i <= iCorte : i > iCorte;
          nll[i] += wk * (prendido ? lOn : lOff);
        }
      }
      if (si === 0) { res.nivel_off = lo; res.nivel_on = hi; }
    }
    let mn = Infinity;
    for (let i = 0; i < NT; i++) if (nll[i] < mn) mn = nll[i];
    let sw = 0, st = 0, stt = 0, wBorde = 0;
    for (let i = 0; i < NT; i++) {
      const wgt = Math.exp(-(nll[i] - mn)), tau = tauLo + i * du;
      sw += wgt; st += wgt * tau; stt += wgt * tau * tau;
      if (i < 10 || i >= NT - 10) wBorde += wgt;
    }
    const tHat = st / sw;
    res.t = tHat; res.sigma = Math.max(Math.sqrt(Math.max(0, stt / sw - tHat * tHat)), du / Math.sqrt(12));
    res.pwm = true; res.lampara = { tipo: 'led', tr_s: 0 }; res.E_s = F.E_s[0]; res.ruido = sc;
    res.salto = res.nivel_on - res.nivel_off;
    const sgo = Math.max(1.4826 * (Ls[0].madOff || 0), 1e-12);
    res.contraste = res.salto / sgo;
    res.duty = sumD / nD; res.pwm_patron = nsol > 0;
    res.borde = wBorde / sw > 0.2;
    let nA = 0, nDs = 0;
    for (const x of ser) for (let k = 0; k < x.n; k++) { if (x.t[k] < tHat) nA++; else nDs++; }
    if (res.contraste < F.contraste_min) res.motivo = 'poco_contraste';
    else if (nA < 2 || nDs < 2) res.motivo = 'un_solo_lado';
    else if (res.borde) res.motivo = 'borde';
    else { res.ok = true; res.motivo = null; }
    return res;
  }
  // cuánto duró el nivel de antes (s) y cuántos cuadros seguidos quedó el de después (con 1 cuadro raro de tolerancia)
  function completar(r, s, signo) {
    const mid = 0.5 * (r.nivel_off + r.nivel_on), lado = y => (y - mid) * signo;   // < 0: antes, > 0: después
    if (r.pwm && s.tienep) s = { n: s.n, t: s.t, y: s.p };
    let j = -1;
    for (let i = 0; i < s.n; i++) if (s.t[i] < r.t) j = i;
    let tUlt = r.t, malos = 0;
    for (let i = j; i >= 0; i--) {
      if (lado(s.y[i]) < 0) { tUlt = s.t[i]; malos = 0; } else if (++malos >= 2) break;
    }
    r.dur_antes_s = r.t - tUlt;
    let nd = 0; malos = 0;
    for (let i = j + 1; i < s.n; i++) {
      if (lado(s.y[i]) > 0) { nd++; malos = 0; } else if (++malos >= 2) break;
    }
    r.n_despues = nd;
  }

  // ------------------------------------------------------------------ calidad (solo "Apuntar")
  // brillo medio (0–1), fracción quemada y oscura, movimiento contra la llamada anterior (px) y focos brillantes.
  let _calPrev = null;
  function calidad(rgba, w, h, o) {
    o = o || {};
    const st = Math.max(1, Math.round(Math.sqrt((w * h) / 120000)));
    const ws = Math.floor(w / st), hs = Math.floor(h / st), np = ws * hs;
    const Y = new Uint8Array(np);
    let suma = 0, nSat = 0, nOsc = 0;
    for (let y = 0; y < hs; y++) for (let x = 0; x < ws; x++) {
      const i = ((y * st) * w + x * st) * 4;
      const v = (77 * rgba[i] + 150 * rgba[i + 1] + 29 * rgba[i + 2]) >> 8;
      Y[y * ws + x] = v; suma += v;
      if (v >= 250) nSat++; else if (v <= 12) nOsc++;
    }
    const res = { brillo: suma / Math.max(1, np) / 255, saturado: nSat / Math.max(1, np), oscuro: nOsc / Math.max(1, np), mov: NaN, focos: [] };
    if (ws < 8 || hs < 8) return res;
    // movimiento: perfiles de gradiente por filas y columnas contra la llamada anterior
    const Pf = new Float64Array(hs), Pc = new Float64Array(ws);
    for (let y = 1; y < hs - 1; y++) for (let x = 1; x < ws - 1; x++) {
      const i = y * ws + x;
      Pf[y] += Math.min(40, Math.abs(Y[i + ws] - Y[i - ws])); Pc[x] += Math.min(40, Math.abs(Y[i + 1] - Y[i - 1]));
    }
    if (_calPrev && _calPrev.ws === ws && _calPrev.hs === hs && !o.reiniciar) {
      const dy = corr1(Pf, _calPrev.Pf, 1, hs - 2, Math.floor(hs / 4)), dx = corr1(Pc, _calPrev.Pc, 1, ws - 2, Math.floor(ws / 4));
      res.mov = Math.hypot(dx, dy) * st;
    }
    _calPrev = { ws, hs, Pf, Pc };
    // focos: top-hat de Ylin
    const L = lineal(Y), R = Math.max(2, Math.round(10 / st));
    const tmp = new Float32Array(np), ero = new Float32Array(np), op = new Float32Array(np);
    filtroMM(L, ws, hs, R, false, tmp, ero); filtroMM(ero, ws, hs, R, true, tmp, op);
    const hist = new Float64Array(256);
    for (let i = 0; i < np; i++) hist[Y[i]]++;
    const Gm = mediaRecortada(hist, np, 0.1, 0.9);
    const thr = Math.max(0.06 * (Gm || 0), 0.05);
    const marca = new Uint8Array(np), pila = new Int32Array(np);
    for (let i0 = 0; i0 < np; i0++) {
      if (marca[i0] || !(L[i0] - op[i0] > thr)) continue;
      let sp = 0, n = 0, sd = 0, sx = 0, sy = 0, pico = 0, sR = 0, sG = 0, sB = 0, nc = 0;
      pila[sp++] = i0; marca[i0] = 1;
      while (sp) {
        const j = pila[--sp], d = L[j] - op[j], xj = j % ws, yj = (j - xj) / ws;
        n++; sd += d; sx += d * xj; sy += d * yj; if (d > pico) pico = d;
        if (Y[j] < 235) { const q = ((yj * st) * w + xj * st) * 4; sR += rgba[q]; sG += rgba[q + 1]; sB += rgba[q + 2]; nc++; }
        const vec = [xj > 0 ? j - 1 : -1, xj < ws - 1 ? j + 1 : -1, yj > 0 ? j - ws : -1, yj < hs - 1 ? j + ws : -1];
        for (const u of vec) if (u >= 0 && !marca[u] && L[u] - op[u] > thr) { marca[u] = 1; pila[sp++] = u; }
      }
      if (n < 1 || n > 600 / (st * st) + 4) continue;
      let tono = NaN;
      if (nc) { const [t_, s_] = tonoRGB(sR / nc, sG / nc, sB / nc); if (s_ >= 0.15) tono = t_; }
      res.focos.push({ x: (sx / sd + 0.5) * st, y: (sy / sd + 0.5) * st, r: Math.sqrt(n / Math.PI) * st, tono, contraste: pico / Math.max(Gm || 0, 1e-3) });
    }
    res.focos.sort((a, b) => b.contraste - a.contraste);
    if (res.focos.length > 24) res.focos.length = 24;
    return res;
  }
  function corr1(A, B, lo, hi, S) {             // corrimiento entero+parábola de A respecto a B (A[i] ≈ B[i − s])
    let best = -Infinity, bs = 0;
    const r = new Float64Array(2 * S + 3).fill(-2);
    for (let s = -S; s <= S; s++) {
      const i0 = Math.max(lo, lo + s), i1 = Math.min(hi, hi + s), m = i1 - i0 + 1;
      if (m < 8) continue;
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let i = i0; i <= i1; i++) { const a = A[i], b = B[i - s]; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; }
      const va = m * saa - sa * sa, vb = m * sbb - sb * sb;
      const v = va > 1e-9 && vb > 1e-9 ? (m * sab - sa * sb) / Math.sqrt(va * vb) : 0;
      r[s + S + 1] = v;
      if (v > best) { best = v; bs = s; }
    }
    const a = r[bs + S], b = r[bs + S + 2], c0 = r[bs + S + 1], den = a - 2 * c0 + b;
    return bs + (a > -2 && b > -2 && den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - b) / den)) : 0);
  }

  const api = {
    VERSION, FOCOS, LADOS, RASGOS, COLUMNAS, LIN, defaultConfig,
    lineal, estabilizar, eventos, manchasFijas, localizar, rasgos, serie, ajustarFlanco, calidad,
    claseTono, tonoDe, flancoGrueso: (s, signo, tA, tB, T) => flancoGrueso(normSerie(s), signo, tA, tB, T),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SemaforoVision = api;
})(typeof self !== 'undefined' ? self : this);
