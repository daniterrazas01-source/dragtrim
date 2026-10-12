/* rooster.js — Fórmulas de la calculadora "ROOSTER RACING" de Daniel (hoja de Excel, Hoja1).
 *
 * Dos capas:
 *   Rooster.hoja(celdas)  reproduce la hoja EXACTAMENTE, con sus errores (se prueba celda por celda
 *                         contra la hoja recalculada en LibreOffice: fuente/pruebas/calc.js).
 *   Rooster.predecir, pesoParaET, caballosDesde, densidad*   lo que usa la app: las mismas fórmulas
 *                         con los errores claros corregidos (ver "CORRECCIÓN").
 *
 * Unidades internas (las de la hoja): peso lb, potencia hp, temperatura °C, altitud y DA en pies,
 * presión y boost en psi, velocidad en mph. La interfaz convierte al mostrar.
 * Sin dependencias; queda en window.Rooster y en module.exports (para probar en Node).
 */
(function (root) {
  'use strict';

  const K = {
    ET: 5.825,            // Hale/Huntington: ET 1/4 = 5.825 · (lb/hp)^(1/3)
    MPH: 234,             // Hale/Huntington: MPH 1/4 = 234 · (hp/lb)^(1/3)
    ETxMPH: 1363.05,      // = 5.825 · 234
    TREN: 0.86,           // 14 % de pérdida en la transmisión (motor -> llanta)
    PERDIDA_PIE: 0.03 / 1000, // 3 % de potencia por cada 1000 ft de DA
    SESENTA: 0.145,       // 60 ft típico = 0.145 · ET 1/4 (auto con buena salida)
    ET_14_18: 1.565,      // ET 1/4 = ET 1/8 · 1.565
    V_14_18: 1.27,        // velocidad 1/4 = velocidad 1/8 · 1.27
    MI_KM: 1.60934,
    P_MAR: 14.696,        // psi al nivel del mar
    LB_KG: 2.20462442018378,
  };

  // Tabla AH109:AI141 de la hoja: altitud (ft) -> presión del aire (psi), atmósfera estándar.
  const TABLA_PRESION = [
    [-5000, 17.55], [-4000, 16.95], [-3000, 16.36], [-2000, 15.79], [-1000, 15.24], [-500, 14.96],
    [0, 14.7], [500, 14.43], [1000, 14.17], [1500, 13.92], [2000, 13.66], [2500, 13.42],
    [3000, 13.17], [3500, 12.93], [4000, 12.69], [4500, 12.46], [5000, 12.23], [6000, 11.78],
    [7000, 11.34], [8000, 10.92], [9000, 10.51], [10000, 10.11], [15000, 8.29], [20000, 6.75],
    [25000, 5.45], [30000, 4.36], [35000, 3.46], [40000, 2.72], [45000, 2.14], [50000, 1.68],
    [55000, 1.32], [60000, 1.04], [65000, 0.82],
  ];

  // Tabla N2:O6 de la hoja: pistas y su elevación (ft).
  const PISTAS = [
    { id: 'charco', nombre: 'El Charco', ft: 5600 },
    { id: 'villa', nombre: 'Villa', ft: 5100 },
    { id: 'chihuahua', nombre: 'Chihuahua', ft: 4900 },
    { id: 'caldera', nombre: 'Caldera', ft: 4100 },
    { id: 'monterrey', nombre: 'Monterrey', ft: 1440 },
  ];

  const cbrt = (x) => Math.pow(x, 1 / 3);

  // ------------------------------------------------------------------ piezas de la hoja
  /** C3: densidad de altitud (ft) con temperatura (°C) y altitud de la pista (ft). Incluye el ×1.075 de la hoja. */
  function densidadHoja(tempC, altFt) {
    return (((tempC - (15 - (2 / 1000 * altFt))) * 120) + altFt) * 1.075;
  }
  /** Fracción de potencia que queda a esa DA: 1 − 0.03/1000 · DA. */
  const factorDA = (da) => 1 - K.PERDIDA_PIE * da;
  /** Hale: ET 1/4 (s) y velocidad 1/4 (mph) con peso (lb) y potencia en la llanta (hp). */
  const etHale = (peso, whp) => cbrt((peso / whp) * Math.pow(K.ET, 3));
  const mphHale = (peso, whp) => cbrt((whp / peso) * Math.pow(K.MPH, 3));
  /** F7/J7: 0-60 "de la hoja". v18 entra en la unidad que muestra la hoja (km/h si B1=1) pero se pasa
   *  a m/s con el factor de mph: ese es el error. Con v18 en mph da el tiempo a 60 mph. */
  const cero60 = (et18, v18) => (26.8223 / ((201.1675 - (v18 * 0.447038888888889)) / (0.5 * et18 * et18))) * 0.915;

  /** Interpola la tabla AH:AI (psi a una altitud en ft). */
  function presionTabla(ft) {
    const T = TABLA_PRESION;
    if (!(ft > T[0][0])) return T[0][1];
    for (let i = 1; i < T.length; i++) {
      if (ft <= T[i][0]) {
        const [x0, y0] = T[i - 1], [x1, y1] = T[i];
        return y0 + (y1 - y0) * (ft - x0) / (x1 - x0);
      }
    }
    return T[T.length - 1][1];
  }

  // ------------------------------------------------------------------ densidad del aire real
  /** Presión estándar (hPa) a una altitud (m). */
  const presionISA_hPa = (m) => 1013.25 * Math.pow(1 - 2.25577e-5 * m, 5.25588);
  /**
   * Densidad de altitud real (ft) con presión de la estación (hPa), temperatura (°C) y humedad (%).
   * Densidad del aire seco + vapor; luego la altitud estándar con esa densidad (fórmula del NWS).
   * No lleva el ×1.075 de la hoja.
   */
  function densidadReal(presion_hPa, tempC, humedad) {
    const Tk = tempC + 273.15;
    const es = 6.1078 * Math.pow(10, (7.5 * tempC) / (tempC + 237.3));
    const e = Math.max(0, Math.min(100, humedad || 0)) / 100 * es;
    const rho = ((presion_hPa - e) * 100) / (287.058 * Tk) + (e * 100) / (461.495 * Tk);
    return (44.3308 - 42.2665 * Math.pow(rho, 0.234969)) * 1000 * 3.28084;
  }

  // ------------------------------------------------------------------ lo que usa la app
  /** Una columna de resultados (en esta pista o a nivel del mar) a partir de la potencia en la llanta. */
  function columna(peso, whp) {
    if (!(peso > 0 && whp > 0)) return null;
    const et14 = etHale(peso, whp), v14 = mphHale(peso, whp);
    const et18 = et14 / K.ET_14_18, v18 = v14 / K.V_14_18;
    return {
      whp, et14, v14, et18, v18,
      sesenta: et14 * K.SESENTA,
      cero60: cero60(et18, v18), // CORRECCIÓN: siempre con la velocidad en mph (como la hoja con B1=0)
    };
  }

  /**
   * Potencia en la llanta según el tipo de motor (fórmulas de la hoja).
   *  atmos/nitro: hp·0.86·f + nitro   (filas 1-8; el nitro se suma ya en la llanta, como la hoja)
   *  turbo: (hp + hp/pAmb·boost)·f·0.86   (filas 11-17)
   * CORRECCIÓN: pAmb ya no es 11.34 fijo: es la presión de la tabla de la hoja a la DA del momento
   * (11.34 = 7000 ft, el criterio de la hoja); a nivel del mar 14.696. Así, con boost 0 da igual que atmosférico.
   */
  function whp(p, da) {
    const f = da === null ? 1 : factorDA(da);
    if (p.motor === 'turbo') {
      const pAmb = da === null ? K.P_MAR : presionTabla(da);
      return (p.hp + p.hp / pAmb * (p.boost || 0)) * f * K.TREN;
    }
    return p.hp * K.TREN * f + (p.motor === 'nitro' ? (p.nitro || 0) : 0);
  }

  /**
   * Predicción: {peso (lb), hp (al motor), motor: 'atmos'|'nitro'|'turbo', nitro (hp), boost (psi), da (ft)}
   * -> {pista: columna, mar: columna, rinde (fracción), pAmb (psi, turbo)}
   */
  function predecir(p) {
    return {
      pista: columna(p.peso, whp(p, p.da)),
      mar: columna(p.peso, whp(p, null)),
      rinde: factorDA(p.da),
      pAmb: presionTabla(p.da),
    };
  }

  /** C8: peso (lb) para hacer una ET 1/4 meta con esa potencia y DA. (La hoja: whp·(ET/5.825)^3.) */
  function pesoParaET(p, et14) {
    const w = whp(p, p.da);
    return w > 0 && et14 > 0 ? w * Math.pow(et14 / K.ET, 3) : NaN;
  }

  /**
   * Inverso (filas 20-23): caballos con un tiempo o una velocidad.
   * {peso (lb), da (ft), dato: 'et18'|'v18'|'et14'|'v14', valor (s o mph)}
   * -> {whp: en la llanta ese día, hp: al motor a nivel del mar (B21:B23), et14, v14 equivalentes}
   * CORRECCIÓN: ya no se calcula desde el 60 ft (depende de la salida, no del motor) y se aceptan
   * datos de 1/4 además de 1/8.
   */
  function caballosDesde(p) {
    let v14;
    if (p.dato === 'et18') v14 = K.ETxMPH / (p.valor * K.ET_14_18);
    else if (p.dato === 'v18') v14 = p.valor * K.V_14_18;
    else if (p.dato === 'et14') v14 = K.ETxMPH / p.valor;
    else v14 = p.valor;
    if (!(v14 > 0 && p.peso > 0 && isFinite(v14))) return null;
    const w = p.peso * Math.pow(v14 / K.MPH, 3);
    return { whp: w, hp: w / factorDA(p.da) / K.TREN, et14: K.ETxMPH / v14, v14 };
  }

  // ------------------------------------------------------------------ hoja exacta (para pruebas)
  /** Evalúa la hoja con sus celdas de entrada y devuelve {celda: valor}, igual que Excel/LibreOffice. */
  function hoja(e) {
    const B1 = e.B1, B11 = e.B11, kmh = (v, u) => (u === 1 ? v * 1.60934 : v);
    const C3 = densidadHoja(e.A6, e.A8), f3 = factorDA(C3);
    const colA = (w) => {
      const et = etHale(e.A3, w), v = kmh(mphHale(e.A3, w), B1);
      return { D: et * 0.145, E: et, F: v, G: e.A3 / Math.pow(et / 5.825, 3), E5: et / 1.565, F5: v / 1.27 };
    };
    const d = colA((e.B3 * 0.86) * f3 + (e.C6 || 0)), n = colA((e.B3 * 0.86) + (e.C6 || 0));
    const hb = e.B13 + (e.B13 / 11.34 * (e.A17 || 0)), hbm = e.B13 + (e.B13 / 14.696 * (e.A17 || 0));
    const g14 = hb * factorDA(e.C13) * 0.86, e14 = etHale(e.A13, g14), i14 = etHale(e.A13, hbm * 0.86);
    const f14 = B11 === 1 ? mphHale(e.A13, g14) * 1.60934 : cbrt((g14 / e.A13 + (e.C26 || 0)) * Math.pow(234, 3));
    const o = {
      F2: B1 === 1 ? '1/4 Km/H' : '1/4 MPH', J2: B1 === 1 ? '1/4 Km/H' : '1/4 MPH',
      F13: B11 === 1 ? '1/4 Km/H' : '1/4 MPH',
      C3, D3: d.D, E3: d.E, F3: d.F, G3: d.G, H3: n.D, I3: n.E, J3: n.F, K3: n.G,
      E5: d.E5, F5: d.F5, I5: n.E5, J5: n.F5,
      F7: cero60(d.E5, d.F5), J7: cero60(n.E5, n.F5),
      C8: ((((e.B3 * 0.86) * f3) + (e.C6 || 0)) * Math.pow(e.B8 / 5.825, 3)),
      D14: e14 * 0.145, E14: e14, F14: f14, G14: g14,
      H14: i14 * 0.145, I14: i14, J14: kmh(mphHale(e.A13, hbm * 0.86), B11), K14: hbm * 0.86,
      A15: e.A13 / K.LB_KG,
    };
    const fila = (f, C, D, E) => {
      o['C' + f] = C; o['D' + f] = D; o['E' + f] = E; o['F' + f] = D * 1.565; o['G' + f] = E * 1.27;
      o['B' + f] = (e.A3 * Math.pow((E * 1.27) / 234, 3)) / f3 / 0.86;
    };
    let D = (e.C21 / 0.141) / 1.565; fila(21, e.C21, D, ((1363.05 / D) / 1.565) / 1.27);
    D = e.D22; fila(22, (D * 1.565) * 0.141, D, ((1363.05 / D) / 1.565) / 1.27);
    D = ((1363.05 / e.E23) / 1.565) / 1.27; fila(23, (D * 1.565) * 0.141, D, e.E23);
    return o;
  }

  const api = {
    K, TABLA_PRESION, PISTAS,
    densidadHoja, densidadReal, presionISA_hPa, presionTabla, factorDA, etHale, mphHale, cero60,
    predecir, pesoParaET, caballosDesde, hoja,
  };
  root.Rooster = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
