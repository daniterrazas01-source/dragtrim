"""Página de prueba de la cámara (dist/prueba/camara.html) en Chromium con cámara falsa y giroscopio simulado.
Recorre los 6 pasos (la prueba larga con ?larga=20) y revisa el archivo de resultados.
Uso: python3 prueba_camara_test.py   (antes: python3 ../app/tools/build_prueba.py)"""
import http.server, json, os, pathlib, socketserver, sys, tempfile, threading, time
from playwright.sync_api import sync_playwright

AQUI = pathlib.Path(__file__).resolve().parent
PAG = AQUI.parent / 'app' / 'dist' / 'prueba' / 'camara.html'
CAPT = AQUI / 'capturas'; CAPT.mkdir(exist_ok=True)
fallas, oks = [], []
def ok(c, msg):
    (oks if c else fallas).append(msg); print(('ok    ' if c else 'FALLA ') + msg)

raiz = tempfile.mkdtemp()
os.makedirs(os.path.join(raiz, 'prueba'))
with open(os.path.join(raiz, 'prueba', 'camara.html'), 'w', encoding='utf-8') as f:
    f.write(PAG.read_text(encoding='utf-8'))
with open(os.path.join(raiz, 'index.html'), 'w') as f:
    f.write('<!doctype html><title>app</title>')

class Silencio(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=raiz, **k)
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), Silencio); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

# giroscopio simulado a 100 Hz (el de la cámara falsa no se mueve: K1 debe decir que no pudo, sin romperse)
GIRO = """
(() => {
  let i = 0;
  setInterval(() => {
    const e = new Event('devicemotion');
    e.rotationRate = { alpha: 2 * Math.sin(i / 7), beta: 1.5 * Math.cos(i / 9), gamma: 0.5 };
    e.accelerationIncludingGravity = { x: 0.1, y: 9.7, z: 0.3 };
    i++; window.dispatchEvent(e);
  }, 10);
})();
"""

