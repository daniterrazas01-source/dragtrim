// Prueba de la lógica de la sala por internet (fuente/sala/nucleo.js): entrar, códigos, roles, mensajes guardados, vencer.
// Uso: node sala_nucleo_test.mjs   (sale con código 1 si algo falla)
import { NucleoSala, RE_CODIGO, ALFABETO, otro } from '../sala/nucleo.js';

let fallas = 0;
const chk = (c, t) => { console.log((c ? 'ok    ' : 'FALLA ') + t); if (!c) fallas++; };
function almacen() {
  const m = new Map();
  return { m, get: async (k) => (m.has(k) ? JSON.parse(m.get(k)) : undefined), put: async (k, v) => { m.set(k, JSON.stringify(v)); }, deleteAll: async () => m.clear() };
}
let reloj = 1_700_000_000_000;
const ahora = () => reloj;

chk(ALFABETO.length === 32 && !/[IO01]/.test(ALFABETO), 'el alfabeto tiene 32 letras y números, sin I, O, 0 ni 1');
chk(RE_CODIGO.test('KR7PX') && !RE_CODIGO.test('KR0PX') && !RE_CODIGO.test('KRIPX') && !RE_CODIGO.test('KR7P') && !RE_CODIGO.test('kr7px'), 'el código válido: 5 del alfabeto, en mayúsculas');
chk(otro('anfitrion') === 'invitado' && otro('invitado') === 'anfitrion', 'otro(rol)');

const al = almacen(), N = new NucleoSala(al, ahora);
chk((await N.entrar({ rol: 'invitado', id: 'B', crear: false })).error === 'no_existe', 'unirse a una sala que no existe: no_existe');
chk((await N.entrar({ rol: 'invitado', id: 'B', crear: true })).error === 'rol', 'solo el anfitrión crea');
chk((await N.entrar({ rol: 'x', id: 'B' })).error === 'rol' && (await N.entrar({ rol: 'anfitrion', id: '' })).error === 'rol', 'rol o id inválidos');
let r = await N.entrar({ rol: 'anfitrion', id: 'A', crear: true });
chk(r.ok && r.pendientes.length === 0, 'el anfitrión crea la sala');
chk((await N.entrar({ rol: 'anfitrion', id: 'Z', crear: true })).error === 'ocupada', 'otro teléfono con el mismo código: ocupada (elige otro código)');
chk((await N.entrar({ rol: 'anfitrion', id: 'A', crear: true })).ok, 'el mismo anfitrión puede volver a crear/entrar');
// mensajes guardados del anfitrión antes de que llegue el invitado
await N.mensaje('anfitrion', JSON.stringify({ tipo: 'config', arbol: 'full', dist: 201.168 }));
await N.mensaje('anfitrion', JSON.stringify({ tipo: 'estado', ronda: 0, listo: false }));
await N.mensaje('anfitrion', JSON.stringify({ tipo: 'estado', ronda: 0, listo: true }));
const sal = await N.mensaje('anfitrion', JSON.stringify({ tipo: 'salida', ronda: 1, prog: {} }));
chk(sal.reenviar && sal.reenviar.tipo === 'salida' && sal.reenviar.de === 'anfitrion', 'un mensaje se pasa al otro con quién lo mandó');
r = await N.entrar({ rol: 'invitado', id: 'B', crear: false });
const tipos = r.pendientes.map((m) => m.tipo).sort().join(',');
chk(r.ok && tipos === 'config,estado' && r.pendientes.find((m) => m.tipo === 'estado').listo === true, `el invitado recibe lo último guardado del anfitrión, sin la salida (${tipos})`);
chk((await N.entrar({ rol: 'invitado', id: 'C', crear: false, conectadoMismoRol: true })).error === 'llena', 'un tercero con el invitado en línea: llena');
chk((await N.entrar({ rol: 'anfitrion', id: 'C', crear: false })).error === 'ocupada', 'nadie más entra como anfitrión');
await N.mensaje('invitado', JSON.stringify({ tipo: 'resultado', ronda: 1, res: { ok: true, et: 9.1 } }));
r = await N.entrar({ rol: 'anfitrion', id: 'A', crear: false });
chk(r.ok && r.pendientes.some((m) => m.tipo === 'resultado' && m.ronda === 1), 'el anfitrión que se reconecta recibe el resultado que el invitado mandó mientras no estaba');
// el invitado se fue (sin conexión) y otro teléfono toma su lugar: lo guardado del anterior se borra
r = await N.entrar({ rol: 'invitado', id: 'C', crear: false, conectadoMismoRol: false });
chk(r.ok, 'si el invitado ya no está en línea, otro teléfono puede entrar');
r = await N.entrar({ rol: 'anfitrion', id: 'A', crear: false });
chk(r.ok && !r.pendientes.some((m) => m.tipo === 'resultado'), 'lo que guardó el invitado anterior ya no se le da al anfitrión');
// ping
reloj += 1234;
const p = await N.mensaje('invitado', JSON.stringify({ tipo: 'ping', t1: 55.5 }));
chk(p.responder && p.responder.tipo === 'pong' && p.responder.t1 === 55.5 && p.responder.ts === reloj && !p.reenviar, 'ping → pong con la hora de la sala, solo al que preguntó');
chk(Object.keys(await N.mensaje('invitado', 'no es json')).length === 0 && Object.keys(await N.mensaje('invitado', 'x'.repeat(20000))).length === 0, 'mensajes rotos o enormes se ignoran');
// vence a las 24 h sin uso
const v = await N.vence();
chk(v > 23.9 * 3600e3 && v <= 24 * 3600e3, `la sala vence en ~24 h (${(v / 3600e3).toFixed(2)} h)`);
reloj += 25 * 3600e3;
chk((await N.entrar({ rol: 'invitado', id: 'C', crear: false })).error === 'no_existe', 'después de 24 h sin uso la sala ya no existe');
r = await N.entrar({ rol: 'anfitrion', id: 'Z', crear: true });
chk(r.ok && r.pendientes.length === 0 && !(await al.get('ultimo:invitado')), 'un código vencido se puede volver a usar, ya vacío');
console.log('FALLAS:', fallas);
process.exit(fallas ? 1 : 0);
