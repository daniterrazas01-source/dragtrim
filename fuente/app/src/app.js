/* app.js — Interfaz de Drag Tree beta */
(function () {
  'use strict';
  const C = window.DragCore;
  const APP_VERSION = 'beta 0.6.2';
  const $ = (s) => document.querySelector(s);
  const isFin = Number.isFinite;

  // ------------------------------------------------------------ ajustes
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
  };
  const DEF = { dist: 402.336, rollout_ft: 1, unidad: 'kmh', v_confirma_kmh: 50, t_confirma: 8, usar_acc: true, tema: 'auto', anim: true, fondo: 'combinado', velo: '0.78',
    // Semáforo con cámara (beta 0.6): zona del árbol por carril (normalizada al cuadro orig), cámara física elegida,
    // retraso cámara↔giroscopio medido por carril (últimos valores), sesgo del acelerómetro y correcciones con boleta (ms)
    cam: false, cam_arbol: 'pro', cam_zona: { izq: null, der: null }, cam_orig: null, cam_camara: null, cam_info: null,
    cam_delta: { izq: [], der: [] }, cam_sesgo_acel: null, cam_ajuste: { camara_ms: 0, acel_ms: 0 }, cam_cuadros: true, cam_carril: 'izq' };
  const S = Object.assign({}, DEF, LS.get('dragtrim.settings', {}));
  for (const k of ['cam_zona', 'cam_delta', 'cam_ajuste']) S[k] = Object.assign({}, DEF[k], S[k] || {});
  const guardarAjustes = () => LS.set('dragtrim.settings', S);
  // "Medir con el semáforo real" está fuera de la app (0.6.2, Daniel: presentó fallos; se retoma más adelante): no se ve
  // en Medir, Ajustes, resultados ni Historial y no prende la cámara. El código sigue: para desarrollarlo y en las
  // pruebas, index.html?camdev o localStorage dragtrim.camDev = true.
  const CAM_DEV = /[?&]camdev\b/.test(location.search) || LS.get('dragtrim.camDev', false) === true;
  if (!CAM_DEV) S.cam = false;
  // Árbol de la pista: Pro .400 o Full .500 (ya no hay "Automático"; quien lo tenía toma el de Práctica)
  if (S.cam_arbol !== 'pro' && S.cam_arbol !== 'full') { S.cam_arbol = LS.get('dragtrim.practica.cfg', {}).arbol === 'full' ? 'full' : 'pro'; guardarAjustes(); }

  function cfgActual() {
    return {
      distancia_final: S.dist, rollout_ft: S.rollout_ft,
      v_confirma: S.v_confirma_kmh / 3.6, t_confirma: S.t_confirma, usar_acc: S.usar_acc,
    };
  }

  // ------------------------------------------------------------ formato
  const fmtT = (t) => isFin(t) ? t.toFixed(3) : '—';
  const velU = () => S.unidad === 'mph' ? 'mph' : 'km/h';
  const velConv = (kmh) => S.unidad === 'mph' ? kmh / 1.609344 : kmh;
  const fmtV = (kmh, dec = 1) => isFin(kmh) ? velConv(kmh).toFixed(dec) : '—';
  const nombreDist = (d) => d < 300 ? '1/8 de milla' : '1/4 de milla';
  const sello = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  };
  const fechaCorta = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ', ' +
      d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------ animaciones
  const conAnim = () => S.anim !== false && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Los números marcados con data-cnt cuentan desde 0 hasta su valor (solo es visual; el valor final es el mismo).
  function contar(raiz, retraso = 250, dur = 750) {
    if (!conAnim()) return;
    for (const el of raiz.querySelectorAll('[data-cnt]')) {
      const nodo = el.firstChild;
      if (!nodo || nodo.nodeType !== 3) continue;
      const txt = nodo.nodeValue, x = parseFloat(txt);
      if (!isFin(x)) continue;
      const dec = (txt.split('.')[1] || '').length;
      nodo.nodeValue = (0).toFixed(dec);
      const t0 = performance.now() + retraso;
      const paso = (ahora) => {
        const p = Math.min(1, Math.max(0, (ahora - t0) / dur));
        nodo.nodeValue = p >= 1 ? txt : (x * (1 - Math.pow(1 - p, 3))).toFixed(dec);
        if (p < 1 && nodo.isConnected) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    }
  }

  // ------------------------------------------------------------ tiempo
  const T_ORIGIN = performance.timeOrigin || (Date.now() - performance.now());
  const nowS = () => performance.now() / 1000;

  // ------------------------------------------------------------ buffers de sensores
  const buf = { gps: null, acc: null, gyr: null };
  function limpiarBuffers() {
    buf.gps = { t: [], v: [], hacc: [], lat: [], lon: [] };
    buf.acc = { t: [], ax: [], ay: [], az: [] };
    buf.gyr = { t: [], a: [], b: [], g: [] };      // giroscopio (°/s): retraso cámara↔sensores (K1)
  }
  limpiarBuffers();

  function recortar(b, desde) {
    let k = 0; while (k < b.t.length && b.t[k] < desde) k++;
    if (k > 0) for (const key of Object.keys(b)) b[key].splice(0, k);
  }

  const sens = {
    activo: false, fuente: 'real', watch: null, motion: false, wake: null,
    ultGps: null, gpsDts: [], ultGpsRec: 0, accN: 0, accT0: NaN, accHz: NaN, ultAccRec: 0,
    velDePos: false,
  };

  function pushGps(s) {
    const b = buf.gps;
    if (b.t.length && s.t <= b.t[b.t.length - 1]) return;
    if (b.t.length) {
      sens.gpsDts.push(s.t - b.t[b.t.length - 1]);
      if (sens.gpsDts.length > 10) sens.gpsDts.shift();
    }
    b.t.push(s.t); b.v.push(s.v); b.hacc.push(s.hacc); b.lat.push(s.lat); b.lon.push(s.lon);
    sens.ultGps = s; sens.ultGpsRec = nowS();
    if (ses.fase !== 'corrida' && ses.fase !== 'procesando') recortar(b, s.t - 600);
    alGps(s);
  }

  function pushAcc(t, x, y, z) {
    const b = buf.acc;
    if (b.t.length && t <= b.t[b.t.length - 1]) return;
    b.t.push(t); b.ax.push(x); b.ay.push(y); b.az.push(z);
    sens.accN++; sens.ultAccRec = nowS();
    if (!isFin(sens.accT0)) sens.accT0 = t;
    if (sens.accN >= 60) { sens.accHz = (sens.accN - 1) / (t - sens.accT0); sens.accN = 0; sens.accT0 = NaN; }
    if (b.t.length % 600 === 0 && ses.fase !== 'corrida' && ses.fase !== 'procesando') recortar(b, t - 60);
  }
  function pushGyr(t, r) {
    const b = buf.gyr;
    if (!r || r.alpha == null || (b.t.length && t <= b.t[b.t.length - 1])) return;
    b.t.push(t); b.a.push(r.alpha); b.b.push(r.beta); b.g.push(r.gamma);
    if (b.t.length % 600 === 0 && ses.fase !== 'corrida' && ses.fase !== 'procesando') recortar(b, t - 60);
  }

  // ---- GPS real
  function onPosition(pos) {
    if (sens.fuente !== 'real') return;
    const c = pos.coords, rec = nowS();
    let t = (pos.timestamp - T_ORIGIN) / 1000;
    if (!(t <= rec + 0.3 && t >= rec - 3)) t = rec;  // marca de tiempo dudosa: usar la de llegada
    const last = sens.ultGps;
    if (last && t <= last.t) return;
    let v = c.speed;
    if (v == null || !isFin(v) || v < 0) {
      // Sin velocidad del GPS: se estima con la posición; un salto menor que el
      // error de posición se toma como detenido para no inventar movimiento.
      v = 0;
      if (last && t - last.t > 0.2) {
        const dist = C.haversine(last.lat, last.lon, c.latitude, c.longitude);
        if (dist > Math.max(2, 0.5 * c.accuracy)) v = dist / (t - last.t);
      }
      sens.velDePos = true;
    }
    pushGps({ t, v, hacc: c.accuracy, lat: c.latitude, lon: c.longitude });
  }
  function onGpsError(err) {
    if (err.code === 1) {
      mensaje('El permiso de ubicación está negado. Actívalo para este sitio en la configuración del navegador y recarga la página.', true);
      $('#chipGps').className = 'chip bad';
    } else if (err.code === 2) {
      mensaje('No hay señal de ubicación. Sal al aire libre y revisa que la ubicación del teléfono esté encendida.', true);
    }
    // code 3 (timeout): se sigue esperando
  }

  // ---- Acelerómetro real
  function onMotion(e) {
    if (sens.fuente !== 'real') return;
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    const rec = nowS();
    let t = e.timeStamp;
    t = !t ? rec : (t > 1e11 ? (t - T_ORIGIN) / 1000 : t / 1000);
    if (Math.abs(t - rec) > 2) t = rec;
    sens.motion = true;
    pushAcc(t, g.x, g.y, g.z);
    pushGyr(t, e.rotationRate);
  }

  async function pedirPantalla() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        sens.wake = await navigator.wakeLock.request('screen');
        sens.wake.addEventListener('release', () => { sens.wake = null; chips(); });
      }
    } catch (e) { sens.wake = null; }
    chips();
  }

  async function activarSensores() {
    mensaje('');
    // iOS: el permiso de movimiento debe pedirse primero, dentro del toque
    let motionOk = true;
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try { motionOk = (await DeviceMotionEvent.requestPermission()) === 'granted'; } catch (e) { motionOk = false; }
    }
    if (!window.isSecureContext) {
      mensaje('Para usar el GPS la app debe abrirse desde un enlace https://, no como archivo.', true);
      return;
    }
    if (!('geolocation' in navigator)) { mensaje('Este navegador no tiene acceso a la ubicación.', true); return; }
    if (motionOk && 'DeviceMotionEvent' in window) window.addEventListener('devicemotion', onMotion);
    else if (!motionOk) mensaje('Sin permiso de movimiento: se medirá solo con GPS (menos preciso).');
    if (S.cam) await pedirPermisoCam();
    sens.watch = navigator.geolocation.watchPosition(onPosition, onGpsError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    sens.activo = true;
    pedirPantalla();
    $('#btnSensores').hidden = true;
    pintarCam();
    setTimeout(() => {
      if (sens.activo && !sens.motion && sens.fuente === 'real' && !$('#idleMsg').textContent)
        mensaje('No llegan datos del acelerómetro: se medirá solo con GPS (menos preciso).');
    }, 4000);
    tickEstado();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (sens.activo) pedirPantalla();
      if (ses.fase === 'espera' || ses.fase === 'corrida') {
        if (ses.oculta) logEvento('La app estuvo en segundo plano: el GPS pudo pausarse.', 'red');
      }
    } else if (ses.fase === 'espera' || ses.fase === 'corrida') {
      ses.oculta = true;
    }
  });

  // ------------------------------------------------------------ estado en pantalla
  function chips() {
    const now = nowS();
    const gpsVivo = sens.ultGps && now - sens.ultGpsRec < 4;
    const prec = sens.ultGps ? sens.ultGps.hacc : NaN;
    const g = $('#chipGps');
    if (sens.fuente === 'demo') g.className = 'chip on';
    else if (!sens.activo) g.className = 'chip';
    else if (!gpsVivo) g.className = 'chip bad';
    else g.className = 'chip ' + (prec <= 15 ? 'on' : 'warn');
    const a = $('#chipAcc');
    const accVivo = sens.ultAccRec > 0 && now - sens.ultAccRec < 2;
    a.className = 'chip ' + (sens.fuente === 'demo' || accVivo ? 'on' : (sens.activo ? 'warn' : ''));
    $('#chipWake').className = 'chip ' + (sens.wake ? 'on' : (sens.activo ? 'warn' : ''));
    // Cám: solo dice si llegan cuadros (nunca nada del árbol)
    const cc = $('#chipCam');
    cc.hidden = !S.cam;
    if (S.cam) {
      const L = ses.lector, e = L ? L.estado() : null;
      const armada = ses.fase === 'espera' || ses.fase === 'corrida';
      if (ses.camFalla) cc.className = 'chip bad';
      else if (e && e.activo) cc.className = 'chip ' + (nowS() - e.ultimo_s < 1 && !(e.fps < 45) ? 'on' : 'warn');
      else cc.className = 'chip' + (armada && !ses.demo ? ' warn' : '');
    }
  }

  function tickEstado() {
    chips();
    if (ses.fase === 'idle') {
      const s = sens.ultGps, vivo = s && nowS() - sens.ultGpsRec < 4;
      const pe = $('#sPrec');
      if (!sens.activo) { pe.textContent = '—'; pe.className = 'val'; }
      else if (!s) { pe.textContent = 'buscando…'; pe.className = 'val meh'; }
      else {
        pe.textContent = `±${Math.round(s.hacc)} m`;
        pe.className = 'val ' + (!vivo ? 'bad' : s.hacc <= 8 ? 'good' : s.hacc <= 15 ? 'meh' : 'bad');
      }
      const hz = sens.gpsDts.length ? 1 / median(sens.gpsDts) : NaN;
      $('#sHz').textContent = isFin(hz) ? `${hz < 1.5 ? hz.toFixed(1) : Math.round(hz)} Hz` : '—';
      $('#sVel').textContent = s ? `${fmtV(s.v * 3.6, 0)} ${velU()}` : '—';
      const ae = $('#sAcel');
      const accVivo = sens.ultAccRec > 0 && nowS() - sens.ultAccRec < 2;
      ae.textContent = accVivo && isFin(sens.accHz) ? `${Math.round(sens.accHz)} Hz` : (sens.activo ? 'sin datos' : '—');
      ae.className = 'val ' + (accVivo ? 'good' : (sens.activo ? 'meh' : ''));
    }
    // la cámara graba como máximo 30 min armada (calor y batería)
    if (ses.lector && ses.lector.activo && ses.fase === 'espera' && nowS() - ses.camT0 > 60 * CAM_MAX_MIN) {
      detenerCamara(); ses.camFalla = 'tiempo';
      logEvento(`La cámara se apagó: llevaba ${CAM_MAX_MIN} min armada. Vuelve a armar para grabar el semáforo.`, 'red');
    }
    if ((ses.fase === 'espera' || ses.fase === 'corrida') && sens.fuente === 'real') {
      const s = sens.ultGps;
      $('#gpsLine').textContent = s ? `GPS ±${Math.round(s.hacc)} m` + (nowS() - sens.ultGpsRec > 3 ? ', sin lecturas nuevas' : '') : 'Buscando GPS…';
      if (ses.fase === 'corrida' && nowS() - sens.ultGpsRec > 8) finCorrida('sin GPS');
    }
  }
  setInterval(tickEstado, 500);

  function median(a) { const s = a.slice().sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  function mensaje(txt, err) {
    const m = $('#idleMsg'); m.textContent = txt || ''; m.className = 'msg' + (err ? ' err' : '');
  }

  // ------------------------------------------------------------ sesión
  const ses = { fase: 'idle', det: null, demo: false, oculta: false, demoTimer: null, rojoTimer: null, ignorados: [],
                carril: null, lector: null, camInfo: null, camFalla: null, camT0: NaN, demoSim: null };
  const CAM_MAX_MIN = 30;


  function logEvento(txt, cls) {
    const li = document.createElement('li'); li.textContent = txt; if (cls) li.className = cls;
    const log = $('#eventLog'); log.prepend(li);
    while (log.children.length > 6) log.lastChild.remove();
  }

  function pintarPista() {
    const tr = $('#track');
    tr.querySelectorAll('.tick').forEach((e) => e.remove());
    const Df = ses.det.cfg.distancia_final, tope = Df + ses.det.cfg.margen_final_m;
    for (const [nombre, D] of ses.det.cfg.hitos) {
      if (D > Df + 0.01) continue;
      const tk = document.createElement('div'); tk.className = 'tick'; tk.dataset.n = nombre;
      tk.style.left = (D / tope * 100) + '%';
      tk.innerHTML = `<span>${esc(nombre)}</span>`;
      tr.appendChild(tk);
    }
  }

  function armar(carril) {
    ses.det = new C.DetectorVivo(cfgActual());
    ses.fase = 'espera'; ses.oculta = false; ses.ignorados = [];
    ses.carril = carril === 'der' ? 'der' : carril === 'izq' ? 'izq' : null;
    if (ses.carril) { S.cam_carril = ses.carril; guardarAjustes(); }
    recortar(buf.gps, (buf.gps.t[buf.gps.t.length - 1] || 0) - 30);
    recortar(buf.acc, (buf.acc.t[buf.acc.t.length - 1] || 0) - 30);
    recortar(buf.gyr, (buf.gyr.t[buf.gyr.t.length - 1] || 0) - 30);
    document.body.classList.add('sesion');
    mostrarVista('vMedir');
    $('#medirIdle').hidden = true; $('#medirSesion').hidden = false;
    $('#sesTitulo').textContent = 'Esperando tu arranque';
    $('#sesTexto').textContent = 'La app no da la salida: arranca con el semáforo de la pista. El burnout, la alineación y el stage se ignoran.';
    $('#liveMain').innerHTML = `0<small>${velU()}</small>`;
    $('#liveSub').hidden = true; $('#track').hidden = true; $('#trackFill').style.width = '0';
    $('#btnTerminar').hidden = true; $('#btnCancelar').hidden = false;
    $('#eventLog').innerHTML = ''; $('#gpsLine').textContent = ses.demo ? 'Corrida simulada' : '';
    pintarPista();
    ses.camFalla = null; ses.camInfo = null;
    if (S.cam && !ses.demo && ses.carril) iniciarCamara(ses.carril);
    else detenerCamara();
  }

  // ------------------------------------------------------------ cámara (semáforo real, beta)
  // Mientras la medición está armada la cámara SOLO graba en memoria: no se analiza ni se muestra nada.
  async function iniciarCamara(carril) {
    detenerCamara();
    if (!window.DragCam || !window.Semaforo) return;
    const L = new DragCam.Lector({ zonaNorm: S.cam_zona[carril] || null, orig: S.cam_orig, camara: S.cam_camara, onfalla: camFalla });
    ses.lector = L; ses.camInfo = { carril, ok: false, motivo: 'abriendo' };
    const r = await L.iniciar();
    if (ses.lector !== L) { L.detener(); return; }          // se canceló mientras abría
    ses.camInfo = Object.assign({ carril }, r);
    if (!r.ok) {
      ses.lector = null; ses.camFalla = r.motivo;
      logEvento(r.motivo === 'sin_permiso' ? 'Sin permiso de cámara: esta corrida se mide sin semáforo.'
        : r.motivo === 'abriendo' ? 'La cámara no terminó de abrir antes de tu arranque: esta corrida se mide sin semáforo.'
        : 'No se pudo abrir la cámara: esta corrida se mide sin semáforo.', 'red');
    } else ses.camT0 = nowS();
    chips();
  }
  function camFalla(m) {
    if (m === 'reintentando') logEvento('La cámara se detuvo; reintentando.', 'red');
    else if (m === 'camara_detenida') { ses.camFalla = m; logEvento('La cámara no volvió: esta corrida se mide sin semáforo.', 'red'); }
    else if (m === 'rotacion') { ses.camFalla = m; logEvento('El teléfono cambió de orientación: esta corrida se mide sin semáforo.', 'red'); }
    chips();
  }
  // Apaga la cámara; lo grabado se queda en el lector (para analizar al final) hasta soltarlo
  function detenerCamara(soltar = true) {
    if (ses.lector) { ses.lector.detener(); if (soltar) ses.lector = null; }
  }
  async function pedirPermisoCam() {
    if (!window.DragCam) return false;
    const r = await DragCam.pedirPermiso();
    sens.camPermiso = r.ok ? 'si' : r.motivo;
    pintarCam();
    return r.ok;
  }

  function alGps(s) {
    if (ses.fase !== 'espera' && ses.fase !== 'corrida') return;
    const ev = ses.det.feed(s.t, s.v);
    for (const e of ev) {
      if (e.tipo === 'ignorado') {
        ses.ignorados.push(e.vmax);
        logEvento(`Movimiento ignorado (${fmtV(e.vmax * 3.6, 0)} ${velU()}, ${Math.round(e.dist)} m): no fue arranque.`);
      } else if (e.tipo === 'arranque') {
        ses.fase = 'corrida';
        detenerCamara(false);
        $('#sesTitulo').textContent = 'Corrida en curso';
        $('#sesTexto').textContent = 'Arranque detectado. La medición termina sola al pasar la meta.';
        $('#liveSub').hidden = false; $('#track').hidden = false; $('#btnTerminar').hidden = false;
        logEvento(`Arranque detectado: ${fmtV(e.v * 3.6, 0)} ${velU()} a los ${e.dt.toFixed(1)} s.`);
      } else if (e.tipo === 'hito') {
        const tk = $(`#track .tick[data-n="${CSS.escape(e.nombre)}"]`); if (tk) tk.classList.add('passed');
      } else if (e.tipo === 'fin') {
        finCorrida(e.motivo);
      }
    }
    if (ses.fase === 'corrida') {
      const tope = ses.det.cfg.distancia_final + ses.det.cfg.margen_final_m;
      $('#liveMain').innerHTML = `${Math.round(ses.det.dVivo)}<small>m</small>`;
      $('#liveSub').innerHTML = `${fmtV(s.v * 3.6, 0)}<small>${velU()}</small>`;
      $('#trackFill').style.width = Math.min(100, ses.det.dVivo / tope * 100) + '%';
    } else if (ses.fase === 'espera') {
      $('#liveMain').innerHTML = `${fmtV(s.v * 3.6, 0)}<small>${velU()}</small>`;
    }
  }

  function finCorrida(motivo) {
    if (ses.fase !== 'corrida') return;
    ses.fase = 'procesando';
    $('#sesTitulo').textContent = 'Calculando…';
    $('#sesTexto').textContent = motivo === 'meta' ? 'Meta superada.' :
      motivo === 'detenido' ? 'Vehículo detenido.' : motivo === 'sin GPS' ? 'Se perdió el GPS.' : 'Corrida terminada.';
    setTimeout(finalizar, ses.demo ? 150 : 1200);   // juntar las últimas muestras
  }

  async function finalizar() {
    pararDemo();
    const cfg = Object.assign(cfgActual(), { t_inicio_busqueda: ses.det.tArr - 0.5 });
    let R;
    try { R = C.procesar(buf.gps, buf.acc, cfg); }
    catch (err) { R = { ok: false, mensaje: 'Error al calcular: ' + err.message, avisos: [] }; }
    if (R.ok) {   // los movimientos previos los cuenta el detector en vivo
      R.calidad.mov_ignorados = ses.ignorados.length;
      R.calidad.v_max_ignorado_kmh = ses.ignorados.length ? Math.max(...ses.ignorados) * 3.6 : 0;
    }
    if (sens.velDePos && !ses.demo) R.avisos.push('Tu navegador no entrega la velocidad GPS; se calculó con la posición (menos preciso).');
    if (ses.oculta && !ses.demo) R.avisos.push('La app estuvo en segundo plano durante la sesión; puede faltar información.');
    const run = construirRun(R, cfg);
    let datosCam = null;
    if (S.cam && (ses.lector || ses.camInfo || ses.demo)) {
      $('#sesTexto').textContent = 'Leyendo el semáforo…';
      await ceder();
      try { datosCam = await analizarCamara(run, R); } catch (e) { run.cam = { v: 1, motivo: 'error', error: String(e && e.message || e) }; }
    }
    detenerCamara();
    await DB.put(run);
    if (datosCam && S.cam_cuadros !== false) await DB.putCam(datosCam);
    if (run.cam && !run.demo) aprenderSesgo();
    ses.fase = 'resultado';
    mostrarResultado(run, true);
  }

  function construirRun(R, cfg) {
    const ahora = new Date();
    const t0ref = ses.det.tArr;
    const g = buf.gps, a = buf.acc, gy = buf.gyr;
    const gi = g.t.findIndex((x) => x >= t0ref - 20), ai = a.t.findIndex((x) => x >= t0ref - 8), yi = gy.t.findIndex((x) => x >= t0ref - 8);
    const sl = (b, i) => { const o = {}; for (const k of Object.keys(b)) o[k] = i < 0 ? [] : b[k].slice(i); return o; };
    const run = {
      id: ahora.getTime(), fecha: ahora.toISOString(), sello: sello(ahora), demo: ses.demo, app: APP_VERSION,
      cfg, ok: R.ok, mensaje: R.mensaje, avisos: R.avisos || [],
      raw: { gps: sl(g, gi), acc: sl(a, ai), gyr: sl(gy, yi) },
    };
    aplicarR(run, R);
    return run;
  }

  const ceder = () => new Promise((r) => setTimeout(r, 0));
  // Contexto de la reacción con lo aprendido y las correcciones actuales
  function ctxCam(carril, R) {
    const d = (S.cam_delta[carril] || []).filter(isFin);
    return {
      carril, arbol: S.cam_arbol, tRo: R && R.ok ? R.tRo : NaN, R: R && R.ok ? R : null,
      delta_guardado_s: d.length ? median(d) : NaN, sesgo_acel_s: isFin(S.cam_sesgo_acel) ? S.cam_sesgo_acel : NaN,
      ajuste: { camara_s: (S.cam_ajuste.camara_ms || 0) / 1000, acel_s: (S.cam_ajuste.acel_ms || 0) / 1000 },
    };
  }
  function resumenSec(sec) {
    if (!sec) return null;
    const o = Object.assign({}, sec); delete o.candidatos; if (o.otra) { o.otra = Object.assign({}, o.otra); delete o.otra.candidatos; delete o.otra.otra; }
    return o;
  }
  // Lee el semáforo de lo grabado (o, en la corrida simulada, de un árbol simulado con el mismo arranque).
  // Devuelve los datos pesados para el store 'camdatos' (o null) y deja el resumen en run.cam.
  async function analizarCamara(run, R) {
    const carril = ses.carril || S.cam_carril || 'izq';
    let cuadros = null, giro = null, info = ses.camInfo || {};
    if (ses.demo) {
      if (!window.SemaforoSim || !ses.demoSim) return null;
      const rt = 0.02 + 0.45 * Math.random(), tipo = S.cam_arbol === 'full' ? 'full' : 'pro';
      const sim = SemaforoSim.simular(SemaforoSim.desdeSesion(ses.demoSim, { rt_s: rt, tipo, carril, fps: 60, seed: Math.floor(Math.random() * 1e6),
        lat_imu_s: 0, t_inicio: ses.demoSim.verdad.t_ro_abs - 6.5, t_fin: ses.demoSim.verdad.t_ro_abs + 1.2 }));
      cuadros = sim.cuadros; giro = sim.giro;
      info = { ok: true, W: 1280, H: 720, etiqueta: 'simulada', simulada: { rt_s: rt, tipo } };
      await ceder();
    } else {
      const L = ses.lector;
      if (!L) { run.cam = { v: 1, semaforo: Semaforo.VERSION, cfg: { carril, arbol: S.cam_arbol }, motivo: info.motivo || 'sin_cuadros', camara: info }; return null; }
      const e = L.estado();
      cuadros = L.congelar();
      info = Object.assign({}, info, { fps_medido: e.fps, perdidos: e.perdidos, proc_ms: e.proc_ms });
      const t0 = R && R.ok ? R.tRo - 12 : -Infinity, gy = buf.gyr, k = gy.t.findIndex((x) => x >= t0);
      giro = k < 0 ? null : { t: gy.t.slice(k), a: gy.a.slice(k), b: gy.b.slice(k), g: gy.g.slice(k) };
      if (giro && giro.t.length < 20) giro = null;
    }
    if (!cuadros || !cuadros.n) { run.cam = { v: 1, semaforo: Semaforo.VERSION, cfg: { carril, arbol: S.cam_arbol }, motivo: ses.camFalla || 'sin_cuadros', camara: info }; return null; }
    const ctx = ctxCam(carril, R);
    ctx.giro = giro;
    const A = Semaforo.analizar(cuadros, ctx);
    await ceder();
    const sec = resumenSec(A.sec), rt = A.rt || null;
    run.cam = {
      v: 1, semaforo: Semaforo.VERSION, cfg: { carril, arbol: S.cam_arbol },
      camara: { W: info.W, H: info.H, fps_medido: info.fps_medido, perdidos: info.perdidos, proc_ms: info.proc_ms, etiqueta: info.etiqueta || null,
                simulada: info.simulada || null, fuente_t: cuadros.reloj ? cuadros.reloj.fuente : null },
      zona: cuadros.zona, escala: cuadros.escala, orig: cuadros.orig,
      reloj: cuadros.reloj ? { fuente: cuadros.reloj.fuente, c0: cuadros.reloj.c0, c1: cuadros.reloj.c1, lat_min_s: cuadros.reloj.lat_min_s, jitter_s: cuadros.reloj.jitter_s, fps: cuadros.reloj.fps, perdidos: cuadros.reloj.perdidos } : null,
      sec, k1: A.k1 || null, rt, motivo: A.motivo || null, error: A.error || null, ms: Math.round(A.ms || 0),
      delta_usado: rt ? rt.delta : null, ajuste_usado: ctx.ajuste, manual: null, tiene_datos: !!A.rasgos, huecos: cuadros.huecos || [],
    };
    // aprender el retraso cámara↔giroscopio de este carril (para corridas sin cabeceo medible)
    if (!ses.demo && A.k1 && A.k1.ok) {
      const d = (S.cam_delta[carril] || []).filter(isFin); d.push(A.k1.delta_s); while (d.length > 9) d.shift();
      S.cam_delta[carril] = d; guardarAjustes();
    }
    if (!A.rasgos) return null;
    // datos pesados (store 'camdatos'): rasgos para reanalizar, y un clip y una tira de imágenes para revisar
    const datos = { id: run.id, rasgos: A.rasgos, crudos: A.crudos, mov: A.mov, disp: A.disp, k1: A.k1, clip: null, tira_jpg: null };
    try {
      const caja = A.disp && A.disp.caja, s0 = A.sec || {};
      if (caja && A.mov) {
        const m = Math.max(6, 0.6 * caja[3]), cj = [caja[0] - m, caja[1] - m, caja[2] + 2 * m, caja[3] + 2 * m];
        const tR = isFin(s0.t_ambar_ref) ? s0.t_ambar_ref : (rt && isFin(rt.L) ? rt.L - 0.6 : NaN);
        const cl = Semaforo.clip(cuadros, A.mov, cj, tR - 1.2, tR + 1.6);
        datos.clip = cl;
        const marcas = [];
        if (isFin(s0.t_ambar_ref)) marcas.push({ t: s0.t_ambar_ref, etiqueta: 'AMBAR', color: 'ambar' });
        if (isFin(s0.t_verde_vista)) marcas.push({ t: s0.t_verde_vista, etiqueta: 'VERDE', color: 'verde' });
        if (isFin(s0.t_roja_vista)) marcas.push({ t: s0.t_roja_vista, etiqueta: 'ROJA', color: 'rojo' });
        if (isFin(s0.t_stage_off)) marcas.push({ t: s0.t_stage_off, etiqueta: 'STAGE', color: 'blanco' });
        if (marcas.length && cl && cl.n) {
          const tz = Semaforo.tira(cl, marcas, { cuadros_por_marca: 6, alto: 96, t_ref: rt && isFin(rt.L) ? rt.L : tR });
          if (window.DragCam && DragCam.jpeg) datos.tira_jpg = await DragCam.jpeg(tz);
        }
      }
    } catch (e) { /* la imagen es opcional */ }
    run.cam.tiene_tira = !!datos.tira_jpg;
    return datos;
  }

  // Copia a la corrida los resultados de procesar()
  function aplicarR(run, R) {
    run.ok = R.ok; run.mensaje = R.mensaje; run.avisos = R.avisos || [];
    if (!R.ok) return run;
    const paso = 5, serie = { t: [], v: [], d: [], a: [] };
    for (let i = 0; i < R.t.length; i += paso) {
      serie.t.push(+(R.t[i] - R.tRo).toFixed(3)); serie.v.push(+(R.v[i] * 3.6).toFixed(2));
      serie.d.push(+R.d[i].toFixed(2)); serie.a.push(+R.a[i].toFixed(3));
    }
    Object.assign(run, {
      hitos: R.hitos, trampa_kmh: R.trampa_kmh, t_0_100: R.t_0_100, t_0_60mph: R.t_0_60mph,
      completo: R.completo, est: R.est, calidad: R.calidad, serie, t_rollout: R.tRo - R.t0,
      gpsPts: { t: R.gps.t.map((x) => +(x - R.tRo).toFixed(3)), v: R.gps.v.map((x) => +(x * 3.6).toFixed(2)) },
    });
    return run;
  }

  // Recalcula una corrida guardada con los ajustes actuales (rollout, arranque, acelerómetro)
  async function recalcular(run) {
    const cfg = Object.assign(cfgActual(), { distancia_final: run.cfg.distancia_final, t_inicio_busqueda: run.cfg.t_inicio_busqueda });
    let R;
    try { R = C.procesar(run.raw.gps, run.raw.acc, cfg); }
    catch (err) { R = { ok: false, mensaje: 'Error al calcular: ' + err.message, avisos: [] }; }
    const ign = run.calidad ? { n: run.calidad.mov_ignorados, v: run.calidad.v_max_ignorado_kmh } : null;
    run.cfg = cfg;
    aplicarR(run, R);
    if (R.ok && ign) { run.calidad.mov_ignorados = ign.n; run.calidad.v_max_ignorado_kmh = ign.v; }
    if (run.cam && run.cam.sec && window.Semaforo) {
      const ctx = Object.assign(ctxCam(run.cam.cfg.carril, R), { k1: run.cam.k1, fuente_t: run.cam.reloj && run.cam.reloj.fuente });
      run.cam.rt = Semaforo.reaccionDe(run.cam.sec, ctx);
      run.cam.ajuste_usado = ctx.ajuste; run.cam.delta_usado = run.cam.rt.delta;
    }
    run.recalculada = new Date().toISOString();
    await DB.put(run);
    return run;
  }

  function salirSesion() {
    pararDemo();
    detenerCamara();
    ses.fase = 'idle'; ses.demo = false;
    document.body.classList.remove('sesion');
    $('#medirIdle').hidden = false; $('#medirSesion').hidden = true;
    if (sens.fuente === 'demo') { sens.fuente = 'real'; limpiarBuffers(); sens.ultGps = null; sens.gpsDts = []; }
    mostrarVista('vMedir');
  }

  // ------------------------------------------------------------ demo
  function iniciarDemo() {
    const sim = C.simularSesion({ gps_hz: 1, lag_gps: 0.3, acc_hz: 60, seed: Math.floor(Math.random() * 1e6) });
    sens.fuente = 'demo'; ses.demo = true; ses.demoSim = sim;
    limpiarBuffers(); sens.ultGps = null; sens.gpsDts = [];
    armar(S.cam ? (carrilDemo || S.cam_carril || 'izq') : null);
    const vel = 4; let tSim = 0, ig = 0, ia = 0;
    ses.demoTimer = setInterval(() => {
      tSim += 0.05 * vel;
      while (ia < sim.acc.t.length && sim.acc.t[ia] <= tSim) { pushAcc(sim.acc.t[ia], sim.acc.ax[ia], sim.acc.ay[ia], sim.acc.az[ia]); ia++; }
      while (ig < sim.gps.t.length && sim.gps.t[ig] <= tSim) {
        pushGps({ t: sim.gps.t[ig], v: sim.gps.v[ig], hacc: sim.gps.hacc[ig], lat: sim.gps.lat[ig], lon: sim.gps.lon[ig] }); ig++;
      }
      if (ig >= sim.gps.t.length && ses.fase === 'corrida') finCorrida('tiempo');
      if (ig >= sim.gps.t.length && ses.fase === 'espera') { pararDemo(); salirSesion(); }
    }, 50);
  }
  function pararDemo() { if (ses.demoTimer) { clearInterval(ses.demoTimer); ses.demoTimer = null; } }
  let carrilDemo = null;

  // ------------------------------------------------------------ almacenamiento (IndexedDB)
  // v2 (beta 0.6): store 'camdatos' aparte con lo pesado de la cámara (~1 MB por corrida), para que abrir el
  // Historial (getAll de 'runs') siga siendo ligero. El nombre 'dragtrim' no cambia nunca (ahí está el historial).
  const CAM_MAX = 30;
  const DB = {
    mem: [], memCam: new Map(), db: null, bloqueada: false, _pend: null,
    async abrir() {
      if (this.db || !('indexedDB' in window)) return this.db;
      if (this._pend) return this._pend;
      this._pend = new Promise((res) => {
        let listo = false;
        const fin = (db) => { if (!listo) { listo = true; res(db); } };
        try {
          const rq = indexedDB.open('dragtrim', 2);
          rq.onupgradeneeded = () => {
            const db = rq.result;
            if (!db.objectStoreNames.contains('runs')) db.createObjectStore('runs', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('camdatos')) db.createObjectStore('camdatos', { keyPath: 'id' });
          };
          rq.onsuccess = () => {
            const db = rq.result;
            // una versión más nueva abierta en otra pestaña: esta conexión se cierra para no detener su actualización
            db.onversionchange = () => { db.close(); if (this.db === db) this.db = null; };
            this.db = db; this.bloqueada = false; this._pend = null;
            if (listo) this.vaciarMem();   // abrió tarde (estaba bloqueada): guardar lo que quedó en memoria
            fin(db);
          };
          rq.onerror = () => { this._pend = null; fin(null); };
          // Otra pestaña o ventana con la versión anterior abierta (Android) detiene la actualización hasta que se
          // cierre. Mientras, la app sigue en memoria sin colgarse y el Historial lo avisa; al abrir, guarda lo pendiente.
          rq.onblocked = () => { this.bloqueada = true; setTimeout(() => fin(null), 2500); };
        } catch (e) { this._pend = null; fin(null); }
      });
      return this._pend;
    },
    async vaciarMem() {
      for (const r of this.mem.slice()) if ((await this.tx('readwrite', (st) => st.put(r))) != null) this.mem = this.mem.filter((x) => x !== r);
      for (const [id, d] of [...this.memCam]) if ((await this.tx('readwrite', (st) => st.put(d), 'camdatos')) != null) this.memCam.delete(id);
      if (!$('#vHistorial').hidden) pintarHistorial();
    },
    async tx(modo, fn, store = 'runs') {
      const db = await this.abrir();
      if (!db) return null;
      return new Promise((res) => {
        try {
          const t = db.transaction(store, modo), st = t.objectStore(store);
          const rq = fn(st);
          t.oncomplete = () => res(rq && rq.result !== undefined ? rq.result : (modo === 'readwrite' ? true : rq && rq.result)); t.onerror = () => res(null); t.onabort = () => res(null);
        } catch (e) { res(null); }
      });
    },
    async put(run) {
      const ok = await this.tx('readwrite', (st) => st.put(run));
      if (ok == null) { this.mem = this.mem.filter((r) => r.id !== run.id); this.mem.push(run); }
    },
    async todos() {
      const r = await this.tx('readonly', (st) => st.getAll());
      return (r || this.mem).slice().sort((a, b) => b.id - a.id);
    },
    async borrar(id) {
      await this.tx('readwrite', (st) => st.delete(id)); this.mem = this.mem.filter((r) => r.id !== id);
      await this.borrarCam(id);
    },
    async borrarTodo() {
      await this.tx('readwrite', (st) => st.clear()); this.mem = [];
      await this.tx('readwrite', (st) => st.clear(), 'camdatos'); this.memCam.clear();
    },
    // datos pesados de la cámara; se conservan los de las últimas CAM_MAX corridas
    async putCam(d) {
      const ok = await this.tx('readwrite', (st) => st.put(d), 'camdatos');
      if (ok == null) { this.memCam.set(d.id, d); while (this.memCam.size > CAM_MAX) this.memCam.delete(this.memCam.keys().next().value); return; }
      const ids = await this.tx('readonly', (st) => st.getAllKeys(), 'camdatos');
      if (Array.isArray(ids) && ids.length > CAM_MAX) {
        const viejos = ids.slice().sort((a, b) => a - b).slice(0, ids.length - CAM_MAX);
        await this.tx('readwrite', (st) => { let r = null; for (const k of viejos) r = st.delete(k); return r; }, 'camdatos');
      }
    },
    async getCam(id) {
      const r = await this.tx('readonly', (st) => st.get(id), 'camdatos');
      return r || this.memCam.get(id) || null;
    },
    async borrarCam(id) { await this.tx('readwrite', (st) => st.delete(id), 'camdatos'); this.memCam.delete(id); },
  };

  // ------------------------------------------------------------ resultado
  // "Armar otra medición": con la cámara se elige el carril otra vez
  const botonesNueva = () => (S.cam
    ? '<button class="primary go" id="rNuevaIzq">Armar otra · carril izquierdo</button><button class="primary go" id="rNuevaDer">Armar otra · carril derecho</button>'
    : '<button class="primary go" id="rNueva">Armar otra medición</button>');
  function etPrincipal(run) {
    const h = (run.hitos || []).find((x) => Math.abs(x.dist_m - run.cfg.distancia_final) < 0.01);
    return h || { t: NaN, v_kmh: NaN };
  }

  // ------------------------------------------------------------ resultado: semáforo (cámara)
  const MOTIVO_CAM = {
    sin_permiso: 'no hubo permiso de cámara (iPhone: Ajustes › Apps › Safari › Cámara; Android: candado de la barra › Permisos).',
    no_soportado: 'este navegador no puede leer la cámara.', inseguro: 'este navegador no puede leer la cámara.',
    sin_camara: 'no se encontró la cámara de atrás.', ocupada: 'la cámara estaba ocupada por otra app.', abriendo: 'la cámara no terminó de abrir.',
    camara_detenida: 'la cámara no grabó cerca de tu salida (¿segundo plano, llamada o calor?).', sin_cuadros: 'la cámara no grabó cerca de tu salida (¿segundo plano, llamada o calor?).',
    tiempo: `la cámara se apagó: llevaba ${CAM_MAX_MIN} min armada.`, rotacion: 'el teléfono cambió de orientación durante la medición.',
    ventana: 'tu arranque se confirmó tarde y el árbol ya no estaba guardado.',
    fuera_de_zona: 'el árbol quedó fuera de la zona que graba la cámara: usa "Apuntar la cámara".',
    sin_arbol: 'no encontré el árbol en la imagen. Usa "Apuntar la cámara" y revisa la imagen de esta corrida.',
    sin_secuencia: 'vi el árbol, pero no los ámbares ni la verde antes de tu salida. Prueba "Cambiar carril".',
    ambigua: 'vi más de una secuencia posible.', calidad: 'imagen muy oscura, quemada o movida: revisa reflejos y limpia la lente.',
    sin_salida: 'no vi tu foco de stage apagarse y la corrida no tiene acelerómetro.', sin_corrida: 'no hubo arranque válido.',
    sin_vision: 'falta el módulo de visión.', error: 'falló la lectura del semáforo.',
  };
  const LADO = { izq: 'izquierdo', der: 'derecho' };
  const formatoRT = () => (LS.get('dragtrim.practica.cfg', {}).formato === 'verde' ? 'verde' : 'boleta');
  const camLeida = (run) => !!(run.cam && run.cam.rt && run.cam.rt.ok);
  function txtRT(rt, formato) {
    if (!rt || !rt.ok || !window.Semaforo) return '—';
    return Semaforo.fmtRT(rt.rt_verde, rt.tipo, formato, rt.rt_boleta);
  }
  function avisoCam(a) {
    if (/^intervalo /.test(a)) return `El árbol de esta pista tardó ${a.slice(10)} s del último ámbar a la verde.`;
    if (/^otro_arbol /.test(a)) return `Se leyó un árbol ${a.slice(11) === 'full' ? 'Full .500' : 'Pro .400'}, no el que elegiste: revisa cuál usa la pista.`;
    return ({ carril_dudoso: 'Parece que corriste en el otro carril: revisa con "Cambiar carril".',
              flancos_debiles: 'Los focos se veían débiles (sol de frente o árbol lejos): lectura menos segura.',
              stage_movido: 'La imagen se movió justo al salir: el final de tu reacción se tomó del acelerómetro.',
              stage_dudoso: 'No quedó claro cuál foco era el de stage.', sin_verde: 'No se vio la verde (normal con luz roja).',
              verde_dudosa: 'La verde no se leyó bien: la reacción desde la verde usa el intervalo normal del árbol.',
              desacuerdo: 'La cámara y el acelerómetro no coinciden en tu salida: se usó la cámara.' })[a] || null;
  }
  // fila R/T de la boleta, KPI de reacción y sección "Semáforo"
  function htmlCam(run) {
    const c = run.cam;
    if (!c || !CAM_DEV) return { fila: '', kpi: '', seccion: '', sello: '' };   // corridas grabadas con la 0.6: sus datos se guardan, no se muestran
    const rt = c.rt, sec = c.sec, f = formatoRT(), otro = f === 'boleta' ? 'verde' : 'boleta';
    const fila = (k, val) => `<dt>${k}</dt><dd>${val}</dd>`;
    const otroCarril = c.cfg && c.cfg.carril === 'der' ? 'izq' : 'der';
    const acciones = c.tiene_datos ? `
        <button class="ghost" id="rCamCarril">Cambiar a carril ${LADO[otroCarril]}</button>
        ${sec && sec.ok ? `<button class="ghost" id="rCamArbol">Leer como ${sec.tipo === 'full' ? 'Pro .400' : 'Full .500'}</button>` : ''}` : '';
    const b = run.boleta || {};
    const vb = (x) => (isFin(x) ? String(x) : '');
    const boleta = `
      <details class="cam-boleta" id="rCamBoleta"${run.boleta ? '' : ''}>
        <summary>Tu boleta oficial (para calibrar)${run.boleta ? ' · guardada' : ''}</summary>
        <p class="hint">Escribe lo que dice el ticket de la pista. Con 3 o más boletas, en Ajustes verás la corrección de tu reacción.</p>
        <div class="rejilla">
          <label>R/T (reacción)<input inputmode="decimal" id="bRT" value="${vb(b.rt)}" placeholder="0.622"></label>
          <label>60 ft<input inputmode="decimal" id="b60" value="${vb(b.t_60)}" placeholder="2.650"></label>
          <label>1/8 tiempo<input inputmode="decimal" id="b18" value="${vb(b.t_1_8)}"></label>
          <label>1/8 vel. (${velU()})<input inputmode="decimal" id="b18v" value="${vb(b.v_1_8)}"></label>
          <label>1/4 tiempo<input inputmode="decimal" id="b14" value="${vb(b.t_1_4)}"></label>
          <label>1/4 vel. (${velU()})<input inputmode="decimal" id="b14v" value="${vb(b.v_1_4)}"></label>
        </div>
        <button class="ghost" id="bGuardar">Guardar boleta</button>
      </details>`;
    if (!rt || !rt.ok) {
      const motivo = MOTIVO_CAM[c.motivo] || MOTIVO_CAM[(rt && rt.motivo)] || MOTIVO_CAM.error;
      return { fila: '', kpi: '', sello: '', seccion: `
        <div class="quality cam-res">
          <h3 style="margin-top:10px">Semáforo <span class="beta-tag">beta</span></h3>
          <p class="msg err">Sin lectura del semáforo: ${esc(motivo)}</p>
          <img class="cam-tira" id="camTira" alt="Cuadros del semáforo de esta corrida" hidden>
          <div class="actions">${acciones}</div>
        </div>` };
    }
    const baja = rt.nivel === 'baja', q = baja ? '?' : '';
    const err = isFin(rt.error_s) ? `±${Math.max(1, Math.round(rt.error_s * 1000))} ms` : '';
    const metodo = { camara: 'foco de stage (cámara)', 'camara+acel': 'cámara y acelerómetro', acel: 'acelerómetro' }[rt.metodo] || rt.metodo;
    const dF = rt.delta && rt.delta.fuente, dTxt = { k1: 'de esta corrida', guardado: 'guardado', supuesto: 'supuesto, sin calibrar' }[dF] || '—';
    const aj = rt.metodo === 'acel' ? (S.cam_ajuste.acel_ms || 0) : (S.cam_ajuste.camara_ms || 0);
    const avisos = [...new Set([...(sec && sec.avisos || []), ...(rt.avisos || [])])].map(avisoCam).filter(Boolean);
    if (baja) avisos.unshift('Lectura aproximada: falta calibrar el retraso de la cámara (corre con el teléfono en el soporte, o anota tu boleta).');
    const sim = c.camara && c.camara.simulada;
    return {
      fila: `<tr class="rt${baja ? ' baja' : ''}"><td>R/T</td><td>${txtRT(rt, f)}${q}</td><td></td></tr>`,
      sello: rt.roja ? `<span class="stamp">LUZ ROJA${rt.roja_dudosa ? '?' : ''}</span>` : '',
      kpi: `<div class="kpis cam-kpi">
          <div><span>Reacción (${f === 'boleta' ? 'boleta' : 'desde la verde'})</span><b>${txtRT(rt, f)}${q}<small>${esc(err)}</small></b></div>
          <div><span>${otro === 'boleta' ? 'Boleta' : 'Desde la verde'}</span><b>${txtRT(rt, otro)}${q}</b></div>
        </div>`,
      seccion: `
        <div class="quality cam-res">
          <h3 style="margin-top:10px">Semáforo <span class="beta-tag">beta</span></h3>
          <dl>
            ${fila('Árbol', `${sec.tipo === 'full' ? 'Full .500' : 'Pro .400'}, carril ${LADO[c.cfg.carril] || '—'}`)}
            ${sec.delta_fuente === 'medido' ? fila('Último ámbar → verde', `${sec.delta_s.toFixed(3)} s`) : ''}
            ${fila('Fin de tu reacción', esc(metodo))}
            ${fila('Hora de cada cuadro', c.reloj && c.reloj.fuente === 'cap' ? 'de la cámara' : 'calculada')}
            ${fila('Retraso cámara↔sensores', isFin(rt.delta && rt.delta.s) ? `${Math.round(rt.delta.s * 1000)} ms (${dTxt})` : '—')}
            ${fila('Corrección aplicada', aj ? `${aj > 0 ? '+' : ''}${aj} ms` : '0 ms, sin calibrar')}
            ${c.camara && isFin(c.camara.W) ? fila('Cámara', `${c.camara.W}×${c.camara.H}${isFin(c.camara.fps_medido) ? `, ${c.camara.fps_medido.toFixed(1)} cuadros/s` : ''}${c.camara.perdidos ? `, ${c.camara.perdidos} perdidos` : ''}`) : ''}
            ${isFin(rt.rollout_medido_ft) ? fila('Rollout medido por la cámara', `${rt.rollout_medido_ft.toFixed(2)} ft (tienes ${run.cfg.rollout_ft})`) : ''}
            ${sim ? fila('Árbol simulado', `reacción real ${(sim.rt_s + (sim.tipo === 'full' ? 0.5 : 0.4)).toFixed(3)} (boleta)`) : ''}
          </dl>
          ${avisos.length ? `<ul class="avisos">${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
          <img class="cam-tira" id="camTira" alt="Cuadros del semáforo alrededor del ámbar, la verde y tu salida" hidden>
          ${boleta}
          <div class="actions">${acciones}</div>
        </div>`,
    };
  }
  async function enlazarCam(run, enSesion) {
    if (!run.cam) return;
    const img = document.getElementById('camTira');
    if (img && run.cam.tiene_tira) {
      const d = await DB.getCam(run.id);
      if (d && d.tira_jpg && document.getElementById('camTira') === img) {
        img.src = URL.createObjectURL(new Blob([d.tira_jpg], { type: 'image/jpeg' })); img.hidden = false;
      }
    }
    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    const reanalizar = async (cambios, btn) => {
      btn.disabled = true; btn.textContent = 'Leyendo…';
      const ok = await reanalizarCam(run, cambios);
      mostrarResultado(run, enSesion);
      if (!ok) { const m = document.createElement('p'); m.className = 'msg err'; m.textContent = 'Ya no están los cuadros de esta corrida.'; $('#vResultado').prepend(m); }
    };
    on('rCamCarril', (e) => reanalizar({ carril: run.cam.cfg.carril === 'der' ? 'izq' : 'der' }, e.currentTarget));
    on('rCamArbol', (e) => reanalizar({ arbol: run.cam.sec && run.cam.sec.tipo === 'full' ? 'pro' : 'full' }, e.currentTarget));
    on('bGuardar', async () => {
      const num = (id) => { const x = parseFloat(String(document.getElementById(id).value).replace(',', '.')); return isFin(x) ? x : null; };
      const bo = { rt: num('bRT'), t_60: num('b60'), t_1_8: num('b18'), v_1_8: num('b18v'), t_1_4: num('b14'), v_1_4: num('b14v'), unidad: S.unidad, fecha: new Date().toISOString() };
      run.boleta = Object.values(bo).some((x) => typeof x === 'number') ? bo : null;
      await DB.put(run);
      mostrarResultado(run, enSesion);
      const m = document.createElement('p'); m.className = 'msg'; m.textContent = run.boleta ? 'Boleta guardada.' : 'Boleta borrada.';
      $('#vResultado').prepend(m);
    });
  }
  async function reanalizarCam(run, cambios) {
    const d = await DB.getCam(run.id);
    if (!d || !window.Semaforo) return false;
    let R = null;
    try { R = C.procesar(run.raw.gps, run.raw.acc, run.cfg); } catch (e) { R = null; }
    const carril = cambios.carril || run.cam.cfg.carril, arbol = cambios.arbol || run.cam.cfg.arbol;
    const ctx = Object.assign(ctxCam(carril, R), { arbol, fuente_t: run.cam.reloj && run.cam.reloj.fuente });
    const r = Semaforo.reanalizar({ rasgos: d.rasgos, disp: d.disp, mov: d.mov, k1: d.k1 }, ctx);
    run.cam.sec = resumenSec(r.sec); run.cam.rt = r.rt || null; run.cam.cfg = { carril, arbol };
    run.cam.motivo = r.sec && !r.sec.ok ? (r.sec.motivo || 'sin_secuencia') : (r.rt && !r.rt.ok ? r.rt.motivo : null);
    run.cam.manual = { carril, arbol, fecha: new Date().toISOString() };
    await DB.put(run);
    return true;
  }

  function mostrarResultado(run, enSesion) {
    const v = $('#vResultado');
    const cam = htmlCam(run);
    if (!run.ok) {
      v.innerHTML = `<h2>Sin resultado</h2><p class="msg err">${esc(run.mensaje)}</p>
        ${run.avisos.length ? `<ul class="avisos">${run.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
        <div class="actions">
          ${enSesion ? botonesNueva() : ''}
          <button class="ghost" id="rExport">Exportar datos crudos</button>
          <button class="ghost" id="rRecalc">Recalcular con mis ajustes actuales</button>
          ${enSesion ? '<button class="ghost" id="rSalir">Volver al inicio</button>' : '<button class="danger" id="rBorrar">Borrar</button>'}
        </div>`;
    } else {
      const Df = run.cfg.distancia_final, et = etPrincipal(run);
      const filas = run.hitos.filter((h) => h.dist_m <= Df + 0.01).map((h) => {
        const corto = { '60 ft': "60'", '330 ft': "330'", '1/8 mi': '1/8', '1000 ft': "1000'", '1/4 mi': '1/4' }[h.nombre] || h.nombre;
        const esEt = Math.abs(h.dist_m - Df) < 0.01;
        const vel = esEt ? (isFin(run.trampa_kmh) ? run.trampa_kmh : h.v_kmh) : h.v_kmh;
        return `<tr class="${esEt ? 'et' : ''}${isFin(h.t) ? '' : ' na'}"><td>${corto}</td><td>${fmtT(h.t)}</td><td>${isFin(vel) ? fmtV(vel, 2) : ''}</td></tr>`;
      }).join('');
      const c = run.calidad;
      const fila = (k, val) => `<dt>${k}</dt><dd>${val}</dd>`;
      v.innerHTML = `
        <div class="slip">
          <header><b>DRAG TREE</b><span>${esc(fechaCorta(run.fecha))} &nbsp; ${Df < 300 ? '1/8 MI' : '1/4 MI'}</span></header>
          <table>
            <tr class="hd"><td></td><td>TIEMPO</td><td>${velU().toUpperCase()}</td></tr>
            ${cam.fila}
            ${filas}
          </table>
          <footer><span>ROLLOUT ${run.cfg.rollout_ft} FT</span><span>${esc(c.metodo.toUpperCase())}</span></footer>
          ${run.demo ? '<span class="stamp">SIMULADA</span>' : ''}
          ${!run.completo ? '<span class="stamp">INCOMPLETA</span>' : ''}
          ${cam.sello}
        </div>
        ${cam.kpi}
        <div class="kpis">
          <div><span>Tiempo ${nombreDist(Df)}</span><b data-cnt>${fmtT(et.t)}<small>s</small></b></div>
          <div><span>Vel. de trampa</span><b data-cnt>${fmtV(run.trampa_kmh)}<small>${velU()}</small></b></div>
          <div><span>0–100 km/h</span><b data-cnt>${isFin(run.t_0_100) ? run.t_0_100.toFixed(2) : '—'}<small>s</small></b></div>
          <div><span>0–60 mph</span><b data-cnt>${isFin(run.t_0_60mph) ? run.t_0_60mph.toFixed(2) : '—'}<small>s</small></b></div>
          <div><span>Vel. máxima</span><b data-cnt>${fmtV(run.est.v_max_kmh)}<small>${velU()}</small></b></div>
          <div><span>G máxima</span><b data-cnt>${run.est.a_max_g.toFixed(2)}<small>g</small></b></div>
        </div>
        <div class="chart"><p>Velocidad (${velU()}) contra tiempo (s)</p><canvas id="cVel" aria-label="Velocidad contra tiempo"></canvas></div>
        <div class="chart"><p>Distancia (m) contra tiempo (s)</p><canvas id="cDist" aria-label="Distancia contra tiempo"></canvas></div>
        <div class="chart"><p>Fuerza G longitudinal contra tiempo (s)</p><canvas id="cG" aria-label="Fuerza G contra tiempo"></canvas></div>
        <div class="quality">
          <h3 style="margin-top:10px">Calidad de los datos</h3>
          <dl>
            ${fila('Método', esc(c.metodo))}
            ${fila('GPS', `${c.gps_hz < 1.5 ? c.gps_hz.toFixed(1) : Math.round(c.gps_hz)} Hz, ${c.n_gps_corrida} lecturas`)}
            ${fila('Precisión GPS', isFin(c.hacc_mediana_m) ? `±${c.hacc_mediana_m.toFixed(1)} m` : '—')}
            ${fila('Retraso GPS', `${c.latencia_gps_s.toFixed(2)} s`)}
            ${fila('Acelerómetro', isFin(c.acc_hz) ? `${Math.round(c.acc_hz)} Hz` : 'sin datos')}
            ${isFin(c.ruido_reposo) ? fila('Vibración en reposo', `${c.ruido_reposo.toFixed(2)} m/s²`) : ''}
            ${run.cfg.rollout_ft > 0 && isFin(run.t_rollout) ? fila(`Del primer movimiento a ${run.cfg.rollout_ft} ft`, `${run.t_rollout.toFixed(3)} s`) : ''}
            ${fila('Movimientos ignorados', c.mov_ignorados ? `${c.mov_ignorados} (máx ${fmtV(c.v_max_ignorado_kmh, 0)} ${velU()})` : 'ninguno')}
            ${isFin(c.dist_pos_m) ? fila('Distancia integrada / por posición', `${c.dist_integrada_m.toFixed(0)} m / ${c.dist_pos_m.toFixed(0)} m`) : ''}
          </dl>
          ${run.avisos.length ? `<ul class="avisos">${run.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
        </div>
        ${cam.seccion}
        <div class="actions">
          ${enSesion ? botonesNueva() : ''}
          <button class="ghost" id="rExport">Exportar datos</button>
          <button class="ghost" id="rRecalc">Recalcular con mis ajustes actuales</button>
          ${enSesion ? '<button class="ghost" id="rSalir">Volver al inicio</button>' : '<button class="danger" id="rBorrar">Borrar esta corrida</button>'}
        </div>`;
    }
    $('#medirSesion').hidden = true;
    document.body.classList.toggle('sesion', !!enSesion);
    mostrarVista('vResultado', !enSesion ? 'vHistorial' : null);
    window.scrollTo(0, 0);
    if (run.ok) { requestAnimationFrame(() => graficas(run)); contar(v); }
    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    on('rNueva', () => { if (ses.demo) iniciarDemo(); else armar(); });
    on('rNuevaIzq', () => { if (ses.demo) { carrilDemo = 'izq'; iniciarDemo(); } else armar('izq'); });
    on('rNuevaDer', () => { if (ses.demo) { carrilDemo = 'der'; iniciarDemo(); } else armar('der'); });
    enlazarCam(run, enSesion);
    on('rSalir', salirSesion);
    on('rExport', () => exportar(run));
    on('rRecalc', async () => {
      const b = document.getElementById('rRecalc'); b.disabled = true; b.textContent = 'Recalculando…';
      await recalcular(run);
      mostrarResultado(run, enSesion);
      const m = document.createElement('p'); m.className = 'msg';
      m.textContent = `Recalculada con rollout ${run.cfg.rollout_ft} ft${run.cfg.usar_acc ? '' : ', solo GPS'}.`;
      $('#vResultado').prepend(m);
    });
    on('rBorrar', async () => {
      if (!confirm('¿Borrar esta corrida del historial?')) return;
      await DB.borrar(run.id); mostrarVista('vHistorial'); pintarHistorial();
    });
    ses.ultimoRun = run;
  }

  // ------------------------------------------------------------ gráficas (canvas)
  function nice(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  function chart(cv, series, opt) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W) return;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const cDim = css.getPropertyValue('--chalk-dim').trim(), cLine = css.getPropertyValue('--line').trim();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const s of series) for (let i = 0; i < s.x.length; i++) {
      if (!isFin(s.x[i]) || !isFin(s.y[i])) continue;
      x0 = Math.min(x0, s.x[i]); x1 = Math.max(x1, s.x[i]); y0 = Math.min(y0, s.y[i]); y1 = Math.max(y1, s.y[i]);
    }
    if (opt.y0 != null) y0 = Math.min(y0, opt.y0);
    if (!(x1 > x0)) return;
    if (!(y1 > y0)) y1 = y0 + 1;
    const pad = { l: 40, r: 8, t: 8, b: 24 };
    const sx = (x) => pad.l + (x - x0) / (x1 - x0) * (W - pad.l - pad.r);
    const sy = (y) => H - pad.b - (y - y0) / (y1 - y0) * (H - pad.t - pad.b);
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = cDim; ctx.strokeStyle = cLine; ctx.lineWidth = 1;
    const dy = nice(y1 - y0, 4);
    for (let y = Math.ceil(y0 / dy) * dy; y <= y1 + 1e-9; y += dy) {
      ctx.beginPath(); ctx.moveTo(pad.l, sy(y)); ctx.lineTo(W - pad.r, sy(y)); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(+y.toFixed(2), pad.l - 6, sy(y));
    }
    const dx = nice(x1 - x0, 6);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let x = Math.ceil(x0 / dx) * dx; x <= x1 + 1e-9; x += dx) ctx.fillText(String(+x.toFixed(1)), sx(x), H - pad.b + 6);
    for (const s of series) {
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.w || 2.2;
      if (s.dots) {
        for (let i = 0; i < s.x.length; i++) {
          if (s.x[i] < x0 || s.x[i] > x1) continue;
          ctx.beginPath(); ctx.arc(sx(s.x[i]), sy(s.y[i]), s.r || 3, 0, 2 * Math.PI); ctx.fill();
        }
      } else {
        ctx.beginPath();
        s.x.forEach((x, i) => { const px = sx(x), py = sy(s.y[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
        ctx.stroke();
      }
    }
    if (opt.marks) {
      for (const m of opt.marks) {
        const px = sx(m.x), py = sy(m.y);
        ctx.fillStyle = opt.markColor; ctx.beginPath(); ctx.arc(px, py, 4.5, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = cDim; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(m.label, px - 7, py - 3);
      }
    }
  }
  function graficas(run) {
    const css = getComputedStyle(document.documentElement);
    const amber = css.getPropertyValue('--amber').trim(), chalk = css.getPropertyValue('--chalk').trim(), green = css.getPropertyValue('--green').trim();
    const s = run.serie, conv = (k) => velConv(k);
    const xmax = Math.max(...s.t);
    const gp = { x: [], y: [] };
    run.gpsPts.t.forEach((t, i) => { if (t >= -1 && t <= xmax) { gp.x.push(t); gp.y.push(conv(run.gpsPts.v[i])); } });
    chart($('#cVel'), [
      { x: s.t, y: s.v.map(conv), color: amber },
      { x: gp.x, y: gp.y, color: chalk, dots: true, r: 3 },
    ], { y0: 0 });
    const Df = run.cfg.distancia_final;
    const marks = run.hitos.filter((h) => isFin(h.t) && h.dist_m <= Df + 0.01).map((h) => ({ x: h.t, y: h.dist_m, label: h.nombre }));
    chart($('#cDist'), [{ x: s.t, y: s.d, color: amber }], { y0: 0, marks, markColor: green });
    chart($('#cG'), [{ x: s.t, y: s.a.map((a) => a / C.G0), color: amber }], { y0: 0 });
  }
  window.addEventListener('resize', () => { if (!$('#vResultado').hidden && ses.ultimoRun && ses.ultimoRun.ok) graficas(ses.ultimoRun); });

  // ------------------------------------------------------------ exportar (zip)
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data instanceof Uint8Array ? f.data : enc.encode(f.text), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
      cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true); cd.setUint32(42, off, true);
      central.push(new Uint8Array(cd.buffer), name);
      off += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }
  const csv = (cols, b) => {
    const keys = Object.keys(cols), n = b[keys[0]].length, out = [Object.values(cols).join(',')];
    for (let i = 0; i < n; i++) out.push(keys.map((k) => { const x = b[k][i]; return isFin(x) ? +x.toFixed(6) : 'NaN'; }).join(','));
    return out.join('\n') + '\n';
  };
  function b64utf8(s) { const u = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(bin); }

  async function exportar(run) {
    const st = run.sello;
    const g = run.raw.gps, a = run.raw.acc;
    const files = [
      { name: `drag_raw_gps_${st}.csv`, text: csv({ t: 't_s', lat: 'lat', lon: 'lon', v: 'v_mps', hacc: 'hacc_m' }, g) },
      { name: `drag_raw_acc_${st}.csv`, text: csv({ t: 't_s', ax: 'ax', ay: 'ay', az: 'az' }, a) },
      { name: `drag_raw_meta_${st}.json`, text: JSON.stringify(Object.assign({ version: 'app ' + run.app, distancia_final: run.cfg.distancia_final, t_inicio_busqueda: run.cfg.t_inicio_busqueda, rollout_ft: run.cfg.rollout_ft, simulada: run.demo },
        camLeida(run) ? { semaforo: { rt_boleta: run.cam.rt.rt_boleta, rt_verde: run.cam.rt.rt_verde, tipo: run.cam.rt.tipo, roja: run.cam.rt.roja, metodo: run.cam.rt.metodo, nivel: run.cam.rt.nivel } } : {})) },
    ];
    const gy = run.raw.gyr;
    if (gy && gy.t && gy.t.length) files.push({ name: `drag_raw_gyro_${st}.csv`, text: csv({ t: 't_s', a: 'alpha_dps', b: 'beta_dps', g: 'gamma_dps' }, gy) });
    // semáforo: rasgos por cuadro (CSV), meta, clip de la caja del árbol (luma) y la tira de revisión
    if (run.cam && window.Semaforo) {
      const d = await DB.getCam(run.id);
      const meta = { semaforo: run.cam.semaforo, cfg: run.cam.cfg, camara: run.cam.camara, reloj: run.cam.reloj, zona: run.cam.zona, escala: run.cam.escala, orig: run.cam.orig,
                     disp: d ? d.disp : null, sec: run.cam.sec, k1: run.cam.k1, rt: run.cam.rt, motivo: run.cam.motivo, boleta: run.boleta || null, huecos: run.cam.huecos || [] };
      if (d && d.rasgos) {
        try { files.push({ name: `drag_raw_cam_${st}.csv`, text: Semaforo.aCSV(d.rasgos, d.crudos) }); meta.columnas = d.rasgos.cols; } catch (e) { /* */ }
      }
      if (d && d.clip && d.clip.n) {
        files.push({ name: `drag_cam_clip_${st}.bin`, data: d.clip.y instanceof Uint8Array ? d.clip.y : new Uint8Array(d.clip.y) });
        meta.clip = { w: d.clip.w, h: d.clip.h, n: d.clip.n, t: Array.from(d.clip.t), formato: 'luma 8 bits, cuadros seguidos de w×h' };
      }
      if (d && d.tira_jpg) files.push({ name: `drag_cam_tira_${st}.jpg`, data: d.tira_jpg instanceof Uint8Array ? d.tira_jpg : new Uint8Array(d.tira_jpg) });
      files.push({ name: `drag_raw_cam_meta_${st}.json`, text: JSON.stringify(meta) });
    }
    if (run.ok) {
      files.push({ name: `drag_trim_result_${st}.csv`, text: csv({ t: 'Tiempo_s', d: 'Distancia_m', v: 'Velocidad_kmh', a: 'AccLong_mps2' }, run.serie) });
      const r = {};
      const hk = { '60 ft': ['t_60ft', 'v_60ft'], '330 ft': ['t_101m', 'v_101m'], '1/8 mi': ['t_201m', 'v_201m'], '1000 ft': ['t_305m', 'v_305m'], '1/4 mi': ['t_1_4mi', 'v_1_4mi'] };
      for (const h of run.hitos) { const k = hk[h.nombre]; if (k) { r[k[0]] = isFin(h.t) ? h.t : 0; r[k[1]] = isFin(h.v_kmh) ? h.v_kmh : 0; } }
      r.t_1_8mi = r.t_201m; r.v_1_8mi = r.v_201m;
      r.t_0_100 = isFin(run.t_0_100) ? run.t_0_100 : 0; r.t_0_60mph = isFin(run.t_0_60mph) ? run.t_0_60mph : 0;
      r.trampa_kmh = isFin(run.trampa_kmh) ? run.trampa_kmh : 0; r.rollout_ft = run.cfg.rollout_ft;
      const payload = {
        tipo: 'drag_trim', version: 'app ' + run.app, fecha: run.fecha, completo: run.completo, resultados: r,
        ...(camLeida(run) ? { reaccion: { rt_boleta: run.cam.rt.rt_boleta, rt_verde: run.cam.rt.rt_verde, tipo: run.cam.rt.tipo, roja: run.cam.rt.roja, metodo: run.cam.rt.metodo, nivel: run.cam.rt.nivel, error_s: run.cam.rt.error_s } } : {}),
        estadisticas: { tiempo_total: run.est.tiempo_total, distancia_total: run.est.distancia_total, v_max: run.est.v_max_kmh, a_max: run.est.a_max_g * C.G0, a_prom: run.est.a_prom_g * C.G0, g_max: run.est.a_max_g },
        calidad: { metodo: run.calidad.metodo, gps_hz: run.calidad.gps_hz, hacc_m: run.calidad.hacc_mediana_m },
        registro: { t: run.serie.t.filter((_, i) => i % 2 === 0), d: run.serie.d.filter((_, i) => i % 2 === 0), v: run.serie.v.filter((_, i) => i % 2 === 0), acc_long: run.serie.a.filter((_, i) => i % 2 === 0) },
      };
      files.push({ name: `DRAGPACK_dragtrim_${st}.txt`, text: `DRAGPACK|${b64utf8(JSON.stringify(payload))}|END` });
    }
    const blob = zip(files), nombre = `dragtrim_${st}.zip`;
    try {
      const file = new File([blob], nombre, { type: 'application/zip' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Drag Tree ' + st }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const url = URL.createObjectURL(blob), aEl = document.createElement('a');
    aEl.href = url; aEl.download = nombre; document.body.appendChild(aEl); aEl.click(); aEl.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ------------------------------------------------------------ historial
  async function pintarHistorial() {
    const runs = await DB.todos(), ul = $('#histList'), he = $('#histEmpty');
    ul.innerHTML = '';
    const bloq = DB.bloqueada && !DB.db;
    if (!he.dataset.vacio) he.dataset.vacio = he.textContent;
    he.hidden = runs.length > 0 && !bloq;
    he.textContent = bloq ? 'Tu historial sigue guardado, pero no se pudo abrir: hay otra ventana o pestaña de Drag Tree '
      + 'abierta con la versión anterior. Ciérrala y aparecerá aquí.' : he.dataset.vacio;
    for (const r of runs) {
      const li = document.createElement('li'), b = document.createElement('button');
      const et = r.ok ? etPrincipal(r) : null;
      const rt = CAM_DEV && camLeida(r) ? (r.cam.rt.roja ? ', roja' : `, RT ${txtRT(r.cam.rt, formatoRT())}`) : '';
      const sub = r.ok ? `${nombreDist(r.cfg.distancia_final)}, trampa ${fmtV(r.trampa_kmh, 0)} ${velU()}${rt}${r.demo ? ', simulada' : ''}${r.completo ? '' : ', incompleta'}`
        : 'Sin resultado' + (r.demo ? ', simulada' : '');
      b.innerHTML = `<span class="when">${esc(fechaCorta(r.fecha))}</span><span class="et">${r.ok ? fmtT(et.t) : '—'}</span><span class="sub">${esc(sub)}</span>`;
      b.onclick = () => mostrarResultado(r, false);
      li.appendChild(b); ul.appendChild(li);
    }
  }

  // ------------------------------------------------------------ navegación
  function mostrarVista(id, tabActivo) {
    for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== id;
    const tab = tabActivo || id;
    for (const b of document.querySelectorAll('.tabs button')) {
      if (b.dataset.view === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
  }
  for (const b of document.querySelectorAll('.tabs button')) {
    b.onclick = () => {
      const v = b.dataset.view;
      if (v === 'vMedir') { $('#medirIdle').hidden = false; $('#medirSesion').hidden = true; }
      if (v === 'vHistorial') pintarHistorial();
      if (v === 'vAjustes') pintarAjCam();
      mostrarVista(v); window.scrollTo(0, 0);
    };
  }

  // ------------------------------------------------------------ controles
  function seg(id, key, conv) {
    const el = document.getElementById(id);
    const pintar = () => el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(conv(b.dataset.v) === S[key])));
    el.querySelectorAll('button').forEach((b) => b.onclick = () => { S[key] = conv(b.dataset.v); guardarAjustes(); pintar(); aplicarTema(); });
    pintar();
  }
  seg('segDist', 'dist', Number);
  seg('segUnidad', 'unidad', String);
  seg('segTema', 'tema', String);
  // La marca que se desliza en los selectores (todos, también Práctica y Calcular) va a la posición y el ancho del botón
  // elegido: con un texto largo ("Atmosférico", "Automático" a 320 px) los botones no miden lo mismo y la marca, que
  // los suponía iguales, quedaba corrida.
  function marcaSeg(s) {
    const b = s && s.querySelector(':scope > button[aria-checked="true"]');
    if (!b || !b.offsetWidth) return;
    const rb = b.getBoundingClientRect(), rs = s.getBoundingClientRect();   // con fracciones de píxel (offsetLeft redondea)
    s.style.setProperty('--seg-x', (rb.left - rs.left - s.clientLeft).toFixed(2) + 'px');   // desde el borde interior
    s.style.setProperty('--seg-w', rb.width.toFixed(2) + 'px');
    if (!s.classList.contains('seg-listo')) requestAnimationFrame(() => s.classList.add('seg-listo'));   // se desliza después de la 1.ª medida
  }
  if (window.ResizeObserver && window.MutationObserver) {
    const ro = new ResizeObserver((es) => es.forEach((e) => marcaSeg(e.target.closest('.seg'))));
    const mo = new MutationObserver((ms) => ms.forEach((m) => marcaSeg(m.target.closest && m.target.closest('.seg'))));
    document.querySelectorAll('.seg').forEach((s) => {
      ro.observe(s); s.querySelectorAll(':scope > button').forEach((b) => ro.observe(b));
      mo.observe(s, { subtree: true, attributes: true, attributeFilter: ['aria-checked'] });
      marcaSeg(s);
    });
  }
  // ------------------------------------------------------------ fondos de pantalla (estilo sticker)
  const FONDOS = [
    { id: 'combinado', nombre: 'Combinado', acento: '#d4ff00' },
    { id: 'combinado_rojo', nombre: 'Combinado rojo', acento: '#ff3d2e' },
    { id: 'botella_nos', nombre: 'NOS', acento: '#ff3d2e' },
    { id: 'neon', nombre: 'Neón', acento: '#d4ff00' },
    { id: 'rojo', nombre: 'Rojo', acento: '#ff3d2e' },
    { id: 'blanco_negro', nombre: 'Blanco y negro', acento: '#ffffff' },
  ];
  // Fuerza máxima del brillo de Práctica por fondo: build.py la calcula según cuánto cubren los stickers.
  const BRILLO = {"__BRILLO__": 1};
  function aplicarFondo() {
    const f = FONDOS.find((x) => x.id === S.fondo);
    const raiz = document.documentElement;
    if (f) {
      raiz.setAttribute('data-fondo', f.id);
      raiz.style.setProperty('--fondo-url', `url("fondos/${f.id}.webp")`);
      raiz.style.setProperty('--brillo-verde', `url("fondos/${f.id}_brillo_verde.webp")`);
      raiz.style.setProperty('--brillo-rojo', `url("fondos/${f.id}_brillo_rojo.webp")`);
      const bf = BRILLO[f.id] || {};
      raiz.style.setProperty('--brillo-v-max', String(bf.verde || 1));
      raiz.style.setProperty('--brillo-r-max', String(bf.rojo || 1));
      raiz.style.setProperty('--acento', f.acento);
      raiz.style.setProperty('--velo', S.velo);
    } else {
      raiz.removeAttribute('data-fondo');
      for (const v of ['--fondo-url', '--acento', '--brillo-verde', '--brillo-rojo', '--brillo-v-max', '--brillo-r-max']) raiz.style.removeProperty(v);
    }
  }
  function pintarSelFondo() {
    const cont = $('#selFondo');
    cont.innerHTML = '';
    for (const f of [{ id: 'ninguno', nombre: 'Sin fondo' }, ...FONDOS]) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String((S.fondo || 'ninguno') === f.id));
      b.innerHTML = f.id === 'ninguno' ? `<span class="fx-ninguno"></span><span>${f.nombre}</span>`
        : `<img src="fondos/${f.id}_mini.webp" alt="" loading="lazy"><span>${f.nombre}</span>`;
      b.onclick = () => { S.fondo = f.id; guardarAjustes(); aplicarFondo(); aplicarTema(); pintarSelFondo(); };
      cont.appendChild(b);
    }
  }
  seg('segVelo', 'velo', String);
  $('#segVelo').addEventListener('click', aplicarFondo);
  aplicarFondo();
  pintarSelFondo();

  function aplicarTema() {
    document.documentElement.toggleAttribute('data-sin-anim', S.anim === false);
    if (S.tema === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', S.tema);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--asphalt').trim();
  }
  aplicarTema();
  const inR = $('#inRollout');
  inR.value = S.rollout_ft;
  inR.onchange = () => { let x = parseFloat(String(inR.value).replace(',', '.')); if (!isFin(x)) x = DEF.rollout_ft; x = Math.round(Math.min(2, Math.max(0, x)) * 10) / 10; S.rollout_ft = x; S.cam_sesgo_acel = null; inR.value = x; guardarAjustes(); };
  const inV = $('#inVconf'), inT = $('#inTconf'), inA = $('#inAcc');
  inV.value = S.v_confirma_kmh; inT.value = S.t_confirma; inA.checked = S.usar_acc;
  inV.onchange = () => { const x = Math.min(120, Math.max(20, +inV.value || DEF.v_confirma_kmh)); S.v_confirma_kmh = x; inV.value = x; guardarAjustes(); };
  inT.onchange = () => { const x = Math.min(20, Math.max(3, +inT.value || DEF.t_confirma)); S.t_confirma = x; inT.value = x; guardarAjustes(); };
  inA.onchange = () => { S.usar_acc = inA.checked; guardarAjustes(); };
  const inAn = $('#inAnim');
  inAn.checked = S.anim !== false;
  inAn.onchange = () => { S.anim = inAn.checked; guardarAjustes(); aplicarTema(); };
  $('#btnBorrarHist').onclick = async () => { if (confirm('¿Borrar todas las corridas guardadas?')) { await DB.borrarTodo(); pintarHistorial(); } };
  $('#verText').textContent = `Drag Tree ${APP_VERSION}, algoritmo v2.3 (mismo que el script de MATLAB).`;

  $('#btnSensores').onclick = activarSensores;
  const intentarArmar = (carril) => {
    const s = sens.ultGps;
    if (!s || nowS() - sens.ultGpsRec > 4) { mensaje('Todavía no hay señal GPS. Espera a que aparezca la precisión.', true); return; }
    if (s.hacc > 15) mensaje(`Precisión GPS baja (±${Math.round(s.hacc)} m). Puedes medir, pero espera un poco si puedes.`);
    else mensaje('');
    armar(carril);
  };
  $('#btnArmar').onclick = () => intentarArmar(null);
  $('#btnArmarIzq').onclick = () => intentarArmar('izq');
  $('#btnArmarDer').onclick = () => intentarArmar('der');

  // ------------------------------------------------------------ semáforo con cámara: controles
  function pintarCam() {
    $('#campoCam').hidden = !CAM_DEV; $('#ajCam').hidden = !CAM_DEV;
    const on = !!S.cam;
    $('#inCam').checked = on;
    $('#camOpciones').hidden = !on;
    $('#howtoCam').hidden = !on;
    $('#btnArmar').hidden = !sens.activo || on;
    $('#armarCarril').hidden = !sens.activo || !on;
    const e = $('#camEstado');
    let txt = '', err = false;
    const sop = window.DragCam ? DragCam.soporte() : { ok: false };
    const zonas = ['izq', 'der'].filter((c) => S.cam_zona[c]);
    if (!sop.ok) { txt = 'Este navegador no puede leer la cámara.'; err = true; }
    else if (sens.camPermiso && sens.camPermiso !== 'si') {
      txt = sens.camPermiso === 'sin_permiso' ? 'Sin permiso de cámara. iPhone: Ajustes › Apps › Safari › Cámara. Android: candado de la barra › Permisos.' : 'No se pudo abrir la cámara.';
      err = true;
    } else if (!zonas.length) txt = 'Sin probar: toca "Apuntar la cámara" antes de ir a la pista y marca el árbol de tu carril.';
    else {
      const i = S.cam_info;
      txt = `Lista: árbol marcado para el carril ${zonas.map((c) => LADO[c]).join(' y ')}` +
        (i && isFin(i.fps) ? ` · ${i.W}×${i.H}, ${i.fps.toFixed(0)} cuadros/s, hora ${i.fuente_t === 'cap' ? 'de la cámara' : 'calculada (se calibra sola)'}` : '') + '.';
      if (i && isFin(i.fps) && i.fps < 45) { txt += ' La cámara da 30 cuadros/s: tu reacción sale con ±15 ms en vez de ±8 ms. ¿Modo de bajo consumo?'; err = true; }
    }
    e.textContent = on ? txt : ''; e.className = 'msg cam-estado' + (err ? ' err' : '');
    chips();
  }
  $('#inCam').onchange = async () => {
    S.cam = $('#inCam').checked; guardarAjustes(); pintarCam();
    if (S.cam && sens.activo && !sens.camPermiso) await pedirPermisoCam();
  };
  seg('segCamArbol', 'cam_arbol', String);
  $('#btnApuntar').onclick = () => {
    if (ses.fase !== 'idle' || !window.DragCam) return;
    DragCam.abrirApuntar({
      carril: S.cam_carril || 'izq', zonas: S.cam_zona, orig: S.cam_orig, camara: S.cam_camara,
      alGuardar: (r) => {
        // zonas aprendidas con otra cámara o tamaño ya no sirven
        S.cam_zona = { izq: r.zonas.izq || null, der: r.zonas.der || null }; S.cam_orig = r.orig; S.cam_camara = r.camara;
        if (r.estado) S.cam_info = r.estado;
        sens.camPermiso = 'si';
        guardarAjustes(); pintarCam();
      },
    });
  };
  // Ajustes: calibración con boletas, rollout medido por la cámara, zona y cuadros guardados
  async function pintarAjCam() {
    const cont = $('#ajCamCal');
    if (!window.Semaforo) { cont.innerHTML = '<p>Este navegador no puede leer la cámara.</p>'; return; }
    const runs = (await DB.todos()).filter((r) => r.cam && !r.demo);
    const cal = Semaforo.calibracion(runs, { rollout_ft: S.rollout_ft });
    const ms = (x) => `${x > 0 ? '+' : ''}${Math.round(x * 1000)} ms`;
    const aj = S.cam_ajuste, partes = [];
    partes.push(`<p>Corrección de tu reacción: cámara <b>${aj.camara_ms > 0 ? '+' : ''}${aj.camara_ms || 0} ms</b> · acelerómetro <b>${aj.acel_ms > 0 ? '+' : ''}${aj.acel_ms || 0} ms</b> (con ${cal.n_boletas} boleta${cal.n_boletas === 1 ? '' : 's'}).</p>`);
    if (isFin(cal.ajuste_camara_s)) partes.push(`<p>Tus boletas dicen <b>${ms(cal.ajuste_camara_s)}</b> para la cámara (rango ${ms(cal.rango_camara_s[0])} a ${ms(cal.rango_camara_s[1])}).</p><button class="ghost" id="ajUsarCam">Usar ${ms(cal.ajuste_camara_s)}</button>`);
    else partes.push(`<p>Para calibrar: anota tu boleta oficial en el resultado de cada corrida con cámara (faltan ${Math.max(0, 3 - cal.n_boletas_camara)}).</p>`);
    if (isFin(cal.ajuste_acel_s)) partes.push(`<p>Para el acelerómetro tus boletas dicen <b>${ms(cal.ajuste_acel_s)}</b>.</p><button class="ghost" id="ajUsarAcel">Usar ${ms(cal.ajuste_acel_s)}</button>`);
    if (isFin(cal.rollout_medido_ft) && cal.n_rollout >= 3 && cal.mad_rollout_ft < 0.1) {
      const r1 = Math.round(cal.rollout_medido_ft * 10) / 10;
      partes.push(`<p>Rollout medido por la cámara: <b>${cal.rollout_medido_ft.toFixed(2)} ft</b> (${cal.n_rollout} corridas; tienes ${S.rollout_ft}).</p>${r1 !== S.rollout_ft ? `<button class="ghost" id="ajUsarRoll">Usar ${r1} ft</button>` : ''}`);
    }
    cont.innerHTML = partes.join('');
    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    on('ajUsarCam', () => { S.cam_ajuste.camara_ms = Math.round(cal.ajuste_camara_s * 1000); guardarAjustes(); pintarAjCam(); });
    on('ajUsarAcel', () => { S.cam_ajuste.acel_ms = Math.round(cal.ajuste_acel_s * 1000); guardarAjustes(); pintarAjCam(); });
    on('ajUsarRoll', () => { S.rollout_ft = Math.round(cal.rollout_medido_ft * 10) / 10; S.cam_sesgo_acel = null; $('#inRollout').value = S.rollout_ft; guardarAjustes(); pintarAjCam(); });
  }
  // Sesgo acelerómetro↔cámara (K2): se aprende solo con ≥ 3 corridas en que se vio el stage
  async function aprenderSesgo() {
    if (!window.Semaforo) return;
    const runs = (await DB.todos()).filter((r) => r.cam && !r.demo);
    const cal = Semaforo.calibracion(runs, { rollout_ft: S.rollout_ft });
    if (cal.n_sesgo >= 3 && isFin(cal.sesgo_acel_s) && cal.mad_sesgo_s < 0.03) { S.cam_sesgo_acel = cal.sesgo_acel_s; guardarAjustes(); }
  }
  const inCamCuadros = $('#inCamCuadros');
  inCamCuadros.checked = S.cam_cuadros !== false;
  inCamCuadros.onchange = () => { S.cam_cuadros = inCamCuadros.checked; guardarAjustes(); };
  $('#btnOlvidarZona').onclick = () => {
    if (!confirm('¿Olvidar dónde está el árbol? Tendrás que usar "Apuntar la cámara" otra vez.')) return;
    S.cam_zona = { izq: null, der: null }; S.cam_orig = null; S.cam_info = null; guardarAjustes(); pintarCam();
  };
  pintarCam();
  $('#btnDemo').onclick = iniciarDemo;
  $('#btnCancelar').onclick = () => { salirSesion(); };
  $('#btnTerminar').onclick = () => finCorrida('manual');

  // ------------------------------------------------------------ instalación (PWA)
  // Sin botón de compartir a propósito: Daniel pasa el enlace en persona (0.5.2).
  const ua = navigator.userAgent;
  const P = {
    ipad: /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    android: /Android/i.test(ua),
    // navegadores dentro de otras apps (no pueden instalar)
    enApp: /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|Twitter|LinkedInApp|GSA\//i.test(ua),
    navIOS: /CriOS/.test(ua) ? 'Chrome' : /FxiOS/.test(ua) ? 'Firefox' : /EdgiOS/.test(ua) ? 'Edge' : /OPiOS/.test(ua) ? 'Opera' : 'Safari',
    samsung: /SamsungBrowser/i.test(ua),
  };
  P.ios = /iP(hone|od)/.test(ua) || P.ipad;
  P.movil = P.ios || P.android;
  const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let promptInstalar = null;

  function pasosInstalar() {
    const fin = '<p class="hint">Después ábrela siempre desde el ícono nuevo: así funciona sin internet y ahí se guardan tus corridas.</p>';
    if (instalada) return '<p>Ya estás usando la app instalada.</p>';
    if (P.enApp) return `<p>Estás viendo la app dentro de otra app (Instagram, Facebook…), y desde ahí no se puede instalar.</p>
      <ol><li>Toca el menú <b>⋯</b> de esta pantalla.</li><li>Elige <b>Abrir en el navegador</b> (${P.ios ? 'Safari' : 'Chrome'}).</li><li>Ahí sigue los pasos para instalarla.</li></ol>`;
    if (P.ios && P.navIOS === 'Safari') return `<ol>
      <li>Toca <b>Compartir</b> <span class="guia-ico" aria-hidden="true">⎙</span> (el cuadro con la flecha hacia arriba) ${P.ipad ? 'arriba a la derecha' : 'en la barra de abajo'}. Si no lo ves, toca <b>⋯</b> y luego <b>Compartir</b>.</li>
      <li>Desliza hacia abajo y toca <b>Agregar a inicio</b>.</li>
      <li>Toca <b>Agregar</b>.</li></ol>
      <p class="hint">Si no aparece "Agregar a inicio", abriste el enlace dentro de otra app (como WhatsApp): toca <b>Abrir en Safari</b> primero.</p>${fin}`;
    if (P.ios && (P.navIOS === 'Chrome' || P.navIOS === 'Edge')) return `<ol>
      <li>Toca <b>Compartir</b> <span class="guia-ico" aria-hidden="true">⎙</span> junto a la barra de la dirección.</li>
      <li>Toca <b>Agregar a inicio</b> (si no aparece, toca <b>Más</b>).</li><li>Toca <b>Agregar</b>.</li></ol>
      <p class="hint">Si tu iPhone no muestra esa opción, abre el enlace en <b>Safari</b>.</p>${fin}`;
    if (P.ios) return `<p>Para instalarla, abre el enlace en <b>Safari</b> y ahí toca Compartir → <b>Agregar a inicio</b>.</p>${fin}`;
    if (P.android && promptInstalar) return `<p>Toca <b>Instalar app</b> y confirma.</p>${fin}`;
    if (P.android && P.samsung) return `<ol><li>Toca el menú <b>≡</b> abajo a la derecha.</li><li>Toca <b>Agregar página a</b> → <b>Pantalla de inicio</b>.</li></ol>${fin}`;
    if (P.android) return `<ol><li>Toca el menú <b>⋮</b> arriba a la derecha de Chrome.</li><li>Toca <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.</li><li>Confirma con <b>Instalar</b>.</li></ol>${fin}`;
    return '<p>Abre este enlace en tu teléfono (iPhone, iPad o Android) para instalarla: necesita el GPS del teléfono.</p>';
  }
  function pintarGuia() {
    const html = pasosInstalar();
    document.querySelectorAll('.guia .guia-pasos').forEach((d) => { d.innerHTML = html; });
    document.querySelectorAll('[data-instalar]').forEach((b) => { b.hidden = !promptInstalar || instalada; });
    // En Medir solo se muestra la primera vez, en el teléfono y si no está instalada
    $('#guiaMedir').hidden = instalada || !P.movil || LS.get('dragtrim.guiaOculta', false);
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptInstalar = e; pintarGuia(); });
  window.addEventListener('appinstalled', () => { promptInstalar = null; LS.set('dragtrim.guiaOculta', true); pintarGuia(); });
  document.querySelectorAll('[data-instalar]').forEach((b) => {
    b.onclick = async () => {
      if (!promptInstalar) return;
      promptInstalar.prompt();
      try { await promptInstalar.userChoice; } catch (e) { /* */ }
      promptInstalar = null; pintarGuia();
    };
  });
  $('#guiaOcultar').onclick = () => { LS.set('dragtrim.guiaOculta', true); pintarGuia(); };
  pintarGuia();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* la app funciona igual sin modo sin conexión */ });
  }

  if (!window.isSecureContext) mensaje('Abre la app desde su enlace https:// para poder usar el GPS. La corrida simulada sí funciona aquí.', true);
  tickEstado();
  window.__dragtrim = { S, buf, ses, sens, DB, pintarCam };   // para pruebas
})();
