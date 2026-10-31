// sala.js — La sala de Race 1 vs 1 en Cloudflare (Worker + Durable Object), en la cuenta de Daniel.
// Cada sala es un Durable Object con nombre = su código de 5 letras. Los teléfonos se conectan por WebSocket a
//   wss://<dirección de la sala>/sala/<CÓDIGO>?rol=anfitrion|invitado&id=<id del teléfono>[&crear=1]
// La lógica está en nucleo.js (la misma que usa el servidor de pruebas). Cómo publicarla: LEEME.md.
import { NucleoSala, RE_CODIGO, otro } from './nucleo.js';

const CAUSAS = {
  ocupada: 'Ese código ya es de otra sala.',
  no_existe: 'No hay ninguna sala con ese código. Revisa las letras.',
  llena: 'Esa sala ya tiene a sus dos teléfonos.',
  rol: 'Datos de conexión inválidos.',
};

export class Sala {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.nucleo = new NucleoSala({
      get: (k) => ctx.storage.get(k),
      put: (k, v) => ctx.storage.put(k, v),
      deleteAll: () => ctx.storage.deleteAll(),
    });
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Drag Tree: sala de Race 1 vs 1', { status: 426 });
    const u = new URL(req.url);
    const rol = u.searchParams.get('rol'), id = u.searchParams.get('id') || '', crear = u.searchParams.get('crear') === '1';
    const vivos = this.ctx.getWebSockets(rol || 'x');
    const conectadoMismoRol = vivos.some((w) => { const a = w.deserializeAttachment(); return a && a.id !== id; });
    const r = await this.nucleo.entrar({ rol, id, crear, conectadoMismoRol });
    const [cliente, servidor] = Object.values(new WebSocketPair());
    if (r.error) {
      // se acepta solo para decir por qué no se puede y se cierra
      servidor.accept();
      servidor.send(JSON.stringify({ tipo: 'error', causa: r.error, texto: CAUSAS[r.error] || r.error }));
      servidor.close(4000, r.error);
      return new Response(null, { status: 101, webSocket: cliente });
    }
    // el mismo teléfono que se reconecta: se cierra su conexión vieja
    for (const w of vivos) { const a = w.deserializeAttachment(); if (a && a.id === id) { try { w.close(4001, 'reemplazada'); } catch (e) { /* */ } } }
    this.ctx.acceptWebSocket(servidor, [rol]);
    servidor.serializeAttachment({ rol, id });
    servidor.send(JSON.stringify({ tipo: 'bienvenida', rol, codigo: u.pathname.split('/').pop(), ts: Date.now(), otro: this.ctx.getWebSockets(otro(rol)).length > 0 }));
    for (const m of r.pendientes) servidor.send(JSON.stringify(m));
    this.avisar(otro(rol), { tipo: 'presencia', otro: true });
    await this.ctx.storage.setAlarm(Date.now() + (await this.nucleo.vence()));
    return new Response(null, { status: 101, webSocket: cliente });
  }

  avisar(rol, m) {
    const t = JSON.stringify(m);
    for (const w of this.ctx.getWebSockets(rol)) { try { w.send(t); } catch (e) { /* ya se cerró */ } }
  }

  async webSocketMessage(ws, texto) {
    const a = ws.deserializeAttachment();
    if (!a) return;
    const r = await this.nucleo.mensaje(a.rol, typeof texto === 'string' ? texto : '');
    if (r.responder) { try { ws.send(JSON.stringify(r.responder)); } catch (e) { /* */ } }
    if (r.reenviar) this.avisar(otro(a.rol), r.reenviar);
  }

  async webSocketClose(ws) {
    try { ws.close(1000, 'adios'); } catch (e) { /* ya estaba cerrada */ }   // completa el cierre que pidió el teléfono
    const a = ws.deserializeAttachment();
    if (a && !this.ctx.getWebSockets(a.rol).some((w) => w !== ws)) this.avisar(otro(a.rol), { tipo: 'presencia', otro: false });
  }
  async webSocketError(ws) { return this.webSocketClose(ws); }

  async alarm() {
    const falta = await this.nucleo.vence();
    if (falta === null) return;
    if (falta > 0) { await this.ctx.storage.setAlarm(Date.now() + falta); return; }
    await this.ctx.storage.deleteAll();   // un día sin uso: se borra
  }
}

// Solo la app de Daniel (y pruebas locales) puede usar la sala
function origenValido(req, env) {
  const o = req.headers.get('Origin');
  if (!o) return true;
  const ok = (env.ORIGENES || 'https://daniterrazas01-source.github.io').split(',').map((x) => x.trim());
  return ok.includes(o) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === '/' || u.pathname === '/estado') return new Response('Drag Tree: sala de Race 1 vs 1 funcionando', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    const m = /^\/sala\/([A-Z0-9]{5})$/.exec(u.pathname);
    if (!m || !RE_CODIGO.test(m[1])) return new Response('No encontrado', { status: 404 });
    if (!origenValido(req, env)) return new Response('Origen no permitido', { status: 403 });
    return env.SALA.get(env.SALA.idFromName(m[1])).fetch(req);
  },
};
