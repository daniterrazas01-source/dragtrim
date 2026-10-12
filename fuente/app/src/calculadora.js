/* calculadora.js — Pestaña "Calcular": aproximaciones con la hoja Rooster Racing (fórmulas en rooster.js).
 * Condiciones del aire de dos formas: "En la pista (teléfono)" = ubicación + clima del momento
 * (densidad del aire real), o "Altura que yo elija" = pista guardada o altura escrita + temperatura
 * (fórmula de la hoja). Todo se guarda en el teléfono (localStorage 'dragtrim.calc'). */
(function () {
  'use strict';
  const R = window.Rooster;
  const $ = (s) => document.querySelector(s);
  const isFin = Number.isFinite;
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
  };
  const FT_M = 3.28084;

  // Valores iniciales = los de la hoja de Daniel (3100 lb, 420 hp, Villa 5100 ft, 20 °C, meta 15.00 s).
  const DEF = {
    aire: 'manual', pista: 'villa', alt: 5100, temp: 20, daSe: false, da: 7443,
    peso: 3100, pesoU: 'lb', hp: 420, motor: 'atmos', nitro: 100, boost: 8,
    metaD: '4', metaT: 15, invD: '8', invDato: 'v', invVal: null,
    lectura: null, tempTel: 25,
  };
  const C = Object.assign({}, DEF, LS.get('dragtrim.calc', {}));
  const guardar = () => LS.set('dragtrim.calc', C);

  // ------------------------------------------------------------------ formato
  const unidadVel = () => (LS.get('dragtrim.settings', {}).unidad === 'mph' ? 'mph' : 'km/h');
  const deMph = (v) => (unidadVel() === 'mph' ? v : v * R.K.MI_KM);
  const aMph = (v) => (unidadVel() === 'mph' ? v : v / R.K.MI_KM);
  const miles = (x) => (isFin(x) ? Math.round(x).toLocaleString('es-MX') : '—');
  const fx = (x, d) => (isFin(x) ? x.toFixed(d) : '—');
  const num = (el) => { const x = parseFloat(String(el.value).replace(',', '.')); return isFin(x) ? x : NaN; };
  const pesoLb = () => (C.pesoU === 'kg' ? C.peso * R.K.LB_KG : C.peso);
  const fmtPeso = (lb) => {
    if (!isFin(lb)) return '—';
    const kg = lb / R.K.LB_KG;
    return C.pesoU === 'kg' ? `${miles(kg)} kg (${miles(lb)} lb)` : `${miles(lb)} lb (${miles(kg)} kg)`;
  };
  const hace = (t) => {
    const min = Math.round((Date.now() - t) / 60000);
    if (min < 1) return 'hace un momento';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    return h < 24 ? `hace ${h} h ${min % 60} min` : 'hace más de un día';
  };

  // ------------------------------------------------------------------ condiciones del aire
  /** DA vigente (ft) y de dónde sale, o null si falta información. */
  function daActual() {
    if (C.aire === 'manual') {
      if (C.daSe) return isFin(C.da) ? { da: C.da, txt: 'la que escribiste' } : null;
      if (!isFin(C.alt) || !isFin(C.temp)) return null;
      return { da: R.densidadHoja(C.temp, C.alt), txt: `fórmula de tu hoja, ${miles(C.alt)} ft y ${fx(C.temp, 0)} °C` };
    }
    const L = C.lectura;
    if (!L) return null;
    if (L.fuente === 'clima') return { da: R.densidadReal(L.presion, L.temp, L.humedad), txt: 'clima de tu ubicación' };
    if (!isFin(C.tempTel)) return null;
    return { da: R.densidadReal(R.presionISA_hPa(L.alt), C.tempTel, 0), txt: 'altitud del GPS y tu temperatura' };
  }

  function estado(txt, err) { const e = $('#cEstado'); e.textContent = txt || ''; e.classList.toggle('err', !!err); }

  async function tomarAqui() {
    const btn = $('#cBtnAqui');
    if (!('geolocation' in navigator) || !window.isSecureContext) {
      estado('Este navegador no deja leer la ubicación aquí. Abre la app desde su enlace https:// o usa "Altura que yo elija".', true);
      return;
    }
    btn.disabled = true;
    estado('Buscando tu ubicación…');
    let pos;
    try {
      pos = await new Promise((ok, mal) => navigator.geolocation.getCurrentPosition(ok, mal, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }));
    } catch (e) {
      btn.disabled = false;
      estado(e && e.code === 1
        ? 'No hay permiso para usar la ubicación. Actívalo para Drag Trim en los ajustes del teléfono, o usa "Altura que yo elija".'
        : 'No pude obtener tu ubicación. Intenta de nuevo con vista al cielo, o usa "Altura que yo elija".', true);
      return;
    }
    const c = pos.coords;
    const altGps = isFin(c.altitude) && c.altitude !== null ? c.altitude : NaN;
    estado('Consultando el clima de este momento…');
    // Solo se manda la ubicación redondeada (~1 km) al servicio del clima.
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + c.latitude.toFixed(2) + '&longitude=' + c.longitude.toFixed(2) +
      '&current=temperature_2m,relative_humidity_2m,surface_pressure&timezone=auto';
    let clima = null;
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 10000);
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(to);
      const j = await r.json();
      const cur = j && j.current;
      if (r.ok && cur && isFin(cur.temperature_2m) && isFin(cur.surface_pressure) && isFin(cur.relative_humidity_2m)) clima = { cur, elev: j.elevation };
    } catch (e) { clima = null; }
    btn.disabled = false;
    if (clima) {
      C.lectura = {
        t: Date.now(), fuente: 'clima', temp: clima.cur.temperature_2m, presion: clima.cur.surface_pressure,
        humedad: clima.cur.relative_humidity_2m,
        alt: isFin(altGps) ? altGps : clima.elev, altDe: isFin(altGps) ? 'GPS' : 'mapa',
      };
      estado('');
    } else if (isFin(altGps)) {
      C.lectura = { t: Date.now(), fuente: 'gps', alt: altGps, altDe: 'GPS' };
      estado('Sin internet: uso la altitud del GPS y la temperatura que escribas. Sin la presión y la humedad reales es menos exacta.');
    } else {
      estado('No pude consultar el clima y el teléfono no dio la altitud. Revisa la señal o usa "Altura que yo elija".', true);
      return;
    }
    guardar(); pintar();
  }

  function pintarLectura() {
    const L = C.lectura, dl = $('#cLectura');
    $('#cTempTelBox').hidden = !(L && L.fuente === 'gps');
    if (!L) { dl.hidden = true; return; }
    const fila = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
    let h = '';
    if (L.fuente === 'clima') {
      h += fila('Temperatura', `${fx(L.temp, 1)} °C`);
      h += fila('Presión del aire', `${fx(L.presion, 0)} hPa (${fx(L.presion * 0.0145038, 2)} psi)`);
      h += fila('Humedad', `${fx(L.humedad, 0)} %`);
    }
    h += fila(`Altitud (${L.altDe})`, `${miles(L.alt)} m (${miles(L.alt * FT_M)} ft)`);
    const viejo = Date.now() - L.t > 3 * 3600 * 1000;
    h += fila('Tomado', `${new Date(L.t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}, ${hace(L.t)}${viejo ? ' · tómalo de nuevo' : ''}`);
    dl.innerHTML = h; dl.hidden = false;
    dl.classList.toggle('viejo', viejo);
  }

  // ------------------------------------------------------------------ pintar todo
  function pintar() {
    // selectores
    for (const [id, key] of [['segCAire', 'aire'], ['segCPesoU', 'pesoU'], ['segCMotor', 'motor'], ['segCMetaD', 'metaD'], ['segCInvD', 'invD'], ['segCInvDato', 'invDato']]) {
      document.getElementById(id).querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === C[key])));
    }
    $('#cTel').hidden = C.aire !== 'tel';
    $('#cMan').hidden = C.aire !== 'manual';
    $('#cPista').value = R.PISTAS.some((p) => p.id === C.pista) ? C.pista : 'otra';
    $('#cAltM').textContent = isFin(C.alt) ? `≈ ${miles(C.alt / FT_M)} m sobre el nivel del mar` : '';
    $('#cTempBox').hidden = C.daSe;
    $('#cDaBox').hidden = !C.daSe;
    $('#cNitroBox').hidden = C.motor !== 'nitro';
    $('#cBoostBox').hidden = C.motor !== 'turbo';
    $('#cPesoOtro').textContent = isFin(C.peso) && C.peso > 0
      ? (C.pesoU === 'kg' ? `= ${miles(C.peso * R.K.LB_KG)} lb` : `= ${miles(C.peso / R.K.LB_KG)} kg`) : '';
    pintarLectura();

    const D = daActual();
    const daRes = $('#cDaRes');
    const auto = { peso: pesoLb(), hp: C.hp, motor: C.motor, nitro: C.nitro, boost: C.boost, da: D ? D.da : NaN };
    if (!D) {
      daRes.innerHTML = C.aire === 'tel' && !C.lectura ? 'Toca <b>Tomar condiciones de aquí</b> para calcular la densidad del aire.' : 'Faltan datos para calcular la densidad del aire.';
    } else {
      daRes.innerHTML = `Densidad del aire (DA) <b>≈ ${miles(D.da)} ft</b> · tu motor rinde <b>≈ ${fx(R.factorDA(D.da) * 100, 0)} %</b><small>${D.txt}</small>`;
    }
    $('#cPAmb').textContent = D ? `Presión del aire que usa la hoja para el turbo: ${fx(R.presionTabla(D.da), 2)} psi (a nivel del mar 14.70).` : '';

    // resultados
    const r = D && auto.peso > 0 && auto.hp > 0 ? R.predecir(auto) : null;
    const u = unidadVel();
    $('#cColPista').textContent = D ? `DA ${miles(D.da)} ft` : '';
    const filas = [
      ['1/4 tiempo', (c) => `${fx(c.et14, 2)} s`],
      [`1/4 velocidad`, (c) => `${fx(deMph(c.v14), 1)} ${u}`],
      ['1/8 tiempo', (c) => `${fx(c.et18, 2)} s`],
      ['1/8 velocidad', (c) => `${fx(deMph(c.v18), 1)} ${u}`],
      ['60 ft típico', (c) => `${fx(c.sesenta, 2)} s`],
      ['0–60 mph', (c) => `${fx(c.cero60, 2)} s`],
      ['Caballos en la llanta', (c) => `${miles(c.whp)} hp`],
    ];
    const celda = (c, f) => (c && isFin(c.et14) ? '≈ ' + f(c) : '—');
    $('#cTabla').innerHTML = filas.map(([k, f], i) =>
      `<tr${i === 0 ? ' class="et"' : ''}><th scope="row">${k}</th><td>${celda(r && r.pista, f)}</td><td>${celda(r && r.mar, f)}</td></tr>`).join('');

    // peso para un tiempo meta
    const metaRes = $('#cMetaRes');
    if (r && isFin(C.metaT) && C.metaT > 0) {
      const et14 = C.metaD === '8' ? C.metaT * R.K.ET_14_18 : C.metaT;
      const lb = R.pesoParaET(auto, et14), dif = lb - auto.peso;
      const difTxt = Math.abs(dif) < 1 ? 'igual que ahora' : `${miles(Math.abs(C.pesoU === 'kg' ? dif / R.K.LB_KG : dif))} ${C.pesoU} ${dif > 0 ? 'más' : 'menos'} que ahora`;
      metaRes.innerHTML = `Deberías pesar <b>≈ ${fmtPeso(lb)}</b><small>${difTxt}</small>`;
    } else metaRes.textContent = '—';

    // caballos con tu tiempo
    const esV = C.invDato === 'v';
    $('#cInvU').textContent = esV ? u : 's';
    $('#cInvLab').textContent = `${esV ? 'Velocidad' : 'Tiempo'} de ${C.invD === '8' ? '1/8' : '1/4'}`;
    const invRes = $('#cInvRes');
    if (D && isFin(C.invVal) && C.invVal > 0 && auto.peso > 0) {
      const dato = (esV ? 'v' : 'et') + (C.invD === '8' ? '18' : '14');
      const x = R.caballosDesde({ peso: auto.peso, da: D.da, dato, valor: esV ? aMph(C.invVal) : C.invVal });
      invRes.innerHTML = x
        ? `<b>≈ ${miles(x.hp)} hp</b> del motor, a nivel del mar<small>≈ ${miles(x.whp)} hp en la llanta con estas condiciones</small>`
        : '—';
    } else invRes.textContent = '—';
  }

  // ------------------------------------------------------------------ controles
  function seg(id, key, extra) {
    document.getElementById(id).querySelectorAll('button').forEach((b) => {
      b.onclick = () => { if (extra) extra(b.dataset.v); C[key] = b.dataset.v; guardar(); pintar(); };
    });
  }
  function campo(id, key, despues) {
    const el = document.getElementById(id);
    el.value = isFin(C[key]) ? C[key] : '';
    el.addEventListener('input', () => { C[key] = num(el); if (despues) despues(); guardar(); pintar(); });
  }

  const selP = $('#cPista');
  selP.innerHTML = R.PISTAS.map((p) => `<option value="${p.id}">${p.nombre} · ${p.ft.toLocaleString('es-MX')} ft</option>`).join('') +
    '<option value="otra">Otra altura</option>';
  selP.onchange = () => {
    C.pista = selP.value;
    const p = R.PISTAS.find((x) => x.id === C.pista);
    if (p) { C.alt = p.ft; $('#cAlt').value = p.ft; }
    else $('#cAlt').focus();
    guardar(); pintar();
  };
  seg('segCAire', 'aire');
  seg('segCMotor', 'motor');
  seg('segCMetaD', 'metaD');
  seg('segCInvD', 'invD');
  seg('segCInvDato', 'invDato', (v) => {
    if (v !== C.invDato) { C.invVal = null; $('#cInvVal').value = ''; }
  });
  seg('segCPesoU', 'pesoU', (v) => {
    // Al cambiar de unidad el peso sigue siendo el mismo: se convierte el número.
    if (v !== C.pesoU && isFin(C.peso)) {
      C.peso = Math.round(v === 'kg' ? C.peso / R.K.LB_KG : C.peso * R.K.LB_KG);
      $('#cPeso').value = C.peso;
    }
  });
  campo('cAlt', 'alt', () => {
    const p = R.PISTAS.find((x) => x.ft === C.alt);
    C.pista = p ? p.id : 'otra';
  });
  campo('cTemp', 'temp');
  campo('cDa', 'da');
  campo('cTempTel', 'tempTel');
  campo('cPeso', 'peso');
  campo('cHp', 'hp');
  campo('cNitro', 'nitro');
  campo('cBoost', 'boost');
  campo('cMetaT', 'metaT');
  campo('cInvVal', 'invVal');
  const daSe = $('#cDaSe');
  daSe.checked = !!C.daSe;
  daSe.onchange = () => {
    C.daSe = daSe.checked;
    if (C.daSe && isFin(C.alt) && isFin(C.temp) && !isFin(C.da)) { C.da = Math.round(R.densidadHoja(C.temp, C.alt)); $('#cDa').value = C.da; }
    guardar(); pintar();
  };
  $('#cBtnAqui').onclick = tomarAqui;

  // Al entrar a la pestaña se repinta (la unidad de velocidad pudo cambiar en Ajustes; "hace X min").
  const tab = document.querySelector('.tabs button[data-view="vCalc"]');
  if (tab) tab.addEventListener('click', pintar);
  pintar();
  window.__calc = { C, pintar, daActual };   // para pruebas
})();
