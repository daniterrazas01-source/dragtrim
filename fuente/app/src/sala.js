/* sala.js — Race 1 vs 1 por internet, sin hotspot (31 oct 2026, Daniel; decisión de "Race 1 vs 1 feature ideas":
   archivo/ideas/race_1vs1_notas.md). Cada teléfono usa sus propios datos y se conecta a la sala de Daniel
   (fuente/sala/, Cloudflare) con un código de 5 letras: uno la crea y el otro lo teclea. Sin QR.
   Se porta igual que el enlace por QR (enlace.js): estado, on(), enviar(), reloj, aLocal/aOtro, cerrar(); así carrera.js
   usa cualquiera de los dos. Aquí el "otro reloj" es el de la sala: los dos teléfonos se sincronizan contra ella y el
   programa del árbol va en hora de la sala, que cada uno pasa a la suya.
   Estados: conectando → esperando (en la sala, falta el otro) ↔ conectado (los dos) ; desconectado (se fue la señal,
   reintenta solo) ; fallo (código malo, sala vencida) ; cerrado. */
(function (root) {
  'use strict';
  const isFin = Number.isFinite;
  const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sin I, O, 0 ni 1
  const RE_CODIGO = /^[A-HJ-NP-Z2-9]{5}$/;
  const ESPERAS = [500, 1000, 2000, 3000, 5000];          // reintentos al perder la señal
  const SIN_RESPUESTA_MS = 4000;   // la sala contesta cada ping: 4 s callada = conexión muerta (el teléfono a veces no se entera)
  const ENTRADA_MS = 6000;         // para entrar (abrir + bienvenida); sin respuesta, otro intento
  const TXT = {
    ocupada: 'Ese código ya es de otra sala.',
    no_existe: 'No hay ninguna sala con ese código. Revisa las letras.',
    llena: 'Esa sala ya tiene a sus dos teléfonos.',
    rol: 'No se pudo entrar a la sala.',
    sin_red: 'No se pudo conectar con la sala. Revisa que tengas datos o Wi-Fi con internet.',
    sin_url: 'La sala por internet todavía no está publicada.',
  };

  function nuevoCodigo() {
    const u = new Uint8Array(5);
    (root.crypto || globalThis.crypto).getRandomValues(u);
    return Array.from(u, (x) => ALFABETO[x % ALFABETO.length]).join('');
  }

  // crear({url, rol, codigo, id, crear}) → S; S.iniciar() → Promise (se resuelve al entrar o falla con Error.causa)
  function crear(o) {
    const url = String(o.url || '').replace(/\/+$/, '');
    const oy = { estado: [], mensaje: [], reloj: [] };
    const Est = root.DragEnlace && root.DragEnlace.EstimadorReloj;
    const est = Est ? new Est() : null;
    let ws = null, cerrado = false, entro = false, intento = 0, tReconectar = 0, tPing = 0, tAbierto = 0, tUltimo = 0, tEntrada = 0;
    let avisado = null;

    const S = {
      tipo: 'sala', rol: o.rol, codigo: o.codigo, estado: 'nuevo', motivo: '',
      reloj: { listo: false, offset_ms: NaN, error_ms: NaN, rtt_ms: NaN, n: 0 },
      on(ev, fn) { if (oy[ev] && typeof fn === 'function') oy[ev].push(fn); },
      enviar(m) {
        if (!ws || ws.readyState !== 1) return false;
        try { ws.send(JSON.stringify(m)); return true; } catch (e) { return false; }
      },
      aLocal: (tSala) => (est ? est.aLocal(tSala) : NaN),
      aOtro: (tLocal) => (est ? est.aOtro(tLocal) : NaN),
      iniciar, cerrar,
    };
    const emitir = (ev, ...a) => { for (const f of oy[ev].slice()) { try { f(...a); } catch (e) { setTimeout(() => { throw e; }, 0); } } };
    function ponerEstado(s, motivo) {
      S.motivo = motivo || '';
      if (S.estado === s) return;
      S.estado = s;
      emitir('estado', s, { motivo: S.motivo });
    }

    let resolver = null, rechazar = null;
    function iniciar() {
      return new Promise((res, rej) => { resolver = res; rechazar = rej; abrir(); });
    }
    function abrir() {
      if (cerrado) return;
      if (!url) { fallar('sin_url'); return; }
      if (!entro && typeof navigator !== 'undefined' && navigator.onLine === false) { fallar('sin_red'); return; }   // sin red: no esperar
      ponerEstado(entro ? 'desconectado' : 'conectando');
      const dir = `${url}/sala/${S.codigo}?rol=${encodeURIComponent(S.rol)}&id=${encodeURIComponent(o.id)}${o.crear && !entro ? '&crear=1' : ''}`;
      let w;
      try { w = new WebSocket(dir); } catch (e) { reintentar(); return; }
      ws = w;
      w.onopen = () => { if (w !== ws) return; tAbierto = tUltimo = performance.now(); };
      w.onmessage = (ev) => { if (w === ws) { tUltimo = performance.now(); recibir(ev.data); } };
      w.onclose = () => { if (w !== ws) return; ws = null; clearTimeout(tPing); clearTimeout(tEntrada); if (!cerrado && S.estado !== 'fallo') reintentar(); };
      w.onerror = () => {};
      clearTimeout(tEntrada);
      tEntrada = setTimeout(() => { if (w === ws && !cerrado && S.estado !== 'conectado' && S.estado !== 'esperando') soltar(); }, ENTRADA_MS);
    }
    // deja la conexión de ahora (muerta o colgada) y abre otra
    function soltar() {
      const w = ws; ws = null;
      clearTimeout(tPing); clearTimeout(tEntrada);
      if (w) { try { w.close(); } catch (e) { /* */ } }
      reintentar();
    }
    function reintentar() {
      if (cerrado) return;
      if (!entro && intento >= 2) { fallar('sin_red'); return; }   // nunca entró: no insistir para siempre
      ponerEstado(entro ? 'desconectado' : 'conectando', entro ? 'Sin señal: reintentando…' : '');
      clearTimeout(tReconectar);
      tReconectar = setTimeout(abrir, ESPERAS[Math.min(intento, ESPERAS.length - 1)]);
      intento++;
    }
    function fallar(causa, texto) {
      clearTimeout(tPing); clearTimeout(tReconectar); clearTimeout(tEntrada);
      const e = new Error(texto || TXT[causa] || causa); e.causa = causa;
      S.motivo = e.message;
      if (rechazar) { const r = rechazar; rechazar = resolver = null; r(e); }
      if (ws) { try { ws.close(); } catch (x) { /* */ } ws = null; }
      ponerEstado('fallo', e.message);
    }
    function recibir(texto) {
      let m;
      try { m = JSON.parse(texto); } catch (e) { return; }
      if (!m || typeof m.tipo !== 'string') return;
      if (m.tipo === 'pong') { alPong(m); return; }
      if (m.tipo === 'error') { fallar(m.causa, m.texto); return; }
      if (m.tipo === 'bienvenida') {
        entro = true; intento = 0; clearTimeout(tEntrada);
        if (resolver) { const r = resolver; resolver = rechazar = null; r(S); }
        ponerEstado(m.otro ? 'conectado' : 'esperando');
        pingRapido();
        return;
      }
      if (m.tipo === 'presencia') { ponerEstado(m.otro ? 'conectado' : 'esperando', m.otro ? '' : 'El otro teléfono no está en la sala.'); return; }
      emitir('mensaje', m);
    }
    // ---- reloj contra la sala: pings (10/s los primeros 2 s de cada conexión, luego 1/s; también vigilan la conexión)
    function pingRapido() { clearTimeout(tPing); ping(); }
    function ping() {
      if (cerrado || !ws || ws.readyState !== 1) return;
      const t1 = performance.now();
      if (t1 - tUltimo > SIN_RESPUESTA_MS) { soltar(); return; }
      S.enviar({ tipo: 'ping', t1 });
      tPing = setTimeout(ping, t1 - tAbierto < 2000 ? 100 : 1000);
    }
    function alPong(m) {
      const t4 = performance.now();
      if (!est || !isFin(m.t1) || !isFin(m.ts) || t4 - m.t1 > 5000) return;
      if (!est.agregar(m.t1, m.ts, t4)) return;
      const r = est.estimar(t4);
      S.reloj = r;
      const a = avisado, dif = (x, y) => (isFin(x) && isFin(y) ? Math.abs(x - y) >= 0.5 : isFin(x) !== isFin(y));
      if (!a || a.listo !== r.listo || dif(r.offset_ms, a.offset_ms) || dif(r.error_ms, a.error_ms)) { avisado = r; emitir('reloj', r); }
    }
    function cerrar() {
      if (cerrado) return;
      cerrado = true;
      clearTimeout(tPing); clearTimeout(tReconectar); clearTimeout(tEntrada);
      if (ws) { try { ws.close(1000); } catch (e) { /* */ } ws = null; }
      ponerEstado('cerrado');
    }
    // al volver a la app (iPhone suspende la conexión en segundo plano): reconectar ya
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || cerrado || !entro) return;
      if (!ws || ws.readyState > 1) { clearTimeout(tReconectar); intento = 0; abrir(); }
      else if (ws.readyState === 1) { tAbierto = performance.now(); pingRapido(); }   // al volver, unos pings rápidos
    });
    return S;
  }

  // Crea una sala con un código nuevo (si ese código ya existe, prueba otro)
  async function crearSala(o) {
    let ultimo = null;
    for (let i = 0; i < 6; i++) {
      const S = crear(Object.assign({}, o, { rol: 'anfitrion', codigo: nuevoCodigo(), crear: true }));
      try { return await S.iniciar(); }
      catch (e) { ultimo = e; S.cerrar(); if (e.causa !== 'ocupada') throw e; }
    }
    throw ultimo;
  }
  async function unirse(o) {
    const codigo = String(o.codigo || '').toUpperCase().replace(/\s+/g, '');
    if (!RE_CODIGO.test(codigo)) { const e = new Error('El código tiene 5 letras o números (sin O, I, 0 ni 1).'); e.causa = 'codigo'; throw e; }
    const S = crear(Object.assign({}, o, { rol: 'invitado', codigo, crear: false }));
    try { return await S.iniciar(); } catch (e) { S.cerrar(); throw e; }
  }

  const api = { crear, crearSala, unirse, nuevoCodigo, RE_CODIGO, ALFABETO, TXT };
  root.DragSala = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
