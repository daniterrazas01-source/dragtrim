# Prueba de los atajos de Medir (0.6.8, Daniel): "Corrida simulada", "Race 1 vs 1" y "Antes de salir a la pista" como tres
# botones cuadrados uno encima de otro en una caja oscura, como un semáforo (antes eran tres renglones grandes), para que
# se vea más el fondo. Race 1 vs 1 y Antes de salir a la pista se prenden y abren su explicación a la derecha, una a la vez. Uso: python3 atajos_test.py -> capturas/atajos_*.png; código 1 si algo falla.
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(AQUI, '..', 'app', 'dist')
SH = os.path.join(AQUI, 'capturas', '')
os.makedirs(SH, exist_ok=True)
PUERTO = 8797

fallas = []
def chk(cond, txt):
    print(('ok    ' if cond else 'FALLA ') + txt)
    if not cond: fallas.append(txt)

def abrir(b, ajustes, ancho, alto, esquema='dark'):
    ctx = b.new_context(viewport={'width': ancho, 'height': alto}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme=esquema)
    ctx.add_init_script(f"localStorage.setItem('dragtrim.settings', JSON.stringify({json.dumps(ajustes)})); localStorage.setItem('dragtrim.guiaOculta', 'true');")
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    pg.goto(f'http://localhost:{PUERTO}/index.html'); pg.wait_for_timeout(500)
    return ctx, pg, errs

FILA = """(() => { const t = [...document.querySelectorAll('.atajo')].map(x => x.getBoundingClientRect());
    const caja = document.querySelector('.atajos-arbol').getBoundingClientRect(), sens = document.getElementById('btnSensores').getBoundingClientRect();
    return { n: t.length, vertical: t.every((r, i) => !i || r.top >= t[i - 1].bottom), cuadrados: t.every(r => Math.abs(r.width - r.height) < 2 && r.width >= 64 && r.width <= 80),
             izquierda: Math.abs(caja.left - sens.left) < 1, cajaAncho: Math.round(caja.width), libre: Math.round(sens.right - caja.right),
             dentro: t.every(r => r.left >= 0 && r.right <= innerWidth), ancho: document.documentElement.scrollWidth <= innerWidth,
             cortado: [...document.querySelectorAll('.atajo span')].some(s => s.scrollWidth > s.clientWidth + 1 || s.getBoundingClientRect().height > 28) }; })()"""
estado = lambda pg: pg.evaluate("[['atRace', 'race1v1'], ['atAntes', 'antesPista']].map(([b, p]) => [document.getElementById(b).getAttribute('aria-expanded'), !document.getElementById(p).hidden])")

def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PUERTO), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            # A. como semáforo: tres cuadros uno encima de otro a la izquierda, en teléfonos de 320 a 430 de ancho, con y sin fondo
            for ancho, alto in ((320, 568), (384, 832), (393, 852), (430, 932)):
                for fondo, tema in (('gallos', 'dark'), ('combinado', 'light'), ('ninguno', 'dark')):
                    ctx, pg, errs = abrir(b, {'fondo': fondo, 'tema': tema}, ancho, alto)
                    r = pg.evaluate(FILA)
                    chk(r['n'] == 3 and r['vertical'] and r['cuadrados'] and r['izquierda'] and r['dentro'] and r['ancho'] and not r['cortado'],
                        f'A. {ancho} {fondo} {tema}: tres botones cuadrados uno encima de otro, a la izquierda, sin cortar el texto ({r})')
                    chk(r['cajaAncho'] <= 100 and r['libre'] >= ancho - 160, f'A. {ancho} {fondo}: el semáforo es angosto y a la derecha se ve el fondo ({r["cajaAncho"]} px de ancho, {r["libre"]} px libres)')
                    if ancho == 393: pg.screenshot(path=SH + f'atajos_{fondo}_{tema}.png')
                    chk(not errs, f'A. {ancho} {fondo} sin errores: ' + '; '.join(errs))
                    ctx.close()
            # B. abren su explicación abajo, una a la vez, y se cierran con otro toque
            ctx, pg, errs = abrir(b, {'fondo': 'gallos'}, 393, 852)
            chk(estado(pg) == [['false', False], ['false', False]], f'B. al abrir la app las dos explicaciones están cerradas ({estado(pg)})')
            pg.click('#atRace'); pg.wait_for_timeout(350)
            chk(estado(pg) == [['true', True], ['false', False]], f'B. Race 1 vs 1 abre la suya ({estado(pg)})')
            chk('en desarrollo' in pg.inner_text('#race1v1') and 'dos autos' in pg.inner_text('#race1v1'), 'B. dice "en desarrollo" y la explicación')
            arr = pg.evaluate("[document.querySelector('.atajos-arbol').getBoundingClientRect(), document.getElementById('race1v1').getBoundingClientRect()].map(r => [Math.round(r.left), Math.round(r.top), Math.round(r.right)])")
            chk(arr[1][0] >= arr[0][2] and abs(arr[1][1] - arr[0][1]) <= 2, f'B. la explicación sale a la derecha del semáforo, arriba a la par ({arr})')
            chk(pg.evaluate("getComputedStyle(document.getElementById('atRace')).backgroundColor") != pg.evaluate("getComputedStyle(document.getElementById('atAntes')).backgroundColor"), 'B. el botón abierto se prende')
            pg.click('#atAntes'); pg.wait_for_timeout(350)
            chk(estado(pg) == [['false', False], ['true', True]], f'B. Antes de la pista abre la suya y cierra la otra ({estado(pg)})')
            arr = pg.evaluate("[document.querySelector('.atajos-arbol').getBoundingClientRect(), document.getElementById('antesPista').getBoundingClientRect()].map(r => [Math.round(r.left), Math.round(r.top), Math.round(r.right)])")
            chk(arr[1][0] >= arr[0][2] and abs(arr[1][1] - arr[0][1]) <= 2, f'B. la de Antes de salir a la pista también sale a la derecha ({arr})')
            chk('soporte firme' in pg.inner_text('#antesPista') and pg.evaluate("document.getElementById('howtoCam').hidden"), 'B. trae los consejos (sin los de la cámara)')
            pg.screenshot(path=SH + 'atajos_abierto.png', full_page=True)
            pg.click('#atAntes'); pg.wait_for_timeout(250)
            chk(estado(pg) == [['false', False], ['false', False]], f'B. otro toque la cierra ({estado(pg)})')
            pg.focus('#atRace'); pg.keyboard.press('Enter'); pg.wait_for_timeout(250)
            chk(estado(pg)[0] == ['true', True], 'B. también abre con el teclado')
            chk(not errs, 'B. sin errores: ' + '; '.join(errs))
            # C. "Corrida simulada" arranca la corrida de prueba
            pg.click('#btnDemo'); pg.wait_for_timeout(700)
            chk(pg.evaluate("!document.getElementById('medirSesion').hidden && document.getElementById('medirIdle').hidden"), 'C. Corrida simulada arranca la corrida de prueba')
            pg.wait_for_selector('.slip', timeout=40000); pg.wait_for_timeout(300)
            pg.click('#rSalir'); pg.wait_for_timeout(300)
            chk(pg.evaluate("!document.getElementById('medirIdle').hidden"), 'C. al salir regresa a Medir con los botones')
            chk(not errs, 'C. sin errores: ' + '; '.join(errs))
            ctx.close()
            b.close()
    finally:
        srv.terminate()
    print('FALLAS:', len(fallas))
    for f in fallas: print('  -', f)
    sys.exit(1 if fallas else 0)

main()
