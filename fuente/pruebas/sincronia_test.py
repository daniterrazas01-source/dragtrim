# ¿Las dos verdes del Race 1 vs 1 salen al mismo tiempo aunque la señal esté mala? (1 nov 2026, Daniel: "que aunque esté
# baja la señal, ambos celulares suelten el semáforo al mismo tiempo… que en alguna situación algún celular salga antes")
#
# Dos teléfonos (Chromium) por la sala local (sala_local.mjs), cada uno a través de red_mala.mjs, que retrasa sus
# mensajes como una red celular (retraso, variación, picos, cortes). Por cada carrera se mide, con el reloj de esta
# computadora (el mismo para los dos), cuándo programó cada teléfono su verde y cuándo la pintó, y qué cota mostró la app
# ("Sala XXXXX · ±N ms"). Escenarios: Wi-Fi bueno, 4G, señal baja, uno bien y otro mal, señal muy mala, señal desigual
# (el peor caso para sincronizar relojes) y cortes totales de señal justo en el momento de la salida.
# Uso: python3 sincronia_test.py [rondas_por_escenario] [cortes] -> capturas/sincronia.json; sale con código 1 si algo falla.
import json, os, re, statistics, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright
from carrera_test import contexto, pagina, esperar, chk, fallas, SH, DIST, ARGS_MEDIOS

AQUI = os.path.dirname(os.path.abspath(__file__))
PWEB, PSALA, PCTL, PA, PB = 8781, 8782, 8783, 8784, 8785
URL = f'http://localhost:{PWEB}/index.html'
EN_SALA = "!document.getElementById('rcSala').hidden && !document.getElementById('rc').hidden"
CONECTADOS = "/^Sala [A-Z0-9]{5} · ±/.test(document.getElementById('rcChip').textContent)"
RONDAS = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 5
SOLO_CORTES = 'cortes' in sys.argv[1:]   # solo los cortes de señal en la salida

P = lambda base, var=0, picos=0, pico=(0, 0): {'base': base, 'var': var, 'picos': picos, 'pico': list(pico)}
PERFILES = {
    'wifi':     {'subida': P(6, 4), 'bajada': P(6, 4)},
    '4g':       {'subida': P(30, 15, .02, (100, 300)), 'bajada': P(25, 12, .02, (80, 250))},
    'baja':     {'subida': P(90, 70, .06, (300, 1200)), 'bajada': P(70, 50, .05, (200, 900))},
    'muy_mala': {'subida': P(250, 200, .10, (600, 2500)), 'bajada': P(180, 150, .08, (500, 2000))},
    'asim_sube': {'subida': P(140, 10), 'bajada': P(15, 5)},   # la subida muy lenta y la bajada rápida (señal débil)
    'asim_baja': {'subida': P(15, 5), 'bajada': P(140, 10)},   # al revés
}
ESCENARIOS = [
    ('Los dos con Wi-Fi bueno', 'wifi', 'wifi'),
    ('Los dos con 4G normal', '4g', '4g'),
    ('Los dos con señal baja', 'baja', 'baja'),
    ('Uno con Wi-Fi y el otro con señal baja', 'wifi', 'baja'),
    ('Los dos con señal muy mala', 'muy_mala', 'muy_mala'),
    ('Señal desigual: a uno le sube lento y al otro le baja lento (peor caso)', 'asim_sube', 'asim_baja'),
]

def ctl(ruta, datos=None):
    req = urllib.request.Request(f'http://127.0.0.1:{PCTL}{ruta}', data=json.dumps(datos).encode() if datos is not None else None, method='POST' if datos is not None else 'GET')
    return json.loads(urllib.request.urlopen(req).read() or b'{}')

def perfil(puerto, nombre): ctl(f'/perfil/{puerto}', PERFILES[nombre])

LUCES = """() => { if (window.__luz) return; window.__luz = [];
  new MutationObserver((ms) => { for (const m of ms) { const e = m.target;
      if (!e.id || !/^rc_izq_(pre1|a0|g)$/.test(e.id)) continue;
      const on = e.classList.contains('on'); if (on === !!e.__on) continue; e.__on = on;
      if (on) window.__luz.push({ id: e.id.slice(7), t: performance.now(), ronda: window.__carrera.R.ronda }); } })
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); }"""
# reloj de la página → reloj de esta computadora: performance.timeOrigin + t − cal
CAL = "(() => { let s = 0; for (let i = 0; i < 20; i++) s += performance.timeOrigin + performance.now() - Date.now(); return s / 20; })()"
ERR = "window.__carrera.R.E && window.__carrera.R.E.aOtro(performance.now()) - Date.now()"   # la sala usa Date.now() de aquí
DATOS = """(k) => { const R = window.__carrera.R; const L = (window.__luz || []).filter((x) => x.ronda === k);
  const prog = L.some((x) => x.id === 'pre1') && R.prog ? { tVerde: R.prog.tVerde, tArbol: R.prog.tArbol } : null;
  return { fase: R.fase, ronda: R.ronda, prog, tVerde: R.ronda === k ? R.tVerde : null, luces: L, origin: performance.timeOrigin,
           msg: document.getElementById('rcMsg').textContent }; }"""

