// sala_local.mjs — La sala de Race 1 vs 1 en esta computadora, para las pruebas (la de verdad es fuente/sala/sala.js en
// Cloudflare). Misma lógica (fuente/sala/nucleo.js) y mismos mensajes; un WebSocket mínimo hecho a mano (sin paquetes).
// Uso: node sala_local.mjs <puerto>   → ws://localhost:<puerto>/sala/<CÓDIGO>?rol=…&id=…[&crear=1]
// Para pruebas (sin señal): GET /cortar/<CÓDIGO>/<rol>?ms=5000 corta la conexión de ese teléfono y no lo deja volver en
// ese tiempo; GET /callar/<CÓDIGO>/<rol>?ms=5000 deja la conexión abierta pero muda (no le llega ni sale nada), como
// cuando se va la señal y el teléfono no se entera: el teléfono debe notarlo solo y reconectarse.
import http from 'node:http';
import crypto from 'node:crypto';
import { NucleoSala, RE_CODIGO, otro } from '../sala/nucleo.js';

const PUERTO = +process.argv[2] || 8799;
const salas = new Map();   // código → { nucleo, mem, socks: Set<{rol, id, enviar, cerrar}> }
const bloqueos = new Map();   // 'CÓDIGO/rol' → hasta (ms): no puede volver a entrar
const callados = new Map();   // 'CÓDIGO/rol' → hasta (ms): su conexión no lleva ni trae nada
const mudo = (codigo, rol) => (callados.get(codigo + '/' + rol) || 0) > Date.now();

function sala(codigo) {
  if (!salas.has(codigo)) {
    const mem = new Map();
    const al = { get: async (k) => (mem.has(k) ? JSON.parse(mem.get(k)) : undefined), put: async (k, v) => { mem.set(k, JSON.stringify(v)); }, deleteAll: async () => mem.clear() };
    salas.set(codigo, { nucleo: new NucleoSala(al), socks: new Set() });
  }
  return salas.get(codigo);
}

// ---- WebSocket mínimo (RFC 6455): texto, ping/pong y cierre
function trama(op, datos) {
  const n = datos.length;
  const cab = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255])
    : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  return Buffer.concat([cab, datos]);
}
function conectar(sock, alTexto, alCerrar) {
  let buf = Buffer.alloc(0), abierto = true;
  const enviar = (txt) => { if (abierto) { try { sock.write(trama(1, Buffer.from(txt))); } catch (e) { /* */ } } };
  const cortar = () => { if (!abierto) return; abierto = false; sock.destroy(); alCerrar(); };   // sin aviso, como sin señal
  const cerrar = (codigo = 1000) => {
    if (!abierto) return;
    abierto = false;
    const b = Buffer.alloc(2); b.writeUInt16BE(codigo);
    try { sock.end(trama(8, b)); } catch (e) { /* */ }
    setTimeout(() => sock.destroy(), 200);
    alCerrar();
  };
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 15, enmasc = buf[1] & 128;
      let n = buf[1] & 127, i = 2;
      if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); i = 4; }
      else if (n === 127) { if (buf.length < 10) return; n = Number(buf.readBigUInt64BE(2)); i = 10; }
      const mascara = enmasc ? buf.slice(i, i + 4) : null;
      if (enmasc) i += 4;
      if (buf.length < i + n) return;
      const datos = Buffer.from(buf.slice(i, i + n));
      if (mascara) for (let k = 0; k < datos.length; k++) datos[k] ^= mascara[k & 3];
      buf = buf.slice(i + n);
      if (op === 1) alTexto(datos.toString());
      else if (op === 9) { try { sock.write(trama(10, datos)); } catch (e) { /* */ } }
      else if (op === 8) { cerrar(1000); return; }
    }
  });
  sock.on('close', () => { if (abierto) { abierto = false; alCerrar(); } });
  sock.on('error', () => { if (abierto) { abierto = false; alCerrar(); } });
  return { enviar, cerrar, cortar };
}

const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const c = /^\/(cortar|callar)\/([A-Z0-9]{5})\/(anfitrion|invitado)$/.exec(u.pathname);
  if (c) {
    const hasta = Date.now() + (+u.searchParams.get('ms') || 5000), k = c[2] + '/' + c[3];
    bloqueos.set(k, hasta);
    if (c[1] === 'callar') callados.set(k, hasta);
    else { const s = salas.get(c[2]); if (s) for (const x of [...s.socks]) if (x.rol === c[3]) x.cortar(); }
    res.end(c[1] === 'callar' ? 'callado' : 'cortado'); return;
  }
  res.end('Drag Tree: sala local de pruebas');
});
srv.on('upgrade', async (req, sock) => {
  const u = new URL(req.url, 'http://x');
  const m = /^\/sala\/([A-Z0-9]{5})$/.exec(u.pathname);
  if (!m || !RE_CODIGO.test(m[1])) { sock.destroy(); return; }
  const rol = u.searchParams.get('rol'), id = u.searchParams.get('id') || '', crear = u.searchParams.get('crear') === '1';
  if ((bloqueos.get(m[1] + '/' + rol) || 0) > Date.now()) { sock.destroy(); return; }   // "sin señal"
  const acepta = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acepta}\r\n\r\n`);
  const s = sala(m[1]);
  const conectadoMismoRol = [...s.socks].some((k) => k.rol === rol && k.id !== id);
  const r = await s.nucleo.entrar({ rol, id, crear, conectadoMismoRol });
  const yo = { rol, id };
  const ws = conectar(sock, async (txt) => {
    if (mudo(m[1], rol)) return;   // sin señal: lo que manda no llega
    const out = await s.nucleo.mensaje(rol, txt);
    if (out.responder) ws.enviar(JSON.stringify(out.responder));
    if (out.reenviar) for (const k of s.socks) if (k.rol === otro(rol) && !mudo(m[1], k.rol)) k.enviar(JSON.stringify(out.reenviar));
  }, () => {
    s.socks.delete(yo);
    if (![...s.socks].some((k) => k.rol === rol)) for (const k of s.socks) if (k.rol === otro(rol)) k.enviar(JSON.stringify({ tipo: 'presencia', otro: false }));
  });
  if (r.error) { ws.enviar(JSON.stringify({ tipo: 'error', causa: r.error })); ws.cerrar(4000); return; }
  for (const k of [...s.socks]) if (k.rol === rol && k.id === id) k.cerrar(4001);   // el mismo teléfono que vuelve
  Object.assign(yo, ws);
  s.socks.add(yo);
  ws.enviar(JSON.stringify({ tipo: 'bienvenida', rol, codigo: m[1], ts: Date.now(), otro: [...s.socks].some((k) => k.rol === otro(rol)) }));
  for (const p of r.pendientes) ws.enviar(JSON.stringify(p));
  for (const k of s.socks) if (k.rol === otro(rol)) k.enviar(JSON.stringify({ tipo: 'presencia', otro: true }));
});
srv.listen(PUERTO, () => console.log(`sala local en ws://localhost:${PUERTO}`));
