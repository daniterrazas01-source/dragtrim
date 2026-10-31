// qr_test.js — DragQR (qr.js) en Node: generar con qrcode-generator y leer con jsQR los códigos de Race 1 vs 1.
// Códigos "DT1o" + base64url al azar de 40 a 1400 caracteres → DragQR.matriz → imagen RGBA (n px por módulo + margen
// de 4) → DragQR.leerImagen debe dar el mismo texto. Casos degradados con remuestreo propio: escala no entera,
// desenfoque leve, ruido, contraste bajo, colores invertidos y giro de unos grados (+ uno combinado, informativo).
// Exige 100 % en limpios y ≥ 95 % en cada degradación leve hasta 700 caracteres; arriba de 700 solo informa.
// Uso: node qr_test.js [--rapido] [--semilla N]
'use strict';
const Q = require(__dirname + '/../app/src/qr.js');

const args = process.argv.slice(2);
const RAPIDO = args.includes('--rapido');
const SEMILLA = (() => { const i = args.indexOf('--semilla'); return i >= 0 ? +args[i + 1] : 20261031; })();
let fallas = 0, oks = 0;
function ok(c, msg) { if (c) oks++; else fallas++; console.log((c ? 'ok    ' : 'FALLA ') + msg); }

// ------------------------------------------------------------------ azar reproducible
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEMILLA);
const unif = (a, b) => a + (b - a) * rnd();
function gauss() { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); }
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function texto(L) { let s = 'DT1o'; while (s.length < L) s += B64URL[Math.floor(rnd() * 64)]; return s; }

// ------------------------------------------------------------------ imagen del QR (remuestreo propio)
// o: s (px por módulo, puede no ser entero), rot (grados), ss (submuestras por lado), negro, blanco, inv (colores
// invertidos), blur (sigma en px), ruido (sigma en niveles 0–255).
function imagen(M, o) {
  const s = o.s, N = M.n + 2 * Q.MARGEN, lado = N * s;
  const ang = (o.rot || 0) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
  const W = Math.ceil(lado * (Math.abs(ca) + Math.abs(sa))) + 2, H = W;
  const ss = o.ss || 1, negro = o.negro != null ? o.negro : 0, blanco = o.blanco != null ? o.blanco : 255;
  const L = new Float32Array(W * H);
  const exacta = !o.rot && Number.isInteger(s) && ss === 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let osc = 0;
    if (exacta) {
      const u = x - (W - lado) / 2, v = y - (H - lado) / 2;
      osc = M.oscuro(Math.floor(v / s) - Q.MARGEN, Math.floor(u / s) - Q.MARGEN) ? 1 : 0;
    } else {
      for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
        const dx = x + (i + 0.5) / ss - W / 2, dy = y + (j + 0.5) / ss - H / 2;
        const u = ca * dx + sa * dy + lado / 2, v = -sa * dx + ca * dy + lado / 2;   // giro inverso
        if (M.oscuro(Math.floor(v / s) - Q.MARGEN, Math.floor(u / s) - Q.MARGEN)) osc++;
      }
      osc /= ss * ss;
    }
    L[y * W + x] = blanco + (negro - blanco) * osc;
  }
  if (o.blur > 0) desenfocar(L, W, H, o.blur);
  const d = new Uint8ClampedArray(W * H * 4);
  for (let k = 0; k < W * H; k++) {
    let v = L[k] + (o.ruido > 0 ? o.ruido * gauss() : 0);
    if (o.inv) v = 255 - v;
    d[4 * k] = d[4 * k + 1] = d[4 * k + 2] = v; d[4 * k + 3] = 255;
  }
  return { data: d, width: W, height: H };
}
function desenfocar(L, W, H, sigma) {   // gaussiano separable
  const r = Math.ceil(3 * sigma), k = [];
  let sum = 0;
  for (let i = -r; i <= r; i++) { const w = Math.exp(-i * i / (2 * sigma * sigma)); k.push(w); sum += w; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const T = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0;
    for (let i = -r; i <= r; i++) a += k[i + r] * L[y * W + Math.min(W - 1, Math.max(0, x + i))];
    T[y * W + x] = a;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0;
    for (let i = -r; i <= r; i++) a += k[i + r] * T[Math.min(H - 1, Math.max(0, y + i)) * W + x];
    L[y * W + x] = a;
  }
}
const noEntera = () => { let s; do s = unif(2.5, 4.5); while (Math.abs(s - Math.round(s)) < 0.15); return s; };
const signo = () => (rnd() < 0.5 ? -1 : 1);

