// nucleo.js — La sala de Race 1 vs 1 por internet (31 oct 2026, Daniel: "sin necesidad de un hotspot"; decisión de la
// plática "Race 1 vs 1 feature ideas", archivo/ideas/race_1vs1_notas.md: sala en una cuenta de Daniel, código corto,
// cada teléfono con sus datos).
// La sala no decide nada de la carrera (eso lo hace el teléfono que la creó, carrera.js): da la hora para que los dos
// teléfonos sincronicen su reloj con el de la sala, pasa los mensajes de uno al otro y guarda el último de cada tipo
// (hola, config, estado, resultado) para dárselo al que se reconecte. Así, si un teléfono pierde la señal en la pista,
// su resultado llega en cuanto vuelve, aunque el otro ya no esté.
// Lo usan sala.js (Cloudflare Worker + Durable Object, en la cuenta de Daniel) y fuente/pruebas/sala_local.mjs (pruebas).

export const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sin I, O, 0 ni 1: no se confunden al teclear
export const RE_CODIGO = /^[A-HJ-NP-Z2-9]{5}$/;
export const ROLES = ['anfitrion', 'invitado'];
const VIDA_MS = 24 * 3600 * 1000;                 // una sala sin uso se borra al día
const GUARDAR = new Set(['hola', 'config', 'estado', 'resultado']);
const LARGO_MAX = 16 * 1024;                      // un mensaje de la app pesa < 4 KB

export const otro = (rol) => (rol === 'anfitrion' ? 'invitado' : 'anfitrion');

// almacen: { get(k), put(k, v), deleteAll() } (promesas); ahora(): ms de la sala (Date.now)
export class NucleoSala {
  constructor(almacen, ahora) { this.al = almacen; this.ahora = ahora || (() => Date.now()); }

  // Un teléfono entra (o vuelve) a la sala. conectadoMismoRol: ya hay otro teléfono distinto con ese rol en línea.
  // → { ok: true, pendientes: [mensajes guardados del otro rol] } o { error: 'ocupada' | 'no_existe' | 'llena' | 'rol' }
  async entrar({ rol, id, crear, conectadoMismoRol }) {
    if (!ROLES.includes(rol) || !id || typeof id !== 'string' || id.length > 64) return { error: 'rol' };
    const t = this.ahora();
    let meta = await this.al.get('meta');
    const viva = meta && t - meta.activa < VIDA_MS;
    if (crear) {
      if (rol !== 'anfitrion') return { error: 'rol' };
      if (viva && meta.anfitrion !== id) return { error: 'ocupada' };   // ese código ya es de otra sala: el teléfono elige otro
      if (!viva || meta.anfitrion !== id) {
        await this.al.deleteAll();
        meta = { anfitrion: id, invitado: null, creada: t, activa: t };
      }
    } else {
      if (!viva) return { error: 'no_existe' };
      if (meta[rol] && meta[rol] !== id && conectadoMismoRol) return { error: rol === 'invitado' ? 'llena' : 'ocupada' };
      if (rol === 'anfitrion' && meta.anfitrion !== id) return { error: 'ocupada' };
      // otro teléfono toma el lugar del invitado: lo que dejó guardado el anterior ya no sirve
      if (meta[rol] && meta[rol] !== id) await this.al.put('ultimo:' + rol, {});
      meta[rol] = id;
    }
    meta.activa = t;
    await this.al.put('meta', meta);
    const guardados = (await this.al.get('ultimo:' + otro(rol))) || {};
    return { ok: true, pendientes: Object.values(guardados) };
  }

  // Mensaje de un teléfono. → { responder?: obj (al mismo), reenviar?: obj (al otro rol) }
  async mensaje(rol, texto) {
    const t = this.ahora();
    if (typeof texto !== 'string' || texto.length > LARGO_MAX) return {};
    let m;
    try { m = JSON.parse(texto); } catch (e) { return {}; }
    if (!m || typeof m !== 'object' || typeof m.tipo !== 'string') return {};
    if (m.tipo === 'ping') return { responder: { tipo: 'pong', t1: m.t1, ts: t } };   // hora de la sala al recibirlo
    m.de = rol;
    if (GUARDAR.has(m.tipo)) {
      const k = 'ultimo:' + rol, g = (await this.al.get(k)) || {};
      g[m.tipo] = m;
      await this.al.put(k, g);
    }
    const meta = await this.al.get('meta');
    if (meta && t - meta.activa > 60000) { meta.activa = t; await this.al.put('meta', meta); }
    return { reenviar: m };
  }

  // Quedan cuántos ms para borrar la sala (para la alarma); null si ya no existe
  async vence() {
    const meta = await this.al.get('meta');
    return meta ? meta.activa + VIDA_MS - this.ahora() : null;
  }
}
