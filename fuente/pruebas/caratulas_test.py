"""Carátulas (1 nov 2026, Daniel: "tres interfaces") y Ajustes en dos pestañas (General / Apariencia).
A. Ajustes: General de inicio; Apariencia trae carátula, fondo, tema, orientación y animaciones; flechas del teclado.
B. Cambiar de carátula: la 2026 (de inicio) y la Original se ven como deben, se guarda y sobrevive al recargar.
C. Medir funciona igual en las dos (sensores falsos); la última corrida solo en la 2026.
D. Con fondo, el botón principal toma el color del fondo en las dos.
Uso: python3 caratulas_test.py   (arma antes con build.py)"""
import os, sys, json, subprocess, time
from playwright.sync_api import sync_playwright
AQUI = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(AQUI, '..', 'app', 'dist'); SH = os.path.join(AQUI, 'capturas') + '/'; os.makedirs(SH, exist_ok=True)
MOCK = open(os.path.join(AQUI, 'uitest.py'), encoding='utf-8').read().split('MOCK = r"""', 1)[1].split('"""', 1)[0]
PUERTO = 8792
fallas = []
def chk(cond, txt):
    print(('ok    ' if cond else 'FALLA ') + txt)
    if not cond: fallas.append(txt)

def abrir(b, ajustes, mock=False, esquema='dark'):
    ctx = b.new_context(viewport={'width': 393, 'height': 852}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        color_scheme=esquema, locale='es-MX')
    if mock: ctx.add_init_script(MOCK)
    ctx.add_init_script(f"if (!sessionStorage.getItem('ya')) {{ localStorage.setItem('dragtrim.settings', JSON.stringify({json.dumps(ajustes)})); "
                        "localStorage.setItem('dragtrim.guiaOculta', 'true'); sessionStorage.setItem('ya', '1'); }")
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
    pg.goto(f'http://localhost:{PUERTO}/index.html'); pg.wait_for_timeout(500)
    return ctx, pg, errs

# visible = tiene tamaño en pantalla (los íconos SVG no tienen offsetParent)
visible = lambda pg, sel: pg.evaluate(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }})()")
fondo_body = lambda pg: pg.evaluate("getComputedStyle(document.body).backgroundColor")
TABS = """(() => { const t = document.querySelector('.tabs').getBoundingClientRect();
    return { abajo: Math.round(innerHeight - t.bottom), izq: Math.round(t.left), ancho: Math.round(t.width) }; })()"""

