// Prueba de la sala publicada (o la local): dos "teléfonos" de prueba entran por WebSocket y revisan lo que usa la app.
// Corre en GitHub Actions después de publicar (.github/workflows/sala.yml), porque desde el contenedor de Claude no se
// llega a workers.dev. Uso: node sala_real_test.mjs https://dragtree-sala.<subdominio>.workers.dev
//                       node sala_real_test.mjs http://localhost:8796     (con node sala_local.mjs 8796)
const BASE = (process.argv[2] || '').replace(/\/+$/, '');
if (!BASE) { console.error('Falta la dirección de la sala'); process.exit(2); }
const WS = BASE.replace(/^http/, 'ws');
const ORIGEN = 'https://daniterrazas01-source.github.io';
const ALF = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codigo = () => Array.from({ length: 5 }, () => ALF[Math.floor(Math.random() * ALF.length)]).join('');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let fallas = 0;
const chk = (c, t) => { console.log((c ? 'ok    ' : 'FALLA ') + t); if (!c) fallas++; };

// Un teléfono de prueba: guarda lo que le llega y deja esperar un mensaje de cierto tipo
function telefono(cod, rol, id, crear) {
  const ws = new WebSocket(`${WS}/sala/${cod}?rol=${rol}&id=${id}${crear ? '&crear=1' : ''}`, { headers: { Origin: ORIGEN } });
  const T = { ws, llegados: [], cerrado: false, codigoCierre: null };
  let quien = null;
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); T.llegados.push(m); if (quien) quien(); };
  ws.onclose = (ev) => { T.cerrado = true; T.codigoCierre = ev.code; if (quien) quien(); };
  T.esperar = (pred, ms = 8000) => new Promise((res) => {
    const fin = Date.now() + ms;
    const ver = () => { const i = T.llegados.findIndex(pred); if (i >= 0) { quien = null; res(T.llegados.splice(i, 1)[0]); return true; } return false; };
    if (ver()) return;
    quien = () => { ver(); };
    const tic = setInterval(() => { if (ver() || Date.now() > fin) { clearInterval(tic); if (Date.now() > fin) { quien = null; res(null); } } }, 50);
  });
  T.tipo = (tipo, ms) => T.esperar((m) => m.tipo === tipo, ms);
  T.enviar = (m) => ws.send(JSON.stringify(m));
  T.cerrar = () => new Promise((res) => { if (T.cerrado) { res(); return; } ws.onclose = () => { T.cerrado = true; res(); }; ws.close(1000); });
  return T;
}

