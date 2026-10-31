"""qr.js (DragQR) en Chromium con cámara falsa: videos .y4m que genera esta prueba, con el QR de un texto conocido
visto en la pantalla de otro teléfono (perspectiva, desenfoque, ruido, reflejo y un poco de temblor de la mano).
Revisa: el escáner lo lee en ≤ 5 s (y dice qué tan rápido), también lejos y de lado, el filtro ignora otro QR que no empieza con DT1 y avisa una
sola vez, detener() apaga la cámara (también si se llama mientras abre), usar una cámara ya abierta (opts.stream),
BarcodeDetector cuando existe (simulado), mensajes de error (permiso negado, sin cámara, sin https, la cámara se apagó),
dibujar → leerImagen en un canvas a 2× y 3×, y pedirCamara/soltar.
Uso: python3 qr_camara_test.py"""
import http.server, json, os, pathlib, random, shutil, socketserver, subprocess, sys, tempfile, threading
from playwright.sync_api import sync_playwright

AQUI = pathlib.Path(__file__).resolve().parent
SRC = AQUI.parent / 'app' / 'src'
CAPT = AQUI / 'capturas'; CAPT.mkdir(exist_ok=True)
fallas, oks = [], []
def ok(c, msg):
    (oks if c else fallas).append(msg); print(('ok    ' if c else 'FALLA ') + msg)

raiz = tempfile.mkdtemp(prefix='qrcam_')
azar = random.Random(31)
B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
def codigo(prefijo, largo): return prefijo + ''.join(azar.choice(B64) for _ in range(largo - len(prefijo)))
T1 = codigo('DT1o', 600)          # oferta típica (versión 19, ECC M: 93 módulos)
T2 = codigo('DT1a', 200)          # respuesta corta
OTRO = 'https://example.com/no-es-de-drag-tree?id=' + ''.join(azar.choice(B64) for _ in range(60))

# ---------------------------------------------------------------- videos de la cámara falsa (Node + qr.js)
GEN = r"""
'use strict';
const fs = require('fs');
const P = JSON.parse(process.argv[2]);
const Q = require(P.qr);
let a = P.semilla | 0;
const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
function homografia(q) {   // cuadrado unitario (0,0) (1,0) (1,1) (0,1) → cuadrilátero q
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1, g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}
function inversa(m) {
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
          C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
function desenfocar(L, W, H, s) {
  if (!(s > 0)) return;
  const r = Math.ceil(3 * s), k = []; let suma = 0;
  for (let i = -r; i <= r; i++) { const w = Math.exp(-i * i / (2 * s * s)); k.push(w); suma += w; }
  for (let i = 0; i < k.length; i++) k[i] /= suma;
  const T = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let i = -r; i <= r; i++) v += k[i + r] * L[y * W + Math.min(W - 1, Math.max(0, x + i))]; T[y * W + x] = v; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let v = 0; for (let i = -r; i <= r; i++) v += k[i + r] * T[Math.min(H - 1, Math.max(0, y + i)) * W + x]; L[y * W + x] = v; }
}
const W = P.W, H = P.H, out = fs.openSync(P.salida, 'w');
fs.writeSync(out, `YUV4MPEG2 W${W} H${H} F${P.fps}:1 Ip A1:1 C420jpeg\n`);
const Y = Buffer.alloc(W * H), UV = Buffer.alloc((W >> 1) * (H >> 1), 128), L = new Float32Array(W * H);
const info = [];
for (const esc of P.escenas) {
  const M = Q.matriz(esc.texto), N = M.n + 2 * Q.MARGEN;
  info.push({ version: M.version, modulos: M.n, ecc: M.ecc });
  const brillo = (u, v) => 18 * Math.exp(-((u - 0.85) ** 2 + (v - 0.05) ** 2) / 0.08);   // reflejo en una esquina
  const valor = (u, v, x) => {
    if (u >= 0 && u < 1 && v >= 0 && v < 1) return M.oscuro(Math.floor(v * N) - Q.MARGEN, Math.floor(u * N) - Q.MARGEN) ? esc.negro + brillo(u, v) : esc.blanco + brillo(u, v);
    if (u > -0.1 && u < 1.1 && v > -0.12 && v < 1.4) return esc.blanco + brillo(u, v);   // el resto de la pantalla
    if (u > -0.17 && u < 1.17 && v > -0.2 && v < 1.48) return 22;                       // marco del teléfono
    return 95 + 40 * x / W;                                                               // la mesa
  };
  for (let k = 0; k < esc.cuadros; k++) {
    const jx = 1.2 * Math.sin(k * 0.9), jy = 1.0 * Math.cos(k * 0.7);                   // temblor de la mano
    const I = inversa(homografia(esc.quad.map(([x, y]) => [x + jx, y + jy])));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const px = x + 0.25 + 0.5 * i, py = y + 0.25 + 0.5 * j, den = I[6] * px + I[7] * py + I[8];
        acc += valor((I[0] * px + I[1] * py + I[2]) / den, (I[3] * px + I[4] * py + I[5]) / den, x);
      }
      L[y * W + x] = acc / 4;
    }
    desenfocar(L, W, H, esc.blur);
    for (let i = 0; i < W * H; i++) Y[i] = Math.max(0, Math.min(255, Math.round(16 + 219 * (L[i] + esc.ruido * gauss()) / 255)));
    fs.writeSync(out, 'FRAME\n'); fs.writeSync(out, Y); fs.writeSync(out, UV); fs.writeSync(out, UV);
  }
}
fs.closeSync(out);
console.log(JSON.stringify(info));
"""
with open(os.path.join(raiz, 'gen_y4m.js'), 'w', encoding='utf-8') as f:
    f.write(GEN)