def esperar(pg, cond, seg, msg):
    t0 = time.time()
    while time.time() - t0 < seg:
        if pg.evaluate(cond): return True
        pg.wait_for_timeout(250)
    ok(False, msg + ' (tiempo agotado)'); return False

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
    for tema in ['dark', 'light']:
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, color_scheme=tema, accept_downloads=True)
        ctx.grant_permissions(['camera'])
        pg = ctx.new_page()
        errores = []
        pg.on('pageerror', lambda e: errores.append(str(e)))
        pg.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
        pg.add_init_script(GIRO)
        pg.goto(f'http://127.0.0.1:{PORT}/prueba/camara.html?larga=20')
        pg.wait_for_timeout(500)
        if tema == 'light':
            pg.screenshot(path=str(CAPT / 'prueba_camara_inicio_claro.png'), full_page=True)
            ok(pg.evaluate('document.documentElement.scrollWidth') <= 390, 'claro: sin scroll horizontal')
            ok(not errores, f'claro: sin errores {errores}')
            ctx.close(); continue
        ok(pg.evaluate('document.documentElement.scrollWidth') <= 390, 'sin scroll horizontal a 390 px')
        ok(pg.locator('#dondeAbierta').inner_text() == 'en el navegador', 'detecta que está en el navegador')
        # paso 1
        pg.click('#b1')
        if esperar(pg, "document.getElementById('e1').textContent.includes('Listo') || document.getElementById('e1').className.includes('mal')", 60, 'paso 1 termina'):
            R = pg.evaluate('window.__pruebaCamara.R()')
            ok('Listo' in pg.locator('#e1').inner_text(), 'paso 1: listo')
            vi, oc = R['rutas']['visible'], R['rutas']['oculto']
            ok(R['camara']['video']['w'] > 0, f"cámara abierta {R['camara']['video']}")
            # la cámara falsa de Chromium da 20–30 cuadros/s (según la carga de la máquina)
            ok(vi['cuadros'] > 100 and (vi['fps_media'] or 0) >= 15, f"a la vista: {vi['cuadros']} cuadros, {vi['fps_media']} fps")
            ok(oc['cuadros'] > 100 and (oc['fps_media'] or 0) >= 15, f"escondida: {oc['cuadros']} cuadros, {oc['fps_media']} fps")
            ok(oc['proc_ms'] and oc['proc_ms']['px'] <= 40000 and oc['proc_ms']['mediana'] < 20, f"proceso por cuadro {oc['proc_ms']}")
            ok(oc['captureTime']['fraccion'] >= 0, f"captureTime {oc['captureTime']}")
            ok(R['movimiento']['hz'] and R['movimiento']['hz'] > 50, f"giroscopio {R['movimiento']['hz']} Hz")
            ok(isinstance(R['rutas']['mstp'], dict), f"MSTP {R['rutas']['mstp']}")
            ok(pg.evaluate("document.getElementById('video').classList.contains('oculto')") is False, 'el video vuelve a verse al terminar')
            pg.screenshot(path=str(CAPT / 'prueba_camara_paso1.png'), full_page=True)
        # paso 2: K1 (la imagen falsa no sigue al giroscopio)
        pg.click('#b2')
        if esperar(pg, "window.__pruebaCamara.R().k1.length >= 1", 40, 'paso 2 termina'):
            k = pg.evaluate('window.__pruebaCamara.R().k1[0]')
            ok(k['cuadros'] > 100 and k['giro'] > 300, f"K1 con {k['cuadros']} cuadros y {k['giro']} lecturas")
            ok('delta_ms' in k and 'rho' in k and 'motivo' in k, f"K1 informa {k}")
            ok(k['ms_analisis'] is not None and k['ms_analisis'] < 8000, f"K1 analiza en {k['ms_analisis']} ms")
            ok('Intento 1' in pg.locator('#r2').inner_text(), 'K1 muestra el intento')
        # paso 3: apagar y prender
        pg.click('#b3')
        if esperar(pg, "!document.getElementById('preg3').hidden", 20, 'paso 3 pregunta'):
            pg.click('#b3no')
            R = pg.evaluate('window.__pruebaCamara.R()')
            ok(R['permiso']['respuesta'] == 'no' and R['permiso']['ms_reabrir'] is not None, f"permiso {R['permiso']}")
        # paso 4: salir y volver (se simula el cambio de visibilidad)
        pg.click('#b4')
        pg.evaluate("""() => { const d = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
          window.__vis = 'hidden'; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis });
          document.dispatchEvent(new Event('visibilitychange')); }""")
        pg.wait_for_timeout(1500)
        pg.evaluate("() => { window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); }")
        if esperar(pg, "!!window.__pruebaCamara.R().segundo_plano", 15, 'paso 4 termina'):
            sp = pg.evaluate('window.__pruebaCamara.R().segundo_plano')
            ok(sp['volvio'] is True and len(sp['eventos']) == 2, f"segundo plano {sp}")
        # paso 5: prueba larga corta (?larga=20)
        pg.click('#b5')
        if esperar(pg, "document.getElementById('e5').textContent.startsWith('Listo') || document.getElementById('e5').textContent.startsWith('No llegaron')", 45, 'paso 5 termina'):
            L = pg.evaluate('window.__pruebaCamara.R().larga')
            ok(len(L['bins']) == 2 and all(x['fps'] and x['fps'] >= 15 for x in L['bins']), f"prueba larga {L['bins']}")
        # paso 6: resumen y archivo
        txt = pg.locator('#r6').inner_text()
        ok('cuadros por segundo' in txt and 'Giroscopio' in txt, 'resumen en español')
        with pg.expect_download() as dl:
            pg.click('#b6d')
        ruta = dl.value.path()
        data = json.loads(open(ruta, encoding='utf-8').read())
        ok(data['pagina'] == 'prueba_camara v1' and data['entorno']['rvfc'] is True, 'archivo JSON con entorno')
        ok(all(k in data for k in ['camara', 'rutas', 'movimiento', 'k1', 'permiso', 'segundo_plano', 'larga']), f"archivo con todas las secciones {sorted(data)}")
        sinId = all(k not in (data['camara'].get(c) or {}) for c in ('settings', 'capabilities') for k in ('deviceId', 'groupId'))
        sinId = sinId and all(set(x) <= {'etiqueta', 'tipo'} for x in (data.get('camaras') or []))
        ok(sinId, 'el archivo no trae identificadores del dispositivo (deviceId/groupId)')
        ok(dl.value.suggested_filename.startswith('prueba_camara_') and dl.value.suggested_filename.endswith('.json'), f"nombre {dl.value.suggested_filename}")
        # "Enviar" sin navigator.share → también descarga
        with pg.expect_download() as dl2:
            pg.click('#b6')
        ok(dl2.value.suggested_filename.endswith('.json'), 'Enviar sin compartir: descarga')
        # se recuerda al recargar
        pg.reload(); pg.wait_for_timeout(600)
        ok('cuadros por segundo' in pg.locator('#r6').inner_text(), 'al recargar conserva los resultados')
        pg.screenshot(path=str(CAPT / 'prueba_camara_resultados.png'), full_page=True)
        ok(not errores, f'sin errores en consola {errores[:3]}')
        ctx.close()
    b.close()
srv.shutdown()
print(f'\n{len(oks)} bien, {len(fallas)} fallas')
print('FALLAS: ' + str(len(fallas)))
sys.exit(1 if fallas else 0)
