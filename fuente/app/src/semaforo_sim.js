/* semaforo_sim.js — Simulador del árbol de arrancones para "Medir con el semáforo real" (beta 0.6).
 * Solo para pruebas en Node, la página de prueba y la demo: NUNCA se usa al medir de verdad.
 * window.SemaforoSim en el navegador, module.exports en Node. Sin dependencias; si existe
 * Semaforo.Anillo lo usa para convertir y congelar los cuadros (así salen idénticos a los de la cámara).
 *
 * Qué simula (plan.md §2.5):
 *  - Árbol de dos columnas (pre, stage, 3 ámbares, verde, roja), Pro .4 / Full .5; carril propio y el otro
 *    (handicap con desfase, sin auto, o fuera del cuadro); ámbares que se apagan o se quedan; roja; secuencias previas.
 *  - Luz de cada foco = integral EXACTA de la lámpara sobre la exposición de cada fila: LED escalón,
 *    incandescente con τr/τf (exponenciales), PWM (f, duty) con rolling shutter (R_s) y exposición E.
 *  - Fondo con textura, caja del árbol, sol de frente con fantasma, distractores (frenos, intermitentes,
 *    reflejos), autoexposición (deriva y saltos), ruido, parpadeo de las luces de la pista.
 *  - Vibración y cabeceo de la salida: el MISMO desplazamiento d(t) mueve la imagen (con desenfoque dentro de
 *    la exposición) y da el giroscopio (ω = d'(t)/f).
 *  - Entrega como la cámara web: cuadros perdidos, jitter, atascos, latencia de cámara e IMU, fuente de la hora.
 * Convenciones: px del recorte con el centro del píxel en enteros (como semaforo_vision.js), y hacia abajo.
 * Reloj = performance.now()/1000. t de un cuadro = centro de la exposición de la fila central del cuadro
 * ORIGINAL; la fila Y (px originales, de H) se expone R_s·(Y − (H−1)/2)/H después.
 * La verdad (tiempos y focos) es solo para las pruebas: el detector jamás la recibe.
 *
 * API
 *  SemaforoSim.escena(opts) → Escena          opts: ver DEF_ESCENA (geometría, tiempos, luz, movimiento, recorte, seed)
 *  SemaforoSim.pintar(escena, t, {out, ruido, vista:{w,h}}) → Uint8ClampedArray RGBA (w·h·4); t = centro de la exposición
 *  SemaforoSim.simular(opts & DEF_SIM) → { cuadros (Cuadros de plan.md §2.2, vía Semaforo.Anillo), giro:{t,a,b,g} (°/s),
 *                                          verdad, escena, stats }
 *  SemaforoSim.giro(escena, {t_inicio, t_fin, giro_hz, lat_imu_s, ruido_dps, jitter_ms, sesgo_dps, seed}) → {t,a,b,g}
 *  SemaforoSim.rotacion(escena, t) → {a,b,g} °/s instantáneo (para un rotationRate falso en el navegador)
 *  SemaforoSim.desplazamiento(escena, t) → [dx, dy] px;  ganancia(escena, t) → factor de la autoexposición
 *  SemaforoSim.condicion('dia'|'sombra'|'noche'|'inc20'|'inc40'|'pwm200'|'pwm400'|'pwm1000'|'sol') → opciones
 *  SemaforoSim.desdeSesion(DragCore.simularSesion(...), {rt_s, …}) → opciones de simular (stage = t_ro_abs)
 *  SemaforoSim.serieFoco(o) → {t, y, peso, verdad:{tau}}  serie ideal de un foco (ajuste de flanco solo, como sim.js)
 *  SemaforoSim.lampara(tramos, {tipo, tr_s, tf_s, pwm}) → {integral(a,b), valor(t)};  aYUV(rgba, w, h, fmt) → Uint8Array
 * verdad: t_ambar[3], t_ambar_ref, t_verde, verde_visible, t_roja (NaN), roja, t_stage_on/off, t_pre_on/off, delta_s,
 *   rt_s, rt_boleta_s, perfecta, hora_quieto, otro{…}, previas[], disp{abajo, derecha, paso_px, caja, focos{izq,der}},
 *   cabeceo{t0, dur_s, amp_px, dir}; y de simular: t_cuadros (hora física de cada cuadro entregado), desfase_cam_s
 *   (cuadros.t − físico), en_camara{…} (lo que debe dar el detector en el reloj de la cámara, con la fila de cada foco),
 *   k1{delta_s (t_imu − t_cam, fila central), delta_arbol_s, eje{img, giro, signo}, f_px_rad}, lat_cam_s, lat_imu_s.
 */
