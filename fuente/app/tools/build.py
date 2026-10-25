"""Arma dist/: index.html autocontenido + manifest + service worker + íconos."""
import json, os, pathlib
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, DIST = ROOT / 'src', ROOT / 'dist'
DIST.mkdir(exist_ok=True)
VERSION = 'beta-0.6.1'

html = (SRC / 'index.template.html').read_text(encoding='utf-8')
html = html.replace('/*CSS*/', (SRC / 'style.css').read_text(encoding='utf-8') + '\n' + (SRC / 'camara.css').read_text(encoding='utf-8'))
html = html.replace('/*CORE*/', (SRC / 'dragcore.js').read_text(encoding='utf-8'))
# Semáforo real: visión, núcleo, simulador (corrida simulada con cámara) y cámara
for marca, archivo in (('/*SEMVISION*/', 'semaforo_vision.js'), ('/*SEMAFORO*/', 'semaforo.js'),
                       ('/*SEMSIM*/', 'semaforo_sim.js'), ('/*CAMARA*/', 'camara.js')):
    assert marca in html, f'falta {marca} en la plantilla'
    html = html.replace(marca, (SRC / archivo).read_text(encoding='utf-8'))
html = html.replace('/*APP*/', (SRC / 'app.js').read_text(encoding='utf-8'))
html = html.replace('/*PRACTICA*/', (SRC / 'practica.js').read_text(encoding='utf-8'))
html = html.replace('/*ROOSTER*/', (SRC / 'rooster.js').read_text(encoding='utf-8'))
html = html.replace('/*CALC*/', (SRC / 'calculadora.js').read_text(encoding='utf-8'))