def video(nombre, W, H, fps, escenas):
    p = {'qr': str(SRC / 'qr.js'), 'salida': os.path.join(raiz, nombre), 'W': W, 'H': H, 'fps': fps, 'semilla': 5, 'escenas': escenas}
    info = json.loads(subprocess.check_output(['node', os.path.join(raiz, 'gen_y4m.js'), json.dumps(p)]).decode())
    return p['salida'], info
# 1) 1280×720 (lo que da un teléfono que no llega a 1080): el QR de 600 caracteres ocupa ~430 px (~4.3 px por módulo),
#    visto un poco de lado (perspectiva), desenfocado (σ 1 px), con ruido, reflejo y temblor. 15 cuadros a 15 por s.
Y4M_1, INFO_1 = video('principal.y4m', 1280, 720, 15, [
    {'texto': T1, 'cuadros': 15, 'quad': [[432, 150], [842, 138], [858, 566], [420, 580]], 'blur': 1.0, 'ruido': 4, 'negro': 30, 'blanco': 215}])
def cuadri(cx, cy, lado, trapecio, giro):   # el QR de `lado` px, más angosto arriba (trapecio) y girado (grados)
    import math
    a, r = math.radians(giro), lado / 2
    arr, aba = lado * (1 - trapecio / 2) / 2, lado * (1 + trapecio / 2) / 2
    return [[round(cx + math.cos(a) * x - math.sin(a) * y, 1), round(cy + math.sin(a) * x + math.cos(a) * y, 1)]
            for x, y in [(-arr, -r), (arr, -r), (aba, r), (-aba, r)]]
# 3) 1280×720 con el QR lejos (~300 px: 3 px por módulo) y muy de lado (trapecio 12 %, giro 4°): solo lo leen los
#    intentos ampliados del ciclo (escalados con el canvas del navegador).
T3 = codigo('DT1o', 600)
Y4M_3, INFO_3 = video('chico.y4m', 1280, 720, 15, [
    {'texto': T3, 'cuadros': 15, 'quad': cuadri(640, 360, 300, 0.12, 4), 'blur': 1.0, 'ruido': 4, 'negro': 30, 'blanco': 215}])
# 2) Vertical 480×640 (teléfono derecho): 2 s otro QR (no es de Drag Tree) y 2 s la respuesta DT1a…, en bucle.
Y4M_2, INFO_2 = video('filtro.y4m', 480, 640, 10, [
    {'texto': OTRO, 'cuadros': 20, 'quad': [[95, 175], [388, 168], [395, 462], [88, 470]], 'blur': 0.8, 'ruido': 4, 'negro': 30, 'blanco': 215},
    {'texto': T2, 'cuadros': 20, 'quad': [[92, 172], [390, 166], [398, 466], [86, 472]], 'blur': 0.8, 'ruido': 4, 'negro': 30, 'blanco': 215}])