def emparejar(A, B):
    for pg in (A, B):
        pg.evaluate("window.__carrera.R.fase !== 'cerrado' && window.__carrera.terminar()")
        pg.wait_for_timeout(300)
    for intento in range(3):
        A.click('#atRace'); A.click('#rcCrearSala')
        if not esperar(A, "/^[A-HJ-NP-Z2-9]{5}$/.test(document.getElementById('rcCodigoTxt').textContent)", 30000):
            A.evaluate("window.__carrera.terminar()"); continue
        cod = A.inner_text('#rcCodigoTxt').strip()
        B.click('#atRace'); B.click('#rcUnirSala'); B.wait_for_timeout(200)
        B.fill('#rcCodIn', ''); B.type('#rcCodIn', cod, delay=40)
        if esperar(A, CONECTADOS, 40000) and esperar(B, EN_SALA, 20000):
            return cod
        for pg in (A, B): pg.evaluate("window.__carrera.R.fase !== 'cerrado' && window.__carrera.terminar()")
    return None

def a_la_sala(A, B):
    for pg in (A, B):
        pg.evaluate("(() => { const R = window.__carrera.R; if (R.E && R.fase !== 'sala') window.DragCarrera.volver(); })()")
    return esperar(A, EN_SALA, 10000) and esperar(B, EN_SALA, 10000)

def una_carrera(A, B, cal, preparar=None):
    """Los dos tocan Listo; devuelve qué pasó en cada teléfono con esa salida."""
    if not (esperar(A, CONECTADOS, 40000) and esperar(B, CONECTADOS, 40000)):
        return {'resultado': 'sin_conexion'}
    chipA = A.inner_text('#rcChip')
    m = re.search(r'±(\d+)', chipA)
    cota = int(m.group(1)) if m else None
    eA, eB = A.evaluate(ERR), B.evaluate(ERR)
    rtt = [pg.evaluate("window.__carrera.R.E.reloj.rtt_ms") for pg in (A, B)]
    r0 = A.evaluate('window.__carrera.R.ronda')
    for pg in (A, B): pg.evaluate('window.__luz = []')   # solo las luces de esta carrera
    if preparar: preparar()
    A.click('#rcListo'); B.click('#rcListo')
    if not esperar(A, f"window.__carrera.R.ronda > {r0}", 30000):
        return {'resultado': 'no_empezo'}
    k = A.evaluate('window.__carrera.R.ronda')
    esperar(A, "window.__carrera.R.fase !== 'arbol'", 20000)
    A.wait_for_timeout(2500)   # que al otro le dé tiempo de recibir lo que vaya a recibir
    esperar(B, "window.__carrera.R.fase !== 'arbol'", 20000)
    dA, dB = A.evaluate(DATOS, k), B.evaluate(DATOS, k)
    verA = any(x['id'] == 'g' for x in dA['luces']); verB = any(x['id'] == 'g' for x in dB['luces'])
    ambA = any(x['id'] == 'a0' for x in dA['luces']); ambB = any(x['id'] == 'a0' for x in dB['luces'])
    r = {'ronda': k, 'cota_ms': cota, 'err_reloj_ms': [eA, eB], 'rtt_min_ms': rtt, 'mensajes': [dA['msg'], dB['msg']],
         'arbol': [ambA, ambB], 'verde': [verA, verB]}
    if verA and verB:
        r['resultado'] = 'los_dos'
        reloj = lambda d, t, c: d['origin'] + t - c
        r['dif_programada_ms'] = reloj(dA, dA['prog']['tVerde'], cal[0]) - reloj(dB, dB['prog']['tVerde'], cal[1])
        gA = next(x['t'] for x in dA['luces'] if x['id'] == 'g'); gB = next(x['t'] for x in dB['luces'] if x['id'] == 'g')
        r['dif_pintada_ms'] = reloj(dA, gA, cal[0]) - reloj(dB, gB, cal[1])   # cuando cada uno prendió la verde en pantalla
        r['dif_esperada_ms'] = eB - eA
    elif not (ambA or ambB or verA or verB):
        r['resultado'] = 'cancelada'
    else:
        r['resultado'] = 'solo_uno'
    a_la_sala(A, B)
    return r