// ------------------------------------------------------------------ 1) la matriz
{
  let bien = true, eccBien = true, detalle = '';
  for (const L of [40, 300, 600, 900, 997, 1000, 1400, 2000]) {
    const M = Q.matriz(texto(L));
    if (M.n !== 4 * M.version + 17 || !Number.isInteger(M.version)) { bien = false; detalle += ` ${L}:n=${M.n}`; }
    // patrones de posición: esquina de arriba a la izquierda (7×7: borde negro, anillo blanco, centro negro 3×3)
    if (!(M.oscuro(0, 0) && M.oscuro(0, 6) && M.oscuro(6, 0) && !M.oscuro(1, 1) && M.oscuro(3, 3) && !M.oscuro(7, 7) && M.oscuro(0, M.n - 1))) bien = false;
    if (M.oscuro(-1, 0) || M.oscuro(0, M.n)) bien = false;
    const esperado = M.version <= 25 ? 'M' : 'L';
    if (M.ecc !== (L <= 997 ? 'M' : 'L') || (M.ecc === 'M' && M.version > 25)) { eccBien = false; detalle += ` ${L}:${M.ecc}${M.version}/${esperado}`; }
  }
  ok(bien, 'matriz: n = 4·versión + 17, patrones de posición en su lugar, fuera de la matriz es blanco' + detalle);
  ok(eccBien, 'matriz: ECC M hasta la versión 25 (997 bytes), luego L' + detalle);
  ok(Q.matriz('hola', 'h').ecc === 'H' && Q.matriz('hola', 'Q').ecc === 'Q' && Q.matriz(texto(600), 'L').version < Q.matriz(texto(600)).version,
    'matriz: el ECC se puede forzar');
  let lanza = false;
  try { Q.matriz('x'.repeat(3000)); } catch (e) { lanza = /no cabe/.test(e.message); }
  ok(lanza, 'matriz: un texto que no cabe (3000 bytes) lanza un error claro');
  const u = 'Ñandú – Race 1 vs 1 ¼ ✓ 🚗';
  ok(Q.leerImagen(imagen(Q.matriz(u), { s: 4 })) === u, 'texto con acentos y emoji: se lee igual (UTF-8)');
  const blanca = { data: new Uint8ClampedArray(200 * 200 * 4).fill(255), width: 200, height: 200 };
  const ruido = { data: new Uint8ClampedArray(200 * 200 * 4).map(() => Math.floor(rnd() * 256)), width: 200, height: 200 };
  ok(Q.leerImagen(blanca) === null && Q.leerImagen(ruido) === null && Q.leerImagen(null) === null && Q.leerImagen({ data: [], width: 5, height: 5 }) === null,
    'leerImagen: sin QR (blanca, ruido, vacía) da null sin error');
}

