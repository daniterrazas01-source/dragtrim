# Guía de instalación y compatibilidad: iPhone, iPad (vertical y horizontal), Android, Chrome en iOS,
# navegador dentro de Instagram, Samsung Internet. Capturas en capturas/inst_*.png; código 1 si algo falla.
import asyncio, os, subprocess, sys
from playwright.async_api import async_playwright
AQUI = os.path.dirname(os.path.abspath(__file__)); DIST = os.path.join(AQUI, '..', 'app', 'dist'); SH = os.path.join(AQUI, 'capturas', '')
os.makedirs(SH, exist_ok=True); PUERTO = 8784
IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'
CRIOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1'
INSTA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0'
ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36'
SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0 Mobile Safari/537.36'
IPAD_INIT = "Object.defineProperty(navigator, 'platform', {get: () => 'MacIntel'}); Object.defineProperty(navigator, 'maxTouchPoints', {get: () => 5});"
CASOS = [
  ('iphone', IPHONE, (390, 844), None, ['Compartir', 'barra de abajo', 'Agregar a inicio', 'Abrir en Safari']),
  ('ipad_vertical', IPAD, (820, 1180), IPAD_INIT, ['Compartir', 'arriba a la derecha', 'Agregar a inicio']),
  ('ipad_horizontal', IPAD, (1180, 820), IPAD_INIT, ['arriba a la derecha']),
  ('iphone_chrome', CRIOS, (390, 844), None, ['junto a la barra de la dirección', 'Agregar a inicio']),
  ('instagram', INSTA, (390, 844), None, ['dentro de otra app', 'Abrir en el navegador', 'Safari']),
  ('android', ANDROID, (412, 915), None, ['⋮', 'Instalar app']),
  ('samsung', SAMSUNG, (384, 854), None, ['≡', 'Pantalla de inicio']),
]
fallas = []
def chk(c, t):
    print(('ok    ' if c else 'FALLA ') + t)
    if not c: fallas.append(t)
async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PUERTO), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            for nombre, ua, (w, h), init, esperado in CASOS:
                ctx = await b.new_context(viewport={'width': w, 'height': h}, user_agent=ua, is_mobile=True, has_touch=True, locale='es-MX', device_scale_factor=2)
                if init: await ctx.add_init_script(init)
                pg = await ctx.new_page(); errs = []
                pg.on('pageerror', lambda e: errs.append(str(e)))
                await pg.goto(f'http://localhost:{PUERTO}/index.html'); await pg.wait_for_timeout(900)
                vis = await pg.is_visible('#guiaMedir')
                txt = (await pg.text_content('#guiaMedir .guia-pasos')) or ''
                chk(vis and all(e in txt for e in esperado), f'{nombre}: guía visible y dice {esperado}')
                contraste = await pg.evaluate('''() => {
                  const rgb = (c) => c.match(/[\\d.]+/g).map(Number);
                  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
                  const f = lum(rgb(getComputedStyle(document.querySelector('.tabs')).backgroundColor)), t = lum(rgb(getComputedStyle(document.querySelector('.tabs button:not([aria-current])')).color));
                  return (Math.max(f, t) + .05) / (Math.min(f, t) + .05); }''')
                chk(contraste >= 4.5, f'{nombre}: letras de las pestañas legibles (contraste {contraste:.1f})')
                sw = await pg.evaluate('document.documentElement.scrollWidth')
                chk(sw <= w, f'{nombre}: sin desplazamiento lateral ({sw} px de {w})')
                await pg.screenshot(path=SH + f'inst_{nombre}.png')
                if nombre.startswith('ipad'):
                    for v in ('vCalc', 'vAjustes'):
                        await pg.click(f'.tabs button[data-view="{v}"]'); await pg.wait_for_timeout(500)
                        await pg.screenshot(path=SH + f'inst_{nombre}_{v}.png')
                    await pg.click('.tabs button[data-view="vPractica"]'); await pg.click('#btnPractica'); await pg.wait_for_timeout(500)
                    caja = await pg.evaluate("(() => { const r = document.querySelector('.pt-tree').getBoundingClientRect(); const z = document.querySelector('.pt-zones').getBoundingClientRect(); return [r.height, z.height, innerHeight]; })()")
                    chk(caja[0] > 150 and caja[1] > 100, f'{nombre}: semáforo y zona de toque caben ({caja})')
                    await pg.screenshot(path=SH + f'inst_{nombre}_practica.png')
                    await pg.click('#ptCerrar')
                if nombre == 'iphone':
                    await pg.click('#guiaOcultar'); await pg.wait_for_timeout(200)
                    chk(await pg.is_hidden('#guiaMedir'), 'iphone: "Ahora no" oculta la guía')
                    await pg.reload(); await pg.wait_for_timeout(600)
                    chk(await pg.is_hidden('#guiaMedir'), 'iphone: sigue oculta al volver a abrir')
                    await pg.click('.tabs button[data-view="vAjustes"]'); await pg.wait_for_timeout(400)
                    chk('Agregar a inicio' in (await pg.text_content('#guiaAjustes')), 'iphone: los pasos siguen en Ajustes')
                if nombre == 'android':
                    # simula el aviso de instalación de Chrome
                    await pg.evaluate("""(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__prompt = 1; }; e.userChoice = Promise.resolve({outcome: 'accepted'}); window.dispatchEvent(e); })()""")
                    await pg.wait_for_timeout(200)
                    chk(await pg.is_visible('#guiaMedir [data-instalar]'), 'android: aparece el botón Instalar app')
                    await pg.click('#guiaMedir [data-instalar]'); await pg.wait_for_timeout(200)
                    chk(await pg.evaluate('window.__prompt === 1'), 'android: el botón abre el instalador de Chrome')
                    await pg.screenshot(path=SH + 'inst_android_boton.png')
                chk(not errs, f'{nombre}: sin errores {errs}')
                await ctx.close()
            # instalada (pantalla completa): no hay guía en Medir
            ctx = await b.new_context(viewport={'width': 390, 'height': 844}, user_agent=IPHONE, is_mobile=True, has_touch=True)
            await ctx.add_init_script("Object.defineProperty(navigator, 'standalone', {get: () => true});")
            pg = await ctx.new_page(); await pg.goto(f'http://localhost:{PUERTO}/index.html'); await pg.wait_for_timeout(700)
            chk(await pg.is_hidden('#guiaMedir'), 'instalada: no muestra la guía en Medir')
            # computadora: no muestra la guía en Medir; no hay botón para compartir (Daniel pasa el enlace en persona)
            ctx2 = await b.new_context(viewport={'width': 1200, 'height': 800})
            pg = await ctx2.new_page(); await pg.goto(f'http://localhost:{PUERTO}/index.html'); await pg.wait_for_timeout(700)
            chk(await pg.is_hidden('#guiaMedir'), 'computadora: sin guía en Medir')
            chk(await pg.query_selector('#btnCompartir') is None, 'no hay botón de compartir')
            await b.close()
    finally: srv.terminate()
    print('FALLAS:', len(fallas)); sys.exit(1 if fallas else 0)
asyncio.run(main())
