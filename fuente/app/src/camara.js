/* camara.js — Cámara trasera para "Medir con el semáforo real" (window.DragCam).
 * El Lector solo GRABA en memoria (Semaforo.Anillo) mientras la medición está armada: no analiza nada ni muestra
 * nada (registrador pasivo; ver archivo/ideas/semaforo_real/plan.md §1.1). Todo el análisis es después de la corrida.
 * "Apuntar" (pantalla aparte, nunca con la medición armada) sí muestra la imagen y revisa la calidad.
 * Horas en segundos con el reloj de performance.now(), el mismo de los sensores (e.timeStamp).
 */
(function (root) {
  'use strict';
  const isFin = Number.isFinite;
  const ahoraS = () => performance.now() / 1000;
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  // ------------------------------------------------------------------ soporte, permiso y cámaras
  function soporte() {
    if (!root.isSecureContext) return { ok: false, motivo: 'inseguro' };
    const md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) return { ok: false, motivo: 'no_soportado' };
    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return { ok: false, motivo: 'no_soportado' };
    return { ok: true, motivo: null };
  }
  async function permiso() {
    try {
      if (navigator.permissions && navigator.permissions.query) return (await navigator.permissions.query({ name: 'camera' })).state;
    } catch (e) { /* Safari viejo: no sabe preguntar por la cámara */ }
    return '?';
  }
  const motivoDe = (e) => {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return 'sin_permiso';
    if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError') return 'sin_camara';
    if (n === 'NotReadableError' || n === 'AbortError') return 'ocupada';
    return 'error';
  };
  // Dentro del toque de "Activar sensores": pide el permiso y apaga la cámara enseguida.
  async function pedirPermiso() {
    const s = soporte();
    if (!s.ok) return s;
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
      for (const t of st.getTracks()) t.stop();
      return { ok: true, motivo: null };
    } catch (e) { return { ok: false, motivo: motivoDe(e), error: String(e && e.message || e) }; }
  }
  // Cámaras traseras. 'virtual' (dual/triple) cambia de lente sola: nunca se ofrece.
  function tipoDe(etiqueta) {
    const e = etiqueta || '';
    if (/dual|triple/i.test(e)) return 'virtual';
    if (/ultra|gran angular|ultraangular|wide/i.test(e)) return 'gran_angular';
    if (/back|trasera|posterior|rear|environment|atrás|principal/i.test(e)) return 'principal';
    return 'otra';
  }
  async function camaras() {
    try {
      const l = await navigator.mediaDevices.enumerateDevices();
      return l.filter((d) => d.kind === 'videoinput').map((d) => ({ id: d.deviceId, groupId: d.groupId, etiqueta: d.label || '', tipo: tipoDe(d.label) }));
    } catch (e) { return []; }
  }
  // Busca la cámara guardada (por etiqueta y groupId: el deviceId cambia en cada carga en iOS)
  async function idDe(camara) {
    if (!camara || !camara.etiqueta) return null;
    const l = await camaras();
    const c = l.find((x) => x.etiqueta === camara.etiqueta && (!camara.groupId || x.groupId === camara.groupId)) || l.find((x) => x.etiqueta === camara.etiqueta);
    return c && c.tipo !== 'virtual' ? c.id : null;
  }

  // Un solo <video> para todo: muted + playsinline (iOS), dentro del DOM y nunca display:none (si no, no hay cuadros).
  let _video = null;
  function video() {
    if (_video) return _video;
    const v = document.createElement('video');
    v.id = 'camVideo'; v.className = 'cam-oculta';
    v.muted = true; v.autoplay = true; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('autoplay', ''); v.setAttribute('aria-hidden', 'true');
    document.body.appendChild(v);
    _video = v;
    return v;
  }

  // ------------------------------------------------------------------ Lector
  // Zona del árbol: [x, y, w, h] normalizada (0–1) respecto al cuadro completo con que se aprendió (orig).
  // Si la zona cabe en pix_max se graba a resolución nativa (el foco de stage mide ~5 px); si no, se reduce.
  function zonaPx(zonaNorm, orig, W, H, pixMax) {
    let zx = 0, zy = 0, zw = W, zh = H, propia = false;
    const misma = orig && orig.length === 2 && Math.abs(orig[0] / orig[1] - W / H) < 0.02;
    if (Array.isArray(zonaNorm) && zonaNorm.length === 4 && misma) {
      zw = Math.max(16, Math.min(W, Math.round(zonaNorm[2] * W))); zh = Math.max(16, Math.min(H, Math.round(zonaNorm[3] * H)));
      zx = Math.max(0, Math.min(W - zw, Math.round(zonaNorm[0] * W))); zy = Math.max(0, Math.min(H - zh, Math.round(zonaNorm[1] * H)));
      propia = true;
    }
    const area = zw * zh, e = area <= pixMax ? 1 : Math.sqrt(pixMax / area);
    const cw = Math.max(2, Math.round(zw * e) & ~1), ch = Math.max(2, Math.round(zh * e) & ~1);
    return { zx, zy, zw, zh, cw, ch, escala: cw / zw, propia };
  }

  class Lector {
    constructor(o) {
      this.o = Object.assign({ zonaNorm: null, orig: null, camara: null, pix_max: 40000, mem_mb: 40, fps: 60,
                               vista: { w: 240, h: 136, cada: 6 }, onfalla: null }, o || {});
      this.activo = false; this.alCuadro = null; this.stream = null; this.track = null;
      this.anillo = null; this.anilloVista = null; this.W = 0; this.H = 0; this.z = null;
      this._k = 0; this._perdidos = 0; this._nfPrev = NaN; this._ultimo = NaN; this._cbs = []; this._proc = []; this._cap = [];
      this._mute = false; this._reintento = false; this._huecos = [];
      this._onVis = () => this._visibilidad();
      this._paso = (now, md) => this._cuadro(now, md);
    }
    _restricciones(id) {
      const v = { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: this.o.fps } };
      if (id) v.deviceId = { ideal: id };
      try { if (navigator.mediaDevices.getSupportedConstraints().resizeMode) v.resizeMode = 'none'; } catch (e) { /* */ }
      return { audio: false, video: v };
    }
    async _abrir() {
      const id = await idDe(this.o.camara);
      this.stream = await navigator.mediaDevices.getUserMedia(this._restricciones(id));
      this.track = this.stream.getVideoTracks()[0];
      const v = video();
      v.srcObject = this.stream;
      try { await v.play(); } catch (e) { /* autoplay mudo: debería poder */ }
      for (let i = 0; i < 60 && !(v.videoWidth > 0); i++) await esperar(50);
      if (!(v.videoWidth > 0)) throw Object.assign(new Error('la cámara no dio imagen'), { name: 'NotReadableError' });
      this.track.addEventListener('ended', () => { if (this.activo) this._perdio('ended'); });
      this.track.addEventListener('mute', () => { this._mute = true; if (this.activo) this._huecos.push({ t: ahoraS(), ev: 'mute' }); });
      this.track.addEventListener('unmute', () => { this._mute = false; });
    }
    async iniciar() {
      const s = soporte();
      if (!s.ok) return { ok: false, motivo: s.motivo };
      if (!root.Semaforo || !root.Semaforo.Anillo) return { ok: false, motivo: 'no_soportado' };
      try { await this._abrir(); }
      catch (e) { this._cerrar(); return { ok: false, motivo: motivoDe(e), error: String(e && e.message || e) }; }
      const v = video();
      this.W = v.videoWidth; this.H = v.videoHeight;
      let settings = null, caps = null;
      try { settings = this.track.getSettings(); } catch (e) { /* */ }
      try { caps = this.track.getCapabilities ? this.track.getCapabilities() : null; } catch (e) { /* */ }
      this.settings = settings;
      this._armar();
      this.activo = true;
      document.addEventListener('visibilitychange', this._onVis);
      v.requestVideoFrameCallback(this._paso);
      return { ok: true, motivo: null, settings, caps, W: this.W, H: this.H, zona_px: [this.z.zx, this.z.zy, this.z.zw, this.z.zh], escala: this.z.escala,
               propia: this.z.propia, etiqueta: this.track.label || '' };
    }
    // anillos y lienzos para la zona actual
    _armar() {
      const z = this.z = zonaPx(this.o.zonaNorm, this.o.orig, this.W, this.H, this.o.pix_max);
      const fpsN = (this.settings && isFin(this.settings.frameRate) && this.settings.frameRate > 0) ? this.settings.frameRate : this.o.fps;
      this.anillo = new root.Semaforo.Anillo({ w: z.cw, h: z.ch, fmt: 'yuv420', mem_mb: this.o.mem_mb, zona: [z.zx, z.zy, z.zw, z.zh],
                                               orig: [this.W, this.H], escala: z.escala, fps_nominal: fpsN });
      const cv = document.createElement('canvas'); cv.width = z.cw; cv.height = z.ch;
      this.ctx = cv.getContext('2d', { willReadFrequently: true });
      const V = this.o.vista;
      if (V && V.w > 0 && V.h > 0) {
        const vw = V.w & ~1, vh = Math.max(2, Math.round(vw * this.H / this.W) & ~1);
        this.anilloVista = new root.Semaforo.Anillo({ w: vw, h: vh, fmt: 'y8', capacidad: Math.ceil(this.anillo.capacidad / Math.max(1, V.cada)) + 4,
                                                      orig: [this.W, this.H], escala: vw / this.W, fps_nominal: fpsN / Math.max(1, V.cada) });
        const c2 = document.createElement('canvas'); c2.width = vw; c2.height = vh;
        this.ctxV = c2.getContext('2d', { willReadFrequently: true });
      } else { this.anilloVista = null; this.ctxV = null; }
    }
    // Cambiar la zona (Apuntar): se vacía lo grabado
    cambiarZona(zonaNorm, orig) {
      this.o.zonaNorm = zonaNorm; this.o.orig = orig || [this.W, this.H];
      if (this.W > 0) this._armar();
      return this.z ? [this.z.zx, this.z.zy, this.z.zw, this.z.zh] : null;
    }
    _cuadro(now, md) {
      if (!this.activo) return;
      const v = video();
      md = md || {};
      if (v.videoWidth !== this.W || v.videoHeight !== this.H) {
        // el teléfono giró: lo grabado ya no corresponde a la zona
        this.anillo.vaciar(); if (this.anilloVista) this.anilloVista.vaciar();
        this.activo = false; this._falla('rotacion');
        return;
      }
      const t0 = performance.now(), z = this.z;
      let img = null;
      try {
        this.ctx.drawImage(v, z.zx, z.zy, z.zw, z.zh, 0, 0, z.cw, z.ch);
        img = this.ctx.getImageData(0, 0, z.cw, z.ch);
      } catch (e) { img = null; }
      const ti = { cb: now / 1000, cap: isFin(md.captureTime) ? md.captureTime / 1000 : NaN, pres: isFin(md.presentationTime) ? md.presentationTime / 1000 : NaN,
                   media: isFin(md.mediaTime) ? md.mediaTime : NaN, nf: isFin(md.presentedFrames) ? md.presentedFrames : -1 };
      if (img) {
        this.anillo.push(img.data, ti);
        if (this.ctxV && (this._k % this.o.vista.cada === 0)) {
          try { this.ctxV.drawImage(v, 0, 0, this.W, this.H, 0, 0, this.anilloVista.w, this.anilloVista.h); this.anilloVista.push(this.ctxV.getImageData(0, 0, this.anilloVista.w, this.anilloVista.h).data, ti); }
          catch (e) { /* vista general: opcional */ }
        }
      }
      this._k++;
      if (isFin(this._nfPrev) && isFin(md.presentedFrames)) this._perdidos += Math.max(0, md.presentedFrames - this._nfPrev - 1);
      this._nfPrev = isFin(md.presentedFrames) ? md.presentedFrames : NaN;
      this._ultimo = now / 1000;
      this._cbs.push(now); if (this._cbs.length > 90) this._cbs.shift();
      this._cap.push(isFin(md.captureTime)); if (this._cap.length > 90) this._cap.shift();
      this._proc.push(performance.now() - t0); if (this._proc.length > 90) this._proc.shift();
      if (this.alCuadro && img) { try { this.alCuadro(img, ti); } catch (e) { /* Apuntar: no debe romper la grabación */ } }
      v.requestVideoFrameCallback(this._paso);
    }
    _falla(motivo) { if (typeof this.o.onfalla === 'function') { try { this.o.onfalla(motivo); } catch (e) { /* */ } } }
    // La cámara se cortó (llamada, segundo plano, calor): un reintento
    async _perdio(como) {
      this._huecos.push({ t: ahoraS(), ev: como });
      if (this._reintento) { this.activo = false; this._cerrar(); this._falla('camara_detenida'); return; }
      this._reintento = true;
      this._falla('reintentando');
      try {
        this._cerrar();
        await this._abrir();
        const v = video();
        if (v.videoWidth !== this.W || v.videoHeight !== this.H) { this.activo = false; this._falla('rotacion'); return; }
        this._nfPrev = NaN;
        v.requestVideoFrameCallback(this._paso);
        this._falla('reanudada');
      } catch (e) { this.activo = false; this._cerrar(); this._falla('camara_detenida'); }
    }
    _visibilidad() {
      if (!this.activo) return;
      if (document.visibilityState === 'hidden') { this._huecos.push({ t: ahoraS(), ev: 'oculta' }); return; }
      // de vuelta: si la cámara quedó muerta, un reintento
      setTimeout(() => {
        if (!this.activo) return;
        const viva = this.track && this.track.readyState === 'live';
        if (!viva || !(ahoraS() - this._ultimo < 1.5)) this._perdio(viva ? 'sin_cuadros' : 'ended');
      }, 1200);
    }
    _cerrar() {
      if (this.stream) for (const t of this.stream.getTracks()) { try { t.stop(); } catch (e) { /* */ } }
      this.stream = null; this.track = null;
      const v = _video; if (v) { try { v.pause(); } catch (e) { /* */ } v.srcObject = null; }
    }
    // Apaga la cámara; lo grabado se queda para congelar()
    detener() {
      this.activo = false;
      document.removeEventListener('visibilitychange', this._onVis);
      this._cerrar();
    }
    congelar(tA, tB) {
      if (!this.anillo || !this.anillo.n) return null;
      const c = this.anillo.congelar(tA, tB);
      c.vista = this.anilloVista && this.anilloVista.n ? this.anilloVista.congelar(tA, tB) : null;
      c.huecos = this._huecos.slice();
      return c;
    }
    vaciar() { if (this.anillo) this.anillo.vaciar(); if (this.anilloVista) this.anilloVista.vaciar(); this._huecos = []; this._perdidos = 0; }
    estado() {
      const cb = this._cbs, n = cb.length;
      const fps = n > 10 ? (n - 1) / ((cb[n - 1] - cb[0]) / 1000) : NaN;
      const p = this._proc.slice().sort((a, b) => a - b);
      const capF = this._cap.length ? this._cap.filter(Boolean).length / this._cap.length : 0;
      return { activo: this.activo, fps, perdidos: this._perdidos, fuente_t: n ? (capF >= 0.9 ? 'cap' : 'calculada') : null,
               W: this.W, H: this.H, ultimo_s: this._ultimo, proc_ms: p.length ? p[p.length >> 1] : NaN, mute: this._mute,
               zona: this.z ? [this.z.zx, this.z.zy, this.z.zw, this.z.zh] : null, escala: this.z ? this.z.escala : NaN };
    }
  }

  // ------------------------------------------------------------------ JPEG de una imagen (revisión en el resultado)
  async function jpeg(im) {
    const w = im.w, h = im.h, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    let rgba = im.rgba;
    if (!rgba && im.y) { rgba = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { const v = im.y[i]; rgba[4 * i] = v; rgba[4 * i + 1] = v; rgba[4 * i + 2] = v; rgba[4 * i + 3] = 255; } }
    ctx.putImageData(new ImageData(rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), w, h), 0, 0);
    const b = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
    return b ? new Uint8Array(await b.arrayBuffer()) : null;
  }

  // ------------------------------------------------------------------ Apuntar (pantalla aparte)
  // o = { carril:'izq'|'der', zonas:{izq, der} (normalizadas), orig:[W,H], camara:{etiqueta, groupId}, alGuardar(res), alCerrar() }
  // res = { zonas:{izq, der}, orig:[W,H], camara:{etiqueta, groupId} }
  const ZONA_W = 0.125, ZONA_H = 0.347;          // 160×250 px a 1280×720 = 40 000 px: se graba a escala 1
  const LADO_TXT = { izq: 'izquierdo', der: 'derecho' };
  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function abrirApuntar(o) {
    o = o || {};
    if (document.getElementById('camApuntar')) return null;
    const S = root.Semaforo, V = root.SemaforoVision;
    let carril = o.carril === 'der' ? 'der' : 'izq', zonas = { izq: (o.zonas && o.zonas.izq) || null, der: (o.zonas && o.zonas.der) || null };
    let orig = o.orig || null, camara = o.camara || null, lector = null, cerrado = false, ultCal = 0, ultPrueba = 0, probando = false;
    let ultFocos = [], textoPrueba = '', reiniciarCal = true;   // al cambiar la zona, el "movimiento" se mide de nuevo

    const ov = el('div', 'cam-apuntar'); ov.id = 'camApuntar'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Apuntar la cámara');
    const cab = el('div', 'cam-cab');
    const tit = el('h2', null, 'Apuntar la cámara');
    const bx = el('button', 'cam-x', '×'); bx.setAttribute('aria-label', 'Cerrar');
    cab.append(tit, bx);
    const caja = el('div', 'cam-caja');
    const v = video();
    const lienzo = el('canvas', 'cam-lienzo');
    const vacia = el('div', 'cam-vacia', 'Abriendo la cámara…');
    caja.append(lienzo, vacia);
    const ayuda = el('p', 'cam-ayuda', 'Con el teléfono en su soporte, toca el árbol en la imagen para marcar dónde está para tu carril.');
    const carriles = el('div', 'cam-seg'); carriles.setAttribute('role', 'radiogroup'); carriles.setAttribute('aria-label', 'Carril');
    const bI = el('button', null, 'Carril izquierdo'), bD = el('button', null, 'Carril derecho');
    for (const [b, c] of [[bI, 'izq'], [bD, 'der']]) { b.setAttribute('role', 'radio'); b.dataset.c = c; carriles.append(b); }
    const camSel = el('div', 'cam-seg'); camSel.hidden = true; camSel.setAttribute('aria-label', 'Cámara');
    const lista = el('ul', 'cam-calidad');
    const prueba = el('p', 'cam-prueba', 'Modo prueba: cuando el árbol de la pista (o el de Práctica en otro teléfono) haga una secuencia, aquí verás lo que leyó.');
    const acc = el('div', 'cam-acc');
    const bOlv = el('button', 'cam-btn sec', 'Olvidar zona'), bOk = el('button', 'cam-btn', 'Listo');
    acc.append(bOlv, bOk);
    ov.append(cab, caja, ayuda, carriles, camSel, lista, prueba, acc);
    document.body.appendChild(ov);
    document.documentElement.classList.add('cam-abierta');
    // el video va dentro de la caja, a la vista (fuera de Apuntar siempre está escondido)
    caja.insertBefore(v, lienzo); v.classList.remove('cam-oculta'); v.classList.add('cam-vista');

    function pintarCarril() {
      for (const b of [bI, bD]) b.setAttribute('aria-checked', String(b.dataset.c === carril));
      bOlv.disabled = !zonas[carril];
    }
    function zonaCentro(nx, ny) {
      const x = Math.max(0, Math.min(1 - ZONA_W, nx - ZONA_W / 2)), y = Math.max(0, Math.min(1 - ZONA_H, ny - ZONA_H / 2));
      return [x, y, ZONA_W, ZONA_H];
    }
    // rectángulo del video dentro de la caja (object-fit: contain)
    function rectVideo() {
      const r = caja.getBoundingClientRect(), W = v.videoWidth || 16, H = v.videoHeight || 9;
      const e = Math.min(r.width / W, r.height / H), w = W * e, h = H * e;
      return { x: (r.width - w) / 2, y: (r.height - h) / 2, w, h, e, r };
    }
    function dibujar() {
      const r = caja.getBoundingClientRect(), dpr = Math.min(2, root.devicePixelRatio || 1);
      if (lienzo.width !== Math.round(r.width * dpr)) { lienzo.width = Math.round(r.width * dpr); lienzo.height = Math.round(r.height * dpr); }
      const g = lienzo.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, r.width, r.height);
      const R = rectVideo();
      for (const c of ['izq', 'der']) {
        const z = zonas[c]; if (!z) continue;
        g.save();
        g.strokeStyle = c === carril ? '#ffb020' : 'rgba(255,255,255,.7)';
        g.lineWidth = c === carril ? 3 : 1.5;
        if (c !== carril) g.setLineDash([6, 5]);
        g.strokeRect(R.x + z[0] * R.w, R.y + z[1] * R.h, z[2] * R.w, z[3] * R.h);
        g.fillStyle = g.strokeStyle; g.font = '600 13px system-ui, sans-serif';
        g.fillText(c === 'izq' ? 'Izq.' : 'Der.', R.x + z[0] * R.w + 4, R.y + z[1] * R.h - 5);
        g.restore();
      }
      // focos vistos (≤ 2 por segundo), en coordenadas de la zona grabada
      if (lector && lector.z && ultFocos.length) {
        const z = lector.z, W = lector.W, H = lector.H;
        g.save(); g.strokeStyle = '#7cc4ff'; g.lineWidth = 1.5;
        for (const f of ultFocos.slice(0, 14)) {
          const fx = (z.zx + f.x / z.escala) / W, fy = (z.zy + f.y / z.escala) / H, fr = Math.max(4, f.r / z.escala * R.e);
          g.beginPath(); g.arc(R.x + fx * R.w, R.y + fy * R.h, fr, 0, 2 * Math.PI); g.stroke();
        }
        g.restore();
      }
    }
    function filaCal(ic, txt) { const l = el('li'); const a = el('span', 'cam-ic ' + ic, ic === 'bien' ? '✓' : ic === 'mal' ? '✗' : '·'); l.append(a, el('span', null, txt)); return l; }
    function pintarCalidad(cal) {
      if (!lector) return;
      const e = lector.estado();
      lista.textContent = '';
      const fpsTxt = isFin(e.fps) ? e.fps.toFixed(1) : '—';
      lista.append(filaCal(isFin(e.fps) && e.fps >= 50 ? 'bien' : 'mal', `Imagen ${e.W}×${e.H}, ${fpsTxt} cuadros/s · hora ${e.fuente_t === 'cap' ? 'de la cámara' : 'calculada (se calibra sola)'}`));
      if (isFin(e.fps) && e.fps < 45) lista.append(filaCal('mal', 'Con 30 cuadros/s tu reacción sale con ±15 ms en vez de ±8 ms. ¿Modo de bajo consumo?'));
      if (cal) {
        const luz = cal.saturado > 0.25 ? ['mal', `Imagen quemada (${Math.round(cal.saturado * 100)} %): sol de frente o reflejo`]
          : cal.oscuro > 0.6 ? ['mal', 'Imagen muy oscura'] : ['bien', 'Luz bien'];
        lista.append(filaCal(luz[0], luz[1]));
        if (isFin(cal.mov)) lista.append(filaCal(cal.mov < 3 ? 'bien' : 'mal', cal.mov < 3 ? 'Imagen quieta' : 'La imagen se mueve: fija bien el soporte'));
      }
      lista.append(filaCal(isFin(e.proc_ms) && e.proc_ms < 8 ? 'bien' : 'info', `Grabar cada cuadro tarda ${isFin(e.proc_ms) ? e.proc_ms.toFixed(1) : '—'} ms` + (lector.z.propia ? '' : ' · sin zona: graba la imagen completa reducida')));
    }
    function alCuadro(img) {
      const t = performance.now();
      if (t - ultCal > 500 && V && S) {               // calidad y focos a ≤ 2 Hz
        ultCal = t;
        let cal = null; try { cal = S.calidad(img.data, img.width, img.height, { reiniciar: reiniciarCal }); } catch (e) { cal = null; }
        reiniciarCal = false;
        ultFocos = cal && cal.focos ? cal.focos : [];
        pintarCalidad(cal); dibujar();
      }
      if (t - ultPrueba > 1500 && !probando && S && lector.anillo.n > 90) {
        ultPrueba = t; probando = true;
        setTimeout(() => {               // fuera del callback del cuadro
          try {
            const tB = ahoraS(), c = lector.anillo.congelar(tB - 5, tB);
            const r = S.prueba(c, { carril, arbol: 'auto' });
            // solo secuencias que ya terminaron hace ≥ 0.5 s (no se muestra nada "en vivo")
            const s = r.filter((x) => isFin(x.t_ambar_ref) && (isFin(x.t_verde_vista) ? x.t_verde_vista : x.t_ambar_ref + (x.delta_s || 0.4)) < tB - 0.5).pop();
            if (s) {
              const nom = s.tipo === 'full' ? 'Full .5' : 'Pro .4';
              textoPrueba = isFin(s.t_verde_vista) ? `Vi un árbol ${nom} en el carril ${LADO_TXT[carril]}: último ámbar → verde ${(s.t_verde_vista - s.t_ambar_ref).toFixed(3)} s` +
                (isFin(s.s_ambar) ? ` (±${Math.max(1, Math.round(1000 * Math.hypot(s.s_ambar, s.s_verde || 0)))} ms)` : '') : `Vi un árbol ${nom} en el carril ${LADO_TXT[carril]}, sin la verde.`;
              prueba.textContent = 'Modo prueba: ' + textoPrueba;
              prueba.classList.add('visto');
            }
          } catch (e) { /* la prueba es solo informativa */ }
          probando = false;
        }, 0);
      }
    }
    async function arrancar() {
      if (lector) lector.detener();
      lector = new Lector({ zonaNorm: zonas[carril], orig, camara, vista: null, mem_mb: 16, onfalla: (m) => { if (m === 'camara_detenida' || m === 'rotacion') vacia.hidden = false, vacia.textContent = m === 'rotacion' ? 'El teléfono giró: vuelve a tocar el árbol.' : 'La cámara se detuvo.'; } });
      const r = await lector.iniciar();
      if (cerrado) { lector.detener(); return; }
      if (!r.ok) {
        vacia.hidden = false;
        vacia.textContent = r.motivo === 'sin_permiso' ? 'Sin permiso de cámara. iPhone: Ajustes › Apps › Safari › Cámara. Android: candado de la barra › Permisos.'
          : r.motivo === 'no_soportado' || r.motivo === 'inseguro' ? 'Este navegador no puede leer la cámara.' : 'No se pudo abrir la cámara.';
        return;
      }
      vacia.hidden = true;
      // la cámara física en uso, para recordarla; botones de lente si hay más de una física
      const l = await camaras(), usada = l.find((c) => c.etiqueta === r.etiqueta);
      camara = usada ? { etiqueta: usada.etiqueta, groupId: usada.groupId } : camara;
      const fis = l.filter((c) => c.tipo === 'principal' || c.tipo === 'gran_angular');
      camSel.textContent = '';
      if (fis.length > 1) {
        camSel.hidden = false;
        for (const c of fis) {
          const b = el('button', null, c.tipo === 'gran_angular' ? 'Gran angular' : 'Principal'); b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', String(!!usada && c.etiqueta === usada.etiqueta));
          b.addEventListener('click', () => { camara = { etiqueta: c.etiqueta, groupId: c.groupId }; zonas = { izq: null, der: null }; arrancar(); pintarCarril(); });
          camSel.append(b);
        }
      } else camSel.hidden = true;
      orig = [r.W, r.H];
      lector.alCuadro = alCuadro;
      dibujar();
    }
    caja.addEventListener('click', (ev) => {
      if (!lector || !lector.W) return;
      const R = rectVideo(), x = ev.clientX - R.r.left - R.x, y = ev.clientY - R.r.top - R.y;
      if (x < 0 || y < 0 || x > R.w || y > R.h) return;
      zonas[carril] = zonaCentro(x / R.w, y / R.h);
      orig = [lector.W, lector.H];
      lector.cambiarZona(zonas[carril], orig); reiniciarCal = true;
      textoPrueba = ''; prueba.classList.remove('visto');
      prueba.textContent = 'Modo prueba: cuando el árbol de la pista (o el de Práctica en otro teléfono) haga una secuencia, aquí verás lo que leyó.';
      pintarCarril(); dibujar();
    });
    carriles.addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      carril = b.dataset.c; pintarCarril();
      if (lector && lector.W) { lector.cambiarZona(zonas[carril], orig); reiniciarCal = true; }
      dibujar();
    });
    bOlv.addEventListener('click', () => { zonas[carril] = null; if (lector && lector.W) { lector.cambiarZona(null, orig); reiniciarCal = true; } pintarCarril(); dibujar(); });
    function cerrar(guardar) {
      if (cerrado) return;
      cerrado = true;
      if (lector) lector.detener();
      v.classList.remove('cam-vista'); v.classList.add('cam-oculta'); document.body.appendChild(v);
      ov.remove(); document.documentElement.classList.remove('cam-abierta');
      root.removeEventListener('resize', dibujar);
      if (guardar && typeof o.alGuardar === 'function') o.alGuardar({ zonas: { izq: zonas.izq, der: zonas.der }, orig, camara });
      if (typeof o.alCerrar === 'function') o.alCerrar();
    }
    bx.addEventListener('click', () => cerrar(false));
    bOk.addEventListener('click', () => cerrar(true));
    root.addEventListener('resize', dibujar);
    pintarCarril();
    arrancar();
    return { cerrar, estado: () => (lector ? lector.estado() : null), _lector: () => lector, _zonas: () => zonas };
  }

  root.DragCam = { soporte, permiso, pedirPermiso, camaras, video, Lector, abrirApuntar, jpeg, _zonaPx: zonaPx, _tipoDe: tipoDe };
})(typeof self !== 'undefined' ? self : this);
