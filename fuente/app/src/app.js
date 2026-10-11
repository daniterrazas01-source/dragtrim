/* app.js — Interfaz de Drag Trim beta */
(function () {
  'use strict';
  const C = window.DragCore;
  const APP_VERSION = 'beta 0.3.1';
  const $ = (s) => document.querySelector(s);
  const isFin = Number.isFinite;

  // ------------------------------------------------------------ ajustes
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
  };
  const DEF = { dist: 402.336, rollout_ft: 1, unidad: 'kmh', v_confirma_kmh: 50, t_confirma: 8, usar_acc: true, tema: 'auto' };
  const S = Object.assign({}, DEF, LS.get('dragtrim.settings', {}));
  const guardarAjustes = () => LS.set('dragtrim.settings', S);

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

  // ------------------------------------------------------------ tiempo
  const T_ORIGIN = performance.timeOrigin || (Date.now() - performance.now());
  const nowS = () => performance.now() / 1000;

  // ------------------------------------------------------------ buffers de sensores
  const buf = { gps: null, acc: null };
  function limpiarBuffers() {
    buf.gps = { t: [], v: [], hacc: [], lat: [], lon: [] };
    buf.acc = { t: [], ax: [], ay: [], az: [] };
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
    sens.watch = navigator.geolocation.watchPosition(onPosition, onGpsError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    sens.activo = true;
    pedirPantalla();
    $('#btnSensores').hidden = true;
    $('#btnArmar').hidden = false;
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
  const ses = { fase: 'idle', det: null, demo: false, oculta: false, demoTimer: null, rojoTimer: null, ignorados: [] };


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

  function armar() {
    ses.det = new C.DetectorVivo(cfgActual());
    ses.fase = 'espera'; ses.oculta = false; ses.ignorados = [];
    recortar(buf.gps, (buf.gps.t[buf.gps.t.length - 1] || 0) - 30);
    recortar(buf.acc, (buf.acc.t[buf.acc.t.length - 1] || 0) - 30);
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
    await DB.put(run);
    ses.fase = 'resultado';
    mostrarResultado(run, true);
  }

  function construirRun(R, cfg) {
    const ahora = new Date();
    const t0ref = ses.det.tArr;
    const g = buf.gps, a = buf.acc;
    const gi = g.t.findIndex((x) => x >= t0ref - 20), ai = a.t.findIndex((x) => x >= t0ref - 8);
    const sl = (b, i) => { const o = {}; for (const k of Object.keys(b)) o[k] = i < 0 ? [] : b[k].slice(i); return o; };
    const run = {
      id: ahora.getTime(), fecha: ahora.toISOString(), sello: sello(ahora), demo: ses.demo, app: APP_VERSION,
      cfg, ok: R.ok, mensaje: R.mensaje, avisos: R.avisos || [],
      raw: { gps: sl(g, gi), acc: sl(a, ai) },
    };
    aplicarR(run, R);
    return run;
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
    run.recalculada = new Date().toISOString();
    await DB.put(run);
    return run;
  }

  function salirSesion() {
    pararDemo();
    ses.fase = 'idle'; ses.demo = false;
    document.body.classList.remove('sesion');
    $('#medirIdle').hidden = false; $('#medirSesion').hidden = true;
    if (sens.fuente === 'demo') { sens.fuente = 'real'; limpiarBuffers(); sens.ultGps = null; sens.gpsDts = []; }
    mostrarVista('vMedir');
  }

  // ------------------------------------------------------------ demo
  function iniciarDemo() {
    const sim = C.simularSesion({ gps_hz: 1, lag_gps: 0.3, acc_hz: 60, seed: Math.floor(Math.random() * 1e6) });
    sens.fuente = 'demo'; ses.demo = true;
    limpiarBuffers(); sens.ultGps = null; sens.gpsDts = [];
    armar();
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

  // ------------------------------------------------------------ almacenamiento (IndexedDB)
  const DB = {
    mem: [], db: null,
    async abrir() {
      if (this.db || !('indexedDB' in window)) return this.db;
      this.db = await new Promise((res) => {
        try {
          const rq = indexedDB.open('dragtrim', 1);
          rq.onupgradeneeded = () => rq.result.createObjectStore('runs', { keyPath: 'id' });
          rq.onsuccess = () => res(rq.result);
          rq.onerror = () => res(null);
        } catch (e) { res(null); }
      });
      return this.db;
    },
    async tx(modo, fn) {
      const db = await this.abrir();
      if (!db) return null;
      return new Promise((res) => {
        try {
          const t = db.transaction('runs', modo), st = t.objectStore('runs');
          const rq = fn(st);
          t.oncomplete = () => res(rq && rq.result); t.onerror = () => res(null);
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
    async borrar(id) { await this.tx('readwrite', (st) => st.delete(id)); this.mem = this.mem.filter((r) => r.id !== id); },
    async borrarTodo() { await this.tx('readwrite', (st) => st.clear()); this.mem = []; },
  };

  // ------------------------------------------------------------ resultado
  function etPrincipal(run) {
    const h = (run.hitos || []).find((x) => Math.abs(x.dist_m - run.cfg.distancia_final) < 0.01);
    return h || { t: NaN, v_kmh: NaN };
  }

  function mostrarResultado(run, enSesion) {
    const v = $('#vResultado');
    if (!run.ok) {
      v.innerHTML = `<h2>Sin resultado</h2><p class="msg err">${esc(run.mensaje)}</p>
        ${run.avisos.length ? `<ul class="avisos">${run.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
        <div class="actions">
          ${enSesion ? '<button class="primary go" id="rNueva">Armar otra medición</button>' : ''}
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
          <header><b>DRAG TRIM</b><span>${esc(fechaCorta(run.fecha))} &nbsp; ${Df < 300 ? '1/8 MI' : '1/4 MI'}</span></header>
          <table>
            <tr class="hd"><td></td><td>TIEMPO</td><td>${velU().toUpperCase()}</td></tr>
            ${filas}
          </table>
          <footer><span>ROLLOUT ${run.cfg.rollout_ft} FT</span><span>${esc(c.metodo.toUpperCase())}</span></footer>
          ${run.demo ? '<span class="stamp">SIMULADA</span>' : ''}
          ${!run.completo ? '<span class="stamp">INCOMPLETA</span>' : ''}
        </div>
        <div class="kpis">
          <div><span>Tiempo ${nombreDist(Df)}</span><b>${fmtT(et.t)}<small>s</small></b></div>
          <div><span>Vel. de trampa</span><b>${fmtV(run.trampa_kmh)}<small>${velU()}</small></b></div>
          <div><span>0–100 km/h</span><b>${isFin(run.t_0_100) ? run.t_0_100.toFixed(2) : '—'}<small>s</small></b></div>
          <div><span>0–60 mph</span><b>${isFin(run.t_0_60mph) ? run.t_0_60mph.toFixed(2) : '—'}<small>s</small></b></div>
          <div><span>Vel. máxima</span><b>${fmtV(run.est.v_max_kmh)}<small>${velU()}</small></b></div>
          <div><span>G máxima</span><b>${run.est.a_max_g.toFixed(2)}<small>g</small></b></div>
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
        <div class="actions">
          ${enSesion ? '<button class="primary go" id="rNueva">Armar otra medición</button>' : ''}
          <button class="ghost" id="rExport">Exportar datos</button>
          <button class="ghost" id="rRecalc">Recalcular con mis ajustes actuales</button>
          ${enSesion ? '<button class="ghost" id="rSalir">Volver al inicio</button>' : '<button class="danger" id="rBorrar">Borrar esta corrida</button>'}
        </div>`;
    }
    $('#medirSesion').hidden = true;
    document.body.classList.toggle('sesion', !!enSesion);
    mostrarVista('vResultado', !enSesion ? 'vHistorial' : null);
    window.scrollTo(0, 0);
    if (run.ok) requestAnimationFrame(() => graficas(run));
    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = fn; };
    on('rNueva', () => { if (ses.demo) iniciarDemo(); else armar(); });
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
      const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
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
      { name: `drag_raw_meta_${st}.json`, text: JSON.stringify({ version: 'app ' + run.app, distancia_final: run.cfg.distancia_final, t_inicio_busqueda: run.cfg.t_inicio_busqueda, rollout_ft: run.cfg.rollout_ft, simulada: run.demo }) },
    ];
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
        estadisticas: { tiempo_total: run.est.tiempo_total, distancia_total: run.est.distancia_total, v_max: run.est.v_max_kmh, a_max: run.est.a_max_g * C.G0, a_prom: run.est.a_prom_g * C.G0, g_max: run.est.a_max_g },
        calidad: { metodo: run.calidad.metodo, gps_hz: run.calidad.gps_hz, hacc_m: run.calidad.hacc_mediana_m },
        registro: { t: run.serie.t.filter((_, i) => i % 2 === 0), d: run.serie.d.filter((_, i) => i % 2 === 0), v: run.serie.v.filter((_, i) => i % 2 === 0), acc_long: run.serie.a.filter((_, i) => i % 2 === 0) },
      };
      files.push({ name: `DRAGPACK_dragtrim_${st}.txt`, text: `DRAGPACK|${b64utf8(JSON.stringify(payload))}|END` });
    }
    const blob = zip(files), nombre = `dragtrim_${st}.zip`;
    try {
      const file = new File([blob], nombre, { type: 'application/zip' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Drag Trim ' + st }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const url = URL.createObjectURL(blob), aEl = document.createElement('a');
    aEl.href = url; aEl.download = nombre; document.body.appendChild(aEl); aEl.click(); aEl.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ------------------------------------------------------------ historial
  async function pintarHistorial() {
    const runs = await DB.todos(), ul = $('#histList');
    ul.innerHTML = '';
    $('#histEmpty').hidden = runs.length > 0;
    for (const r of runs) {
      const li = document.createElement('li'), b = document.createElement('button');
      const et = r.ok ? etPrincipal(r) : null;
      const sub = r.ok ? `${nombreDist(r.cfg.distancia_final)}, trampa ${fmtV(r.trampa_kmh, 0)} ${velU()}${r.demo ? ', simulada' : ''}${r.completo ? '' : ', incompleta'}`
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
  function aplicarTema() {
    if (S.tema === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', S.tema);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--asphalt').trim();
  }
  aplicarTema();
  const inR = $('#inRollout');
  inR.value = S.rollout_ft;
  inR.onchange = () => { let x = parseFloat(String(inR.value).replace(',', '.')); if (!isFin(x)) x = DEF.rollout_ft; x = Math.round(Math.min(2, Math.max(0, x)) * 10) / 10; S.rollout_ft = x; inR.value = x; guardarAjustes(); };
  const inV = $('#inVconf'), inT = $('#inTconf'), inA = $('#inAcc');
  inV.value = S.v_confirma_kmh; inT.value = S.t_confirma; inA.checked = S.usar_acc;
  inV.onchange = () => { const x = Math.min(120, Math.max(20, +inV.value || DEF.v_confirma_kmh)); S.v_confirma_kmh = x; inV.value = x; guardarAjustes(); };
  inT.onchange = () => { const x = Math.min(20, Math.max(3, +inT.value || DEF.t_confirma)); S.t_confirma = x; inT.value = x; guardarAjustes(); };
  inA.onchange = () => { S.usar_acc = inA.checked; guardarAjustes(); };
  $('#btnBorrarHist').onclick = async () => { if (confirm('¿Borrar todas las corridas guardadas?')) { await DB.borrarTodo(); pintarHistorial(); } };
  $('#verText').textContent = `Drag Trim ${APP_VERSION}, algoritmo v2.3 (mismo que el script de MATLAB).`;

  $('#btnSensores').onclick = activarSensores;
  $('#btnArmar').onclick = () => {
    const s = sens.ultGps;
    if (!s || nowS() - sens.ultGpsRec > 4) { mensaje('Todavía no hay señal GPS. Espera a que aparezca la precisión.', true); return; }
    if (s.hacc > 15) mensaje(`Precisión GPS baja (±${Math.round(s.hacc)} m). Puedes medir, pero espera un poco si puedes.`);
    else mensaje('');
    armar();
  };
  $('#btnDemo').onclick = iniciarDemo;
  $('#btnCancelar').onclick = () => { salirSesion(); };
  $('#btnTerminar').onclick = () => finCorrida('manual');

  // ------------------------------------------------------------ instalación (PWA)
  let promptInstalar = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); promptInstalar = e; $('#btnInstalar').hidden = false; });
  $('#btnInstalar').onclick = async () => { if (!promptInstalar) return; promptInstalar.prompt(); await promptInstalar.userChoice; promptInstalar = null; $('#btnInstalar').hidden = true; };
  const esIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (esIOS && !instalada) $('#iosInstall').hidden = false;
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* la app funciona igual sin modo sin conexión */ });
  }

  if (!window.isSecureContext) mensaje('Abre la app desde su enlace https:// para poder usar el GPS. La corrida simulada sí funciona aquí.', true);
  tickEstado();
  window.__dragtrim = { S, buf, ses, sens, DB };   // para pruebas
})();