print(f'videos: principal {INFO_1}, chico {INFO_3}, filtro {INFO_2}')

# ---------------------------------------------------------------- página de prueba (librerías juntas, como build.py)
qrlib = '\n'.join((SRC / 'vendor' / f).read_text(encoding='utf-8') for f in ('qrcode.js', 'jsQR.js'))
with open(os.path.join(raiz, 'qrlib.js'), 'w', encoding='utf-8') as f:
    f.write(qrlib)
shutil.copy(SRC / 'qr.js', raiz)
with open(os.path.join(raiz, 'p.html'), 'w', encoding='utf-8') as f:
    f.write("""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;background:#141618;color:#eee;font:14px sans-serif} video{width:360px;height:auto;background:#000;display:block} canvas{display:block}</style></head>
<body><video id="v" playsinline muted autoplay></video><canvas id="c" style="width:300px;height:300px"></canvas>
<script src="qrlib.js"></script><script src="qr.js"></script></body></html>""")

class Silencio(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=raiz, **k)
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), Silencio); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{PORT}/p.html'

# Lleva la cuenta de las cámaras abiertas (para revisar que todo se apaga)
ESPIA = """(() => {
  const md = navigator.mediaDevices; if (!md || !md.getUserMedia) return;
  const orig = md.getUserMedia.bind(md);
  window.__streams = []; window.__restricciones = [];
  md.getUserMedia = async (c) => { window.__restricciones.push(c); const s = await orig(c); window.__streams.push(s); return s; };
  window.__vivas = () => window.__streams.reduce((n, s) => n + s.getTracks().filter((t) => t.readyState === 'live').length, 0);
})();"""
# Escanea hasta leer (o hasta `max_ms`); devuelve cuánto tardó, qué leyó, lo rechazado y si quedó la cámara prendida.
ESCANEAR = """async ([filtro, maxMs, extra]) => {
  const v = document.getElementById('v');
  const r = await new Promise((res) => {
    const t0 = performance.now(), rech = [], errores = [];
    let listo = false, sc;
    const fin = (x) => { if (listo) return; listo = true; res(Object.assign({ rech, errores, est: sc.estado() }, x)); };
    const opts = Object.assign({
      filtro: filtro ? new Function('t', 'return ' + filtro) : undefined,
      alLeer: (t, info) => fin({ t, info, ms: performance.now() - t0, src: !!v.srcObject, vivas: window.__vivas ? __vivas() : -1 }),
      alRechazar: (t) => rech.push(t),
      alError: (m, motivo) => errores.push([m, motivo]),
    }, extra === 'stream' ? { stream: window.__s } : {});
    sc = DragQR.escaner(v, opts);
    window.__sc = sc;
    sc.iniciar().then((x) => { window.__inicio = x; });
    setTimeout(() => { const e = sc.estado(); sc.detener(); fin({ timeout: true, est: e }); }, maxMs);
  });
  await new Promise((s) => setTimeout(s, 150));
  r.vivasDespues = window.__vivas ? __vivas() : -1; r.srcDespues = !!v.srcObject; r.inicio = window.__inicio;
  return r;
}"""

def nuevo(b, escala=1, init=None):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=escala, color_scheme='dark')
    ctx.grant_permissions(['camera'])
    ctx.add_init_script(ESPIA)
    if init: ctx.add_init_script(init)
    pg = ctx.new_page()
    errores = []
    pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
    pg.goto(URL)
    pg.wait_for_function('window.DragQR && window.jsQR && window.qrcode')
    return ctx, pg, errores