def resumen(nombre, rs):
    juntas = [r for r in rs if r['resultado'] == 'los_dos']
    difs = [abs(r['dif_programada_ms']) for r in juntas]
    pint = [abs(r['dif_pintada_ms']) for r in juntas]
    cotas = [r['cota_ms'] for r in juntas if r['cota_ms'] is not None]
    print(f'\n== {nombre}')
    for r in rs:
        if r['resultado'] == 'los_dos':
            print(f"   ronda {r['ronda']}: verdes separadas {r['dif_programada_ms']:+6.1f} ms (pintadas {r['dif_pintada_ms']:+6.1f}); "
                  f"la app decía ±{r['cota_ms']} ms; rtt mínimo {r['rtt_min_ms'][0]:.0f}/{r['rtt_min_ms'][1]:.0f} ms")
        else:
            print(f"   ronda {r.get('ronda', '?')}: {r['resultado']}  árbol {r.get('arbol')}  verde {r.get('verde')}  {r.get('mensajes', '')}")
    if difs:
        print(f'   → {len(juntas)}/{len(rs)} con los dos árboles; diferencia típica {statistics.median(difs):.1f} ms, la mayor {max(difs):.1f} ms '
              f'(pintadas: {statistics.median(pint):.1f} / {max(pint):.1f} ms); la app mostraba ±{min(cotas)}–{max(cotas)} ms')
    return {'escenario': nombre, 'rondas': rs}

def main():
    web = subprocess.Popen([sys.executable, '-m', 'http.server', str(PWEB), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    sala = subprocess.Popen(['node', os.path.join(AQUI, 'sala_local.mjs'), str(PSALA)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    red = subprocess.Popen(['node', os.path.join(AQUI, 'red_mala.mjs'), str(PCTL), str(PSALA), str(PA), str(PB)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    salida = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(args=ARGS_MEDIOS)
            cA, cB = contexto(b), contexto(b)
            A, eA = pagina(cA, URL + f'?simsens&sala=ws://localhost:{PA}')
            B, eB = pagina(cB, URL + f'?simsens&sala=ws://localhost:{PB}')
            for pg in (A, B):
                pg.on('dialog', lambda d: d.accept()); pg.evaluate(LUCES)
                pg.evaluate('window.__carreraRT = 0.150')
            cal = [A.evaluate(CAL), B.evaluate(CAL)]

            # ---------------- señal de todo tipo: ¿las dos verdes juntas? ¿alguien corre solo?
            for nombre, pa, pb in ([] if SOLO_CORTES else ESCENARIOS):
                perfil(PA, pa); perfil(PB, pb)
                cod = emparejar(A, B)
                if not cod:
                    chk(False, f'{nombre}: no se pudieron conectar los dos teléfonos'); continue
                A.wait_for_timeout(10000)   # unos segundos en la sala antes de la primera salida (se van sincronizando)
                rs = [una_carrera(A, B, cal) for _ in range(RONDAS)]
                salida.append(resumen(nombre, rs))
                juntas = [r for r in rs if r['resultado'] == 'los_dos']
                chk(not any(r['resultado'] == 'solo_uno' for r in rs), f'{nombre}: nunca baja el árbol en un teléfono y en el otro no')
                fuera = [r for r in juntas if r['cota_ms'] is not None and abs(r['dif_programada_ms']) > r['cota_ms'] + 2]
                chk(not fuera, f'{nombre}: la diferencia entre las verdes nunca pasa de lo que la app dice (±N ms) '
                               f'({[round(r["dif_programada_ms"], 1) for r in fuera]})')
            A.screenshot(path=SH + 'sincronia_sala.png')

            # ---------------- cortes totales de señal justo en la salida (Wi-Fi bueno lo demás)
            perfil(PA, 'wifi'); perfil(PB, 'wifi')
            cod = emparejar(A, B); A.wait_for_timeout(6000)
            CORTES = [
                ('Corte de 1.5 s del invitado justo al recibir la salida', PB, [PB], 1500),
                ('Corte de 6 s del invitado justo al recibir la salida', PB, [PB], 6000),
                ('Corte de 6 s del anfitrión justo cuando la salida llega al invitado', PB, [PA], 6000),
                ('Corte de 6 s de los dos justo cuando la salida llega al invitado', PB, [PA, PB], 6000),
            ]
            for nombre, en, cortar, ms in CORTES:
                rs = [una_carrera(A, B, cal, preparar=lambda: ctl(f'/trampa/{en}', {'texto': '"tipo":"salida"', 'cortar': cortar, 'ms': ms}))]
                salida.append(resumen(nombre, rs))
                chk(rs[0]['resultado'] in ('los_dos', 'cancelada'), f'{nombre}: o salen los dos o ninguno ({rs[0]["resultado"]}, árbol {rs[0].get("arbol")}, verde {rs[0].get("verde")})')
                esperar(A, CONECTADOS, 40000); esperar(B, CONECTADOS, 40000); A.wait_for_timeout(1500)
            B.screenshot(path=SH + 'sincronia_corte.png')
            todos = [e for e in eA + eB if 'WebSocket connection to' not in e]
            chk(not todos, 'sin errores: ' + '; '.join(todos[:5]))
            b.close()
    finally:
        web.terminate(); sala.terminate(); red.terminate()
    with open(SH + 'sincronia.json', 'w', encoding='utf-8') as f: json.dump(salida, f, ensure_ascii=False, indent=1)
    print('\nFALLAS:', len(fallas))
    for f in fallas: print('  -', f)
    sys.exit(1 if fallas else 0)

if __name__ == '__main__':
    main()
