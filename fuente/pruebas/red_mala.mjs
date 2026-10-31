// red_mala.mjs — Señal mala entre los teléfonos de prueba (Chromium) y la sala local (sala_local.mjs), para
// sincronia_test.py. Un proxy TCP por teléfono que retrasa cada pedazo del flujo como una red celular: retraso base +
// variación (exponencial) + picos de vez en cuando, por dirección (subida = teléfono→sala, bajada = sala→teléfono), sin
// desordenar nada (es TCP: un pico atrasa también lo que viene detrás), y cortes totales (nada sube ni baja) a pedido.
// Uso: node red_mala.mjs <puerto_control> <puerto_sala> <puerto_tel_1> [<puerto_tel_2> …]
// Control por HTTP en <puerto_control>:
//   POST /perfil/<puerto>   {"subida": P, "bajada": P}   P = {"base": ms, "var": ms, "picos": prob, "pico": [min, max]}
//   GET  /cortar/<puerto>?ms=4000[&en=0]                 corte total de ese teléfono (empieza en `en` ms)
//   POST /trampa/<puerto>   {"texto": "…", "cortar": [puertos], "ms": 6000}
//        la próxima vez que baje a ese teléfono un mensaje con ese texto (la sala no enmascara lo que baja), justo después
//        de entregárselo se cortan esos teléfonos `ms` milisegundos (una sola vez)
//   GET  /estado                                         cuántos pedazos pasaron y el retraso promedio por teléfono
import net from 'node:net';
import http from 'node:http';

const [PCTL, PSALA, ...PTELS] = process.argv.slice(2).map(Number);
const SIN_RETRASO = { base: 0, var: 0, picos: 0, pico: [0, 0] };
const tels = new Map();   // puerto → { perfil: {subida, bajada}, corte: {desde, hasta}, trampa, n, suma }
for (const p of PTELS) tels.set(p, { perfil: { subida: SIN_RETRASO, bajada: SIN_RETRASO }, corte: { desde: 0, hasta: 0 }, trampa: null, n: 0, suma: 0 });

// generador repetible (cada corrida de la prueba da lo mismo con la misma semilla)
let semilla = 20261101;
const azar = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296; };
function retraso(P) {
  let d = P.base + (P.var > 0 ? -P.var * Math.log(1 - azar()) : 0);
  if (P.picos > 0 && azar() < P.picos) d += P.pico[0] + (P.pico[1] - P.pico[0]) * azar();
  return d;
}
const cortado = (T, t) => t >= T.corte.desde && t < T.corte.hasta;

function cola(T, dir, destino) {
  const q = [];   // { t, buf }
  let ultimo = 0, timer = null, cerrar = false;
  function bombear() {
    timer = null;
    const ahora = performance.now();
    while (q.length && q[0].t <= ahora) {
      if (cortado(T, ahora)) { q[0].t = Math.max(q[0].t, T.corte.hasta + T.perfil[dir].base); break; }   // corte: espera
      const x = q.shift();
      if (!destino.destroyed) destino.write(x.buf);
      if (x.trampa) x.trampa();
    }
    if (q.length) timer = setTimeout(bombear, Math.max(0, q[0].t - performance.now()));
    else if (cerrar && !destino.destroyed) destino.end();
  }
  return {
    meter(buf) {
      const ahora = performance.now();
      const t = Math.max(ahora + retraso(T.perfil[dir]), ultimo + 0.05);
      ultimo = t;
      const x = { t, buf };
      if (dir === 'bajada') {
        T.n++; T.suma += t - ahora;
        const tr = T.trampa;
        if (tr && buf.includes(Buffer.from(tr.texto))) {
          T.trampa = null;
          x.trampa = () => { const d = performance.now() + 1; for (const p of tr.cortar) { const U = tels.get(p); if (U) U.corte = { desde: d, hasta: d + tr.ms }; } };
        }
      }
      q.push(x);
      if (!timer) timer = setTimeout(bombear, Math.max(0, q[0].t - ahora));
    },
    fin() { cerrar = true; if (!timer && !q.length && !destino.destroyed) destino.end(); },
  };
}

for (const p of PTELS) {
  const T = tels.get(p);
  net.createServer((tel) => {
    const sala = net.connect(PSALA, '127.0.0.1');
    tel.setNoDelay(true); sala.setNoDelay(true);
    const sube = cola(T, 'subida', sala), baja = cola(T, 'bajada', tel);
    tel.on('data', (b) => sube.meter(b));
    sala.on('data', (b) => baja.meter(b));
    tel.on('end', () => sube.fin()); sala.on('end', () => baja.fin());
    const romper = () => { tel.destroy(); sala.destroy(); };
    tel.on('error', romper); sala.on('error', romper);
    tel.on('close', () => setTimeout(() => sala.destroy(), 3000)); sala.on('close', () => setTimeout(() => tel.destroy(), 3000));
  }).listen(p, '127.0.0.1');
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const m = /^\/(perfil|cortar|trampa)\/(\d+)$/.exec(u.pathname);
  const fin = (x) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(x)); };
  if (u.pathname === '/estado') { fin(Object.fromEntries([...tels].map(([p, T]) => [p, { n: T.n, prom_bajada_ms: T.n ? T.suma / T.n : 0 }]))); return; }
  const T = m && tels.get(+m[2]);
  if (!T) { res.statusCode = 404; fin({ error: 'no' }); return; }
  if (m[1] === 'cortar') {
    const d = performance.now() + (+u.searchParams.get('en') || 0);
    T.corte = { desde: d, hasta: d + (+u.searchParams.get('ms') || 4000) };
    fin({ ok: true }); return;
  }
  let cuerpo = '';
  req.on('data', (c) => { cuerpo += c; });
  req.on('end', () => {
    let o = {};
    try { o = JSON.parse(cuerpo || '{}'); } catch (e) { /* */ }
    if (m[1] === 'perfil') {
      for (const dir of ['subida', 'bajada']) T.perfil[dir] = Object.assign({}, SIN_RETRASO, o[dir] || {});
      T.n = 0; T.suma = 0;
    } else T.trampa = { texto: String(o.texto || ''), cortar: (o.cortar || [+m[2]]).map(Number), ms: +o.ms || 6000 };
    fin({ ok: true });
  });
}).listen(PCTL, '127.0.0.1', () => console.log(`red mala: control en ${PCTL}, sala ${PSALA}, teléfonos ${PTELS.join(', ')}`));
