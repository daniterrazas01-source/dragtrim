// enlace_test.js — Prueba en Node de enlace.js (DragEnlace): el estimador del reloj entre los dos teléfonos con relojes
// simulados y los códigos DT1 (recorte del SDP, empaque, desempaque, errores).
// Uso: node enlace_test.js [--rapido]
'use strict';
const zlib = require('zlib');
const D = require(__dirname + '/../app/src/enlace.js');

const RAPIDO = process.argv.includes('--rapido');
const fallas = [];
function ok(c, msg) { if (!c) fallas.push(msg); console.log((c ? 'ok    ' : 'FALLA ') + msg); }
function rng(seed) {   // mulberry32
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pct = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * (b.length - 1) + 0.5))]; };
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : String(x));

// ================================================================ 1. EstimadorReloj con relojes simulados
// Simulación por eventos de lo que hace el enlace: el teléfono A manda pings (20/s los primeros 2 s y luego 4/s, o
// siempre 20/s), B contesta al recibir con su hora t2, A anota t4. Relojes: cA(T) = A0 + T·(1 + ppmA), cB(T) = B0 +
// T·(1 + ppmB) (+ salto). Retrasos de cada tramo: base + extra al azar; picos de +200 ms; pérdidas en cada tramo.
// Error = offset estimado en t4 − (cB(T4) − cA(T4)).
function extraDe(dist, R) {
  if (dist === 'parejo') return R() * 19;                                     // ida y vuelta 2–40 ms parejo
  if (dist === 'exp') return Math.min(38, -Math.log(1 - R()) * 4);
  return R() < 0.7 ? -Math.log(1 - R()) * 3 : R() * 19;                      // mezcla
}
function simular(o) {
  const R = rng(o.seed);
  const off0 = o.off != null ? o.off : (R() * 2 - 1) * 5000;
  const ppmA = (R() * 2 - 1) * 20, ppmB = ppmA + (o.ppm != null ? o.ppm : (R() * 2 - 1) * 50);
  const A0 = 2e5 + R() * 1e6, B0 = A0 + off0;
  const salto = (T) => (o.saltoEn != null && T >= o.saltoEn ? o.salto_ms : 0);
  const cA = (T) => A0 + T * (1 + ppmA * 1e-6);
  const cB = (T) => B0 + salto(T) + T * (1 + ppmB * 1e-6);
  const q = o.cuant ? (t) => Math.floor(t / o.cuant) * o.cuant : (t) => t;
  const est = new D.EstimadorReloj();
  const ev = [{ T: 0, k: 'ping' }];
  const meter = (e) => { let i = ev.length; while (i > 0 && ev[i - 1].T > e.T) i--; ev.splice(i, 0, e); };
  let tRapido = 0, saltos = 0;
  const muestras = [];
  while (ev.length) {
    const e = ev.shift();
    if (e.T > o.dur_ms) break;
    if (e.k === 'ping') {
      const t1 = q(cA(e.T));
      if (!(R() < o.perdida)) {
        let d1 = o.base1 + extraDe(o.dist, R); if (R() < o.pico) d1 += 200;
        const T2 = e.T + d1, t2 = q(cB(T2));
        if (!(R() < o.perdida)) {
          let d2 = o.base2 + extraDe(o.dist, R); if (R() < o.pico) d2 += 200;
          meter({ T: T2 + d2, k: 'pong', t1, t2 });
        }
      }
      const intervalo = o.siempreRapido || e.T - tRapido < 2000 ? 50 : 250;
      meter({ T: e.T + intervalo + (R() - 0.5) * 6, k: 'ping' });
    } else {
      const t4 = q(cA(e.T));
      est.agregar(e.t1, e.t2, t4);
      if (est.saltos !== saltos) { saltos = est.saltos; tRapido = e.T; }       // el enlace vuelve a 20/s
      const r = est.estimar(t4);
      const verdad = cB(e.T) - cA(e.T);
      muestras.push({ T: e.T, err: r.offset_ms - verdad, error_ms: r.error_ms, listo: r.listo, r, verdad, t4 });
    }
  }
  return { est, muestras, cA, cB, A0, B0, ppmA, ppmB };
}
const base = { perdida: 0.10, pico: 0.05, base1: 1, base2: 1 };
const DISTS = ['parejo', 'exp', 'mezcla'];
const NSEM = RAPIDO ? 60 : 300;

