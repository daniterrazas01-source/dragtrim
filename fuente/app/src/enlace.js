/* enlace.js — Enlace entre los dos teléfonos de Race 1 vs 1 (Drag Tree)
 *
 * WebRTC sin servidores: el teléfono que crea la carrera (anfitrión) muestra un código "DT1o…" (en QR o para copiar),
 * el otro (invitado) lo lee y contesta con un código "DT1a…", el anfitrión lo lee y quedan conectados por la red local
 * (el punto de acceso de uno de los dos), sin internet. Dos canales de datos negociados:
 *   id 0 'ctl'   confiable y en orden: mensajes JSON de la carrera (E.enviar / evento 'mensaje').
 *   id 1 'reloj' sin orden y sin reintentos: pings tipo NTP en los dos sentidos para saber la diferencia entre los
 *                relojes performance.now() de los dos teléfonos (E.reloj, E.aLocal, E.aOtro).
 *
 * Códigos: "DT1" + 'o' (oferta) o 'a' (respuesta) + base64url de un SDP recortado (solo UDP, IPv4 primero, máx. 4
 * candidatos, sin a=extmap-allow-mixed ni a=msid-semantic) y abreviado: los renglones fijos van como un byte, la huella
 * DTLS, la clave ICE y los candidatos van en binario. Si deflate-raw (CompressionStream) lo acorta, va comprimido con
 * 'o'/'a' en minúscula; si no (o si no hay CompressionStream), sin comprimir con 'O'/'A'. Queda en ~110–170
 * caracteres (QR de versión 7–9) contra ~430 del SDP recortado y comprimido tal cual.
 *
 * Reloj de todo: performance.now() en ms (el mismo que usan los sensores en app.js). offset = reloj del otro − el mío.
 * Funciona en navegador (window.DragEnlace) y en Node (module.exports): ahí se prueban EstimadorReloj y los códigos.
 */
