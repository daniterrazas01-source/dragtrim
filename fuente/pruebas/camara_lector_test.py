"""camara.js (DragCam) en Chromium con cámara falsa: el video es un árbol Full simulado (arbol_y4m.js) en bucle.
Revisa el Lector (graba sin analizar nada, zona, escala, vista general, detener/congelar) y Apuntar (tocar el árbol
define la zona del carril, modo prueba lee el árbol, Listo devuelve la zona; vertical y horizontal).
Uso: python3 camara_lector_test.py"""
import http.server, json, os, pathlib, shutil, socketserver, subprocess, sys, tempfile, threading
from playwright.sync_api import sync_playwright

AQUI = pathlib.Path(__file__).resolve().parent
SRC = AQUI.parent / 'app' / 'src'
CAPT = AQUI / 'capturas'; CAPT.mkdir(exist_ok=True)
fallas, oks = [], []
def ok(c, msg):
    (oks if c else fallas).append(msg); print(('ok    ' if c else 'FALLA ') + msg)

raiz = tempfile.mkdtemp()
y4m = os.path.join(raiz, 'arbol.y4m')
info = json.loads(subprocess.check_output(['node', str(AQUI / 'arbol_y4m.js'), y4m, '--tipo', 'full', '--fps', '30', '--seg', '6']).decode())
for f in ['semaforo_vision.js', 'semaforo.js', 'camara.js', 'camara.css', 'style.css']:
    shutil.copy(SRC / f, raiz)
with open(os.path.join(raiz, 'p.html'), 'w', encoding='utf-8') as f:
    f.write("""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="camara.css"></head><body><main><p>página de prueba</p></main>
<script src="semaforo_vision.js"></script><script src="semaforo.js"></script><script src="camara.js"></script></body></html>""")