manifest = {
    "name": "Drag Tree", "short_name": "Drag Tree",
    "description": "Medidor de 1/8 y 1/4 de milla con GPS y acelerómetro.",
    "lang": "es", "start_url": "./", "scope": "./", "display": "standalone",
    "orientation": "portrait", "background_color": "#24282c", "theme_color": "#24282c",
    "icons": [
        {"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}
(DIST / 'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

sw = f"""// Service worker: guarda la app para que abra sin internet en la pista.
const CACHE = 'dragtrim-{VERSION}';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
self.addEventListener('install', (e) => {{
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
}});
self.addEventListener('activate', (e) => {{
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
}});
// Red primero (para recibir actualizaciones); sin conexión, la copia guardada.
self.addEventListener('fetch', (e) => {{
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {{
    const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r;
  }}).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
}});
"""
(DIST / 'sw.js').write_text(sw, encoding='utf-8')

def icono(size, maskable=False):
    S = 1024
    im = Image.new('RGBA', (S, S), (36, 40, 44, 255))
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    d = ImageDraw.Draw(im)
    scale = 0.72 if maskable else 0.86
    housing_w, housing_h = 300 * scale, 900 * scale
    cx, cy = S / 2, S / 2
    x0, y0 = cx - housing_w / 2, cy - housing_h / 2
    d.rounded_rectangle([x0, y0, x0 + housing_w, y0 + housing_h], radius=60 * scale, fill=(23, 25, 27, 255))
    r = 92 * scale
    colores = [(255, 176, 32), (255, 176, 32), (255, 176, 32), (54, 212, 107)]
    gap = (housing_h - 8 * r) / 5
    for i, col in enumerate(colores):
        y = y0 + gap * (i + 1) + r * (2 * i + 1)
        gd.ellipse([cx - r * 1.35, y - r * 1.35, cx + r * 1.35, y + r * 1.35], fill=col + (150,))
    glow = glow.filter(ImageFilter.GaussianBlur(40 * scale))
    im = Image.alpha_composite(im, glow)
    d = ImageDraw.Draw(im)
    for i, col in enumerate(colores):
        y = y0 + gap * (i + 1) + r * (2 * i + 1)
        d.ellipse([cx - r, y - r, cx + r, y + r], fill=col + (255,))
    return im.resize((size, size), Image.LANCZOS).convert('RGB')

icono(180).save(DIST / 'icon-180.png')
icono(192).save(DIST / 'icon-192.png')
icono(512).save(DIST / 'icon-512.png')
icono(512, maskable=True).save(DIST / 'icon-maskable-512.png')

# Fondos de pantalla: WebP ligeros (el original PNG pesa ~1.7 MB) + miniatura para Ajustes
FONDOS_SRC = ROOT.parent / 'fondos'
BRILLO = {}
if FONDOS_SRC.exists():
    (DIST / 'fondos').mkdir(exist_ok=True)
    for png in sorted(FONDOS_SRC.glob('fondo_marcas_*.png')):
        fid = png.stem.replace('fondo_marcas_', '')
        im = Image.open(png).convert('RGB')
        im.resize((1080, round(im.height * 1080 / im.width)), Image.LANCZOS).save(DIST / 'fondos' / f'{fid}.webp', quality=72, method=6)
        im.resize((180, round(im.height * 180 / im.width)), Image.LANCZOS).save(DIST / 'fondos' / f'{fid}_mini.webp', quality=70, method=6)
        # Práctica: formas de los stickers verdes y rojos del fondo, para encenderlos según la reacción.
        # Fondos de un solo color (Neón, Blanco y negro, y el verde de Rojo): logos elegidos a mano en
        # fuente/fondos/brillo/. Los demás se recortan solos por color.
        chico = im.resize((540, round(im.height * 540 / im.width)), Image.LANCZOS)
        h, s, v = chico.convert('HSV').split()
        def banda(canal, lo, hi):
            return canal.point(lambda x: 255 if lo <= x <= hi else 0)
        def y(*ms):
            out = ms[0]
            for m in ms[1:]:
                out = ImageChops.multiply(out, m)
            return out
        color = y(banda(s, 115, 255), banda(v, 89, 255))             # saturación > 45 %, brillo > 35 %
        claros = y(banda(v, 204, 255), banda(s, 0, 51))               # blancos de los stickers
        verde = y(color, banda(h, 39, 120))                           # 55°–170°
        rojo = y(color, ImageChops.lighter(banda(h, 0, 13), banda(h, 241, 255)))   # ≤ 18° o ≥ 340°
        blanco = Image.new('L', chico.size, 255)
        for nombre, m in (('verde', verde), ('rojo', rojo)):
            elegida = FONDOS_SRC / 'brillo' / f'{fid}-{nombre}.png'   # logos elegidos a mano (fondos/brillo/hacer_mascaras.py)
            if elegida.exists():
                m = Image.open(elegida).convert('L').resize(chico.size, Image.NEAREST)
            elif ImageStat.Stat(m).mean[0] / 255 < 0.01:
                # sin ese color: los stickers blancos; y si tampoco hay blancos (Neón), todos los de color
                m = claros if ImageStat.Stat(claros).mean[0] / 255 >= 0.01 else color
            # entre más pantalla cubra la forma, menos brilla (si no, se pinta todo y no se lee el tiempo)
            cubre = ImageStat.Stat(m).mean[0] / 255
            BRILLO.setdefault(fid, {})[nombre] = round(min(1.0, 0.20 / max(cubre, 1e-6)), 2)
            m = m.filter(ImageFilter.GaussianBlur(0.8))
            Image.merge('RGBA', (blanco, blanco, blanco, m)).save(DIST / 'fondos' / f'{fid}_brillo_{nombre}.webp', quality=70, alpha_quality=60, method=6)
# Fuerza máxima del brillo de cada fondo en Práctica (la usa app.js)
html = html.replace('{"__BRILLO__": 1}', json.dumps(BRILLO, sort_keys=True))
(DIST / 'index.html').write_text(html, encoding='utf-8')
print('brillo por fondo:', BRILLO)
print('ok', sorted(os.listdir(DIST)), len(html), 'bytes html')
