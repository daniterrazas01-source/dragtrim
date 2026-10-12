// Prueba de la calculadora Rooster Racing (fuente/app/src/rooster.js).
// 1) Rooster.hoja() contra la hoja de Daniel recalculada en LibreOffice (datos/rooster_vectores.json,
//    8 casos; el caso "original" es idéntico a los valores guardados por Excel).
// 2) Lo que usa la app (predecir, pesoParaET, caballosDesde) contra la hoja donde no hay correcciones.
// 3) Densidad del aire real: coherencia con la atmósfera estándar.
// Uso: node calc.js   (sale con código 1 si algo falla)
const path = require('path');
const R = require(path.join(__dirname, '../app/src/rooster.js'));
const V = require(path.join(__dirname, 'datos/rooster_vectores.json'));

let ok = 0, mal = 0;
const cerca = (a, b, tol = 1e-9) => (typeof b === 'string' ? a === b : Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)));
function chk(nombre, a, b, tol) {
  if (cerca(a, b, tol)) ok++;
  else { mal++; console.log(`FALLA ${nombre}: app=${a} hoja=${b}`); }
}

// 1) hoja exacta
for (const c of V) {
  const o = R.hoja(c.entradas);
  for (const [celda, v] of Object.entries(c.salidas)) {
    if (v === null) continue;
    if (!(celda in o)) { mal++; console.log(`FALLA ${c.id}.${celda}: no calculada`); continue; }
    chk(`${c.id}.${celda}`, o[celda], v);
  }
}
const n1 = ok;

// 2) API de la app contra la hoja
for (const c of V) {
  const e = c.entradas, s = c.salidas, km = e.B1 === 1 ? 1.60934 : 1;
  const motor = e.C6 ? 'nitro' : 'atmos';
  const p = { peso: e.A3, hp: e.B3, motor, nitro: e.C6, da: s.C3 };
  const r = R.predecir(p);
  chk(`${c.id} et14`, r.pista.et14, s.E3); chk(`${c.id} v14`, r.pista.v14 * km, s.F3);
  chk(`${c.id} et18`, r.pista.et18, s.E5); chk(`${c.id} v18`, r.pista.v18 * km, s.F5);
  chk(`${c.id} 60ft`, r.pista.sesenta, s.D3); chk(`${c.id} whp`, r.pista.whp, s.G3);
  chk(`${c.id} mar et14`, r.mar.et14, s.I3); chk(`${c.id} mar v14`, r.mar.v14 * km, s.J3);
  chk(`${c.id} mar whp`, r.mar.whp, s.K3);
  if (e.B1 === 0) { chk(`${c.id} 0-60`, r.pista.cero60, s.F7); chk(`${c.id} mar 0-60`, r.mar.cero60, s.J7); }
  chk(`${c.id} C8`, R.pesoParaET(p, e.B8), s.C8);
  chk(`${c.id} B22`, R.caballosDesde({ peso: e.A3, da: s.C3, dato: 'et18', valor: e.D22 }).hp, s.B22);
  chk(`${c.id} B23`, R.caballosDesde({ peso: e.A3, da: s.C3, dato: 'v18', valor: e.E23 }).hp, s.B23);
  // 1/4 directo: mismo resultado que pasar por 1/8 con las proporciones de la hoja
  chk(`${c.id} et14 inv`, R.caballosDesde({ peso: e.A3, da: s.C3, dato: 'et14', valor: s.F22 }).hp, s.B22);
  chk(`${c.id} v14 inv`, R.caballosDesde({ peso: e.A3, da: s.C3, dato: 'v14', valor: s.G23 }).hp, s.B23);
  // turbo: a DA 7000 la presión de la tabla es 11.34, justo la que la hoja tiene fija
  for (const boost of [0, 8, 15]) {
    const h = R.hoja(Object.assign({}, e, { A13: e.A3, B13: e.B3, A17: boost, C13: 7000, B11: 0 }));
    const t = R.predecir({ peso: e.A3, hp: e.B3, motor: 'turbo', boost, da: 7000 });
    chk(`${c.id} turbo${boost} et14`, t.pista.et14, h.E14); chk(`${c.id} turbo${boost} v14`, t.pista.v14, h.F14);
    chk(`${c.id} turbo${boost} whp`, t.pista.whp, h.G14); chk(`${c.id} turbo${boost} mar`, t.mar.et14, h.I14);
    chk(`${c.id} turbo${boost} 60ft`, t.pista.sesenta, h.D14);
  }
  // turbo sin boost = atmosférico
  chk(`${c.id} turbo0=atmos`, R.predecir({ peso: e.A3, hp: e.B3, motor: 'turbo', boost: 0, da: s.C3 }).pista.et14,
    R.predecir({ peso: e.A3, hp: e.B3, motor: 'atmos', da: s.C3 }).pista.et14);
}
const n2 = ok - n1;

// 3) densidad real
for (const ft of [0, 1440, 4100, 4900, 5100, 5600, 8000]) {
  const m = ft / 3.28084, tIsa = 15 - 0.0019812 * ft;
  chk(`DA ISA ${ft}`, R.densidadReal(R.presionISA_hPa(m), tIsa, 0), ft, 0.02 * Math.max(1, 1500 / Math.max(ft, 1)));
}
const dSeca = R.densidadReal(850, 25, 0), dHum = R.densidadReal(850, 25, 80);
if (dHum > dSeca + 200) ok++; else { mal++; console.log('FALLA la humedad no sube la DA', dSeca, dHum); }
chk('tabla 7000', R.presionTabla(7000), 11.34); chk('tabla 0', R.presionTabla(0), 14.7);
chk('tabla 5100', R.presionTabla(5100), 12.23 + (11.78 - 12.23) * 0.1);

console.log(`hoja exacta: ${n1} celdas; app contra hoja: ${n2}; total ${ok} bien, ${mal} mal`);
console.log(`ejemplo: DA a 5100 ft y 20 °C — hoja ${R.densidadHoja(20, 5100).toFixed(0)} ft; real (aire seco, presión estándar) ${R.densidadReal(R.presionISA_hPa(5100 / 3.28084), 20, 0).toFixed(0)} ft`);
process.exit(mal ? 1 : 0);
