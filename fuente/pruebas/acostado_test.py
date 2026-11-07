# Fondos con el teléfono acostado (7 nov 2026, Daniel: "cuando lo acuesta simplemente le hace zoom al fondo… que se vea con
# el mismo zoom con el que se ve un fondo cuando está el teléfono en vertical"). fuente/fondos/acostados.py arma cada fondo
# de lado (2700×1290) con los mismos stickers; build.py lo deja en fondos/<id>_h.webp con sus formas de Práctica.
#  A. Los 7 fondos traen su versión acostada (proporción de lado) y sus formas verde y roja de Práctica (que cubran
#     4–22 % de la pantalla, como las verticales).
#  B. Con el teléfono acostado y "Toda la app" (iPhone, S24 Ultra, S25 con la barra de arriba): el fondo es el acostado y
#     los stickers salen del tamaño que en vertical (a lo más 8 % más grandes; antes ~2.2 veces).
#  C. Práctica acostada: las formas que se prenden son las del acostado (y se cargan).
#  D. "No girar" (la app se queda de pie con el teléfono acostado) y el teléfono de pie: el fondo vertical.
#  E. Android acostado: la franja de la hora toma el color de arriba del acostado (ARRIBA_H).
#  F. El acostado se baja antes de girar (para la pista sin señal); con "No girar" en un teléfono, no se baja.
# Uso: python3 acostado_test.py -> capturas/acostado_*.png; sale con código 1 si algo falla.
import json, os, re, subprocess, sys, time
from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
DIST = os.environ.get('DIST_DRAG') or os.path.join(AQUI, '..', 'app', 'dist')
SH = os.path.join(AQUI, 'capturas', '')
os.makedirs(SH, exist_ok=True)
PUERTO = 8791
URL = f'http://localhost:{PUERTO}/index.html'
FONDOS = ['combinado', 'combinado_rojo', 'botella_nos', 'neon', 'rojo', 'blanco_negro', 'gallos']
UA_ANDROID = 'Mozilla/5.0 (Linux; Android 15; SM-S931B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'

fallas = []
def chk(cond, txt):
    print(('ok    ' if cond else 'FALLA ') + txt, flush=True)
    if not cond: fallas.append(txt)

def pagina(b, w, h, ajustes, ua=None):
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme='dark',
                        **({'user_agent': ua} if ua else {}))
    ctx.add_init_script(f"localStorage.setItem('dragtrim.settings', JSON.stringify({json.dumps(ajustes)})); localStorage.setItem('dragtrim.guiaOculta', 'true');")
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    pg.goto(URL); pg.wait_for_timeout(600)
    return ctx, pg, errs

def fondo_url(pg, sel='#fondo'):
    return pg.evaluate(f"getComputedStyle(document.querySelector('{sel}')).backgroundImage")

def escala(pg):
    """Píxeles de pantalla por píxel del fondo original (1290 de ancho en vertical, 1290 de alto acostado): lo que mide un sticker."""
    return pg.evaluate("""(async () => {
        const css = getComputedStyle(document.getElementById('fondo')).backgroundImage, url = css.slice(5, -2);
        const im = new Image(); im.src = url; await im.decode();
        const W = innerWidth, H = innerHeight, k = Math.max(W / im.naturalWidth, H / im.naturalHeight);
        const de_lado = im.naturalWidth > im.naturalHeight;
        return k * (de_lado ? im.naturalHeight : im.naturalWidth) / 1290; })()""")

