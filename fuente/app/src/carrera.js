/* carrera.js — Race 1 vs 1 (0.7): dos autos, cada uno con Drag Tree en su teléfono. Se emparejan con dos QR (WebRTC por
   la misma red Wi-Fi, sin internet), Daniel alinea los autos, los dos tocan "Listo" y la app prende pre-stage, stage y
   baja el árbol en los dos teléfonos a la vez (relojes sincronizados). Cada quien se mide contra su propia verde con la
   medición de siempre (app.js) y al final la boleta junta los dos carriles con las reglas de pista.
   Piezas: DragQR (qr.js), DragEnlace (enlace.js), DragCarreraNucleo (carrera_nucleo.js) y DragApp (app.js).
   Diseño: archivo/ideas/race_1vs1.md y race_1vs1_programa.md. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const isFin = Number.isFinite;
  const N = window.DragCarreraNucleo;
  const A = () => window.DragApp;
  if (!N || !document.getElementById('rc')) return;
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
  };
  const PARAMS = new URLSearchParams(location.search);
  const SIM_SENS = PARAMS.has('simsens');   // pruebas: el auto de este teléfono es simulado aunque el rival sea real
  const ANTICIPO_MS = 1500;                 // el anfitrión manda la salida con este tiempo de anticipación
  const SIN_SALIDA_S = 25;                  // si no arrancó a los 25 s de la verde, cuenta como "no salió"
  const otroCarril = (c) => (c === 'izq' ? 'der' : 'izq');

  const R = {
    fase: 'cerrado',   // cerrado | inicio | emparejar | sala | arbol | corriendo | boleta
    rol: null, simulado: false, E: null, id: '', carrilAnf: 'izq',
    cfg: Object.assign({ arbol: 'pro', dist: 402.336 }, LS.get('dragtrim.carrera.cfg', {})),
    yo: { listo: false }, otro: { listo: false, sensores: false, sinc: false, app: null, visto: false },
    ronda: 0, prog: null, tVerde: NaN, tUltAmbar: NaN, raf: 0, timers: [], okSalida: false,
    resYo: null, resOtro: null, runYo: null, marcador: { izq: 0, der: 0 }, contadas: new Set(),
    escaner: null, cam: null, codigoMio: '', autoSim: false,
  };
  const miCarril = () => (R.rol === 'invitado' ? otroCarril(R.carrilAnf) : R.carrilAnf);
  const esAnfitrion = () => R.rol === 'anfitrion';
  const usaSimulado = () => SIM_SENS || (R.simulado && !A().sensoresActivos());

  function despues(ms, fn) { const id = setTimeout(fn, ms); R.timers.push(id); return id; }
  function limpiarTimers() { R.timers.forEach(clearTimeout); R.timers = []; cancelAnimationFrame(R.raf); R.raf = 0; }

  // ---------------------------------------------------------------- pantallas
  const PASOS = ['rcInicio', 'rcQr', 'rcEscaner', 'rcTexto', 'rcSala', 'rcArbol'];
  function verPaso(id) {
    for (const p of PASOS) $('#' + p).hidden = p !== id;
    $('#rc').classList.toggle('en-arbol', id === 'rcArbol');
    $('#rcSalir').textContent = id === 'rcArbol' ? 'Cancelar' : 'Salir';
  }
  function mostrarOverlay(si) {
    $('#rc').hidden = !si;
    document.body.classList.toggle('carrera', !!si);
  }
  function chip(txt, cls) {
    const c = $('#rcChip');
    c.hidden = !txt; c.textContent = txt || ''; c.className = 'rc-chip' + (cls ? ' ' + cls : '');
  }
  function aviso(el, txt, err) { el.textContent = txt || ''; el.classList.toggle('err', !!err); }

  // ---------------------------------------------------------------- abrir / cerrar
  function abrir() {
    if (R.fase !== 'cerrado') { volver(); return; }
    R.fase = 'inicio';
    verPaso('rcInicio'); chip('');
    mostrarOverlay(true);
  }
  function apagarCamara() {
    if (R.escaner) { try { R.escaner.detener(); } catch (e) { /* */ } R.escaner = null; }
    if (R.cam && window.DragQR) { DragQR.soltar(R.cam); R.cam = null; }
  }
  // Termina la carrera por completo: cierra la conexión, desarma la medición y vuelve a Medir
  function terminar() {
    limpiarTimers(); apagarCamara();
    if (R.E) { try { R.E.enviar({ tipo: 'adios' }); } catch (e) { /* */ } try { R.E.cerrar(); } catch (e) { /* */ } }
    R.E = null; R.rol = null; R.simulado = false; R.fase = 'cerrado';
    R.yo.listo = false; R.otro = { listo: false, sensores: false, sinc: false, app: null, visto: false };
    R.resYo = null; R.resOtro = null; R.runYo = null; R.prog = null;
    R.marcador = { izq: 0, der: 0 }; R.contadas = new Set(); R.ronda = 0;
    mostrarOverlay(false);
    if (A().fase() !== 'idle') A().salir();
  }
  function botonSalir() {
    if (R.fase === 'arbol') { cancelarRonda('Cancelaste la salida.', true); return; }
    if (R.fase === 'sala' && !confirm('¿Salir de la carrera? Se corta la conexión con el otro teléfono.')) return;
    terminar();
  }
  // Desde el resultado o el historial: regresa a la sala de la carrera abierta
  function volver() {
    if (!R.E) { terminar(); abrir(); return; }
    if (A().fase() !== 'idle') A().salir();
    R.yo.listo = false; enviarEstado();
    entrarSala();
  }

  // ---------------------------------------------------------------- emparejar (dos QR)
  function nuevoEnlace(rol) {
    const E = DragEnlace.crear({ rol });
    E.on('estado', alEstado);
    E.on('mensaje', alMensaje);
    let sincAntes = false, tEstado = 0;
    E.on('reloj', (rel) => {
      if (R.fase === 'sala') pintarSala();
      const ahora = performance.now();
      if (!esAnfitrion() && (!!(rel && rel.listo) !== sincAntes || ahora - tEstado > 3000)) { sincAntes = !!(rel && rel.listo); tEstado = ahora; enviarEstado(); }
    });
    return E;
  }
  async function crear() {
    if (!window.DragEnlace || !window.DragQR) return;
    R.rol = 'anfitrion'; R.simulado = false; R.id = Math.random().toString(36).slice(2, 10);
    R.fase = 'emparejar';
    verPaso('rcQr');
    $('#rcQrPaso').textContent = 'Paso 1 de 2'; $('#rcQrTit').textContent = 'Escanea este código con el otro teléfono';
    aviso($('#rcQrTxt'), 'Preparando el código…');
    $('#rcLeerResp').hidden = true; $('#rcQrEspera').hidden = true;
    limpiarQr();
    // con permiso de cámara el navegador pone las IP reales en el código (sin él puede no conectar)
    R.cam = await DragQR.pedirCamara();
    try {
      R.E = nuevoEnlace('anfitrion');
      R.codigoMio = await R.E.oferta();
    } catch (e) {
      aviso($('#rcQrTxt'), 'No se pudo preparar la conexión: ' + (e && e.message || e), true);
      apagarCamara();
      return;
    }
    apagarCamara();
    if (R.fase !== 'emparejar') return;
    DragQR.dibujar($('#rcQrCanvas'), R.codigoMio);
    aviso($('#rcQrTxt'), 'En el otro teléfono: Race 1 vs 1 → "Unirme a una carrera", y apunta su cámara aquí.');
    $('#rcLeerResp').hidden = false;
  }
  function unirme() {
    if (!window.DragEnlace || !window.DragQR) return;
    R.rol = 'invitado'; R.simulado = false; R.fase = 'emparejar';
    escanear('o', 'Paso 1 de 2', 'Escanea el código del teléfono que creó la carrera');
  }
  // Abre la cámara para leer el código del otro: 'o' = oferta (invitado), 'a' = respuesta (anfitrión)
  function escanear(tipo, paso, titulo) {
    verPaso('rcEscaner');
    $('#rcEscPaso').textContent = paso; $('#rcEscTit').textContent = titulo;
    aviso($('#rcEscTxt'), 'Acerca el teléfono hasta que el código llene el cuadro.');
    apagarCamara();
    R.escaner = DragQR.escaner($('#rcVideo'), {
      filtro: (t) => t.startsWith('DT1' + tipo) || t.startsWith('DT1' + tipo.toUpperCase()),
      alLeer: (t) => { R.escaner = null; usarCodigo(t); },
      alError: (m) => aviso($('#rcEscTxt'), m + ' Puedes usar el código en texto.', true),
    });
    R.escaner.iniciar().catch((e) => aviso($('#rcEscTxt'), String(e && e.message || e), true));
  }
  // Código del otro teléfono (leído con la cámara o pegado)
  async function usarCodigo(codigo) {
    codigo = String(codigo || '').trim();
    try {
      if (esAnfitrion()) {
        aviso($('#rcEscTxt'), 'Conectando…');
        verPaso('rcQr'); $('#rcQrPaso').textContent = 'Paso 2 de 2'; $('#rcQrTit').textContent = 'Conectando con el otro teléfono';
        $('#rcLeerResp').hidden = true; $('#rcQrEspera').hidden = false; limpiarQr(); aviso($('#rcQrTxt'), '');
        await R.E.aceptar(codigo);
        apagarCamara();
        esperarConexion();
      } else {
        verPaso('rcQr'); $('#rcQrPaso').textContent = 'Paso 2 de 2'; $('#rcQrTit').textContent = 'Ahora el otro teléfono escanea este código';
        aviso($('#rcQrTxt'), 'Preparando tu código…'); $('#rcLeerResp').hidden = true; $('#rcQrEspera').hidden = true; limpiarQr();
        if (R.E) { try { R.E.cerrar(); } catch (e) { /* */ } }
        // la cámara sigue prendida mientras se arma la respuesta: así el código lleva la IP real
        if (!R.cam && !R.escaner) R.cam = await DragQR.pedirCamara();
        R.E = nuevoEnlace('invitado');
        R.codigoMio = await R.E.responder(codigo);
        apagarCamara();
        DragQR.dibujar($('#rcQrCanvas'), R.codigoMio);
        aviso($('#rcQrTxt'), 'En el otro teléfono toca "Ya lo escaneó: leer su código" y apunta su cámara aquí.');
        $('#rcQrEspera').hidden = false;
        $('#rcCodMio').value = R.codigoMio;
        esperarConexion();
      }
    } catch (e) {
      apagarCamara();
      const msg = String(e && e.message || e);
      if (!$('#rcTexto').hidden) { aviso($('#rcTxtMio'), msg, true); return; }
      verPaso('rcEscaner'); aviso($('#rcEscTxt'), msg, true);
    }
  }
  function limpiarQr() { const c = $('#rcQrCanvas'); c.width = 0; c.height = 0; }
  function esperarConexion() {
    despues(25000, () => {
      if (R.fase !== 'emparejar' || !R.E || R.E.estado === 'conectado') return;
      aviso($('#rcQrTxt'), 'No conecta. Revisa que los dos teléfonos estén en la misma red Wi-Fi (el punto de acceso de uno) y vuelvan a empezar.', true);
    });
  }
  function abrirTexto() {
    apagarCamara();
    verPaso('rcTexto');
    $('#rcCodMio').value = R.codigoMio || '';
    aviso($('#rcTxtMio'), esAnfitrion() ? 'Manda este código al otro teléfono (por mensaje) y pega aquí el que te regrese.'
      : (R.codigoMio ? 'Manda este código al teléfono que creó la carrera.' : 'Pega aquí el código del teléfono que creó la carrera. Luego te sale tu código para mandárselo.'));
    $('#rcCodOtro').value = '';
  }

  // ---------------------------------------------------------------- conexión y mensajes
  function enviar(m) { return R.E ? R.E.enviar(m) : false; }
  function enviarEstado() {
    const rel = R.E && R.E.reloj;
    enviar({ tipo: 'estado', listo: R.yo.listo, sensores: usaSimulado() || A().sensoresActivos(), sinc: !!(rel && rel.listo), err: rel && isFin(rel.error_ms) ? +rel.error_ms.toFixed(1) : null });
  }
  function enviarConfig() { if (esAnfitrion()) enviar({ tipo: 'config', arbol: R.cfg.arbol, dist: R.cfg.dist, carrilAnf: R.carrilAnf }); }
  function alEstado(est) {
    if (est === 'conectado') {
      chip('');
      enviar({ tipo: 'hola', app: A().version, rol: R.rol, id: R.id });
      enviarConfig(); enviarEstado();
      reenviarResultado();
      if (R.fase === 'emparejar') { apagarCamara(); limpiarTimers(); entrarSala(); }
      else if (R.fase === 'sala') pintarSala();
    } else if (est === 'desconectado') {
      chip('Sin conexión, reintentando…', 'mal');
      if (R.fase === 'sala') pintarSala();
    } else if (est === 'fallo' || est === 'cerrado') {
      chip('Sin conexión', 'mal');
      R.otro.listo = false;
      if (R.fase === 'sala') pintarSala();
    }
  }
  function alMensaje(m) {
    if (!m || typeof m.tipo !== 'string') return;
    switch (m.tipo) {
      case 'hola':
        R.otro.visto = true; R.otro.app = m.app || null;
        if (R.fase === 'sala') pintarSala();
        break;
      case 'config':
        if (esAnfitrion()) break;
        if (m.arbol === 'pro' || m.arbol === 'full') R.cfg.arbol = m.arbol;
        if (isFin(m.dist)) R.cfg.dist = m.dist;
        if (m.carrilAnf === 'izq' || m.carrilAnf === 'der') R.carrilAnf = m.carrilAnf;
        if (R.fase === 'sala') pintarSala();
        break;
      case 'estado':
        R.otro.listo = !!m.listo; R.otro.sensores = !!m.sensores; R.otro.sinc = !!m.sinc;
        if (R.fase === 'sala') { pintarSala(); revisarSalida(); }
        break;
      case 'salida':
        if (!esAnfitrion()) recibirSalida(m);
        break;
      case 'salida_ok':
        if (m.ronda === R.ronda) R.okSalida = true;
        break;
      case 'cancelar':
        // solo antes de la verde: ya corriendo, cada carril termina su corrida
        if (m.ronda === R.ronda && (R.fase === 'sala' || (R.fase === 'arbol' && !isFin(R.tVerde)))) cancelarRonda(m.motivo || 'El otro carril canceló la salida.', false);
        break;
      case 'resultado':
        if (m.ronda === R.ronda && m.res) { R.resOtro = m.res; alResultadoOtro(); }
        break;
      case 'adios':
        chip('El otro teléfono salió de la carrera', 'mal');
        R.otro.listo = false;
        if (R.fase === 'sala') pintarSala();
        break;
    }
  }

  // ---------------------------------------------------------------- sala
  function entrarSala() {
    limpiarTimers();
    R.fase = 'sala';
    verPaso('rcSala');
    mostrarOverlay(true);
    if (A().sensoresActivos()) A().pedirPantalla();
    pintarSala();
  }
  function pintarSala() {
    const yo = miCarril(), rel = R.E && R.E.reloj;
    for (const c of ['izq', 'der']) {
      const card = $('#rcCarril_' + c), mio = c === yo;
      card.classList.toggle('mio', mio);
      card.querySelector('.rc-quien').textContent = mio ? 'Tú' : (R.simulado ? 'Rival simulado' : 'El otro teléfono');
      const sens = mio ? (usaSimulado() || A().sensoresActivos()) : R.otro.sensores;
      const listo = mio ? R.yo.listo : R.otro.listo;
      const conectado = mio || (R.E && R.E.estado === 'conectado' && R.otro.visto);
      card.querySelector('.rc-est').innerHTML = [
        conectado ? '' : '<li class="no">Sin conexión</li>',
        `<li class="${sens ? 'si' : 'no'}">${sens ? (mio && usaSimulado() ? 'Auto simulado' : 'Sensores listos') : 'Sin sensores'}</li>`,
        `<li class="${listo ? 'si' : 'no'}">${listo ? 'Listo' : 'Esperando'}</li>`,
      ].join('');
    }
    if (R.simulado) chip('Rival simulado', 'ok');
    else if (R.E && R.E.estado === 'conectado') chip(rel && rel.listo ? `Conectados · ±${Math.max(1, Math.round(rel.error_ms))} ms` : 'Conectados · sincronizando…', 'ok');
    // árbol y distancia: los elige quien creó la carrera
    const puede = esAnfitrion();
    for (const [id, val] of [['#segRcArbol', R.cfg.arbol], ['#segRcDist', String(R.cfg.dist)]]) {
      $(id).querySelectorAll('button').forEach((b) => { b.setAttribute('aria-checked', String(b.dataset.v === val)); b.disabled = !puede || R.yo.listo; });
    }
    $('#rcCfgNota').textContent = puede ? (R.yo.listo ? 'Para cambiarlo, toca "Ya no estoy listo".' : 'Tú eliges el árbol y la distancia de la carrera.')
      : 'Los elige el teléfono que creó la carrera.';
    const tot = R.marcador.izq + R.marcador.der;
    $('#rcMarcador').hidden = !tot;
    $('#rcMarcador').textContent = `Marcador: izquierdo ${R.marcador.izq} – ${R.marcador.der} derecho`;
    // botones
    const sensOk = usaSimulado() || A().sensoresActivos();
    $('#rcSensores').hidden = sensOk;
    $('#rcListo').hidden = !sensOk;
    $('#rcListo').textContent = R.yo.listo ? 'Ya no estoy listo' : 'Listo: ya estamos alineados';
    $('#rcListo').classList.toggle('go', !R.yo.listo);
    $('#rcListoTxt').textContent = R.yo.listo
      ? (R.otro.listo ? 'Los dos listos: el árbol va a bajar.' : 'Esperando a que el otro carril toque Listo…')
      : 'Alinea los dos autos. Cuando los dos toquen Listo, el árbol prende pre-stage, luego stage y baja solo.';
    $('#rcCambiar').hidden = !puede || R.yo.listo || R.otro.listo;
    $('#rcReemparejar').hidden = R.simulado || !R.E || R.E.estado === 'conectado' || R.E.estado === 'conectando';
    const msg = $('#rcMsg');
    if (R.otro.app && R.otro.app !== A().version) aviso(msg, `El otro teléfono tiene la versión ${R.otro.app} y este la ${A().version}. Abran la app con internet para que los dos se actualicen.`, true);
    else if (R.E && R.E.estado !== 'conectado' && !R.simulado) aviso(msg, 'Se perdió la conexión con el otro teléfono. Si no vuelve sola, toca "Volver a emparejar".', true);
    else if (!R.simulado && R.E && R.E.reloj && R.E.reloj.listo && R.E.reloj.error_ms > 30) aviso(msg, 'La conexión está lenta: las dos verdes pueden no salir parejas. Acerquen los teléfonos.', false);
    else aviso(msg, '');
  }
  function cambiarCfg(clave, valor) {
    if (!esAnfitrion() || R.yo.listo) return;
    R.cfg[clave] = valor;
    LS.set('dragtrim.carrera.cfg', R.cfg);
    enviarConfig(); pintarSala();
  }
  function alListo() {
    if (R.fase !== 'sala') return;
    if (R.yo.listo) {
      R.yo.listo = false;
      if (A().fase() === 'espera') A().salir();
      enviarEstado(); pintarSala();
      return;
    }
    if (!usaSimulado() && !A().sensoresActivos()) return;
    R.yo.listo = true;
    // la medición de siempre queda armada desde aquí: el arranque se detecta solo
    A().armarCarrera({ dist: R.cfg.dist, simulado: usaSimulado(), alTerminar, mostrar, alCancelar });
    mostrarOverlay(true);
    enviarEstado(); pintarSala();
    revisarSalida();
  }

  // ---------------------------------------------------------------- salida: pre-stage, stage y árbol
  function revisarSalida() {
    if (!esAnfitrion() || R.fase !== 'sala') return;
    if (!R.yo.listo || !R.otro.listo || !R.otro.sinc) return;
    if (!R.simulado && (!R.E || R.E.estado !== 'conectado')) return;
    R.ronda++; R.resYo = null; R.resOtro = null; R.runYo = null; R.okSalida = false;
    const t0 = performance.now() + ANTICIPO_MS;
    const prog = N.programa({ arbol: R.cfg.arbol, t0, azar: Math.random() });
    enviar({ tipo: 'salida', ronda: R.ronda, prog, arbol: R.cfg.arbol, dist: R.cfg.dist });
    programar(prog);
    // si el otro no confirma antes del pre-stage, no baja el árbol en ninguno (nadie corre solo)
    if (!R.simulado) despues(Math.max(0, t0 - 300 - performance.now()), () => {
      if (!R.okSalida && R.fase === 'arbol') { enviar({ tipo: 'cancelar', ronda: R.ronda, motivo: 'El otro teléfono no respondió a tiempo.' }); cancelarRonda('El otro teléfono no respondió a tiempo. Vuelvan a tocar Listo.', false); }
    });
  }
  function recibirSalida(m) {
    if (R.fase !== 'sala' || !R.yo.listo) { enviar({ tipo: 'cancelar', ronda: m.ronda, motivo: 'El otro carril no estaba listo.' }); return; }
    R.ronda = m.ronda; R.resYo = null; R.resOtro = null; R.runYo = null;
    if (m.arbol === 'pro' || m.arbol === 'full') R.cfg.arbol = m.arbol;
    // del reloj del anfitrión al de este teléfono
    const prog = N.moverPrograma(m.prog, R.E.aLocal(m.prog.tPre) - m.prog.tPre);
    if (prog.tPre < performance.now() + 60) { enviar({ tipo: 'cancelar', ronda: m.ronda, motivo: 'La salida llegó tarde al otro teléfono.' }); cancelarRonda('La salida llegó tarde. Vuelvan a tocar Listo.', false); return; }
    enviar({ tipo: 'salida_ok', ronda: m.ronda });
    programar(prog);
  }
  function programar(prog) {
    limpiarTimers();
    R.prog = prog; R.tVerde = NaN; R.tUltAmbar = NaN;
    R.fase = 'arbol';
    R.autoSim = usaSimulado();
    verPaso('rcArbol');
    mostrarOverlay(true);
    const yo = miCarril();
    $('#rcQuien_' + yo).textContent = 'Tú'; $('#rcQuien_' + otroCarril(yo)).textContent = R.simulado ? 'Simulado' : 'Rival';
    $('#rcFase').textContent = '';
    if (R.autoSim) correrSimulado(prog);
    if (R.simulado) correrRival(prog);
    R.raf = requestAnimationFrame(dibujar);
    despues(Math.max(0, prog.tFin - performance.now()), finArbol);
    despues(Math.max(0, prog.tVerde - performance.now()) + SIN_SALIDA_S * 1000, revisarSinSalida);
  }
  function luz(id, on) { const e = document.getElementById(id); if (e) e.classList.toggle('on', !!on); }
  function dibujar(ts) {
    if (R.fase !== 'arbol' || !R.prog) return;
    const L = N.luces(R.prog, ts);
    // la verde y el último ámbar: la marca del cuadro en que se pintaron (la reacción se mide contra esa)
    if (L.verde && !isFin(R.tVerde)) R.tVerde = ts;
    if (L.ambar[2] && !isFin(R.tUltAmbar)) R.tUltAmbar = ts;
    for (const c of ['izq', 'der']) {
      luz(`rc_${c}_pre1`, L.pre); luz(`rc_${c}_pre2`, L.pre);
      luz(`rc_${c}_stg1`, L.stage); luz(`rc_${c}_stg2`, L.stage);
      for (let i = 0; i < 3; i++) luz(`rc_${c}_a${i}`, L.ambar[i]);
      luz(`rc_${c}_g`, L.verde); luz(`rc_${c}_r`, false);
    }
    $('#rcFase').textContent = ts < R.prog.tStage ? 'Pre-stage' : ts < R.prog.tArbol ? 'Stage' : '';
    R.raf = requestAnimationFrame(dibujar);
  }
  // Después de la verde el árbol se quita: la pantalla queda neutral, como al medir (el piloto mira la pista)
  function finArbol() {
    if (R.fase !== 'arbol') return;
    cancelAnimationFrame(R.raf); R.raf = 0;
    R.fase = 'corriendo';
    mostrarOverlay(false);
  }
  function revisarSinSalida() {
    if (R.fase !== 'arbol' && R.fase !== 'corriendo') return;
    if (A().fase() !== 'espera') return;   // ya arrancó (o ya terminó)
    R.resYo = { ok: false, motivo: 'No salió' };
    enviar({ tipo: 'resultado', ronda: R.ronda, res: R.resYo });
    A().salir();
    R.fase = 'boleta';
    pantallaBoleta(null);
  }
  // "Cancelar" en la pantalla de la medición: antes de la verde se cancela la salida de los dos; ya corriendo, solo este
  // carril se da por no terminado (el otro sigue y su resultado cuenta)
  function alCancelar() {
    if (R.fase === 'corriendo' || (R.fase === 'arbol' && isFin(R.tVerde))) {
      limpiarTimers(); mostrarOverlay(false);
      R.resYo = { ok: false, motivo: 'Canceló la corrida' };
      enviar({ tipo: 'resultado', ronda: R.ronda, res: R.resYo });
      R.fase = 'boleta';
      pantallaBoleta(null);
    } else cancelarRonda('Cancelaste la salida.', true);
  }
  function cancelarRonda(motivo, avisar) {
    if (avisar) enviar({ tipo: 'cancelar', ronda: R.ronda, motivo: 'El otro carril canceló la salida.' });
    limpiarTimers();
    for (const c of ['izq', 'der']) for (const s of ['pre1', 'pre2', 'stg1', 'stg2', 'a0', 'a1', 'a2', 'g', 'r']) luz(`rc_${c}_${s}`, false);
    R.yo.listo = false; R.otro.listo = false;
    if (A().fase() !== 'idle') A().salir();
    if (!R.E) { terminar(); return; }
    entrarSala();
    aviso($('#rcMsg'), motivo, true);
    enviarEstado();
  }

  // ---------------------------------------------------------------- resultados
  function alTerminar(run, Rp) {
    R.resYo = N.resultadoPropio({ R: Rp, tVerde: R.tVerde, tUltimoAmbar: R.tUltAmbar, ajusteMs: 0, arbol: R.cfg.arbol, dist: R.cfg.dist });
    R.runYo = run;
    run.race = datosRace();
    enviar({ tipo: 'resultado', ronda: R.ronda, res: R.resYo });
  }
  function datosRace() {
    const rel = R.E && R.E.reloj;
    const rc = {
      v: 1, id: R.id || null, ronda: R.ronda, rol: R.rol, carril: miCarril(), arbol: R.cfg.arbol, dist: R.cfg.dist,
      simulado: R.simulado, auto_simulado: R.autoSim, prog: R.prog, t_verde: R.tVerde, t_ultimo_ambar: R.tUltAmbar,
      sincronia: rel && rel.listo ? { offset_ms: rel.offset_ms, error_ms: rel.error_ms, rtt_ms: rel.rtt_ms } : null,
      propio: R.resYo, rival: R.resOtro, app_rival: R.otro.app,
    };
    rc.ganador = rc.propio && rc.rival ? N.ganador(...lados(rc)) : null;
    return rc;
  }
  const lados = (rc) => (rc.carril === 'izq' ? [rc.propio, rc.rival] : [rc.rival, rc.propio]);
  function reenviarResultado() { if (R.resYo && R.ronda) enviar({ tipo: 'resultado', ronda: R.ronda, res: R.resYo }); }
  async function alResultadoOtro() {
    if (R.runYo) {
      R.runYo.race = datosRace();
      await A().guardar(R.runYo);
    }
    contar();
    if (R.fase === 'boleta') pantallaBoleta(R.runYo);
  }
  function contar() {
    if (!R.resYo || !R.resOtro || R.contadas.has(R.ronda)) return;
    const [izq, der] = miCarril() === 'izq' ? [R.resYo, R.resOtro] : [R.resOtro, R.resYo];
    const g = N.ganador(izq, der);
    if (g && g.ganador) R.marcador[g.ganador]++;
    R.contadas.add(R.ronda);
  }
  // La app terminó de medir: en vez del resultado de siempre, la boleta de la carrera
  function mostrar(run) {
    R.fase = 'boleta';
    contar();
    pantallaBoleta(run);
  }
  function pantallaBoleta(run) {
    const rc = run && run.race ? run.race : datosRace();
    const v = A().pantallaResultado(`<div class="rc-res">${htmlBoleta(null, rc)}
      <div class="actions">
        <button class="primary go" id="rcOtra">Otra carrera</button>
        ${run ? '<button class="ghost" id="rcVerMia">Ver los detalles de mi corrida</button>' : ''}
        <button class="ghost" id="rcSalirRes">Salir de la carrera</button>
      </div></div>`);
    const on = (id, fn) => { const b = v.querySelector('#' + id); if (b) b.onclick = fn; };
    on('rcOtra', volver);
    on('rcVerMia', () => { if (run) A().mostrarResultado(run, false); });
    on('rcSalirRes', terminar);
  }

  // ---------------------------------------------------------------- boleta de los dos carriles
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function htmlBoleta(run, rcDado) {
    const rc = rcDado || (run && run.race);
    if (!rc) return '';
    const [izq, der] = lados(rc);
    const g = izq && der ? N.ganador(izq, der) : null;
    let filas = [];
    try { filas = N.filasTicket(izq || null, der || null, { dist: rc.dist, formato: A().formatoRT(), unidad: A().ajustes.unidad }); } catch (e) { filas = []; }
    const quien = (c) => (c === rc.carril ? 'TÚ' : (rc.simulado ? 'SIMULADO' : 'RIVAL'));
    const fecha = run && run.fecha ? new Date(run.fecha) : new Date();
    const hora = fecha.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const espera = !izq || !der;
    const txt = g ? g.texto : (espera ? 'Esperando el resultado del otro carril…' : '');
    const win = (c) => (g && g.ganador === c ? '<b class="rc-win">WIN</b>' : '');
    return `<div class="slip rc-slip">
        <header><b>DRAG TREE · RACE 1 VS 1</b><span>${esc(hora)} &nbsp; ${rc.arbol === 'full' ? 'FULL .500' : 'PRO .400'} &nbsp; ${rc.dist < 300 ? '1/8 MI' : '1/4 MI'}</span></header>
        <table>
          <tr class="hd"><td></td><td>IZQ · ${quien('izq')}</td><td>DER · ${quien('der')}</td></tr>
          ${filas.map((f) => `<tr class="${esc(f.clase || '')}"><td>${esc(f.etiqueta)}</td><td>${esc(f.izq)}</td><td>${esc(f.der)}</td></tr>`).join('')}
          <tr class="rc-wins"><td></td><td>${win('izq')}</td><td>${win('der')}</td></tr>
        </table>
        <footer><span>${rc.sincronia ? `SINCRONÍA ±${Math.max(1, Math.round(rc.sincronia.error_ms))} MS` : (rc.simulado ? 'RIVAL SIMULADO' : '')}</span><span>RONDA ${rc.ronda || 1}</span></footer>
        ${rc.simulado || rc.auto_simulado ? '<span class="stamp">SIMULADA</span>' : ''}
      </div>
      <p class="rc-ganador${g && g.dudosa ? ' dudosa' : ''}${espera ? ' espera' : ''}" aria-live="polite">${esc(txt)}</p>`;
  }
  // Para el historial: quién ganó, desde este teléfono
  function resumenHist(run) {
    const rc = run.race;
    if (!rc) return '';
    if (!rc.rival) return 'Race 1 vs 1, sin el otro carril';
    const g = rc.ganador || N.ganador(...lados(rc));
    if (!g || !g.ganador) return 'Race 1 vs 1, empate';
    return g.ganador === rc.carril ? 'Race 1 vs 1, ganaste' : 'Race 1 vs 1, perdiste';
  }

  // ---------------------------------------------------------------- rival simulado y auto simulado
  // El rival simulado contesta como otro teléfono: listo, confirma la salida y manda su resultado al llegar a la meta.
  function enlaceSimulado() {
    const oy = { estado: [], mensaje: [], reloj: [] };
    const decir = (m, ms = 40) => setTimeout(() => { if (E.estado === 'conectado') oy.mensaje.forEach((f) => f(m)); }, ms);
    const E = {
      estado: 'conectado', reloj: { listo: true, offset_ms: 0, error_ms: 0, rtt_ms: 0, n: 0 },
      on(ev, fn) { (oy[ev] = oy[ev] || []).push(fn); },
      aLocal: (t) => t, aOtro: (t) => t,
      cerrar() { E.estado = 'cerrado'; },
      enviar(m) {
        if (E.estado !== 'conectado') return false;
        if (m.tipo === 'hola') decir({ tipo: 'hola', app: A().version, rol: 'invitado' });
        else if (m.tipo === 'salida') decir({ tipo: 'salida_ok', ronda: m.ronda }, 20);
        else if (m.tipo === 'resultado') decir({ tipo: 'estado', listo: true, sensores: true, sinc: true }, 1800);
        return true;
      },
    };
    decir({ tipo: 'estado', listo: true, sensores: true, sinc: true }, 900);
    return E;
  }
  function probarSimulado() {
    R.rol = 'anfitrion'; R.simulado = true; R.id = 'sim-' + Math.random().toString(36).slice(2, 8);
    R.E = enlaceSimulado();
    R.E.on('mensaje', alMensaje);
    R.otro.visto = true; R.otro.app = A().version;
    entrarSala();
  }
  const azarRT = () => (Math.random() < 0.08 ? -(0.01 + 0.05 * Math.random()) : 0.06 + 0.24 * Math.random());
  // Auto de este teléfono simulado: la sesión simulada se corre para que cruce el rollout a la verde + su reacción
  function correrSimulado(prog) {
    const C = window.DragCore;
    const sim = C.simularSesion({ gps_hz: 1, lag_gps: 0.3, acc_hz: 60, seed: Math.floor(Math.random() * 1e6) });
    const rt = window.__carreraRT !== undefined ? window.__carreraRT : azarRT();   // pruebas: reacción fija
    const off = (prog.tVerde / 1000 + rt) - sim.verdad.t_ro_abs;
    A().simularCarrera(sim, off);
  }
  // El rival simulado corre en el reloj de su sesión simulada; su resultado llega cuando "pasa la meta"
  function correrRival(prog) {
    const ronda = R.ronda;
    setTimeout(() => {
      const C = window.DragCore;
      const sim = C.simularSesion({ gps_hz: 1, lag_gps: 0.3, acc_hz: 60, seed: Math.floor(Math.random() * 1e6) });
      const rt = window.__rivalRT !== undefined ? window.__rivalRT : azarRT();
      const S = A().ajustes;
      let Rp;
      try { Rp = C.procesar(sim.gps, sim.acc, { distancia_final: R.cfg.dist, rollout_ft: S.rollout_ft, usar_acc: true, t_inicio_busqueda: sim.verdad.t_arranque - 1.5 }); }
      catch (e) { Rp = { ok: false, mensaje: 'Error del rival simulado' }; }
      const tVerdeSim = (sim.verdad.t_ro_abs - rt) * 1000;
      const res = N.resultadoPropio({ R: Rp, tVerde: tVerdeSim, tUltimoAmbar: tVerdeSim - (prog.arbol === 'full' ? 500 : 400), ajusteMs: 0, arbol: prog.arbol, dist: R.cfg.dist });
      const llega = prog.tVerde + 1000 * (Math.max(0, rt) + (isFin(res.et) ? res.et : 8)) + 1500;
      setTimeout(() => { if (R.ronda === ronda && R.simulado && R.E) alMensaje({ tipo: 'resultado', ronda, res }); }, Math.max(0, llega - performance.now()));
    }, 50);
  }

  // ---------------------------------------------------------------- controles
  $('#atRace').addEventListener('click', abrir);
  $('#rcSalir').onclick = botonSalir;
  $('#rcCrear').onclick = crear;
  $('#rcUnirme').onclick = unirme;
  $('#rcSimulado').onclick = probarSimulado;
  $('#rcLeerResp').onclick = () => escanear('a', 'Paso 2 de 2', 'Ahora escanea el código del otro teléfono');
  $('#rcQrTexto').onclick = abrirTexto;
  $('#rcEscTexto').onclick = abrirTexto;
  $('#rcEscCancelar').onclick = () => { apagarCamara(); if (esAnfitrion() && R.codigoMio) { verPaso('rcQr'); $('#rcLeerResp').hidden = false; } else { R.fase = 'inicio'; verPaso('rcInicio'); } };
  $('#rcTextoVolver').onclick = () => { if (R.codigoMio) { verPaso('rcQr'); if (esAnfitrion()) $('#rcLeerResp').hidden = false; } else { R.fase = 'inicio'; verPaso('rcInicio'); } };
  $('#rcCopiar').onclick = async () => {
    const t = $('#rcCodMio').value;
    if (!t) return;
    try { await navigator.clipboard.writeText(t); $('#rcCopiar').textContent = 'Copiado'; }
    catch (e) { const ta = $('#rcCodMio'); ta.focus(); ta.select(); }
    setTimeout(() => { $('#rcCopiar').textContent = 'Copiar mi código'; }, 1500);
  };
  $('#rcConectarTexto').onclick = () => { const t = $('#rcCodOtro').value.trim(); if (t) usarCodigo(t); };
  $('#rcListo').onclick = alListo;
  $('#rcSensores').onclick = async () => { await A().activarSensores(); pintarSala(); enviarEstado(); };
  $('#rcCambiar').onclick = () => { if (!esAnfitrion()) return; R.carrilAnf = otroCarril(R.carrilAnf); enviarConfig(); pintarSala(); };
  $('#rcReemparejar').onclick = () => {
    const rol = R.rol;
    if (R.E) { try { R.E.cerrar(); } catch (e) { /* */ } }
    R.E = null; R.codigoMio = '';
    if (rol === 'anfitrion') crear(); else unirme();
  };
  $('#segRcArbol').querySelectorAll('button').forEach((b) => { b.onclick = () => cambiarCfg('arbol', b.dataset.v); });
  $('#segRcDist').querySelectorAll('button').forEach((b) => { b.onclick = () => cambiarCfg('dist', parseFloat(b.dataset.v)); });

  window.DragCarrera = { abrir, volver, activa: () => !!R.E && R.fase !== 'cerrado', htmlBoleta: (run) => htmlBoleta(run), resumenHist };
  window.__carrera = { R, usarCodigo, codigo: () => R.codigoMio, terminar };   // para pruebas
})();