console.log('--- reloj: 3 s de pings a 20/s, retraso mínimo simétrico (offset ±5 s, deriva ±50 ppm, 2–40 ms, picos de 200 ms, 10 % de pérdidas por tramo)');
for (const cuant of [0, 1]) {
  for (const dist of DISTS) {
    const errs = [], cubre = [], listos = [], ns = [];
    for (let s = 1; s <= NSEM; s++) {
      const r = simular(Object.assign({}, base, { seed: s * 7 + (cuant ? 1000 : 0), dist, dur_ms: 3000, siempreRapido: true, cuant }));
      const u = r.muestras[r.muestras.length - 1];
      errs.push(Math.abs(u.err)); cubre.push(Math.abs(u.err) <= u.error_ms ? 1 : 0); listos.push(u.listo ? 1 : 0); ns.push(u.r.n);
    }
    const mx = Math.max(...errs), cob = cubre.reduce((a, b) => a + b) / cubre.length;
    ok(mx < 3 && listos.every(Boolean), `${dist}${cuant ? ', reloj de 1 ms (Safari)' : ''}: error p50 ${f2(pct(errs, 0.5))} p95 ${f2(pct(errs, 0.95))} máx ${f2(mx)} ms (< 3), ` +
      `muestras ${pct(ns, 0.5)}, error_ms lo cubre ${(cob * 100).toFixed(0)} %`);
    ok(cob >= 0.9, `${dist}${cuant ? ' 1 ms' : ''}: error_ms ≥ error real en ≥ 90 % de los casos (${(cob * 100).toFixed(1)} %)`);
  }
}

console.log('--- reloj: retraso asimétrico (ida 3 ms, vuelta 8 ms de base)');
for (const dist of DISTS) {
  const errs = [], cubre = [];
  for (let s = 1; s <= NSEM; s++) {
    const r = simular(Object.assign({}, base, { seed: s * 13, dist, dur_ms: 3000, siempreRapido: true, base1: 3, base2: 8 }));
    const u = r.muestras[r.muestras.length - 1];
    errs.push(u.err); cubre.push(Math.abs(u.err) <= u.error_ms ? 1 : 0);
  }
  // el sesgo es la asimetría/2 (−2.5 ms: la ida es más corta); alrededor de él, el mismo ruido que con retraso simétrico
  const media = errs.reduce((a, b) => a + b) / errs.length, peor = Math.max(...errs.map(Math.abs));
  const ruido = Math.max(...errs.map((e) => Math.abs(e + 2.5))), cob = cubre.reduce((a, b) => a + b) / cubre.length;
  ok(Math.abs(media + 2.5) < 0.25 && ruido < 3 && cob >= 0.95, `${dist}: error medio ${f2(media)} ms (asimetría/2 = −2.50), peor ${f2(peor)} ms ` +
    `(= 2.5 + ruido ≤ ${f2(ruido)}); error_ms (≈ rtt mínima/2) lo cubre ${(cob * 100).toFixed(0)} %`);
}

console.log('--- reloj: seguir la deriva 5 min (2 s a 20/s y luego 4/s)');
{
  const NS = RAPIDO ? 6 : 24;
  for (const dist of ['parejo', 'mezcla']) {
    let peor = 0, peorListo = 0, deriva = [];
    for (let s = 1; s <= NS; s++) {
      const ppm = s % 3 === 0 ? 50 : s % 3 === 1 ? -50 : (rng(s)() * 2 - 1) * 50;
      const r = simular(Object.assign({}, base, { seed: 500 + s, dist, dur_ms: 300000, ppm }));
      for (const m of r.muestras) if (m.T >= 3000) peor = Math.max(peor, Math.abs(m.err));
      const u = r.muestras[r.muestras.length - 1];
      if (u.r.deriva_ppm != null) deriva.push(Math.abs(u.r.deriva_ppm - (r.ppmB - r.ppmA) / (1 + r.ppmA * 1e-6)));
      peorListo = Math.max(peorListo, r.muestras.find((m) => m.listo).T);
    }
    ok(peor < 3, `${dist}: ${NS} relojes con ±50 ppm, peor error de los 3 s a los 5 min ${f2(peor)} ms (< 3); listo a los ${peorListo.toFixed(0)} ms; ` +
      `deriva medida ±${f2(Math.max(...deriva))} ppm de la verdadera`);
  }
}

