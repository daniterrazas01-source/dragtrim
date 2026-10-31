# Prueba de la franja de la hora y la cámara en Android (0.6.7): en un Samsung la app instalada no se dibuja detrás de
# la hora; el sistema pinta esa franja (la del hoyito de la cámara) del color de theme-color. La app se lo cambia según lo
# que queda arriba de la pantalla: fondo + velo, corrida, Práctica, carga, tema claro/oscuro.
# Revisa el color contra la cuenta y contra lo que de verdad se pinta arriba, y que la app quepa en pantallas de Samsung.
# Uso: python3 barra_test.py -> capturas/barra_*.png (con la franja y la cámara dibujadas); sale con código 1 si algo falla.
import io, json, os, re, subprocess, sys, time
from PIL import Image, ImageDraw, ImageStat
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(AQUI, '..', 'app', 'dist')
SH = os.path.join(AQUI, 'capturas', '')
os.makedirs(SH, exist_ok=True)
PUERTO = 8787
UA = 'Mozilla/5.0 (Linux; Android 15; SM-S931B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
# lo que deja Android a la app instalada (sin la franja de la hora ni la barra de abajo) y la franja de cada teléfono
TELEFONOS = {'S25': (412, 859, 32), 'S22 Ultra': (384, 769, 30), 'chico': (360, 680, 28)}

fallas = []
def chk(cond, txt):
    print(('ok    ' if cond else 'FALLA ') + txt)
    if not cond: fallas.append(txt)

html = open(os.path.join(DIST, 'index.html'), encoding='utf-8').read()
ARRIBA = json.loads(re.search(r'const ARRIBA = (\{[^}]*\})', html).group(1))
VELO_OSC, VELO_CLA = (10, 10, 11), (244, 244, 240)
hexa = lambda c: '#' + ''.join(f'{round(x):02x}' for x in c)
deh = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
encima = lambda c, a, abajo: tuple(c[i] * a + abajo[i] * (1 - a) for i in range(3))
dist = lambda a, b: sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5

def abrir(b, ajustes, url='index.html', tel='S25', esquema='dark'):
    w, h, _ = TELEFONOS[tel]
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        color_scheme=esquema, user_agent=UA, locale='es-MX')
    ctx.add_init_script(f"localStorage.setItem('dragtrim.settings', JSON.stringify({json.dumps(ajustes)})); localStorage.setItem('dragtrim.guiaOculta', 'true');")
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    pg.goto(f'http://localhost:{PUERTO}/{url}', wait_until='domcontentloaded')
    pg.wait_for_timeout(400)
    return ctx, pg, errs

barra = lambda pg: pg.evaluate("document.querySelector('meta[name=theme-color]').content")

def arriba_pintado(pg, alto=8):
    """Color promedio de las primeras filas de la pantalla (lo que queda pegado a la franja de Android)."""
    im = Image.open(io.BytesIO(pg.screenshot(clip={'x': 0, 'y': 0, 'width': pg.viewport_size['width'], 'height': alto}))).convert('RGB')
    return tuple(ImageStat.Stat(im).mean)

def con_franja(pg, nombre, tel='S25'):
    """Captura con la franja de Android encima (color de theme-color, hora, batería y el hoyito de la cámara)."""
    w, h, fr = TELEFONOS[tel]
    app = Image.open(io.BytesIO(pg.screenshot())).convert('RGB')
    s = app.width / w
    color = deh(barra(pg))
    claro = sum(color) / 3 > 140
    im = Image.new('RGB', (app.width, app.height + round(fr * s)), color)
    im.paste(app, (0, round(fr * s)))
    d = ImageDraw.Draw(im)
    tinta = (20, 20, 20) if claro else (240, 240, 240)
    d.text((round(18 * s), round(fr * s / 2)), '9:41', fill=tinta, anchor='lm', font_size=round(13 * s))
    d.rounded_rectangle((app.width - round(42 * s), round(fr * s / 2 - 5 * s), app.width - round(20 * s), round(fr * s / 2 + 5 * s)), radius=round(2.5 * s), outline=tinta, width=max(1, round(s)))
    r = 7 * s; cx, cy = app.width / 2, fr * s / 2
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(0, 0, 0))
    im.save(SH + f'barra_{nombre}.png')

