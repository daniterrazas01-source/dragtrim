# Prueba de deslizar el dedo entre pestañas (app.js) en Chromium headless con toques reales (CDP).
# Usa la app construida (fuente/app/dist). Uso: python3 deslizar_test.py -> capturas/deslizar_*.png; código 1 si algo falla.
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(AQUI, '..', 'app', 'dist')
SH = os.path.join(AQUI, 'capturas', '')
os.makedirs(SH, exist_ok=True)
PUERTO = 8784
W, H = 390, 844
ORDEN = ['vMedir', 'vPractica', 'vCalc', 'vHistorial', 'vAjustes']

fallas = []
def chk(cond, txt):
    print(('ok    ' if cond else 'FALLA ') + txt)
    if not cond: fallas.append(txt)

def deslizar(pg, cdp, x0, y0, dx, dy=0, ms=260, pasos=12, soltar=True):
    """Un dedo de (x0, y0) a (x0+dx, y0+dy) en ms milisegundos (con la hora de cada toque, como un dedo de verdad)."""
    t0 = time.time() - ms / 1000 - 0.01   # el último toque cae en "ahora"
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': y0}], 'timestamp': t0})
    for k in range(1, pasos + 1):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x0 + dx * k / pasos, 'y': y0 + dy * k / pasos}],
                                              'timestamp': t0 + ms / 1000 * k / pasos})
    if soltar:
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [], 'timestamp': t0 + ms / 1000 + 0.01})
    pg.wait_for_timeout(500)

def vista(pg):
    return pg.evaluate("document.querySelector('main .view:not([hidden])').id")

def pestana(pg):
    return pg.evaluate("(document.querySelector('.tabs button[aria-current]') || {}).dataset?.view || null")

def limpio(pg):
    """Una sola pantalla visible, en su lugar (sin estilos del deslizar), nada animándose ya y data-entra solo en ella."""
    return pg.evaluate("""(() => {
        const vs = [...document.querySelectorAll('.view')], vis = vs.filter(v => !v.hidden);
        if (vis.length !== 1) return false;
        const corre = document.getAnimations().filter(a => a.playState === 'running' && a.effect && vis[0].contains(a.effect.target));
        return vs.every(v => !v.style.transform && !v.style.position && !v.style.top && !v.style.width && (v === vis[0] || !v.dataset.entra))
            && !document.documentElement.classList.contains('desliza-tab') && corre.length === 0; })()""")

def tx(pg, id):
    """Cuánto está movida de lado la pantalla id (px), o None si no se ve."""
    return pg.evaluate(f"""(() => {{ const v = document.getElementById('{id}'); if (v.hidden) return null;
        const m = getComputedStyle(v).transform; return m === 'none' ? 0 : new DOMMatrix(m).m41; }})()""")

def nueva(b, ajustes, espera=700):
    ctx = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        color_scheme='dark', locale='es-MX')
    ctx.add_init_script(f"localStorage.setItem('dragtrim.settings', JSON.stringify({json.dumps(ajustes)})); localStorage.setItem('dragtrim.guiaOculta', 'true');")
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    pg.goto(f'http://localhost:{PUERTO}/index.html')
    if espera: pg.wait_for_timeout(espera)
    return ctx, pg, ctx.new_cdp_session(pg), errs