console.log('--- reloj: saltos (un teléfono se durmió) y muestras raras');
{
  for (const salto of [350, -350, -4000]) {
    const r = simular(Object.assign({}, base, { seed: 77, dist: 'mezcla', dur_ms: 70000, saltoEn: 60000, salto_ms: salto }));
    const desp = r.muestras.filter((m) => m.T >= 63000);
    const peor = Math.max(...desp.map((m) => Math.abs(m.err)));
    const detect = r.muestras.find((m) => m.T >= 60000 && m.r.saltos > 0);
    ok(r.est.saltos === 1 && detect && detect.T - 60000 < 2000 && peor < 3,
      `salto de ${salto} ms a los 60 s: detectado a los ${detect ? (detect.T - 60000).toFixed(0) : '—'} ms, error desde 3 s después ≤ ${f2(peor)} ms`);
  }
  // una muestra imposible (rtt 2 ms pero offset 80 ms fuera) no mueve la estimación
  const r = simular(Object.assign({}, base, { seed: 5, dist: 'mezcla', dur_ms: 20000 }));
  const est = r.est, u = r.muestras[r.muestras.length - 1], antes = est.estimar(u.t4).offset_ms;
  est.agregar(u.t4 + 100, antes + 80 + u.t4 + 101, u.t4 + 102);
  const despues = est.estimar(u.t4 + 102).offset_ms;
  ok(Math.abs(despues - antes) < 0.5 && est.saltos === 0, `una muestra rara sola no cambia nada (${f2(despues - antes)} ms, saltos ${est.saltos})`);
  // conversiones
  const t = u.t4 + 1234.5, tO = est.aOtro(t);
  ok(Math.abs(est.aLocal(tO) - t) < 1e-6 && Math.abs(tO - t - est.offsetEn(t)) < 1e-9, 'aLocal(aOtro(t)) = t');
  ok(Math.abs((r.cB(u.T + 1234.5) - r.cA(u.T + 1234.5)) - est.offsetEn(r.cA(u.T + 1234.5))) < 3, 'aOtro da la hora del otro (< 3 ms)');
  // sin muestras nuevas: el error estimado crece con el tiempo
  const e0 = est.estimar(u.t4).error_ms, e1 = est.estimar(u.t4 + 600000).error_ms;
  ok(e1 > e0, `sin pings el error crece: ${f2(e0)} → ${f2(e1)} ms a los 10 min`);
  const v = new D.EstimadorReloj();
  ok(!v.estimar().listo && Number.isNaN(v.estimar().offset_ms) && Number.isNaN(v.aLocal(5)), 'sin muestras: listo=false y NaN');
  ok(!v.agregar(10, 5, 9) && !v.agregar(NaN, 1, 2) && !v.agregar(0, 1, 5000), 'rechaza rtt negativo, NaN y rtt > 3 s');
  for (let i = 0; i < 7; i++) v.agregar(i * 50, 1000 + i * 50 + 1, i * 50 + 2);
  ok(!v.estimar().listo, '7 muestras: aún no está listo');
  v.agregar(400, 1401, 402);
  const e = v.estimar();
  ok(e.listo && Math.abs(e.offset_ms - 1000) < 1e-9 && e.n === 8 && e.metodo === 'media', `8 muestras: listo, offset ${e.offset_ms}`);
}