def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PUERTO), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            man = json.load(open(os.path.join(DIST, 'manifest.webmanifest'), encoding='utf-8'))
            chk(man['theme_color'] == man['background_color'] == '#141618', f"M. el manifiesto arranca del color de la carga ({man['theme_color']}, {man['background_color']})")
            chk(len(ARRIBA) == 7 and all(len(v) == 3 for v in ARRIBA.values()), f'M. build.py dejó el color de arriba de los 7 fondos ({sorted(ARRIBA)})')

            # A. cada fondo, oscuro y claro, con los tres velos: la franja = lo de arriba del fondo con su velo
            for fid in sorted(ARRIBA):
                for tema, vc in (('dark', VELO_OSC), ('light', VELO_CLA)):
                    for velo in ('0.88', '0.78', '0.64'):
                        if tema == 'light' and velo != '0.78': continue
                        ctx, pg, errs = abrir(b, {'fondo': fid, 'tema': tema, 'velo': velo})
                        esperado = encima(vc, float(velo), ARRIBA[fid])
                        got = barra(pg)
                        pintado = arriba_pintado(pg)
                        chk(dist(deh(got), esperado) <= 1.5, f'A. {fid} {tema} velo {velo}: franja {got} = cuenta {hexa(esperado)}')
                        chk(dist(deh(got), pintado) <= 30, f'A. {fid} {tema} velo {velo}: se parece a lo pintado arriba ({hexa(pintado)}, distancia {dist(deh(got), pintado):.0f})')
                        if velo == '0.78': con_franja(pg, f'{fid}_{tema}')
                        chk(not errs, f'A. {fid} {tema} sin errores: ' + '; '.join(errs))
                        ctx.close()

            # B. sin fondo: el color de la app; con tema Automático sigue al teléfono cuando cambia (modo oscuro al anochecer)
            for tema, color in (('dark', '#24282c'), ('light', '#eef0ec')):
                ctx, pg, errs = abrir(b, {'fondo': 'ninguno', 'tema': tema})
                chk(barra(pg) == color, f'B. sin fondo, tema {tema}: {barra(pg)} = {color}')
                chk(dist(deh(barra(pg)), arriba_pintado(pg)) <= 2, 'B. igual a lo pintado arriba')
                con_franja(pg, f'sin_fondo_{tema}')
                ctx.close()
            ctx, pg, errs = abrir(b, {'fondo': 'ninguno', 'tema': 'auto'}, esquema='dark')
            antes = barra(pg)
            pg.emulate_media(color_scheme='light'); pg.wait_for_timeout(150)
            chk(antes == '#24282c' and barra(pg) == '#eef0ec', f'B. Automático: el teléfono pasa a claro y la franja también ({antes} -> {barra(pg)})')
            pg.emulate_media(color_scheme='dark'); pg.wait_for_timeout(150)
            chk(barra(pg) == '#24282c', f'B. y regresa a oscuro ({barra(pg)})')
            ctx.close()

            # C. cambiar fondo, velo y tema en Ajustes: cambia al momento
            ctx, pg, errs = abrir(b, {'fondo': 'combinado', 'tema': 'dark', 'velo': '0.78'})
            pg.click('.tabs button[data-view="vAjustes"]'); pg.wait_for_timeout(300)
            pg.click('#segVelo button[data-v="0.64"]'); pg.wait_for_timeout(150)
            chk(dist(deh(barra(pg)), encima(VELO_OSC, 0.64, ARRIBA['combinado'])) <= 1.5, f'C. velo "Mucho": {barra(pg)}')
            pg.click('#selFondo button:has-text("Rojo") >> nth=-1'); pg.wait_for_timeout(150)
            chk(dist(deh(barra(pg)), encima(VELO_OSC, 0.64, ARRIBA['rojo'])) <= 1.5, f'C. fondo Rojo: {barra(pg)}')
            pg.click('#selFondo button:has-text("Sin fondo")'); pg.wait_for_timeout(150)
            chk(barra(pg) == '#24282c', f'C. Sin fondo: {barra(pg)}')
            chk(not errs, 'C. sin errores: ' + '; '.join(errs))
            ctx.close()

            # D. corrida (demo): el velo sube a 0.92 y la franja también se oscurece; al salir regresa
            ctx, pg, errs = abrir(b, {'fondo': 'gallos', 'tema': 'dark', 'velo': '0.78'})
            antes = barra(pg)
            pg.click('#btnDemo'); pg.wait_for_timeout(600)
            chk(dist(deh(barra(pg)), encima(VELO_OSC, 0.92, ARRIBA['gallos'])) <= 1.5, f'D. en la corrida la franja va con el velo de 0.92 ({antes} -> {barra(pg)})')
            con_franja(pg, 'corrida')
            pg.wait_for_selector('.slip', timeout=40000); pg.wait_for_timeout(400)
            pg.click('#rSalir'); pg.wait_for_timeout(300)
            chk(barra(pg) == antes, f'D. al salir regresa ({barra(pg)})')
            chk(not errs, 'D. sin errores: ' + '; '.join(errs))
            ctx.close()

            # E. Práctica: el semáforo tapa la pantalla; la franja toma su color y al cerrarlo regresa
            for fid in ('neon', 'ninguno'):
                for tema in ('dark', 'light'):
                    ctx, pg, errs = abrir(b, {'fondo': fid, 'tema': tema})
                    antes = barra(pg)
                    pg.click('.tabs button[data-view="vPractica"]'); pg.wait_for_timeout(300)
                    pg.click('#btnPractica'); pg.wait_for_timeout(300)
                    if fid == 'ninguno': esperado = (0x14, 0x16, 0x18)
                    else: esperado = encima(VELO_OSC, 0.84, encima(VELO_OSC if tema == 'dark' else VELO_CLA, 0.78, ARRIBA[fid]))
                    chk(dist(deh(barra(pg)), esperado) <= 1.5, f'E. Práctica {fid} {tema}: {barra(pg)} = {hexa(esperado)}')
                    chk(dist(deh(barra(pg)), arriba_pintado(pg)) <= 30, f'E. se parece a lo pintado arriba ({hexa(arriba_pintado(pg))})')
                    if tema == 'light': con_franja(pg, f'practica_{fid}_claro')
                    pg.click('#ptCerrar'); pg.wait_for_timeout(300)
                    chk(barra(pg) == antes, f'E. al cerrar regresa ({barra(pg)} = {antes})')
                    chk(not errs, 'E. sin errores: ' + '; '.join(errs))
                    ctx.close()

            # F. pantalla de carga: la franja va del color de la carga y luego toma el del fondo
            ctx, pg, errs = abrir(b, {'fondo': 'combinado', 'tema': 'light'}, 'index.html?carga')
            chk(barra(pg) == '#141618', f'F. con la carga: {barra(pg)}')
            con_franja(pg, 'carga')
            pg.wait_for_function("!document.getElementById('carga')", timeout=4000); pg.wait_for_timeout(100)
            chk(dist(deh(barra(pg)), encima(VELO_CLA, 0.78, ARRIBA['combinado'])) <= 1.5, f'F. al quitarse toma el del fondo ({barra(pg)})')
            chk(not errs, 'F. sin errores: ' + '; '.join(errs))
            ctx.close()

            # G. pantallas de Samsung: nada se sale de lado, el logo no toca los sensores y el árbol de Práctica cabe
            for tel in TELEFONOS:
                for fid in ('gallos', 'ninguno'):
                    ctx, pg, errs = abrir(b, {'fondo': fid, 'tema': 'dark'}, tel=tel)
                    for v in ('vMedir', 'vPractica', 'vCalc', 'vHistorial', 'vAjustes'):
                        pg.click(f'.tabs button[data-view="{v}"]'); pg.wait_for_timeout(250)
                        r = pg.evaluate("""(() => { const de = document.documentElement, l = document.querySelector('.brand').getBoundingClientRect(),
                            s = document.querySelector('.sensors').getBoundingClientRect();
                            return { ancho: de.scrollWidth <= innerWidth, logo: l.right <= s.left + 1 || l.bottom <= s.top + 1 }; })()""")
                        chk(r['ancho'] and r['logo'], f'G. {tel} {fid} {v}: cabe de lado y el logo no toca los sensores ({r})')
                        if fid == 'gallos' and v == 'vMedir': con_franja(pg, f'medir_{tel.replace(" ", "_")}', tel)
                    for modo in ('solo', 'duelo'):
                        pg.click('.tabs button[data-view="vPractica"]'); pg.wait_for_timeout(250)
                        pg.evaluate(f"document.querySelector('#segPModo button[data-v=\"{modo}\"]')?.click()"); pg.wait_for_timeout(150)
                        pg.click('#btnPractica'); pg.wait_for_timeout(300)
                        r = pg.evaluate("""(() => { const t = document.querySelector('.pt-tree').getBoundingClientRect(),
                            focos = [...document.querySelectorAll('.pt-lane')].filter(x => x.offsetParent).map(x => x.getBoundingClientRect()),
                            res = document.querySelector('.pt-res').getBoundingClientRect(), z = document.querySelector('.pt-zones').getBoundingClientRect();
                            return { focos: focos.every(f => f.top >= 0 && f.bottom <= res.top + 1), zona: z.bottom <= innerHeight + 1, ancho: document.documentElement.scrollWidth <= innerWidth }; })()""")
                        chk(all(r.values()), f'G. {tel} {fid} Práctica {modo}: el árbol cabe sobre la reacción y el botón dentro de la pantalla ({r})')
                        if fid == 'gallos': con_franja(pg, f'practica_{modo}_{tel.replace(" ", "_")}', tel)
                        pg.click('#ptCerrar'); pg.wait_for_timeout(250)
                    chk(not errs, f'G. {tel} {fid} sin errores: ' + '; '.join(errs))
                    ctx.close()

            # H. cuando Chrome deje dibujar la app instalada detrás de la hora (lo están arreglando; Android 15+ ya lo hace
            # abajo, en la barra de gestos): con las zonas seguras de un S25 la app ya queda como en el iPhone, el fondo
            # detrás de la hora y la cámara, el logo abajo de ellas y las pestañas detrás de la barra de gestos.
            for fid in ('gallos', 'ninguno'):
                ctx = b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                    color_scheme='dark', user_agent=UA, locale='es-MX')
                ctx.add_init_script(f"localStorage.setItem('dragtrim.settings', JSON.stringify({json.dumps({'fondo': fid})})); localStorage.setItem('dragtrim.guiaOculta', 'true');")
                pg = ctx.new_page(); errs = []
                pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
                ctx.new_cdp_session(pg).send('Emulation.setSafeAreaInsetsOverride', {'insets': {'top': 32, 'topMax': 32, 'bottom': 24, 'bottomMax': 24,
                                                                                            'left': 0, 'leftMax': 0, 'right': 0, 'rightMax': 0}})
                pg.goto(f'http://localhost:{PUERTO}/index.html', wait_until='domcontentloaded'); pg.wait_for_timeout(400)
                r = pg.evaluate("""(() => { const top = document.querySelector('.brand').getBoundingClientRect(), t = document.querySelector('.tabs').getBoundingClientRect(),
                    b = document.querySelector('.tabs button').getBoundingClientRect();
                    return { logo: top.top >= 32, tabs: Math.abs(t.bottom - innerHeight) < 1 && b.bottom <= innerHeight - 24 + 1 }; })()""")
                im = Image.open(io.BytesIO(pg.screenshot(clip={'x': 0, 'y': 0, 'width': 412, 'height': 32}))).convert('L')
                varia = ImageStat.Stat(im).stddev[0]
                chk(r['logo'] and r['tabs'], f'H. {fid}: el logo queda abajo de la hora y la cámara y las pestañas arriba de la barra de gestos ({r})')
                chk(varia > 8 if fid != 'ninguno' else varia < 2, f'H. {fid}: detrás de la hora se ve {"el fondo" if fid != "ninguno" else "el color de la app"} (variación {varia:.1f})')
                pg.click('.tabs button[data-view="vPractica"]'); pg.wait_for_timeout(250)
                pg.click('#btnPractica'); pg.wait_for_timeout(300)
                r = pg.evaluate("""(() => ({ arriba: document.querySelector('.pt-top').getBoundingClientRect().top >= 32,
                    abajo: document.querySelector('.pt-zones').getBoundingClientRect().bottom <= innerHeight - 24 + 1 }))()""")
                chk(all(r.values()), f'H. {fid} Práctica: "Cerrar" abajo de la cámara y el botón arriba de la barra de gestos ({r})')
                if fid == 'gallos':
                    pg.click('#ptCerrar'); pg.wait_for_timeout(300)
                    app = Image.open(io.BytesIO(pg.screenshot())).convert('RGB'); d = ImageDraw.Draw(app)
                    d.text((36, 32), '9:41', fill=(240, 240, 240), anchor='lm', font_size=26)
                    d.ellipse((412 - 14, 32 - 14, 412 + 14, 32 + 14), fill=(0, 0, 0))
                    app.save(SH + 'barra_futuro_S25.png')
                chk(not errs, f'H. {fid} sin errores: ' + '; '.join(errs))
                ctx.close()
            b.close()
    finally:
        srv.terminate()
    print('FALLAS:', len(fallas))
    for f in fallas: print('  -', f)
    sys.exit(1 if fallas else 0)

main()