(function (root) {
  'use strict';
  const isFin = Number.isFinite;
  const VERSION = 1;                       // la de los códigos "DT1…"
  const LIMITE_JUNTAR_MS = 2500;           // espera máxima para juntar candidatos ICE
  const STUN = 'stun:stun.l.google.com:19302';

  const TXT = {
    no_es: 'Ese código no es de Drag Tree.',
    otra_version: 'Ese código es de otra versión de Drag Tree. Abran la app con internet en los dos teléfonos para que se actualice y vuelvan a intentar.',
    es_respuesta: 'Ese código es una respuesta; aquí se necesita el del otro teléfono (el que creó la carrera).',
    es_oferta: 'Ese código es el de crear la carrera; aquí se necesita el que muestra el otro teléfono después de leer el tuyo.',
    danado: 'Ese código está incompleto o dañado. Vuelvan a leerlo.',
    otro_emparejamiento: 'Ese código es de otro emparejamiento (uno anterior). Que el otro teléfono vuelva a leer el código que muestra este teléfono.',
    sin_red: 'Este teléfono no encontró ninguna red para conectarse. Prendan el punto de acceso de un teléfono, conecten el otro a esa red Wi-Fi y denle permiso de la cámara a la app.',
    sin_webrtc: 'Este navegador no puede conectar los dos teléfonos.',
    no_lee: 'Este teléfono no puede leer ese código. Actualicen el navegador o el sistema.',
    no_conecto: 'No se pudieron conectar. Revisen que los dos teléfonos estén en la misma red Wi-Fi (el punto de acceso de uno de ellos) y vuelvan a emparejar.',
    sin_senal: 'Se perdió la señal con el otro teléfono. Esperando a que vuelva…',
    se_perdio: 'Se perdió la conexión con el otro teléfono. Vuelvan a emparejar.',
    otro_cerro: 'El otro teléfono salió de la carrera.',
    cerrado: 'Se cerró la conexión.',
  };
  function error(causa, texto) { const e = new Error(texto || TXT[causa] || causa); e.causa = causa; return e; }

  // ================================================================ reloj entre los dos teléfonos
  // Cada ping: t1 (mi reloj al mandar), t2 (reloj del otro al recibir; contesta en ese momento), t4 (mi reloj al volver).
  // rtt = t4 − t1; offset = t2 − (t1 + t4)/2. El offset verdadero está dentro de ±rtt/2 de cada muestra (retrasos ≥ 0),
  // así que las de menor rtt son las buenas. De los últimos 60 s se usan las del 25 % más rápido (o rtt ≤ mínima + 2 ms),
  // con peso ∝ 1/(0.5² + ((rtt − mínima)/2)²/3) (la varianza de un error parejo en ±(rtt − mínima)/2). Si abarcan ≥ 10 s,
  // recta por mínimos cuadrados ponderados (deriva de los cristales, 10–50 ppm) evaluada ahora, con un previo de deriva
  // de σ = 30 ppm (con pocos segundos la pendiente sale ruidosa y tiende a 0; con un minuto manda el dato; tope ±200
  // ppm); si no, media ponderada. (La mediana simple daba casi el doble de error con retrasos parejos de 2–40 ms, y la
  // recta sin previo hasta 3.1 ms entre los 10 y los 60 s: enlace_test.js.)
  // Salto de reloj (un teléfono se durmió y su performance.now() se detuvo): 3 muestras seguidas fuera de su propio
  // intervalo ±rtt/2 + 5 ms alrededor del modelo → se tira lo anterior y se vuelve a empezar con ellas.
  const OPC_RELOJ = { ventana_ms: 60000, min_muestras: 8, abarque_recta_ms: 10000, deriva_max_ppm: 200, piso_ms: 0.5,
    rtt_max_ms: 3000, deriva_sin_modelo_ppm: 50, deriva_previa_ppm: 30 };

  function EstimadorReloj(opts) {
    if (!(this instanceof EstimadorReloj)) return new EstimadorReloj(opts);
    this.o = Object.assign({}, OPC_RELOJ, opts || {});
    this.saltos = 0;
    this.reiniciar();
  }
  EstimadorReloj.prototype.reiniciar = function () { this.M = []; this.raros = []; this.modelo = null; };

  EstimadorReloj.prototype.agregar = function (t1, t2, t4) {
    if (!isFin(t1) || !isFin(t2) || !isFin(t4)) return false;
    const rtt = t4 - t1;
    if (!(rtt >= 0) || rtt > this.o.rtt_max_ms) return false;
    const s = { m: (t1 + t4) / 2, off: t2 - (t1 + t4) / 2, rtt };
    const md = this.modelo;
    if (md && md.n >= this.o.min_muestras) {
      const r = s.off - (md.a + md.b * (s.m - md.tref));
      if (Math.abs(r) > rtt / 2 + Math.max(5, 3 * md.err)) {      // imposible si el modelo sigue bien
        this.raros.push(s);
        if (this.raros.length >= 3) { this.M = this.raros; this.raros = []; this.saltos++; this._calcular(); }
        return true;
      }
      this.raros = [];
    }
    this.M.push(s);
    let mMax = -Infinity;
    for (const x of this.M) if (x.m > mMax) mMax = x.m;
    const desde = mMax - this.o.ventana_ms;
    if (this.M[0].m < desde || this.M.length > 4000) this.M = this.M.filter((x) => x.m >= desde).slice(-4000);
    this._calcular();
    return true;
  };

  function ajustar(sel, w, tref, o) {
    let W = 0, Sx = 0, Sy = 0, mi = Infinity, ma = -Infinity;
    for (let i = 0; i < sel.length; i++) {
      const s = sel[i], x = s.m - tref;
      W += w[i]; Sx += w[i] * x; Sy += w[i] * s.off;
      if (s.m < mi) mi = s.m; if (s.m > ma) ma = s.m;
    }
    const xm = Sx / W, ym = Sy / W;
    let a = ym, b = 0, Sxx = 0, Sxy = 0, recta = false;
    if (ma - mi >= o.abarque_recta_ms && sel.length >= 4) {
      for (let i = 0; i < sel.length; i++) { const dx = sel[i].m - tref - xm; Sxx += w[i] * dx * dx; Sxy += w[i] * dx * (sel[i].off - ym); }
      if (Sxx > 0) { recta = true; b = Sxy / Sxx; a = ym - b * xm; }
    }
    let chi = 0;
    for (let i = 0; i < sel.length; i++) { const r = sel[i].off - (a + b * (sel[i].m - tref)); chi += w[i] * r * r; }
    const gl = sel.length - (recta ? 2 : 1);
    const s2 = gl >= 1 ? Math.max(0.3, chi / gl) : 1;      // dispersión real contra la supuesta en los pesos
    let Pb = 0;                                             // precisión de la pendiente
    if (recta) {
      // pendiente con un previo de deriva de cristal (media 0, σ = deriva_previa_ppm): con poco tramo tiende a 0
      const sb = o.deriva_previa_ppm * 1e-6;
      Pb = Sxx / s2 + (isFin(sb) && sb > 0 ? 1 / (sb * sb) : 0);
      const bmax = o.deriva_max_ppm * 1e-6;
      b = Math.max(-bmax, Math.min(bmax, (Sxy / s2) / Pb));
      a = ym - b * xm;
    }
    return { a, b, recta, W, xm, s2, Pb };
  }

  EstimadorReloj.prototype._calcular = function () {
    const M = this.M, n = M.length, o = this.o;
    if (!n) { this.modelo = null; return; }
    const rt = M.map((s) => s.rtt).sort((x, y) => x - y);
    const rmin = rt[0];
    const umbral = Math.max(rt[Math.floor((n - 1) * 0.25)], rmin + 2);
    let sel = M.filter((s) => s.rtt <= umbral);
    const peso = (s) => 1 / (o.piso_ms * o.piso_ms + Math.pow((s.rtt - rmin) / 2, 2) / 3);
    let tref = -Infinity;
    for (const s of M) if (s.m > tref) tref = s.m;
    let f = ajustar(sel, sel.map(peso), tref, o);
    // fuera las muestras imposibles (su offset no cabe en ±rtt/2 del ajuste) y otra vez
    const buenas = sel.filter((s) => Math.abs(s.off - (f.a + f.b * (s.m - tref))) <= s.rtt / 2 + 3);
    if (buenas.length < sel.length && buenas.length >= 2) { sel = buenas; f = ajustar(sel, sel.map(peso), tref, o); }
    f.tref = tref; f.rmin = rmin; f.n = n; f.nSel = sel.length;
    f.err = Math.max(rmin / 2, 2 * Math.sqrt(f.s2 / f.W));
    this.modelo = f;
  };

  // Estimación en el instante `ahora` (mi reloj, ms; por omisión el de la última muestra).
  EstimadorReloj.prototype.estimar = function (ahora) {
    const f = this.modelo;
    if (!f) return { listo: false, offset_ms: NaN, error_ms: NaN, rtt_ms: NaN, n: 0, n_usadas: 0, deriva_ppm: null, metodo: null, saltos: this.saltos };
    const t = isFin(ahora) ? ahora : f.tref, dx = t - f.tref;
    let v = f.s2 / f.W;
    if (f.recta) v += (dx - f.xm) * (dx - f.xm) / f.Pb;
    else { const d = (dx - f.xm) * this.o.deriva_sin_modelo_ppm * 1e-6; v += d * d; }   // deriva aún sin medir
    return {
      listo: f.n >= this.o.min_muestras,
      offset_ms: f.a + f.b * dx,
      error_ms: Math.max(f.rmin / 2, 2 * Math.sqrt(v)),
      rtt_ms: f.rmin,
      n: f.n, n_usadas: f.nSel,
      deriva_ppm: f.recta ? f.b * 1e6 : null,
      metodo: f.recta ? 'recta' : 'media',
      saltos: this.saltos,
    };
  };
  // offset (otro − mío) en mi instante t; NaN sin muestras
  EstimadorReloj.prototype.offsetEn = function (t) { const f = this.modelo; return f ? f.a + f.b * (t - f.tref) : NaN; };
  EstimadorReloj.prototype.aOtro = function (tLocal) { return tLocal + this.offsetEn(tLocal); };
  EstimadorReloj.prototype.aLocal = function (tOtro) {
    const f = this.modelo;
    return f ? (tOtro - f.a + f.b * f.tref) / (1 + f.b) : NaN;
  };

  // ================================================================ SDP: recorte
  const RX_IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const TIPOS_CAND = ['host', 'srflx', 'prflx', 'relay'];
  function claseDir(dir) {
    if (RX_IPV4.test(dir)) return 'ipv4';
    if (/\.local$/i.test(dir)) return 'mdns';
    if (dir.indexOf(':') >= 0) return 'ipv6';
    return 'otra';
  }
  const RANGO_CLASE = { ipv4: 0, mdns: 1, otra: 2, ipv6: 3 };

  // a=candidate:<fundación> <componente> <transporte> <prioridad> <dirección> <puerto> typ <tipo> [raddr X rport Y] [ext val]…
  function leerCandidato(linea) {
    const p = linea.slice(12).trim().split(/\s+/);
    if (p.length < 8 || p[6] !== 'typ') return null;
    const c = { fund: p[0], comp: p[1], transp: p[2].toLowerCase(), prio: p[3], dir: p[4], puerto: p[5], tipo: p[7], raddr: null, rport: null };
    for (let i = 8; i + 1 < p.length; i += 2) {
      if (p[i] === 'raddr') c.raddr = p[i + 1]; else if (p[i] === 'rport') c.rport = p[i + 1];
    }
    if (!/^\d{1,10}$/.test(c.prio) || !/^\d{1,5}$/.test(c.puerto)) return null;
    c.clase = claseDir(c.dir);
    return c;
  }
  function lineaCandidato(k, c) {
    return `a=candidate:${k} 1 udp ${+c.prio} ${c.dir} ${+c.puerto} typ ${c.tipo}` +
      (c.raddr != null && c.rport != null ? ` raddr ${c.raddr} rport ${c.rport}` : '');
  }

  // Devuelve {sdp, lineas, candidatos: [{clase, tipo, dir, puerto}]}. Es idempotente.
  function recortarSdp(sdp, opts) {
    const max = (opts && opts.maxCandidatos) || 4;
    const lineas = String(sdp || '').split(/\r?\n/).map((l) => l.replace(/[\x00-\x1f\x7f]/g, '').trim()).filter(Boolean);
    const out = [], candidatos = [];
    let i = 0;
    while (i < lineas.length) {
      // una sección (la de sesión, o una m=) a la vez: sus candidatos van donde estaba el primero
      const fin = (() => { let j = i + 1; while (j < lineas.length && !lineas[j].startsWith('m=')) j++; return j; })();
      const cands = [];
      let lugar = -1;
      for (let j = i; j < fin; j++) {
        const l = lineas[j];
        if (/^a=(extmap-allow-mixed|msid-semantic)\b/.test(l)) continue;
        if (l.startsWith('a=candidate:')) {
          if (lugar < 0) lugar = out.length;
          const c = leerCandidato(l);
          if (c && c.comp === '1' && c.transp === 'udp' && TIPOS_CAND.indexOf(c.tipo) >= 0) cands.push(c);
          continue;
        }
        if (l.startsWith('m=')) {
          const p = l.split(' ');
          if (p.length >= 3 && p[1] !== '0') p[1] = '9';             // el puerto real va en los candidatos
          out.push(p.join(' ')); continue;
        }
        if (l.startsWith('c=IN ')) { out.push('c=IN IP4 0.0.0.0'); continue; }
        if (l.startsWith('o=')) {
          const p = l.split(' ');
          if (p.length === 6) p[1] = '1';                               // id de sesión al azar: no se usa
          out.push(p.join(' ')); continue;
        }
        out.push(l);
      }
      const hayV4 = cands.some((c) => c.clase === 'ipv4');
      const vistos = new Set();
      const elegidos = cands
        .filter((c) => !(hayV4 && c.clase === 'ipv6'))
        .sort((x, y) => (RANGO_CLASE[x.clase] - RANGO_CLASE[y.clase]) || (+y.prio - +x.prio))
        .filter((c) => { const k = c.dir + ' ' + (+c.puerto); if (vistos.has(k)) return false; vistos.add(k); return true; })
        .slice(0, Math.max(0, max - candidatos.length));
      const nuevas = elegidos.map((c) => lineaCandidato(candidatos.length + elegidos.indexOf(c) + 1, c));
      if (nuevas.length) out.splice(lugar < 0 ? out.length : lugar, 0, ...nuevas);
      elegidos.forEach((c) => candidatos.push({ clase: c.clase, tipo: c.tipo, dir: c.dir, puerto: +c.puerto }));
      i = fin;
    }
    return { sdp: out.length ? out.join('\r\n') + '\r\n' : '', lineas: out, candidatos };
  }
  function ufragDe(sdp) { const m = /a=ice-ufrag:(\S+)/.exec(sdp || ''); return m ? m[1] : null; }

  // ================================================================ códigos DT1: empaque binario
  // Renglón por renglón. Primer byte: 0x20–0x7E = texto hasta '\n'; 0x80+i = renglón fijo RENGLONES[i]; si no, una
  // de las marcas M.*. Al desempacar se reconstruye exactamente el SDP recortado (CRLF al final de cada renglón).
  const RENGLONES = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0', 'a=ice-options:trickle', 'a=setup:actpass',
    'a=setup:active', 'a=setup:passive', 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', 'a=end-of-candidates'];
  const M = { HUELLA: 0xA0, UFRAG: 0xA1, PWD: 0xA2, UFRAG64: 0xA3, PWD64: 0xA4, CAND: 0xA5, REF: 0xA6, REF64: 0xA7, TEXTO: 0xBF };
  const TE = new TextEncoder();

  const esB64 = (v) => v.length > 0 && v.length % 4 === 0 && v.length <= 340 && /^[A-Za-z0-9+/]+$/.test(v);
  function binario(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; }
  function deBinario(s) { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function aB64url(u8) { return btoa(binario(u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function deB64url(t) {
    if (!/^[A-Za-z0-9_-]*$/.test(t) || t.length % 4 === 1) throw error('danado');
    let s = t.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return deBinario(atob(s));
  }

  // IPv6 en la forma canónica (RFC 5952); solo se empaca si al volver a escribirla queda igual
  function leerIPv6(t) {
    if (!/^[0-9a-f:]+$/.test(t) || t.length < 2) return null;
    const dos = t.split('::');
    if (dos.length > 2) return null;
    const parte = (x) => (x === '' ? [] : x.split(':'));
    const a = parte(dos[0]), b = dos.length === 2 ? parte(dos[1]) : [];
    const faltan = 8 - a.length - b.length;
    if (dos.length === 1 ? a.length !== 8 : faltan < 1) return null;
    const g = a.concat(new Array(dos.length === 2 ? faltan : 0).fill('0'), b);
    if (g.length !== 8 || g.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
    const u = new Uint8Array(16);
    g.forEach((x, i) => { const v = parseInt(x, 16); u[2 * i] = v >> 8; u[2 * i + 1] = v & 255; });
    return u;
  }
  function escribirIPv6(u) {
    const g = [];
    for (let i = 0; i < 8; i++) g.push((u[2 * i] << 8) | u[2 * i + 1]);
    let mejor = -1, largo = 0;
    for (let i = 0; i < 8;) {
      if (g[i] !== 0) { i++; continue; }
      let j = i; while (j < 8 && g[j] === 0) j++;
      if (j - i > largo && j - i >= 2) { mejor = i; largo = j - i; }
      i = j;
    }
    const h = g.map((x) => x.toString(16));
    if (mejor < 0) return h.join(':');
    return h.slice(0, mejor).join(':') + '::' + h.slice(mejor + largo).join(':');
  }
  const RX_UUID = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/;
  const hex = (u) => Array.from(u, (x) => (x < 16 ? '0' : '') + x.toString(16)).join('');
  function escribirUUID(u) { const h = hex(u); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}.local`; }

  // Candidato en binario: [banderas][prioridad u32][puerto u16][dirección 4|16][raddr 4 + rport u16]. La fundación es
  // el número del candidato (como la deja recortarSdp). null si no queda idéntico (entonces va como texto).
  function candABytes(linea, k) {
    const c = leerCandidato(linea);
    if (!c || c.comp !== '1' || linea.indexOf(' udp ') < 0 || TIPOS_CAND.indexOf(c.tipo) < 0) return null;
    const prio = +c.prio, puerto = +c.puerto;
    if (prio > 0xFFFFFFFF || puerto > 65535) return null;
    let forma, dir;
    if (c.clase === 'ipv4') { forma = 0; dir = c.dir.split('.').map(Number); }
    else if (RX_UUID.test(c.dir)) { forma = 1; dir = Array.from(deHex(c.dir.slice(0, 36).replace(/-/g, ''))); }
    else if (c.clase === 'ipv6') { const u = leerIPv6(c.dir); if (!u || escribirIPv6(u) !== c.dir) return null; forma = 2; dir = Array.from(u); }
    else return null;
    let extra = [], conR = 0;
    if (c.raddr != null || c.rport != null) {
      if (c.raddr == null || c.rport == null || !RX_IPV4.test(c.raddr) || !/^\d{1,5}$/.test(c.rport) || +c.rport > 65535) return null;
      conR = 1; extra = c.raddr.split('.').map(Number).concat([+c.rport >> 8, +c.rport & 255]);
    }
    const b = [TIPOS_CAND.indexOf(c.tipo) | (forma << 2) | (conR << 4),
      (prio >>> 24) & 255, (prio >>> 16) & 255, (prio >>> 8) & 255, prio & 255, puerto >> 8, puerto & 255].concat(dir, extra);
    const vuelta = leerCandBytes(Uint8Array.from(b), 0, k);
    return vuelta && vuelta.linea === linea ? b : null;
  }
  function leerCandBytes(P, i, k) {
    if (i + 7 > P.length) return null;
    const f = P[i], tipo = TIPOS_CAND[f & 3], forma = (f >> 2) & 3, conR = (f >> 4) & 1;
    if (forma === 3 || (f >> 5)) return null;
    const prio = ((P[i + 1] << 24) >>> 0) + (P[i + 2] << 16) + (P[i + 3] << 8) + P[i + 4], puerto = (P[i + 5] << 8) | P[i + 6];
    i += 7;
    const nd = forma === 0 ? 4 : 16;
    if (i + nd + (conR ? 6 : 0) > P.length) return null;
    const d = P.subarray(i, i + nd); i += nd;
    const dir = forma === 0 ? Array.from(d).join('.') : forma === 1 ? escribirUUID(d) : escribirIPv6(d);
    const c = { prio, puerto, dir, tipo, raddr: null, rport: null };
    if (conR) { c.raddr = Array.from(P.subarray(i, i + 4)).join('.'); c.rport = (P[i + 4] << 8) | P[i + 5]; i += 6; }
    return { linea: lineaCandidato(k, c), i };
  }
  function deHex(h) { const u = new Uint8Array(h.length / 2); for (let i = 0; i < u.length; i++) u[i] = parseInt(h.substr(2 * i, 2), 16); return u; }

  function aBytes(lineas, ref) {
    const B = [];
    const texto = (s) => { for (const x of TE.encode(s)) B.push(x); B.push(10); };
    const b64 = (v) => { const u = deBinario(atob(v)); B.push(u.length); for (const x of u) B.push(x); };
    if (ref) { if (esB64(ref)) { B.push(M.REF64); b64(ref); } else { B.push(M.REF); texto(ref); } }
    let k = 0, m;
    for (const l of lineas) {
      const i = RENGLONES.indexOf(l);
      if (i >= 0) { B.push(0x80 + i); continue; }
      if ((m = /^a=fingerprint:sha-256 ((?:[0-9A-F]{2}:){31}[0-9A-F]{2})$/.exec(l))) {
        B.push(M.HUELLA); for (const h of m[1].split(':')) B.push(parseInt(h, 16));
        continue;
      }
      if (l.startsWith('a=ice-ufrag:') || l.startsWith('a=ice-pwd:')) {
        const pwd = l.startsWith('a=ice-pwd:'), v = l.slice(pwd ? 10 : 12);
        if (v && esB64(v) && btoa(atob(v)) === v) { B.push(pwd ? M.PWD64 : M.UFRAG64); b64(v); }
        else if (v && v.indexOf('\n') < 0) { B.push(pwd ? M.PWD : M.UFRAG); texto(v); }
        else texto(l);
        continue;
      }
      if (l.startsWith('a=candidate:')) {
        k++;
        const b = candABytes(l, k);
        if (b) { B.push(M.CAND); for (const x of b) B.push(x); continue; }
      }
      const c0 = l.charCodeAt(0);
      if (!(c0 >= 0x20 && c0 < 0x7f)) B.push(M.TEXTO);
      texto(l);
    }
    return Uint8Array.from(B);
  }

  const TD = typeof TextDecoder === 'function' ? new TextDecoder('utf-8', { fatal: true }) : null;
  function deBytes(P) {
    let i = 0, k = 0, ref = null;
    const L = [];
    const malo = () => error('danado');
    const leeTexto = () => { const j = P.indexOf(10, i); if (j < 0) throw malo(); const s = TD.decode(P.subarray(i, j)); i = j + 1; return s; };
    const leeB64 = () => { const n = P[i++]; if (!(n > 0) || i + n > P.length) throw malo(); const s = btoa(binario(P.subarray(i, i + n))); i += n; return s; };
    const linea = (s) => { if (s.startsWith('a=candidate:')) k++; L.push(s); };
    while (i < P.length) {
      const b = P[i];
      if (b >= 0x20 && b < 0x7f) { linea(leeTexto()); continue; }
      i++;
      if (b >= 0x80 && b < 0x80 + RENGLONES.length) { L.push(RENGLONES[b - 0x80]); continue; }
      switch (b) {
        case M.HUELLA: {
          if (i + 32 > P.length) throw malo();
          L.push('a=fingerprint:sha-256 ' + Array.from(P.subarray(i, i + 32), (x) => (x < 16 ? '0' : '') + x.toString(16).toUpperCase()).join(':'));
          i += 32; break;
        }
        case M.UFRAG: L.push('a=ice-ufrag:' + leeTexto()); break;
        case M.PWD: L.push('a=ice-pwd:' + leeTexto()); break;
        case M.UFRAG64: L.push('a=ice-ufrag:' + leeB64()); break;
        case M.PWD64: L.push('a=ice-pwd:' + leeB64()); break;
        case M.CAND: { k++; const r = leerCandBytes(P, i, k); if (!r) throw malo(); L.push(r.linea); i = r.i; break; }
        case M.REF: ref = leeTexto(); break;
        case M.REF64: ref = leeB64(); break;
        case M.TEXTO: linea(leeTexto()); break;
        default: throw malo();
      }
    }
    return { lineas: L, ref };
  }

  // ---------------------------------------------------------------- deflate-raw (CompressionStream)
  function hayDeflate(cual) {
    try { const C = cual === 'des' ? DecompressionStream : CompressionStream; new C('deflate-raw'); return true; } catch (e) { return false; }
  }
  async function pasarPor(flujo, u8, maximo) {
    const w = flujo.writable.getWriter();
    w.write(u8).catch(() => {}); w.close().catch(() => {});
    const r = flujo.readable.getReader(), partes = [];
    let n = 0;
    for (;;) {
      const { value, done } = await r.read();
      if (done) break;
      partes.push(value); n += value.length;
      if (n > maximo) { r.cancel().catch(() => {}); throw error('danado'); }
    }
    const out = new Uint8Array(n);
    let j = 0;
    for (const p of partes) { out.set(p, j); j += p.length; }
    return out;
  }

  const normTipo = (t) => (t === 'offer' || t === 'oferta' || t === 'o' ? 'o' : t === 'answer' || t === 'respuesta' || t === 'a' ? 'a' : null);

  // empacar('offer'|'answer' (o 'oferta'/'respuesta'), sdp, ref?) → Promise<"DT1o…"|"DT1a…"|"DT1O…"|"DT1A…">.
  // ref (solo respuestas): ice-ufrag de la oferta que se contesta, para avisar si leyeron un código viejo.
  async function empacar(tipo, sdp, ref) {
    const t = normTipo(tipo);
    if (!t) throw error('estado', 'Tipo de código desconocido: ' + tipo);
    const P = aBytes(recortarSdp(sdp).lineas, t === 'a' ? ref : null);
    let cuerpo = P, letra = t.toUpperCase();
    if (hayDeflate('com')) {
      try {
        const D = await pasarPor(new CompressionStream('deflate-raw'), P, 1 << 20);
        if (D.length + 8 <= P.length) { cuerpo = D; letra = t; }     // solo si de veras acorta
      } catch (e) { /* sin comprimir */ }
    }
    return 'DT' + VERSION + letra + aB64url(cuerpo);
  }

  // Revisión rápida (sin decodificar): {ok, tipo: 'oferta'|'respuesta', comprimido, codigo} o {ok: false, causa, error}
  function revisar(codigo) {
    const t = String(codigo == null ? '' : codigo).replace(/\s+/g, '');
    const mal = (causa) => ({ ok: false, causa, error: TXT[causa] });
    if (!/^DT/.test(t)) return mal('no_es');
    const m = /^DT(\d+)([A-Za-z])/.exec(t);
    if (!m) return mal('no_es');
    if (+m[1] !== VERSION) return mal('otra_version');
    const tipo = { o: 'oferta', a: 'respuesta' }[m[2].toLowerCase()];
    if (!tipo) return mal('otra_version');
    const cuerpo = t.slice(m[0].length);
    if (cuerpo.length < 40 || !/^[A-Za-z0-9_-]+$/.test(cuerpo)) return mal('danado');
    return { ok: true, tipo, comprimido: m[2] === m[2].toLowerCase(), codigo: t, cuerpo };
  }

  // desempacar(codigo) → Promise<{tipo: 'offer'|'answer', sdp, ref}>; si no sirve, Error con .causa y texto claro.
  async function desempacar(codigo) {
    const r = revisar(codigo);
    if (!r.ok) throw error(r.causa);
    let P;
    try { P = deB64url(r.cuerpo); } catch (e) { throw error('danado'); }
    if (r.comprimido) {
      if (!hayDeflate('des')) throw error('no_lee');
      try { P = await pasarPor(new DecompressionStream('deflate-raw'), P, 1 << 16); } catch (e) { throw error('danado'); }
    }
    let d;
    try { d = deBytes(P); } catch (e) { throw error('danado'); }
    const L = d.lineas, tiene = (p) => L.some((l) => l.startsWith(p));
    if (L[0] !== 'v=0' || !tiene('m=') || !tiene('a=ice-ufrag:') || !tiene('a=ice-pwd:') || !tiene('a=fingerprint:')) throw error('danado');
    return { tipo: r.tipo === 'oferta' ? 'offer' : 'answer', sdp: L.join('\r\n') + '\r\n', ref: d.ref };
  }

  function soporte() {
    const webrtc = typeof RTCPeerConnection === 'function';
    return { ok: webrtc, webrtc, deflate: hayDeflate('com') && hayDeflate('des'), motivo: webrtc ? '' : TXT.sin_webrtc };
  }

  // ================================================================ el enlace (WebRTC)
  // DragEnlace.crear({rol: 'anfitrion'|'invitado', stun?, ahora?, limite_ms?}) → E (ver la especificación en
  // archivo/ideas/race_1vs1_programa.md). ahora: reloj en ms (por omisión performance.now; para pruebas).
  // limite_ms: si no conecta en ese tiempo → 'fallo' (anfitrión 20 s desde aceptar; invitado 120 s desde responder,
  // porque incluye lo que tarda el otro en leer el código).
  function crear(opts) {
    opts = Object.assign({ rol: 'anfitrion', stun: false }, opts || {});
    if (opts.rol !== 'anfitrion' && opts.rol !== 'invitado') throw error('estado', "rol debe ser 'anfitrion' o 'invitado'");
    const ahora = typeof opts.ahora === 'function' ? opts.ahora : () => performance.now();
    const limite = isFin(opts.limite_ms) ? opts.limite_ms : (opts.rol === 'anfitrion' ? 20000 : 120000);
    const est = new EstimadorReloj(opts.estimador);
    const oyentes = { estado: [], mensaje: [], reloj: [] };
    const pendientes = new Map();
    let pc = null, ctl = null, rel = null, fase = 'nuevo', terminado = false;
    let timerPing = 0, timerLimite = 0, tRapido = -Infinity, saltosVistos = 0, ultimoDw = NaN;
    let miUfrag = null, tAceptar = NaN, tConectado = NaN;
    const codigos = { propio: null, otro: null };

    const E = {
      rol: opts.rol, estado: 'nuevo', motivo: '', causa: '', reloj: est.estimar(),
      on, off, oferta, responder, aceptar, enviar, cerrar, info, diagnostico,
      aLocal: (tOtro) => est.aLocal(tOtro),
      aOtro: (tLocal) => est.aOtro(tLocal),
      _: { get pc() { return pc; }, get ctl() { return ctl; }, get rel() { return rel; }, est },   // para pruebas
    };

    function on(ev, fn) { if (oyentes[ev] && typeof fn === 'function') oyentes[ev].push(fn); return () => off(ev, fn); }
    function off(ev, fn) { if (oyentes[ev]) oyentes[ev] = oyentes[ev].filter((f) => f !== fn); }
    function emitir(ev, ...args) {
      for (const fn of oyentes[ev].slice()) {
        try { fn(...args); } catch (e) { setTimeout(() => { throw e; }, 0); }   // un oyente que falla no rompe el enlace
      }
    }
    function ponerEstado(s, causa, texto) {
      E.causa = causa || ''; E.motivo = texto || '';
      if (E.estado === s) return;
      E.estado = s;
      emitir('estado', s, { causa: E.causa, motivo: E.motivo });
    }
    const abierto = (c) => !!c && c.readyState === 'open';

    // ---------------------------------------------------------------- conexión
    function crearPC() {
      if (typeof RTCPeerConnection !== 'function') throw error('sin_webrtc');
      pc = new RTCPeerConnection({ iceServers: opts.stun ? [{ urls: STUN }] : [] });
      ctl = pc.createDataChannel('ctl', { negotiated: true, id: 0 });
      rel = pc.createDataChannel('reloj', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
      ctl.onopen = alAbrir; rel.onopen = alAbrir;
      ctl.onclose = alCerrarCanal; rel.onclose = alCerrarCanal;
      ctl.onerror = () => {}; rel.onerror = () => {};
      ctl.onmessage = alMensaje; rel.onmessage = alPing;
      pc.oniceconnectionstatechange = alCambiarConexion;
      pc.onconnectionstatechange = alCambiarConexion;
    }
    function soltarPC() {
      const p = pc;
      if (ctl) { ctl.onopen = ctl.onclose = ctl.onmessage = ctl.onerror = null; }
      if (rel) { rel.onopen = rel.onclose = rel.onmessage = rel.onerror = null; }
      if (p) { p.oniceconnectionstatechange = p.onconnectionstatechange = null; }
      pc = ctl = rel = null;
      return p;
    }
    function pararTimers() {
      clearTimeout(timerPing); timerPing = 0;
      clearTimeout(timerLimite); timerLimite = 0;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', alVisible);
    }
    function fallar(causa) {
      if (terminado) return;
      terminado = true;
      pararTimers();
      const p = soltarPC();
      try { if (p) p.close(); } catch (e) { /* ya cerrada */ }
      ponerEstado('fallo', causa, TXT[causa]);
    }
    function candidatosUsables() { return pc && pc.localDescription ? recortarSdp(pc.localDescription.sdp).candidatos.length : 0; }

    // Espera a juntar candidatos ICE: 'complete' o 2.5 s. Si a los 2.5 s no hay ninguno usable, espera hasta 2.5 s más
    // al primero (redes lentas en aparecer).
    function juntarCandidatos() {
      return new Promise((listo) => {
        const p = pc;
        let hecho = false, extendido = false, t2 = 0;
        const fin = () => {
          if (hecho) return;
          hecho = true; clearTimeout(t1); clearTimeout(t2);
          p.removeEventListener('icegatheringstatechange', revisa); p.removeEventListener('icecandidate', alCand);
          listo();
        };
        const revisa = () => { if (p.iceGatheringState === 'complete') fin(); };
        const alCand = (e) => { if (!e.candidate || (extendido && candidatosUsables() > 0)) fin(); };
        p.addEventListener('icegatheringstatechange', revisa);
        p.addEventListener('icecandidate', alCand);
        const t1 = setTimeout(() => {
          if (pc !== p || candidatosUsables() > 0) return fin();
          extendido = true; t2 = setTimeout(fin, LIMITE_JUNTAR_MS);
        }, LIMITE_JUNTAR_MS);
        revisa();
      });
    }

    async function oferta() {
      if (E.rol !== 'anfitrion') throw error('estado', 'Solo el teléfono que crea la carrera hace la oferta.');
      if (fase !== 'nuevo' || terminado) throw error('estado', 'La oferta ya se hizo.');
      fase = 'ofertando';
      try {
        crearPC();
        await pc.setLocalDescription(await pc.createOffer());
        await juntarCandidatos();
        if (terminado || !pc) throw error('cerrado');
        const sdp = pc.localDescription.sdp, rec = recortarSdp(sdp);
        if (!rec.candidatos.length) throw error('sin_red');
        const codigo = await empacar('offer', sdp);
        if (terminado || !pc) throw error('cerrado');
        miUfrag = ufragDe(rec.sdp);
        codigos.propio = { largo: codigo.length, candidatos: rec.candidatos.map((c) => c.clase + ' ' + c.tipo) };
        fase = 'oferta';
        ponerEstado('esperando');
        return codigo;
      } catch (e) {
        if (terminado) throw error('cerrado');
        const p = soltarPC(); try { if (p) p.close(); } catch (x) { /* nada */ }
        fase = 'nuevo';                                // se puede volver a intentar
        throw e.causa ? e : error('sin_webrtc', TXT.sin_webrtc + ' (' + (e && e.message) + ')');
      }
    }

    async function responder(codigo) {
      if (E.rol !== 'invitado') throw error('estado', 'Solo el teléfono que se une contesta la oferta.');
      if (fase !== 'nuevo' || terminado) throw error('estado', 'Ya se contestó una oferta.');
      fase = 'respondiendo';
      try {
        const d = await desempacar(codigo);
        if (d.tipo !== 'offer') throw error('es_respuesta');
        if (terminado) throw error('cerrado');
        crearPC();
        try { await pc.setRemoteDescription({ type: 'offer', sdp: d.sdp }); } catch (e) { throw error('danado'); }
        await pc.setLocalDescription(await pc.createAnswer());
        await juntarCandidatos();
        if (terminado || !pc) throw error('cerrado');
        const sdp = pc.localDescription.sdp, rec = recortarSdp(sdp);
        if (!rec.candidatos.length) throw error('sin_red');
        const resp = await empacar('answer', sdp, ufragDe(d.sdp));
        if (terminado || !pc) throw error('cerrado');
        codigos.otro = { largo: revisar(codigo).codigo.length, candidatos: recortarSdp(d.sdp).candidatos.map((c) => c.clase + ' ' + c.tipo) };
        codigos.propio = { largo: resp.length, candidatos: rec.candidatos.map((c) => c.clase + ' ' + c.tipo) };
        fase = 'respuesta';
        if (E.estado === 'nuevo') ponerEstado('esperando');
        armarLimite();
        return resp;
      } catch (e) {
        if (terminado) throw error('cerrado');
        const p = soltarPC(); try { if (p) p.close(); } catch (x) { /* nada */ }
        fase = 'nuevo';                                // se puede volver a intentar
        throw e.causa ? e : error('sin_webrtc', TXT.sin_webrtc + ' (' + (e && e.message) + ')');
      }
    }

    async function aceptar(codigo) {
      if (E.rol !== 'anfitrion') throw error('estado', 'Solo el teléfono que creó la carrera acepta la respuesta.');
      if (terminado) throw error('cerrado');
      if (fase !== 'oferta') throw error('estado', fase === 'nuevo' || fase === 'ofertando' ? 'Primero hay que crear la oferta.' : 'La respuesta ya se aceptó.');
      fase = 'aceptando';
      let d;
      try {
        d = await desempacar(codigo);
        if (d.tipo !== 'answer') throw error('es_oferta');
        if (d.ref && miUfrag && d.ref !== miUfrag) throw error('otro_emparejamiento');
        if (terminado || !pc) throw error('cerrado');
        try { await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp }); } catch (e) { throw error('danado'); }
      } catch (e) {
        if (!terminado) fase = 'oferta';            // se puede volver a intentar con el código bueno
        throw e;
      }
      codigos.otro = { largo: revisar(codigo).codigo.length, candidatos: recortarSdp(d.sdp).candidatos.map((c) => c.clase + ' ' + c.tipo) };
      fase = 'aceptada';
      tAceptar = ahora();
      if (E.estado === 'esperando') ponerEstado('conectando');
      armarLimite();
    }

    function armarLimite() {
      clearTimeout(timerLimite);
      timerLimite = setTimeout(() => { if (!terminado && E.estado !== 'conectado' && E.estado !== 'desconectado') fallar('no_conecto'); }, limite);
    }

    function alAbrir() {
      if (terminado || !abierto(ctl)) return;
      clearTimeout(timerLimite); timerLimite = 0;
      if (E.estado !== 'conectado' && E.estado !== 'desconectado') {
        tConectado = ahora();
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', alVisible);
        ponerEstado('conectado');
        rapido();
      } else revisarPings();
    }
    function alCerrarCanal() { if (!terminado) fallar(E.estado === 'conectado' || E.estado === 'desconectado' ? 'se_perdio' : 'no_conecto'); }
    function alCambiarConexion() {
      if (terminado || !pc) return;
      const ice = pc.iceConnectionState, con = pc.connectionState;
      if (ice === 'failed' || con === 'failed' || ice === 'closed' || con === 'closed') {
        return fallar(E.estado === 'conectado' || E.estado === 'desconectado' ? 'se_perdio' : 'no_conecto');
      }
      if (E.estado === 'conectado' && (ice === 'disconnected' || con === 'disconnected')) return ponerEstado('desconectado', 'sin_senal', TXT.sin_senal);
      if (E.estado === 'desconectado' && (ice === 'connected' || ice === 'completed') && con !== 'disconnected' && abierto(ctl)) {
        ponerEstado('conectado');
        rapido();
      }
    }
    function alVisible() { if (document.visibilityState === 'visible' && E.estado === 'conectado') rapido(); }

    // ---------------------------------------------------------------- mensajes
    function enviar(obj) {
      if (terminado || !abierto(ctl)) return false;
      let s;
      try { s = JSON.stringify({ m: obj }); } catch (e) { return false; }
      try { ctl.send(s); return true; } catch (e) { return false; }
    }
    function alMensaje(ev) {
      if (terminado || typeof ev.data !== 'string') return;
      let o;
      try { o = JSON.parse(ev.data); } catch (e) { return; }          // lo que no es JSON se ignora
      if (!o || typeof o !== 'object' || Array.isArray(o)) return;
      if (o._ === 'adios') return fallar('otro_cerro');
      if (Object.prototype.hasOwnProperty.call(o, 'm')) emitir('mensaje', o.m);
    }

    // ---------------------------------------------------------------- pings del reloj
    const redondear = (t) => Math.round(t * 1000) / 1000;
    function mandarReloj(s) { try { if (abierto(rel) && rel.bufferedAmount < 4096) { rel.send(s); return true; } } catch (e) { /* canal ocupado */ } return false; }
    function rapido() { tRapido = ahora(); clearTimeout(timerPing); timerPing = 0; revisarPings(); }
    function revisarPings() { if (!timerPing && !terminado) tickPing(); }
    function tickPing() {
      timerPing = 0;
      if (terminado || E.estado !== 'conectado' || !abierto(rel)) return;
      const t = ahora();
      // ¿se detuvo mi reloj? (el teléfono se durmió): Date.now() siguió y performance.now() no
      const dw = Date.now() - t;
      if (isFin(ultimoDw) && Math.abs(dw - ultimoDw) > 100) { est.reiniciar(); tRapido = t; actualizarReloj(t, true); }
      ultimoDw = dw;
      const t1 = redondear(t);
      if (mandarReloj(JSON.stringify({ p: t1 }))) pendientes.set(t1, 1);
      for (const k of pendientes.keys()) if (t - k > 3000) pendientes.delete(k);
      timerPing = setTimeout(tickPing, t - tRapido < 2000 ? 50 : 250);
    }
    function alPing(ev) {
      const t = ahora();
      if (terminado || typeof ev.data !== 'string' || ev.data.length > 200) return;
      let o;
      try { o = JSON.parse(ev.data); } catch (e) { return; }
      if (!o || typeof o !== 'object') return;
      if (isFin(o.p)) { mandarReloj(JSON.stringify({ q: o.p, r: redondear(t) })); return; }   // contesta en seguida
      if (isFin(o.q) && isFin(o.r) && pendientes.has(o.q)) {
        pendientes.delete(o.q);
        if (est.agregar(o.q, o.r, t)) actualizarReloj(t);
      }
    }
    let relojAvisado = null;   // el último que se avisó: los cambios chicos se juntan hasta pasar de 0.01 ms
    function actualizarReloj(t, forzar) {
      const a = relojAvisado, r = est.estimar(t);
      E.reloj = r;
      if (est.saltos !== saltosVistos) { saltosVistos = est.saltos; tRapido = t; }
      const dif = (x, y) => (isFin(x) && isFin(y) ? Math.abs(x - y) >= 0.01 : isFin(x) !== isFin(y));
      if (forzar || !a || r.listo !== a.listo || dif(r.offset_ms, a.offset_ms) || dif(r.error_ms, a.error_ms) || dif(r.rtt_ms, a.rtt_ms)) { relojAvisado = r; emitir('reloj', r); }
    }

    // ---------------------------------------------------------------- cerrar e información
    function cerrar() {
      if (E.estado === 'cerrado') return;
      const yaFallo = terminado;
      terminado = true;
      pararTimers();
      try { if (abierto(ctl)) ctl.send(JSON.stringify({ _: 'adios' })); } catch (e) { /* nada */ }
      const p = soltarPC();
      if (p) setTimeout(() => { try { p.close(); } catch (e) { /* nada */ } }, 300);   // que alcance a salir el adiós
      if (yaFallo) { E.estado = 'cerrado'; emitir('estado', 'cerrado', { causa: 'cerrado', motivo: TXT.cerrado }); return; }
      ponerEstado('cerrado', 'cerrado', TXT.cerrado);
    }
    function info() {
      return {
        rol: E.rol, estado: E.estado, causa: E.causa, motivo: E.motivo,
        codigoPropio: codigos.propio, codigoOtro: codigos.otro,
        conectar_ms: isFin(tAceptar) && isFin(tConectado) ? tConectado - tAceptar : NaN,
        reloj: E.reloj,
      };
    }
    // Par de candidatos que quedó (getStats): por qué red se conectaron y la ida y vuelta de la conexión.
    async function diagnostico() {
      if (!pc) return { par: null };
      const st = await pc.getStats(), porId = new Map();
      let par = null;
      st.forEach((r) => porId.set(r.id, r));
      st.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) par = porId.get(r.selectedCandidatePairId) || par; });
      if (!par) st.forEach((r) => { if (!par && r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) par = r; });
      if (!par) return { par: null };
      const cand = (c) => (c ? { tipo: c.candidateType, dir: c.address || c.ip, puerto: c.port, protocolo: c.protocol, red: c.networkType } : null);
      return { par: { local: cand(porId.get(par.localCandidateId)), remoto: cand(porId.get(par.remoteCandidateId)),
        rtt_ms: isFin(par.currentRoundTripTime) ? par.currentRoundTripTime * 1000 : NaN } };
    }

    return E;
  }

  const api = { VERSION, crear, EstimadorReloj, empacar, desempacar, revisar, recortarSdp, soporte, TXT,
    _: { aBytes, deBytes, aB64url, deB64url, leerIPv6, escribirIPv6 } };   // _: para pruebas
  root.DragEnlace = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
