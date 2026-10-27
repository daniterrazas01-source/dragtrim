# Prueba de la pantalla de carga (0.6.4): logo de Drag Tree + "By" y el logo de Rooster Racing, 2 s al abrir la app.
# En las pruebas automáticas no sale (navigator.webdriver) salvo con ?carga, que es lo que se prueba aquí.
# Uso: python3 carga_test.py -> capturas/carga_*.png; sale con código 1 si algo falla.
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(AQUI, '..', 'app', 'dist')
SH = os.path.join(AQUI, 'capturas', '')
os.makedirs(SH, exist_ok=True)
PUERTO = 8786

fallas = []
def chk(cond, txt):
    print(('ok    ' if cond else 'FALLA ') + txt)
    if not cond: fallas.append(txt)

def abrir(b, ajustes, url, ancho=390, alto=844):
    ctx = b.new_context(viewport={'width': ancho, 'height': alto}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme='dark')
    ctx.add_init_script(f"localStorage.setItem('dragtrim.settings', JSON.stringify({json.dumps(ajustes)})); localStorage.setItem('dragtrim.guiaOculta', 'true');")
    # la página anota cuándo empieza a desvanecerse y cuándo se quita (ms desde que se abrió)
    ctx.add_init_script("""window.__carga = {}; new MutationObserver(() => {
        const c = document.getElementById('carga');
        if (c && c.classList.contains('fuera') && !__carga.fuera) __carga.fuera = performance.now();
        if (!c && __carga.vista && !__carga.quitada) __carga.quitada = performance.now();
        if (c) __carga.vista = true; }).observe(document, { subtree: true, childList: true, attributes: true });""")
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    t0 = time.time()
    pg.goto(f'http://localhost:{PUERTO}/{url}', wait_until='domcontentloaded')
    return ctx, pg, errs, t0

def esperar_hasta(t0, s):
    falta = t0 + s - time.time()
    if falta > 0: time.sleep(falta)

def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PUERTO), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            # A. con animaciones
            ctx, pg, errs, t0 = abrir(b, {'fondo': 'gallos'}, 'index.html?carga')
            esperar_hasta(t0, 0.4)
            hay = pg.evaluate("""(() => { const c = document.getElementById('carga'); if (!c) return null;
                const img = c.querySelector('img'), r = c.getBoundingClientRect();
                const encima = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
                return { svg: !!c.querySelector('svg .lg-drag'), lema: c.querySelectorAll('.lg-drag').length,
                         img: img.complete && img.naturalWidth > 0, by: c.querySelector('.carga-pie span').textContent,
                         pantalla: r.width === innerWidth && r.height === innerHeight, tapa: c.contains(encima),
                         luces: c.querySelectorAll('.lz').length }; })()""")
            chk(hay is not None, 'A. al abrir se ve la pantalla de carga')
            if hay:
                chk(hay['svg'] and hay['lema'] >= 2, f'A. trae el logo con "On the mark" ({hay})')
                chk(hay['img'] and hay['by'] == 'By', 'A. abajo dice "By" con el logo de Rooster Racing')
                chk(hay['pantalla'] and hay['tapa'], 'A. tapa toda la pantalla (no se pica nada de atrás)')
                chk(hay['luces'] == 14, 'A. las luces del árbol se prenden (14 focos)')
            esperar_hasta(t0, 1.45); pg.screenshot(path=SH + 'carga_pantalla.png')
            pg.wait_for_function("window.__carga.quitada", timeout=4000)
            t = pg.evaluate("window.__carga")
            chk(t.get('fuera') and 0.25 <= (t['quitada'] - t['fuera']) / 1000 <= 0.4, f'A. se desvanece 0.3 s antes de irse ({t})')
            chk(1.9 <= t['quitada'] / 1000 <= 2.7, f"A. dura unos 2 s ({t['quitada'] / 1000:.2f} s desde que se abrió)")
            pg.click('.tabs button[data-view="vAjustes"]', timeout=2000); pg.wait_for_timeout(300)
            chk(pg.evaluate("document.querySelector('main .view:not([hidden])').id") == 'vAjustes', 'A. después la app responde')
            chk('0.6.6' in pg.evaluate("document.getElementById('verText').textContent") and 'beta' not in pg.evaluate("document.getElementById('verText').textContent"),
                'A. la versión ya no dice "beta"')
            chk(not pg.evaluate("document.querySelector('.brand .beta')"), 'A. ya no está la etiqueta "beta" arriba')
            chk(not errs, 'A. sin errores en consola: ' + '; '.join(errs))
            ctx.close()
            # B. sin animaciones: no se desvanece, solo se quita a los 2 s
            ctx, pg, errs, t0 = abrir(b, {'fondo': 'ninguno', 'anim': False}, 'index.html?carga')
            pg.wait_for_function("window.__carga.quitada", timeout=4000)
            t = pg.evaluate("window.__carga")
            chk(not t.get('fuera') and 1.9 <= t['quitada'] / 1000 <= 2.7, f'B. sin animaciones no se desvanece y se quita a los ~2 s ({t})')
            chk(not errs, 'B. sin errores en consola: ' + '; '.join(errs))
            ctx.close()
            # C. teléfono angosto: cabe sin salirse
            ctx, pg, errs, t0 = abrir(b, {'fondo': 'combinado', 'tema': 'light'}, 'index.html?carga', 320, 568)
            esperar_hasta(t0, 0.6)
            r = pg.evaluate("""(() => { const l = document.querySelector('.carga-logo').getBoundingClientRect(), p = document.querySelector('.carga-pie').getBoundingClientRect();
                return [l.left >= 0 && l.right <= innerWidth, p.top > l.bottom, p.bottom <= innerHeight, document.documentElement.scrollWidth <= innerWidth]; })()""")
            chk(all(r), f'C. en 320 × 568 el logo y el pie caben sin encimarse ({r})')
            pg.screenshot(path=SH + 'carga_angosto.png')
            ctx.close()
            # D. en las pruebas automáticas sin ?carga no sale (las demás pruebas no esperan los 2 s)
            ctx, pg, errs, t0 = abrir(b, {}, 'index.html')
            pg.wait_for_timeout(100)
            chk(pg.evaluate("!document.getElementById('carga')"), 'D. sin ?carga no sale en pruebas automáticas')
            ctx.close()
            b.close()
    finally:
        srv.terminate()
    print('FALLAS:', len(fallas))
    for f in fallas: print('  -', f)
    sys.exit(1 if fallas else 0)

main()