class Silencio(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=raiz, **k)
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), Silencio); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
                                f'--use-file-for-fake-video-capture={y4m}', '--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, color_scheme='dark')
    ctx.grant_permissions(['camera'])
    pg = ctx.new_page()
    errores = []
    pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
    pg.goto(f'http://127.0.0.1:{PORT}/p.html')
    ok(pg.evaluate('DragCam.soporte().ok') is True, 'soporte: ok en Chromium')
    ok(pg.evaluate("DragCam._tipoDe('Cámara dual trasera')") == 'virtual' and pg.evaluate("DragCam._tipoDe('Back Ultra Wide Camera')") == 'gran_angular'
       and pg.evaluate("DragCam._tipoDe('Cámara trasera')") == 'principal', 'tipos de cámara por etiqueta')
    z = pg.evaluate("DragCam._zonaPx([0.4, 0.2, 0.125, 0.347], [1280, 720], 1280, 720, 40000)")
    ok(z['escala'] == 1 and z['cw'] == 160 and z['ch'] == 250 and z['propia'], f'zona 160×250 a escala 1: {z}')
    z2 = pg.evaluate("DragCam._zonaPx(null, null, 1280, 720, 40000)")
    ok(z2['cw'] * z2['ch'] <= 40000 and z2['escala'] < 0.25 and not z2['propia'], f'sin zona: cuadro completo reducido {z2}')
    z3 = pg.evaluate("DragCam._zonaPx([0.4, 0.2, 0.125, 0.347], [640, 480], 1280, 720, 40000)")
    ok(not z3['propia'], 'zona aprendida con otra proporción: no se usa')
    ok(pg.evaluate('DragCam.pedirPermiso()')['ok'] is True, 'pedirPermiso: ok y apaga la cámara')

    # ---- Lector sin zona: graba, NO analiza
    r = pg.evaluate("""async () => {
      const antes = Object.assign({}, Semaforo._llamadas);
      const L = new DragCam.Lector({ fps: 30 });
      window.__L = L;
      const r = await L.iniciar();
      await new Promise((s) => setTimeout(s, 4000));
      const e = L.estado(), v = DragCam.video(), cs = getComputedStyle(v);
      const c = L.congelar();
      L.detener();
      return { r, e, n: c.n, w: c.w, h: c.h, zona: c.zona, orig: c.orig, escala: c.escala, vista: c.vista ? [c.vista.n, c.vista.w, c.vista.h, c.vista.fmt] : null,
               reloj: c.reloj.fuente, tA: c.t[0], tB: c.t[c.n - 1], ahora: performance.now() / 1000, despues: L.estado().activo,
               vid: [cs.width, cs.height, +cs.opacity, cs.display, v.className], llamadas: [antes, Object.assign({}, Semaforo._llamadas)],
               track: v.srcObject };
    }""")
    ok(r['r']['ok'] and r['r']['W'] == info['W'] and r['r']['H'] == info['H'], f"iniciar: {r['r']['W']}×{r['r']['H']}")
    ok(abs(r['e']['fps'] - 30) < 4, f"estado: {r['e']['fps']:.1f} cuadros/s")
    ok(90 <= r['n'] <= 140 and r['w'] * r['h'] <= 40000, f"congelar: {r['n']} cuadros de {r['w']}×{r['h']}")
    ok(r['zona'] == [0, 0, info['W'], info['H']] and abs(r['escala'] - r['w'] / info['W']) < 1e-6, f"zona {r['zona']} escala {r['escala']:.3f}")
    ok(r['vista'] and r['vista'][3] == 'y8' and 15 <= r['vista'][0] <= 25, f"vista general {r['vista']}")
    ok(r['reloj'] in ('cap', 'media', 'indice'), f"reloj {r['reloj']}")
    ok(r['ahora'] - r['tB'] < 0.5 and r['tB'] - r['tA'] > 3, f"horas en el reloj de performance.now ({r['tA']:.2f}–{r['tB']:.2f})")
    ok(r['despues'] is False and r['track'] is None, 'detener: apaga la cámara')
    ok(r['vid'][0] == '2px' and r['vid'][1] == '2px' and r['vid'][2] <= 0.05 and r['vid'][3] != 'none' and 'cam-oculta' in r['vid'][4], f"video escondido mientras graba {r['vid']}")
    ok(r['llamadas'][0] == r['llamadas'][1], f"el Lector no analiza nada mientras graba {r['llamadas'][1]}")

    # ---- detener mientras abre (arranque o cancelar justo al armar): la cámara no se queda prendida y otra abre bien
    r = pg.evaluate("""async () => {
      const L = new DragCam.Lector({ fps: 30 });
      const p = L.iniciar();
      L.detener();
      const r = await p;
      await new Promise((s) => setTimeout(s, 300));
      const v = DragCam.video(), sinVideo = !v.srcObject, activo = L.estado().activo, prendida = !!L.stream;
      const L2 = new DragCam.Lector({ fps: 30 });
      const r2 = await L2.iniciar();
      await new Promise((s) => setTimeout(s, 800));
      const c2 = L2.congelar();
      L2.detener();
      return { r, sinVideo, activo, prendida, r2ok: r2.ok, n2: c2 ? c2.n : 0 };
    }""")
    ok(r['r']['ok'] is False and r['r']['motivo'] == 'abriendo' and r['sinVideo'] and not r['activo'] and not r['prendida'],
       f"detener mientras abre: no se queda prendida ({r['r']['motivo']})")
    ok(r['r2ok'] and r['n2'] > 5, f"después otra cámara abre bien ({r['n2']} cuadros)")

    # ---- Lector con zona alrededor del árbol (a escala 1)
    cx = (info['caja'][0] + info['caja'][2] / 2) / info['W']; cy = (info['caja'][1] + info['caja'][3] / 2) / info['H']
    zona = [cx - 0.0625, cy - 0.1735, 0.125, 0.347]
    r2 = pg.evaluate("""async (zona) => {
      const L = new DragCam.Lector({ fps: 30, zonaNorm: zona, orig: [640, 360] });
      const r = await L.iniciar();
      await new Promise((s) => setTimeout(s, 7000));
      const c = L.congelar(); L.detener();
      const sec = Semaforo.prueba(c, { carril: 'izq', arbol: 'auto' });
      return { r, n: c.n, w: c.w, h: c.h, escala: c.escala, sec: sec.map((s) => ({ tipo: s.tipo, delta: s.delta_s, ok: s.ok })) };
    }""", zona)
    ok(r2['r']['ok'] and r2['escala'] == 1 and r2['w'] == 80 and r2['h'] == 124, f"zona del árbol a escala 1: {r2['w']}×{r2['h']}")
    seqs = [s for s in r2['sec'] if s['ok']]
    ok(any(s['tipo'] == 'full' and abs(s['delta'] - 0.5) <= 0.034 for s in seqs), f"lo grabado se lee después: {seqs}")

    # ---- Apuntar (vertical)
    pg.evaluate("""() => { window.__guardado = null; window.__ap = DragCam.abrirApuntar({ carril: 'izq', alGuardar: (r) => { window.__guardado = r; } }); }""")
    pg.wait_for_function("document.querySelector('#camApuntar video') && document.querySelector('#camApuntar video').videoWidth > 0", timeout=10000)
    pg.wait_for_timeout(800)
    ok(pg.evaluate("document.documentElement.classList.contains('cam-abierta')"), 'Apuntar abierto (pantalla completa)')
    ok(pg.evaluate("document.querySelector('#camApuntar video').classList.contains('cam-vista')"), 'en Apuntar la imagen sí se ve')
    caja = pg.locator('.cam-caja').bounding_box()
    # dónde queda el árbol dentro de la caja (object-fit: contain)
    W, H = info['W'], info['H']; e = min(caja['width'] / W, caja['height'] / H)
    ox = caja['x'] + (caja['width'] - W * e) / 2; oy = caja['y'] + (caja['height'] - H * e) / 2
    pg.mouse.click(ox + cx * W * e, oy + cy * H * e)
    zz = pg.evaluate('window.__ap._zonas()')
    ok(zz['izq'] and abs(zz['izq'][0] - zona[0]) < 0.02 and abs(zz['izq'][1] - zona[1]) < 0.03, f"tocar el árbol define la zona {zz['izq']}")
    # modo prueba: se ve el árbol de la cámara falsa (una secuencia cada 6 s)
    try:
        pg.wait_for_function("document.querySelector('.cam-prueba').classList.contains('visto')", timeout=20000)
        txt = pg.locator('.cam-prueba').inner_text()
        import re
        m = re.search(r'verde (\d\.\d{3}) s', txt)
        ok('Full .5' in txt and m and abs(float(m.group(1)) - 0.5) <= 0.034, f"modo prueba: {txt}")
    except Exception as ex:
        ok(False, f'modo prueba no leyó el árbol ({ex})')
    cal = pg.locator('.cam-calidad').inner_text()
    ok('cuadros/s' in cal and 'Luz' in cal, f"revisión de calidad: {cal.splitlines()[:3]}")
    pg.screenshot(path=str(CAPT / 'camara_apuntar_vertical.png'))
    ok(pg.evaluate('document.documentElement.scrollWidth') <= 390, 'Apuntar sin scroll horizontal a 390 px')
    # carril derecho: otra zona
    pg.click('.cam-seg button[data-c="der"]')
    pg.mouse.click(ox + (cx + 0.05) * W * e, oy + cy * H * e)
    zz = pg.evaluate('window.__ap._zonas()')
    ok(zz['der'] and zz['izq'] and zz['der'][0] > zz['izq'][0], 'cada carril tiene su zona')
    # horizontal
    pg.set_viewport_size({'width': 844, 'height': 390})
    pg.wait_for_timeout(500)
    pg.screenshot(path=str(CAPT / 'camara_apuntar_horizontal.png'))
    bx = pg.locator('.cam-caja').bounding_box(); bl = pg.locator('.cam-acc').bounding_box()
    ok(bl['x'] > bx['x'] + bx['width'] - 5, 'horizontal: imagen a la izquierda y botones a la derecha')
    ok(bl['y'] + bl['height'] <= 390 + 1, f"horizontal: Listo se ve sin desplazarse (abajo en {bl['y'] + bl['height']:.0f} px)")
    pg.wait_for_timeout(1200)
    ok('se mueve' not in pg.locator('.cam-calidad').inner_text(), 'al cambiar de carril no dice que la imagen se mueve')
    ok(pg.evaluate('document.documentElement.scrollWidth') <= 844, 'horizontal sin scroll horizontal')
    pg.click('.cam-acc .cam-btn:not(.sec)')        # Listo
    g = pg.evaluate('window.__guardado')
    ok(g and g['zonas']['izq'] and g['zonas']['der'] and g['orig'] == [W, H], f"Listo devuelve zonas y tamaño {g and g['orig']}")
    ok(pg.evaluate("!document.getElementById('camApuntar') && DragCam.video().classList.contains('cam-oculta') && !DragCam.video().srcObject"),
       'al cerrar: sin pantalla, video escondido y cámara apagada')
    ok(not errores, f'sin errores {errores[:3]}')
    b.close()
srv.shutdown()
shutil.rmtree(raiz, ignore_errors=True)
print(f'\n{len(oks)} bien, {len(fallas)} fallas')
print('FALLAS: ' + str(len(fallas)))
sys.exit(1 if fallas else 0)
