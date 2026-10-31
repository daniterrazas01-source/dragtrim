/* carrera.js — Race 1 vs 1 (0.7): dos autos, cada uno con Drag Tree en su teléfono. Se juntan en una sala por internet
   con un código de 5 letras (cada teléfono con sus datos, sin hotspot: sala.js y fuente/sala/) o, sin señal, con dos QR
   (WebRTC por la misma red Wi-Fi). Daniel alinea los autos, los dos tocan "Listo" y la app prende pre-stage, stage y
   baja el árbol en los dos teléfonos a la vez (relojes sincronizados). Cada quien se mide contra su propia verde con la
   medición de siempre (app.js) y al final la boleta junta los dos carriles con las reglas de pista.
   Piezas: DragSala (sala.js), DragQR (qr.js), DragEnlace (enlace.js), DragCarreraNucleo (carrera_nucleo.js) y DragApp.
   Diseño: archivo/ideas/race_1vs1.md, race_1vs1_programa.md y race_1vs1_notas.md (la sala por internet). */
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
  // Sala por internet (fuente/sala/, en la cuenta de Cloudflare de Daniel, publicada el 31 oct con .github/workflows/sala.yml).
  // ?sala=ws://… pone otra (pruebas con fuente/pruebas/sala_local.mjs); ?sala= (vacía) hace como si no hubiera sala.
  const SALA_PUBLICADA = 'wss://dragtree-sala.dani-terrazas01.workers.dev';
  const SALA_URL = PARAMS.has('sala') ? PARAMS.get('sala') : SALA_PUBLICADA;
  const ANTICIPO_MS = 1500;                 // el anfitrión manda la salida con este tiempo de anticipación (Wi-Fi)
  const ANTICIPO_SALA_MS = 2500;            // por internet la salida pasa por la sala y el otro confirma: más tiempo
  const SIN_SALIDA_S = 25;                  // si no arrancó a los 25 s de la verde, cuenta como "no salió"
  const otroCarril = (c) => (c === 'izq' ? 'der' : 'izq');

  // lo que se sabe del otro teléfono (err: cota de su reloj contra la sala; seFue: tocó "Salir")
  const otroNuevo = () => ({ listo: false, sensores: false, sinc: false, err: null, app: null, visto: false, seFue: false });
  const R = {
    fase: 'cerrado',   // cerrado | inicio | emparejar | sala | arbol | corriendo | boleta | detalle (viendo su corrida)
    rol: null, simulado: false, E: null, id: '', carrilAnf: 'izq', intento: 0,
    cfg: Object.assign({ arbol: 'pro', dist: 402.336 }, LS.get('dragtrim.carrera.cfg', {})),
    yo: { listo: false }, otro: otroNuevo(),
    ronda: 0, prog: null, tVerde: NaN, tUltAmbar: NaN, raf: 0, timers: [], okSalida: false,
    resYo: null, resOtro: null, runYo: null, marcador: { izq: 0, der: 0 }, contadas: new Set(),
    escaner: null, cam: null, codigoMio: '', autoSim: false,
  };
  const miCarril = () => (R.rol === 'invitado' ? otroCarril(R.carrilAnf) : R.carrilAnf);
  const esAnfitrion = () => R.rol === 'anfitrion';
  const usaSimulado = () => SIM_SENS || (R.simulado && !A().sensoresActivos());
  const esSala = () => !!(R.E && R.E.tipo === 'sala');
  // Reloj del programa del árbol: por la sala, la hora de la sala; por Wi-Fi, la del teléfono que creó la carrera
  const enRef = () => !!R.E && (esSala() || !esAnfitrion());
  const aRef = (t) => (enRef() ? R.E.aOtro(t) : t);
  const deRef = (t) => (enRef() ? R.E.aLocal(t) : t);
  // Qué tan parejas salen las dos verdes (cota, ms): por la sala se suman la de los dos teléfonos contra ella
  function errSinc() {
    const r = R.E && R.E.reloj;
    if (!r || !r.listo || !isFin(r.error_ms)) return NaN;
    return esSala() ? r.error_ms + (isFin(R.otro.err) ? R.otro.err : 0) : r.error_ms;
  }
  // Identidad de este teléfono para la sala (así lo reconoce si se reconecta)
  function idTelefono() {
    let id = LS.get('dragtrim.carrera.id', '');
    if (!id) { id = 'T' + Math.random().toString(36).slice(2, 12); LS.set('dragtrim.carrera.id', id); }
    return id;
  }

  function despues(ms, fn) { const id = setTimeout(fn, ms); R.timers.push(id); return id; }
  function limpiarTimers() { R.timers.forEach(clearTimeout); R.timers = []; cancelAnimationFrame(R.raf); R.raf = 0; }

  // ---------------------------------------------------------------- pantallas
  const PASOS = ['rcInicio', 'rcCodigo', 'rcUnir', 'rcQr', 'rcEscaner', 'rcTexto', 'rcSala', 'rcArbol'];
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
    verPaso('rcInicio'); chip(''); aviso($('#rcInicioMsg'), '');
    mostrarOverlay(true);
  }
  function apagarCamara() {
    if (R.escaner) { try { R.escaner.detener(); } catch (e) { /* */ } R.escaner = null; }
    if (R.cam && window.DragQR) { DragQR.soltar(R.cam); R.cam = null; }
  }
  // Termina la carrera por completo: cierra la conexión, desarma la medición y vuelve a Medir
  function terminar() {
    limpiarTimers(); apagarCamara();
    const E = R.E; R.E = null;   // primero se suelta: lo que avise al cerrarse ya no toca las pantallas
    if (E) { try { E.enviar({ tipo: 'adios' }); } catch (e) { /* */ } try { E.cerrar(); } catch (e) { /* */ } }
    R.rol = null; R.simulado = false; R.fase = 'cerrado'; R.intento++;
    R.yo.listo = false; R.otro = otroNuevo();
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

  // ---------------------------------------------------------------- conexión: sala por internet o dos QR
  // Los dos caminos (DragSala y DragEnlace) se portan igual: estado, mensaje, reloj, enviar, aLocal/aOtro, cerrar.
  function escuchar(E) {
    E.on('estado', (s, info) => { if (R.E === E) alEstado(s, info); });
    E.on('mensaje', (m) => { if (R.E === E) alMensaje(m); });
    let sincAntes = false, tEstado = 0;
    E.on('reloj', (rel) => {
      if (R.E !== E) return;
      if (R.fase === 'sala') { pintarSala(); revisarSalida(); }
      // cómo va su reloj: el que no decide la salida (por la sala, los dos: cada uno se sincroniza con ella)
      const ahora = performance.now();
      if ((!esAnfitrion() || esSala()) && (!!(rel && rel.listo) !== sincAntes || ahora - tEstado > (esSala() ? 10000 : 3000))) { sincAntes = !!(rel && rel.listo); tEstado = ahora; enviarEstado(); }
    });
    return E;
  }
  function nuevoEnlace(rol) { const E = DragEnlace.crear({ rol }); R.E = E; return escuchar(E); }

  // ---- sala por internet: uno la crea y le dice el código al otro (sin hotspot; cada teléfono con sus datos)
  function sinSala(texto) {
    R.fase = 'inicio'; R.rol = null; verPaso('rcInicio'); chip('');
    aviso($('#rcInicioMsg'), texto || (DragSala.TXT.sin_url + ' Por ahora usen "¿Sin señal en la pista? Conectar con QR".'), true);
    $('.rc-sinred').open = true;
  }
  // sin internet no hay sala: de regreso al inicio, con lo del QR abierto
  const sinInternet = (e) => sinSala(`${(e && e.message) || DragSala.TXT.sin_red} Sin internet, conéctense con QR por Wi-Fi:`);
  async function crearSala() {
    if (!window.DragSala) return;
    if (!SALA_URL) { sinSala(); return; }
    const tok = ++R.intento;
    R.rol = 'anfitrion'; R.simulado = false; R.id = Math.random().toString(36).slice(2, 10); R.fase = 'emparejar';
    verPaso('rcCodigo');
    $('#rcCodigoTxt').textContent = '· · · · ·'; $('#rcCopiarCodigo').hidden = true; $('#rcCodigoEspera').hidden = true;
    aviso($('#rcCodigoMsg'), 'Creando la sala…');
    let S;
    try { S = await DragSala.crearSala({ url: SALA_URL, id: idTelefono() }); }
    catch (e) {
      if (tok !== R.intento) return;
      if (e && e.causa === 'sin_red') sinInternet(e); else aviso($('#rcCodigoMsg'), (e && e.message) || 'No se pudo crear la sala.', true);
      return;
    }
    if (tok !== R.intento) { S.cerrar(); return; }   // salió mientras se creaba
    R.E = escuchar(S);
    $('#rcCodigoTxt').textContent = S.codigo; $('#rcCopiarCodigo').hidden = false;
    aviso($('#rcCodigoMsg'), '');
    alEstado(S.estado, { motivo: S.motivo });
  }
  function unirSala() {
    if (!window.DragSala) return;
    if (!SALA_URL) { sinSala(); return; }
    R.intento++;
    R.rol = 'invitado'; R.simulado = false; R.fase = 'emparejar';
    verPaso('rcUnir');
    aviso($('#rcUnirMsg'), 'Son 5 letras y números; te lo dice el que creó la sala.');
    $('#rcEntrar').disabled = false;
    const inp = $('#rcCodIn'); inp.value = '';
    setTimeout(() => { try { inp.focus(); } catch (e) { /* */ } }, 60);
  }
  async function entrarConCodigo() {
    const cod = $('#rcCodIn').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cod.length !== 5) { aviso($('#rcUnirMsg'), 'El código tiene 5 letras y números.', true); return; }
    if (!DragSala.RE_CODIGO.test(cod)) { aviso($('#rcUnirMsg'), 'Revisa el código: no lleva O, I, 0 ni 1.', true); return; }
    const tok = ++R.intento;
    $('#rcEntrar').disabled = true; aviso($('#rcUnirMsg'), 'Entrando a la sala…');
    let S;
    try { S = await DragSala.unirse({ url: SALA_URL, codigo: cod, id: idTelefono() }); }
    catch (e) {
      if (tok !== R.intento) return;
      $('#rcEntrar').disabled = false;
      if (e && e.causa === 'sin_red') sinInternet(e); else aviso($('#rcUnirMsg'), (e && e.message) || 'No se pudo entrar a la sala.', true);
      return;
    }
    if (tok !== R.intento) { S.cerrar(); return; }
    $('#rcEntrar').disabled = false;
    R.E = escuchar(S);
    alEstado(S.estado, { motivo: S.motivo });
  }
  async function crear() {
    if (!window.DragEnlace || !window.DragQR) return;
    R.rol = 'anfitrion'; R.simulado = false; R.id = Math.random().toString(36).slice(2, 10);
    R.fase = 'emparejar'; R.intento++;
    verPaso('rcQr');
    $('#rcQrPaso').textContent = 'Paso 1 de 2'; $('#rcQrTit').textContent = 'Escanea este código con el otro teléfono';
    aviso($('#rcQrTxt'), 'Preparando el código…');
    $('#rcLeerResp').hidden = true; $('#rcQrEspera').hidden = true;
    limpiarQr();
    // con permiso de cámara el navegador pone las IP reales en el código (sin él puede no conectar)
    R.cam = await DragQR.pedirCamara();
    try {
      nuevoEnlace('anfitrion');
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
      // un código que no toca en este paso: se dice por qué y la cámara sigue buscando
      alRechazar: (t) => aviso($('#rcEscTxt'), /^DT1/i.test(t)
        ? (tipo === 'o' ? 'Ese es el código de respuesta. Escanea el del teléfono que creó la carrera.' : 'Ese es tu propio código o el de otra carrera. Escanea el que muestra el otro teléfono.')
        : 'Ese código no es de Drag Tree.', true),
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
        if (R.E) { const viejo = R.E; R.E = null; try { viejo.cerrar(); } catch (e) { /* */ } }
        // la cámara sigue prendida mientras se arma la respuesta: así el código lleva la IP real
        if (!R.cam && !R.escaner) R.cam = await DragQR.pedirCamara();
        nuevoEnlace('invitado');
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
    enviar({ tipo: 'estado', ronda: R.ronda, listo: R.yo.listo, sensores: usaSimulado() || A().sensoresActivos(), sinc: !!(rel && rel.listo), err: rel && isFin(rel.error_ms) ? +rel.error_ms.toFixed(1) : null });
  }
  function enviarConfig() { if (esAnfitrion()) enviar({ tipo: 'config', arbol: R.cfg.arbol, dist: R.cfg.dist, carrilAnf: R.carrilAnf }); }
  function alEstado(est, info) {
    const motivo = (info && info.motivo) || '';
    if (esSala() && R.fase === 'emparejar') {
      // por la sala: el anfitrión espera con su código en pantalla; el invitado entra a la sala aunque el otro aún no esté
      if (est === 'fallo') { aviso($(esAnfitrion() ? '#rcCodigoMsg' : '#rcUnirMsg'), motivo || 'No se pudo conectar con la sala.', true); return; }
      if (est === 'esperando') {
        if (esAnfitrion()) { chip(''); $('#rcCodigoEspera').hidden = false; aviso($('#rcCodigoMsg'), ''); }
        else { entrarSala(); chip('Esperando al otro teléfono…', 'mal'); }
        return;
      }
      if (est === 'desconectado') { chip('Sin señal, reintentando…', 'mal'); return; }
    }
    if ((est === 'fallo' || est === 'cerrado') && R.fase === 'emparejar') {
      apagarCamara();
      verPaso('rcQr'); $('#rcLeerResp').hidden = true; $('#rcQrEspera').hidden = true;
      aviso($('#rcQrTxt'), ((info && info.motivo) || 'No se pudo conectar.') + ' Revisa que los dos teléfonos estén en la misma red Wi-Fi (el punto de acceso de uno) y vuelvan a empezar.', true);
      return;
    }
    if (est === 'conectado') {
      chip('');
      enviar({ tipo: 'hola', app: A().version, rol: R.rol, id: R.id });
      enviarConfig(); enviarEstado();
      reenviarResultado();
      if (R.fase === 'emparejar') { apagarCamara(); limpiarTimers(); entrarSala(); }
      else if (R.fase === 'sala') pintarSala();
    } else if (est === 'esperando') {
      // por la sala: este teléfono sigue dentro, el otro se salió o perdió la señal (lo que mande al volver, llega)
      R.otro.listo = false;
      chip(R.otro.seFue ? 'El otro teléfono salió de la carrera' : 'Esperando al otro teléfono…', 'mal');
      if (R.fase === 'sala') pintarSala();
    } else if (est === 'desconectado') {
      chip(esSala() ? 'Sin señal, reintentando…' : 'Sin conexión, reintentando…', 'mal');
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
        R.otro.visto = true; R.otro.app = m.app || null; R.otro.seFue = false;
        if (R.fase === 'sala') pintarSala();
        break;
      case 'config':
        if (esAnfitrion()) break;
        if (m.arbol === 'pro' || m.arbol === 'full') R.cfg.arbol = m.arbol;
        if (isFin(m.dist)) R.cfg.dist = m.dist;
        if (m.carrilAnf === 'izq' || m.carrilAnf === 'der') R.carrilAnf = m.carrilAnf;
        if (R.fase === 'sala') pintarSala();
        break;
      case 'estado': {
        // un "Listo" de antes de la última salida no cuenta (puede llegar tarde); si el anfitrión ya va en otra ronda
        // (canceló una salida que aquí no llegó), el invitado se pone en esa
        const r = isFin(m.ronda) ? m.ronda : R.ronda;
        if (!esAnfitrion() && r > R.ronda) R.ronda = r;
        R.otro.listo = !!m.listo && r >= R.ronda; R.otro.sensores = !!m.sensores; R.otro.sinc = !!m.sinc;
        R.otro.err = isFin(m.err) ? m.err : null;
        if (R.fase === 'sala') { pintarSala(); revisarSalida(); }
        break;
      }
      case 'salida':
        if (!esAnfitrion()) recibirSalida(m);
        break;
      case 'salida_ok':
        if (m.ronda === R.ronda) R.okSalida = true;
        break;
      case 'cancelar':
        // solo antes de la verde: ya corriendo, cada carril termina su corrida
        if (!esAnfitrion() && isFin(m.ronda) && m.ronda > R.ronda && R.fase === 'sala') R.ronda = m.ronda;   // la salida no llegó aquí
        if (m.ronda === R.ronda && (R.fase === 'sala' || (R.fase === 'arbol' && !isFin(R.tVerde)))) cancelarRonda(m.motivo || 'El otro carril canceló la salida.', false);
        break;
      case 'resultado':
        if (m.ronda === R.ronda && m.res) { R.resOtro = m.res; alResultadoOtro(); }
        break;
      case 'adios':
        chip('El otro teléfono salió de la carrera', 'mal');
        R.otro.listo = false; R.otro.seFue = true;
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
    else if (R.E && R.E.estado === 'conectado') {
      // corto para que quepa junto al título: por la sala, su código; por Wi-Fi, "Conectados"
      const e = errSinc(), quien = esSala() ? 'Sala ' + R.E.codigo : 'Conectados';
      chip(isFin(e) && (!esSala() || R.otro.sinc) ? `${quien} · ±${Math.max(1, Math.round(e))} ms` : `${quien} · sincronizando…`, 'ok');
    }
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
    // por la sala no hay que volver a emparejar: se reconecta sola y el otro puede volver a entrar con el código
    $('#rcReemparejar').hidden = R.simulado || !R.E || esSala() || R.E.estado === 'conectado' || R.E.estado === 'conectando';
    $('#rcSalaCod').hidden = !esSala();
    if (esSala()) $('#rcSalaCod').textContent = `Sala ${R.E.codigo}: si alguien se sale, vuelve a entrar con este código.`;
    const msg = $('#rcMsg'), est = R.E ? R.E.estado : '', e = errSinc();
    if (R.otro.app && R.otro.app !== A().version) aviso(msg, `El otro teléfono tiene la versión ${R.otro.app} y este la ${A().version}. Abran la app con internet para que los dos se actualicen.`, true);
    else if (esSala() && est === 'esperando') aviso(msg, R.otro.seFue ? `El otro teléfono salió. Puede volver a entrar con el código ${R.E.codigo}.` : 'El otro teléfono no está en la sala (sin señal o fuera de la app). En cuanto vuelva, se conecta solo.', true);
    else if (esSala() && est === 'desconectado') aviso(msg, 'Este teléfono perdió la señal: reintentando conectar con la sala…', true);
    else if (esSala() && est === 'fallo') aviso(msg, (R.E.motivo || 'Se cerró la sala.') + ' Toquen "Salir" y creen otra sala.', true);
    else if (R.E && est !== 'conectado' && !R.simulado) aviso(msg, 'Se perdió la conexión con el otro teléfono. Si no vuelve sola, toca "Volver a emparejar".', true);
    else if (!R.simulado && isFin(e) && e > (esSala() ? 100 : 30)) aviso(msg, esSala()
      ? `La señal está lenta: las verdes pueden prender hasta ${Math.round(e)} ms una de otra. La boleta sale justa igual (cada quien contra su verde).`
      : 'La conexión está lenta: las dos verdes pueden no salir parejas. Acerquen los teléfonos.', false);
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
    if (esSala() && !(R.E.reloj && R.E.reloj.listo)) return;   // por la sala, los dos relojes van contra el de ella
    R.ronda++; R.resYo = null; R.resOtro = null; R.runYo = null; R.okSalida = false;
    // el programa va en el reloj de referencia (hora de la sala, o la de este teléfono por Wi-Fi) y cada uno lo pasa al suyo
    const prog = N.programa({ arbol: R.cfg.arbol, t0: aRef(performance.now()) + (esSala() ? ANTICIPO_SALA_MS : ANTICIPO_MS), azar: Math.random() });
    enviar({ tipo: 'salida', ronda: R.ronda, prog, arbol: R.cfg.arbol, dist: R.cfg.dist });
    const local = N.moverPrograma(prog, deRef(prog.tPre) - prog.tPre);
    programar(local);
    // si el otro no confirma antes del pre-stage, no baja el árbol en ninguno (nadie corre solo)
    if (!R.simulado) despues(Math.max(0, local.tPre - 300 - performance.now()), () => {
      if (!R.okSalida && R.fase === 'arbol') { enviar({ tipo: 'cancelar', ronda: R.ronda, motivo: 'El otro teléfono no respondió a tiempo.' }); cancelarRonda('El otro teléfono no respondió a tiempo. Vuelvan a tocar Listo.', false); }
    });
  }
  function recibirSalida(m) {
    if (R.fase !== 'sala' || !R.yo.listo) { enviar({ tipo: 'cancelar', ronda: m.ronda, motivo: 'El otro carril no estaba listo.' }); return; }
    R.ronda = m.ronda; R.resYo = null; R.resOtro = null; R.runYo = null;
    if (m.arbol === 'pro' || m.arbol === 'full') R.cfg.arbol = m.arbol;
    // del reloj de referencia (el del anfitrión, o la hora de la sala) al de este teléfono
    const prog = N.moverPrograma(m.prog, deRef(m.prog.tPre) - m.prog.tPre);
    if (!isFin(prog.tPre)) { enviar({ tipo: 'cancelar', ronda: m.ronda, motivo: 'El otro teléfono aún no sincroniza su reloj.' }); cancelarRonda('Tu reloj aún no se sincroniza. Vuelvan a tocar Listo en unos segundos.', false); return; }
    if (prog.tPre < performance.now() + 60) { enviar({ tipo: 'cancelar', ronda: m.ronda, motivo: 'La salida llegó tarde al otro teléfono.' }); cancelarRonda('La salida llegó tarde. Vuelvan a tocar Listo.', false); return; }
    enviar({ tipo: 'salida_ok', ronda: m.ronda });
    programar(prog);
  }
  function programar(prog) {
    limpiarTimers();
    R.prog = prog; R.tVerde = NaN; R.tUltAmbar = NaN;
    R.fase = 'arbol';
    R.yo.listo = false; R.otro.listo = false;   // cada salida usa los dos "Listo": para la siguiente se vuelven a tocar
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
    const rel = R.E && R.E.reloj, sala = esSala();
    const rc = {
      v: 1, id: R.id || null, ronda: R.ronda, rol: R.rol, carril: miCarril(), arbol: R.cfg.arbol, dist: R.cfg.dist,
      simulado: R.simulado, auto_simulado: R.autoSim, prog: R.prog, t_verde: R.tVerde, t_ultimo_ambar: R.tUltAmbar,
      conexion: R.simulado ? 'simulada' : (sala ? 'internet' : 'wifi'), sala: sala ? R.E.codigo : null,
      // por la sala: offset y rtt de este teléfono contra ella; error = la cota de los dos juntos
      sincronia: rel && rel.listo ? { offset_ms: rel.offset_ms, error_ms: errSinc(), rtt_ms: rel.rtt_ms } : null,
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
    else if (R.fase === 'sala') pintarSala();
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
    limpiarTimers(); mostrarOverlay(false);
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
    on('rcVerMia', () => { if (run) { R.fase = 'detalle'; A().mostrarResultado(run, false); } });
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
        else if (m.tipo === 'resultado') decir({ tipo: 'estado', ronda: m.ronda, listo: true, sensores: true, sinc: true }, 1800);
        else if (m.tipo === 'cancelar') decir({ tipo: 'estado', ronda: m.ronda, listo: true, sensores: true, sinc: true }, 900);
        return true;
      },
    };
    decir({ tipo: 'estado', ronda: 0, listo: true, sensores: true, sinc: true }, 900);
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
  $('#rcCrearSala').onclick = crearSala;
  $('#rcUnirSala').onclick = unirSala;
  $('#rcEntrar').onclick = entrarConCodigo;
  // el código se escribe en mayúsculas y, con sus 5 letras, entra solo
  $('#rcCodIn').addEventListener('input', (ev) => {
    const i = ev.target, v = i.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (i.value !== v) i.value = v;
    if (v.length === 5 && DragSala.RE_CODIGO.test(v) && !$('#rcEntrar').disabled) entrarConCodigo();
  });
  $('#rcCodIn').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); entrarConCodigo(); } });
  $('#rcCopiarCodigo').onclick = async () => {
    const t = R.E && R.E.codigo;
    if (!t) return;
    try { await navigator.clipboard.writeText(t); $('#rcCopiarCodigo').textContent = 'Copiado'; } catch (e) { /* sin portapapeles: se dicta */ }
    setTimeout(() => { $('#rcCopiarCodigo').textContent = 'Copiar código'; }, 1500);
  };
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
  window.__carrera = { R, usarCodigo, codigo: () => R.codigoMio, terminar, sala: () => (esSala() ? R.E.codigo : '') };   // para pruebas
})();
