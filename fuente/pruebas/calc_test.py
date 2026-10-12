# Prueba de la pestaña "Calcular" (calculadora Rooster Racing) en Chromium headless.
# Usa la app construida (fuente/app/dist). GPS y clima falsos: no sale a internet.
# Uso: python3 calc_test.py   -> capturas en capturas/calc_*.png; sale con código 1 si algo falla.
import asyncio, json, os, subprocess, sys
from playwright.async_api import async_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(AQUI, '..', 'app', 'dist')
SH = os.path.join(AQUI, 'capturas', '')
os.makedirs(SH, exist_ok=True)
PUERTO = 8781

# GPS falso controlable desde la prueba: window.__geo = {lat, lon, alt} o {error: código}
GEO = """
window.__geo = { lat: 28.64, lon: -106.07, alt: 1555 };
const fake = {
  getCurrentPosition(ok, mal) {
    setTimeout(() => {
      const g = window.__geo;
      if (g.error) { mal({ code: g.error, message: 'falso' }); return; }
      ok({ coords: { latitude: g.lat, longitude: g.lon, altitude: g.alt, accuracy: 8, altitudeAccuracy: 10, speed: null, heading: null }, timestamp: Date.now() });
    }, 50);
  },
  watchPosition() { return 1; }, clearWatch() {},
};
Object.defineProperty(navigator, 'geolocation', { value: fake, configurable: true });
"""
CLIMA = {"latitude": 28.64, "longitude": -106.07, "elevation": 1556.0,
         "current": {"time": "2026-10-12T14:30", "interval": 900, "temperature_2m": 24.0, "relative_humidity_2m": 30, "surface_pressure": 842.0}}

fallas = []
def chk(cond, txt):
    print(('ok    ' if cond else 'FALLA ') + txt)
    if not cond: fallas.append(txt)

