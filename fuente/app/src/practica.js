/* practica.js — Simulador de semáforo de arrancones (práctica de reacción) */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const isFin = Number.isFinite;
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
  };

  const P = Object.assign({ modo: 'solo', arbol: 'pro', salida: 'soltar', retraso: 0, formato: 'boleta' }, LS.get('dragtrim.practica.cfg', {}));
  let hist = LS.get('dragtrim.practica.hist', []);
  const marcador = { l: 0, r: 0 };
  const guardarCfg = () => LS.set('dragtrim.practica.cfg', P);

  // Secuencia del árbol (s desde que se activa): ámbar i encendido en [ini, fin), verde en `verde`
  function secuencia() {
    return P.arbol === 'pro'
      ? { ambar: [[0, 0.4], [0, 0.4], [0, 0.4]], verde: 0.4 }
      : { ambar: [[0, 0.5], [0.5, 1.0], [1.0, 1.5]], verde: 1.5 };
  }

  // Formatos de reacción:
  //  boleta: como el ticket de pista, medido desde el último ámbar (perfecta .400 Pro / .500 Full)
  //  verde:  diferencia contra la verde (perfecta .000)
  const perfecta = (arbol) => (arbol === 'pro' ? 0.4 : 0.5);
  function fmtRT(rt, arbol, formato) {
    if (!isFin(rt)) return '—';
    if (formato === 'boleta') return (rt + perfecta(arbol)).toFixed(3);
    return (rt > 0 ? '+' : '') + rt.toFixed(3);
  }
  const otroFormato = () => (P.formato === 'boleta' ? 'verde' : 'boleta');
  const nombreFormato = (f) => (f === 'boleta' ? 'boleta' : 'desde la verde');

  const nuevoCarril = () => ({ abajo: false, pid: null, preStage: false, staged: false, salio: false, tSalida: NaN, rt: NaN, rojo: false, timerStage: 0, brillo: false });
  const st = { fase: 'cerrado', c: { l: nuevoCarril(), r: nuevoCarril() }, tArbol: NaN, tVerdePlan: NaN, tVerde: NaN, raf: 0, timers: [] };
  const activos = () => (P.modo === 'solo' ? ['l'] : ['l', 'r']);

  function limpiarTimers() { st.timers.forEach(clearTimeout); st.timers = []; cancelAnimationFrame(st.raf); st.raf = 0; }
  function despues(ms, fn) { st.timers.push(setTimeout(fn, ms)); }

  // ---------------------------------------------------------------- fondo que responde a la reacción
  // Se enciende en cuanto ese carril sale (ya con su tiempo calculado), nunca antes: no da pistas de la verde.
  // Verde: más brillo entre más cerca de la perfecta (.000 desde la verde = .400 Pro / .500 Full).
  // Rojo: luz roja, o reacción lenta.
  function intensidad(c) {
    if (!c.salio) return [0, 0, false];
    if (c.rojo || !isFin(c.rt)) return [0, 1, false];
    const v = Math.pow(Math.max(0, 1 - c.rt / 0.200), 1.3);       // .000 → 1, .050 → .69, .100 → .41, .200 → 0
    const r = Math.min(1, Math.max(0, (c.rt - 0.250) / 0.250));   // .250 → 0, .375 → .5, .500 → 1
    return [v, r, c.rt < 0.010];
  }
  function brillo(k, v, r, perfecta) {
    const gv = document.getElementById(`ptBv_${k}`), gr = document.getElementById(`ptBr_${k}`);
    if (!gv || !gr) return;
    gv.style.opacity = (0.92 * v).toFixed(3);
    gr.style.opacity = (0.92 * r).toFixed(3);
    gv.classList.remove('perfecta');
    if (perfecta) { void gv.offsetWidth; gv.classList.add('perfecta'); }
  }

  function reiniciar() {
    limpiarTimers();
    for (const k of ['l', 'r']) brillo(k, 0, 0, false);
    for (const k of ['l', 'r']) { clearTimeout(st.c[k].timerStage); st.c[k] = nuevoCarril(); }
    st.fase = 'idle'; st.tArbol = NaN; st.tVerdePlan = NaN; st.tVerde = NaN;
    $('#ptMsg').textContent = '';
    for (const k of ['l', 'r']) { $(`#ptRt_${k}`).textContent = ''; $(`#ptLab_${k}`).textContent = ''; }
    pintar(performance.now());
  }

  // ---------------------------------------------------------------- dibujo
  function luz(id, on) { const e = document.getElementById(id); if (e) e.classList.toggle('on', !!on); }

  function pintar(ahora) {
    const sq = secuencia();
    const el = isFin(st.tArbol) ? (ahora - st.tArbol) / 1000 : -1;
    const arbolActivo = st.fase === 'arbol' || st.fase === 'resultado';
    for (const k of ['l', 'r']) {
      const c = st.c[k];
      luz(`pt_${k}_pre1`, c.preStage && !c.salio); luz(`pt_${k}_pre2`, c.preStage && !c.salio);
      luz(`pt_${k}_stg1`, c.staged && !c.salio); luz(`pt_${k}_stg2`, c.staged && !c.salio);
      for (let i = 0; i < 3; i++) luz(`pt_${k}_a${i}`, arbolActivo && el >= sq.ambar[i][0] && el < sq.ambar[i][1]);
      luz(`pt_${k}_g`, arbolActivo && el >= sq.verde && !c.rojo && activos().includes(k));
      luz(`pt_${k}_r`, c.rojo);
      const z = document.getElementById(`ptZona_${k}`);
      z.classList.toggle('held', c.abajo || (P.salida === 'tocar' && c.staged && !c.salio));
      z.querySelector('span').textContent = textoZona(c);
    }
  }

  function textoZona(c) {
    if (st.fase === 'resultado') return P.salida === 'soltar' ? 'Mantén para otra salida' : 'Toca para otra salida';
    if (c.salio) return c.rojo ? 'Luz roja' : 'Salida';
    if (c.staged) return P.salida === 'soltar' ? 'STAGED · suelta con la verde' : 'STAGED · toca con la verde';
    if (c.preStage) return 'Pre-stage…';
    return P.salida === 'soltar' ? 'Mantén presionado para hacer stage' : 'Toca para hacer stage';
  }

  function bucle(ts) {
    const sq = secuencia();
    // instante en que la verde se dibuja por primera vez (referencia del tiempo de reacción)
    if (st.fase === 'arbol' && !isFin(st.tVerde) && ts >= st.tVerdePlan) st.tVerde = ts;
    pintar(ts);
    if (st.fase === 'arbol') st.raf = requestAnimationFrame(bucle);
    else if (st.fase === 'resultado' && isFin(st.tArbol) && (ts - st.tArbol) / 1000 < sq.verde + 0.1) st.raf = requestAnimationFrame(bucle);
  }

  // ---------------------------------------------------------------- lógica
  function hacerStage(k) {
    const c = st.c[k];
    c.preStage = true; pintar(performance.now());
    c.timerStage = setTimeout(() => {
      if (P.salida === 'soltar' && !c.abajo) return;
      c.staged = true; pintar(performance.now()); revisarTodosStaged();
    }, 300);
  }

  function revisarTodosStaged() {
    if (st.fase !== 'idle') return;
    if (!activos().every((k) => st.c[k].staged)) return;
    st.fase = 'espera';
    // como el arranque automático: el árbol baja tras un retraso aleatorio
    despues(600 + Math.random() * 900, iniciarArbol);
  }

  function iniciarArbol() {
    if (st.fase !== 'espera') return;
    const sq = secuencia();
    st.fase = 'arbol'; st.tArbol = performance.now(); st.tVerdePlan = st.tArbol + sq.verde * 1000; st.tVerde = NaN;
    st.raf = requestAnimationFrame(bucle);
    despues((sq.verde + 2.5) * 1000, finRonda);   // quien no salga en 2.5 s queda sin salida
  }

  function salida(k, ts) {
    const c = st.c[k];
    if (c.salio) return;
    c.salio = true; c.abajo = false; c.tSalida = ts;
    const tLlega = ts + P.retraso * 1000;   // el auto tarda en dejar el haz de stage
    if (st.fase === 'espera' || st.fase === 'idle') {
      c.rojo = true; c.rt = NaN;   // salió antes de que bajara el árbol
    } else {
      const ref = isFin(st.tVerde) && tLlega >= st.tVerde ? st.tVerde : st.tVerdePlan;
      c.rt = (tLlega - ref) / 1000;
      c.rojo = c.rt < 0;
    }
    pintar(performance.now());
    brillo(k, ...intensidad(c)); c.brillo = true;   // al instante, con el tiempo ya medido
    if (activos().every((x) => st.c[x].salio)) {
      if (st.fase === 'espera') { limpiarTimers(); finRonda(); }
      else despues(400, finRonda);
    }
  }

  function calificar(rt) {
    if (rt < 0.010) return '¡Perfecta!';
    if (rt < 0.050) return 'Muy buena';
    if (rt < 0.100) return 'Buena';
    if (rt < 0.200) return 'Regular';
    return 'Lenta';
  }

  function finRonda() {
    if (st.fase === 'resultado' || st.fase === 'cerrado') return;
    const eraEspera = st.fase === 'espera';
    st.fase = 'resultado';
    st.timers.forEach(clearTimeout); st.timers = [];
    const res = {};
    for (const k of activos()) {
      const c = st.c[k];
      const rt = $(`#ptRt_${k}`), lab = $(`#ptLab_${k}`);
      if (!c.salio) { rt.textContent = '—'; lab.textContent = 'Sin salida'; res[k] = { orden: Infinity }; continue; }
      const otro = isFin(c.rt) ? `${fmtRT(c.rt, P.arbol, otroFormato())} ${nombreFormato(otroFormato())}` : '';
      if (c.rojo) {
        rt.textContent = isFin(c.rt) ? fmtRT(c.rt, P.arbol, P.formato) : 'ROJA';
        lab.textContent = isFin(c.rt) ? `Luz roja (${otro})` : 'Luz roja: saliste antes del árbol';
        res[k] = { rojo: true, t: c.tSalida };
      } else {
        rt.textContent = fmtRT(c.rt, P.arbol, P.formato); lab.textContent = `${calificar(c.rt)} (${otro})`;
        res[k] = { orden: c.rt };
      }
      rt.className = 'pt-rtv' + (c.rojo ? ' rojo' : '');
    }
    for (const k of activos()) if (!st.c[k].brillo) brillo(k, ...intensidad(st.c[k]));
    if (P.modo === 'solo') {
      const c = st.c.l;
      if (c.salio) {
        hist.push({ rt: isFin(c.rt) ? +c.rt.toFixed(4) : null, rojo: c.rojo, arbol: P.arbol, ret: P.retraso, f: Date.now() });
        if (hist.length > 500) hist = hist.slice(-500);
        LS.set('dragtrim.practica.hist', hist);
      }
      $('#ptMsg').textContent = '';
    } else {
      $('#ptMsg').textContent = ganador(res);
      $('#ptScore').textContent = `${marcador.l} – ${marcador.r}`;
    }
    if (!eraEspera) st.raf = requestAnimationFrame(bucle); else pintar(performance.now());
  }

  // Reglas de pista: una luz roja pierde; si los dos dan roja, pierde el que salió primero.
  function ganador(res) {
    const L = res.l, R = res.r;
    let g = null, txt = '';
    if (L.rojo && R.rojo) { g = L.t > R.t ? 'l' : 'r'; txt = 'Las dos rojas: pierde quien salió primero.'; }
    else if (L.rojo) { g = 'r'; txt = 'Izquierda dio luz roja.'; }
    else if (R.rojo) { g = 'l'; txt = 'Derecha dio luz roja.'; }
    else if (L.orden === Infinity && R.orden === Infinity) return 'Nadie salió.';
    else if (L.orden === R.orden) return 'Empate.';
    else {
      g = L.orden < R.orden ? 'l' : 'r';
      const dif = Math.abs(L.orden - R.orden);
      txt = isFin(dif) ? `por ${dif.toFixed(3)} s.` : '';
    }
    marcador[g]++;
    return `Gana ${g === 'l' ? 'izquierda' : 'derecha'} ${txt}`.trim();
  }

  // ---------------------------------------------------------------- toques
  function abajo(k, e) {
    e.preventDefault();
    if (!activos().includes(k) || st.fase === 'cerrado') return;
    if (st.fase === 'resultado') reiniciar();
    const c = st.c[k];
    if (P.salida === 'soltar') {
      if (c.abajo || c.salio) return;
      c.abajo = true; c.pid = e.pointerId;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (er) { /* */ }
      if (st.fase === 'idle') hacerStage(k);
      pintar(performance.now());
    } else {
      if (!c.preStage && st.fase === 'idle') hacerStage(k);
      else if (c.staged && !c.salio && (st.fase === 'espera' || st.fase === 'arbol')) salida(k, e.timeStamp || performance.now());
    }
  }
  function arriba(k, e) {
    if (P.salida !== 'soltar') return;
    const c = st.c[k];
    if (!c.abajo || c.pid !== e.pointerId) return;
    c.abajo = false;
    if (!c.staged) { clearTimeout(c.timerStage); c.preStage = false; pintar(performance.now()); return; }
    if (st.fase === 'idle') { c.staged = false; c.preStage = false; pintar(performance.now()); return; }   // el otro carril aún no hacía stage
    if (st.fase === 'espera' || st.fase === 'arbol') salida(k, e.timeStamp || performance.now());
  }
  for (const k of ['l', 'r']) {
    const z = document.getElementById(`ptZona_${k}`);
    z.addEventListener('pointerdown', (e) => abajo(k, e));
    z.addEventListener('pointerup', (e) => arriba(k, e));
    z.addEventListener('pointercancel', (e) => arriba(k, e));
    z.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ---------------------------------------------------------------- abrir / cerrar
  let wake = null;
  async function abrir() {
    const ov = $('#ptOverlay');
    ov.hidden = false; ov.classList.toggle('solo', P.modo === 'solo');
    document.body.classList.add('practica');
    $('#ptTipo').textContent = (P.arbol === 'pro' ? 'Árbol Pro .4' : 'Árbol Full .5') + (P.retraso > 0 ? `, auto ${P.retraso.toFixed(2)} s` : '');
    $('#ptScore').hidden = P.modo === 'solo';
    $('#ptScore').textContent = `${marcador.l} – ${marcador.r}`;
    reiniciar();
    try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; }
  }
  function cerrar() {
    st.fase = 'cerrado'; limpiarTimers();
    $('#ptOverlay').hidden = true;
    document.body.classList.remove('practica');
    try { if (wake) wake.release(); } catch (e) { /* */ } wake = null;
    pintarStats();
  }

  // ---------------------------------------------------------------- estadísticas
  function pintarStats() {
    const delArbol = hist.filter((h) => h.arbol === P.arbol);
    $('#psTitulo').textContent = `Tus salidas en modo solo, árbol ${P.arbol === 'pro' ? 'Pro .4' : 'Full .5'} (formato ${nombreFormato(P.formato)})`;
    const ok = delArbol.filter((h) => !h.rojo && isFin(h.rt));
    const ult = ok.slice(-20);
    const prom = ult.length ? ult.reduce((s, h) => s + h.rt, 0) / ult.length : NaN;
    const mejor = ok.length ? Math.min(...ok.map((h) => h.rt)) : NaN;
    const rojos = delArbol.filter((h) => h.rojo).length;
    $('#psMejor').textContent = fmtRT(mejor, P.arbol, P.formato);
    $('#psProm').textContent = fmtRT(prom, P.arbol, P.formato);
    $('#psRojas').textContent = delArbol.length ? `${rojos} de ${delArbol.length}` : '—';
    const ul = $('#psUlt'); ul.innerHTML = '';
    for (const h of delArbol.slice(-12).reverse()) {
      const li = document.createElement('li');
      li.textContent = isFin(h.rt) ? fmtRT(h.rt, h.arbol, P.formato) : 'roja';
      if (h.rojo) li.className = 'rojo';
      ul.appendChild(li);
    }
    $('#psVacio').hidden = delArbol.length > 0;
  }

  // ---------------------------------------------------------------- ajustes de práctica
  function seg(id, key) {
    const el = document.getElementById(id);
    const pin = () => el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === P[key])));
    el.querySelectorAll('button').forEach((b) => b.onclick = () => { P[key] = b.dataset.v; guardarCfg(); pin(); pintarStats(); });
    pin();
  }
  seg('segPModo', 'modo'); seg('segPArbol', 'arbol'); seg('segPSalida', 'salida'); seg('segPFormato', 'formato');
  const inRet = $('#inPRetraso');
  inRet.value = P.retraso;
  inRet.onchange = () => {
    let x = parseFloat(String(inRet.value).replace(',', '.'));
    if (!isFin(x)) x = 0;
    x = Math.round(Math.min(0.5, Math.max(0, x)) * 100) / 100;
    P.retraso = x; inRet.value = x; guardarCfg();
  };
  $('#btnPractica').onclick = abrir;
  $('#ptCerrar').onclick = cerrar;
  $('#btnPBorrar').onclick = () => { if (confirm('¿Borrar tus estadísticas de práctica?')) { hist = []; LS.set('dragtrim.practica.hist', hist); pintarStats(); } };
  const tab = document.querySelector('.tabs button[data-view="vPractica"]');
  if (tab) tab.addEventListener('click', pintarStats);
  pintarStats();
  window.__practica = { st, P, hist: () => hist, marcador };   // para pruebas
})();