def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PUERTO), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            # ---------------- A. Ajustes en dos pestañas
            ctx, pg, errs = abrir(b, {'fondo': 'ninguno', 'tema': 'dark'})
            pg.click('.tabs button[data-view="vAjustes"]'); pg.wait_for_timeout(300)
            sel = lambda: pg.evaluate("[...document.querySelectorAll('#segAjustes [role=tab]')].map(b => b.getAttribute('aria-selected'))")
            chk(sel() == ['true', 'false'], f'A. de inicio está General ({sel()})')
            for s in ('#inRollout', '#segUnidad', '#inVconf', '#inAcc', '#btnBorrarHist'):
                chk(visible(pg, s), f'A. General muestra {s}')
            for s in ('#segCaratula', '#selFondo', '#segVelo', '#segTema', '#segOrient', '#inAnim'):
                chk(not visible(pg, s), f'A. General no muestra {s}')
            pg.screenshot(path=SH + 'caratulas_ajustes_general.png')
            pg.click('#ajTabApariencia'); pg.wait_for_timeout(300)
            chk(sel() == ['false', 'true'], f'A. al tocar Apariencia queda elegida ({sel()})')
            for s in ('#segCaratula', '#selFondo', '#segVelo', '#segTema', '#segOrient', '#inAnim'):
                chk(visible(pg, s), f'A. Apariencia muestra {s}')
            chk(not visible(pg, '#inRollout'), 'A. Apariencia no muestra lo de General')
            orden = pg.evaluate("[...document.querySelectorAll('#ajApariencia > .field > .lab:first-child, #ajApariencia > .field > label.toggle')].map(e => e.textContent.trim().split('\\n')[0])")
            chk(orden[:4] == ['Carátula', 'Fondo de pantalla', 'Tema', 'Orientación'] and orden[4].startswith('Animaciones'), f'A. orden: {orden}')
            pg.screenshot(path=SH + 'caratulas_ajustes_apariencia.png', full_page=True)
            pg.focus('#ajTabApariencia'); pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(150)
            chk(sel() == ['true', 'false'] and pg.evaluate("document.activeElement.id") == 'ajTabGeneral', 'A. con la flecha izquierda vuelve a General')
            pg.keyboard.press('End'); pg.wait_for_timeout(150)
            chk(sel() == ['false', 'true'], 'A. con Fin va a Apariencia')
            marca = pg.evaluate("getComputedStyle(document.getElementById('segAjustes')).getPropertyValue('--seg-x')")
            chk(marca.strip() != '', f'A. la marca del selector de pestañas sabe dónde va ({marca!r})')
            chk(not errs, 'A. sin errores: ' + '; '.join(errs))
            ctx.close()

            # ---------------- B. cambiar de carátula
            ctx, pg, errs = abrir(b, {'fondo': 'ninguno', 'tema': 'dark'})
            raiz = lambda: pg.evaluate("document.documentElement.dataset.caratula")
            chk(raiz() == '2026', f'B. de inicio la 2026 ({raiz()})')
            chk(fondo_body(pg) == 'rgb(5, 6, 7)', f'B. 2026: negro OLED ({fondo_body(pg)})')
            t = pg.evaluate(TABS)
            chk(t['abajo'] >= 10 and t['izq'] >= 10, f'B. 2026: pestañas flotantes ({t})')
            chk(pg.evaluate("document.querySelectorAll('#sStatus .stat').length") == 4 and visible(pg, '#sBarras'), 'B. 2026: GPS a lo ancho con rayitas, acelerómetro, velocidad y última corrida')
            chk(visible(pg, '.tabs button svg'), 'B. 2026: pestañas con íconos')
            pg.click('.tabs button[data-view="vAjustes"]'); pg.click('#ajTabApariencia'); pg.wait_for_timeout(200)
            exp26 = pg.text_content('#caratulaExp')
            pg.click('#segCaratula button[data-v="original"]'); pg.wait_for_timeout(300)
            chk(raiz() == 'original', f'B. al elegir Original cambia al momento ({raiz()})')
            chk(fondo_body(pg) == 'rgb(36, 40, 44)', f'B. Original: su gris de siempre ({fondo_body(pg)})')
            t = pg.evaluate(TABS)
            chk(t['abajo'] == 0 and t['izq'] == 0 and t['ancho'] == 393, f'B. Original: pestañas fijas abajo de orilla a orilla ({t})')
            chk(not visible(pg, '.tabs button svg'), 'B. Original: pestañas sin íconos, como antes')
            chk(pg.text_content('#caratulaExp') != exp26 and 'siempre' in pg.text_content('#caratulaExp'), f'B. la explicación cambia ({pg.text_content("#caratulaExp")!r})')
            chk(pg.evaluate("document.querySelector('#segCaratula [data-v=original]').getAttribute('aria-checked')") == 'true', 'B. el selector marca Original')
            chk(json.loads(pg.evaluate("localStorage.getItem('dragtrim.settings')")).get('caratula') == 'original', 'B. se guarda')
            pg.screenshot(path=SH + 'caratulas_original_apariencia.png')
            pg.click('.tabs button[data-view="vMedir"]'); pg.wait_for_timeout(300)
            k = pg.evaluate("[...document.querySelectorAll('#sStatus .stat .k')].map(e => e.textContent)")
            chk(k == ['Precisión GPS', 'Frecuencia GPS', 'Velocidad', 'Acelerómetro'], f'B. Original: los 4 cuadros de siempre ({k})')
            chk(pg.evaluate("document.querySelectorAll('#sPrec').length") == 1 and not pg.query_selector('#sBarras'), 'B. un solo bloque de sensores (sin repetidos)')
            pg.reload(); pg.wait_for_timeout(500)
            chk(raiz() == 'original' and fondo_body(pg) == 'rgb(36, 40, 44)', f'B. al volver a abrir sigue la Original ({raiz()})')
            pg.click('.tabs button[data-view="vAjustes"]'); pg.click('#ajTabApariencia'); pg.wait_for_timeout(200)
            pg.click('#segCaratula button[data-v="2026"]'); pg.wait_for_timeout(300)
            chk(raiz() == '2026' and fondo_body(pg) == 'rgb(5, 6, 7)', 'B. y de regreso a la 2026')
            chk(not errs, 'B. sin errores: ' + '; '.join(errs))
            ctx.close()

            # ---------------- C. Medir con sensores y la última corrida, en las dos
            for car in ('original', '2026'):
                ctx, pg, errs = abrir(b, {'fondo': 'ninguno', 'tema': 'dark', 'caratula': car}, mock=True)
                pg.click('#btnSensores'); pg.wait_for_timeout(3200)
                prec, hz = pg.text_content('#sPrec'), pg.text_content('#sHz')
                chk(prec.startswith('±') and hz.endswith('Hz'), f'C. {car}: los sensores se ven ({prec}, {hz})')
                if car == '2026':
                    chk(pg.evaluate("document.querySelectorAll('#sBarras i.on').length") > 0, 'C. 2026: rayitas de señal prendidas')
                pg.click('#btnDemo'); pg.wait_for_selector('.slip', timeout=40000); pg.wait_for_timeout(400)
                pg.click('#rSalir'); pg.wait_for_timeout(500)
                ult = pg.query_selector('#ultCorrida')
                if car == '2026':
                    chk(ult is not None and visible(pg, '#ultCorrida') and 's' in ult.text_content(), 'C. 2026: aparece la última corrida')
                    pg.click('#ultCorrida'); pg.wait_for_timeout(400)
                    chk(not pg.evaluate("document.getElementById('vResultado').hidden"), 'C. 2026: tocarla abre su boleta')
                else:
                    chk(ult is None, 'C. Original: sin cuadro de última corrida, como antes')
                pg.screenshot(path=SH + f'caratulas_medir_{car}.png')
                chk(not errs, f'C. {car} sin errores: ' + '; '.join(errs))
                ctx.close()

            # ---------------- D. con fondo: el botón principal toma el color del fondo
            for car in ('original', '2026'):
                ctx, pg, errs = abrir(b, {'fondo': 'combinado', 'tema': 'dark', 'caratula': car})
                c = pg.evaluate("getComputedStyle(document.getElementById('btnSensores')).backgroundColor")
                chk(c == 'rgb(212, 255, 0)', f'D. {car} con fondo Combinado: botón del color del fondo ({c})')
                chk(not errs, f'D. {car} sin errores: ' + '; '.join(errs))
                ctx.close()
            b.close()
    finally:
        srv.terminate()
    print('FALLAS:', len(fallas))
    for f in fallas: print('  -', f)

main()
