/* semaforo.js — "Medir con el semáforo real": núcleo puro, sin DOM.
 * Anillo de cuadros, reloj de la cámara (K0), secuencia del árbol, K1 (cámara↔giroscopio),
 * reacción, CSV, clip, tira de revisión y calibración (K2/K3).
 * La visión (estabilizar, eventos, localizar, rasgos, ajuste de flancos) vive en
 * semaforo_vision.js (SemaforoVision); aquí solo se orquesta.
 * Funciona en navegador (window.Semaforo) y en Node (module.exports).
 * Unidades: s, px. Reloj = performance.now()/1000, el mismo de onMotion y de tRo.
 * Registrador pasivo: mientras la medición está armada la app solo llama Anillo.push.
 */
(function (root) {
  'use strict';

  const VERSION = 'semaforo v1';
  const isFin = Number.isFinite;
  const num = (x) => (typeof x === 'number' ? x : NaN);   // null (de un JSON) → NaN
  const ahora = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  // ref: ámbares que usa la boleta (índices de a1..a3); ambar/verde: desfase desde el primer ámbar
  const ARBOLES = {
    pro: { nombre: 'Pro .4', ambar: [0, 0, 0], verde: 0.400, perfecta: 0.400, ref: [0, 1, 2] },
    full: { nombre: 'Full .5', ambar: [0, 0.5, 1.0], verde: 1.500, perfecta: 0.500, ref: [2] },
  };
  const FOCOS = ['pre', 'stg', 'a1', 'a2', 'a3', 'g', 'r'];
  const CARRILES = ['izq', 'der'];
  const RASGOS = ['e', 'p', 'c'];
  const deltaNominal = (tipo) => { const A = ARBOLES[tipo]; return A ? A.verde - A.ambar[A.ref[A.ref.length - 1]] : NaN; };
  const perfectaDe = (tipo) => (ARBOLES[tipo] ? ARBOLES[tipo].perfecta : (tipo === 'pro' ? 0.4 : 0.5));
  const otroCarril = (c) => (c === 'izq' ? 'der' : 'izq');

  // ------------------------------------------------------------ parámetros (§2.7)
  function defaultConfig() {
    return {
      version: VERSION,
      captura: { fps: 60, w: 1280, h: 720, pix_max: 40000, mem_mb: 40, vista: { w: 240, h: 136, cada: 6 }, armado_max_min: 30 },
      reloj: { env_pct: 20, iter: 3, pct_final: 2, cap_max_desfase_s: 1.0, frac_min: 0.9, paso_tol: 0.25 },
      ventana: { antes_s: 4.5, despues_s: 0.8, buscar: [-3.6, 0.6], ventana_minima_antes_s: 3.0 },
      mov: { busqueda_px: 80, ref: [-1.3, -1.0], salto_max_px: 6, salto_AE: 0.10 },
      eventos: { umbral_min: 0.06, umbral_sigma: 6, area: [3, 600], persistir: 2 },
      tonos: { ambar: [20, 55], verde: [70, 190], rojo: [15, 340], sin_saturar: 235 },   // rojo: ≤15° o ≥340°
      arbol: {
        pro_simult: 1.5,            // en cuadros (T)
        full_paso: [0.42, 0.58], delta: [0.30, 0.60], paso_tol: 0.30, col_desv: 0.5,
        sep_col: [1.2, 4.0], pre_stage: [0.8, 3.0],
        delta_pista_s: NaN,         // Δ medido de la pista (fase 2); NaN = usar el nominal
        roja_contraste_min: 0.25,   // la roja debe brillar al menos esto del contraste de los ámbares
      },
      disco: 1.6, anillo: [2.0, 2.8],
      flanco: {   // mismos nombres que lee semaforo_vision.js
        rejilla: 1e-4, atras_T: 2, atras_min_s: 0.09, adelante_T: 2,  // τ en [τ0 − max(2T, 0.09), τ0 + 2T]
        ventana_T: 6, ventana_extra_s: 0.02, ventana_min_s: 0.25,      // cuadros en [τ0 − 6T − 0.02, τ0 + max(6T, 0.25)]
        huber: 2.5, tr_ms: [0, 5, 10, 20, 30, 45, 60, 80], tf_rel: 0.6,
        E_s: [0.0003], E_T: [0.25, 0.5, 0.98], pwm_frac: 0.15,
      },
      stage: { busqueda_s: 0.30, prendido_min_s: 0.3, apagado_min: 3 },
      rt_min_s: -1.0, rt_max_s: 1.5,
      rt: {
        desacuerdo_s: 0.040, sigma_acel_s: 0.014, alta_s: 0.008, media_s: 0.020, n_sesgo_min: 3,
        sigma_delta_guardado_s: 0.006, sigma_delta_supuesto_s: 0.060,
      },
      k1: { ventana: [-1.0, 0.3], rango_s: 0.150, paso_s: 0.001, rho_min: 0.9, amp_min_px: 8, q_min: 0.2 },   // q_min = mov.q_min de la visión
      delta_supuesto: { cap: 0, otras: -0.050 },
      zona: { margen_alto: 0.8, margen_min_px: 80 },
    };
  }

  // Mezcla profunda: los objetos se mezclan, lo demás (números, arreglos) se reemplaza
  function mezclar(base, extra) {
    if (!extra || typeof extra !== 'object') return base;
    for (const k of Object.keys(extra)) {
      const v = extra[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && !ArrayBuffer.isView(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) mezclar(base[k], v);
      else base[k] = v;
    }
    return base;
  }
  const config = (cfg) => (cfg && cfg.__listo ? cfg : Object.defineProperty(mezclar(defaultConfig(), cfg), '__listo', { value: true }));

  // ------------------------------------------------------------ utilidades numéricas
  function finitos(a) { const o = []; for (let i = 0; i < a.length; i++) if (isFin(a[i])) o.push(a[i]); return o; }
  function percentil(a, p) {
    const b = finitos(a).sort((x, y) => x - y); if (!b.length) return NaN;
    const x = (b.length - 1) * p / 100, i = Math.floor(x), f = x - i;
    return i + 1 < b.length ? b[i] + f * (b[i + 1] - b[i]) : b[i];
  }
  const mediana = (a) => percentil(a, 50);
  function mad(a, m) { if (!isFin(m)) m = mediana(a); const d = []; for (const x of a) if (isFin(x)) d.push(Math.abs(x - m)); return mediana(d); }
  function interp1(xs, ys, x) {
    const n = xs.length; if (!n || !isFin(x)) return NaN;
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    const f = (x - xs[lo]) / (xs[hi] - xs[lo]);
    return ys[lo] + f * (ys[hi] - ys[lo]);
  }
  // Primer índice con a[i] ≥ x (a creciente)
  function buscarIdx(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; }
  // Recta y ≈ c0 + c1·x por mínimos cuadrados (centrada para no perder precisión)
  function recta(x, y, usar) {
    let n = 0, mx = 0, my = 0;
    for (let i = 0; i < x.length; i++) if (!usar || usar[i]) { n++; mx += x[i]; my += y[i]; }
    if (n < 2) return null;
    mx /= n; my /= n; let sxx = 0, sxy = 0;
    for (let i = 0; i < x.length; i++) if (!usar || usar[i]) { const dx = x[i] - mx; sxx += dx * dx; sxy += dx * (y[i] - my); }
    if (!(sxx > 0)) return null;
    const c1 = sxy / sxx; return { c0: my - c1 * mx, c1 };
  }
  // Media circular de tonos (grados): el rojo cruza 0°/360°
  function tonoMedio(a) {
    let s = 0, c = 0, n = 0;
    for (const h of a) if (isFin(h)) { s += Math.sin(h * Math.PI / 180); c += Math.cos(h * Math.PI / 180); n++; }
    if (!n) return NaN; const m = Math.atan2(s, c) * 180 / Math.PI; return m < 0 ? m + 360 : m;
  }
  function tonoEs(h, clase, cfg) {
    if (!isFin(h)) return null;   // sin dato
    const T = cfg.tonos;
    if (clase === 'rojo') return h <= T.rojo[0] || h >= T.rojo[1];
    const r = T[clase]; return h >= r[0] && h <= r[1];
  }

  // ------------------------------------------------------------ visión (otro módulo)
  let visionCache = null;
  function vision() {
    if (api._vision) return api._vision;
    if (visionCache) return visionCache;
    if (root && root.SemaforoVision) return (visionCache = root.SemaforoVision);
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      try { visionCache = require('./semaforo_vision.js'); } catch (e) { visionCache = null; }
    }
    return visionCache;
  }

  // ------------------------------------------------------------ anillo de cuadros
  const SIN_TIEMPOS = Object.freeze({});
  function numOk(v) { return typeof v === 'number' && v === v && v !== Infinity && v !== -Infinity ? v : NaN; }
  // Un solo bloque de memoria reservado al crear; push convierte RGBA → YUV 4:2:0 (BT.601 de
  // rango completo, entero) directo en su lugar. Sin basura por cuadro.
  class Anillo {
    constructor(o) {
      o = o || {};
      const w = o.w | 0, h = o.h | 0, fmt = o.fmt || 'yuv420';
      if (!(w > 0 && h > 0)) throw new Error('Anillo: w y h deben ser positivos');
      if (fmt !== 'yuv420' && fmt !== 'y8') throw new Error('Anillo: formato ' + fmt + ' no soportado');
      if (fmt === 'yuv420' && ((w & 1) || (h & 1))) throw new Error('Anillo: en yuv420 w y h deben ser pares');
      this.w = w; this.h = h; this.fmt = fmt;
      this.tam = fmt === 'yuv420' ? w * h + 2 * (w >> 1) * (h >> 1) : w * h;
      const memMb = isFin(o.mem_mb) ? o.mem_mb : 40;
      this.capacidad = Math.max(2, (o.capacidad | 0) || Math.floor(memMb * 1e6 / this.tam));
      this.datos = new Uint8Array(this.capacidad * this.tam);
      this._cb = new Float64Array(this.capacidad); this._cap = new Float64Array(this.capacidad);
      this._pres = new Float64Array(this.capacidad); this._media = new Float64Array(this.capacidad);
      this._nf = new Int32Array(this.capacidad);
      this._i = 0; this._n = 0;
      // datos del recorte (los pone el lector; viajan en Cuadros)
      this.zona = o.zona || null; this.orig = o.orig || null; this.escala = isFin(o.escala) ? o.escala : 1;
      this.fps_nominal = o.fps_nominal || 60;
    }
    get n() { return this._n; }
    _slot(j) { return (this._i - this._n + j + this.capacidad) % this.capacidad; }   // j = 0 el más viejo
    _hora(s) { const c = this._cb[s]; return isFin(c) ? c : this._media[s]; }
    get tA() { return this._n ? this._hora(this._slot(0)) : NaN; }
    get tB() { return this._n ? this._hora(this._slot(this._n - 1)) : NaN; }
    _tiempos(s, ti) {
      if (!ti) ti = SIN_TIEMPOS;
      this._cb[s] = numOk(ti.cb); this._cap[s] = numOk(ti.cap); this._pres[s] = numOk(ti.pres); this._media[s] = numOk(ti.media);
      const nf = ti.nf; this._nf[s] = (typeof nf === 'number' && nf >= 0 && nf < 2147483647) ? nf | 0 : -1;
      this._i = (s + 1) % this.capacidad;
      if (this._n < this.capacidad) this._n++;
    }
    // rgba: Uint8ClampedArray w·h·4 (getImageData); tiempos: {cb, cap, pres, media, nf}
    push(rgba, tiempos) {
      const w = this.w, h = this.h, s = this._i, D = this.datos, off = s * this.tam;
      if (!rgba || rgba.length < w * h * 4) throw new Error('Anillo.push: tamaño de cuadro incorrecto');
      if (this.fmt === 'y8') {
        for (let p = 0, q = off, n = w * h; p < n; p++, q++) { const i = p << 2; D[q] = (77 * rgba[i] + 150 * rgba[i + 1] + 29 * rgba[i + 2]) >> 8; }
      } else {
        const w2 = w >> 1, oU = off + w * h, oV = oU + w2 * (h >> 1), fila = w << 2;
        for (let y = 0; y < h; y += 2) {
          let i0 = y * fila, i1 = i0 + fila, y0 = off + y * w, y1 = y0 + w, c = (y >> 1) * w2;
          for (let x = 0; x < w; x += 2, i0 += 8, i1 += 8, y0 += 2, y1 += 2, c++) {
            const r00 = rgba[i0], g00 = rgba[i0 + 1], b00 = rgba[i0 + 2];
            const r01 = rgba[i0 + 4], g01 = rgba[i0 + 5], b01 = rgba[i0 + 6];
            const r10 = rgba[i1], g10 = rgba[i1 + 1], b10 = rgba[i1 + 2];
            const r11 = rgba[i1 + 4], g11 = rgba[i1 + 5], b11 = rgba[i1 + 6];
            D[y0] = (77 * r00 + 150 * g00 + 29 * b00) >> 8; D[y0 + 1] = (77 * r01 + 150 * g01 + 29 * b01) >> 8;
            D[y1] = (77 * r10 + 150 * g10 + 29 * b10) >> 8; D[y1 + 1] = (77 * r11 + 150 * g11 + 29 * b11) >> 8;
            const R = (r00 + r01 + r10 + r11 + 2) >> 2, G = (g00 + g01 + g10 + g11 + 2) >> 2, B = (b00 + b01 + b10 + b11 + 2) >> 2;
            D[oU + c] = ((-43 * R - 85 * G + 128 * B) >> 8) + 128;
            D[oV + c] = ((128 * R - 107 * G - 21 * B) >> 8) + 128;
          }
        }
      }
      this._tiempos(s, tiempos);
    }
    // Cuadro ya convertido (simulador, demo, video): Uint8Array de tamaño tam
    pushPlano(datos, tiempos) {
      if (!datos || datos.length < this.tam) throw new Error('Anillo.pushPlano: tamaño de cuadro incorrecto');
      const s = this._i;
      this.datos.set(datos.length === this.tam ? datos : datos.subarray(0, this.tam), s * this.tam);
      this._tiempos(s, tiempos);
    }
    // Copia ordenada (del más viejo al más nuevo) de los cuadros con hora ajustada en [tA, tB].
    // El reloj se ajusta con TODO el anillo (más puntos = mejor envolvente).
    congelar(tA, tB) {
      if (!isFin(tA)) tA = -Infinity; if (!isFin(tB)) tB = Infinity;
      const n = this._n, cr = { cb: new Float64Array(n), cap: new Float64Array(n), pres: new Float64Array(n), media: new Float64Array(n), nf: new Int32Array(n) };
      for (let j = 0; j < n; j++) {
        const s = this._slot(j);
        cr.cb[j] = this._cb[s]; cr.cap[j] = this._cap[s]; cr.pres[j] = this._pres[s]; cr.media[j] = this._media[s]; cr.nf[j] = this._nf[s];
      }
      const rl = reloj(cr, { fps_nominal: this.fps_nominal });
      let j0 = 0; while (j0 < n && !(rl.t[j0] >= tA)) j0++;
      let j1 = n; while (j1 > j0 && !(rl.t[j1 - 1] <= tB)) j1--;
      const m = j1 - j0, tam = this.tam, datos = new Uint8Array(m * tam);
      for (let j = j0; j < j1; j++) { const s = this._slot(j); datos.set(this.datos.subarray(s * tam, (s + 1) * tam), (j - j0) * tam); }
      const sub = (a) => a.slice(j0, j1);
      const t = rl.t.slice(j0, j1); delete rl.t;
      return {
        v: 1, fmt: this.fmt, w: this.w, h: this.h, n: m, tam, datos, t,
        crudos: { cb: sub(cr.cb), cap: sub(cr.cap), pres: sub(cr.pres), media: sub(cr.media), nf: sub(cr.nf) },
        reloj: rl, zona: this.zona ? this.zona.slice() : null, orig: this.orig ? this.orig.slice() : null,
        escala: this.escala, vista: null,
      };
    }
    vaciar() { this._i = 0; this._n = 0; }
  }

  // ------------------------------------------------------------ reloj de cuadros (K0, decisión 7)
  // Elige la fuente de la hora: 'cap' (captureTime validado) > 'media' (mediaTime en rejilla) >
  // 'indice' (presentedFrames y/o la fase de la llegada). Con 'media'/'indice', recta sobre la
  // envolvente inferior de la hora de llegada (cb): t = c0 + c1·src. El retraso fijo que queda lo
  // absorben K1/K3. Sin horas de llegada (video de archivo) → 'archivo': t = media (pts).
  function reloj(crudos, opts) {
    opts = opts || {};
    const c = config(opts.cfg).reloj;
    const fpsN = num(opts.fps_nominal) > 0 ? opts.fps_nominal : NaN;
    const cb = crudos && crudos.cb ? crudos.cb : [], n = cb.length;
    const out = { fuente: 'cb', c0: 0, c1: 1, lat_min_s: NaN, jitter_s: NaN, perdidos: 0, fps: NaN, t: new Float64Array(n) };
    if (!n) return out;
    const col = (a) => { const r = new Float64Array(n); for (let i = 0; i < n; i++) r[i] = a && i < a.length ? num(a[i]) : NaN; return r; };
    const CB = col(cb), CAP = col(crudos.cap), MED = col(crudos.media);
    const NF = new Float64Array(n); for (let i = 0; i < n; i++) { const v = crudos.nf ? num(crudos.nf[i]) : NaN; NF[i] = isFin(v) && v >= 0 ? v : NaN; }
    const frac = (a) => { let k = 0; for (let i = 0; i < n; i++) if (isFin(a[i])) k++; return k / n; };
    const creciente = (a) => { let p = -Infinity; for (let i = 0; i < n; i++) if (isFin(a[i])) { if (!(a[i] > p)) return false; p = a[i]; } return true; };
    const nfOk = n >= 2 && frac(NF) >= c.frac_min && creciente(NF);
    const base = nfOk ? rellenar(NF, null) : null;   // eje para rellenar huecos
    const fin = (fuente, t, extra) => {
      Object.assign(out, extra || {}); out.fuente = fuente; out.t = t;
      const P = pasosDe(t, n, c.paso_tol);
      out.fps = P.T > 0 ? 1 / P.T : NaN;
      if (!isFin(out.perdidos) || !(extra && 'perdidos' in extra)) out.perdidos = nfOk ? saltos(NF) : P.perd;
      return out;
    };
    // Video de archivo: no hay hora de llegada
    if (frac(CB) < 0.5) {
      if (frac(MED) >= 0.5) return fin('archivo', rellenar(MED, base));
      const f = isFin(fpsN) ? fpsN : 30, t = new Float64Array(n); for (let i = 0; i < n; i++) t[i] = (base ? base[i] - base[0] : i) / f;
      return fin('indice', t, { c0: 0, c1: 1 / f });
    }
    const cbR = rellenar(CB, base);
    if (n < 3) return fin('cb', cbR);
    // 'cap': captureTime presente (≥ 90 %), creciente y a menos de 1 s de la llegada
    if (frac(CAP) >= c.frac_min && creciente(CAP)) {
      let peor = 0; const lat = [];
      for (let i = 0; i < n; i++) if (isFin(CAP[i]) && isFin(CB[i])) { const d = CB[i] - CAP[i]; lat.push(d); peor = Math.max(peor, Math.abs(d)); }
      if (lat.length && peor < c.cap_max_desfase_s) {
        const lmin = percentil(lat, c.pct_final);
        return fin('cap', rellenar(CAP, base), { c0: 0, c1: 1, lat_min_s: lmin, jitter_s: mediana(lat) - lmin });
      }
    }
    // 'media': estrictamente creciente con pasos ≈ k·T
    if (frac(MED) >= c.frac_min && creciente(MED)) {
      const P = pasosDe(MED, n, c.paso_tol);
      if (P.T > 0 && P.ok >= c.frac_min) {
        const src = rellenar(MED, base), e = envolvente(src, CB, c);
        if (e) { const t = new Float64Array(n); for (let i = 0; i < n; i++) t[i] = e.c0 + e.c1 * src[i]; return fin('media', t, { c0: e.c0, c1: e.c1, jitter_s: e.jitter }); }
      }
    }
    // 'indice': número de cuadro. presentedFrames cuenta los cuadros que llegan al video (también los que
    // rVFC no entrega), pero no los que la cámara pierde antes; la fase de la llegada sí los ve. Se
    // combinan: k_i = min(llegada_i, k_{i+1} − Δnf) de atrás hacia adelante (ver indicesDeLlegada).
    let T = NaN;
    if (nfOk) { const e = envolvente(base, CB, c); if (e && e.c1 > 0) T = e.c1; }
    if (!(T > 0)) { const P = pasosDe(cbR, n, 0.5); T = P.T; }
    if (!(T > 0)) T = 1 / (isFin(fpsN) ? fpsN : 60);
    T = periodoCoherente(cbR, T, nfOk ? 0.06 : 0.15);   // sin nf, la mediana de los pasos sale baja con jitter
    let src = indicesDeLlegada(cbR, T, NaN, nfOk ? NF : null);
    let e = envolvente(src, CB, c);
    if (e && e.c1 > 0) {
      // segunda vuelta: índice desde el piso de la envolvente (en vez de la moda de la fase)
      src = indicesDeLlegada(cbR, e.c1, e.c0, nfOk ? NF : null);
      const e2 = envolvente(src, CB, c); if (e2 && e2.c1 > 0) e = e2;
    }
    if (!e) return fin('cb', cbR);
    const t = new Float64Array(n); for (let i = 0; i < n; i++) t[i] = e.c0 + e.c1 * src[i];
    return fin('indice', t, { c0: e.c0, c1: e.c1, jitter_s: e.jitter, perdidos: saltos(src) });
  }
  // Σ(salto − 1) de un índice creciente
  function saltos(a) { let s = 0, p = NaN; for (let i = 0; i < a.length; i++) if (isFin(a[i])) { if (isFin(p) && a[i] - p > 1) s += Math.round(a[i] - p) - 1; p = a[i]; } return s; }
  // Periodo: mediana de los pasos, afinada con los pasos que son ≈ k·T0. ok = fracción de esos pasos.
  function pasosDe(a, n, tol) {
    const d = []; let p = NaN;
    for (let i = 0; i < n; i++) if (isFin(a[i])) { if (isFin(p) && a[i] > p) d.push(a[i] - p); p = a[i]; }
    const T0 = mediana(d); if (!(T0 > 0)) return { T: NaN, ok: 0, perd: 0 };
    let sd = 0, sk = 0, ok = 0, perd = 0;
    for (const x of d) { const k = Math.max(1, Math.round(x / T0)); if (Math.abs(x - k * T0) <= tol * T0) { ok++; sd += x; sk += k; perd += k - 1; } }
    return { T: sk ? sd / sk : T0, ok: d.length ? ok / d.length : 0, perd };
  }
  // Envolvente inferior y ≈ c0 + c1·x: mínimos cuadrados iterativos (iter vueltas con el env_pct % de
  // residuos más bajos) y luego la recta se baja al percentil pct_final.
  function envolvente(x0, y0, c) {
    const x = [], y = [];
    for (let i = 0; i < x0.length; i++) if (isFin(x0[i]) && isFin(y0[i])) { x.push(x0[i]); y.push(y0[i]); }
    let fit = recta(x, y, null); if (!fit) return null;
    const r = new Float64Array(x.length);
    const resid = () => { for (let i = 0; i < x.length; i++) r[i] = y[i] - fit.c0 - fit.c1 * x[i]; };
    for (let it = 0; it < c.iter; it++) {
      resid();
      const q = percentil(r, c.env_pct), usar = new Uint8Array(x.length);
      for (let i = 0; i < x.length; i++) usar[i] = r[i] <= q ? 1 : 0;
      const f2 = recta(x, y, usar); if (!f2) break; fit = f2;
    }
    resid();
    const baja = percentil(r, c.pct_final);
    return { c0: fit.c0 + baja, c1: fit.c1, jitter: mediana(r) - baja };
  }
  // Periodo exacto de la llegada: máximo de la coherencia de fase |Σ exp(2πi·cb/T)| a ±rel de T0
  // (los cuadros a tiempo comparten fase; los atascados casi no pesan).
  function periodoCoherente(cb, T0, rel) {
    const n = cb.length; if (n < 8 || !(T0 > 0)) return T0;
    const c = (T) => { let sr = 0, si = 0; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * (cb[i] - cb[0]) / T; sr += Math.cos(a); si += Math.sin(a); } return sr * sr + si * si; };
    const malla = (Tc, r, m) => {
      let bT = Tc, bv = -1, bi = 0; const v = new Float64Array(2 * m + 1);
      for (let j = -m; j <= m; j++) { const T = Tc * (1 + r * j / m); v[j + m] = c(T); if (v[j + m] > bv) { bv = v[j + m]; bT = T; bi = j + m; } }
      if (bi > 0 && bi < 2 * m) { const a = v[bi - 1], b = v[bi], d = v[bi + 1], den = a - 2 * b + d; if (den < 0) bT += Tc * r / m * 0.5 * (a - d) / den; }
      return bT;
    };
    const span = cb[n - 1] - cb[0], ancho = Math.max(1e-6, T0 / Math.max(span, T0));   // ancho del pico (relativo)
    let T = malla(T0, rel, Math.min(2000, Math.ceil(rel / ancho * 4)));
    T = malla(T, 4 * ancho, 40);
    return T;
  }
  // Índice de cuadro con la hora de llegada. Sin piso (c0 NaN): los cuadros a tiempo caen en una misma
  // fase (moda de cb mod T) y k = piso de la fase. Con piso: k = ⌊(cb − c0)/T + 0.1⌋ (la llegada nunca
  // es antes del piso). Un cuadro atrasado sale con k de más: se corrige de atrás hacia adelante,
  // k_i ≤ k_{i+1} − max(1, nf_{i+1} − nf_i). Un salto que la llegada sí ve (cuadro que la cámara
  // perdió) se conserva aunque presentedFrames no lo cuente.
  function indicesDeLlegada(cb, T, c0, nf) {
    const n = cb.length, o = new Float64Array(n);
    if (!n) return o;
    const ref = cb[0];
    if (isFin(c0)) {
      for (let i = 0; i < n; i++) o[i] = Math.floor((cb[i] - c0) / T + 0.1);
    } else {
      const B = 64, h = new Float64Array(B);
      for (let i = 0; i < n; i++) { const f = (((cb[i] - ref) % T) + T) % T; h[Math.min(B - 1, Math.floor(f / T * B))]++; }
      let pb = 0, pv = -1;
      for (let b = 0; b < B; b++) { let v = 0; for (let d = -2; d <= 2; d++) v += h[(b + d + B) % B]; if (v > pv) { pv = v; pb = b; } }
      const fase = (pb + 0.5) / B * T;
      for (let i = 0; i < n; i++) o[i] = Math.floor((cb[i] - ref - fase + 0.3 * T) / T);
    }
    for (let i = n - 2; i >= 0; i--) {
      let d = 1;
      if (nf && isFin(nf[i]) && isFin(nf[i + 1])) d = Math.max(1, Math.round(nf[i + 1] - nf[i]));
      if (o[i] > o[i + 1] - d) o[i] = o[i + 1] - d;
    }
    const k0 = o[0]; for (let i = 0; i < n; i++) o[i] -= k0;
    return o;
  }
  // Rellena NaN por interpolación lineal contra 'base' (o el índice); extrapola con los extremos
  function rellenar(a, base) {
    const n = a.length, o = new Float64Array(n), xs = [], ys = [];
    const X = (i) => (base ? base[i] : i);
    for (let i = 0; i < n; i++) if (isFin(a[i])) { xs.push(X(i)); ys.push(a[i]); }
    for (let i = 0; i < n; i++) {
      if (isFin(a[i])) { o[i] = a[i]; continue; }
      if (xs.length < 2) { o[i] = xs.length ? ys[0] : NaN; continue; }
      const x = X(i); let j = buscarIdx(xs, x); j = Math.min(Math.max(j, 1), xs.length - 1);
      o[i] = ys[j - 1] + (x - xs[j - 1]) * (ys[j] - ys[j - 1]) / (xs[j] - xs[j - 1]);
    }
    return o;
  }

  // ------------------------------------------------------------ series de rasgos
  function colIdx(rasgos) {
    if (rasgos._idx) return rasgos._idx;
    const m = {}; (rasgos.cols || []).forEach((c, j) => { m[c] = j; });
    Object.defineProperty(rasgos, '_idx', { value: m, enumerable: false, configurable: true });
    return m;
  }
  // Serie de un foco: e y p se normalizan por la ganancia de la autoexposición (y = e/G)
  function serieDe(rasgos, carril, foco, rasgo) {
    const j = colIdx(rasgos)[`${carril}.${foco}.${rasgo}`];
    const n = rasgos.n | 0, y = new Float64Array(n);
    if (j === undefined) { y.fill(NaN); return y; }
    const nc = rasgos.cols.length, D = rasgos.datos, G = rasgos.G;
    for (let k = 0; k < n; k++) {
      let v = D[k * nc + j];
      if (rasgo !== 'c' && G) { const g = G[k]; if (isFin(g) && g > 0) v /= g; }
      y[k] = v;
    }
    return y;
  }
  const pesoDe = (rasgos, k) => { const p = rasgos.peso ? rasgos.peso[k] : 1; return isFin(p) ? p : 0; };
  function periodoDe(t) {
    const d = []; for (let i = 1; i < t.length; i++) { const x = t[i] - t[i - 1]; if (x > 0) d.push(x); }
    const T = mediana(d); return T > 0 ? T : 1 / 60;
  }

  // Flancos gruesos de una serie en [tA, tB]: escalón entre la mediana de m cuadros antes y un
  // cuantil alto de m cuadros después (signo +1 = encendido; −1 = apagado, al revés).
  // Devuelve [{k, t0 (cruce del 50 %), pre, post, paso, snr}] (pre/post = niveles antes/después).
  function flancos(t, y, peso, signo, T, tA, tB, cfg) {
    const m = Math.max(3, Math.round(0.1 / T)), marg = (m + 2) * T;
    const kk = [], tt = [], yy = [];
    for (let k = 0; k < t.length; k++) if (t[k] >= tA - marg && t[k] <= tB + marg && isFin(y[k]) && peso[k] > 0) { kk.push(k); tt.push(t[k]); yy.push(y[k]); }
    const N = yy.length; if (N < 2 * m + 1) return [];
    const dif = []; for (let i = 1; i < N; i++) dif.push(Math.abs(yy[i] - yy[i - 1]));
    const sigma = Math.max(1.4826 * mediana(dif) / Math.SQRT2, 1e-9);
    const rango = percentil(yy, 98) - percentil(yy, 2);
    const sPaso = sigma * Math.sqrt(Math.PI / m);   // ruido de la diferencia de dos medianas de m
    const thr = Math.max(cfg.eventos.umbral_sigma * sPaso, 0.2 * rango, 1e-9);
    const s = new Float64Array(N).fill(-Infinity), PRE = new Float64Array(N), POST = new Float64Array(N);
    const tmpA = new Float64Array(m), tmpB = new Float64Array(m);
    const q = (arr, p) => { const b = Array.from(arr).sort((a, c) => a - c); const x = (b.length - 1) * p, i = Math.floor(x); return i + 1 < b.length ? b[i] + (x - i) * (b[i + 1] - b[i]) : b[i]; };
    for (let i = m; i + m <= N; i++) {
      for (let j = 0; j < m; j++) { tmpA[j] = yy[i - m + j]; tmpB[j] = yy[i + j]; }
      // los dos lados con cuantil 0.75 (envolvente alta): un foco con PWM sale apagado en algunos cuadros y,
      // con la mediana, la meseta prendida parecía volver a encenderse (o apagarse) a media secuencia
      const pre = q(tmpA, 0.75), post = q(tmpB, 0.75);
      PRE[i] = pre; POST[i] = post; s[i] = signo * (post - pre);
    }
    const out = [], pers = Math.max(1, cfg.eventos.persistir | 0);
    for (let i = m; i + m <= N; i++) {
      if (!(s[i] > thr)) continue;
      // un encendido/apagado cambia buena parte del brillo del foco (el rasgo ya resta el fondo): un cambio
      // lento de unos % (autoexposición, desenfoque) no es un flanco aunque el ruido sea muy bajo
      if (Math.abs(POST[i] - PRE[i]) < 0.4 * Math.max(Math.abs(PRE[i]), Math.abs(POST[i]))) continue;
      let pico = true;
      for (let j = Math.max(m, i - m); j <= Math.min(N - m, i + m); j++) if (s[j] > s[i] || (s[j] === s[i] && j < i)) { pico = false; break; }
      if (!pico) continue;
      const pre = PRE[i], post = POST[i], mid = (pre + post) / 2;
      // cruce del 50 % cerca de i (con el cuantil alto el escalón se ve unos cuadros antes del
      // encendido o después del apagado) y persistencia: desde el cruce, los cuadros siguen del
      // otro lado de la mitad del umbral
      let t0 = NaN;
      for (let j = Math.max(1, i - m); j <= Math.min(N - 1, i + m); j++) {
        const a = signo * (yy[j - 1] - mid), b = signo * (yy[j] - mid);
        if (!(a <= 0 && b > 0)) continue;
        // al prender, cada cuadro de la persistencia se mira con el máximo de 3 cuadros: un foco con PWM sale
        // apagado en algunos cuadros aunque ya esté prendido (al apagar, todos deben quedar abajo)
        // al apagar se exige quedar abajo durante m cuadros (~0.1 s): un hueco del PWM dura 1–3 cuadros
        let ok = true;
        const persJ = signo > 0 ? pers : Math.max(pers, m);
        for (let q2 = 0; q2 < persJ && j + q2 < N; q2++) {
          let v = yy[j + q2];
          if (signo > 0) for (let q3 = 1; q3 < 3 && j + q2 + q3 < N; q3++) v = Math.max(v, yy[j + q2 + q3]);
          if (signo * (v - pre) < thr / 2) { ok = false; break; }
        }
        if (ok) { t0 = tt[j - 1] + (tt[j] - tt[j - 1]) * (-a) / (b - a); break; }
      }
      if (!isFin(t0) || t0 < tA || t0 > tB) continue;
      if (out.length && Math.abs(out[out.length - 1].t0 - t0) < T) continue;   // el mismo flanco dos veces
      out.push({ k: kk[i], t0, pre, post, paso: Math.abs(post - pre), snr: Math.abs(post - pre) / sigma });
    }
    return out;
  }

  // Apagado de un foco con PWM (cuadros prendidos salteados en la meseta). null si no hay huecos.
  function huecoPWM(y, t, peso, e, T) {
    const mid = (e.pre + e.post) / 2, on = [];
    for (let k = 0; k < t.length; k++) {
      if (!(t[k] >= e.t0 - 0.35 && t[k] < e.t0 + T) || !(peso[k] > 0) || !isFin(y[k])) continue;
      if (y[k] > mid) on.push(k);
    }
    if (on.length < 4) return null;
    const last = on[on.length - 1];
    let sg = 0, ng = 0, gmax = 1;
    for (let i = 1; i < on.length; i++) { const g = Math.round((t[on[i]] - t[on[i - 1]]) / T); sg += g; ng++; if (g > gmax) gmax = g; }
    const gm = sg / ng;
    if (!(gm > 1.15) || gmax > 8) return null;
    return { t: t[last] + 0.5 * gm * T, sigma: gm * T / Math.sqrt(12) };
  }

  // Ajuste fino de un flanco con SemaforoVision.ajustarFlanco; si falla, se queda el grueso.
  // focos: [{y, p}] series completas (e/G y p/G); varias = ajuste conjunto con el mismo τ (cada una con su a y b).
  // La visión decide si hay PWM (usa p y la verosimilitud de mezcla).
  function afinar(V, t, focos, peso, t0, signo, T, cfg) {
    const F = cfg.flanco;
    const tA = t0 - Math.max(F.atras_T * T, F.atras_min_s), tB = t0 + F.adelante_T * T;
    const wA = t0 - F.ventana_T * T - F.ventana_extra_s - (t0 - tA), wB = t0 + Math.max(F.ventana_T * T, F.ventana_min_s) + (tB - t0);
    const series = [];
    for (const f of focos) {
      const st = [], sy = [], sp = [], sw = [];
      for (let k = 0; k < t.length; k++) if (t[k] >= wA && t[k] <= wB && isFin(f.y[k]) && peso[k] > 0) { st.push(t[k]); sy.push(f.y[k]); sp.push(f.p ? f.p[k] : NaN); sw.push(peso[k]); }
      if (st.length >= 4) series.push({ t: Float64Array.from(st), y: Float64Array.from(sy), p: Float64Array.from(sp), peso: Float64Array.from(sw) });
    }
    let r = null;
    if (V && typeof V.ajustarFlanco === 'function' && series.length) {
      try { r = V.ajustarFlanco(series.length === 1 ? series[0] : series, { signo, tA, tB, T, t0, cfg }); }
      catch (e) { r = null; }
    }
    if (r && r.ok && isFin(r.t)) {
      return { ok: true, t: r.t, sigma: isFin(r.sigma) ? r.sigma : T / Math.sqrt(12), lampara: r.lampara || null, E_s: num(r.E_s), pwm: !!r.pwm, contraste: num(r.contraste), grueso: false };
    }
    return { ok: true, t: t0, sigma: 2 * T / Math.sqrt(12), lampara: null, E_s: NaN, pwm: false, contraste: NaN, grueso: true };
  }

  // ------------------------------------------------------------ secuencia del árbol
  // Hipótesis de una columna con los flancos gruesos (§2.4 paso 4), ya en rasgos.
  function hipotesis(E, T, arbol, cfg, extra) {
    const A = cfg.arbol, out = [];
    const nom = (tipo) => deltaNominal(tipo);
    const mejor = (lista, dist, rango, ideal) => {
      let b = null, bd = Infinity;
      for (const e of lista || []) { const d = dist(e); if (d >= rango[0] && d <= rango[1] && Math.abs(d - ideal) < bd) { bd = Math.abs(d - ideal); b = e; } }
      return b;
    };
    const completar = (h) => {
      const dn = nom(h.tipo);
      h.g = mejor(E.g, (e) => e.t0 - h.u, A.delta, dn);
      if (h.g && extra.tono(h.g, 'g') === false) h.g = null;   // un "verde" con tono rojo/ámbar no cuenta
      // roja: en la posición de la roja propia, con tono rojo y brillo comparable al de los ámbares
      const pasoAmb = mediana(['a1', 'a2', 'a3'].map((f) => (h.ambar[f] ? h.ambar[f].paso : NaN)));
      const rA = [-(h.tipo === 'full' ? 1.0 : 0) - 2 * T, dn + A.delta[1] + 0.6];
      h.r = null;
      for (const e of E.r || []) {
        const d = e.t0 - h.u; if (d < rA[0] || d > rA[1]) continue;
        if (extra.tono(e, 'r') === false) continue;
        if (isFin(pasoAmb) && e.paso < A.roja_contraste_min * pasoAmb) continue;
        if (!h.r || e.t0 < h.r.t0) h.r = e;
      }
      h.t_v = h.g ? h.g.t0 : h.u + dn;
      // puntaje: flancos encontrados (con su contraste), regularidad y tonos
      let p = 0;
      for (const f of ['a1', 'a2', 'a3']) { const e = h.ambar[f]; if (e) { p += 1 + Math.min(e.snr, 50) / 50; const tn = extra.tono(e, 'a'); if (tn === true) p += 0.3; else if (tn === false) p -= 0.5; } }
      if (h.g) { p += 1.5 + Math.min(h.g.snr, 50) / 50; if (extra.tono(h.g, 'g') === true) p += 0.3; }
      if (h.r) p += 1;
      if (h.tipo === 'full') {
        const pasos = [];
        if (h.ambar.a1 && h.ambar.a2) pasos.push(h.ambar.a2.t0 - h.ambar.a1.t0);
        if (h.ambar.a2 && h.ambar.a3) pasos.push(h.ambar.a3.t0 - h.ambar.a2.t0);
        if (h.ambar.a1 && !h.ambar.a2) pasos.push((h.ambar.a3.t0 - h.ambar.a1.t0) / 2);
        for (const x of pasos) p -= Math.abs(x - 0.5) / 0.08;
      }
      if (!h.g && !h.r) p -= 1;   // sin verde ni roja: se acepta, pero vale menos
      h.puntaje = p;
      return h;
    };
    if (arbol !== 'full') {   // Pro: ≥ 2 ámbares que se prenden a ≤ 1.5T entre sí
      const todos = [];
      ['a1', 'a2', 'a3'].forEach((f) => (E[f] || []).forEach((e) => todos.push({ f, e })));
      todos.sort((p, q) => p.e.t0 - q.e.t0);
      const lim = A.pro_simult * T;
      for (let a = 0; a < todos.length; a++) {
        if (a > 0 && todos[a].e.t0 - todos[a - 1].e.t0 <= lim) continue;   // ya está en el racimo anterior
        const grupo = [todos[a]], vistos = { [todos[a].f]: true };
        for (let b = a + 1; b < todos.length && todos[b].e.t0 - todos[a].e.t0 <= lim; b++) if (!vistos[todos[b].f]) { grupo.push(todos[b]); vistos[todos[b].f] = true; }
        if (grupo.length < 2) continue;
        const h = { tipo: 'pro', u: mediana(grupo.map((g) => g.e.t0)), ambar: { a1: null, a2: null, a3: null } };
        grupo.forEach((g) => { h.ambar[g.f] = g.e; });
        out.push(completar(h));
      }
    }
    if (arbol !== 'pro') {   // Full: a1 → a2 → a3 cada ~0.5 s, hacia abajo
      for (const e3 of E.a3 || []) {
        const e2 = mejor(E.a2, (e) => e3.t0 - e.t0, A.full_paso, 0.5);
        const e1 = e2 ? mejor(E.a1, (e) => e2.t0 - e.t0, A.full_paso, 0.5)
          : mejor(E.a1, (e) => (e3.t0 - e.t0) / 2, A.full_paso, 0.5);
        if (!e1 && !e2) continue;
        // en un Full nada se prende junto con a3
        const junto = ['a1', 'a2'].some((f) => (E[f] || []).some((e) => Math.abs(e.t0 - e3.t0) <= A.pro_simult * T));
        if (junto) continue;
        out.push(completar({ tipo: 'full', u: e3.t0, ambar: { a1: e1, a2: e2, a3: e3 } }));
      }
    }
    return out;
  }

  function secuenciaVacia(motivo, carril, carril_fuente) {
    return {
      ok: false, motivo, tipo: null, carril: carril || null, carril_fuente: carril_fuente || null,
      t_ambar: [NaN, NaN, NaN], t_ambar_ref: NaN, s_ambar: NaN, t_verde_vista: NaN, s_verde: NaN, t_roja_vista: NaN,
      t_stage_on: NaN, t_stage_off: NaN, s_stage_off: NaN, t_pre_off: NaN,
      delta_s: NaN, delta_nominal: NaN, delta_fuente: null,
      lampara: { ambar: null, verde: null, stage: null }, pwm: false, E_s: NaN, nivel: 'baja',
      puntaje: 0, otra: null, avisos: [], candidatos: [], fps: NaN, fuente_t: null,
    };
  }

  // Todas las secuencias de una columna (prueba) o solo la elegida con L_ref (buscarSecuencia)
  function secuencias(rasgos, disp, o) {
    const cfg = config(o.cfg), V = vision();
    const carril = o.carril, arbol = o.arbol && o.arbol !== 'auto' ? o.arbol : 'auto';
    const L_ref = num(o.L_ref);
    const t = rasgos.t, n = rasgos.n | 0, T = periodoDe(t);
    const peso = new Float64Array(n); for (let k = 0; k < n; k++) peso[k] = pesoDe(rasgos, k);
    const S = {}; for (const f of FOCOS) S[f] = serieDe(rasgos, carril, f, 'e');
    const C = {}; for (const f of FOCOS) C[f] = serieDe(rasgos, carril, f, 'c');
    // ventana de búsqueda
    let wA = t[0], wB = t[n - 1];
    if (isFin(L_ref)) { wA = Math.max(wA, L_ref + cfg.ventana.buscar[0]); wB = Math.min(wB, L_ref + cfg.ventana.buscar[1]); }
    const E = {};
    for (const f of ['a1', 'a2', 'a3', 'g', 'r']) E[f] = flancos(t, S[f], peso, +1, T, wA, wB, cfg);
    const tonoClase = { a: 'ambar', g: 'verde', r: 'rojo' };
    const tono = (e, cual) => {
      const foco = cual === 'a' ? null : cual;
      // el foco del flanco: se busca en qué serie está
      let serie = null;
      if (foco) serie = C[foco];
      else for (const f of ['a1', 'a2', 'a3']) if ((E[f] || []).indexOf(e) >= 0) { serie = C[f]; break; }
      if (!serie) return null;
      const hs = []; for (let k = 0; k < n; k++) if (t[k] > e.t0 + 0.5 * T && t[k] < e.t0 + 0.2) hs.push(serie[k]);
      return tonoEs(tonoMedio(hs), tonoClase[cual], cfg);
    };
    let H = hipotesis(E, T, arbol, cfg, { tono });
    H.sort((a, b) => a.u - b.u);
    const resumen = (h) => ({ tipo: h.tipo, t_ref: h.u, t_verde: h.t_v, verde: !!h.g, roja: !!h.r, puntaje: +h.puntaje.toFixed(3) });
    const candidatos = H.map(resumen);
    let elegidas = H;
    if (isFin(L_ref)) {
      const enRango = H.filter((h) => { const rt = L_ref - h.t_v; return rt >= cfg.rt_min_s && rt <= cfg.rt_max_s; });
      if (!enRango.length) {
        const s = secuenciaVacia(H.length ? 'sin_secuencia' : 'sin_secuencia', carril, o.carril_fuente);
        s.candidatos = candidatos; s.fps = 1 / T; s.fuente_t = rasgos.fuente_t || null; return [s];
      }
      const ult = enRango[enRango.length - 1];
      const rival = enRango.find((h) => h !== ult && h.tipo !== ult.tipo && Math.abs(h.u - ult.u) < 1.2 && h.puntaje >= 0.8 * ult.puntaje);
      if (rival) {
        const s = secuenciaVacia('ambigua', carril, o.carril_fuente);
        s.candidatos = candidatos; s.fps = 1 / T; s.fuente_t = rasgos.fuente_t || null; return [s];
      }
      elegidas = [ult];
    } else {
      // sin L_ref: quitar hipótesis que se enciman (se queda la de mejor puntaje)
      const lim = [];
      for (const h of H.slice().sort((a, b) => b.puntaje - a.puntaje)) if (!lim.some((x) => Math.abs(x.u - h.u) < 1.2)) lim.push(h);
      elegidas = lim.sort((a, b) => a.u - b.u);
    }
    return elegidas.map((h) => armarSecuencia(h, { rasgos, S, C, E, t, n, T, peso, V, cfg, L_ref, carril, carril_fuente: o.carril_fuente, candidatos, disp, hora_quieto: num(o.hora_quieto) }));
  }

  // Ajustes finos y campos de la Secuencia para una hipótesis
  function armarSecuencia(h, X) {
    const { S, t, n, T, peso, V, cfg, L_ref } = X;
    const sec = secuenciaVacia(null, X.carril, X.carril_fuente);
    sec.ok = true; sec.tipo = h.tipo; sec.candidatos = X.candidatos; sec.fps = 1 / T; sec.fuente_t = X.rasgos.fuente_t || null;
    sec.delta_nominal = deltaNominal(h.tipo);
    const P = {};
    const foco = (f) => { if (!P[f]) P[f] = serieDe(X.rasgos, X.carril, f, 'p'); return { y: S[f], p: P[f] }; };
    // Ámbar de referencia: Full = a3 solo; Pro = a1–a3 juntos (ajuste conjunto, mismo τ)
    let fa;
    if (h.tipo === 'pro') {
      const usados = ['a1', 'a2', 'a3'].filter((f) => h.ambar[f]);
      fa = afinar(V, t, usados.map(foco), peso, h.u, +1, T, cfg);
      ['a1', 'a2', 'a3'].forEach((f, i) => { sec.t_ambar[i] = h.ambar[f] ? fa.t : NaN; });
    } else {
      fa = afinar(V, t, [foco('a3')], peso, h.ambar.a3.t0, +1, T, cfg);
      sec.t_ambar = [h.ambar.a1 ? h.ambar.a1.t0 : NaN, h.ambar.a2 ? h.ambar.a2.t0 : NaN, fa.t];   // a1/a2: gruesos, solo revisan el paso
      const pasos = [];
      if (h.ambar.a1 && h.ambar.a2) pasos.push(h.ambar.a2.t0 - h.ambar.a1.t0);
      if (h.ambar.a2) pasos.push(fa.t - h.ambar.a2.t0);
      if (pasos.some((x) => Math.abs(x - 0.5) > cfg.arbol.paso_tol * 0.5)) sec.avisos.push('paso_irregular');
    }
    sec.t_ambar_ref = fa.t; sec.s_ambar = fa.sigma; sec.E_s = fa.E_s; sec.pwm = sec.pwm || fa.pwm;
    sec.lampara.ambar = fa.lampara; if (fa.grueso) sec.avisos.push('flanco_grueso');
    // Verde y roja, aparte
    if (h.g) {
      const fg = afinar(V, t, [foco('g')], peso, h.g.t0, +1, T, cfg);
      sec.t_verde_vista = fg.t; sec.s_verde = fg.sigma; sec.lampara.verde = fg.lampara; sec.pwm = sec.pwm || fg.pwm;
    }
    if (h.r) {
      const fr = afinar(V, t, [foco('r')], peso, h.r.t0, +1, T, cfg);
      sec.t_roja_vista = fr.t;   // solo marca (TruSTART), nunca el instante de salida
    }
    // Δ
    if (isFin(sec.t_verde_vista)) {
      sec.delta_s = sec.t_verde_vista - sec.t_ambar_ref; sec.delta_fuente = 'medido';
      if (Math.abs(sec.delta_s - sec.delta_nominal) > 1.5 * T) sec.avisos.push('intervalo ' + sec.delta_s.toFixed(3));
    } else if (isFin(cfg.arbol.delta_pista_s)) { sec.delta_s = cfg.arbol.delta_pista_s; sec.delta_fuente = 'pista'; }
    else { sec.delta_s = sec.delta_nominal; sec.delta_fuente = 'nominal'; }
    const tV = isFin(sec.t_verde_vista) ? sec.t_verde_vista : sec.t_ambar_ref + sec.delta_s;
    const t1 = Math.min(...[h.ambar.a1, h.ambar.a2, h.ambar.a3].filter(Boolean).map((e) => e.t0));
    // Stage apagado (fin de la reacción vista por la cámara): flanco −1 del foco stg.
    // Al salir, el haz de pre-stage (7" atrás) se libera ANTES que el de stage; si los dos focos
    // muestran apagado, el de stage es el último (así se corrige un pre/stage cambiado).
    const C = cfg.stage;
    const sA = isFin(L_ref) ? L_ref - C.busqueda_s : t1;
    const sB = isFin(L_ref) ? L_ref + C.busqueda_s : tV + cfg.rt_max_s;
    const apagados = (f, a, b) => flancos(t, S[f], peso, -1, T, a, b, cfg).filter((e) => {
      // prendido ≥ prendido_min_s antes y apagado ≥ apagado_min cuadros después
      // Antes: "prendido" con el máximo de 3 cuadros (un foco con PWM sale apagado en algunos cuadros).
      // Después: apagado en TODOS los cuadros de max(apagado_min cuadros, quedar_s = 0.5 s). Al salir, el foco
      // ya no se vuelve a prender (el auto se fue); un hueco del PWM o el desenfoque del cabeceo de la salida
      // (el foco "desaparece" unos cuadros y luego se ve otra vez) no pasan por el apagado de verdad.
      const y = S[f], mid = (e.pre + e.post) / 2, tFin = e.t0 + Math.max(C.apagado_min * T, isFin(C.quedar_s) ? C.quedar_s : 0.5);
      let on = 0, tot = 0, off = 0, tot2 = 0;
      for (let k = 0; k < n; k++) {
        if (!isFin(y[k]) || !(peso[k] > 0)) continue;
        if (t[k] >= e.t0 - C.prendido_min_s && t[k] < e.t0 - T) {
          let v = y[k];
          for (let j = Math.max(0, k - 1); j <= Math.min(n - 1, k + 1); j++) if (isFin(y[j]) && t[j] < e.t0 && y[j] > v) v = y[j];
          tot++; if (v > mid) on++;
        }
        if (t[k] > e.t0 + 0.5 * T && t[k] <= tFin) { tot2++; if (y[k] < mid) off++; }
      }
      return tot >= 3 && on / tot >= 0.8 && tot2 >= C.apagado_min && off === tot2;
    }).map((e) => Object.assign(e, { foco: f }));
    const cerca = (lista, x) => (lista.length ? (isFin(x) ? lista.reduce((p, q) => (Math.abs(q.t0 - x) < Math.abs(p.t0 - x) ? q : p)) : lista[0]) : null);
    let eS = cerca(apagados('stg', sA, sB), L_ref);
    let eP = cerca(apagados('pre', (eS ? eS.t0 : sA) - 0.5, (eS ? eS.t0 : sB) + 0.5), eS ? eS.t0 : L_ref);
    if (eS && eP && eP.t0 > eS.t0 + 2 * T && eP.t0 >= sA && eP.t0 <= sB) { const x = eS; eS = eP; eP = x; sec.avisos.push('stage_dudoso'); }
    // Si el seguimiento de la imagen falló justo alrededor del apagado (cabeceo con desenfoque fuerte, p. ej. de
    // noche a 30 cuadros/s), el foco se pudo medir fuera de lugar y "apagarse" antes de tiempo: no se usa.
    if (eS) {
      const mv = X.rasgos && X.rasgos.mov;
      if (mv && mv.q && mv.t) {
        let tot = 0, mal = 0;
        for (let k = 0; k < mv.t.length; k++) if (mv.t[k] >= eS.t0 - 0.15 && mv.t[k] <= eS.t0 + 0.1) { tot++; if (mv.q[k] < 0.38) mal++; }
        if (tot && mal > 0.2 * tot) { sec.avisos.push('stage_movido'); eS = null; }
      }
    }
    if (eS) {
      const fs = afinar(V, t, [foco(eS.foco)], peso, eS.t0, -1, T, cfg);
      sec.t_stage_off = fs.t; sec.s_stage_off = fs.sigma; sec.lampara.stage = fs.lampara;
      // Con PWM el foco chico se ve "prendido" solo en algunos cuadros: el apagado real queda en algún punto
      // entre el último cuadro prendido y el siguiente que habría salido prendido. Sin el patrón exacto,
      // el punto medio de ese hueco (hueco medio de la meseta) quita el sesgo de tomar el último prendido.
      const pw = huecoPWM(S[eS.foco], t, peso, eS, T);
      if (pw) { sec.t_stage_off = pw.t; sec.s_stage_off = Math.max(fs.sigma, pw.sigma); sec.stage_pwm = true; }
    }
    if (eP) sec.t_pre_off = eP.t0;   // diagnóstico (grueso)
    // Stage prendido (último encendido antes del árbol)
    const ons = flancos(t, S.stg, peso, +1, T, t[0], t1 - T, cfg);
    if (ons.length) sec.t_stage_on = ons[ons.length - 1].t0;
    // Nivel de la secuencia (por el ámbar de referencia) y puntaje
    const eA = sec.s_ambar;
    sec.nivel = eA <= cfg.rt.alta_s ? 'alta' : eA <= cfg.rt.media_s ? 'media' : 'baja';
    sec.puntaje = h.puntaje;
    if (!h.g && !h.r) sec.avisos.push('sin_verde');
    // Carril dudoso: las dos pruebas (centro de la imagen y stage al quedar quieto) apuntan al otro lado
    const d = X.disp, ev = d && d.evidencia_carril;
    const dudoso = d && d.carril_auto && d.carril_auto !== X.carril && ev && ev.centro === d.carril_auto && ev.stage_on === d.carril_auto;
    if (X.carril_fuente === 'usuario' && d && (dudoso || (d.carril_dudoso && d.carril === X.carril))) sec.avisos.push('carril_dudoso');
    return sec;
  }

  // §2.4 pasos 4–9 sobre rasgos ya calculados. Elige la ÚLTIMA secuencia con L_ref − t_verde en [rt_min, rt_max].
  // En handicap nunca se usa la otra columna para dar el tiempo: 'otra' solo es informativa.
  function buscarSecuencia(rasgos, disp, o) {
    o = o || {};
    const cfg = config(o.cfg);
    const usuario = o.carril === 'izq' || o.carril === 'der';
    const carril = usuario ? o.carril : ((disp && disp.carril_auto) || 'izq');
    const fuente = usuario ? 'usuario' : 'auto';
    if (!rasgos || !(rasgos.n > 0)) return secuenciaVacia('sin_arbol', carril, fuente);
    const base = { arbol: o.arbol, L_ref: o.L_ref, cfg, hora_quieto: o.hora_quieto };
    // sin L_ref se queda la última secuencia completa
    const una = (c) => { const l = secuencias(rasgos, disp, Object.assign({ carril: c, carril_fuente: fuente }, base)); return l.length ? l[l.length - 1] : secuenciaVacia('sin_secuencia', c, fuente); };
    const sec = una(carril), otra = una(otroCarril(carril));
    delete otra.candidatos; otra.otra = null;
    sec.otra = otra || null;
    if (!sec.ok && otra && otra.ok) sec.avisos.push('probar_otro_carril');
    return sec;
  }

  // ------------------------------------------------------------ K1: retraso cámara↔giroscopio
  // El cabeceo de la salida lo ven a la vez el giroscopio (ángulo integrado) y la imagen (dx/dy).
  // pos(t_k) ≈ c + f·θ(t_k + δ) + d·t, con δ = t_imu − t_cam del mismo instante.
  function k1(mov, giro, o) {
    o = o || {};
    const cfg = config(o.cfg), C = cfg.k1, L_ref = num(o.L_ref);
    const out = { ok: false, motivo: null, delta_s: NaN, sigma_s: NaN, rho: NaN, amp_px: NaN, eje: null, f_px_rad: NaN, n: 0 };
    if (!giro || !giro.t || giro.t.length < 10) { out.motivo = 'sin_giro'; return out; }
    if (!mov || !mov.t || !mov.t.length) { out.motivo = 'sin_mov'; return out; }
    const wA = isFin(L_ref) ? L_ref + C.ventana[0] : -Infinity, wB = isFin(L_ref) ? L_ref + C.ventana[1] : Infinity;
    const tk = [], X = [], Y = [];
    for (let k = 0; k < mov.t.length; k++) {
      const tt = mov.t[k], q = mov.q ? mov.q[k] : 1;
      if (tt >= wA && tt <= wB && isFin(mov.dx[k]) && isFin(mov.dy[k]) && (!isFin(q) || q >= C.q_min)) { tk.push(tt); X.push(mov.dx[k]); Y.push(mov.dy[k]); }
    }
    out.n = tk.length;
    if (tk.length < 10) { out.motivo = 'pocos_cuadros'; return out; }
    // Si el seguimiento de la imagen fue dudoso en parte de la ventana (de noche con desenfoque, p. ej.), una
    // correlación alta puede salir con el retraso equivocado por ~0.1 s: mejor no usar K1.
    let enV = 0, bienV = 0;
    for (let k = 0; k < mov.t.length; k++) if (mov.t[k] >= wA && mov.t[k] <= wB) { enV++; if (!mov.q || !(mov.q[k] < 0.5)) bienV++; }
    if (enV && bienV < 0.8 * enV) { out.motivo = 'mov_dudoso'; return out; }
    // Ángulos del giroscopio (rad), integrados con trapecios alrededor de la ventana
    const gA = tk[0] - C.rango_s - 0.5, gB = tk[tk.length - 1] + C.rango_s + 0.5;
    const gt = [], th = { a: [], b: [], g: [] };
    const ac = { a: 0, b: 0, g: 0 }, prev = { a: NaN, b: NaN, g: NaN }; let tp = NaN;
    const rad = Math.PI / 180;
    for (let i = 0; i < giro.t.length; i++) {
      const ti = num(giro.t[i]); if (!(ti >= gA && ti <= gB)) continue;
      const v = { a: num(giro.a[i]), b: num(giro.b[i]), g: num(giro.g[i]) };
      if (!isFin(v.a) || !isFin(v.b) || !isFin(v.g)) continue;
      if (isFin(tp)) { if (!(ti > tp)) continue; for (const e of ['a', 'b', 'g']) ac[e] += 0.5 * (v[e] + prev[e]) * rad * (ti - tp); }
      gt.push(ti); for (const e of ['a', 'b', 'g']) { th[e].push(ac[e]); prev[e] = v[e]; }
      tp = ti;
    }
    if (gt.length < 10) { out.motivo = 'sin_giro'; return out; }
    const nK = tk.length, tm = tk.reduce((s, x) => s + x, 0) / nK;
    // quitar media y tendencia lineal (equivale a ajustar c + d·t)
    const xt = tk.map((x) => x - tm), sxx = xt.reduce((s, x) => s + x * x, 0);
    const detr = (v) => { const m = v.reduce((s, x) => s + x, 0) / v.length; let b = 0; for (let i = 0; i < v.length; i++) b += xt[i] * (v[i] - m); b /= sxx; return v.map((x, i) => x - m - b * xt[i]); };
    const imgs = { x: detr(X), y: detr(Y) };
    const ee = { x: imgs.x.reduce((s, v) => s + v * v, 0), y: imgs.y.reduce((s, v) => s + v * v, 0) };
    const thetaEn = (e, d) => { const r = new Array(nK); for (let i = 0; i < nK; i++) r[i] = interp1(gt, th[e], tk[i] + d); return detr(r); };
    const evalua = (img, e, d) => {
      const Th = thetaEn(e, d), P = imgs[img];
      let pt = 0, tt2 = 0; for (let i = 0; i < nK; i++) { pt += P[i] * Th[i]; tt2 += Th[i] * Th[i]; }
      const rho = (ee[img] > 0 && tt2 > 0) ? pt / Math.sqrt(ee[img] * tt2) : 0;
      return { rho, f: tt2 > 0 ? pt / tt2 : 0, Th, sse: ee[img] * (1 - rho * rho) };
    };
    const nPas = Math.round(C.rango_s / C.paso_s);
    let best = null;
    for (const img of ['x', 'y']) for (const e of ['a', 'b', 'g']) {
      const r2 = new Float64Array(2 * nPas + 1);
      for (let j = -nPas; j <= nPas; j++) { const v = evalua(img, e, j * C.paso_s).rho; r2[j + nPas] = v * v; }
      let jb = 0; for (let j = 1; j < r2.length; j++) if (r2[j] > r2[jb]) jb = j;
      if (!best || r2[jb] > best.r2) best = { img, e, jb, r2: r2[jb], curva: r2 };
    }
    // afinar por parábola (sobre ρ²) y medir σ por la curvatura de la suma de cuadrados
    const j = best.jb, cv = best.curva, enBorde = j === 0 || j === cv.length - 1;
    let dlt = (j - nPas) * C.paso_s;
    if (!enBorde) { const a = cv[j - 1], b = cv[j], c = cv[j + 1], den = a - 2 * b + c; if (den < 0) dlt += C.paso_s * 0.5 * (a - c) / den; }
    const fin = evalua(best.img, best.e, dlt);
    const sse = (d) => evalua(best.img, best.e, d).sse, h = C.paso_s;
    const s0 = sse(dlt), d2 = (sse(dlt - h) - 2 * s0 + sse(dlt + h)) / (h * h);
    const s2 = s0 / Math.max(1, nK - 4);
    let sigma = d2 > 0 ? Math.sqrt(2 * s2 / d2) : NaN;
    if (isFin(sigma)) sigma = Math.max(sigma, 1e-4);
    let mn = Infinity, mx = -Infinity; for (const v of fin.Th) { const p = fin.f * v; if (p < mn) mn = p; if (p > mx) mx = p; }
    Object.assign(out, {
      delta_s: dlt, sigma_s: sigma, rho: Math.abs(fin.rho), amp_px: mx - mn,
      eje: { img: best.img, giro: best.e, signo: fin.rho >= 0 ? 1 : -1 }, f_px_rad: fin.f,
    });
    if (enBorde) out.motivo = 'borde';
    else if (out.rho < C.rho_min) out.motivo = 'rho';
    else if (!(out.amp_px >= C.amp_min_px)) out.motivo = 'amplitud';
    else if (!isFin(sigma)) out.motivo = 'sigma';
    out.ok = !out.motivo;
    return out;
  }

  // ------------------------------------------------------------ reacción
  // Distancia recorrida en L_imu (reloj de los sensores) según procesar(), en ft
  function rolloutMedido(R, L_imu) {
    if (!R || !R.t || !R.d || !R.t.length || !isFin(L_imu)) return NaN;
    if (L_imu < R.t[0] || L_imu > R.t[R.t.length - 1]) return NaN;
    return interp1(R.t, R.d, L_imu) / 0.3048;
  }
  const usaAcel = (R) => !(R && R.calidad && /solo gps/i.test(String(R.calidad.metodo || '')));
  // valor numérico o {s, n} → [s, n]
  const valorN = (v) => (v && typeof v === 'object' ? [num(v.s), isFin(num(v.n)) ? v.n : NaN] : [num(v), NaN]);

  // Lógica exacta de §2.3
  function reaccion(sec, ctx) {
    ctx = ctx || {};
    const cfg = config(ctx.cfg), C = cfg.rt;
    const out = {
      ok: false, motivo: null, metodo: null, L: NaN, L_cam: NaN, L_acel: NaN, desacuerdo_s: NaN,
      rt_boleta: NaN, rt_verde: NaN, perfecta: NaN, tipo: sec ? sec.tipo || null : null,
      roja: false, roja_vista: false, roja_dudosa: false, error_s: NaN, nivel: 'baja', calibrado: false,
      delta: { s: NaN, fuente: null }, rollout_medido_ft: NaN, avisos: [],
      ajuste_s: 0, sesgo_acel_s: 0, sigma_L_s: NaN,
    };
    if (!sec || !sec.ok) { out.motivo = (sec && sec.motivo) || 'sin_secuencia'; return out; }
    const tRef = num(sec.t_ambar_ref);
    if (!isFin(tRef)) { out.motivo = 'sin_secuencia'; return out; }
    // δ = t_imu − t_cam
    const K = ctx.k1 && ctx.k1.ok && isFin(num(ctx.k1.delta_s)) ? ctx.k1 : null;
    const [dg] = valorN(ctx.delta_guardado_s);
    const fuente_t = ctx.fuente_t || sec.fuente_t;
    let d, dF, sD;
    if (K) { d = K.delta_s; dF = 'k1'; sD = isFin(num(K.sigma_s)) ? K.sigma_s : 0.003; }
    else if (isFin(dg)) { d = dg; dF = 'guardado'; sD = C.sigma_delta_guardado_s; }
    else { d = (fuente_t === 'cap' ? cfg.delta_supuesto.cap : cfg.delta_supuesto.otras); dF = 'supuesto'; sD = C.sigma_delta_supuesto_s; }
    out.delta = { s: d, fuente: dF };
    // L_cam: foco de stage apagado (mismo reloj de la cámara que el ámbar)
    const T = num(sec.fps) > 0 ? 1 / sec.fps : 1 / 30;
    const tOff = num(sec.t_stage_off), sOff = num(sec.s_stage_off);
    const L_cam = isFin(tOff) && isFin(sOff) && sOff <= 2 * T ? tOff : NaN;
    // L_acel: tRo pasado al reloj de la cámara
    const R = ctx.R || null;
    const tRo = isFin(num(ctx.tRo)) ? ctx.tRo : (R && R.ok ? num(R.tRo) : NaN);
    const conAcel = isFin(tRo) && (R ? R.ok !== false && usaAcel(R) : true);
    const [sesgo, nSesgoV] = valorN(ctx.sesgo_acel_s);
    const nSesgo = isFin(num(ctx.n_sesgo)) ? ctx.n_sesgo : (isFin(nSesgoV) ? nSesgoV : (isFin(sesgo) ? C.n_sesgo_min : 0));
    out.sesgo_acel_s = isFin(sesgo) ? sesgo : 0;
    const L_acel = conAcel ? tRo - d - out.sesgo_acel_s : NaN;
    out.L_cam = L_cam; out.L_acel = L_acel;
    const sc = Math.max(sOff, 1e-4), sa = Math.sqrt(C.sigma_acel_s * C.sigma_acel_s + sD * sD);
    let L, sL, metodo;
    if (isFin(L_cam) && isFin(L_acel)) out.desacuerdo_s = L_acel - L_cam;
    if (isFin(L_cam) && isFin(L_acel) && isFin(sesgo) && nSesgo >= C.n_sesgo_min) {
      const wc = 1 / (sc * sc), wa = 1 / (sa * sa);
      L = (wc * L_cam + wa * L_acel) / (wc + wa); sL = 1 / Math.sqrt(wc + wa); metodo = 'camara+acel';
      if (Math.abs(L_acel - L_cam) > C.desacuerdo_s) { L = L_cam; sL = sc; metodo = 'camara'; out.avisos.push('desacuerdo'); }
    } else if (isFin(L_cam)) { L = L_cam; sL = sc; metodo = 'camara'; }
    else if (isFin(L_acel)) { L = L_acel; sL = sa; metodo = 'acel'; }
    else { out.motivo = 'sin_salida'; return out; }
    out.L = L; out.sigma_L_s = sL; out.metodo = metodo;
    // Corrección por método (K3)
    const aj = ctx.ajuste || {};
    const ajC = isFin(num(aj.camara_s)) ? aj.camara_s : (isFin(num(aj.camara_ms)) ? aj.camara_ms / 1000 : 0);
    const ajA = isFin(num(aj.acel_s)) ? aj.acel_s : (isFin(num(aj.acel_ms)) ? aj.acel_ms / 1000 : 0);
    const a = metodo === 'acel' ? ajA : ajC; out.ajuste_s = a;
    // Reacción en los dos formatos
    out.rt_boleta = L - tRef + a;
    const dS = isFin(num(sec.delta_s)) ? sec.delta_s : num(sec.delta_nominal);
    const tV = isFin(num(sec.t_verde_vista)) ? sec.t_verde_vista : tRef + dS;
    out.rt_verde = L - tV + a;
    out.perfecta = ARBOLES[sec.tipo] ? ARBOLES[sec.tipo].perfecta : num(sec.delta_nominal);
    out.roja_vista = isFin(num(sec.t_roja_vista));
    out.roja = out.roja_vista || out.rt_verde < 0;
    out.roja_dudosa = out.roja_vista !== (out.rt_verde < 0);
    const sRef = isFin(num(sec.s_ambar)) ? sec.s_ambar : T / Math.sqrt(12);
    out.error_s = Math.sqrt(sL * sL + sRef * sRef);
    out.nivel = out.error_s <= C.alta_s ? 'alta' : out.error_s <= C.media_s ? 'media' : 'baja';
    out.calibrado = true;
    if (metodo === 'acel' && dF === 'supuesto') { out.nivel = 'baja'; out.calibrado = false; }
    if (isFin(L_cam) && dF === 'k1' && R) out.rollout_medido_ft = rolloutMedido(R, L_cam + d);
    for (const x of sec.avisos || []) if (x === 'carril_dudoso') out.avisos.push(x);
    if (!(out.rt_verde >= cfg.rt_min_s && out.rt_verde <= cfg.rt_max_s)) { out.motivo = 'sin_secuencia'; return out; }
    out.ok = true;
    return out;
  }
  // "Recalcular": misma secuencia, nuevo tRo/R/ajustes (no necesita cuadros)
  function reaccionDe(sec, ctx) {
    ctx = ctx || {};
    const c = Object.assign({}, ctx);
    if (!isFin(num(c.tRo)) && c.R && c.R.ok) c.tRo = c.R.tRo;
    return reaccion(sec, c);
  }

  // ------------------------------------------------------------ análisis completo (después de la corrida)
  const _llamadas = { analizar: 0, prueba: 0, calidad: 0, reanalizar: 0 };

  function deltaGuess(ctx, fuente_t, cfg) {
    const [dg] = valorN(ctx.delta_guardado_s);
    if (isFin(dg)) return dg;
    return fuente_t === 'cap' ? cfg.delta_supuesto.cap : cfg.delta_supuesto.otras;
  }
  // Tiempos crudos alineados con unos tiempos t (por hora ajustada)
  function alinear(cuadros, tt) {
    const n = tt.length, cr = cuadros.crudos || {}, T = periodoDe(cuadros.t);
    const o = { cb: new Float64Array(n).fill(NaN), cap: new Float64Array(n).fill(NaN), pres: new Float64Array(n).fill(NaN), media: new Float64Array(n).fill(NaN), nf: new Int32Array(n).fill(-1) };
    let j = 0;
    for (let i = 0; i < n; i++) {
      while (j + 1 < cuadros.n && Math.abs(cuadros.t[j + 1] - tt[i]) <= Math.abs(cuadros.t[j] - tt[i])) j++;
      if (Math.abs(cuadros.t[j] - tt[i]) > T / 2) continue;
      for (const k of ['cb', 'cap', 'pres', 'media']) if (cr[k]) o[k][i] = num(cr[k][j]);
      if (cr.nf) o.nf[i] = cr.nf[j];
    }
    return o;
  }

  // ¿La disposición trae focos? (localizar puede decir 'sin_secuencia' o 'ambigua' y aun así ubicar el árbol)
  function tieneFocos(disp) {
    if (!disp) return false;
    if (disp.ok) return true;
    const f = disp.focos || {};
    return CARRILES.some((c) => f[c] && ['a1', 'a2', 'a3', 'g'].some((k) => f[c][k] && isFin(f[c][k].x)));
  }

  function analizar(cuadros, ctx) {
    _llamadas.analizar++;
    const t0 = ahora();
    ctx = ctx || {};
    const cfg = config(ctx.cfg);
    const res = { disp: null, mov: null, rasgos: null, sec: null, k1: null, rt: null, ms: 0, motivo: null, crudos: null, L_ref: NaN, disp_general: null };
    const fin = (motivo) => { res.motivo = motivo || null; res.ms = ahora() - t0; return res; };
    try {
      const V = vision();
      if (!cuadros || !(cuadros.n > 0)) return fin('sin_cuadros');
      const R = ctx.R || null;
      const tRo = isFin(num(ctx.tRo)) ? ctx.tRo : (R && R.ok ? num(R.tRo) : NaN);
      if ((R && R.ok === false) || !isFin(tRo)) return fin('sin_corrida');
      if (!V) return fin('sin_vision');
      const fuente_t = cuadros.reloj ? cuadros.reloj.fuente : null;
      let L_ref = tRo - deltaGuess(ctx, fuente_t, cfg);
      const t = cuadros.t, n = cuadros.n, T = periodoDe(t), W = cfg.ventana;
      if (t[n - 1] < L_ref - 0.5) return fin('camara_detenida');
      if (t[0] > L_ref - W.ventana_minima_antes_s) return fin('ventana');
      const kA = buscarIdx(t, L_ref - W.antes_s), kB = Math.min(n - 1, buscarIdx(t, L_ref + W.despues_s));
      if (kB - kA < 10) return fin('sin_cuadros');
      const ki = (x) => Math.min(kB, Math.max(kA, buscarIdx(t, x)));
      const kr = [ki(L_ref + cfg.mov.ref[0]), ki(L_ref + cfg.mov.ref[1])];
      // 1) movimiento (vibración y cabeceo)
      const mov = V.estabilizar(cuadros, { kA, kB, busqueda_px: cfg.mov.busqueda_px, k_ref: kr, ref: [L_ref + cfg.mov.ref[0], L_ref + cfg.mov.ref[1]], cfg });
      res.mov = mov;
      // 2) K1 con el cabeceo de la salida → mejor L_ref
      res.k1 = ctx.giro ? k1(mov, ctx.giro, { L_ref, cfg }) : Object.assign(k1(null, null, {}), { motivo: 'sin_giro' });
      if (res.k1.ok) L_ref = tRo - res.k1.delta_s;
      res.L_ref = L_ref;
      // 3) eventos y disposición del árbol
      const bA = ki(L_ref + W.buscar[0]), bB = ki(L_ref + W.buscar[1]);
      const evOn = V.eventos(cuadros, mov, { kA: bA, kB: bB, signo: +1, cfg });
      // manchas fijas (pre-stage y stage) en la ventana que elija la visión: [τ − 0.25, τ − 0.05]
      const fijas = (tA, tB) => V.manchasFijas(cuadros, mov, { tA, tB, cfg });
      const disp = V.localizar(evOn, fijas, { carril: ctx.carril, arbol: ctx.arbol || 'auto', L_ref, hora_quieto: ctx.hora_quieto, cfg, cuadros, mov, T });
      res.disp = disp;
      if (!tieneFocos(disp)) {
        // ¿quedó fuera de la zona? localización gruesa con la vista general
        const vg = cuadros.vista;
        if (vg && vg.n > 10 && typeof V.eventos === 'function') {
          try {
            const vt = vg.t, va = buscarIdx(vt, L_ref + W.buscar[0]), vb = Math.min(vg.n - 1, buscarIdx(vt, L_ref + W.buscar[1]));
            const ev2 = V.eventos(vg, null, { kA: va, kB: vb, signo: +1, cfg });
            const d2 = V.localizar(ev2, [], { carril: ctx.carril, arbol: ctx.arbol || 'auto', L_ref, hora_quieto: ctx.hora_quieto, cfg, general: true });
            if (d2 && d2.ok) { res.disp_general = d2; return fin('fuera_de_zona'); }
          } catch (e) { /* sin vista útil */ }
        }
        return fin((disp && disp.motivo) || 'sin_arbol');
      }
      // 4) rasgos por foco y cuadro (las dos columnas)
      const rasgos = V.rasgos(cuadros, mov, disp, cfg);
      if (rasgos && !rasgos.fuente_t) rasgos.fuente_t = fuente_t;
      res.rasgos = rasgos;
      res.crudos = rasgos ? alinear(cuadros, rasgos.t) : null;
      // 5) secuencia y reacción
      res.sec = buscarSecuencia(rasgos, disp, { carril: ctx.carril, arbol: ctx.arbol, L_ref, cfg, hora_quieto: ctx.hora_quieto });
      if (!res.sec.ok) return fin(res.sec.motivo || 'sin_secuencia');
      res.rt = reaccion(res.sec, Object.assign({}, ctx, { tRo, k1: res.k1, fuente_t, cfg }));
      return fin(res.rt.ok ? null : res.rt.motivo);
    } catch (e) {
      res.error = String(e && e.message || e);
      return fin('error');
    }
  }

  // Cambiar carril o árbol sin cuadros: guardado = {rasgos, disp, mov, k1}
  function reanalizar(guardado, ctx) {
    _llamadas.reanalizar++;
    ctx = ctx || {};
    const cfg = config(ctx.cfg), g = guardado || {};
    const R = ctx.R || null;
    const tRo = isFin(num(ctx.tRo)) ? ctx.tRo : (R && R.ok ? num(R.tRo) : NaN);
    const fuente_t = (g.rasgos && g.rasgos.fuente_t) || ctx.fuente_t || null;
    const K = g.k1 && g.k1.ok ? g.k1 : null;
    const L_ref = isFin(num(ctx.L_ref)) ? ctx.L_ref : (K ? tRo - K.delta_s : tRo - deltaGuess(ctx, fuente_t, cfg));
    if (!g.rasgos) return { sec: secuenciaVacia('sin_arbol', ctx.carril, 'usuario'), rt: reaccion(null, {}) };
    const sec = buscarSecuencia(g.rasgos, g.disp || null, { carril: ctx.carril, arbol: ctx.arbol, L_ref, cfg, hora_quieto: ctx.hora_quieto });
    const rt = reaccion(sec, Object.assign({}, ctx, { tRo, k1: g.k1 || null, fuente_t, cfg }));
    return { sec, rt };
  }

  // Apuntar y videos: todas las secuencias completas, sin tRo
  function prueba(cuadros, o) {
    _llamadas.prueba++;
    o = o || {};
    const cfg = config(o.cfg), V = vision(), res = [];
    res.disp = null;
    if (!V || !cuadros || !(cuadros.n > 10)) return res;
    try {
      const n = cuadros.n, T = periodoDe(cuadros.t), kB = n - 1;
      const kr = [0, Math.min(kB, Math.max(1, Math.round(0.3 / T)))];
      const mov = V.estabilizar(cuadros, { kA: 0, kB, busqueda_px: cfg.mov.busqueda_px, k_ref: kr, ref: [cuadros.t[0], cuadros.t[kr[1]]], cfg });
      const evOn = V.eventos(cuadros, mov, { kA: 0, kB, signo: +1, cfg });
      const fijas = (tA, tB) => V.manchasFijas(cuadros, mov, { tA, tB, cfg });
      const disp = V.localizar(evOn, fijas, { carril: o.carril, arbol: o.arbol || 'auto', L_ref: NaN, cfg, cuadros, mov, T });
      res.disp = disp;
      if (!tieneFocos(disp)) return res;
      const rasgos = V.rasgos(cuadros, mov, disp, cfg);
      if (rasgos && !rasgos.fuente_t) rasgos.fuente_t = cuadros.reloj ? cuadros.reloj.fuente : null;
      const carriles = o.carril === 'izq' || o.carril === 'der' ? [o.carril] : CARRILES;
      for (const c of carriles) {
        for (const s of secuencias(rasgos, disp, { carril: c, carril_fuente: o.carril ? 'usuario' : 'auto', arbol: o.arbol, L_ref: NaN, cfg })) if (s.ok) res.push(s);
      }
      res.sort((a, b) => a.t_ambar_ref - b.t_ambar_ref);
    } catch (e) { res.error = String(e && e.message || e); }
    return res;
  }

  // Revisión de la imagen en Apuntar (cuenta llamadas para la prueba de neutralidad)
  function calidad(rgba, w, h, o) {
    _llamadas.calidad++;
    const V = vision();
    return V && typeof V.calidad === 'function' ? V.calidad(rgba, w, h, o) : null;
  }

  // ------------------------------------------------------------ formatos
  // 'boleta': desde el último ámbar (como el ticket); 'verde': diferencia contra la verde (+ = tarde)
  function fmtRT(rt, tipo, formato, rt_boleta) {
    if (formato === 'boleta') {
      const b = isFin(rt_boleta) ? rt_boleta : (isFin(rt) ? rt + perfectaDe(tipo) : NaN);
      return isFin(b) ? b.toFixed(3) : '—';
    }
    if (!isFin(rt)) return '—';
    return (rt > 0 ? '+' : '') + rt.toFixed(3);
  }

  // ------------------------------------------------------------ CSV (drag_raw_cam_*.csv)
  const FIJAS = ['t_s', 't_llamada_s', 't_captura_s', 't_presentacion_s', 't_media_s', 'n_presentados', 'dx_px', 'dy_px', 'ganancia', 'peso'];
  const COLS_RASGOS = []; for (const c of CARRILES) for (const f of FOCOS) for (const r of RASGOS) COLS_RASGOS.push(`${c}.${f}.${r}`);
  // Número más corto que vuelve exacto (float32 si el valor cabe en float32)
  function txtNum(x) {
    if (!isFin(x)) return '';
    if (Math.fround(x) !== x) return String(x);
    for (let p = 6; p < 9; p++) { const s = x.toPrecision(p); if (Math.fround(+s) === x) return limpiarNum(s); }
    return limpiarNum(x.toPrecision(9));
  }
  function limpiarNum(s) {
    let m = s, e = ''; const i = s.indexOf('e'); if (i >= 0) { m = s.slice(0, i); e = s.slice(i); }
    if (m.indexOf('.') >= 0) m = m.replace(/0+$/, '').replace(/\.$/, '');
    return m + e;
  }
  function aCSV(rasgos, crudos) {
    const n = rasgos.n | 0, cols = rasgos.cols || [], idx = colIdx(rasgos), nc = cols.length;
    const extra = cols.filter((c) => COLS_RASGOS.indexOf(c) < 0);
    const salida = COLS_RASGOS.concat(extra);
    const mov = rasgos.mov || {};
    // tiempos crudos: por índice si ya vienen alineados (analizar().crudos); si son los de todos los
    // cuadros, con el desfase rasgos.k0 de la visión, o por hora si traen t
    let cr = crudos || null;
    if (cr && cr.cb && cr.cb.length !== n) {
      if (cr.t) cr = alinear({ n: cr.t.length, t: cr.t, crudos: cr }, rasgos.t);
      else if (isFin(rasgos.k0) && rasgos.k0 + n <= cr.cb.length) {
        const k0 = rasgos.k0, sub = (a) => (a ? a.slice(k0, k0 + n) : null);
        cr = { cb: sub(cr.cb), cap: sub(cr.cap), pres: sub(cr.pres), media: sub(cr.media), nf: sub(cr.nf) };
      } else cr = null;
    }
    const movIdx = (k) => (mov.t && mov.t.length === n ? k : (mov.t ? buscarCerca(mov.t, rasgos.t[k]) : -1));
    const lineas = [FIJAS.concat(salida).join(',')];
    for (let k = 0; k < n; k++) {
      const f = [String(rasgos.t[k])];
      for (const c of ['cb', 'cap', 'pres', 'media']) f.push(cr && cr[c] && k < cr[c].length && isFin(num(cr[c][k])) ? String(cr[c][k]) : '');
      f.push(cr && cr.nf && k < cr.nf.length && cr.nf[k] >= 0 ? String(cr.nf[k]) : '');
      const m = movIdx(k);
      f.push(m >= 0 && mov.dx ? txtNum(mov.dx[m]) : '', m >= 0 && mov.dy ? txtNum(mov.dy[m]) : '');
      f.push(rasgos.G ? txtNum(rasgos.G[k]) : '', rasgos.peso ? txtNum(rasgos.peso[k]) : '');
      for (const c of salida) { const j = idx[c]; f.push(j === undefined ? '' : txtNum(rasgos.datos[k * nc + j])); }
      lineas.push(f.join(','));
    }
    return lineas.join('\n') + '\n';
  }
  function buscarCerca(a, x) {
    const i = buscarIdx(a, x); let b = -1, bd = Infinity;
    for (const j of [i - 1, i]) if (j >= 0 && j < a.length && Math.abs(a[j] - x) < bd) { bd = Math.abs(a[j] - x); b = j; }
    return b;
  }
  // texto → { rasgos, crudos }. fuente_t: del meta si se pasa; si no, se deduce con el reloj.
  function deCSV(texto, meta) {
    const lineas = String(texto).split(/\r?\n/).filter((l) => l.length);
    if (!lineas.length) throw new Error('CSV vacío');
    const cab = lineas[0].split(',').map((s) => s.trim()), n = lineas.length - 1;
    const pos = {}; cab.forEach((c, j) => { pos[c] = j; });
    const cols = cab.filter((c) => FIJAS.indexOf(c) < 0);
    const nc = cols.length;
    const val = new Array(cab.length); for (let j = 0; j < cab.length; j++) val[j] = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const f = lineas[k + 1].split(',');
      for (let j = 0; j < cab.length; j++) { const s = f[j]; val[j][k] = s === undefined || s === '' ? NaN : +s; }
    }
    const col = (nombre) => (pos[nombre] === undefined ? new Float64Array(n).fill(NaN) : val[pos[nombre]]);
    const f32 = (a) => Float32Array.from(a);   // como en el contrato (Rasgos y Mov en float32)
    const t = Float64Array.from(col('t_s'));
    const datos = new Float32Array(n * nc);
    cols.forEach((c, j) => { const v = val[pos[c]]; for (let k = 0; k < n; k++) datos[k * nc + j] = v[k]; });
    const nfV = col('n_presentados'), nf = new Int32Array(n); for (let k = 0; k < n; k++) nf[k] = isFin(nfV[k]) ? nfV[k] : -1;
    const crudos = { cb: Float64Array.from(col('t_llamada_s')), cap: Float64Array.from(col('t_captura_s')), pres: Float64Array.from(col('t_presentacion_s')), media: Float64Array.from(col('t_media_s')), nf };
    const G = f32(col('ganancia')), peso = f32(col('peso'));
    const mov = { t, dx: f32(col('dx_px')), dy: f32(col('dy_px')), q: peso, G };
    let fuente_t = meta && (meta.fuente_t || (meta.reloj && meta.reloj.fuente));
    if (!fuente_t) fuente_t = reloj(crudos, {}).fuente;
    const rasgos = { n, t, cols, datos, peso, G, mov, fuente_t };
    return { rasgos, crudos };
  }

  // ------------------------------------------------------------ clip de la caja del árbol (luma estabilizada)
  function clip(cuadros, mov, caja, tA, tB) {
    const W = cuadros.w, H = cuadros.h, tam = cuadros.tam || W * H;
    let [bx, by, bw, bh] = caja && caja.length === 4 ? caja.map(Math.round) : [0, 0, W, H];
    bw = Math.max(1, Math.min(bw, W)); bh = Math.max(1, Math.min(bh, H));
    if (!isFin(tA)) tA = -Infinity; if (!isFin(tB)) tB = Infinity;
    const ks = []; for (let k = 0; k < cuadros.n; k++) if (cuadros.t[k] >= tA && cuadros.t[k] <= tB) ks.push(k);
    const n = ks.length, y = new Uint8Array(n * bw * bh), t = new Float64Array(n);
    const T = periodoDe(cuadros.t);
    for (let i = 0; i < n; i++) {
      const k = ks[i]; t[i] = cuadros.t[k];
      let dx = 0, dy = 0;
      if (mov && mov.t) {
        const m = mov.t.length === cuadros.n ? k : buscarCerca(mov.t, cuadros.t[k]);
        if (m >= 0 && Math.abs(mov.t[m] - cuadros.t[k]) <= T / 2) { dx = isFin(mov.dx[m]) ? mov.dx[m] : 0; dy = isFin(mov.dy[m]) ? mov.dy[m] : 0; }
      }
      const ox = bx + Math.round(dx), oy = by + Math.round(dy), base = k * tam, dst = i * bw * bh;
      for (let r = 0; r < bh; r++) {
        const yy = Math.min(H - 1, Math.max(0, oy + r)), fila = base + yy * W, d = dst + r * bw;
        for (let c = 0; c < bw; c++) { const xx = Math.min(W - 1, Math.max(0, ox + c)); y[d + c] = cuadros.datos[fila + xx]; }
      }
    }
    return { w: bw, h: bh, n, t, y };
  }

  // ------------------------------------------------------------ tira de revisión (RGBA, sin canvas)
  // Letra de 3×5 (filas de arriba a abajo); se dibuja al doble
  const LETRA = (() => {
    const d = {
      '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
      '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
      '+': '000010111010000', '-': '000000111000000', '.': '000000000000010', ':': '000010000010000', ' ': '000000000000000',
      '(': '010100100100010', ')': '010001001001010', '/': '001001010100100', '?': '111001011000010',
      A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
      F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
      K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
      P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
      U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
      Z: '111001010100111',
    };
    return d;
  })();
  function colorRGB(c) {
    if (Array.isArray(c)) return [c[0] | 0, c[1] | 0, c[2] | 0];
    const s = String(c || '#ffffff').trim();
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
    if (!m) return [255, 255, 255];
    let h = m[1]; if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function texto(img, W, H, x, y, s, rgb, esc) {
    const limpio = String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    let cx = x;
    for (const ch of limpio) {
      const g = LETRA[ch] || LETRA['?'];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
        if (g[r * 3 + c] !== '1') continue;
        for (let a = 0; a < esc; a++) for (let b = 0; b < esc; b++) {
          const px = cx + c * esc + b, py = y + r * esc + a;
          if (px < 0 || py < 0 || px >= W || py >= H) continue;
          const i = (py * W + px) * 4; img[i] = rgb[0]; img[i + 1] = rgb[1]; img[i + 2] = rgb[2]; img[i + 3] = 255;
        }
      }
      cx += 4 * esc;
    }
  }
  // marcas: [{t, etiqueta, color}]; opts: {cuadros_por_marca, alto, t_ref (L: los tiempos se escriben relativos a él, en ms)}
  function tira(cl, marcas, opts) {
    opts = opts || {};
    const cpm = Math.max(1, opts.cuadros_por_marca || 6), alto = Math.max(8, opts.alto || 96);
    const esc = opts.escala_letra || 2, banda = 5 * esc + 4, gap = 2, pad = 4;
    const lista = (marcas || []).filter((m) => m && isFin(num(m.t)));
    const cw = cl && cl.n ? Math.max(1, Math.round(cl.w * alto / cl.h)) : 1;
    const W = pad * 2 + cpm * (cw + gap) - gap;
    const filaH = banda + alto + banda + gap;
    const H = Math.max(1, pad * 2 + lista.length * filaH);
    const img = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) { img[i * 4] = 24; img[i * 4 + 1] = 24; img[i * 4 + 2] = 28; img[i * 4 + 3] = 255; }
    if (!cl || !cl.n) return { w: W, h: H, rgba: img };
    const tRef = num(opts.t_ref);
    lista.forEach((m, fila) => {
      const rgb = colorRGB(m.color), y0 = pad + fila * filaH;
      texto(img, W, H, pad, y0 + 2, m.etiqueta || '', rgb, esc);
      // primer cuadro en o después de t (donde ya se ve el cambio) y sus vecinos (2 antes)
      let kc = buscarIdx(cl.t, m.t); if (kc >= cl.n) kc = cl.n - 1;
      const k0 = Math.max(0, Math.min(cl.n - cpm, kc - Math.floor((cpm - 1) / 2)));
      for (let j = 0; j < cpm && k0 + j < cl.n; j++) {
        const k = k0 + j, x0 = pad + j * (cw + gap), yi = y0 + banda;
        for (let yy = 0; yy < alto; yy++) {
          const sy = Math.min(cl.h - 1, Math.floor(yy * cl.h / alto));
          for (let xx = 0; xx < cw; xx++) {
            const sx = Math.min(cl.w - 1, Math.floor(xx * cl.w / cw));
            const v = cl.y[k * cl.w * cl.h + sy * cl.w + sx], i = ((yi + yy) * W + x0 + xx) * 4;
            img[i] = v; img[i + 1] = v; img[i + 2] = v;
          }
        }
        if (k === kc) {   // borde del color de la marca en ese cuadro
          for (let xx = -1; xx <= cw; xx++) for (const yy of [-1, alto]) { const px = x0 + xx, py = yi + yy; if (px >= 0 && px < W && py >= 0 && py < H) { const i = (py * W + px) * 4; img[i] = rgb[0]; img[i + 1] = rgb[1]; img[i + 2] = rgb[2]; } }
          for (let yy = 0; yy < alto; yy++) for (const xx of [-1, cw]) { const px = x0 + xx, py = yi + yy; if (px >= 0 && px < W) { const i = (py * W + px) * 4; img[i] = rgb[0]; img[i + 1] = rgb[1]; img[i + 2] = rgb[2]; } }
        }
        const rel = Math.round(((cl.t[k] - (isFin(tRef) ? tRef : m.t)) * 1000));
        texto(img, W, H, x0, yi + alto + 2, (rel > 0 ? '+' : '') + rel, k === kc ? rgb : [200, 200, 200], esc === 2 && cw < 40 ? 1 : esc);
      }
    });
    return { w: W, h: H, rgba: img };
  }

  // ------------------------------------------------------------ calibración (K1 guardado, K2, K3)
  // corridas: [run] (con run.cam y run.boleta). opts.rollout_ft: solo corridas con ese rollout para
  // lo que depende de tRo (sesgo acel y corrección del acelerómetro).
  function calibracion(corridas, opts) {
    opts = opts || {};
    const nMin = isFin(opts.n_min) ? opts.n_min : 3;
    const sesgos = [], rolls = [], ajC = [], ajA = [], dl = { izq: [], der: [] };
    let nBol = 0;
    const mismoRollout = (run) => !isFin(num(opts.rollout_ft)) || !run.cfg || !isFin(num(run.cfg.rollout_ft)) || Math.abs(run.cfg.rollout_ft - opts.rollout_ft) < 1e-9;
    for (const run of corridas || []) {
      const cam = run && run.cam; if (!cam) continue;
      const rt = cam.rt || {}, k = cam.k1 || {};
      const carril = (cam.cfg && cam.cfg.carril) || (cam.sec && cam.sec.carril);
      // K1 guardado por carril (respaldo cuando una corrida no tiene cabeceo)
      if (k.ok && isFin(num(k.delta_s)) && dl[carril]) dl[carril].push(k.delta_s);
      // K2: sesgo del acelerómetro contra el stage visto (δ de esta corrida o guardado, nunca supuesto)
      const dF = rt.delta && rt.delta.fuente;
      if (isFin(num(rt.L_cam)) && isFin(num(rt.L_acel)) && (dF === 'k1' || dF === 'guardado') && mismoRollout(run)) {
        sesgos.push(rt.L_acel + (isFin(num(rt.sesgo_acel_s)) ? rt.sesgo_acel_s : 0) - rt.L_cam);
      }
      if (isFin(num(rt.rollout_medido_ft))) rolls.push(rt.rollout_medido_ft);
      // K3: boleta contra la app sin corrección
      const b = run.boleta;
      if (b && isFin(num(b.rt)) && isFin(num(rt.rt_boleta))) {
        nBol++;
        const sin = rt.rt_boleta - (isFin(num(rt.ajuste_s)) ? rt.ajuste_s : 0);
        if (rt.metodo === 'acel') { if (mismoRollout(run)) ajA.push(b.rt - sin); }
        else if (rt.metodo) ajC.push(b.rt - sin);
      }
    }
    const resumen = (a) => (a.length ? { s: mediana(a), n: a.length, mad: mad(a) } : null);
    const rango = (a) => (a.length ? [percentil(a, 0), percentil(a, 100)] : null);
    return {
      sesgo_acel_s: sesgos.length ? mediana(sesgos) : NaN, n_sesgo: sesgos.length, mad_sesgo_s: sesgos.length ? mad(sesgos) : NaN,
      ajuste_camara_s: ajC.length >= nMin ? mediana(ajC) : NaN, ajuste_acel_s: ajA.length >= nMin ? mediana(ajA) : NaN,
      n_boletas: nBol, n_boletas_camara: ajC.length, n_boletas_acel: ajA.length, rango_camara_s: rango(ajC), rango_acel_s: rango(ajA),
      rollout_medido_ft: rolls.length ? mediana(rolls) : NaN, n_rollout: rolls.length, mad_rollout_ft: rolls.length ? mad(rolls) : NaN,
      delta_por_carril: { izq: resumen(dl.izq), der: resumen(dl.der) },
    };
  }

  const api = {
    VERSION, ARBOLES, FOCOS, defaultConfig, Anillo, reloj, buscarSecuencia, k1, reaccion, reaccionDe, rolloutMedido,
    analizar, reanalizar, prueba, calidad, fmtRT, aCSV, deCSV, clip, tira, calibracion, _llamadas,
    _vision: null,   // las pruebas pueden inyectar aquí una visión falsa
    _util: { mediana, percentil, mad, interp1, mezclar, flancos, periodoDe, deltaNominal, periodoCoherente, indicesDeLlegada, envolvente, pasosDe },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Semaforo = api;
})(typeof self !== 'undefined' ? self : this);
