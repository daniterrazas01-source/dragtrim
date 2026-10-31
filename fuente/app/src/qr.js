/* qr.js — Códigos QR para emparejar los teléfonos de Race 1 vs 1 (window.DragQR).
 * Dibuja un QR en un canvas (qrcode-generator, global `qrcode`), lo lee de una imagen (jsQR, global `jsQR`) y lo lee con
 * la cámara de atrás: BarcodeDetector si el navegador lo trae con 'qr_code' (Android Chrome), si no jsQR (iPhone).
 * Las dos librerías van dentro del index.html (vendor/, licencias en vendor/LICENCIAS.md): funciona sin internet.
 * En Node (pruebas) las carga de vendor/ con require. Horas en ms con performance.now().
 */
(function (root) {
  'use strict';
  const MARGEN = 4;           // módulos blancos alrededor (zona de silencio del estándar)
  const VERSION_MAX_M = 25;   // ECC 'M' mientras quepa en la versión 25 (117 módulos); si no, 'L'
  const PERIODO_MS = 100;     // ~10 lecturas por segundo
  const LADO_MAX = 720;       // px: el cuadro de la cámara se reduce a esto antes de jsQR
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const ahora = () => (root.performance && performance.now ? performance.now() : Date.now());

  // ------------------------------------------------------------------ librerías
  // En el navegador ya están cargadas (scripts anteriores del mismo index.html). En Node se cargan de vendor/.
  const libs = {};
  function lib(nombre, archivo) {
    if (root[nombre]) return root[nombre];
    if (libs[nombre]) return libs[nombre];
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      try { libs[nombre] = require(archivo); } catch (e) { /* no está */ }
      if (libs[nombre]) return libs[nombre];
    }
    throw new Error('Falta la librería ' + nombre + ' (' + archivo + ')');
  }
  const qrcodeLib = () => lib('qrcode', './vendor/qrcode.js');
  const jsQRLib = () => lib('jsQR', './vendor/jsQR.js');

  // ------------------------------------------------------------------ generar
  // qrcode-generator toma un carácter por byte: el texto se pasa ya en UTF-8 (jsQR lo lee de vuelta como UTF-8).
  function bytesUtf8(texto) {
    const b = new TextEncoder().encode(texto);
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  }
  function crear(datos, ecc) {
    const qr = qrcodeLib()(0, ecc);           // versión 0 = la más chica en que quepa
    qr.addData(datos, 'Byte');
    qr.make();                                // si no cabe ni en la versión 40, lanza un texto
    return qr;
  }
  const versionDe = (n) => (n - 17) / 4;

  // Matriz del QR: n módulos por lado (sin margen); oscuro(fila, col) fuera de la matriz es false (blanco).
  function matriz(texto, ecc) {
    const datos = bytesUtf8(String(texto == null ? '' : texto));
    let nivel = ecc ? String(ecc).toUpperCase() : null, qr = null;
    if (nivel && 'LMQH'.indexOf(nivel) < 0) throw new Error('Nivel de corrección inválido: ' + ecc);
    try {
      if (nivel) qr = crear(datos, nivel);
      else {
        try { qr = crear(datos, 'M'); } catch (e) { qr = null; }
        if (qr && versionDe(qr.getModuleCount()) <= VERSION_MAX_M) nivel = 'M';
        else { nivel = 'L'; qr = crear(datos, 'L'); }
      }
    } catch (e) {
      throw new Error('El texto no cabe en un QR (' + datos.length + ' bytes; con ECC ' + (nivel || 'L') + '): ' + (e && e.message || e));
    }
    const n = qr.getModuleCount(), m = new Uint8Array(n * n);
    for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) m[f * n + c] = qr.isDark(f, c) ? 1 : 0;
    return {
      n, version: versionDe(n), ecc: nivel,
      oscuro: (f, c) => f >= 0 && c >= 0 && f < n && c < n && m[f * n + c] === 1,
    };
  }

  // Dibuja el QR negro sobre blanco con margen de 4 módulos. El canvas mide tam px CSS (opts.tam, o lo que mida ya en
  // la página) y canvas.width = tam × devicePixelRatio: cada módulo es un número entero de píxeles reales (nítido, sin
  // suavizado); lo que sobra se reparte en el margen. → {version, modulos, ecc, px (por módulo), lado (px reales)}
  function dibujar(canvas, texto, opts) {
    const o = opts || {};
    const M = matriz(texto, o.ecc);
    const total = M.n + 2 * MARGEN;
    const dpr = o.dpr > 0 ? o.dpr : (root.devicePixelRatio > 0 ? root.devicePixelRatio : 1);
    let css = o.tam > 0 ? o.tam : (canvas.clientWidth || parseFloat(canvas.style && canvas.style.width) || 0);
    if (!(css > 0)) css = 280;
    const lado = Math.max(total, Math.round(css * dpr));
    const px = Math.max(1, Math.floor(lado / total));
    const ini = Math.floor((lado - px * total) / 2) + MARGEN * px;
    canvas.width = lado; canvas.height = lado;
    if (canvas.style) {
      canvas.style.width = canvas.style.height = (lado / dpr) + 'px';
      canvas.style.imageRendering = 'pixelated';
    }
    if (canvas.setAttribute && !canvas.getAttribute('aria-label')) { canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Código QR'); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lado, lado);
    ctx.fillStyle = '#000';
    for (let f = 0; f < M.n; f++) {           // cada tramo de módulos negros seguidos de una fila, de un solo rectángulo
      let c = 0;
      while (c < M.n) {
        if (!M.oscuro(f, c)) { c++; continue; }
        let c2 = c + 1;
        while (c2 < M.n && M.oscuro(f, c2)) c2++;
        ctx.fillRect(ini + c * px, ini + f * px, (c2 - c) * px, px);
        c = c2;
      }
    }
    return { version: M.version, modulos: M.n, ecc: M.ecc, px, lado };
  }

  // ------------------------------------------------------------------ leer de una imagen
  // Dos debilidades de jsQR que se compensan aquí sin tocar la librería:
  //  - Supone que lo negro mide menos de la mitad que lo blanco (umbral = mín/2 en zonas lisas): con un reflejo en la
  //    pantalla (negro 100, blanco 160) no lee nada. → estirar(): el 1 % más oscuro a 0 y el 1 % más claro a 255, pero
  //    solo si el negro pasa del 40 % del blanco: estirar también agranda el ruido, y jsQR trata como lisos los bloques
  //    de 8×8 que varían menos de 24 niveles; con el ruido agrandado se llenan de puntos y se pierden los patrones.
  //  - Calcula cuántos módulos tiene el QR con corridas de píxeles enteros: con módulos de ~2.5–3.5 px un QR grande
  //    (versión 15+) sale con el número de módulos equivocado. → otra oportunidad con la imagen ampliada ×1.5.
  function estirar(d, w, h) {      // en el lugar (RGBA). true si cambió algo
    const hist = new Uint32Array(256), paso = Math.max(1, Math.floor(Math.sqrt(w * h / 40000)));
    let n = 0;
    for (let y = 0; y < h; y += paso) for (let x = 0; x < w; x += paso) {
      const i = (y * w + x) * 4;
      hist[(d[i] * 54 + d[i + 1] * 183 + d[i + 2] * 19) >> 8]++; n++;
    }
    const corte = Math.max(1, Math.floor(n * 0.01));
    let lo = 0, hi = 255, acc = 0;
    while (lo < 255 && (acc += hist[lo]) < corte) lo++;
    acc = 0;
    while (hi > 0 && (acc += hist[hi]) < corte) hi--;
    if (hi - lo < 16 || lo <= 0.4 * hi) return false;     // sin nada que leer, o el negro ya está bajo
    const lut = new Uint8ClampedArray(256), e = 255 / (hi - lo);
    for (let v = 0; v < 256; v++) lut[v] = (v - lo) * e;
    for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
    return true;
  }
  function escalar(im, f) {        // bilineal → {data, width, height}
    const w = im.width, h = im.height, W = Math.max(1, Math.round(w * f)), H = Math.max(1, Math.round(h * f));
    const s = im.data, d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      const sy = Math.min(h - 1, Math.max(0, (y + 0.5) / f - 0.5)), y0 = Math.floor(sy), y1 = Math.min(h - 1, y0 + 1), fy = sy - y0;
      for (let x = 0; x < W; x++) {
        const sx = Math.min(w - 1, Math.max(0, (x + 0.5) / f - 0.5)), x0 = Math.floor(sx), x1 = Math.min(w - 1, x0 + 1), fx = sx - x0;
        const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, g = (y1 * w + x1) * 4, o = (y * W + x) * 4;
        for (let k = 0; k < 3; k++) d[o + k] = (s[a + k] * (1 - fx) + s[b + k] * fx) * (1 - fy) + (s[c + k] * (1 - fx) + s[g + k] * fx) * fy;
        d[o + 3] = 255;
      }
    }
    return { data: d, width: W, height: H };
  }
  function suavizar(im) {          // binomial 3×3 sobre la luminancia → gris (le quita ruido de cámara)
    const w = im.width, h = im.height, s = im.data, n = w * h;
    const Y = new Float32Array(n), T = new Float32Array(n), d = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) Y[i] = 0.2126 * s[4 * i] + 0.7152 * s[4 * i + 1] + 0.0722 * s[4 * i + 2];
    for (let y = 0; y < h; y++) {
      const f = y * w;
      for (let x = 0; x < w; x++) T[f + x] = (Y[f + (x > 0 ? x - 1 : 0)] + 2 * Y[f + x] + Y[f + (x < w - 1 ? x + 1 : x)]) / 4;
    }
    for (let y = 0; y < h; y++) {
      const fa = (y > 0 ? y - 1 : 0) * w, fb = y * w, fc = (y < h - 1 ? y + 1 : y) * w;
      for (let x = 0; x < w; x++) {
        const o = (fb + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = (T[fa + x] + 2 * T[fb + x] + T[fc + x]) / 4; d[o + 3] = 255;
      }
    }
    return { data: d, width: w, height: h };
  }
  function jsqr(data, w, h, inversion) {
    try {
      const r = jsQRLib()(data, w, h, { inversionAttempts: inversion });
      return r && typeof r.data === 'string' ? r.data : null;
    } catch (e) { return null; }
  }
  // imageData: ImageData o {data (RGBA), width, height}. → texto o null. jsQR con inversionAttempts 'attemptBoth'
  // (también blanco sobre negro); si no lee, otra vez con el contraste estirado, luego ampliada ×1.5 y al final
  // suavizada y ampliada ×1.5 (cada una rescata casos distintos; ninguna le gana a las demás en todos).
  // opts.inversion cambia el modo de jsQR; opts.reintentar = false hace un solo intento.
  function leerImagen(imageData, opts) {
    const im = imageData, o = opts || {};
    if (!im || !im.data || !(im.width > 0) || !(im.height > 0) || im.data.length !== im.width * im.height * 4) return null;
    const w = im.width, h = im.height, inv = o.inversion || 'attemptBoth';
    let r = jsqr(im.data, w, h, inv);
    if (r !== null || o.reintentar === false) return r;
    const d = new Uint8ClampedArray(im.data), e = { data: d, width: w, height: h };
    if (estirar(d, w, h) && (r = jsqr(d, w, h, inv)) !== null) return r;
    if (w * h > 1.5e6) return null;
    let g = escalar(e, 1.5);
    if ((r = jsqr(g.data, g.width, g.height, inv)) !== null) return r;
    g = escalar(suavizar(e), 1.5);
    return jsqr(g.data, g.width, g.height, inv);
  }

  // ------------------------------------------------------------------ cámara
  const MENSAJES = {
    inseguro: 'La cámara solo funciona con conexión segura (https). Abre la app desde su dirección https:// o desde el ícono instalado.',
    no_soportado: 'Este navegador no deja usar la cámara. Abre la app en Safari (iPhone) o en Chrome (Android).',
    sin_permiso: 'No hay permiso para usar la cámara. Permítela cuando el teléfono lo pregunte (o en los ajustes del navegador) y vuelve a intentar.',
    sin_camara: 'No se encontró una cámara en este teléfono.',
    ocupada: 'La cámara está ocupada por otra app. Ciérrala y vuelve a intentar.',
    sin_imagen: 'La cámara no dio imagen. Vuelve a intentar.',
    se_apago: 'La cámara se apagó. Vuelve a intentar.',
    error: 'No se pudo abrir la cámara. Vuelve a intentar.',
  };
  function soporte() {
    if (!root.isSecureContext) return { ok: false, motivo: 'inseguro' };
    const md = root.navigator && root.navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== 'function') return { ok: false, motivo: 'no_soportado' };
    return { ok: true, motivo: null };
  }
  function motivoDe(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return 'sin_permiso';
    if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') return 'sin_camara';
    if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return 'ocupada';
    if (n === 'SinImagen') return 'sin_imagen';
    return 'error';
  }
  const mensaje = (motivo) => MENSAJES[motivo] || MENSAJES.error;
  function avisar(fn, motivo, e) {
    if (typeof fn !== 'function') return;
    let m = mensaje(motivo);
    if (motivo === 'error' && e && e.name) m += ' (' + e.name + ')';
    try { fn(m, motivo); } catch (x) { /* el aviso no debe romper nada */ }
  }
  // 1920×1080 si la cámara lo da (si no, lo más cercano): jsQR necesita ~4 px por módulo y un QR de emparejar tiene
  // ~100 módulos por lado; con 1080 px el teléfono puede estar más lejos (los iPhone Pro no enfocan a menos de ~15 cm).
  const RESTRICCIONES = () => ({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
  const vivo = (st) => !!st && typeof st.getVideoTracks === 'function' && st.getVideoTracks().some((t) => t.readyState === 'live');

  // La cámara de atrás (sin mostrarla). Se pide antes de crear la oferta WebRTC: con el permiso de cámara, Chrome y
  // Safari ponen las IP locales reales en los candidatos. → MediaStream o null (opts.alError(mensaje, motivo) dice por qué).
  async function pedirCamara(opts) {
    const o = opts || {};
    const s = soporte();
    if (!s.ok) { avisar(o.alError, s.motivo); return null; }
    try { return await root.navigator.mediaDevices.getUserMedia(RESTRICCIONES()); }
    catch (e) { avisar(o.alError, motivoDe(e), e); return null; }
  }
  function soltar(stream) {
    if (!stream || typeof stream.getTracks !== 'function') return;
    for (const t of stream.getTracks()) { try { t.stop(); } catch (e) { /* ya estaba apagada */ } }
  }

  // Qué parte del video ve jsQR en el intento k (ciclo de 8). Siempre un cuadrado del centro, del tamaño `base` = lado
  // corto del video (≤ 720 px) o una fracción, a una escala que deja el resultado en ≤ 720 px. Con simulaciones de un QR
  // de 600 caracteres (93 módulos) visto en otra pantalla, ningún tamaño de módulo le sirve a jsQR para todos los
  // tamaños y perspectivas, pero juntos lo leen de 300 a 700 px en un cuadro de 1280×720:
  //   A: base a ×1 (QR grandes) · A125: 80 % ×1.25 · Z: 2/3 ×1.5 · Zs: 2/3 suavizado ×1.5 (ruido con poca luz) ·
  //   Z2: la mitad ×2 (QR chicos); si el video es de más de 720 px, en su lugar todo el lado corto reducido a 720 ·
  //   Ainv: base a ×1 buscando blanco sobre negro (pantalla con colores invertidos).
  const CICLO = [[1, 1], [0.8, 1.25], [2 / 3, 1.5], [2 / 3, 1.5, 's'], [1, 1], [0.8, 1.25], [0.5, 2, 'b'], [1, 1, 'i']];
  function plan(k, W, H) {
    const S = Math.min(W, H), base = Math.min(S, LADO_MAX), [fr, f0, x] = CICLO[((k % CICLO.length) + CICLO.length) % CICLO.length];
    let lado = Math.max(1, Math.round(base * fr)), f = f0;
    if (x === 'b' && S > LADO_MAX) { lado = S; f = LADO_MAX / S; }
    return { sx: (W - lado) >> 1, sy: (H - lado) >> 1, lado, f, suave: x === 's', inv: x === 'i' };
  }

  // El intento k del escáner sobre un cuadro ya en memoria (RGBA): lo mismo que hace escaner() con jsQR, pero recortando
  // y escalando en JS en vez de con el canvas. Para probar el ciclo en Node (qr_test.js).
  function intentoCuadro(im, k) {
    const p = plan(k, im.width, im.height), c0 = new Uint8ClampedArray(p.lado * p.lado * 4);
    for (let y = 0; y < p.lado; y++) { const o = ((p.sy + y) * im.width + p.sx) * 4; c0.set(im.data.subarray(o, o + p.lado * 4), y * p.lado * 4); }
    let c = { data: c0, width: p.lado, height: p.lado };
    if (!p.suave && p.f !== 1) c = escalar(c, p.f);
    estirar(c.data, c.width, c.height);
    if (p.suave) c = escalar(suavizar(c), p.f);
    return jsqr(c.data, c.width, c.height, p.inv ? 'onlyInvert' : 'dontInvert');
  }

  // BarcodeDetector con 'qr_code' (se pregunta una vez; Safari no lo trae)
  let _bdSoporta = null;
  async function crearDetector() {
    const BD = root.BarcodeDetector;
    if (typeof BD !== 'function') return null;
    try {
      if (_bdSoporta === null) {
        const f = typeof BD.getSupportedFormats === 'function'
          ? await Promise.race([BD.getSupportedFormats(), esperar(1500).then(() => null)]) : null;
        _bdSoporta = !!f && Array.prototype.indexOf.call(f, 'qr_code') >= 0;
      }
      return _bdSoporta ? new BD({ formats: ['qr_code'] }) : null;
    } catch (e) { return null; }
  }
  function enfocar(stream) {     // enfoque continuo si la cámara lo deja elegir (Android); en iPhone ya es así
    try {
      const t = stream.getVideoTracks()[0];
      const caps = t && t.getCapabilities ? t.getCapabilities() : null;
      if (caps && caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) {
        t.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      }
    } catch (e) { /* sin control del enfoque */ }
  }

  // Escáner: muestra la cámara de atrás en `video` y lee ~10 veces por segundo. Llama opts.alLeer(texto, info) UNA vez,
  // con el primer texto que pase opts.filtro (por omisión cualquiera), y se detiene solo (apaga la cámara antes de
  // llamarlo). Los que no pasan el filtro se ignoran (opts.alRechazar(texto), una vez por texto distinto).
  // opts.alError(mensaje, motivo) si la cámara no abre o se apaga. opts.stream: una cámara ya abierta (pedirCamara)
  // para no pedirla otra vez; el escáner se queda con ella y detener() la apaga.
  // Con jsQR solo se lee el cuadrado del centro del video (ver plan): la pantalla debe mostrar un cuadro guía en el
  // centro, de ~2/3 del lado corto del video, para que ahí pongan el QR del otro teléfono.
  function escaner(video, opts) {
    if (!video) throw new TypeError('DragQR.escaner necesita un <video>');
    const o = Object.assign({ alLeer: null, filtro: null, alError: null, alRechazar: null, stream: null }, opts || {});
    const filtro = typeof o.filtro === 'function' ? o.filtro : () => true;
    let gen = 0, activo = false, stream = null, prestado = o.stream || null, detector = null;
    let pend = false, hRVFC = 0, hRAF = 0, hPerro = 0, usarRVFC = typeof video.requestVideoFrameCallback === 'function';
    let ocupado = false, tProx = 0, lienzo = null, ctx = null, alTerminar = null, fallasBD = 0;
    const vistos = new Set();
    const est = { activo: false, metodo: null, intentos: 0, rechazados: 0, ms: 0, t0: NaN, w: 0, h: 0 };

    function cancelar() {
      if (!pend) return;
      pend = false;
      try { if (hRVFC && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(hRVFC); } catch (e) { /* */ }
      if (hRAF) cancelAnimationFrame(hRAF);
      clearTimeout(hPerro);
      hRVFC = hRAF = hPerro = 0;
    }
    function programar() {
      if (!activo || pend) return;
      pend = true;
      const seguir = () => { if (!pend) return; pend = false; clearTimeout(hPerro); hRVFC = hRAF = 0; paso(); };
      if (usarRVFC) {
        hRVFC = video.requestVideoFrameCallback(seguir);
        // si en 1.5 s no llega ningún cuadro nuevo (algún Safari con el video tapado), se sigue con requestAnimationFrame
        hPerro = setTimeout(() => { if (pend && activo) { cancelar(); usarRVFC = false; programar(); } }, 1500);
      } else hRAF = requestAnimationFrame(seguir);
    }

    async function intentar() {
      if (detector) {
        const r = await detector.detect(video);
        const l = [];
        for (const c of r || []) if (c && typeof c.rawValue === 'string' && c.rawValue) l.push(c.rawValue);
        return l;
      }
      const p = plan(est.intentos, video.videoWidth, video.videoHeight);
      const dw = p.suave ? p.lado : Math.max(1, Math.round(p.lado * p.f));
      if (!lienzo) {
        lienzo = document.createElement('canvas');
        ctx = lienzo.getContext('2d', { willReadFrequently: true });
      }
      if (lienzo.width !== dw || lienzo.height !== dw) { lienzo.width = dw; lienzo.height = dw; }
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(video, p.sx, p.sy, p.lado, p.lado, 0, 0, dw, dw);
      let im = ctx.getImageData(0, 0, dw, dw);
      estirar(im.data, dw, dw);
      if (p.suave) im = escalar(suavizar(im), p.f);
      const r = jsqr(im.data, im.width, im.height, p.inv ? 'onlyInvert' : 'dontInvert');
      return r ? [r] : [];
    }

    async function paso() {
      if (!activo) return;
      const t = ahora();
      if (ocupado || t < tProx || !(video.readyState >= 2) || !(video.videoWidth > 0)) { programar(); return; }
      ocupado = true;
      const mi = gen;
      let textos = [];
      try { textos = await intentar(); if (detector) fallasBD = 0; }
      catch (e) {   // BarcodeDetector falló 3 veces seguidas: sigue con jsQR
        if (detector && ++fallasBD >= 3) { detector = null; est.metodo = 'jsQR'; }
      }
      ocupado = false;
      if (mi !== gen || !activo) return;
      const t2 = ahora();
      est.intentos++; est.ms += t2 - t;
      tProx = Math.max(t + PERIODO_MS, t2 + 20);
      for (const x of textos) {
        let pasa = false;
        try { pasa = !!filtro(x); } catch (e) { pasa = false; }
        if (pasa) {
          const info = { metodo: est.metodo, ms: Math.round(t2 - est.t0), intentos: est.intentos };
          const fn = o.alLeer;
          detener();
          if (typeof fn === 'function') { try { fn(x, info); } catch (e) { setTimeout(() => { throw e; }); } }
          return;
        }
        if (!vistos.has(x) && vistos.size < 50) {
          vistos.add(x); est.rechazados++;
          if (typeof o.alRechazar === 'function') { try { o.alRechazar(x); } catch (e) { /* */ } }
        }
      }
      programar();
    }

    async function iniciar() {
      const dado = prestado;
      prestado = null;
      detener();
      const mi = gen;
      est.t0 = ahora(); est.intentos = 0; est.ms = 0; est.rechazados = 0; vistos.clear(); fallasBD = 0;
      let st = vivo(dado) ? dado : null;
      if (dado && !st) soltar(dado);
      try {
        if (!st) {
          const s = soporte();
          if (!s.ok) { avisar(o.alError, s.motivo); return false; }
          st = await root.navigator.mediaDevices.getUserMedia(RESTRICCIONES());
        }
        if (mi !== gen) { soltar(st); return false; }        // detener() mientras abría: no se queda prendida
        stream = st;
        video.muted = true; video.playsInline = true; video.autoplay = true;
        video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('autoplay', '');
        video.srcObject = st;
        try {   // mudo y playsinline: debería poder; no se espera para siempre si el navegador no contesta
          const p = video.play();
          await Promise.race([p && p.catch ? p.catch(() => {}) : null, esperar(1500)]);
        } catch (e) { /* */ }
        for (let i = 0; i < 60 && mi === gen && !(video.videoWidth > 0); i++) await esperar(50);
        if (mi !== gen) return false;
        if (!(video.videoWidth > 0)) throw Object.assign(new Error('la cámara no dio imagen'), { name: 'SinImagen' });
      } catch (e) {
        if (mi !== gen) { soltar(st); return false; }
        detener();
        avisar(o.alError, motivoDe(e), e);
        return false;
      }
      enfocar(stream);
      const tr = stream.getVideoTracks()[0];
      if (tr) {
        alTerminar = () => { if (activo && mi === gen) { detener(); avisar(o.alError, 'se_apago'); } };
        tr.addEventListener('ended', alTerminar);
      }
      detector = await crearDetector();
      if (mi !== gen) return false;
      est.metodo = detector ? 'BarcodeDetector' : 'jsQR';
      est.w = video.videoWidth; est.h = video.videoHeight;
      activo = true; est.activo = true; tProx = 0;
      programar();
      return true;
    }

    function detener() {
      gen++;
      activo = false; est.activo = false; ocupado = false;
      cancelar();
      if (stream) {
        const tr = stream.getVideoTracks()[0];
        if (tr && alTerminar) tr.removeEventListener('ended', alTerminar);
        soltar(stream);
        try { if (video.srcObject === stream) video.srcObject = null; } catch (e) { /* */ }
        stream = null;
      }
      alTerminar = null;
      if (prestado) { soltar(prestado); prestado = null; }
    }

    function estado() {
      return { activo: est.activo, metodo: est.metodo, intentos: est.intentos, rechazados: est.rechazados,
               ms_intento: est.intentos ? est.ms / est.intentos : NaN, ancho: est.w, alto: est.h };
    }
    return { iniciar, detener, estado };
  }

  const api = { dibujar, matriz, leerImagen, pedirCamara, soltar, escaner, soporte, mensaje, MARGEN,
                _plan: plan, _intentoCuadro: intentoCuadro, _CICLO: CICLO.length };   // _…: para pruebas
  root.DragQR = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