(function (root) {
  'use strict';

  const VERSION = 'semaforo_sim v1';
  const isFin = Number.isFinite;
  const DOS_PI = 2 * Math.PI;
  const GRADOS = 180 / Math.PI;
  const NSUB = 8;                 // submuestras máximas por exposición para las lámparas (cada ≤ 0.5 px)
  const NSUB_F = 4;               // y para el fondo (cada ≤ 1 px: la textura no necesita más)
  const ahora = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const fin = (x, d) => (isFin(x) ? x : d);
  const esObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

  // ------------------------------------------------------------ azar determinista
  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mezcla(a, b) {
    let h = (Math.imul((a >>> 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((b >>> 0) + 0x632BE5AB, 0xC2B2AE35)) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x7FEB352D) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x846CA68B) >>> 0; h ^= h >>> 16;
    return h >>> 0;
  }
  function normal(rnd) { let u = 0; while (!u) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(DOS_PI * rnd()); }
  // semilla a partir de un instante (µs): pintar(escena, t) da siempre el mismo ruido para el mismo t
  function semillaDeT(seed, t) {
    const q = Math.round(t * 1e6);
    return mezcla(mezcla(seed, q >>> 0), Math.floor(q / 4294967296) >>> 0);
  }
  // ruido de valor 2D (para la textura del fondo), en [−1, 1]
  function hash2(ix, iy, seed) {
    let h = (Math.imul(ix | 0, 0x27D4EB2D) ^ Math.imul(iy | 0, 0x165667B1) ^ seed) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35) >>> 0; h ^= h >>> 16;
    return (h >>> 0) / 2147483648 - 1;
  }
  function vruido(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  // fbm sin las octavas más finas que el píxel (fp = px de escena por píxel de salida)
  function fbm(x, y, fp, seed) {
    let s = 0, amp = 1, norm = 0, lam = 48;
    for (let o = 0; o < 5; o++, lam *= 0.5, amp *= 0.62) {
      if (lam < 2 * fp) break;
      s += amp * vruido(x / lam, y / lam, seed + o * 1013); norm += amp;
    }
    return norm ? 1.7 * s / norm : 0;
  }

  // ------------------------------------------------------------ sRGB y YUV (igual que Semaforo.Anillo)
  const NL = 16384, SRGB = new Uint8Array(NL + 1);
  for (let i = 0; i <= NL; i++) {
    const c = i / NL, v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    SRGB[i] = Math.max(0, Math.min(255, Math.round(255 * v)));
  }
  // RGBA → YUV 4:2:0 (BT.601 de rango completo, entero) o y8: réplica exacta de Semaforo.Anillo.push
  function aYUV(rgba, w, h, fmt, dst, off) {
    fmt = fmt || 'yuv420'; off = off | 0;
    const tam = fmt === 'yuv420' ? w * h + 2 * (w >> 1) * (h >> 1) : w * h;
    if (!dst) dst = new Uint8Array(tam);
    const D = dst;
    if (fmt === 'y8') {
      for (let p = 0, q = off, n = w * h; p < n; p++, q++) { const i = p << 2; D[q] = (77 * rgba[i] + 150 * rgba[i + 1] + 29 * rgba[i + 2]) >> 8; }
      return dst;
    }
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
    return dst;
  }

  // ------------------------------------------------------------ lámpara: integral exacta
  // tramos [[on, off], …] (off puede ser Infinity); o = {tipo:'led'|'inc', tr_s, tf_s (0.6·tr), pwm:{f_hz, duty, fase}}
  // LED: escalón (× onda cuadrada si hay PWM). Incandescente: sube 1 − e^(−t/τr), baja e^(−t/τf), con memoria.
  function unirTramos(tr) {
    const a = [];
    for (const x of tr || []) if (x && x.length >= 2 && x[1] > x[0]) a.push([x[0], x[1]]);
    a.sort((p, q) => p[0] - q[0]);
    const o = [];
    for (const x of a) { const u = o[o.length - 1]; if (u && x[0] <= u[1]) u[1] = Math.max(u[1], x[1]); else o.push(x); }
    return o;
  }
  class Lampara {
    constructor(tramos, o) {
      o = o || {};
      this.tramos = unirTramos(tramos);
      this.tipo = o.tipo === 'inc' ? 'inc' : 'led';
      this.tr = Math.max(0, fin(o.tr_s, 0));
      this.tf = Math.max(0, fin(o.tf_s, 0.6 * this.tr));
      if (this.tipo === 'inc' && !(this.tr > 0 || this.tf > 0)) this.tipo = 'led';
      const p = o.pwm;
      this.pwm = (this.tipo === 'led' && p && p.f_hz > 0 && fin(p.duty, 0.5) < 1)
        ? { f: p.f_hz, d: clamp(fin(p.duty, 0.5), 0.005, 1), ph: fin(p.fase, 0) } : null;
      this.t_on = this.tramos.length ? this.tramos[0][0] : Infinity;
      this.t_fin = this.tipo === 'inc' && this.tramos.length && this.tramos[this.tramos.length - 1][1] < Infinity
        ? this.tramos[this.tramos.length - 1][1] + 40 * Math.max(this.tf, 1e-6)    // cola de la bajada
        : (this.tramos.length ? this.tramos[this.tramos.length - 1][1] : -Infinity);
      if (this.tipo === 'inc') this._segmentos();
    }
    // Segmentos {t0, t1, g (meta), B0 (brillo al inicio), tau}; antes del primer encendido todo es 0
    _segmentos() {
      const S = []; let B = 0;
      const tr = this.tramos;
      for (let i = 0; i < tr.length; i++) {
        const [a, c] = tr[i];
        S.push({ t0: a, t1: c, g: 1, B0: B, tau: this.tr });
        B = c === Infinity ? 1 : (this.tr > 0 ? 1 + (B - 1) * Math.exp(-(c - a) / this.tr) : 1);
        if (c === Infinity) break;
        const nx = i + 1 < tr.length ? tr[i + 1][0] : Infinity;
        S.push({ t0: c, t1: nx, g: 0, B0: B, tau: this.tf });
        B = nx === Infinity ? 0 : (this.tf > 0 ? B * Math.exp(-(nx - c) / this.tf) : 0);
      }
      this.seg = S;
    }
    // ∫ de la onda cuadrada del PWM desde −∞ (relativa): fracción encendida acumulada
    _P(t) { const P = this.pwm, u = t * P.f + P.ph, k = Math.floor(u); return (k * P.d + Math.min(u - k, P.d)) / P.f; }
    // ∫_x^y brillo(t) dt (brillo 0–1)
    integral(x, y) {
      if (!(y > x)) return 0;
      if (y <= this.t_on || x >= this.t_fin) return 0;
      let s = 0;
      if (this.tipo === 'led') {
        for (const [a, c] of this.tramos) {
          if (c <= x) continue; if (a >= y) break;
          const p = a > x ? a : x, q = c < y ? c : y;
          s += this.pwm ? this._P(q) - this._P(p) : q - p;
        }
        return s;
      }
      for (const S of this.seg) {
        if (S.t1 <= x) continue; if (S.t0 >= y) break;
        const p = S.t0 > x ? S.t0 : x, q = S.t1 < y ? S.t1 : y;
        if (!(S.tau > 0)) s += S.g * (q - p);
        else s += S.g * (q - p) + (S.B0 - S.g) * S.tau * (Math.exp(-(p - S.t0) / S.tau) - Math.exp(-(q - S.t0) / S.tau));
      }
      return s;
    }
    // brillo instantáneo (para validar la integral)
    valor(t) {
      if (this.tipo === 'led') {
        for (const [a, c] of this.tramos) if (t >= a && t < c) {
          if (!this.pwm) return 1;
          const P = this.pwm, u = t * P.f + P.ph; return (u - Math.floor(u)) < P.d ? 1 : 0;
        }
        return 0;
      }
      for (const S of this.seg) if (t >= S.t0 && t < S.t1) return S.tau > 0 ? S.g + (S.B0 - S.g) * Math.exp(-(t - S.t0) / S.tau) : S.g;
      return 0;
    }
  }

  // ------------------------------------------------------------ opciones
  const COLOR = { ambar: [1, 0.55, 0.05], verde: [0.05, 1, 0.55], roja: [1, 0.04, 0.03], stage: [1, 0.82, 0.4], blanco: [1, 1, 1] };
  const FOCOS = ['pre', 'stg', 'a1', 'a2', 'a3', 'g', 'r'];
  const LADOS = ['izq', 'der'];
  const CLASE = { pre: 'stage', stg: 'stage', a1: 'ambar', a2: 'ambar', a3: 'ambar', g: 'verde', r: 'roja' };
  const NOMINAL = { pro: 0.400, full: 0.500 };
  const PERFECTA = { pro: 0.400, full: 0.500 };

  const DEF_ESCENA = {
    tipo: 'pro', carril: 'izq', w: 160, h: 256, rot: 0, centro: null,
    paso_px: 14, r_px: 5, r_stage_px: 2.5, sep_col_px: 30,
    pos_focos: { pre: -2.2, stg: -1.4, a1: 0, a2: 1, a3: 2, g: 3, r: 4 },   // en pasos, hacia "abajo" del árbol
    // tiempos (s, reloj de performance.now): ver resolverTiempos
    t_ambar_ref: NaN, delta_s: NaN, paso_full_s: 0.5, t_verde: NaN, rt_s: NaN,
    t_stage_on: NaN, t_stage_off: NaN, t_pre_on: NaN, t_pre_off: NaN, stage_se_apaga: true,
    ambar_se_apaga: true, roja: null, reset_s: Infinity, previas: [], stage_doble: false,
    otro: { desfase_s: 0, presente: true, rt_s: NaN, roja: null },
    // luz
    lampara: { tipo: 'led', tr_s: 0 }, pwm: null, E_s: 0.0003, E_T: NaN, R_s: 0, fps: 60,
    nivel_fondo: 0.18, contraste: 3, halo: { k: 0.22, w: 1.3 },
    ganancia: { deriva: 0.004, salto_t: null, salto: 0.7 }, ruido: 0.02,
    fondo: 'textura', horizonte_pasos: 1.6, sol: null, flicker: null, distractores: [],
    // movimiento
    vibracion: { amp_px: 2, f_hz: 31, ax_rel: 0.6 },
    cabeceo: { t0: NaN, amp_px: 40, amp_deg: NaN, dur_s: 0.2, eje: 'auto', osc: 0.15, f_osc_hz: 2.2, amort_s: 0.3 },
    desenfoque: true, f_px_rad: 1000,
    giro_ejes: { x: { eje: 'g', signo: 1 }, y: { eje: 'b', signo: -1 } },
    // recorte dentro del cuadro original (para el rolling shutter y la vista general); por omisión el recorte
    // está centrado en un cuadro de 1280×720, como el que graba DragCam.Lector
    zona: null, orig: [1280, 720], escala: 1,
    seed: 1,
  };
  const DEF_SOL = { contraste: 0.3, fantasma: true, fantasma_nivel: 0.7, velo: 0.4, alcance_px: 150, r_px: 9, pos: null };
  const DEF_SIM = {
    fps: 60, t_inicio: NaN, t_fin: NaN, perdidos: 0.02, perdidos_cam: 0, jitter_ms: 4, atascos_ms: [20, 40],
    atascos_prob: 0.01, proc_ms: 1.5, vsync_hz: 0, lat_cam_s: 0.045, cap_desfase_s: 0, fuente_t: 'cap', nf: true,
    fps_ppm: NaN, giro_hz: 60, lat_imu_s: 0.010, giro_ruido_dps: 0.3, giro_jitter_ms: 0.3, giro_sesgo_dps: 0.2,
    vista: null, capacidad: 0, mem_mb: NaN, fmt: 'yuv420', anillo: true,
  };
  const OBJS = ['pos_focos', 'otro', 'lampara', 'halo', 'ganancia', 'vibracion', 'cabeceo', 'giro_ejes', 'pwm', 'flicker'];
  function copiar(x) {
    if (Array.isArray(x)) return x.map(copiar);
    if (esObj(x) && !ArrayBuffer.isView(x)) { const o = {}; for (const k of Object.keys(x)) o[k] = copiar(x[k]); return o; }
    return x;
  }
  function opciones(opts) {
    opts = opts || {};
    const o = copiar(DEF_ESCENA);
    for (const k of Object.keys(opts)) {
      const v = opts[k];
      if (v === undefined) continue;
      if (OBJS.includes(k)) {
        if (v === null || v === false) o[k] = null;
        else if (esObj(v)) o[k] = Object.assign(o[k] ? o[k] : {}, copiar(v));
        else o[k] = v;
      } else o[k] = copiar(v);
    }
    if (o.sol === true) o.sol = {};
    if (esObj(o.sol)) o.sol = Object.assign(copiar(DEF_SOL), o.sol); else o.sol = null;
    if (o.tipo !== 'full') o.tipo = 'pro';
    if (o.carril !== 'der') o.carril = 'izq';
    o.w = Math.max(4, (o.w | 0) & ~1); o.h = Math.max(4, (o.h | 0) & ~1);
    o.seed = (fin(o.seed, 1) >>> 0);
    return o;
  }

  // ------------------------------------------------------------ tiempos del árbol
  // Lo que falte se completa: t_ambar_ref ← t_verde − Δ ← t_stage_off − rt − Δ (o 5 s); rt por omisión 0.35 s
  function resolverTiempos(o) {
    const tipo = o.tipo, delta = fin(o.delta_s, NOMINAL[tipo]), pf = fin(o.paso_full_s, 0.5);
    let tref = o.t_ambar_ref;
    if (!isFin(tref)) {
      if (isFin(o.t_verde)) tref = o.t_verde - delta;
      else if (isFin(o.t_stage_off) && isFin(o.rt_s)) tref = o.t_stage_off - o.rt_s - delta;
      else if (isFin(o.t_stage_off)) tref = o.t_stage_off - 0.35 - delta;
      else tref = 5.0;
    }
    const tv = tref + delta;
    const tA = tipo === 'full' ? [tref - 2 * pf, tref - pf, tref] : [tref, tref, tref];
    let tso = o.t_stage_off;
    if (!isFin(tso)) tso = tv + fin(o.rt_s, 0.35);
    const rt = tso - tv;
    const tson = fin(o.t_stage_on, tA[0] - 1.6), tpon = fin(o.t_pre_on, tson - 1.2), tpof = fin(o.t_pre_off, tso - 0.10);
    // roja: {t} explícita; {truestart:true} → a la hora de la verde; true/'auto' o rt < 0 (si no es false) → al salir
    let troja = NaN, R = o.roja;
    if (esObj(R) && isFin(R.t)) troja = R.t;
    else if (esObj(R) && R.truestart) troja = tv;
    else if (R === true || R === 'auto' || (R !== false && rt < 0)) troja = R && R.truestart ? tv : tso;
    const verdeVisible = !isFin(troja) || !!(esObj(R) && R.verde);
    return { tipo, delta, paso_full: pf, t_ref: tref, t_verde: tv, t_ambar: tA, t_stage_on: tson, t_stage_off: tso,
             t_pre_on: tpon, t_pre_off: tpof, rt, t_roja: troja, verde_visible: verdeVisible,
             fin: tv + fin(o.reset_s, Infinity), stage_se_apaga: o.stage_se_apaga !== false, ambar_se_apaga: o.ambar_se_apaga !== false };
  }
  // tramos encendidos de cada foco de una columna para una secuencia
  function tramosSecuencia(S) {
    const F = S.fin, tA = S.t_ambar, tv = S.t_verde, T = {};
    for (const f of FOCOS) T[f] = [];
    if (S.ambar_se_apaga) {
      const off = S.tipo === 'full' ? [tA[1], tA[2], tv] : [tv, tv, tv];
      for (let i = 0; i < 3; i++) T['a' + (i + 1)].push([tA[i], Math.min(off[i], F)]);
    } else for (let i = 0; i < 3; i++) T['a' + (i + 1)].push([tA[i], F]);
    if (S.verde_visible) T.g.push([tv, F]);
    if (isFin(S.t_roja)) T.r.push([S.t_roja, F]);
    if (isFin(S.t_stage_on)) T.stg.push([S.t_stage_on, S.stage_se_apaga ? Math.min(S.t_stage_off, F) : F]);
    if (isFin(S.t_pre_on)) T.pre.push([S.t_pre_on, Math.min(fin(S.t_pre_off, F), F)]);
    return T;
  }

  // ------------------------------------------------------------ escena
  function escena(opts) {
    const o = opciones(opts);
    // un flujo de azar por componente: cambiar una opción no mueve el azar de las demás
    const rnd = mulberry32(mezcla(o.seed, 11)), rndV = mulberry32(mezcla(o.seed, 12)), rndG = mulberry32(mezcla(o.seed, 13)), rndF = mulberry32(mezcla(o.seed, 14));
    const w = o.w, h = o.h, paso = o.paso_px, r = o.r_px, rs = o.r_stage_px, sep = o.sep_col_px;
    const centro = Array.isArray(o.centro) && o.centro.length >= 2 ? [o.centro[0], o.centro[1]] : [(w - 1) / 2, (h - 1) / 2];
    const ang = fin(o.rot, 0) * Math.PI / 180, cs = Math.cos(ang), sn = Math.sin(ang);
    // escena (marco del árbol derecho: x = derecha del mundo, y = abajo) → imagen, y al revés
    const aImg = (qx, qy) => [centro[0] + cs * qx - sn * qy, centro[1] + sn * qx + cs * qy];
    const aEsc = (X, Y) => { const dx = X - centro[0], dy = Y - centro[1]; return [cs * dx + sn * dy, -sn * dx + cs * dy]; };
    // recorte dentro del original
    const esc = fin(o.escala, 1) > 0 ? fin(o.escala, 1) : 1;
    const orig = Array.isArray(o.orig) && o.orig.length >= 2 ? [Math.max(o.orig[0], w / esc), Math.max(o.orig[1], h / esc)] : [w / esc, h / esc];
    const zona = Array.isArray(o.zona) && o.zona.length >= 4 ? o.zona.slice(0, 4)
      : [(orig[0] - w / esc) / 2, (orig[1] - h / esc) / 2, w / esc, h / esc];
    const T = 1 / fin(o.fps, 60);
    const E_s = Math.min(isFin(o.E_T) ? o.E_T * T : fin(o.E_s, 0.0003), 0.98 * T);
    const R_s = Math.max(0, fin(o.R_s, 0));
    // retraso de la fila (y en px de escena) respecto al centro de exposición del cuadro
    const dtFila = (y) => { if (!R_s) return 0; const Yo = zona[1] + (y + 0.5) / esc - 0.5; return R_s * (Yo - (orig[1] - 1) / 2) / orig[1]; };

    const E = {
      v: VERSION, w, h, tipo: o.tipo, carril: o.carril, rot: fin(o.rot, 0), centro, paso_px: paso, r_px: r, r_stage_px: rs,
      sep_col_px: sep, E: E_s, R_s, fps: 1 / T, nf: o.nivel_fondo, ruido: Math.max(0, fin(o.ruido, 0)), zona, orig, escala: esc,
      desenfoque: o.desenfoque !== false, halo: o.halo || { k: 0, w: 1 }, f_px_rad: fin(o.f_px_rad, 1000),
      giro_ejes: o.giro_ejes || copiar(DEF_ESCENA.giro_ejes), seed: o.seed, opts: o,
      seed_ruido: mezcla(o.seed, 22), seed_tex: mezcla(o.seed, 33) | 0,
      aImg, aEsc, dtFila, lamparas: [],
    };
    Object.defineProperty(E, '_c', { value: {}, enumerable: false, writable: true });

    // --- secuencias
    const S = resolverTiempos(o);
    const otroP = o.otro && o.otro.presente !== false;
    const otroActivo = otroP && o.otro.desfase_s !== null && isFin(fin(o.otro.desfase_s, 0));
    let So = null;
    if (otroActivo) {
      const d = fin(o.otro.desfase_s, 0);
      const rtO = fin(o.otro.rt_s, 0.2 + 0.3 * rnd());
      const oo = { tipo: o.tipo, delta_s: S.delta, paso_full_s: S.paso_full, t_ambar_ref: S.t_ref + d,
        t_stage_on: Math.min(S.t_stage_on, S.t_ambar[0] + d - 0.6) - 0.2 - 0.6 * rnd(), rt_s: rtO, roja: o.otro.roja === undefined ? null : o.otro.roja,
        ambar_se_apaga: S.ambar_se_apaga, reset_s: o.reset_s, stage_se_apaga: S.stage_se_apaga };
      oo.t_stage_off = oo.t_ambar_ref + S.delta + rtO;
      So = resolverTiempos(Object.assign({}, DEF_ESCENA, oo));
    }
    const otroLado = o.carril === 'izq' ? 'der' : 'izq';
    const tramos = { izq: {}, der: {} };
    for (const l of LADOS) for (const f of FOCOS) tramos[l][f] = [];
    const suma = (lado, T2) => { for (const f of FOCOS) for (const x of T2[f]) tramos[lado][f].push(x); };
    suma(o.carril, tramosSecuencia(S));
    if (So) suma(otroLado, tramosSecuencia(So));
    // secuencias previas (otra pareja de autos): las dos columnas, se apagan 2.5 s después de la verde
    const previas = [];
    for (const p of o.previas || []) {
      const pp = typeof p === 'number' ? { t_ambar_ref: p } : (esObj(p) ? p : null);
      if (!pp || !isFin(pp.t_ambar_ref)) continue;
      const base = { tipo: pp.tipo || o.tipo, t_ambar_ref: pp.t_ambar_ref, delta_s: fin(pp.delta_s, S.delta), paso_full_s: S.paso_full,
        rt_s: fin(pp.rt_s, 0.3), reset_s: 2.5, roja: false, ambar_se_apaga: S.ambar_se_apaga };
      const Sp = resolverTiempos(Object.assign({}, DEF_ESCENA, base));
      previas.push(Sp);
      suma(o.carril, tramosSecuencia(Sp));
      if (otroP) suma(otroLado, tramosSecuencia(resolverTiempos(Object.assign({}, DEF_ESCENA, base, { rt_s: fin(pp.rt_s_otro, 0.4) }))));
    }

    // --- geometría de los focos
    const pf = Object.assign({}, DEF_ESCENA.pos_focos, o.pos_focos || {});
    let ymin = Infinity, ymax = -Infinity; for (const f of FOCOS) { ymin = Math.min(ymin, pf[f]); ymax = Math.max(ymax, pf[f]); }
    const ymid = (ymin + ymax) / 2;
    const presentes = otroP ? LADOS : [o.carril];
    const lamCfg = (clase) => { const L = o.lampara || {}; return esObj(L[clase]) ? L[clase] : L; };
    const prwm = mulberry32(mezcla(o.seed, 44));
    const focosQ = { izq: {}, der: {} }, focosImg = { izq: {}, der: {} };
    for (const lado of LADOS) for (const f of FOCOS) {
      const qx = (lado === 'izq' ? -1 : 1) * sep / 2, qy = (pf[f] - ymid) * paso, rr = (f === 'pre' || f === 'stg') ? rs : r;
      focosQ[lado][f] = { qx, qy, r: rr };
      const [x, y] = aImg(qx, qy);
      focosImg[lado][f] = { x, y, r: rr, dt_fila_s: dtFila(y) };
    }
    // amplitud de las lámparas (lineal, canal máximo, a ganancia 1)
    const sol = o.sol;
    const lenteOff = (col) => [0, 1, 2].map((c) => E.nf * (0.06 * col[c] + 0.02) + (sol && sol.fantasma ? (sol.fantasma === true ? sol.fantasma_nivel : +sol.fantasma || 0) * E.nf * col[c] : 0));
    let solQ = null;
    if (sol) {
      solQ = Array.isArray(sol.pos) ? aEsc(sol.pos[0], sol.pos[1]) : [2.2 * sep, (ymin - ymid - 2.3) * paso];
      E.sol = { q: solQ, img: aImg(solQ[0], solQ[1]), r: sol.r_px, velo: sol.velo, alcance: sol.alcance_px };
    }
    const veloEn = (qx, qy) => (sol ? sol.velo * E.nf * (0.25 + Math.exp(-Math.hypot(qx - solQ[0], qy - solQ[1]) / sol.alcance_px)) : 0);
    E.amp_base = sol ? sol.contraste * (Math.max(...lenteOff(COLOR.ambar)) + veloEn(0, 0)) : fin(o.contraste, 3) * E.nf;
    // PWM: {f_hz, duty, fase_comun, fase, clases:['ambar','verde','roja','stage']} (por omisión todas las LED del árbol)
    const pwmDe = (P, cl) => (P && P.f_hz > 0 && (!Array.isArray(P.clases) || P.clases.includes(cl))
      ? { f_hz: P.f_hz, duty: fin(P.duty, 0.5), fase: P.fase_comun ? fin(P.fase, 0) : prwm() } : null);
    for (const lado of presentes) for (const f of FOCOS) {
      const F = focosImg[lado][f], cl = CLASE[f], lc = lamCfg(cl);
      const L = new Lampara(tramos[lado][f], { tipo: lc.tipo, tr_s: lc.tr_s, tf_s: lc.tf_s, pwm: lc.tipo === 'inc' ? null : pwmDe(o.pwm, cl) });
      const sub = (o.stage_doble && (f === 'pre' || f === 'stg')) ? [[-1.25 * rs, 0], [1.25 * rs, 0]].map(([a, b]) => [cs * a - sn * b, sn * a + cs * b]) : [[0, 0]];
      E.lamparas.push({ id: lado + '.' + f, lado, foco: f, x: F.x, y: F.y, r: F.r, col: COLOR[cl], amp: E.amp_base, L, sub, vel: null, t_ref: 0, gauss: false });
    }

    // --- distractores
    const tDis = [S.t_ambar[0] - 6, S.t_stage_off + 3];
    const toggles = (r0, onR, offR, empiezaOn) => {
      const out = []; let t = tDis[0] - r0() * 2, on = empiezaOn;
      while (t < tDis[1]) { const d = on ? onR[0] + (onR[1] - onR[0]) * r0() : offR[0] + (offR[1] - offR[0]) * r0(); if (on) out.push([t, t + d]); t += d; on = !on; }
      return out;
    };
    (o.distractores || []).forEach((d, i) => {
      if (!d) return;
      const tipo = d.tipo || 'reflejo', rd = mulberry32(mezcla(o.seed, 100 + i));
      const defPos = { freno: [-2.3 * sep, (ymax - ymid + 0.6) * paso], intermitente: [2.3 * sep, (ymax - ymid + 0.2) * paso], reflejo: [-1.9 * sep, (ymin - ymid - 0.4) * paso] }[tipo] || [0, 0];
      const pos = Array.isArray(d.pos) ? d.pos : aImg(defPos[0] + 6 * i * (tipo === 'reflejo' ? 1 : 0), defPos[1] + 2 * paso * Math.floor(i / 3));
      const amp = fin(d.amp, tipo === 'reflejo' ? 1.5 : 1) * E.amp_base;
      if (tipo === 'freno') {
        const rr = fin(d.r_px, 0.7 * r), sp = fin(d.sep_px, 5 * rr);
        const tr = d.tramos || toggles(rd, [0.4, 2.0], [0.3, 1.5], rd() < 0.5);
        const L = new Lampara(tr, d.lampara || { tipo: 'inc', tr_s: 0.03 });
        E.lamparas.push({ id: 'freno' + i, lado: null, foco: 'freno', x: pos[0], y: pos[1], r: rr, col: d.color || COLOR.roja, amp, L,
          sub: [[-sp / 2 * cs, -sp / 2 * sn], [sp / 2 * cs, sp / 2 * sn]], vel: null, t_ref: 0, gauss: false });
      } else if (tipo === 'intermitente') {
        const per = fin(d.periodo_s, 0.7), du = fin(d.duty, 0.5), ph = fin(d.fase_s, rd() * per), tr = [];
        for (let t = tDis[0] - per + ph; t < tDis[1]; t += per) tr.push([t, t + du * per]);
        const L = new Lampara(d.tramos || tr, d.lampara || { tipo: 'inc', tr_s: 0.02 });
        E.lamparas.push({ id: 'intermitente' + i, lado: null, foco: 'intermitente', x: pos[0], y: pos[1], r: fin(d.r_px, 0.8 * r), col: d.color || COLOR.ambar, amp, L,
          sub: [[0, 0]], vel: null, t_ref: 0, gauss: false });
      } else {
        const tr = d.tramos || toggles(rd, [0.5, 3.0], [0.4, 2.0], rd() < 0.6);
        const ve = Array.isArray(d.vel) ? d.vel : [(rd() - 0.5) * 30, (rd() - 0.5) * 12];
        const L = new Lampara(tr, d.lampara || { tipo: 'inc', tr_s: 0.12 });
        E.lamparas.push({ id: 'reflejo' + i, lado: null, foco: 'reflejo', x: pos[0], y: pos[1], r: fin(d.r_px, 3), col: d.color || COLOR.blanco, amp, L,
          sub: [[0, 0]], vel: ve, t_ref: fin(d.t_ref, S.t_ref), gauss: true });
      }
    });

    // --- movimiento: vibración + cabeceo (el mismo d(t) para imagen y giroscopio)
    const V = o.vibracion && fin(o.vibracion.amp_px, 0) > 0 ? {
      ay: o.vibracion.amp_px, ax: o.vibracion.amp_px * fin(o.vibracion.ax_rel, 0.6),
      wy: DOS_PI * fin(o.vibracion.f_hz, 31), wx: DOS_PI * fin(o.vibracion.f_hz, 31) * 1.07, py: DOS_PI * rndV(), px: DOS_PI * rndV(),
    } : null;
    let CB = null;
    if (o.cabeceo) {
      const c = o.cabeceo, amp = isFin(c.amp_deg) ? c.amp_deg * Math.PI / 180 * E.f_px_rad : fin(c.amp_px, 40);
      const abajo = [-sn, cs];
      const dir = c.eje === 'x' ? [1, 0] : c.eje === 'y' ? [0, 1] : abajo;
      if (amp) CB = { t0: fin(c.t0, S.t_stage_off - 0.15), dur: Math.max(1e-3, fin(c.dur_s, 0.2)), amp, dx: dir[0] * amp, dy: dir[1] * amp,
        osc: fin(c.osc, 0.15), fo: fin(c.f_osc_hz, 2.2), tau: Math.max(1e-3, fin(c.amort_s, 0.3)), dir };
    }
    // forma normalizada del cabeceo (0 → 1, con un rebote amortiguado) y su derivada
    const forma = (t, d) => {
      if (t <= CB.t0) { d[0] = 0; d[1] = 0; return d; }
      const x = (t - CB.t0) / CB.dur;
      if (x < 1) { d[0] = 0.5 - 0.5 * Math.cos(Math.PI * x); d[1] = 0.5 * Math.PI * Math.sin(Math.PI * x) / CB.dur; return d; }
      const u = t - CB.t0 - CB.dur, e = Math.exp(-u / CB.tau), c2 = 0.5 * (1 - Math.cos(DOS_PI * CB.fo * u));
      d[0] = 1 + CB.osc * c2 * e; d[1] = CB.osc * e * (Math.PI * CB.fo * Math.sin(DOS_PI * CB.fo * u) - c2 / CB.tau); return d;
    };
    const fq = [0, 0];
    E.desp = function (t, out) {
      let dx = 0, dy = 0;
      if (V) { dx += V.ax * Math.sin(V.wx * t + V.px); dy += V.ay * Math.sin(V.wy * t + V.py); }
      if (CB) { forma(t, fq); dx += CB.dx * fq[0]; dy += CB.dy * fq[0]; }
      out[0] = dx; out[1] = dy; return out;
    };
    E.vel = function (t, out) {
      let vx = 0, vy = 0;
      if (V) { vx += V.ax * V.wx * Math.cos(V.wx * t + V.px); vy += V.ay * V.wy * Math.cos(V.wy * t + V.py); }
      if (CB) { forma(t, fq); vx += CB.dx * fq[1]; vy += CB.dy * fq[1]; }
      out[0] = vx; out[1] = vy; return out;
    };
    E.desp_max = (CB ? Math.abs(CB.amp) * (1 + Math.abs(CB.osc)) : 0) + (V ? Math.hypot(V.ax, V.ay) : 0) + 1;
    E.vib = V; E.cab = CB;

    // --- autoexposición: deriva suave (suma de senos con espectro de caminata) y salto opcional
    const Gc = o.ganancia || {}, J = 8, GA = [], GW = [], GP = [];
    const der = Math.max(0, fin(Gc.deriva, 0)), dt0 = 1 / 60, cg = der / Math.sqrt(J);
    for (let j = 0; j < J; j++) { const f = 0.2 * Math.pow(25, j / (J - 1)); GW.push(DOS_PI * f); GA.push(cg * Math.SQRT2 / (DOS_PI * f * dt0)); GP.push(DOS_PI * rndG()); }
    const saltoT = Gc.salto_t === null || Gc.salto_t === undefined ? NaN : +Gc.salto_t, salto = fin(Gc.salto, 0.7);
    E.ganancia = function (t) {
      let s = 0;
      if (der > 0) for (let j = 0; j < J; j++) s += GA[j] * Math.sin(GW[j] * t + GP[j]);
      let g = Math.exp(s);
      if (isFin(saltoT) && t >= saltoT) g *= salto;
      return g;
    };
    // parpadeo de luces de la pista (solo el fondo): factor medio sobre [a, b]
    const FL = o.flicker && o.flicker.f_hz > 0 ? { w: DOS_PI * o.flicker.f_hz, p: fin(o.flicker.prof, 0.1), ph: DOS_PI * rndF() } : null;
    E.flickerMedio = FL ? (a, b) => 1 + FL.p * (Math.cos(FL.w * a + FL.ph) - Math.cos(FL.w * b + FL.ph)) / (FL.w * (b - a)) : null;

    // --- fondo (formas en el marco del árbol)
    const hz = (ymax - ymid + fin(o.horizonte_pasos, 1.6)) * paso;   // horizonte: 1.6 pasos bajo la roja
    const formas = [];
    const xs = presentes.map((l) => focosQ[l].a1.qx);
    const xl = Math.min(...xs), xr = Math.max(...xs);
    const topQ = (pf.pre - ymid) * paso - Math.max(1.6 * rs, 0.6 * paso), botQ = (ymax - ymid) * paso + 0.75 * paso;
    if (o.fondo !== 'negro' && o.fondo !== 'liso') {
      // extensión: el cuadro original completo, en el marco del árbol
      const cor = [[-0.5, -0.5], [orig[0] - 0.5, -0.5], [-0.5, orig[1] - 0.5], [orig[0] - 0.5, orig[1] - 0.5]].map(([Xo, Yo]) => aEsc((Xo + 0.5 - zona[0]) * esc - 0.5, (Yo + 0.5 - zona[1]) * esc - 0.5));
      const mg = E.desp_max + 2 * paso;
      const ex = [Math.min(...cor.map((c) => c[0])) - mg, Math.min(...cor.map((c) => c[1])) - mg, Math.max(...cor.map((c) => c[0])) + mg, Math.max(...cor.map((c) => c[1])) + mg];
      const area = (ex[2] - ex[0]) * (ex[3] - ex[1]), nb = clamp(Math.round(area / 5000), 10, 90), rb = mulberry32(mezcla(o.seed, 55));
      for (let i = 0; i < nb; i++) {
        const poste = rb() < 0.25, cx = ex[0] + (ex[2] - ex[0]) * rb();
        let bw, bh, cy;
        if (poste) { bw = 2 + 3 * rb(); bh = 40 + 120 * rb(); cy = hz - bh / 2; }
        else { bw = 6 + 44 * rb(); bh = 6 + 34 * rb(); cy = rb() < 0.65 ? hz - 4 * paso * rb() : ex[1] + (ex[3] - ex[1]) * rb(); }
        const lv = E.nf * (0.3 + 1.2 * rb()), ti = [0.9 + 0.2 * rb(), 0.9 + 0.2 * rb(), 0.9 + 0.2 * rb()];
        formas.push({ k: 'rect', q: [cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2], col: ti.map((x) => x * lv), a: 0.12 });
      }
    }
    if (o.fondo !== 'negro') {
      formas.push({ k: 'rect', q: [(xl + xr) / 2 - Math.max(2, 0.12 * sep), botQ - 1, (xl + xr) / 2 + Math.max(2, 0.12 * sep), hz + 40 * paso], col: [0.35, 0.35, 0.36].map((x) => x * E.nf), a: 0.15 });
      formas.push({ k: 'rect', q: [xl - 1.5 * r, topQ, xr + 1.5 * r, botQ], col: [0.07, 0.07, 0.075].map((x) => x * E.nf), a: 0.3 });
    }
    // lentes apagadas (después de la textura)
    const lentes = [];
    if (o.fondo !== 'negro') for (const lado of presentes) for (const f of FOCOS) {
      const F = focosQ[lado][f], col = lenteOff(COLOR[CLASE[f]]);
      if (o.stage_doble && (f === 'pre' || f === 'stg')) { lentes.push({ k: 'disco', q: [F.qx - 1.25 * rs, F.qy, F.r], col }); lentes.push({ k: 'disco', q: [F.qx + 1.25 * rs, F.qy, F.r], col }); }
      else lentes.push({ k: 'disco', q: [F.qx, F.qy, F.r], col });
    }
    E._fondo = { tipo: o.fondo, hz, formas, lentes, veloEn, solQ };

    // --- verdad (sin lo que depende de la entrega de cuadros)
    const abajo = [-sn, cs], derecha = [cs, sn];
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const l of presentes) for (const f of FOCOS) { const F = focosImg[l][f]; bx0 = Math.min(bx0, F.x - F.r); by0 = Math.min(by0, F.y - F.r); bx1 = Math.max(bx1, F.x + F.r); by1 = Math.max(by1, F.y + F.r); }
    const focosV = { izq: null, der: null };
    for (const l of presentes) focosV[l] = copiar(focosImg[l]);
    const resumenS = (Sx) => Sx ? { tipo: Sx.tipo, t_ambar: Sx.t_ambar.slice(), t_ambar_ref: Sx.t_ref, t_verde: Sx.t_verde, verde_visible: Sx.verde_visible,
      t_roja: Sx.t_roja, t_stage_on: Sx.t_stage_on, t_stage_off: Sx.t_stage_off, t_pre_on: Sx.t_pre_on, t_pre_off: Sx.t_pre_off, delta_s: Sx.delta, rt_s: Sx.rt } : null;
    E.verdad = Object.assign(resumenS(S), {
      carril: o.carril, roja: isFin(S.t_roja), rt_boleta_s: S.t_stage_off - S.t_ref, perfecta: PERFECTA[o.tipo], hora_quieto: S.t_stage_on,
      stage_se_apaga: S.stage_se_apaga, ambar_se_apaga: S.ambar_se_apaga,
      otro: otroP ? Object.assign({ presente: true, activo: !!So, desfase_s: So ? fin(o.otro.desfase_s, 0) : null }, resumenS(So) || {}) : { presente: false, activo: false },
      previas: previas.map(resumenS),
      disp: { carril: o.carril, abajo, derecha, paso_px: paso, r_px: r, r_stage_px: rs, sep_col_px: sep, rot: E.rot, centro: centro.slice(),
              caja: [bx0, by0, bx1 - bx0, by1 - by0], focos: focosV, stage_doble: !!o.stage_doble },
      lampara: copiar(o.lampara), pwm: copiar(o.pwm), E_s, R_s, fps: 1 / T,
      cabeceo: CB ? { t0: CB.t0, dur_s: CB.dur, amp_px: CB.amp, dir: CB.dir.slice(), amp_rad: CB.amp / E.f_px_rad } : null,
      f_px_rad: E.f_px_rad,
    });
    return E;
  }

  // ------------------------------------------------------------ fondo pintado (una vez por vista)
  function pintarForma(B, A, BW, BH, vp, M, E, F) {
    const s = vp.s, SS = clamp(Math.ceil(3 / s), 3, 8), inv = 1 / SS;
    const aBit = (qx, qy) => { const [X, Y] = E.aImg(qx, qy); return [(X - vp.x0) * s + M, (Y - vp.y0) * s + M]; };
    let pts;
    if (F.k === 'rect') { const q = F.q; pts = [aBit(q[0], q[1]), aBit(q[2], q[1]), aBit(q[0], q[3]), aBit(q[2], q[3])]; }
    else { const [cx, cy, rr] = F.q, c = aBit(cx, cy), rp = rr * s; pts = [[c[0] - rp, c[1] - rp], [c[0] + rp, c[1] + rp]]; }
    const i0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0]))) - 1), i1 = Math.min(BW - 1, Math.ceil(Math.max(...pts.map((p) => p[0]))) + 1);
    const j0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1]))) - 1), j1 = Math.min(BH - 1, Math.ceil(Math.max(...pts.map((p) => p[1]))) + 1);
    const col = F.col;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      let cov = 0;
      for (let u = 0; u < SS; u++) for (let v = 0; v < SS; v++) {
        const X = vp.x0 + (i - M + (u + 0.5) * inv - 0.5) / s, Y = vp.y0 + (j - M + (v + 0.5) * inv - 0.5) / s;
        const [qx, qy] = E.aEsc(X, Y);
        if (F.k === 'rect') { if (qx >= F.q[0] && qx < F.q[2] && qy >= F.q[1] && qy < F.q[3]) cov++; }
        else { const dx = qx - F.q[0], dy = qy - F.q[1]; if (dx * dx + dy * dy <= F.q[2] * F.q[2]) cov++; }
      }
      if (!cov) continue;
      cov /= SS * SS;
      const p = (j * BW + i) * 3;
      B[p] += (col[0] - B[p]) * cov; B[p + 1] += (col[1] - B[p + 1]) * cov; B[p + 2] += (col[2] - B[p + 2]) * cov;
      if (A && F.a !== undefined) A[j * BW + i] += (F.a - A[j * BW + i]) * cov;
    }
  }
  function generarFondo(E, vp, M) {
    const BW = vp.w + 2 * M, BH = vp.h + 2 * M, n = BW * BH;
    const B = new Float32Array(n * 3), A = new Float32Array(n), Fd = E._fondo, nf = E.nf, fp = 1 / vp.s, hz = Fd.hz;
    const tipo = Fd.tipo;
    if (tipo !== 'negro') {
      for (let j = 0; j < BH; j++) for (let i = 0; i < BW; i++) {
        const p = j * BW + i, X = vp.x0 + (i - M) / vp.s, Y = vp.y0 + (j - M) / vp.s;
        if (tipo === 'liso') { B[3 * p] = B[3 * p + 1] = B[3 * p + 2] = nf; continue; }
        const [qx, qy] = E.aEsc(X, Y);
        let L, t0, t1, t2, a;
        if (qy < hz - 0.9 * E.paso_px) {          // cielo
          L = nf * (1.45 - 0.35 * clamp((hz - qy) / (3 * E.h), 0, 1)) * (1 + 0.08 * vruido(qx / 180, qy / 90, E.seed_tex + 7));
          t0 = 0.85; t1 = 0.95; t2 = 1.12; a = 0.05;
        } else if (qy < hz) {                     // barda con anuncios (textura en x)
          const fa = clamp(1 - fp / 6, 0, 1);
          L = nf * 0.85 * (1 + 0.35 * fa * Math.tanh(3 * Math.sin(qx * DOS_PI / 18)));
          t0 = 1.0; t1 = 0.98; t2 = 0.95; a = 0.18;
        } else {                                  // pista / pasto
          L = nf * 0.6 * (1 - 0.15 * clamp((qy - hz) / (2 * E.h), 0, 1));
          t0 = 1.0; t1 = 0.96; t2 = 0.88; a = 0.25;
        }
        B[3 * p] = L * t0; B[3 * p + 1] = L * t1; B[3 * p + 2] = L * t2; A[p] = a;
      }
      for (const F of Fd.formas) pintarForma(B, A, BW, BH, vp, M, E, F);
      if (tipo !== 'liso') {
        for (let j = 0; j < BH; j++) for (let i = 0; i < BW; i++) {
          const p = j * BW + i; if (!(A[p] > 0)) continue;
          const [qx, qy] = E.aEsc(vp.x0 + (i - M) / vp.s, vp.y0 + (j - M) / vp.s);
          const m = Math.max(0.05, 1 + A[p] * fbm(qx, qy, fp, E.seed_tex));
          B[3 * p] *= m; B[3 * p + 1] *= m; B[3 * p + 2] *= m;
        }
      }
      for (const F of Fd.lentes) pintarForma(B, null, BW, BH, vp, M, E, F);
      if (E.sol) {   // sol (quemado) + velo de la lente
        pintarForma(B, null, BW, BH, vp, M, E, { k: 'disco', q: [E.sol.q[0], E.sol.q[1], E.sol.r], col: [40 * nf, 39 * nf, 36 * nf] });
        for (let j = 0; j < BH; j++) for (let i = 0; i < BW; i++) {
          const [qx, qy] = E.aEsc(vp.x0 + (i - M) / vp.s, vp.y0 + (j - M) / vp.s), g = Fd.veloEn(qx, qy), p = 3 * (j * BW + i);
          B[p] += g; B[p + 1] += 0.97 * g; B[p + 2] += 0.9 * g;
        }
      }
    }
    return { B, BW, BH };
  }

  // ------------------------------------------------------------ caché por vista (recorte o vista general)
  function vistaRecorte(E) { return { key: 'r', x0: 0, y0: 0, s: 1, w: E.w, h: E.h }; }
  function vistaGeneral(E, vw, vh) {
    vw = Math.max(2, (vw | 0) & ~1); vh = Math.max(2, (vh | 0) & ~1);
    // escala uniforme (la del ancho); el centro de la vista cae en el centro del cuadro original
    const W = E.orig[0], H = E.orig[1], es = E.escala, k = W / vw * es;   // px de escena por px de la vista
    const xc = ((W - 1) / 2 + 0.5 - E.zona[0]) * es - 0.5, yc = ((H - 1) / 2 + 0.5 - E.zona[1]) * es - 0.5;
    return { key: 'v' + vw + 'x' + vh, x0: xc - (vw - 1) / 2 * k, y0: yc - (vh - 1) / 2 * k, s: 1 / k, w: vw, h: vh };
  }
  function cacheDe(E, vp) {
    let C = E._c[vp.key];
    if (C) return C;
    const M = Math.ceil(E.desp_max * vp.s) + 3;
    const F = generarFondo(E, vp, M);
    const dtf = new Float64Array(vp.h);
    let mn = Infinity, mx = -Infinity;
    for (let j = 0; j < vp.h; j++) { dtf[j] = E.dtFila(vp.y0 + j / vp.s); mn = Math.min(mn, dtf[j]); mx = Math.max(mx, dtf[j]); }
    C = { M, B: F.B, BW: F.BW, BH: F.BH, dtf, dtfMin: mn, dtfMax: mx, buf: new Float32Array(vp.w * vp.h * 3),
          ns: new Uint8Array(vp.h), ta: new Float64Array(vp.h), SX: new Float64Array(vp.h * NSUB), SY: new Float64Array(vp.h * NSUB),
          nb: new Uint8Array(vp.h), BX: new Float64Array(vp.h * NSUB_F), BY: new Float64Array(vp.h * NSUB_F),
          ff: new Float64Array(vp.h), luts: [], Ik: new Float64Array(NSUB) };
    E._c[vp.key] = C;
    return C;
  }
  // erfc (Abramowitz–Stegun 7.1.26, error < 1.5e-7)
  function erfc(x) {
    const z = Math.abs(x), t = 1 / (1 + 0.3275911 * z);
    const y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-z * z);
    return x >= 0 ? y : 2 - y;
  }
  // perfil radial de una lámpara en px de la vista: disco con borde gaussiano (σ 0.5 px, como la óptica; así la luz
  // total no depende de la posición sub-píxel) + halo; gaussiana para los reflejos
  // Se parte en núcleo (nítido: submuestras finas) y halo (suave: las del fondo); cada parte con su LUT.
  function lutDe(C, E, Lp, li, s) {
    let P = C.luts[li];
    if (P) return P;
    const rv = Math.max(0.05, Lp.r * s), sg = 0.5, hk = Lp.gauss ? 0 : fin(E.halo.k, 0), hw = fin(E.halo.w, 1.3), ss = rv < 1.5 ? 4 : 1;
    const nucleo = (rho) => (Lp.gauss ? Math.exp(-(rho / rv) * (rho / rv)) : (1 - hk) * 0.5 * erfc((rho - rv) / (sg * Math.SQRT2)));
    const halo = (rho) => hk * Math.exp(-(rho / (hw * rv)) * (rho / (hw * rv)));
    const parte = (fn, rmax, fino) => {
      const paso = 1 / 32, n = Math.ceil(rmax / paso) + 2, lut = new Float32Array(n);
      for (let i = 0; i < n; i++) lut[i] = fn(i * paso);
      lut[n - 1] = 0;
      return { lut, inv: 1 / paso, n, rmax, ss, fino };
    };
    const rN = Lp.gauss ? 3 * rv + 0.5 : rv + 4 * sg + 0.5, rH = hw * rv * 2.7 + 0.5;
    let partes;
    if (hk > 0 && ss === 1) partes = [parte(nucleo, rN, true), parte(halo, rH, false)];
    else if (hk > 0) partes = [parte((r) => nucleo(r) + halo(r), Math.max(rN, rH), true)];
    else partes = [parte(nucleo, rN, true)];
    P = { partes, rmax: Math.max(...partes.map((q) => q.rmax)) };
    C.luts[li] = P;
    return P;
  }
  function perfil(P, dx, dy) {
    if (P.ss === 1) {
      const x = Math.sqrt(dx * dx + dy * dy) * P.inv; if (x >= P.n - 1) return 0;
      const i = x | 0, f = x - i; return P.lut[i] + f * (P.lut[i + 1] - P.lut[i]);
    }
    let s = 0; const ss = P.ss, k = 1 / ss;
    for (let u = 0; u < ss; u++) for (let v = 0; v < ss; v++) {
      const ex = dx + (u + 0.5) * k - 0.5, ey = dy + (v + 0.5) * k - 0.5, x = Math.sqrt(ex * ex + ey * ey) * P.inv;
      if (x < P.n - 1) { const i = x | 0, f = x - i; s += P.lut[i] + f * (P.lut[i + 1] - P.lut[i]); }
    }
    return s * k * k;
  }

  // ------------------------------------------------------------ tabla de ruido gaussiano (por escena)
  const TAB_N = 1 << 20;
  function tablaRuido(E) {
    if (E._c.tab) return E._c.tab;
    const rnd = mulberry32(E.seed_ruido), t = new Float32Array(TAB_N);
    for (let i = 0; i < TAB_N; i += 2) {
      let u = 0; while (!u) u = rnd();
      const v = rnd(), m = Math.sqrt(-2 * Math.log(u));
      t[i] = m * Math.cos(DOS_PI * v); t[i + 1] = m * Math.sin(DOS_PI * v);
    }
    return (E._c.tab = t);
  }

  // ------------------------------------------------------------ pintar un cuadro
  const tmp0 = [0, 0], tmp1 = [0, 0], tmp2 = [0, 0];
  // submuestras de desplazamiento de la exposición [a, a+Ex] (en px de escena) para las lámparas (SX, SY: n)
  // y para el fondo (BX, BY: nb). Devuelve n; deja nb en C.nb[j].
  function muestras(E, a, Ex, s, C, j) {
    const SX = C.SX, SY = C.SY, base = j * NSUB, bb = j * NSUB_F;
    const d0 = E.desp(a, tmp0), d1 = E.desp(a + Ex, tmp1), dc = E.desp(a + 0.5 * Ex, tmp2);
    const e0 = Math.hypot(d0[0] - dc[0], d0[1] - dc[1]), e1 = Math.hypot(d1[0] - dc[0], d1[1] - dc[1]);
    const span = 2 * Math.max(e0, e1) * s;
    let n = 1, nb = 1;
    if (E.desenfoque && span > 0.35) { n = Math.min(NSUB, 1 + Math.ceil(span / 0.5)); nb = Math.min(NSUB_F, 1 + Math.ceil(span / 1.0)); }
    C.nb[j] = nb;
    if (n === 1) { SX[base] = dc[0]; SY[base] = dc[1]; C.BX[bb] = dc[0]; C.BY[bb] = dc[1]; return 1; }
    for (let k = 0; k < n; k++) { E.desp(a + (k + 0.5) * Ex / n, tmp0); SX[base + k] = tmp0[0]; SY[base + k] = tmp0[1]; }
    for (let k = 0; k < nb; k++) { E.desp(a + (k + 0.5) * Ex / nb, tmp0); C.BX[bb + k] = tmp0[0]; C.BY[bb + k] = tmp0[1]; }
    return n;
  }
  // Pinta la vista vp en el instante t (centro de la exposición del cuadro) → RGBA en out
  function render(E, vp, t, out, conRuido) {
    const C = cacheDe(E, vp);
    const w = vp.w, h = vp.h, s = vp.s, Ex = E.E, M = C.M, BW = C.BW, BH = C.BH, B = C.B, buf = C.buf;
    const ns = C.ns, SX = C.SX, SY = C.SY, ta = C.ta, ff = C.ff;
    const iguales = !(E.R_s > 0);
    // 1) ventana de exposición y desplazamientos de cada fila (rolling shutter)
    for (let j = 0; j < h; j++) {
      if (iguales && j > 0) {
        ns[j] = ns[0]; ta[j] = ta[0]; ff[j] = ff[0]; C.nb[j] = C.nb[0];
        for (let k = 0; k < ns[0]; k++) { SX[j * NSUB + k] = SX[k]; SY[j * NSUB + k] = SY[k]; }
        for (let k = 0; k < C.nb[0]; k++) { C.BX[j * NSUB_F + k] = C.BX[k]; C.BY[j * NSUB_F + k] = C.BY[k]; }
        continue;
      }
      const a = t + C.dtf[j] - 0.5 * Ex;
      ta[j] = a; ns[j] = muestras(E, a, Ex, s, C, j);
      ff[j] = E.flickerMedio ? E.flickerMedio(a, a + Ex) : 1;
    }
    // 2) fondo (bilineal, promedio de las submuestras = desenfoque)
    const fila3 = BW * 3;
    const BX = C.BX, BY = C.BY;
    for (let j = 0; j < h; j++) {
      const n = C.nb[j], q0 = j * w * 3;
      for (let k = 0; k < n; k++) {
        const wg = ff[j] / n, fi = M - BX[j * NSUB_F + k] * s, fj = j + M - BY[j * NSUB_F + k] * s;
        let i0 = Math.floor(fi), j0 = Math.floor(fj), fx = fi - i0, fy = fj - j0;
        if (j0 < 0) { j0 = 0; fy = 0; } else if (j0 > BH - 2) { j0 = BH - 2; fy = 1; }
        const w00 = (1 - fx) * (1 - fy) * wg, w10 = fx * (1 - fy) * wg, w01 = (1 - fx) * fy * wg, w11 = fx * fy * wg;
        const r0 = j0 * fila3, r1 = r0 + fila3;
        for (let x = 0; x < w; x++) {
          let i = x + i0; if (i < 0) i = 0; else if (i > BW - 2) i = BW - 2;
          const p0 = r0 + i * 3, p1 = r1 + i * 3, q = q0 + x * 3;
          const v0 = w00 * B[p0] + w10 * B[p0 + 3] + w01 * B[p1] + w11 * B[p1 + 3];
          const v1 = w00 * B[p0 + 1] + w10 * B[p0 + 4] + w01 * B[p1 + 1] + w11 * B[p1 + 4];
          const v2 = w00 * B[p0 + 2] + w10 * B[p0 + 5] + w01 * B[p1 + 2] + w11 * B[p1 + 5];
          if (k === 0) { buf[q] = v0; buf[q + 1] = v1; buf[q + 2] = v2; } else { buf[q] += v0; buf[q + 1] += v1; buf[q + 2] += v2; }
        }
      }
    }
    // 3) lámparas: integral exacta sobre la exposición de cada fila (y de cada submuestra)
    const Lps = E.lamparas, dsp = E.desp_max * s, nbs = C.nb;
    for (let li = 0; li < Lps.length; li++) {
      const Lp = Lps[li], lam = Lp.L;
      if (lam.integral(t + C.dtfMin - Ex, t + C.dtfMax + Ex) <= 0) continue;
      const P = lutDe(C, E, Lp, li, s);
      let cx0 = (Lp.x - vp.x0) * s, cy0 = (Lp.y - vp.y0) * s;
      let ext = P.rmax + dsp + 1;
      for (const o of Lp.sub) ext = Math.max(ext, P.rmax + dsp + 1 + Math.hypot(o[0], o[1]) * s);
      if (Lp.vel) { const tv = t - Lp.t_ref; cx0 += Lp.vel[0] * tv * s; cy0 += Lp.vel[1] * tv * s; ext += Math.hypot(Lp.vel[0], Lp.vel[1]) * (Ex + C.dtfMax - C.dtfMin) * s; }
      if (cx0 + ext < 0 || cx0 - ext > w - 1 || cy0 + ext < 0 || cy0 - ext > h - 1) continue;
      const jA = Math.max(0, Math.floor(cy0 - ext)), jB = Math.min(h - 1, Math.ceil(cy0 + ext));
      const ar = Lp.amp * Lp.col[0], ag = Lp.amp * Lp.col[1], ab = Lp.amp * Lp.col[2];
      for (const Q of P.partes) {
        const XS = Q.fino ? SX : BX, YS = Q.fino ? SY : BY, NS = Q.fino ? NSUB : NSUB_F, nn = Q.fino ? ns : nbs, Ik = C.Ik;
        let IkOk = false;
        for (let j = jA; j <= jB; j++) {
          const n = nn[j], a = ta[j], dt = Ex / n;
          for (let k = 0; k < n; k++) {
            let I;
            if (iguales) { if (!IkOk) { for (let kk = 0; kk < n; kk++) Ik[kk] = lam.integral(a + kk * dt, a + (kk + 1) * dt) / Ex; IkOk = true; } I = Ik[k]; }
            else I = lam.integral(a + k * dt, a + (k + 1) * dt) / Ex;
            if (!(I > 0)) continue;
            let ckx = cx0 + XS[j * NS + k] * s, cky = cy0 + YS[j * NS + k] * s;
            if (Lp.vel) { const tk = a + (k + 0.5) * dt - t; ckx += Lp.vel[0] * tk * s; cky += Lp.vel[1] * tk * s; }
            for (const o of Lp.sub) {
              const sx = ckx + o[0] * s, sy = cky + o[1] * s, dy = j - sy;
              if (dy > Q.rmax + 0.5 || dy < -Q.rmax - 0.5) continue;
              const xa = Math.max(0, Math.ceil(sx - Q.rmax - 0.5)), xb = Math.min(w - 1, Math.floor(sx + Q.rmax + 0.5));
              for (let x = xa; x <= xb; x++) {
                const pv = perfil(Q, x - sx, dy); if (!(pv > 0)) continue;
                const v = I * pv, q = (j * w + x) * 3;
                buf[q] += ar * v; buf[q + 1] += ag * v; buf[q + 2] += ab * v;
              }
            }
          }
        }
      }
    }
    // 4) ganancia (AE), ruido (fotónico + piso) y sRGB de 8 bits
    const G = E.ganancia(t), rz = conRuido === false ? 0 : E.ruido, nf = E.nf, piso = 0.01 * nf * nf;
    const tab = rz > 0 ? tablaRuido(E) : null, MASK = TAB_N - 1;
    let ro = semillaDeT(E.seed_ruido, t) & MASK;
    for (let p = 0, q = 0, n = w * h; p < n; p++, q += 3) {
      let v0 = buf[q] * G, v1 = buf[q + 1] * G, v2 = buf[q + 2] * G;
      if (rz > 0) {
        const m = (v0 + v1 + v2) * (1 / 3), sg = rz * Math.sqrt(nf * (m > 0 ? m : 0) + piso);
        v0 += sg * tab[ro]; v1 += sg * tab[(ro + 1) & MASK]; v2 += sg * tab[(ro + 2) & MASK]; ro = (ro + 3) & MASK;
      }
      const o4 = p << 2;
      out[o4] = v0 <= 0 ? 0 : v0 >= 1 ? 255 : SRGB[(v0 * NL + 0.5) | 0];
      out[o4 + 1] = v1 <= 0 ? 0 : v1 >= 1 ? 255 : SRGB[(v1 * NL + 0.5) | 0];
      out[o4 + 2] = v2 <= 0 ? 0 : v2 >= 1 ? 255 : SRGB[(v2 * NL + 0.5) | 0];
      out[o4 + 3] = 255;
    }
    return out;
  }
  // API: un cuadro RGBA de la escena (w×h) con su exposición centrada en t. o = {out, ruido:false, vista:{w,h}}
  function pintar(E, t, o) {
    o = o || {};
    const vp = o.vista ? vistaGeneral(E, o.vista.w || 240, o.vista.h || 136) : vistaRecorte(E);
    const out = o.out && o.out.length >= vp.w * vp.h * 4 ? o.out : new Uint8ClampedArray(vp.w * vp.h * 4);
    return render(E, vp, t, out, o.ruido !== false);
  }
  // rotationRate instantáneo (grados/s) que corresponde al movimiento de la imagen en t
  function rotacion(E, t) {
    const v = E.vel(t, [0, 0]), f = E.f_px_rad, out = { a: 0, b: 0, g: 0 };
    const ex = E.giro_ejes.x || { eje: 'g', signo: 1 }, ey = E.giro_ejes.y || { eje: 'b', signo: -1 };
    out[ex.eje] += fin(ex.signo, 1) * v[0] / f * GRADOS;
    out[ey.eje] += fin(ey.signo, 1) * v[1] / f * GRADOS;
    return out;
  }

  // ------------------------------------------------------------ Semaforo (para el anillo), si está
  function semaforo() {
    if (root && root.Semaforo && root.Semaforo.Anillo) return root.Semaforo;
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      try { const S = require('./semaforo.js'); if (S && S.Anillo) return S; } catch (e) { /* sin núcleo */ }
    }
    return null;
  }

  // ------------------------------------------------------------ simular una grabación completa
  function simular(opts) {
    const t0ms = ahora();
    opts = opts || {};
    const so = Object.assign({}, DEF_SIM);
    for (const k of Object.keys(DEF_SIM)) if (opts[k] !== undefined) so[k] = opts[k];
    const E = opts.escena && opts.escena.v === VERSION ? opts.escena : escena(Object.assign({}, opts, { fps: so.fps }));
    const fps = fin(so.fps, 60), T = 1 / fps, V0 = E.verdad;
    const L = isFin(V0.t_stage_off) ? V0.t_stage_off : V0.t_verde + 0.4;
    const tA = fin(so.t_inicio, L - 6.5), tB = fin(so.t_fin, L + 1.2);
    const rnd = mulberry32(mezcla(E.seed, 3));
    const ppm = fin(so.fps_ppm, (rnd() - 0.5) * 200), Tr = T * (1 + ppm * 1e-6), phi = rnd() * Tr;
    const lat = Math.max(0, fin(so.lat_cam_s, 0.045)), jit = Math.max(0, fin(so.jitter_ms, 0)) / 1000, proc = Math.max(0, fin(so.proc_ms, 1.5)) / 1000;
    const at = Array.isArray(so.atascos_ms) ? so.atascos_ms : [20, 40], pAt = Math.max(0, fin(so.atascos_prob, 0));
    const vs = fin(so.vsync_hz, 0) > 0 ? 1 / so.vsync_hz : 0, v0 = rnd() * (vs || 1);
    const media0 = tA - 1 - 10 * rnd(), nf0 = 100 + Math.floor(1000 * rnd());
    // atascos del hilo principal (Poisson)
    const stalls = [];
    if (pAt > 0) { let ts = tA; for (;;) { ts += -Math.log(1 - rnd()) / (pAt * fps); if (ts > tB + 1) break; stalls.push([ts, ts + (at[0] + (at[1] - at[0]) * rnd()) / 1000]); } }
    // cuadros que produce la cámara (los que pierde la cámara no cuentan en presentedFrames)
    const prod = []; let nfc = nf0, prevR = -Infinity;
    for (let k = 0; ; k++) {
      const sk = tA + phi + k * Tr; if (sk > tB) break;
      if (so.perdidos_cam > 0 && rnd() < so.perdidos_cam) continue;
      let ready = sk + lat + (jit > 0 ? -Math.log(1 - rnd()) * jit : 0);
      if (ready < prevR + 1e-4) ready = prevR + 1e-4;
      prevR = ready;
      prod.push({ s: sk, ready, nf: nfc++ });
    }
    // entrega por requestVideoFrameCallback: un cuadro a la vez; si al llamar ya hay uno más nuevo, se pierde
    const ent = []; let busy = -Infinity, iS = 0;
    for (let k = 0; k < prod.length; k++) {
      const F = prod[k];
      let cb = Math.max(F.ready, busy);
      for (let guard = 0; guard < 16; guard++) {      // dentro de un atasco → al final del atasco
        while (iS < stalls.length && stalls[iS][1] <= cb) iS++;
        if (iS < stalls.length && stalls[iS][0] <= cb) { cb = stalls[iS][1]; continue; }
        break;
      }
      if (vs) cb = v0 + Math.ceil((cb - v0) / vs) * vs;
      if (k + 1 < prod.length && prod[k + 1].ready <= cb) continue;     // rVFC entrega solo el más reciente
      if (so.perdidos > 0 && rnd() < so.perdidos) continue;             // llamada perdida
      const pres = vs ? v0 + Math.ceil((F.ready - v0) / vs) * vs : F.ready + 0.5 * rnd() / 60;
      ent.push({ s: F.s, cb, pres, nf: F.nf });
      busy = cb + proc;
    }
    const n = ent.length;
    const ft = so.fuente_t === 'media' || so.fuente_t === 'indice' ? so.fuente_t : 'cap';
    const capD = fin(so.cap_desfase_s, 0);
    const tiempos = (F) => ({
      cb: F.cb, cap: ft === 'cap' ? F.s + capD : NaN, pres: F.pres,
      media: ft === 'indice' ? NaN : Math.round((F.s - media0) * 1e6) / 1e6, nf: so.nf === false ? -1 : F.nf,
    });
    // pintar y meter al anillo (o la réplica exacta de su conversión)
    const SM = so.anillo === false ? null : semaforo();
    const fmt = so.fmt === 'y8' ? 'y8' : 'yuv420';
    const vp = vistaRecorte(E), rgba = new Uint8ClampedArray(E.w * E.h * 4);
    let vg = null, rgbaV = null, cada = 6;
    if (so.vista) { const vv = so.vista === true ? {} : so.vista; vg = vistaGeneral(E, vv.w || 240, vv.h || 136); rgbaV = new Uint8ClampedArray(vg.w * vg.h * 4); cada = Math.max(1, vv.cada | 0 || 6); }
    const cap0 = so.capacidad | 0 || (isFin(so.mem_mb) ? 0 : n);
    let cuadros, tRender = 0;
    const tt = new Float64Array(n);
    if (SM) {
      const an = new SM.Anillo({ w: E.w, h: E.h, fmt, capacidad: cap0 || undefined, mem_mb: isFin(so.mem_mb) ? so.mem_mb : undefined,
        zona: E.zona.slice(), orig: E.orig.slice(), escala: E.escala, fps_nominal: fps });
      const anV = vg ? new SM.Anillo({ w: vg.w, h: vg.h, fmt: 'y8', capacidad: Math.ceil(n / cada) + 1, fps_nominal: fps / cada }) : null;
      for (let i = 0; i < n; i++) {
        const F = ent[i], r0 = ahora();
        render(E, vp, F.s, rgba, true);
        tRender += ahora() - r0;
        const ti = tiempos(F);
        an.push(rgba, ti); tt[i] = F.s;
        if (anV && i % cada === 0) { render(E, vg, F.s, rgbaV, true); anV.push(rgbaV, ti); }
      }
      cuadros = an.congelar();
      if (anV) cuadros.vista = anV.congelar();
    } else {
      // sin semaforo.js: misma conversión; hora = captureTime o llegada mínima ideal
      const tam = fmt === 'y8' ? E.w * E.h : E.w * E.h + 2 * (E.w >> 1) * (E.h >> 1), datos = new Uint8Array(n * tam);
      const cr = { cb: new Float64Array(n), cap: new Float64Array(n), pres: new Float64Array(n), media: new Float64Array(n), nf: new Int32Array(n) }, t = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const F = ent[i], r0 = ahora(); render(E, vp, F.s, rgba, true); tRender += ahora() - r0;
        aYUV(rgba, E.w, E.h, fmt, datos, i * tam);
        const ti = tiempos(F); cr.cb[i] = ti.cb; cr.cap[i] = ti.cap; cr.pres[i] = ti.pres; cr.media[i] = ti.media; cr.nf[i] = ti.nf;
        t[i] = ft === 'cap' ? ti.cap : F.s + lat; tt[i] = F.s;
      }
      cuadros = { v: 1, fmt, w: E.w, h: E.h, n, tam, datos, t, crudos: cr,
        reloj: { fuente: ft === 'cap' ? 'cap' : 'sim', c0: 0, c1: 1, lat_min_s: lat, jitter_s: jit, perdidos: 0, fps },
        zona: E.zona.slice(), orig: E.orig.slice(), escala: E.escala, vista: null };
    }
    // si el anillo se llenó, quedan los últimos
    const tTrue = cuadros.n === n ? tt : tt.slice(n - cuadros.n);
    // giroscopio con el mismo movimiento (latencia de IMU, ruido, sesgo, jitter de la marca)
    const giro = giroDe(E, { t_inicio: tA - 0.5, t_fin: tB + 0.5, giro_hz: so.giro_hz, lat_imu_s: so.lat_imu_s,
      ruido_dps: so.giro_ruido_dps, jitter_ms: so.giro_jitter_ms, sesgo_dps: so.giro_sesgo_dps, seed: mezcla(E.seed, 4) });
    // verdad completa: desfase real de la hora de cuadro y δ de K1
    const dif = []; for (let i = 0; i < cuadros.n; i++) dif.push(cuadros.t[i] - tTrue[i]);
    dif.sort((a, b) => a - b);
    const desf = dif.length ? dif[dif.length >> 1] : NaN;
    const latImu = fin(so.lat_imu_s, 0.010);
    const yc = (E.h - 1) / 2, dtc = E.dtFila(yc), F0 = V0.disp.focos[E.carril];
    const ycA = F0 ? (F0.pre.y + F0.r.y) / 2 : yc, dtA = E.dtFila(ycA);
    const CB = E.cab;
    let eje = null;
    if (CB) {
      const img = Math.abs(CB.dir[1]) >= Math.abs(CB.dir[0]) ? 'y' : 'x', map = E.giro_ejes[img] || {};
      eje = { img, giro: map.eje, signo: fin(map.signo, 1) };
    }
    const enCam = (tv, dtf) => (isFin(tv) ? tv + desf + dtf : NaN);
    const fo = (f) => (F0 && F0[f] ? F0[f].dt_fila_s : 0);
    const verdad = Object.assign(copiar(V0), {
      t_cuadros: tTrue, desfase_cam_s: desf, fuente_t: ft, lat_cam_s: lat, lat_imu_s: latImu, cap_desfase_s: capD,
      fps_real: 1 / Tr, n_producidos: prod.length, n_entregados: n, perdidos_entrega: prod.length - n,
      k1: { delta_s: latImu - desf + dtc, delta_arbol_s: latImu - desf + dtA, f_px_rad: E.f_px_rad, eje, amp_px: CB ? Math.abs(CB.amp) : 0 },
      en_camara: { t_ambar_ref: enCam(V0.t_ambar_ref, V0.tipo === 'pro' ? (fo('a1') + fo('a2') + fo('a3')) / 3 : fo('a3')), t_verde: enCam(V0.t_verde, fo('g')), t_roja: enCam(V0.t_roja, fo('r')),
                   t_stage_off: enCam(V0.t_stage_off, fo('stg')), t_stage_on: enCam(V0.t_stage_on, fo('stg')), t_pre_off: enCam(V0.t_pre_off, fo('pre')),
                   t_ambar: V0.t_ambar.map((x, i) => enCam(x, fo('a' + (i + 1)))) },
    });
    // copiar() no clona typed arrays: t_cuadros queda por referencia (ya es propio)
    const ms = ahora() - t0ms;
    return { cuadros, giro, verdad, escena: E, stats: { ms, ms_render: tRender, ms_cuadro: n ? tRender / n : NaN, n_cuadros: n, n_vista: cuadros.vista ? cuadros.vista.n : 0 } };
  }

  // giroscopio (rotationRate en grados/s) del mismo movimiento: t_marca = t_físico + lat_imu (+ jitter)
  function giroDe(E, o) {
    o = o || {};
    const hz = fin(o.giro_hz, 60), tA = fin(o.t_inicio, 0), tB = fin(o.t_fin, tA + 10), lat = fin(o.lat_imu_s, 0.010);
    const rnd = mulberry32(fin(o.seed, mezcla(E.seed, 4)) >>> 0), sr = Math.max(0, fin(o.ruido_dps, 0.3)), jit = Math.max(0, fin(o.jitter_ms, 0.3)) / 1000;
    const sesgo = fin(o.sesgo_dps, 0.2), bias = { a: sesgo * normal(rnd), b: sesgo * normal(rnd), g: sesgo * normal(rnd) };
    const n = Math.max(0, Math.floor((tB - tA) * hz)), ph = rnd() / hz;
    const t = new Float64Array(n), a = new Float32Array(n), b = new Float32Array(n), g = new Float32Array(n);
    const ex = E.giro_ejes.x || { eje: 'g', signo: 1 }, ey = E.giro_ejes.y || { eje: 'b', signo: -1 }, v = [0, 0], f = E.f_px_rad;
    let prev = -Infinity;
    for (let i = 0; i < n; i++) {
      let ti = tA + ph + i / hz + (jit > 0 ? jit * normal(rnd) : 0);
      if (ti <= prev) ti = prev + 1e-5;
      prev = ti;
      E.vel(ti - lat, v);
      const r = { a: 0, b: 0, g: 0 };
      r[ex.eje] += fin(ex.signo, 1) * v[0] / f * GRADOS;
      r[ey.eje] += fin(ey.signo, 1) * v[1] / f * GRADOS;
      r.a += 0.03 * r[ey.eje];                       // un poco de acoplamiento entre ejes
      t[i] = ti;
      a[i] = r.a + bias.a + sr * normal(rnd); b[i] = r.b + bias.b + sr * normal(rnd); g[i] = r.g + bias.g + sr * normal(rnd);
    }
    return { t, a, b, g };
  }

  // ------------------------------------------------------------ ayudas para las pruebas
  // Condiciones de la matriz de plan.md §6 (se mezclan con las opciones de escena/simular)
  const CONDICIONES = {
    dia: { E_s: 0.0003, contraste: 3, ruido: 0.02, lampara: { tipo: 'led', tr_s: 0 } },
    sombra: { E_s: 0.008, contraste: 3, ruido: 0.025 },
    noche: { E_T: 0.98, contraste: 30, ruido: 0.04, nivel_fondo: 0.10, halo: { k: 0.3, w: 1.6 } },
    inc20: { lampara: { tipo: 'inc', tr_s: 0.020 } },
    inc40: { lampara: { tipo: 'inc', tr_s: 0.040 } },
    pwm200: { pwm: { f_hz: 200, duty: 0.5 }, R_s: 0.025 },
    pwm400: { pwm: { f_hz: 400, duty: 0.5 }, R_s: 0.025 },
    pwm1000: { pwm: { f_hz: 1000, duty: 0.5 }, R_s: 0.025 },
    sol: { sol: { contraste: 0.3, fantasma: true }, ruido: 0.02 },
  };
  function condicion(nombre) { return copiar(CONDICIONES[nombre] || {}); }
  // Opciones de simular() a partir de DragCore.simularSesion: el haz de stage se libera en t_ro_abs y el
  // cabeceo empieza con el movimiento (t_arranque). extra: {rt_s, tipo, …} (rt programada → la verde).
  function desdeSesion(ses, extra) {
    const v = (ses && ses.verdad) || {};
    const o = Object.assign({ rt_s: 0.35 }, extra || {});
    o.t_stage_off = v.t_ro_abs;
    o.cabeceo = Object.assign({ t0: v.t_arranque }, (extra && extra.cabeceo) || {});
    if (extra && extra.cabeceo === null) o.cabeceo = null;
    return o;
  }
  // Serie ideal de un foco (como sim.js): y_k = (fondo + amp·(∫lámpara)/E)·(1 + ruido·n), ya sin la ganancia.
  // o = {fps, E_s, tau, signo, lampara:{tipo,tr_s}, pwm, fila_s, ruido, amp, fondo, antes_s, despues_s, dur_s, seed}
  function serieFoco(o) {
    o = Object.assign({ fps: 60, E_s: 0.0003, tau: 1.0, signo: 1, lampara: { tipo: 'led' }, pwm: null, fila_s: 0, ruido: 0.02, amp: 3, fondo: 1,
                        antes_s: 1.2, despues_s: 0.8, dur_s: 1.0, seed: 1 }, o || {});
    const rnd = mulberry32(o.seed >>> 0), T = 1 / o.fps, E = Math.min(o.E_s, 0.98 * T);
    const tau = o.tau, tr = o.signo > 0 ? [[tau, tau + o.dur_s]] : [[tau - o.dur_s, tau]];
    const L = new Lampara(tr, Object.assign({}, o.lampara, { pwm: o.pwm ? Object.assign({ fase: rnd() }, o.pwm) : null }));
    const tA = tau - o.antes_s, phi = rnd() * T, ts = [], ys = [];
    for (let k = 0; ; k++) {
      const tk = tA + phi + k * T; if (tk > tau + o.despues_s) break;
      const s0 = tk + o.fila_s - E / 2, v = L.integral(s0, s0 + E) / E;
      ts.push(tk); ys.push((o.fondo + o.amp * v) * (1 + o.ruido * normal(rnd)));
    }
    return { t: Float64Array.from(ts), y: Float64Array.from(ys), peso: new Float32Array(ts.length).fill(1), verdad: { tau, E_s: E, T } };
  }

  const api = {
    VERSION, COLOR, CONDICIONES, DEF_ESCENA, DEF_SIM,
    escena, pintar, simular, giro: giroDe, rotacion,
    desplazamiento: (E, t) => E.desp(t, [0, 0]), ganancia: (E, t) => E.ganancia(t),
    condicion, desdeSesion, serieFoco, aYUV,
    lampara: (tramos, o) => new Lampara(tramos, o),
    _util: { mulberry32, mezcla, normal, vistaGeneral, vistaRecorte, render },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SemaforoSim = api;
})(typeof self !== 'undefined' ? self : this);