def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PUERTO), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx, pg, cdp, errs = nueva(b, {'fondo': 'gallos'}, espera=0)
            pg.click('.tabs button[data-view="vAjustes"]', timeout=3000)
            chk(vista(pg) == 'vAjustes', 'un toque en la pestaña recién abierta la app sí cuenta')
            pg.click('.tabs button[data-view="vMedir"]'); pg.wait_for_timeout(500)
            Y = 420

            # A. recorrer todas hacia adelante y de regreso
            for k in range(1, 5):
                deslizar(pg, cdp, 300, Y, -200)
                chk(vista(pg) == ORDEN[k] and pestana(pg) == ORDEN[k], f'A. a la izquierda pasa a {ORDEN[k]} (vista {vista(pg)}, pestaña {pestana(pg)})')
            pg.screenshot(path=SH + 'deslizar_ajustes.png')
            deslizar(pg, cdp, 300, Y, -200)
            chk(vista(pg) == 'vAjustes', 'A. en la última pestaña no pasa de largo')
            for k in range(3, -1, -1):
                deslizar(pg, cdp, 90, Y, 200)
                chk(vista(pg) == ORDEN[k], f'A. a la derecha regresa a {ORDEN[k]} (vista {vista(pg)})')
            deslizar(pg, cdp, 90, Y, 200)
            chk(vista(pg) == 'vMedir', 'A. en la primera pestaña no pasa de largo')
            pg.wait_for_timeout(400)
            chk(limpio(pg), 'A. al final ninguna pantalla queda movida ni transparente ni se vuelve a animar')

            # B. corto y lento: regresa; corto y rápido: pasa
            deslizar(pg, cdp, 250, Y, -60, ms=700, pasos=20)
            chk(vista(pg) == 'vMedir' and limpio(pg), 'B. 60 px despacio no cambia y regresa a su lugar')
            deslizar(pg, cdp, 250, Y, -70, ms=90, pasos=5)
            chk(vista(pg) == 'vPractica', f'B. 70 px rápido sí cambia (vista {vista(pg)})')

            # C. a media deslizada la actual y las de los lados se mueven juntas, ya pintadas
            deslizar(pg, cdp, 300, Y, -150, soltar=False)
            c = [tx(pg, 'vPractica'), tx(pg, 'vCalc'), tx(pg, 'vMedir')]
            chk(c[0] is not None and abs(c[0] + 150) < 1 and abs(c[1] - (W - 150)) < 1 and abs(c[2] - (-W - 150)) < 1,
                f'C. la actual sigue al dedo y las de los lados van pegadas (actual, derecha, izquierda: {c})')
            op = pg.evaluate("""(() => { const n = document.getElementById('vCalc');
                const corre = document.getAnimations().filter(a => a.playState === 'running' && n.contains(a.effect.target));
                return [...n.children].every(h => getComputedStyle(h).opacity === '1') && corre.length === 0; })()""")
            chk(op, 'C. la que se asoma ya está completa (sin la cascada de entrada)')
            pg.screenshot(path=SH + 'deslizar_a_medias.png')
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [], 'timestamp': time.time()}); pg.wait_for_timeout(600)
            chk(vista(pg) == 'vCalc' and limpio(pg), f'C. al soltar a 150 px (más de un tercio) pasa (vista {vista(pg)})')
            deslizar(pg, cdp, 300, Y, -100, soltar=False); pg.wait_for_timeout(300)
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [], 'timestamp': time.time()}); pg.wait_for_timeout(600)
            chk(vista(pg) == 'vCalc' and limpio(pg), f'C. 100 px y detenerse antes de soltar: regresa (vista {vista(pg)})')

            # L. viniendo de una pantalla bajada, la nueva queda donde se veía (sin brinco)
            pg.click('.tabs button[data-view="vAjustes"]'); pg.wait_for_timeout(500)
            pg.evaluate("window.scrollTo(0, 700)"); pg.wait_for_timeout(200)
            deslizar(pg, cdp, 80, Y, 200, soltar=False)
            arriba = pg.evaluate("document.getElementById('vHistorial').getBoundingClientRect().top + new DOMMatrix(getComputedStyle(document.getElementById('vHistorial')).transform).m42")
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [], 'timestamp': time.time()}); pg.wait_for_timeout(600)
            despues = pg.evaluate("document.getElementById('vHistorial').getBoundingClientRect().top")
            chk(vista(pg) == 'vHistorial' and limpio(pg) and abs(arriba - despues) < 2,
                f'L. Historial queda a la misma altura en que se asomó ({arriba:.0f} → {despues:.0f} px, scrollY {pg.evaluate("scrollY")})')
            pg.screenshot(path=SH + 'deslizar_desde_abajo.png')
            pg.click('.tabs button[data-view="vCalc"]'); pg.wait_for_timeout(500)
            pg.evaluate("window.scrollTo(0, 600)"); pg.wait_for_timeout(200)
            deslizar(pg, cdp, 80, Y, 200, soltar=False)
            arriba = pg.evaluate("document.getElementById('vPractica').getBoundingClientRect().top")
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [], 'timestamp': time.time()}); pg.wait_for_timeout(600)
            despues = pg.evaluate("document.getElementById('vPractica').getBoundingClientRect().top")
            sy = pg.evaluate('scrollY')
            chk(vista(pg) == 'vPractica' and limpio(pg) and abs(arriba - despues) < 2 and sy > 0,
                f'L. de Calcular bajada a Práctica: empieza arriba, sin brinco ({arriba:.0f} → {despues:.0f} px, scrollY {sy})')

            # D. subir o bajar no cambia de pestaña (y sí se desliza la página)
            pg.click('.tabs button[data-view="vAjustes"]'); pg.wait_for_timeout(500)
            deslizar(pg, cdp, 200, 700, 10, dy=-400)
            chk(vista(pg) == 'vAjustes' and pg.evaluate('scrollY') > 100, f'D. hacia arriba baja la página y no cambia (scrollY {pg.evaluate("scrollY")})')
            deslizar(pg, cdp, 200, 600, -90, dy=-85)
            chk(vista(pg) == 'vAjustes', 'D. en diagonal no cambia')
            chk(limpio(pg), 'D. nada queda movido')

            # E. desde la orilla (gesto de "atrás" del teléfono) no cambia
            deslizar(pg, cdp, 8, Y, 220)
            deslizar(pg, cdp, W - 6, Y, -220)
            chk(vista(pg) == 'vAjustes', 'E. desde la orilla no cambia')

            # F. al soltar no se pica lo que quedó bajo el dedo (los fondos de Ajustes cambian con un toque)
            pg.evaluate("window.scrollTo(0, 0)")
            r = pg.evaluate("(() => { const b = document.querySelector('.fondos button'); b.scrollIntoView({block: 'center'}); const q = b.getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2]; })()")
            antes = pg.evaluate("JSON.parse(localStorage.getItem('dragtrim.settings')).fondo")
            deslizar(pg, cdp, r[0] + 40, r[1], 160)
            chk(vista(pg) == 'vHistorial', f'F. deslizar empezando sobre un fondo pasa a Historial (vista {vista(pg)})')
            chk(pg.evaluate("JSON.parse(localStorage.getItem('dragtrim.settings')).fondo") == antes, 'F. y no cambia el fondo')

            # G. en algo que se recorre de lado no cambia de pestaña
            pg.click('.tabs button[data-view="vCalc"]'); pg.wait_for_timeout(500)
            pg.evaluate("""(() => { const d = document.createElement('div'); d.id = 'ancho'; d.style.cssText = 'overflow-x:auto;height:80px';
                d.innerHTML = '<div style="width:1200px;height:80px">tabla ancha</div>'; document.querySelector('#vCalc').prepend(d); })()""")
            q = pg.evaluate("(() => { const q = document.querySelector('#ancho').getBoundingClientRect(); return [q.x + q.width / 2, q.y + 40]; })()")
            deslizar(pg, cdp, q[0], q[1], -200)
            chk(vista(pg) == 'vCalc', 'G. en una tabla ancha no cambia de pestaña')
            pg.evaluate("document.querySelector('#ancho').remove()")

            # K. otra vez el dedo mientras regresa, y dos deslizadas muy seguidas
            pg.click('.tabs button[data-view="vPractica"]'); pg.wait_for_timeout(500)
            deslizar(pg, cdp, 250, 300, -50, ms=500, pasos=10)   # corto: regresa (no espera a que termine)
            deslizar(pg, cdp, 300, 300, -200)
            pg.wait_for_timeout(400)
            chk(vista(pg) == 'vCalc' and limpio(pg), f'K. deslizar mientras regresaba pasa bien (vista {vista(pg)})')
            t0 = time.time() - 0.2
            for k, (tipo, x) in enumerate([('touchStart', 300), ('touchMove', 240), ('touchMove', 160), ('touchEnd', None)]):
                cdp.send('Input.dispatchTouchEvent', {'type': tipo, 'touchPoints': [] if x is None else [{'x': x, 'y': 300}], 'timestamp': t0 + k * 0.03})
            deslizar(pg, cdp, 300, 300, -200, ms=60, pasos=3)   # llega mientras la otra va saliendo: no cuenta
            pg.wait_for_timeout(500)
            chk(vista(pg) == 'vHistorial' and limpio(pg), f'K. dos deslizadas encimadas pasan solo una y no queda nada a medias (vista {vista(pg)})')
            # H. en el semáforo de Práctica no hay deslizar
            pg.click('.tabs button[data-view="vPractica"]'); pg.wait_for_timeout(400)
            pg.click('#btnPractica'); pg.wait_for_timeout(500)
            deslizar(pg, cdp, 300, 200, -220)
            chk(pg.evaluate("!document.querySelector('#ptOverlay').hidden") and vista(pg) == 'vPractica', 'H. con el semáforo abierto no cambia')
            pg.click('#ptOverlay .pt-x'); pg.wait_for_timeout(400)

            # I. en una corrida (simulada) no hay deslizar
            pg.click('.tabs button[data-view="vMedir"]'); pg.wait_for_timeout(400)
            pg.click('#btnDemo'); pg.wait_for_timeout(700)
            deslizar(pg, cdp, 300, Y, -220)
            chk(pg.evaluate("document.body.classList.contains('sesion')") and vista(pg) == 'vMedir', 'I. en una corrida no cambia')
            chk(not errs, 'sin errores en consola: ' + '; '.join(errs))
            ctx.close()

            # J. con las animaciones apagadas pasa igual, sin moverse con el dedo
            ctx, pg, cdp, errs = nueva(b, {'fondo': 'combinado', 'anim': False})
            deslizar(pg, cdp, 300, Y, -160, soltar=False)
            chk(pg.evaluate("getComputedStyle(document.querySelector('#vMedir')).transform") == 'none', 'J. sin animaciones la pantalla no sigue al dedo')
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [], 'timestamp': time.time()}); pg.wait_for_timeout(300)
            chk(vista(pg) == 'vPractica' and limpio(pg), 'J. sin animaciones también cambia de pestaña')
            chk(not errs, 'J. sin errores en consola: ' + '; '.join(errs))
            ctx.close()
            b.close()
    finally:
        srv.terminate()
    print('FALLAS:', len(fallas))
    for f in fallas: print('  -', f)
    sys.exit(1 if fallas else 0)

main()