// ------------------------------------------------------------------ 2) leer de vuelta: limpios y degradados
const LARGOS_700 = RAPIDO ? [40, 150, 300, 450, 600, 700] : [40, 60, 80, 100, 130, 160, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700];
const LARGOS_MAS = RAPIDO ? [1000, 1400] : [800, 900, 1000, 1100, 1200, 1300, 1400];
const POR_LARGO = (L) => (RAPIDO ? 1 : (L <= 700 ? 3 : 2));
const CASOS = [
  { id: 'limpio 2 px', limpio: true, o: () => ({ s: 2 }) },
  { id: 'limpio 3 px', limpio: true, o: () => ({ s: 3 }) },
  { id: 'limpio 4 px', limpio: true, o: () => ({ s: 4 }) },
  { id: 'limpio 6 px', limpio: true, o: () => ({ s: 6 }) },
  { id: 'escala no entera 2.5–4.5 px', leve: true, o: () => ({ s: noEntera(), ss: 4 }) },
  { id: 'desenfoque σ 1 px (¼ de módulo)', leve: true, o: () => ({ s: 4, blur: 1.0 }) },
  { id: 'ruido σ 35', leve: true, o: () => ({ s: 3, ruido: 35 }) },
  { id: 'contraste bajo 100/160', leve: true, o: () => ({ s: 4, negro: 100, blanco: 160, ruido: 4 }) },
  { id: 'colores invertidos', leve: true, o: () => ({ s: 3, inv: true }) },
  { id: 'girado 3–8°', leve: true, o: () => ({ s: unif(3.2, 4.4), rot: signo() * unif(3, 8), ss: 3 }) },
  { id: 'combinado (informativo)', o: () => ({ s: unif(3, 4), rot: signo() * unif(2, 5), ss: 3, blur: 0.8, ruido: 12, negro: 50, blanco: 200 }) },
];
const textos = [];
for (const L of LARGOS_700.concat(LARGOS_MAS)) for (let k = 0; k < POR_LARGO(L); k++) textos.push(texto(L));
console.log(`\nsemilla ${SEMILLA}; ${textos.length} textos de ${LARGOS_700[0]} a ${LARGOS_MAS[LARGOS_MAS.length - 1]} caracteres${RAPIDO ? ' (rápido)' : ''}`);
console.log('caso                               ≤700 car.       >700 car.       ms/lectura   px de la imagen');
const t0 = Date.now();
for (const caso of CASOS) {
  const r = { a: [0, 0], b: [0, 0], ms: 0, n: 0, px: [Infinity, 0], malos: [] };
  for (const t of textos) {
    const M = Q.matriz(t), im = imagen(M, caso.o());
    const t1 = process.hrtime.bigint();
    const leido = Q.leerImagen(im);
    r.ms += Number(process.hrtime.bigint() - t1) / 1e6; r.n++;
    r.px = [Math.min(r.px[0], im.width), Math.max(r.px[1], im.width)];
    const g = t.length <= 700 ? r.a : r.b;
    g[1]++;
    if (leido === t) g[0]++; else r.malos.push(t.length + (leido === null ? '' : ' (otro texto)'));
  }
  const pct = (g) => (g[1] ? (100 * g[0] / g[1]) : NaN);
  const f = (g) => `${g[0]}/${g[1]} ${pct(g).toFixed(0).padStart(3)} %`;
  console.log(`${caso.id.padEnd(34)} ${f(r.a).padEnd(15)} ${f(r.b).padEnd(15)} ${(r.ms / r.n).toFixed(1).padStart(6)}       ${r.px[0]}–${r.px[1]}` +
    (r.malos.length ? `   sin leer: ${r.malos.slice(0, 6).join(', ')}${r.malos.length > 6 ? '…' : ''}` : ''));
  if (caso.limpio) ok(r.a[0] === r.a[1] && r.b[0] === r.b[1], `${caso.id}: 100 % (${r.a[0] + r.b[0]}/${r.a[1] + r.b[1]})`);
  else if (caso.leve) ok(pct(r.a) >= 95, `${caso.id}: ≥ 95 % hasta 700 caracteres (${pct(r.a).toFixed(1)} %)`);
}
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);