async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PUERTO), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                      color_scheme='dark', locale='es-MX')
            await ctx.add_init_script(GEO)
            modo_clima = {'v': 'ok'}
            async def ruta(route):
                if modo_clima['v'] == 'ok':
                    await route.fulfill(status=200, content_type='application/json', body=json.dumps(CLIMA), headers={'Access-Control-Allow-Origin': '*'})
                else:
                    await route.abort()
            await ctx.route('https://api.open-meteo.com/**', ruta)
            pg = await ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
            # El "sin internet" simulado aborta la consulta del clima a propósito: ese error de red no cuenta.
            pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text}')
                  if m.type == 'error' and not (modo_clima['v'] != 'ok' and 'ERR_FAILED' in m.text) else None)
            await pg.goto(f'http://localhost:{PUERTO}/index.html')
            await pg.wait_for_timeout(600)

            async def tabla():
                return await pg.eval_on_selector_all('#cTabla tr', 'trs => trs.map(t => [...t.children].map(c => c.textContent.trim()))')
            async def escribe(sel, val):
                await pg.fill(sel, str(val)); await pg.dispatch_event(sel, 'input'); await pg.wait_for_timeout(50)

            # 1) valores de la hoja por defecto
            await pg.click('.tabs button[data-view="vCalc"]'); await pg.wait_for_timeout(700)
            await pg.screenshot(path=SH + 'calc_01_inicio.png', full_page=True)
            t = await tabla()
            print(t)
            fila = {r[0]: r[1:] for r in t}
            chk(fila['1/4 tiempo'] == ['≈ 12.97 s', '≈ 11.93 s'], 'ET 1/4 igual a la hoja (E3 12.97 / I3 11.93)')
            chk(fila['1/4 velocidad'] == ['≈ 169.1 km/h', '≈ 183.9 km/h'], 'velocidad 1/4 igual a la hoja (F3 169.07 / J3 183.93)')
            chk(fila['1/8 tiempo'] == ['≈ 8.29 s', '≈ 7.62 s'], '1/8 igual a la hoja (E5 / I5)')
            chk(fila['1/8 velocidad'] == ['≈ 133.1 km/h', '≈ 144.8 km/h'], 'velocidad 1/8 igual a la hoja (F5 / J5)')
            chk(fila['60 ft típico'] == ['≈ 1.88 s', '≈ 1.73 s'], '60 ft igual a la hoja (D3 / H3)')
            chk(fila['0–60 mph'] == ['≈ 5.14 s', '≈ 4.43 s'], '0-60 corregido (= hoja con B1=0: 5.137 / 4.428)')
            chk(fila['Caballos en la llanta'] == ['≈ 281 hp', '≈ 361 hp'], 'caballos en la llanta (G3 / K3)')
            da = await pg.text_content('#cDaRes')
            chk('7,443' in da and '78 %' in da, f'DA de la hoja 7,443 ft y rinde 78 %: {da!r}')
            meta = await pg.text_content('#cMetaRes')
            chk('4,791 lb' in meta, f'peso para 15.00 s = C8 4,791 lb: {meta!r}')

            # 2) kg: mismo auto, mismos tiempos
            await pg.click('#segCPesoU button[data-v="kg"]'); await pg.wait_for_timeout(100)
            chk(await pg.input_value('#cPeso') == '1406', 'peso convertido a 1406 kg')
            chk((await tabla())[0][1] == '≈ 12.97 s', 'en kg el tiempo no cambia')
            chk('kg' in await pg.text_content('#cMetaRes'), 'meta en kg')
            await pg.click('#segCPesoU button[data-v="lb"]'); await pg.wait_for_timeout(100)
            chk(await pg.input_value('#cPeso') == '3100', 'de regreso a 3100 lb')

            # 3) nitro y turbo
            await pg.click('#segCMotor button[data-v="nitro"]'); await escribe('#cNitro', 150)
            nit = await pg.evaluate("Rooster.predecir({peso:3100,hp:420,motor:'nitro',nitro:150,da:Rooster.densidadHoja(20,5100)}).pista.et14.toFixed(2)")
            chk((await tabla())[0][1] == f'≈ {nit} s', f'nitro 150: {nit} s')
            await pg.click('#segCMotor button[data-v="turbo"]'); await escribe('#cBoost', 10)
            tur = await pg.evaluate("Rooster.predecir({peso:3100,hp:420,motor:'turbo',boost:10,da:Rooster.densidadHoja(20,5100)}).pista.et14.toFixed(2)")
            chk((await tabla())[0][1] == f'≈ {tur} s', f'turbo 10 psi: {tur} s')
            pamb = await pg.text_content('#cPAmb')
            chk('11.15 psi' in pamb, f'presión para el turbo a DA 7443 = 11.15 psi: {pamb!r}')
            await pg.screenshot(path=SH + 'calc_02_turbo.png', full_page=True)
            await pg.click('#segCMotor button[data-v="atmos"]'); await pg.wait_for_timeout(100)
            chk((await tabla())[0][1] == '≈ 12.97 s', 'atmosférico otra vez 12.97')

            # 4) pista, DA directa
            await pg.select_option('#cPista', 'monterrey'); await pg.wait_for_timeout(100)
            chk(await pg.input_value('#cAlt') == '1440', 'Monterrey pone 1440 ft')
            dm = await pg.evaluate("Math.round(Rooster.densidadHoja(20,1440)).toLocaleString('es-MX')")
            chk(dm in await pg.text_content('#cDaRes'), f'DA de Monterrey {dm}')
            await escribe('#cAlt', 6000)
            chk(await pg.input_value('#cPista') == 'otra', 'altura escrita = "Otra altura"')
            await pg.check('#cDaSe'); await pg.wait_for_timeout(100)
            await escribe('#cDa', 8000)
            chk('8,000' in await pg.text_content('#cDaRes'), 'DA escrita a mano 8,000')
            chk(await pg.is_hidden('#cTempBox'), 'con DA a mano se oculta la temperatura')
            await pg.uncheck('#cDaSe'); await pg.select_option('#cPista', 'villa'); await pg.wait_for_timeout(100)

            # 5) mph desde Ajustes
            await pg.click('.tabs button[data-view="vAjustes"]'); await pg.click('#segUnidad button[data-v="mph"]')
            await pg.click('.tabs button[data-view="vCalc"]'); await pg.wait_for_timeout(500)
            chk((await tabla())[1][1] == '≈ 105.1 mph', 'en mph: 105.1 (F3 con B1=0)')
            await pg.click('.tabs button[data-view="vAjustes"]'); await pg.click('#segUnidad button[data-v="kmh"]')
            await pg.click('.tabs button[data-view="vCalc"]'); await pg.wait_for_timeout(500)

            # 6) En la pista (teléfono): GPS + clima falso
            await pg.click('#segCAire button[data-v="tel"]'); await pg.wait_for_timeout(100)
            chk('Toca' in await pg.text_content('#cDaRes'), 'sin lectura pide tocar el botón')
            chk((await tabla())[0][1] == '—', 'sin lectura no hay tiempos')
            await pg.click('#cBtnAqui'); await pg.wait_for_function("document.querySelector('#cLectura') && !document.querySelector('#cLectura').hidden", timeout=5000)
            await pg.wait_for_timeout(200)
            dr = await pg.evaluate("Math.round(Rooster.densidadReal(842, 24, 30)).toLocaleString('es-MX')")
            txt = await pg.text_content('#cDaRes')
            chk(dr in txt and 'clima' in txt, f'DA real con clima 842 hPa 24 °C 30 %: {dr} — {txt!r}')
            lec = await pg.text_content('#cLectura')
            chk('842 hPa' in lec and '24.0 °C' in lec and '30 %' in lec and '1,555 m' in lec and 'GPS' in lec, f'lectura mostrada: {lec!r}')
            await pg.screenshot(path=SH + 'calc_03_telefono.png', full_page=True)

            # 7) sin internet: altitud del GPS + temperatura escrita
            modo_clima['v'] = 'sin red'
            await pg.click('#cBtnAqui'); await pg.wait_for_function("!document.querySelector('#cTempTelBox').hidden", timeout=15000)
            est = await pg.text_content('#cEstado')
            chk('Sin internet' in est, f'aviso sin internet: {est!r}')
            await escribe('#cTempTel', 30)
            dg = await pg.evaluate("Math.round(Rooster.densidadReal(Rooster.presionISA_hPa(1555), 30, 0)).toLocaleString('es-MX')")
            chk(dg in await pg.text_content('#cDaRes'), f'DA con GPS y 30 °C: {dg}')
            await pg.screenshot(path=SH + 'calc_04_sin_red.png', full_page=True)

            # 8) sin permiso de ubicación
            await pg.evaluate("window.__geo = { error: 1 }")
            await pg.click('#cBtnAqui'); await pg.wait_for_timeout(400)
            est = await pg.text_content('#cEstado')
            chk('permiso' in est, f'aviso sin permiso: {est!r}')
            await pg.evaluate("window.__geo = { lat: 28.64, lon: -106.07, alt: 1555 }")
            modo_clima['v'] = 'ok'

            # 9) caballos con tu tiempo
            await pg.click('#segCAire button[data-v="manual"]')
            await pg.click('.c-inv summary'); await pg.wait_for_timeout(200)
            await pg.click('#segCInvD button[data-v="8"]'); await pg.click('#segCInvDato button[data-v="v"]')
            await escribe('#cInvVal', 132.4)
            esp = await pg.evaluate("Math.round(Rooster.caballosDesde({peso:3100, da:Rooster.densidadHoja(20,5100), dato:'v18', valor:132.4/1.60934}).hp).toLocaleString('es-MX')")
            inv = await pg.text_content('#cInvRes')
            chk(f'{esp} hp' in inv, f'caballos con 1/8 a 132.4 km/h: {esp} — {inv!r}')
            await pg.screenshot(path=SH + 'calc_05_inverso.png', full_page=True)

            # 10) se guarda al recargar
            await escribe('#cHp', 500)
            await pg.reload(); await pg.wait_for_timeout(500)
            await pg.click('.tabs button[data-view="vCalc"]'); await pg.wait_for_timeout(500)
            chk(await pg.input_value('#cHp') == '500', 'los datos se guardan en el teléfono')
            await escribe('#cHp', 420)

            # 11) barra de 5 pestañas en pantallas angostas, tema claro y sin fondo
            for ancho in (390, 360, 320):
                await pg.set_viewport_size({'width': ancho, 'height': 700}); await pg.wait_for_timeout(250)
                sobra = await pg.eval_on_selector_all('.tabs button', 'bs => bs.filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent)')
                anchos = await pg.eval_on_selector_all('.tabs button', 'bs => bs.map(b => Math.round(b.getBoundingClientRect().width))')
                chk(not sobra and max(anchos) - min(anchos) <= 1, f'pestañas a {ancho}px: anchos {anchos}, se salen {sobra}')
                for v in ('vMedir', 'vCalc', 'vAjustes'):
                    await pg.evaluate(f"document.querySelector('.tabs button[data-view={v}]').click()"); await pg.wait_for_timeout(450)
                    sw = await pg.evaluate('document.documentElement.scrollWidth')
                    chk(sw <= ancho, f'{v} a {ancho}px sin desplazamiento lateral (ancho de página {sw})')
                await pg.evaluate("document.querySelector('.tabs button[data-view=vCalc]').click()"); await pg.wait_for_timeout(450)
                await pg.screenshot(path=SH + f'calc_06_tabs_{ancho}.png')
            await pg.set_viewport_size({'width': 390, 'height': 844})
            await pg.click('.tabs button[data-view="vAjustes"]'); await pg.click('#segTema button[data-v="light"]')
            await pg.click('#selFondo button >> nth=0') if await pg.query_selector('#selFondo button') else None
            await pg.click('.tabs button[data-view="vCalc"]'); await pg.wait_for_timeout(700)
            await pg.screenshot(path=SH + 'calc_07_claro.png', full_page=True)

            # 12) la pestaña no rompe la corrida simulada (barra oculta en sesión)
            await pg.click('.tabs button[data-view="vMedir"]'); await pg.click('#btnDemo'); await pg.wait_for_timeout(400)
            chk(await pg.is_hidden('.tabs'), 'en una corrida la barra sigue oculta')
            await pg.click('#btnCancelar'); await pg.wait_for_timeout(300)

            chk(not errs, 'sin errores en consola: ' + '; '.join(errs))
            await b.close()
    finally:
        srv.terminate()
    print('FALLAS:', len(fallas))
    sys.exit(1 if fallas else 0)

asyncio.run(main())
