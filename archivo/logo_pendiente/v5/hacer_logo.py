# Logo v5 de Drag Tree (26 oct 2026): "DRAG" arriba de "TREE", con el árbol de salidas como la T.
# Letra: Inter Black Italic (OFL), la más parecida a la de la imagen de Daniel; las letras se guardan como trazos
# en el SVG (no hace falta la letra instalada). El árbol se dibuja derecho y se inclina igual que la letra (9.4°).
# Uso: python3 hacer_logo.py  -> logo_*.svg y hoja_claro.png / hoja_oscuro.png (con Chromium, para revisarlas)
import math, os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTE = '/usr/share/fonts/opentype/inter/Inter-BlackItalic.otf'
f = TTFont(FUENTE)
GS, CMAP, UPM = f.getGlyphSet(), f.getBestCmap(), f['head'].unitsPerEm
CAP = f['OS/2'].sCapHeight
ANG = -f['post'].italicAngle            # 9.4°
TAN = math.tan(math.radians(ANG))
TRACK = -0.015 * UPM                    # letras un poco más juntas, como en un logo

def palabra(txt, alto_cap):
    """Trazos de una palabra con su altura de mayúscula = alto_cap px. Devuelve (glifos, ancho, tinta_izq, tinta_der)."""
    s = alto_cap / CAP
    x, glifos, izq, der = 0.0, [], None, None
    for ch in txt:
        g = GS[CMAP[ord(ch)]]
        pen = SVGPathPen(GS); g.draw(pen)
        bp = BoundsPen(GS); g.draw(bp)
        if bp.bounds:
            x0, y0, x1, y1 = bp.bounds
            # tinta medida sobre la línea base (la letra está inclinada: se corrige con la pendiente)
            l, r = (x + x0) * s, (x + x1) * s
            izq = l if izq is None else min(izq, l)
            der = r if der is None else max(der, r)
        glifos.append((pen.getCommands(), x * s))
        x += g.width + TRACK
    return glifos, x * s, izq, der, s

def svg_palabra(txt, alto_cap, x, base, color):
    glifos, ancho, izq, der, s = palabra(txt, alto_cap)
    partes = [f'<path transform="translate({x + dx:.2f} {base:.2f}) scale({s:.5f} {-s:.5f})" d="{d}"/>' for d, dx in glifos]
    return f'<g fill="{color}">' + ''.join(partes) + '</g>'

COLORES = {'stage': '#ffe066', 'ambar': '#ffa31a', 'verde': '#2fd36a', 'rojo': '#f0453a'}