ARGS = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
tiempos = []
with sync_playwright() as p:
    # ============================================================ video 1: QR de 600 caracteres en 1280×720
    b = p.chromium.launch(args=ARGS + [f'--use-file-for-fake-video-capture={Y4M_1}'])
    ctx, pg, errores = nuevo(b, escala=2)
    ok(pg.evaluate("typeof DragQR.dibujar === 'function' && typeof DragQR.matriz === 'function' && typeof DragQR.leerImagen === 'function'"
                   " && typeof DragQR.pedirCamara === 'function' && typeof DragQR.soltar === 'function' && typeof DragQR.escaner === 'function'"),
       'API: dibujar, matriz, leerImagen, pedirCamara, soltar, escaner (librerías juntas en un script, como build.py)')

    # ---- pedirCamara / soltar
    r = pg.evaluate("""async () => {
      const s = await DragQR.pedirCamara();
      const t = s && s.getVideoTracks()[0], set = t ? t.getSettings() : {};
      const antes = s ? s.getTracks().map((x) => x.readyState) : null;
      DragQR.soltar(s); DragQR.soltar(null);
      return { es: s instanceof MediaStream, antes, despues: s.getTracks().map((x) => x.readyState), w: set.width, h: set.height,
               c: window.__restricciones[window.__restricciones.length - 1], vivas: __vivas() };
    }""")
    ok(r['es'] and r['antes'] == ['live'], f"pedirCamara: un MediaStream con video prendido ({r['w']}×{r['h']})")
    ok(r['despues'] == ['ended'] and r['vivas'] == 0, 'soltar: la apaga (y soltar(null) no truena)')
    ok(r['c'] == {'audio': False, 'video': {'facingMode': {'ideal': 'environment'}, 'width': {'ideal': 1920}, 'height': {'ideal': 1080}}},
       f"pide la cámara de atrás sin audio: {json.dumps(r['c'])}")

    # ---- el escáner lee el QR (3 veces, para medir qué tan rápido)
    for i in range(3):
        r = pg.evaluate(ESCANEAR, ["t.startsWith('DT1')", 8000, None])
        if r.get('t') is not None: tiempos.append(r['ms'])
        if i == 0:
            ok(r.get('t') == T1, f"escáner: lee el QR de {len(T1)} caracteres (versión {INFO_1[0]['version']}, {INFO_1[0]['modulos']} módulos) "
                                 f"en {r.get('ms', float('nan')):.0f} ms, {r['est']['intentos']} intentos con {r['est']['metodo']}")
            ok(r.get('ms', 1e9) <= 5000, f"escáner: lee en ≤ 5 s ({r.get('ms', float('nan')):.0f} ms)")
            ok(r['est']['ancho'] == 1280 and r['est']['alto'] == 720 and r['est']['metodo'] == 'jsQR', f"usa jsQR en Chromium de escritorio ({r['est']['ancho']}×{r['est']['alto']})")
            ok(r.get('src') is False and r.get('vivas') == 0 and r['vivasDespues'] == 0 and not r['srcDespues'],
               'al leer se detiene solo: cámara apagada y video sin srcObject antes de llamar alLeer')
            ok(r['inicio'] is True and not r['errores'] and r['info']['metodo'] == 'jsQR' and r['info']['intentos'] >= 1,
               f"iniciar() da true; info de la lectura {r['info']}")
            pg.screenshot(path=str(CAPT / 'qr_camara_escaner.png'))
        else:
            ok(r.get('t') == T1, f"escáner (vuelta {i + 1}): lee en {r.get('ms', float('nan')):.0f} ms")
    pg.evaluate("document.getElementById('v').srcObject = null")

    # ---- filtro: un QR que no pasa se ignora (y avisa una sola vez)
    r = pg.evaluate(ESCANEAR, ["t.startsWith('DT1a')", 2500, None])
    ok(r.get('timeout') and r.get('t') is None, 'filtro: un QR que no pasa el filtro no llama alLeer')
    ok(r['rech'] == [T1] and r['est']['rechazados'] == 1 and r['est']['intentos'] >= 5,
       f"filtro: alRechazar una sola vez con ese texto ({len(r['rech'])} avisos en {r['est']['intentos']} intentos)")
    ok(r['vivasDespues'] == 0 and not r['srcDespues'], 'detener(): apaga la cámara y quita srcObject')

    # ---- detener mientras abre la cámara
    r = pg.evaluate("""async () => {
      const v = document.getElementById('v'), errores = [];
      const sc = DragQR.escaner(v, { alLeer: () => errores.push('leyó'), alError: (m) => errores.push(m) });
      const p = sc.iniciar(); sc.detener();
      const x = await p;
      await new Promise((s) => setTimeout(s, 400));
      return { x, vivas: __vivas(), src: !!v.srcObject, errores, activo: sc.estado().activo };
    }""")
    ok(r['x'] is False and r['vivas'] == 0 and not r['src'] and not r['errores'] and not r['activo'],
       'detener() mientras abre: iniciar() da false y la cámara no se queda prendida')

    # ---- opts.stream: usa la cámara que ya pidió pedirCamara (no la pide otra vez) y la apaga al leer
    r = pg.evaluate("async () => { window.__s = await DragQR.pedirCamara(); return window.__streams.length; }")
    n0 = r
    r = pg.evaluate(ESCANEAR, ["t.startsWith('DT1')", 8000, 'stream'])
    n1 = pg.evaluate('window.__streams.length')
    fin_s = pg.evaluate("window.__s.getTracks().map((t) => t.readyState)")
    ok(r.get('t') == T1 and n1 == n0 and fin_s == ['ended'] and r['vivasDespues'] == 0,
       f"opts.stream: lee con la cámara ya abierta, sin pedir otra ({n1 - n0} nuevas), y la apaga ({r.get('ms', float('nan')):.0f} ms)")
    if r.get('t') is not None: tiempos.append(r['ms'])

    # ---- la cámara se apaga sola (otra app, segundo plano): alError y todo apagado
    r = pg.evaluate("""async () => {
      const v = document.getElementById('v'), errores = [];
      const sc = DragQR.escaner(v, { filtro: () => false, alError: (m, motivo) => errores.push([m, motivo]) });
      await sc.iniciar();
      await new Promise((s) => setTimeout(s, 300));
      v.srcObject.getVideoTracks()[0].dispatchEvent(new Event('ended'));
      await new Promise((s) => setTimeout(s, 200));
      return { errores, activo: sc.estado().activo, vivas: __vivas(), src: !!v.srcObject };
    }""")
    ok(len(r['errores']) == 1 and r['errores'][0][1] == 'se_apago' and 'se apagó' in r['errores'][0][0] and not r['activo'] and r['vivas'] == 0 and not r['src'],
       f"si la cámara se apaga: alError «{r['errores'][0][0] if r['errores'] else '—'}» y queda detenido")

    # ---- dibujar → leerImagen a 2× (y 3× abajo)
    def revisar_dibujo(pg, escala):
        r = pg.evaluate("""([textos, escala]) => textos.map((t) => {
          const c = document.getElementById('c');
          const d = DragQR.dibujar(c, t, { tam: 300 });
          const M = DragQR.matriz(t);
          const x = c.getContext('2d'), im = x.getImageData(0, 0, c.width, c.height);
          let grises = 0;
          for (let i = 0; i < im.data.length; i += 4) { const v = im.data[i]; if ((v !== 0 && v !== 255) || im.data[i + 1] !== v || im.data[i + 2] !== v) grises++; }
          const total = d.modulos + 8, ini = Math.floor((d.lado - d.px * total) / 2) + 4 * d.px;
          const px = (xx, yy) => im.data[(yy * c.width + xx) * 4];
          const esquina = px(ini, ini) === 0 && px(ini - 1, ini - 1) === 255 && px(ini + 7 * d.px - 1, ini) === 0 && px(ini + 7 * d.px, ini + d.px) === 255;
          return { d, ecc: M.ecc, version: M.version, w: c.width, h: c.height, css: c.style.width, grises, esquina,
                   leido: DragQR.leerImagen(im) === t, unIntento: DragQR.leerImagen(im, { reintentar: false }) === t };
        })""", [[codigo('DT1o', 40), T1, codigo('DT1o', 1000), codigo('DT1a', 1400)], escala])
        lado = round(300 * escala)
        ok(all(x['w'] == lado and x['h'] == lado and x['css'] == '300px' for x in r), f"dibujar a {escala}×: canvas de {lado}×{lado} px reales, 300 px CSS")
        ok(all(x['grises'] == 0 and x['esquina'] for x in r), f"dibujar a {escala}×: solo negro y blanco, módulos enteros ({', '.join(str(x['d']['px']) + ' px' for x in r)} por módulo)")
        ok(all(x['d']['version'] == x['version'] and x['d']['ecc'] == x['ecc'] and x['d']['modulos'] == 4 * x['version'] + 17 for x in r)
           and [x['ecc'] for x in r] == ['M', 'M', 'L', 'L'],
           f"dibujar a {escala}×: versión y ECC ({', '.join(x['ecc'] + str(x['version']) for x in r)}) como matriz()")
        ok(all(x['leido'] and x['unIntento'] for x in r), f"dibujar a {escala}× → leerImagen: los 4 textos (40 a 1400 caracteres) se leen de vuelta")
    revisar_dibujo(pg, 2)
    r = pg.evaluate("""() => { const c = document.getElementById('c'); const d = DragQR.dibujar(c, 'hola', { tam: 300, ecc: 'H' });
      return [d.ecc, DragQR.leerImagen(c.getContext('2d').getImageData(0, 0, c.width, c.height)), c.getAttribute('aria-label')]; }""")
    ok(r == ['H', 'hola', 'Código QR'], f"dibujar: opts.ecc lo fuerza y el canvas dice qué es ({r})")
    pg.screenshot(path=str(CAPT / 'qr_camara_dibujar.png'))
    ok(not errores, f'sin errores en la consola {errores[:3]}')
    ctx.close()

    # ---- 3×
    ctx, pg, errores = nuevo(b, escala=3)
    revisar_dibujo(pg, 3)
    ok(not errores, f'sin errores en la consola a 3× {errores[:3]}')
    ctx.close()

    # ---- BarcodeDetector (simulado: Chromium de escritorio en Linux no lo trae)
    BD = """window.BarcodeDetector = class {
      static async getSupportedFormats() { return %s; }
      constructor(o) { window.__bdFormatos = o && o.formats; }
      async detect(src) {
        window.__bdLlamadas = (window.__bdLlamadas || 0) + 1;
        if (%s) throw new DOMException('servicio no disponible', 'NotSupportedError');
        const c = document.createElement('canvas'); c.width = src.videoWidth; c.height = src.videoHeight;
        const x = c.getContext('2d'); x.drawImage(src, 0, 0);
        const t = DragQR.leerImagen(x.getImageData(0, 0, c.width, c.height));
        return t ? [{ rawValue: 'NO-ES-DT1', format: 'qr_code' }, { rawValue: t, format: 'qr_code' }] : [];
      }
    };"""
    ctx, pg, errores = nuevo(b, init=BD % ("['ean_13', 'qr_code']", 'false'))
    r = pg.evaluate(ESCANEAR, ["t.startsWith('DT1')", 8000, None])
    ok(r.get('t') == T1 and r['info']['metodo'] == 'BarcodeDetector' and pg.evaluate('window.__bdFormatos') == ['qr_code'],
       f"BarcodeDetector con qr_code: lo usa ({r.get('ms', float('nan')):.0f} ms) y de varios códigos toma el que pasa el filtro")
    ok(r['rech'] == ['NO-ES-DT1'], f"BarcodeDetector: el otro código del mismo cuadro se ignora ({r['rech']})")
    ok(not errores, f'sin errores {errores[:3]}')
    ctx.close()
    ctx, pg, errores = nuevo(b, init=BD % ("['ean_13']", 'false'))
    r = pg.evaluate(ESCANEAR, ["t.startsWith('DT1')", 8000, None])
    ok(r.get('t') == T1 and r['info']['metodo'] == 'jsQR' and not pg.evaluate('window.__bdLlamadas'),
       'BarcodeDetector sin qr_code: usa jsQR')
    ctx.close()
    ctx, pg, errores = nuevo(b, init=BD % ("['qr_code']", 'true'))
    r = pg.evaluate(ESCANEAR, ["t.startsWith('DT1')", 8000, None])
    ok(r.get('t') == T1 and r['info']['metodo'] == 'jsQR' and pg.evaluate('window.__bdLlamadas') == 3,
       f"BarcodeDetector que falla: a las 3 fallas sigue con jsQR y lee ({r.get('ms', float('nan')):.0f} ms)")
    ok(not errores, f'sin errores {errores[:3]}')
    ctx.close()

    # ---- errores de la cámara: mensajes claros en español
    def con_error(init, desc, motivo, palabra):
        ctx, pg, errores = nuevo(b, init=init)
        r = pg.evaluate("""async () => {
          const v = document.getElementById('v'), err = [], err2 = [];
          const sc = DragQR.escaner(v, { alLeer: () => err.push(['leyó']), alError: (m, motivo) => err.push([m, motivo]) });
          const x = await sc.iniciar();
          const s = await DragQR.pedirCamara({ alError: (m, motivo) => err2.push([m, motivo]) });
          return { x, err, s: s === null, err2, activo: sc.estado().activo };
        }""")
        e = r['err'][0] if r['err'] else ['—', None]
        ok(r['x'] is False and len(r['err']) == 1 and e[1] == motivo and palabra in e[0] and not r['activo'], f"{desc}: «{e[0]}»")
        ok(r['s'] and len(r['err2']) == 1 and r['err2'][0][1] == motivo, f"{desc}: pedirCamara da null y avisa")
        ok(not errores, f'{desc}: sin errores en la consola {errores[:2]}')
        ctx.close()
    RECHAZO = "navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('x', '%s'));"
    con_error(RECHAZO % 'NotAllowedError', 'permiso negado', 'sin_permiso', 'permiso')
    con_error(RECHAZO % 'NotFoundError', 'sin cámara', 'sin_camara', 'No se encontró una cámara')
    con_error(RECHAZO % 'NotReadableError', 'cámara ocupada', 'ocupada', 'ocupada')
    con_error("Object.defineProperty(window, 'isSecureContext', { value: false });", 'sin https', 'inseguro', 'https')
    b.close()

    # ============================================================ video 2: vertical, otro QR y luego el bueno
    b = p.chromium.launch(args=ARGS + [f'--use-file-for-fake-video-capture={Y4M_2}'])
    ctx, pg, errores = nuevo(b)
    r = pg.evaluate(ESCANEAR, ["t.startsWith('DT1')", 8000, None])
    ok(r.get('t') == T2, f"vertical 480×640: lee la respuesta DT1a… de {len(T2)} caracteres en {r.get('ms', float('nan')):.0f} ms")
    ok(r.get('ms', 1e9) <= 5000, f"vertical: en ≤ 5 s aunque primero se ve otro QR ({r.get('ms', float('nan')):.0f} ms)")
    ok(r['rech'] == [OTRO], f"el QR que no empieza con DT1 se ignora (alRechazar: {[x[:30] + '…' for x in r['rech']]})")
    pg.screenshot(path=str(CAPT / 'qr_camara_vertical.png'))
    ok(not errores, f'sin errores {errores[:3]}')
    b.close()

    # ============================================================ video 3: QR lejos y de lado (intentos ampliados)
    b = p.chromium.launch(args=ARGS + [f'--use-file-for-fake-video-capture={Y4M_3}'])
    ctx, pg, errores = nuevo(b)
    lecturas = []
    for i in range(3):
        r = pg.evaluate(ESCANEAR, ["t.startsWith('DT1')", 8000, None])
        lecturas.append(r)
    ok(all(x.get('t') == T3 and x['ms'] <= 5000 for x in lecturas),
       f"QR lejos (~300 px, 3 px por módulo) y de lado (trapecio 12 %, giro 4°): lee en "
       f"{', '.join(str(round(x['ms'])) + ' ms' if x.get('t') == T3 else 'NO' for x in lecturas)} "
       f"(intento {', '.join(str(x['info']['intentos']) if x.get('info') else '—' for x in lecturas)} del ciclo de 8)")
    ok(not errores, f'sin errores {errores[:3]}')
    b.close()
srv.shutdown()
shutil.rmtree(raiz, ignore_errors=True)
if tiempos:
    t = sorted(tiempos)
    print(f'\nvelocidad de lectura (iniciar → alLeer, video 1280×720, 600 caracteres): {len(t)} lecturas, '
          f'mín {t[0]:.0f} ms, mediana {t[len(t) // 2]:.0f} ms, máx {t[-1]:.0f} ms')
print(f'\n{len(oks)} bien, {len(fallas)} fallas')
print('FALLAS: ' + str(len(fallas)))
sys.exit(1 if fallas else 0)