// ================================================================ 2. códigos DT1
const HUELLA = (seed) => { const R = rng(seed); return Array.from({ length: 32 }, () => Math.floor(R() * 256).toString(16).toUpperCase().padStart(2, '0')).join(':'); };
const SDP = {
  // de Chromium 141 en este contenedor (captura con y sin permiso de cámara)
  chrome_oferta: `v=0\r\no=- 8043554915894868343 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS\r\nm=application 53999 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 192.0.2.2\r\na=candidate:4176924407 1 udp 2122260223 192.0.2.2 53999 typ host generation 0 network-id 1\r\na=candidate:106699363 1 tcp 1518280447 192.0.2.2 9 typ host tcptype active generation 0 network-id 1\r\na=ice-ufrag:3nen\r\na=ice-pwd:zqG9s+JhaCnxey94wK+gjVXr\r\na=ice-options:trickle\r\na=fingerprint:sha-256 E6:60:58:4F:A6:88:6F:89:B8:89:A7:F4:DC:B5:35:80:A7:BF:21:07:FF:26:68:0E:D9:EF:06:E8:12:15:4D:AA\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n`,
  chrome_respuesta: `v=0\r\no=- 2806758221440129609 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS\r\nm=application 36815 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 192.0.2.2\r\na=candidate:2862606942 1 udp 2122260223 192.0.2.2 36815 typ host generation 0 network-id 1\r\na=ice-ufrag:8IFH\r\na=ice-pwd:Me0QqBujHhSYzaOh/VCn7iIs\r\na=ice-options:trickle\r\na=fingerprint:sha-256 EC:1A:99:C0:F1:9C:25:C8:BE:B0:66:55:9E:ED:BE:38:48:69:6D:82:F3:B3:B8:CA:B9:F8:72:2B:A4:B3:7F:5A\r\na=setup:active\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n`,
  chrome_sin_camara: `v=0\r\no=- 2931755904061136235 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=extmap-allow-mixed\r\na=msid-semantic: WMS\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=candidate:2696914986 1 udp 2113937151 74832ebb-15e2-4808-9f96-32e8c6f81c4b.local 34093 typ host generation 0 network-cost 999\r\na=ice-ufrag:0kRy\r\na=ice-pwd:pQzYh9Rc9Bpu8L2PZ3f2hN8s\r\na=ice-options:trickle\r\na=fingerprint:sha-256 D6:B0:A9:54:00:4C:2A:86:E5:25:CD:FE:FB:EF:D8:6B:F1:F4:86:16:C6:9A:52:09:8D:0B:ED:68:D0:BA:08:BF\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n`,
  // tipo Safari (iPhone conectado al punto de acceso de otro, con permiso de cámara): Wi-Fi, celular, IPv6 y TCP
  safari_hotspot: [
    'v=0', 'o=- 6542137628143958911 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=extmap-allow-mixed', 'a=msid-semantic: WMS',
    'm=application 64398 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 172.20.10.2',
    'a=candidate:2242934535 1 udp 2122194687 10.122.33.7 54220 typ host generation 0 network-id 2 network-cost 900',
    'a=candidate:842163049 1 udp 2122260223 172.20.10.2 64398 typ host generation 0 network-id 1 network-cost 10',
    'a=candidate:1657307637 1 udp 2122136831 2806:2f0:9241:4aa1:1c9e:4bd5:5f2a:a3a9 52131 typ host generation 0 network-id 3 network-cost 900',
    'a=candidate:3420485399 1 udp 2122063615 fe80::1c9e:4bd5:5f2a:a3a9 61522 typ host generation 0 network-id 4 network-cost 50',
    'a=candidate:4176924407 1 tcp 1518280447 172.20.10.2 9 typ host tcptype active generation 0 network-id 1 network-cost 10',
    'a=candidate:3138470297 1 tcp 1518214911 10.122.33.7 9 typ host tcptype active generation 0 network-id 2 network-cost 900',
    'a=ice-ufrag:Vh9Z', 'a=ice-pwd:3XXpZ7LxPIkSIRbN3bSCPmYe', 'a=ice-options:trickle', 'a=fingerprint:sha-256 ' + HUELLA(1),
    'a=setup:actpass', 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', ''].join('\r\n'),
  // tipo Safari sin permiso de cámara: nombres .local (uno de IPv4 y uno de IPv6) y TCP
  safari_mdns: [
    'v=0', 'o=- 1188273645590012 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=extmap-allow-mixed', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    'a=candidate:3561203411 1 udp 2113937151 1f3a7c8e-5b2d-4e9f-a1c3-7d8e9f0a1b2c.local 61234 typ host generation 0 network-cost 999',
    'a=candidate:3561203412 1 udp 2113939711 9d8e7f6a-5b4c-4d3e-8f2a-1b0c9d8e7f6a.local 61235 typ host generation 0 network-cost 999',
    'a=candidate:1217416299 1 tcp 1518157055 1f3a7c8e-5b2d-4e9f-a1c3-7d8e9f0a1b2c.local 9 typ host tcptype active generation 0 network-cost 999',
    'a=ice-ufrag:Qw3e', 'a=ice-pwd:Rt5yUi8oPa1sDf4gHj7kLz0x', 'a=ice-options:trickle', 'a=fingerprint:sha-256 ' + HUELLA(2),
    'a=setup:active', 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', ''].join('\r\n'),
  // red solo IPv6 (sin IPv4): quedan los IPv6
  safari_ipv6: [
    'v=0', 'o=- 99 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    'a=candidate:1 1 udp 2122129151 fe80::18c4:2bff:fe11:9a01 50001 typ host generation 0 network-id 2',
    'a=candidate:2 1 udp 2122197247 2806:2f0:9241::5 50000 typ host generation 0 network-id 1',
    'a=candidate:3 1 tcp 1518149375 2806:2f0:9241::5 9 typ host tcptype active generation 0',
    'a=ice-ufrag:Zx9c', 'a=ice-pwd:Vb6nMq2wEr5tYu8iOp1aSd4f', 'a=fingerprint:sha-256 ' + HUELLA(3),
    'a=setup:actpass', 'a=mid:0', 'a=sctp-port:5000', ''].join('\r\n'),
  // con STUN (srflx con raddr/rport) y más de 4 candidatos
  stun_muchos: [
    'v=0', 'o=- 5 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=extmap-allow-mixed', 'a=msid-semantic: WMS',
    'm=application 50010 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 192.168.43.20',
    'a=candidate:11 1 udp 2122260223 192.168.43.20 50010 typ host generation 0 network-id 1 network-cost 10',
    'a=candidate:12 1 udp 2122194687 10.0.0.9 50011 typ host generation 0 network-id 2 network-cost 900',
    'a=candidate:13 1 udp 2122129151 172.16.5.4 50012 typ host generation 0 network-id 3',
    'a=candidate:14 1 udp 2122063615 192.168.1.77 50013 typ host generation 0 network-id 4',
    'a=candidate:15 1 udp 1686052607 201.141.22.9 50010 typ srflx raddr 192.168.43.20 rport 50010 generation 0 ufrag Ab12 network-id 1 network-cost 10',
    'a=candidate:16 1 udp 2121998079 10.10.10.10 50014 typ host generation 0 network-id 5',
    'a=candidate:17 2 udp 2122260222 192.168.43.20 50015 typ host generation 0',
    'a=candidate:18 1 udp 2122260223 192.168.43.20 50010 typ host generation 0 network-id 1',
    'a=ice-ufrag:Ab12', 'a=ice-pwd:Cd34Ef56Gh78Ij90Kl12Mn34', 'a=ice-options:trickle', 'a=fingerprint:sha-256 ' + HUELLA(4),
    'a=setup:actpass', 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', ''].join('\r\n'),
  // cosas raras: deben llegar idénticas (como texto) al otro lado
  raro: [
    'v=0', 'o=- 7 3 IN IP4 127.0.0.1', 's=Drag Tree ñ', 't=0 0', 'a=group:BUNDLE 0', 'a=ice-lite', 'a=extmap-allow-mixed',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP6 ::', 'b=AS:30',
    'a=candidate:1 1 UDP 2122260223 192.168.0.5 40000 typ host generation 0',
    'a=candidate:2 1 udp 2122194687 2001:DB8::1 40001 typ host',
    'a=candidate:3 1 udp 2122129151 ::ffff:192.168.0.6 40002 typ host',
    'a=candidate:4 1 udp 1686052607 200.1.2.3 40003 typ srflx raddr ::1 rport 40000',
    'a=candidate:5 1 udp 2122063615 mi-telefono.lan 40004 typ host',
    'a=ice-ufrag:ab+/c', 'a=ice-pwd:corta', 'a=ice-options:trickle renomination', 'a=fingerprint:sha-256 ' + HUELLA(5).toLowerCase(),
    'a=setup:passive', 'a=mid:dc', 'a=sctp-port:5001', 'a=sctpmap:5000 webrtc-datachannel 1024', 'a=x-dragtree:hola mundo',
    'a=end-of-candidates', ''].join('\n'),
};
const ESPERADO = {
  chrome_oferta: ['192.0.2.2:53999'], chrome_respuesta: ['192.0.2.2:36815'], chrome_sin_camara: ['74832ebb-15e2-4808-9f96-32e8c6f81c4b.local:34093'],
  safari_hotspot: ['172.20.10.2:64398', '10.122.33.7:54220'],
  safari_mdns: ['9d8e7f6a-5b4c-4d3e-8f2a-1b0c9d8e7f6a.local:61235', '1f3a7c8e-5b2d-4e9f-a1c3-7d8e9f0a1b2c.local:61234'],
  safari_ipv6: ['2806:2f0:9241::5:50000', 'fe80::18c4:2bff:fe11:9a01:50001'],
  stun_muchos: ['192.168.43.20:50010', '10.0.0.9:50011', '172.16.5.4:50012', '192.168.1.77:50013'],
  raro: ['192.168.0.5:40000', '200.1.2.3:40003', 'mi-telefono.lan:40004'],
};
// capacidad en bytes de un QR en modo byte con corrección M (versiones 1–25)
const CAP_M = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666, 711, 779, 857, 911, 997];
const versionQR = (n) => CAP_M.findIndex((c) => c >= n) + 1 || '>25';

async function deflate(u8) { return new Uint8Array(zlib.deflateRawSync(Buffer.from(u8), { level: 9 })); }

(async () => {
  console.log('--- códigos: recorte, ida y vuelta y largo');
  console.log('  SDP                 tipo  original recortado  recortado+deflate  código  QR(M)');
  for (const [nombre, sdp] of Object.entries(SDP)) {
    const tipo = /setup:(active|passive)/.test(sdp) ? 'answer' : 'offer';
    const rec = D.recortarSdp(sdp);
    const cod = await D.empacar(tipo, sdp, tipo === 'answer' ? '3nen' : undefined);
    const d = await D.desempacar(cod);
    const simple = 'DT1o' + Buffer.from(await deflate(new TextEncoder().encode(rec.sdp))).toString('base64url');
    console.log(`  ${nombre.padEnd(19)} ${tipo === 'offer' ? 'o' : 'a'}     ${String(sdp.length).padStart(5)}    ${String(rec.sdp.length).padStart(5)}        ${String(simple.length).padStart(5)}          ${String(cod.length).padStart(4)}    v${versionQR(cod.length)}`);
    ok(d.sdp === rec.sdp && d.tipo === tipo && (tipo === 'offer' ? d.ref === null : d.ref === '3nen'), `${nombre}: ida y vuelta exacta del SDP recortado (${d.tipo}${d.ref ? ', ref ' + d.ref : ''})`);
    ok(D.recortarSdp(rec.sdp).sdp === rec.sdp, `${nombre}: el recorte es idempotente`);
    const L = rec.lineas, cands = L.filter((l) => l.startsWith('a=candidate:'));
    const dirs = rec.candidatos.map((c) => c.dir + ':' + c.puerto);
    ok(JSON.stringify(dirs) === JSON.stringify(ESPERADO[nombre]), `${nombre}: candidatos ${JSON.stringify(dirs)}`);
    ok(cands.length <= 4 && cands.every((l) => / udp /i.test(l) && /^a=candidate:\d+ 1 /.test(l)) && !L.some((l) => /^a=(extmap-allow-mixed|msid-semantic)/.test(l)),
      `${nombre}: solo UDP del componente 1, ≤ 4, sin extmap-allow-mixed ni msid-semantic`);
    const cls = rec.candidatos.map((c) => c.clase);
    ok(!(cls.includes('ipv4') && cls.includes('ipv6')) && cls.join() === cls.slice().sort((x, y) => ['ipv4', 'mdns', 'otra', 'ipv6'].indexOf(x) - ['ipv4', 'mdns', 'otra', 'ipv6'].indexOf(y)).join(),
      `${nombre}: IPv4 primero y sin IPv6 si hay IPv4 (${cls.join(', ')})`);
    ok(/^m=application (9|0) /.test(L.find((l) => l.startsWith('m='))) && L.filter((l) => l.startsWith('c=')).every((l) => l === 'c=IN IP4 0.0.0.0'), `${nombre}: m= con puerto 9 y c=IN IP4 0.0.0.0`);
    for (const k of ['a=ice-ufrag:', 'a=ice-pwd:', 'a=fingerprint:', 'a=setup:', 'a=mid:', 'a=sctp-port:']) {
      const a = sdp.split(/\r?\n/).find((l) => l.startsWith(k)), b = L.find((l) => l.startsWith(k));
      if (!a || a !== b) { ok(false, `${nombre}: se conserva ${k}`); }
    }
  }
  // las cosas raras se conservan tal cual
  {
    const L = D.recortarSdp(SDP.raro).lineas;
    for (const k of ['a=ice-lite', 's=Drag Tree ñ', 'b=AS:30', 'a=ice-options:trickle renomination', 'a=sctpmap:5000 webrtc-datachannel 1024', 'a=x-dragtree:hola mundo', 'a=end-of-candidates', 'a=mid:dc', 'o=- 1 3 IN IP4 127.0.0.1'])
      ok(L.includes(k), `raro: conserva "${k}"`);
    ok(L.includes('a=candidate:1 1 udp 2122260223 192.168.0.5 40000 typ host'), 'raro: "UDP" en mayúsculas cuenta como UDP');
  }

  console.log('--- códigos: errores claros');
  const of = await D.empacar('offer', SDP.chrome_oferta), re = await D.empacar('answer', SDP.chrome_respuesta, '3nen');
  const errDe = async (c) => { try { await D.desempacar(c); return null; } catch (e) { return e; } };
  const casos = [
    ['hola', 'no_es', 'no es de Drag Tree'], ['', 'no_es', 'no es de Drag Tree'], ['https://ejemplo.com/DT1o', 'no_es', 'no es de Drag Tree'],
    ['DT2o' + of.slice(4), 'otra_version', 'otra versión'], ['DT1x' + of.slice(4), 'otra_version', 'otra versión'],
    ['DT1oabc', 'danado', 'dañado'], [of.slice(0, 60), 'danado', 'dañado'], [of.slice(0, of.length - 9), 'danado', 'dañado'],
    ['DT1O' + 'A'.repeat(120), 'danado', 'dañado'], ['DT1o' + 'A'.repeat(120), 'danado', 'dañado'], [of.slice(0, 30) + '*' + of.slice(31), 'danado', 'dañado'],
  ];
  for (const [c, causa, txt] of casos) {
    const e = await errDe(c);
    ok(e && e.causa === causa && e.message.includes(txt), `"${c.slice(0, 18)}${c.length > 18 ? '…' : ''}" → ${e ? e.causa + ': ' + e.message : 'sin error'}`);
  }
  ok(D.revisar(' ' + of.slice(0, 40) + '\n' + of.slice(40) + ' ').ok, 'acepta el código con espacios o saltos de renglón (copiar y pegar)');
  ok(D.revisar(of).tipo === 'oferta' && D.revisar(re).tipo === 'respuesta', `revisar: tipos (${of.slice(0, 4)} / ${re.slice(0, 4)})`);
  ok(D.TXT.es_respuesta.startsWith('Ese código es una respuesta; aquí se necesita el del otro teléfono'), 'mensaje para una respuesta donde va la oferta');

  console.log('--- códigos: compresión y sin CompressionStream');
  {
    const largo = SDP.chrome_oferta.replace('a=mid:0', 'a=mid:0\r\n' + Array.from({ length: 12 }, (_, i) => `a=x-dragtree-${i}:esto se repite mucho, esto se repite mucho`).join('\r\n'));
    const c = await D.empacar('offer', largo), d = await D.desempacar(c);
    ok(c.startsWith('DT1o') && d.sdp === D.recortarSdp(largo).sdp, `si deflate acorta, va comprimido (${c.slice(0, 4)}, ${c.length} car.) y regresa igual`);
    const P = D._.aBytes(D.recortarSdp(SDP.safari_hotspot).lineas, null);
    const c2 = 'DT1o' + D._.aB64url(await deflate(P)), d2 = await D.desempacar(c2);
    ok(d2.sdp === D.recortarSdp(SDP.safari_hotspot).sdp, 'un código comprimido con zlib de Node se lee igual');
    const CS = globalThis.CompressionStream, DS = globalThis.DecompressionStream;
    delete globalThis.CompressionStream; delete globalThis.DecompressionStream;
    const c3 = await D.empacar('offer', largo), d3 = await D.desempacar(c3);
    const e3 = await errDe(c);
    globalThis.CompressionStream = CS; globalThis.DecompressionStream = DS;
    ok(c3.startsWith('DT1O') && d3.sdp === D.recortarSdp(largo).sdp, `sin CompressionStream: "DT1O" sin comprimir (${c3.length} car.) y regresa igual`);
    ok(e3 && e3.causa === 'no_lee', `sin DecompressionStream un código comprimido da: ${e3 && e3.message}`);
  }

  console.log('--- códigos: SDP al azar (ida y vuelta exacta)');
  {
    const N = RAPIDO ? 300 : 2000;
    let malos = 0, maxLargo = 0, primero = '';
    const R = rng(4242), elige = (a) => a[Math.floor(R() * a.length)], hexn = (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(R() * 16)]).join('');
    const ice = (n) => Array.from({ length: n }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'[Math.floor(R() * 64)]).join('');
    const dirAzar = () => elige([
      () => [10, 172, 192, 100].map((x, i) => (i ? Math.floor(R() * 256) : elige([10, 172, 192, 100, 8]))).join('.'),
      () => `${hexn(8)}-${hexn(4)}-${hexn(4)}-${hexn(4)}-${hexn(12)}.local`,
      () => D._.escribirIPv6(Uint8Array.from({ length: 16 }, (_, i) => (i < 8 || R() < 0.5 ? Math.floor(R() * 256) : 0))),
      () => elige(['fe80::1', '::1', '2001:DB8::A', '::ffff:10.0.0.1', 'host.lan', '010.1.2.3', '1.2.3']),
    ])();
    for (let k = 0; k < N; k++) {
      const L = ['v=0', `o=- ${Math.floor(R() * 1e15)} ${elige([2, 3])} IN IP4 127.0.0.1`, 's=-', 't=0 0', 'a=group:BUNDLE 0'];
      if (R() < 0.7) L.push('a=extmap-allow-mixed'); if (R() < 0.7) L.push('a=msid-semantic: WMS');
      L.push(`m=application ${elige([9, 51234, 0])} UDP/DTLS/SCTP webrtc-datachannel`, `c=IN IP4 ${elige(['0.0.0.0', '192.168.1.2'])}`);
      const nc = Math.floor(R() * 8);
      for (let i = 0; i < nc; i++) {
        const tipo = elige(['host', 'host', 'srflx', 'prflx', 'relay']);
        let l = `a=candidate:${Math.floor(R() * 4e9)} ${elige(['1', '1', '1', '2'])} ${elige(['udp', 'udp', 'tcp', 'UDP'])} ${Math.floor(R() * 4294967296)} ${dirAzar()} ${Math.floor(R() * 65536)} typ ${tipo}`;
        if (tipo !== 'host' && R() < 0.8) l += ` raddr ${elige(['0.0.0.0', '192.168.1.2', '::1'])} rport ${Math.floor(R() * 65536)}`;
        if (R() < 0.5) l += ' generation 0'; if (R() < 0.5) l += ` network-id ${Math.floor(R() * 5)}`; if (R() < 0.5) l += ` network-cost ${elige([10, 50, 900, 999])}`;
        L.push(l);
      }
      L.push(`a=ice-ufrag:${ice(elige([4, 4, 8, 5, 16]))}`, `a=ice-pwd:${ice(elige([24, 24, 22, 32]))}`);
      if (R() < 0.8) L.push('a=ice-options:trickle');
      L.push('a=fingerprint:' + elige(['sha-256 ' + HUELLA(k), 'sha-256 ' + HUELLA(k).toLowerCase(), 'sha-1 ' + HUELLA(k).slice(0, 59)]));
      L.push('a=setup:' + elige(['actpass', 'active', 'passive']), 'a=mid:0', 'a=sctp-port:5000');
      if (R() < 0.6) L.push('a=max-message-size:' + elige([262144, 65536]));
      if (R() < 0.2) L.push('a=x-' + ice(10) + ':' + ice(20));
      const sdp = L.join(R() < 0.5 ? '\r\n' : '\n') + '\r\n';
      const tipo = R() < 0.5 ? 'offer' : 'answer', ref = tipo === 'answer' ? ice(elige([4, 5, 8])) : undefined;
      try {
        const rec = D.recortarSdp(sdp), c = await D.empacar(tipo, sdp, ref), d = await D.desempacar(c);
        maxLargo = Math.max(maxLargo, c.length);
        const cls = rec.candidatos.map((x) => x.clase);
        const bien = d.sdp === rec.sdp && d.tipo === tipo && (d.ref || undefined) === ref && D.recortarSdp(rec.sdp).sdp === rec.sdp &&
          rec.candidatos.length <= 4 && !(cls.includes('ipv4') && cls.includes('ipv6'));
        if (!bien) { malos++; if (!primero) primero = sdp; }
      } catch (e) { malos++; if (!primero) primero = e.message + '\n' + sdp; }
    }
    ok(malos === 0, `${N} SDP al azar: ida y vuelta exacta, recorte idempotente y reglas de candidatos (${malos} malos; código más largo ${maxLargo} car.)`);
    if (primero) console.log(primero);
  }

  console.log(`\nFALLAS: ${fallas.length}`);
  if (fallas.length) { for (const f of fallas) console.log('  - ' + f); process.exit(1); }
})().catch((e) => { console.error(e); console.log('FALLAS: 1'); process.exit(1); });
