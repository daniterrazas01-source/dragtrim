# La app con el teléfono acostado (0.7.2, Daniel: "en el soporte para celulares la mayor parte de las veces lo ponemos de
# forma horizontal"), en Chromium con tres pantallas: iPhone 15 Pro de lado (852×393, isla a un lado: zonas seguras 59 a
# los lados y 21 abajo), Samsung S24 Ultra de lado (915×412), un teléfono chico (iPhone SE, 667×375) y el Galaxy S25 de
# lado con la barra de arriba (780×336).
#  A. Medir: riel a la izquierda (logo, indicadores y pestañas), nada se sale de lado ni queda bajo la isla, y la distancia,
#     los sensores, el botón y los atajos caben sin desplazarse; "Antes de la pista" ocupa el lado derecho.
#  B. Midiendo (corrida simulada): título, velocidad y "Cancelar" a la vista; el resultado con la boleta a la izquierda.
#  C. Race 1 vs 1 (rival simulado): inicio con sus tres botones, sala con "Listo" a la vista, el árbol completo y centrado
#     con su "Stage", y la boleta de los dos carriles con "Otra carrera" a la vista.
#  D. Práctica solo y 1 vs 1: el árbol completo y las zonas para los pulgares a los lados.
#  E. Calcular, Historial, Ajustes y la pantalla de carga: nada se sale.
#  F. En vertical no cambia: pestañas abajo, encabezado arriba; y el manifiesto deja girar (orientation any).
#  G. Ajustes → Orientación (Daniel): "No girar" (la de inicio) deja la app derecha respecto al teléfono aunque esté de
#     lado (girada al revés, hacia los dos lados), se toca y se desplaza; "Solo Medir" acuesta Medir y Race 1 vs 1 pero
#     no Práctica ni Ajustes; "Toda la app" acuesta todo (A–E corren así).
# Uso: python3 horizontal_test.py -> capturas/horizontal_*.png; sale con código 1 si algo falla.
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
DIST = os.environ.get('DIST_DRAG') or os.path.join(AQUI, '..', 'app', 'dist')
SH = os.path.join(AQUI, 'capturas', '')
os.makedirs(SH, exist_ok=True)
PUERTO = 8786
URL = f'http://localhost:{PUERTO}/index.html'
AJUSTES = {'fondo': 'gallos', 'tema': 'dark', 'rollout_ft': 1, 'orientacion': 'todo'}
PANTALLAS = [   # nombre, ancho, alto, zonas seguras (izq, der, abajo)
    ('iphone', 852, 393, (59, 59, 21)),
    ('s24', 915, 412, (0, 0, 0)),
    ('chico', 667, 375, (0, 0, 0)),
    ('s25', 780, 336, (0, 0, 0)),     # Galaxy S25 de lado con la barra de arriba (360×780 en vertical)
]

fallas = []
def chk(cond, txt):
    print(('ok    ' if cond else 'FALLA ') + txt, flush=True)
    if not cond: fallas.append(txt)

def pagina(b, w, h, ins, url=URL, ajustes=None):
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme='dark')
    ctx.add_init_script(f"localStorage.setItem('dragtrim.settings', JSON.stringify({json.dumps(ajustes or AJUSTES)})); localStorage.setItem('dragtrim.guiaOculta', 'true');")
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    l, r, ab = ins
    ctx.new_cdp_session(pg).send('Emulation.setSafeAreaInsetsOverride', {'insets': {'top': 0, 'topMax': 0, 'bottom': ab, 'bottomMax': ab, 'left': l, 'leftMax': l, 'right': r, 'rightMax': r}})
    pg.goto(url); pg.wait_for_timeout(500)
    return ctx, pg, errs

# ¿Se ve completo, sin desplazarse, dentro de la pantalla y fuera de las zonas seguras?
JS_VISIBLE = """([sels, l, r, ab]) => sels.map((s) => { const e = document.querySelector(s);
    if (!e || e.hidden || !e.getClientRects().length) return s + ': no está';
    const b = e.getBoundingClientRect(), W = innerWidth, H = innerHeight;
    return (b.left >= l - 0.5 && b.right <= W - r + 0.5 && b.top >= -0.5 && b.bottom <= H - ab + 0.5) ? '' :
      `${s}: [${Math.round(b.left)}, ${Math.round(b.top)}, ${Math.round(b.right)}, ${Math.round(b.bottom)}] fuera de [${l}, 0, ${W - r}, ${H - ab}]`; }).filter(Boolean)"""