def arbol(C, Ht, color, lado=1, colores=False):
    """El árbol de la imagen de Daniel con origen en el centro de arriba (y hacia abajo; la línea base de las letras
    está en y = C). Los gruesos van en proporción a la mayúscula C (que pese igual que las letras); el largo es Ht.
    lado = 1: se inclina como la letra; -1: al lado contrario. Barras y poste se inclinan; los focos quedan redondos
    y solo su lugar sigue la inclinación. Con colores, cada foco lleva su color con un aro del color del árbol:
    pre-stage y stage (los foquitos de las dos barras), dos ámbar, verde y rojo.
    Devuelve (barras y poste, focos, ancho de barra, xmin, xmax) con x ya inclinada."""
    barra_w, barra_h, rr = 0.92 * C, 0.15 * C, 0.025 * C
    foquito_r, poste_w = 0.05 * C, 0.11 * C
    foco_r, foco_dx, union_h = 0.088 * C, 0.29 * C, 0.05 * C
    filas_y0, paso = (0.74 * C, 0.226 * C) if Ht >= 1.9 * C else (0.64 * C, 0.19 * C)
    corre = lambda x, y: x + lado * TAN * (C - y)
    rectos, redondos, xs, formas = [], [], [], []
    def rect(x, y, w, h, extra=''):
        rectos.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}"{extra}/>')
        xs.extend(corre(px, py) for px in (x, x + w) for py in (y, y + h))
        formas.append(('r', x + w, y, y + h))
    def foco(cx, cy, r, tono):
        x = corre(cx, cy); xs.extend((x - r, x + r)); formas.append(('c', x, cy, r))
        if colores:   # el aro es del color del árbol (como la caja del foco); el centro, del color de la luz
            aro = 0.28 * r
            redondos.append(f'<circle cx="{x:.2f}" cy="{cy:.2f}" r="{r - aro / 2:.2f}" fill="{COLORES[tono]}" stroke="{color}" stroke-width="{aro:.2f}"/>')
        else:
            redondos.append(f'<circle cx="{x:.2f}" cy="{cy:.2f}" r="{r:.2f}"/>')
    rect(-poste_w / 2, 0, poste_w, Ht)                                                                       # poste
    for y0 in (0.0, 0.33 * C):                                                                               # pre-stage y stage
        rect(-barra_w / 2, y0, barra_w, barra_h, f' rx="{rr:.2f}"')
        for dx in (-0.36, -0.18, 0.18, 0.36):
            foco(dx * C, y0 + barra_h, foquito_r, 'stage')
    for k, tono in enumerate(('ambar', 'ambar', 'verde', 'rojo')):
        cy = filas_y0 + paso * k
        rect(-foco_dx, cy - union_h / 2, 2 * foco_dx, union_h)
        for sx in (-1, 1):
            foco(sx * foco_dx, cy, foco_r, tono)
    def derecha(y):   # orilla derecha del árbol a la altura y (None si ahí no hay nada)
        d = None
        for f in formas:
            if f[0] == 'r' and f[2] <= y <= f[3]: v = corre(f[1], y)
            elif f[0] == 'c' and abs(y - f[2]) <= f[3]: v = f[1] + math.sqrt(f[3] ** 2 - (y - f[2]) ** 2)
            else: continue
            d = v if d is None else max(d, v)
        return d
    return ''.join(rectos), ''.join(redondos), derecha, min(xs), max(xs)

def logo(variante, color='#111'):
    C = 300.0                                    # alto de mayúscula de "REE"
    m = 60.0                                     # margen
    lado, colores = 1, False
    if variante in ('a', 'b'):                   # a: como el dibujo de Daniel; b: igual en minúsculas
        Ht = 2.0 * C
        abajo = 'REE' if variante == 'a' else 'ree'
        arriba = 'DRAG' if variante == 'a' else 'Drag'
    else:                                        # c: compacto, DRAG a todo lo ancho (para el encabezado de la app)
        Ht = 1.42 * C                            # c2 (la que eligió Daniel): árbol al lado contrario y con colores
        abajo, arriba = 'REE', 'DRAG'
        if variante == 'c2': lado, colores = -1, True
    g_rectos, g_redondos, derecha, xmin, xmax = arbol(C, Ht, color, lado, colores)
    _, ancho_ree, izq_ree, der_ree, _ = palabra(abajo, C)
    base, tope = 0.0, -C
    # "REE" a la derecha del árbol: la R (su orilla izquierda sube inclinada) queda a "gap" de lo que le quede más
    # cerca del árbol a cualquier altura entre la línea base y la mayúscula (barras, focos o uniones).
    gap = 0.07 * C
    x_ree = max(d + gap - (izq_ree + TAN * (C - y)) for y in [C * k / 200 for k in range(201)] if (d := derecha(y)) is not None)
    piezas = [f'<g fill="{color}" transform="translate(0 {base:.2f}) skewX({-lado * ANG:.3f}) translate(0 {-C:.2f})">{g_rectos}</g>',
              f'<g fill="{color}" transform="translate(0 {base - C:.2f})">{g_redondos}</g>',
              svg_palabra(abajo, C, x_ree, base, color)]
    izq_total, der_total = xmin, x_ree + der_ree
    abajo_total = base + (Ht - C)
    if variante in ('a', 'b'):
        # DRAG arriba de REE, del mismo ancho de tinta y alineada a la R
        _, _, izq_d, der_d, _ = palabra(arriba, C)
        Cd = C * (der_ree - izq_ree) / (der_d - izq_d)
        _, _, izq_d, der_d, _ = palabra(arriba, Cd)
        base_d = tope - 0.22 * C
        x_d = x_ree + izq_ree - izq_d
        piezas.append(svg_palabra(arriba, Cd, x_d, base_d, color))
        arriba_total = base_d - Cd
    else:
        # DRAG a todo lo ancho, del árbol a la última E
        _, _, izq_d, der_d, _ = palabra(arriba, C)
        Cd = C * (der_total - izq_total) / (der_d - izq_d)
        _, _, izq_d, der_d, _ = palabra(arriba, Cd)
        base_d = tope - 0.2 * C
        x_d = izq_total - izq_d
        piezas.append(svg_palabra(arriba, Cd, x_d, base_d, color))
        arriba_total = base_d - Cd
        der_total = max(der_total, x_d + der_d)
    x0, y0 = izq_total - m, arriba_total - m
    w, h = der_total - izq_total + 2 * m, abajo_total - arriba_total + 2 * m
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.1f} {y0:.1f} {w:.1f} {h:.1f}" width="{w:.0f}" height="{h:.0f}">'
            + ''.join(piezas) + '</svg>')