def main():
    # ---------------- A. archivos
    for fid in FONDOS:
        ruta = os.path.join(DIST, 'fondos', f'{fid}_h.webp')
        if not os.path.exists(ruta):
            chk(False, f'A. {fid}: falta fondos/{fid}_h.webp'); continue
        im = Image.open(ruta)
        v = Image.open(os.path.join(DIST, 'fondos', f'{fid}.webp'))
        chk(abs(im.width / im.height - 2700 / 1290) < 0.01 and abs(im.height - v.width) <= 2,
            f'A. {fid}: el acostado mide {im.width}×{im.height} (de lado; su alto = el ancho del vertical, {v.width})')
        for c in ('verde', 'rojo'):
            m = Image.open(os.path.join(DIST, 'fondos', f'{fid}_h_brillo_{c}.webp')).getchannel('A')
            cubre = ImageStat.Stat(m.point(lambda x: 255 if x > 127 else 0)).mean[0] / 255 * 100
            chk(m.width > m.height and 4 <= cubre <= 22, f'A. {fid}: forma {c} del acostado ({m.width}×{m.height}) cubre {cubre:.1f} % de la pantalla')
    html = open(os.path.join(DIST, 'index.html'), encoding='utf-8').read()
    ARRIBA_H = json.loads(re.search(r'const ARRIBA_H = (\{[^}]*\})', html).group(1))
    chk(sorted(ARRIBA_H) == sorted(FONDOS), f'A. build.py dejó el color de arriba de los 7 acostados ({sorted(ARRIBA_H)})')

    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PUERTO), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.7)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            # ---------------- B. acostado: el fondo de lado, con los stickers del mismo tamaño
            for nombre, w, h in (('iphone', 852, 393), ('s24', 915, 412), ('s25', 780, 336)):
                for fid in ('gallos', 'neon') if nombre == 'iphone' else ('combinado',):
                    ctx, pg, errs = pagina(b, w, h, {'fondo': fid, 'tema': 'dark', 'orientacion': 'todo'})
                    u = fondo_url(pg)
                    k_lado = escala(pg)
                    pg.screenshot(path=SH + f'acostado_{nombre}_{fid}.png')
                    ctx.close()
                    ctx, pg, _ = pagina(b, h, w, {'fondo': fid, 'tema': 'dark', 'orientacion': 'todo'})   # el mismo teléfono de pie
                    k_pie = escala(pg)
                    ctx.close()
                    chk(f'{fid}_h.webp' in u, f'B. {nombre} {w}×{h} {fid}: con el teléfono acostado el fondo es el acostado ({u[-40:]})')
                    chk(0.97 <= k_lado / k_pie <= 1.08, f'B. {nombre} {fid}: los stickers miden lo mismo que de pie ({k_lado / k_pie:.3f} veces; antes ~2.2)')
                    chk(not errs, f'B. {nombre} {fid} sin errores: ' + '; '.join(errs))
            # ---------------- C. Práctica acostada
            ctx, pg, errs = pagina(b, 852, 393, {'fondo': 'combinado', 'tema': 'dark', 'orientacion': 'todo'})
            pg.click('.tabs button[data-view="vPractica"]'); pg.wait_for_timeout(300)
            pg.click('#segPModo button:nth-child(2)'); pg.click('#btnPractica'); pg.wait_for_timeout(600)
            mascaras = pg.evaluate("""[...document.querySelectorAll('.ptg > i')].map((e) => getComputedStyle(e).maskImage || getComputedStyle(e).webkitMaskImage)""")
            chk(all('_h_brillo_' in m for m in mascaras), f'C. Práctica acostada usa las formas del acostado ({[m[-34:] for m in mascaras]})')
            carga = pg.evaluate("""Promise.all(['verde', 'rojo'].map((c) => fetch('fondos/combinado_h_brillo_' + c + '.webp').then((r) => r.ok)))""")
            chk(all(carga), f'C. las formas del acostado se cargan ({carga})')
            pg.screenshot(path=SH + 'acostado_practica.png')
            chk(not errs, 'C. sin errores: ' + '; '.join(errs))
            ctx.close()
            # ---------------- D. "No girar" con el teléfono acostado (app girada) y de pie: el vertical
            ctx, pg, errs = pagina(b, 852, 393, {'fondo': 'gallos', 'tema': 'dark', 'orientacion': 'no'})
            c = pg.evaluate("document.documentElement.className")
            u = fondo_url(pg)
            chk('girada' in c and 'gallos.webp' in u and '_h' not in u, f'D. "No girar" (app de pie con el teléfono acostado): el fondo vertical ({c}; {u[-30:]})')
            pg.screenshot(path=SH + 'acostado_girada.png')
            ctx.close()
            ctx, pg, errs = pagina(b, 393, 852, {'fondo': 'gallos', 'tema': 'dark', 'orientacion': 'todo'})
            u = fondo_url(pg)
            chk('gallos.webp' in u and '_h' not in u, f'D. teléfono de pie: el fondo vertical ({u[-30:]})')
            # al acostarlo cambia al de lado, y al regresar, al vertical
            pg.set_viewport_size({'width': 852, 'height': 393}); pg.wait_for_timeout(400)
            u2 = fondo_url(pg)
            pg.set_viewport_size({'width': 393, 'height': 852}); pg.wait_for_timeout(400)
            u3 = fondo_url(pg)
            chk('gallos_h.webp' in u2 and 'gallos.webp' in u3 and '_h' not in u3, f'D. al girar el teléfono cambia de fondo y regresa ({u2[-20:]} / {u3[-20:]})')
            chk(not errs, 'D. sin errores: ' + '; '.join(errs))
            ctx.close()
            # ---------------- E. Android acostado: la franja de la hora con el color de arriba del acostado
            VELO = (10, 10, 11)
            ctx, pg, errs = pagina(b, 780, 336, {'fondo': 'combinado', 'tema': 'dark', 'orientacion': 'todo', 'velo': '0.78'}, UA_ANDROID)
            barra = pg.evaluate("document.querySelector('meta[name=\"theme-color\"]').content")
            esperado = '#' + ''.join(f'{round(VELO[i] * 0.78 + ARRIBA_H["combinado"][i] * 0.22):02x}' for i in range(3))
            dif = sum((int(barra[i:i + 2], 16) - int(esperado[i:i + 2], 16)) ** 2 for i in (1, 3, 5)) ** 0.5
            chk(dif <= 1.8, f'E. Android acostado: la franja de la hora toma lo de arriba del fondo acostado ({barra}, esperado {esperado})')
            ctx.close()
            # ---------------- F. el acostado se baja antes de girar; con "No girar" en un teléfono, no
            for orient, debe in (('todo', True), ('no', False)):
                ctx, pg, errs = pagina(b, 393, 852, {'fondo': 'rojo', 'tema': 'dark', 'orientacion': orient})
                pg.wait_for_timeout(3200)
                pedidos = pg.evaluate("performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('_h'))")
                bajado = any('rojo_h.webp' in n for n in pedidos)
                chk(bajado == debe, f'F. con "{orient}" el fondo acostado {"se baja" if debe else "no se baja"} antes de girar ({[n.split("/")[-1] for n in pedidos]})')
                chk(not errs, f'F. {orient} sin errores: ' + '; '.join(errs))
                ctx.close()
            b.close()
    finally:
        srv.terminate()
    print('\n' + ('TODO BIEN' if not fallas else f'{len(fallas)} FALLAS'))
    sys.exit(1 if fallas else 0)


if __name__ == '__main__':
    main()