def a_la_vista(pg, sels, ins):
    return pg.evaluate(JS_VISIBLE, [sels, ins[0], ins[1], ins[2]])
def sin_salirse(pg):
    return pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
def rect(pg, sel):
    return pg.evaluate(f"(() => {{ const b = document.querySelector('{sel}').getBoundingClientRect(); return {{ l: b.left, t: b.top, r: b.right, b: b.bottom }}; }})()")

def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PUERTO), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.7)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            for nombre, w, h, ins in PANTALLAS:
                n = f'[{nombre} {w}×{h}]'
                # ---------------- A. Medir
                ctx, pg, errs = pagina(b, w, h, ins)
                pg.on('dialog', lambda d: d.accept())
                riel = pg.evaluate("""(() => { const t = document.querySelector('.tabs').getBoundingClientRect(), m = document.querySelector('main').getBoundingClientRect();
                    return { tabsAncho: t.width, tabsAlto: t.height, tabsIzq: t.left, mainIzq: m.left }; })()""")
                chk(riel['tabsAlto'] > h * 0.8 and riel['tabsAncho'] < 200 and riel['mainIzq'] >= riel['tabsAncho'] - 1,
                    f'A. {n} las pestañas van en un riel a la izquierda y el contenido a su lado ({riel})')
                fuera = a_la_vista(pg, ['.brand .logo', '#chipGps', '.tabs button[data-view="vMedir"]', '.tabs button[data-view="vAjustes"]'], (0, ins[1], ins[2]))
                chk(not fuera, f'A. {n} logo, indicadores y las 5 pestañas a la vista ' + '; '.join(fuera))
                chk(pg.evaluate(f"document.querySelector('.tabs button').getBoundingClientRect().left >= {ins[0]} - 0.5"), f'A. {n} las pestañas no quedan bajo la isla')
                fuera = a_la_vista(pg, ['#segDist', '.status', '#btnSensores', '#btnDemo', '#atRace', '#atAntes'], ins)
                chk(not fuera, f'A. {n} Medir: distancia, sensores, el botón y los atajos caben sin desplazarse ' + '; '.join(fuera))
                chk(sin_salirse(pg), f'A. {n} nada se sale de lado')
                pg.screenshot(path=SH + f'horizontal_{nombre}_medir.png')
                pg.click('#atAntes'); pg.wait_for_timeout(350)
                fuera = a_la_vista(pg, ['#antesPista', '#atAntes'], ins)
                chk(not fuera and pg.evaluate("document.getElementById('btnSensores').offsetParent === null"),
                    f'A. {n} "Antes de la pista" ocupa el lado derecho ' + '; '.join(fuera))
                pg.click('#atAntes'); pg.wait_for_timeout(200)
                chk(pg.evaluate("document.getElementById('btnSensores').offsetParent !== null"), f'A. {n} al cerrarlo vuelven la distancia y el botón')
                # ---------------- B. Midiendo y resultado
                pg.click('#btnDemo'); pg.wait_for_timeout(1500)
                fuera = a_la_vista(pg, ['#sesTitulo', '#liveMain', '#btnCancelar'], ins)
                chk(not fuera, f'B. {n} midiendo: título, velocidad y "Cancelar" a la vista ' + '; '.join(fuera))
                pg.screenshot(path=SH + f'horizontal_{nombre}_midiendo.png')
                pg.wait_for_function("!document.getElementById('vResultado').hidden", timeout=60000); pg.wait_for_timeout(1200)
                s, k = rect(pg, '#vResultado > .slip'), rect(pg, '#vResultado > .kpis')
                chk(s['r'] <= k['l'] + 1 and k['t'] < s['b'] and s['t'] < h, f'B. {n} resultado: la boleta a la izquierda y los datos a su lado')
                chk(sin_salirse(pg), f'B. {n} el resultado no se sale de lado')
                pg.screenshot(path=SH + f'horizontal_{nombre}_resultado.png')
                chk(not errs, f'A–B. {n} sin errores: ' + '; '.join(errs))
                ctx.close()
                # ---------------- C. Race 1 vs 1
                ctx, pg, errs = pagina(b, w, h, ins)
                pg.on('dialog', lambda d: d.accept())
                pg.click('#atRace'); pg.wait_for_timeout(300)
                fuera = a_la_vista(pg, ['#rcSalir', '#rcCrearSala', '#rcUnirSala', '#rcSimulado'], ins)
                chk(not fuera, f'C. {n} inicio: "Crear sala", "Unirme con código" y "Rival simulado" a la vista ' + '; '.join(fuera))
                chk(sin_salirse(pg) and pg.evaluate("document.getElementById('rc').scrollWidth <= document.getElementById('rc').clientWidth + 1"), f'C. {n} el inicio no se sale de lado')
                pg.screenshot(path=SH + f'horizontal_{nombre}_race_inicio.png')
                pg.click('#rcSimulado')
                pg.wait_for_function("document.querySelector('#rcCarril_der .rc-est').textContent.includes('Listo')", timeout=5000)
                fuera = a_la_vista(pg, ['#rcCarril_izq', '#rcCarril_der', '#rcListo', '#segRcArbol'], ins)
                chk(not fuera, f'C. {n} sala: los dos carriles, el árbol y "Listo" a la vista ' + '; '.join(fuera))
                pg.screenshot(path=SH + f'horizontal_{nombre}_race_sala.png')
                pg.evaluate("window.__carreraRT = 0.2; window.__rivalRT = 0.25")
                pg.click('#rcListo')
                pg.wait_for_function("!document.getElementById('rcArbol').hidden && /Stage/.test(document.getElementById('rcFase').textContent) && document.getElementById('rcFase').textContent === 'Stage'", timeout=8000)
                focos = a_la_vista(pg, ['#rc_izq_pre1', '#rc_izq_r', '#rc_der_pre2', '#rc_der_r', '#rcQuien_izq', '#rcSalir'], ins)
                f, t = rect(pg, '#rcFase'), rect(pg, '#rcArbol .pt-tree')
                centrado = abs((f['l'] + f['r']) / 2 - (t['l'] + t['r']) / 2)
                chk(not focos and centrado < 12, f'C. {n} árbol completo a la vista y "Stage" centrado sobre él (desfase {centrado:.0f} px) ' + '; '.join(focos))
                pg.screenshot(path=SH + f'horizontal_{nombre}_race_arbol.png')
                pg.wait_for_function("!!document.querySelector('.rc-slip') && !document.querySelector('.rc-ganador').classList.contains('espera')", timeout=60000)
                pg.wait_for_timeout(1300)
                s, g = rect(pg, '.rc-res > .slip'), rect(pg, '.rc-res > .rc-ganador')
                fuera = a_la_vista(pg, ['#rcOtra', '.rc-res > .rc-ganador'], ins)
                chk(s['r'] <= g['l'] + 1 and not fuera, f'C. {n} boleta de los dos carriles a la izquierda; quién ganó y "Otra carrera" a la vista ' + '; '.join(fuera))
                chk(sin_salirse(pg), f'C. {n} la boleta no se sale de lado')
                # el texto más largo que puede salir ("muy cerrada"): "Otra carrera" sigue a la vista
                pg.evaluate("(() => { const g = document.querySelector('.rc-res > .rc-ganador'); g.classList.add('dudosa'); g.textContent = 'Gana carril derecho por 0.053 s. Muy cerrada: la diferencia es menor que el margen de error de la app.'; })()")
                fuera = a_la_vista(pg, ['#rcOtra'], ins)
                chk(not fuera, f'C. {n} con el aviso de "muy cerrada", "Otra carrera" sigue a la vista ' + '; '.join(fuera))
                pg.screenshot(path=SH + f'horizontal_{nombre}_race_boleta.png')
                pg.click('#rcSalirRes'); pg.wait_for_timeout(300)
                chk(not errs, f'C. {n} sin errores: ' + '; '.join(errs))
                # ---------------- D. Práctica
                pg.click('.tabs button[data-view="vPractica"]'); pg.wait_for_timeout(300)
                for modo, boton in (('solo', 1), ('1 vs 1', 2)):
                    pg.click(f'#segPModo button:nth-child({boton})'); pg.click('#btnPractica'); pg.wait_for_timeout(600)
                    lados = ['l'] if modo == 'solo' else ['l', 'r']
                    fuera = a_la_vista(pg, [f'#pt_{x}_pre1' for x in lados] + ['#ptCerrar'] + [f'#ptZona_{x}' for x in lados], ins)
                    arbol, zl = rect(pg, '.pt-tree'), rect(pg, '#ptZona_l')
                    if modo == 'solo': lado_ok = zl['l'] >= arbol['r'] - 1
                    else:
                        zr = rect(pg, '#ptZona_r'); lado_ok = zl['r'] <= arbol['l'] + 1 and zr['l'] >= arbol['r'] - 1
                    alto_ok = zl['b'] - zl['t'] >= 150
                    focos_ok = pg.evaluate(f"[...document.querySelectorAll('.pt-tree .pb')].filter(e => e.offsetParent).every(e => {{ const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight - {ins[2]} + 0.5; }})")
                    chk(not fuera and lado_ok and alto_ok and focos_ok, f'D. {n} Práctica {modo}: el árbol completo y las zonas para los pulgares a los lados ' + '; '.join(fuera))
                    pg.screenshot(path=SH + f'horizontal_{nombre}_practica_{modo.replace(" ", "")}.png')
                    pg.click('#ptCerrar'); pg.wait_for_timeout(300)
                # ---------------- E. Calcular, Historial, Ajustes
                for v in ('vCalc', 'vHistorial', 'vAjustes'):
                    pg.click(f'.tabs button[data-view="{v}"]'); pg.wait_for_timeout(350)
                    m = rect(pg, f'#{v}')
                    chk(sin_salirse(pg) and m['l'] >= riel['tabsAncho'] - 1, f'E. {n} {v}: nada se sale ni queda bajo el riel')
                    pg.screenshot(path=SH + f'horizontal_{nombre}_{v}.png')
                chk(not errs, f'D–E. {n} sin errores: ' + '; '.join(errs))
                ctx.close()
                ctx, pg, errs = pagina(b, w, h, ins, URL + '?carga')
                pg.wait_for_timeout(300)
                fuera = a_la_vista(pg, ['.carga-logo', '.carga-pie'], ins)
                chk(pg.evaluate("!document.getElementById('carga').hidden") and not fuera, f'E. {n} pantalla de carga: el logo y "By Rooster Racing" caben ' + '; '.join(fuera))
                pg.screenshot(path=SH + f'horizontal_{nombre}_carga.png')
                ctx.close()
            # ---------------- G. Ajustes → Orientación
            W, H, INS = 852, 393, (59, 59, 21)
            sin = {k: v for k, v in AJUSTES.items() if k != 'orientacion'}   # como quien nunca la ha tocado
            ctx, pg, errs = pagina(b, W, H, INS, ajustes=sin)
            clases = lambda: pg.evaluate("document.documentElement.className")
            def girada_bien(lado_tabs):
                r = pg.evaluate("""(() => { const t = document.querySelector('.tabs').getBoundingClientRect(), l = document.querySelector('.brand').getBoundingClientRect();
                    return { tl: t.left, tr: t.right, tt: t.top, tb: t.bottom, ll: l.left, lr: l.right }; })()""")
                # las pestañas van de lado a lado salvo la rayita de inicio del iPhone (zona segura de abajo, 21 px)
                if lado_tabs == 'der':   # lo de arriba del teléfono a la izquierda: logo a la izquierda, pestañas a la derecha
                    return abs(r['tr'] - W) < 2 and r['tt'] < 2 and abs(r['tb'] - (H - INS[2])) < 2 and r['ll'] < 160, r
                return r['tl'] < 2 and r['tt'] < 2 and abs(r['tb'] - (H - INS[2])) < 2 and r['lr'] > W - 160, r
            c = clases()
            ok, r = girada_bien('der')
            chk('girada' in c and 'acostada' not in c and ok, f'G. "No girar" (la de inicio): con el teléfono de lado la app queda derecha respecto al teléfono ({c}; {r})')
            pg.screenshot(path=SH + 'horizontal_girada_medir.png')
            pg.click('.tabs button[data-view="vAjustes"]'); pg.wait_for_timeout(300)
            chk(pg.evaluate("!document.getElementById('vAjustes').hidden"), 'G. con la app girada las pestañas se tocan bien')
            alto = pg.evaluate("(() => { const m = document.getElementById('marco'); m.scrollTop = 500; return [m.scrollTop, m.scrollHeight > m.clientHeight]; })()")
            chk(alto[0] > 0 and alto[1], f'G. con la app girada Ajustes se desplaza ({alto})')
            chk(pg.evaluate("document.querySelector('#segOrient button[data-v=\"no\"]').getAttribute('aria-checked') === 'true'"), 'G. Ajustes muestra "No girar" elegido')
            pg.evaluate("document.querySelector('#segOrient').scrollIntoView({block: 'center'})"); pg.wait_for_timeout(200)
            pg.screenshot(path=SH + 'horizontal_girada_ajustes.png')
            # al otro lado: pestañas a la izquierda
            cdp = ctx.new_cdp_session(pg)
            cdp.send('Emulation.setDeviceMetricsOverride', {'width': W, 'height': H, 'deviceScaleFactor': 2, 'mobile': True, 'screenOrientation': {'type': 'landscapeSecondary', 'angle': 270}})
            pg.wait_for_timeout(400)
            pg.evaluate("document.getElementById('marco').scrollTop = 0")
            c = clases(); ok, r = girada_bien('izq')
            chk('girada-270' in c and ok, f'G. girado hacia el otro lado, la app también queda derecha respecto al teléfono ({c}; {r})')
            pg.screenshot(path=SH + 'horizontal_girada_270.png')
            cdp.send('Emulation.setDeviceMetricsOverride', {'width': W, 'height': H, 'deviceScaleFactor': 2, 'mobile': True, 'screenOrientation': {'type': 'landscapePrimary', 'angle': 90}})
            pg.wait_for_timeout(300)
            # "Solo Medir"
            pg.click('#segOrient button[data-v="medir"]'); pg.wait_for_timeout(300)
            guardada = pg.evaluate("JSON.parse(localStorage.getItem('dragtrim.settings')).orientacion")
            chk(guardada == 'medir' and 'girada' in clases(), f'G. "Solo Medir" se guarda ({guardada}) y Ajustes sigue sin acostarse')
            pg.click('.tabs button[data-view="vMedir"]'); pg.wait_for_timeout(300)
            c = clases()
            chk('acostada' in c and 'girada' not in c, f'G. "Solo Medir": Medir se acuesta ({c})')
            pg.click('.tabs button[data-view="vPractica"]'); pg.wait_for_timeout(300)
            c = clases()
            chk('girada' in c and 'acostada' not in c, f'G. "Solo Medir": Práctica no se acuesta ({c})')
            pg.click('#btnPractica'); pg.wait_for_timeout(500)
            r = rect(pg, '.pt')
            chk('girada' in clases() and abs(r['l']) < 2 and abs(r['r'] - W) < 2 and abs(r['b'] - H) < 2, f'G. "Solo Medir": el semáforo de Práctica tampoco se acuesta y llena la pantalla ({r})')
            pg.screenshot(path=SH + 'horizontal_girada_practica.png')
            pg.click('#ptCerrar'); pg.wait_for_timeout(300)
            pg.click('.tabs button[data-view="vMedir"]'); pg.wait_for_timeout(300)
            pg.click('#atRace'); pg.wait_for_timeout(300)
            c = clases()
            chk('acostada' in c and 'girada' not in c, f'G. "Solo Medir": Race 1 vs 1 se acuesta ({c})')
            pg.click('#rcSalir'); pg.wait_for_timeout(300)
            # "Toda la app"
            pg.click('.tabs button[data-view="vAjustes"]'); pg.wait_for_timeout(300)
            pg.click('#segOrient button[data-v="todo"]'); pg.wait_for_timeout(300)
            c = clases()
            chk('acostada' in c and 'girada' not in c, f'G. "Toda la app": Ajustes también se acuesta ({c})')
            chk(not errs, 'G. sin errores: ' + '; '.join(errs))
            ctx.close()
            # ---------------- F. En vertical no cambia
            ctx, pg, errs = pagina(b, 393, 852, (0, 0, 34))
            v = pg.evaluate("""(() => { const t = document.querySelector('.tabs').getBoundingClientRect();
                return { tabsArriba: t.top, tabsAncho: t.width, topPos: getComputedStyle(document.querySelector('.top')).position,
                         lado: getComputedStyle(document.querySelector('.rc-lado')).display }; })()""")
            chk(v['tabsArriba'] > 700 and v['tabsAncho'] > 380 and v['topPos'] == 'static' and v['lado'] == 'contents',
                f'F. en vertical las pestañas siguen abajo y el encabezado arriba ({v})')
            c = pg.evaluate("document.documentElement.className")
            chk('girada' not in c and 'acostada' not in c, f'F. en vertical la app no se gira ni usa el diseño acostado ({c!r})')
            ctx.close()
            man = json.load(open(os.path.join(DIST, 'manifest.webmanifest'), encoding='utf-8'))
            chk(man.get('orientation') == 'any', f'F. el manifiesto deja girar la app ({man.get("orientation")})')
            b.close()
    finally:
        srv.terminate()
    print('FALLAS:', len(fallas))
    for f in fallas: print('  -', f)
    sys.exit(1 if fallas else 0)

if __name__ == '__main__':
    main()