// ------------------------------------------------------------------ 3) el escáner: ciclo de intentos con jsQR
// Cuadro de cámara simulado: el QR en la pantalla de otro teléfono (marco, mesa, reflejo), visto en trapecio y algo
// girado, desenfocado y con ruido; la mano tiembla un poco entre cuadros. DragQR._intentoCuadro hace lo mismo que el
// escáner con cada cuadro (recorte del centro, escala, contraste, suavizado), solo que sin canvas.
function homografia(q) {   // cuadrado unitario → cuadrilátero q (arriba izq., arriba der., abajo der., abajo izq.)
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1, g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
  const [a, b, c, d, e, f] = [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0];
  const A = e - f * h, B = -(d - f * g), C = d * h - e * g, det = a * A + b * B + c * C;   // inversa (i = 1)
  return [A / det, -(b - c * h) / det, (b * f - c * e) / det, B / det, (a - c * g) / det, -(a * f - c * d) / det,
          C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
function cuadroCamara(M, W, H, lado, o) {
  const N = M.n + 2 * Q.MARGEN, ang = o.giro * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
  const arr = lado * (1 - o.trapecio / 2) / 2, aba = lado * (1 + o.trapecio / 2) / 2, r = lado / 2;
  const q = [[-arr, -r], [arr, -r], [aba, r], [-aba, r]].map(([x, y]) => [W / 2 + o.dx + ca * x - sa * y, H / 2 + o.dy + sa * x + ca * y]);
  const I = homografia(q), L = new Float32Array(W * H);
  const brillo = (u, v) => 18 * Math.exp(-((u - 0.85) ** 2 + (v - 0.05) ** 2) / 0.08);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const px = x + 0.25 + 0.5 * i, py = y + 0.25 + 0.5 * j, den = I[6] * px + I[7] * py + I[8];
      const u = (I[0] * px + I[1] * py + I[2]) / den, v = (I[3] * px + I[4] * py + I[5]) / den;
      if (u >= 0 && u < 1 && v >= 0 && v < 1) acc += (M.oscuro(Math.floor(v * N) - Q.MARGEN, Math.floor(u * N) - Q.MARGEN) ? 30 : 215) + brillo(u, v);
      else if (u > -0.1 && u < 1.1 && v > -0.12 && v < 1.4) acc += 215 + brillo(u, v);   // el resto de la pantalla
      else if (u > -0.17 && u < 1.17 && v > -0.2 && v < 1.48) acc += 22;                 // marco del teléfono
      else acc += 95 + 40 * x / W;                                                         // la mesa
    }
    L[y * W + x] = acc / 4;
  }
  desenfocar(L, W, H, 1.0);
  const d = new Uint8ClampedArray(W * H * 4);
  for (let k = 0; k < W * H; k++) { d[4 * k] = d[4 * k + 1] = d[4 * k + 2] = L[k] + 4 * gauss(); d[4 * k + 3] = 255; }
  return { data: d, width: W, height: H };
}
{
  let bien = true, det = '';
  const escalas = new Set();
  for (const [W, H] of [[1280, 720], [720, 1280], [1920, 1080], [640, 480], [480, 640], [3840, 2160]]) {
    for (let k = 0; k < Q._CICLO; k++) {
      const p = Q._plan(k, W, H), sal = Math.round(p.lado * p.f);
      if (W === 1280) escalas.add(p.f + (p.suave ? 's' : '') + (p.inv ? 'i' : ''));
      if (p.sx < 0 || p.sy < 0 || p.sx + p.lado > W || p.sy + p.lado > H || sal > 720 || sal < Math.min(W, H, 720) - 1 ||
          Math.abs(p.sx - (W - p.lado) / 2) > 1 || Math.abs(p.sy - (H - p.lado) / 2) > 1) { bien = false; det += ` ${W}×${H}/${k}`; }
    }
  }
  ok(bien, `escáner: cada uno de los ${Q._CICLO} intentos ve un cuadrado del centro, dentro del cuadro, y jsQR recibe ≤ 720 px` + det);
  ok(escalas.size >= 5, `escáner: el ciclo prueba ${escalas.size} variantes (escalas ${[...escalas].join(', ')})`);

  const t = texto(600), M = Q.matriz(t);
  const ESC = RAPIDO
    ? [[1280, 720, [300, 540], [[0.06, 2]]]]
    : [[1280, 720, [300, 420, 540, 660], [[0.06, 2], [0.12, 4]]], [1920, 1080, [420, 800], [[0.06, 2], [0.12, 4]]]];
  console.log(`\nescáner simulado: QR de 600 caracteres (versión ${M.version}, ${M.n} módulos) en otra pantalla, desenfoque 1 px, ruido 4`);
  let ciclos = 0, ciclosOk = 0;
  const t1 = Date.now();
  for (const [W, H, tams, persp] of ESC) for (const lado of tams) for (const [tr, giro] of persp) {
    let aciertos = 0, primero = -1;
    for (let k = 0; k < Q._CICLO; k++) {
      const im = cuadroCamara(M, W, H, lado, { trapecio: tr, giro, dx: 2 * Math.sin(k * 1.3), dy: 2 * Math.cos(k * 0.8) });
      if (Q._intentoCuadro(im, k) === t) { aciertos++; if (primero < 0) primero = k; }
    }
    ciclos++; if (aciertos) ciclosOk++;
    console.log(`  ${W}×${H}, QR de ${lado} px (${(lado / (M.n + 8)).toFixed(1)} px por módulo), trapecio ${tr * 100} %, giro ${giro}°: ` +
      `${aciertos}/${Q._CICLO} intentos${primero >= 0 ? `, el primero en el ${primero + 1}.º` : ''}`);
  }
  console.log(`  (${((Date.now() - t1) / 1000).toFixed(1)} s)`);
  ok(ciclosOk >= 0.9 * ciclos, `escáner: un ciclo de ${Q._CICLO} intentos (~0.8 s) lee el QR en ${ciclosOk}/${ciclos} casos (de 300 a ${RAPIDO ? 540 : 800} px)`);
}

console.log(`\n${oks} bien, ${fallas} fallas`);
console.log('FALLAS: ' + fallas);
process.exit(fallas ? 1 : 0);