async function main() {
  console.log('Sala:', BASE);
  if (BASE.startsWith('https://')) {
    const r = await fetch(BASE + '/estado');
    const txt = await r.text();
    chk(r.status === 200 && /funcionando/.test(txt), `/estado contesta (${r.status}: ${txt.trim()})`);
    chk((await fetch(BASE + '/sala/ABCDE', { headers: { Origin: 'https://otra-pagina.example' } })).status === 403, 'otra página no puede usar la sala (403)');
    chk((await fetch(BASE + '/sala/ABCDE', { headers: { Origin: ORIGEN } })).status === 426, 'sin WebSocket la sala lo dice (426)');
    chk((await fetch(BASE + '/sala/AB0DE')).status === 404, 'un código inválido no existe (404)');
  }
  const cod = codigo(), sufijo = Math.random().toString(36).slice(2, 8);
  // el anfitrión crea la sala
  const A = telefono(cod, 'anfitrion', 'A' + sufijo, true);
  const bA = await A.tipo('bienvenida');
  chk(bA && bA.rol === 'anfitrion' && bA.codigo === cod && bA.otro === false && Number.isFinite(bA.ts), `el anfitrión crea la sala ${cod}`);
  // reloj: pings
  const rtts = [], difs = [];
  for (let i = 0; i < 15; i++) {
    const t1 = Date.now(); A.enviar({ tipo: 'ping', t1 });
    const p = await A.tipo('pong', 4000); const t4 = Date.now();
    if (p && p.t1 === t1) { rtts.push(t4 - t1); difs.push(p.ts - (t1 + t4) / 2); }
  }
  const iMin = rtts.indexOf(Math.min(...rtts));
  chk(rtts.length === 15, `la sala contesta los pings con su hora (ida y vuelta mínima ${Math.min(...rtts)} ms, mediana ${rtts.sort((a, b) => a - b)[7]} ms)`);
  chk(Math.abs(difs[iMin]) < 2000, `la hora de la sala coincide con la de esta computadora (${difs[iMin].toFixed(0)} ms)`);
  // mensajes del anfitrión antes de que llegue el invitado (se guardan)
  A.enviar({ tipo: 'config', arbol: 'full', dist: 201.168, carrilAnf: 'izq' });
  A.enviar({ tipo: 'estado', ronda: 0, listo: true });
  await espera(300);
  // código que no existe
  const X = telefono(codigo(), 'invitado', 'X' + sufijo, false);
  const eX = await X.tipo('error');
  chk(eX && eX.causa === 'no_existe', `código que no existe: "${eX && eX.texto}"`);
  // el invitado entra
  const B = telefono(cod, 'invitado', 'B' + sufijo, false);
  const bB = await B.tipo('bienvenida');
  chk(bB && bB.otro === true, 'el invitado entra y sabe que el anfitrión está');
  const cfg = await B.tipo('config'), est = await B.tipo('estado');
  chk(cfg && cfg.arbol === 'full' && cfg.de === 'anfitrion' && est && est.listo === true, 'al entrar le llega lo último que mandó el anfitrión');
  chk(!!(await A.esperar((m) => m.tipo === 'presencia' && m.otro === true)), 'el anfitrión se entera de que entró el invitado');
  // mensajes de ida y vuelta
  A.enviar({ tipo: 'salida', ronda: 1, prog: { tPre: 1 } });
  const sal = await B.tipo('salida');
  chk(sal && sal.ronda === 1 && sal.de === 'anfitrion', 'la salida del anfitrión le llega al invitado');
  B.enviar({ tipo: 'salida_ok', ronda: 1 });
  chk(!!(await A.tipo('salida_ok')), 'la confirmación del invitado le llega al anfitrión');
  // un tercero no entra
  const C = telefono(cod, 'invitado', 'C' + sufijo, false);
  const eC = await C.tipo('error');
  chk(eC && eC.causa === 'llena', `con los dos dentro, un tercero no entra: "${eC && eC.texto}"`);
  // el anfitrión pierde la señal; el invitado manda su resultado; al volver, le llega
  await A.cerrar();
  chk(!!(await B.esperar((m) => m.tipo === 'presencia' && m.otro === false)), 'el invitado ve que el anfitrión se fue');
  B.enviar({ tipo: 'resultado', ronda: 1, res: { ok: true, et: 8.765, rt_verde: 0.123 } });
  await espera(400);
  const A2 = telefono(cod, 'anfitrion', 'A' + sufijo, false);
  const bA2 = await A2.tipo('bienvenida');
  const res = await A2.tipo('resultado');
  chk(bA2 && bA2.otro === true && res && res.res && res.res.et === 8.765, 'el anfitrión vuelve y recibe el resultado que el invitado mandó mientras no estaba');
  // otro teléfono no puede hacerse pasar por el anfitrión
  const Z = telefono(cod, 'anfitrion', 'Z' + sufijo, false);
  const eZ = await Z.tipo('error');
  chk(eZ && eZ.causa === 'ocupada', 'nadie más entra como anfitrión');
  await Promise.all([A2.cerrar(), B.cerrar()]);
  for (const t of [X, C, Z]) if (!t.cerrado) await t.cerrar();
  console.log('FALLAS:', fallas);
  process.exit(fallas ? 1 : 0);
}
main().catch((e) => { console.error('FALLA', e); process.exit(1); });