if __name__ == '__main__':
    VARIANTES = ('a', 'b', 'c', 'c2')
    for v in VARIANTES:
        for nombre, color in (('', '#111'), ('_blanco', '#fff')):
            open(os.path.join(AQUI, f'logo_{v}{nombre}.svg'), 'w').write(logo(v, color))
    if '--sin-hoja' in sys.argv: sys.exit()
    from playwright.sync_api import sync_playwright
    FONDO = os.path.abspath(os.path.join(AQUI, '..', '..', '..', 'fondos', 'gallos.webp'))
    html = f"""<!doctype html><meta charset="utf-8"><style>
      body{{margin:0;font:600 22px system-ui;color:#555;background:#fff}}
      main{{display:grid;grid-template-columns:1fr 1fr;gap:0}} section{{padding:40px 50px 30px}}
      .os{{background:#141618;color:#aaa}} img.g{{width:100%}} p{{margin:16px 0 0;text-align:center}}
      .app{{grid-column:1/3;background:#141618;color:#aaa;padding:30px 50px}}
      .tel{{width:393px;margin:0 auto;border-radius:28px;overflow:hidden;position:relative;height:150px;
            background:url('file://{FONDO}') center top/cover}}
      .tel::before{{content:"";position:absolute;inset:0;background:rgba(10,10,11,.78)}}
      .barra{{position:absolute;left:16px;right:16px;top:62px;display:flex;align-items:center;justify-content:space-between}}
      .barra img{{height:58px}} .chips{{font:12px system-ui;color:#ddd;background:rgba(16,16,18,.93);border:1.5px solid rgba(255,255,255,.24);
            border-radius:99px;padding:5px 9px}}
    </style><main>
      <section><img class="g" src="logo_c2.svg"><p>C con el árbol al lado contrario y en color (fondo blanco)</p></section>
      <section class="os"><img class="g" src="logo_c2_blanco.svg"><p>En fondo oscuro, como en la app</p></section>
      <div class="app"><div class="tel"><div class="barra"><img src="logo_c2_blanco.svg">
        <span class="chips">● GPS ● Acel ● Pantalla</span></div></div>
        <p>Así se vería arriba en la app (tamaño real de un iPhone, con el fondo Gallos)</p></div>
    </main>"""
    ruta = os.path.join(AQUI, '_hoja.html'); open(ruta, 'w').write(html)
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1600, 'height': 900}, device_scale_factor=1)
        pg.goto('file://' + ruta); pg.wait_for_timeout(400)
        pg.locator('main').screenshot(path=os.path.join(AQUI, 'hoja_c2.png')); b.close()
    os.remove(ruta)
    print('listo')
