"""Arma dist/: index.html autocontenido + manifest + service worker + íconos."""
import json, os, pathlib
from PIL import Image, ImageDraw, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, DIST = ROOT / 'src', ROOT / 'dist'
DIST.mkdir(exist_ok=True)
VERSION = 'beta-0.3.2'

html = (SRC / 'index.template.html').read_text(encoding='utf-8')
html = html.replace('/*CSS*/', (SRC / 'style.css').read_text(encoding='utf-8'))
html = html.replace('/*CORE*/', (SRC / 'dragcore.js').read_text(encoding='utf-8'))
html = html.replace('/*APP*/', (SRC / 'app.js').read_text(encoding='utf-8'))
html = html.replace('/*PRACTICA*/', (SRC / 'practica.js').read_text(encoding='utf-8'))
(DIST / 'index.html').write_text(html, encoding='utf-8')

manifest = {
    "name": "Drag Trim", "short_name": "Drag Trim",
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
if FONDOS_SRC.exists():
    (DIST / 'fondos').mkdir(exist_ok=True)
    for png in sorted(FONDOS_SRC.glob('fondo_marcas_*.png')):
        fid = png.stem.replace('fondo_marcas_', '')
        im = Image.open(png).convert('RGB')
        im.resize((1080, round(im.height * 1080 / im.width)), Image.LANCZOS).save(DIST / 'fondos' / f'{fid}.webp', quality=72, method=6)
        im.resize((180, round(im.height * 180 / im.width)), Image.LANCZOS).save(DIST / 'fondos' / f'{fid}_mini.webp', quality=70, method=6)
print('ok', sorted(os.listdir(DIST)), len(html), 'bytes html')
