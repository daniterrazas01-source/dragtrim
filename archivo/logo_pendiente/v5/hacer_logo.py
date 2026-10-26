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

def arbol(C, Ht, color):
    """El árbol de la imagen de Daniel con origen en el centro de arriba (y hacia abajo; la línea base de las letras
    está en y = C). Los gruesos van en proporción a la mayúscula C (que pese igual que las letras); el largo es Ht.
    Devuelve (barras y poste: se inclinan con la letra; focos: redondos, solo su lugar sigue la inclinación)."""
    barra_w, barra_h, rr = 0.92 * C, 0.15 * C, 0.025 * C
    foquito_r, poste_w = 0.05 * C, 0.11 * C
    foco_r, foco_dx, union_h = 0.088 * C, 0.29 * C, 0.05 * C
    filas_y0, paso = (0.74 * C, 0.226 * C) if Ht >= 1.9 * C else (0.64 * C, 0.19 * C)
    rectos, redondos = [], []
    def foco(cx, cy, r):   # el centro se corre con la inclinación (alrededor de la línea base), el círculo no se deforma
        redondos.append(f'<circle cx="{cx + TAN * (C - cy):.2f}" cy="{cy:.2f}" r="{r:.2f}"/>')
    rectos.append(f'<rect x="{-poste_w / 2:.2f}" y="0" width="{poste_w:.2f}" height="{Ht:.2f}"/>')          # poste
    for y0 in (0.0, 0.33 * C):                                                                               # pre-stage y stage
        rectos.append(f'<rect x="{-barra_w / 2:.2f}" y="{y0:.2f}" width="{barra_w:.2f}" height="{barra_h:.2f}" rx="{rr:.2f}"/>')
        for dx in (-0.36, -0.18, 0.18, 0.36):
            foco(dx * C, y0 + barra_h, foquito_r)
    for k in range(4):                                                                                       # ámbares y verde
        cy = filas_y0 + paso * k
        rectos.append(f'<rect x="{-foco_dx:.2f}" y="{cy - union_h / 2:.2f}" width="{2 * foco_dx:.2f}" height="{union_h:.2f}"/>')
        for sx in (-1, 1):
            foco(sx * foco_dx, cy, foco_r)
    return ''.join(rectos), ''.join(redondos), barra_w

def logo(variante, color='#111'):
    C = 300.0                                    # alto de mayúscula de "REE"
    m = 60.0                                     # margen
    if variante in ('a', 'b'):                   # a: como el dibujo de Daniel; b: igual en minúsculas
        Ht = 2.0 * C
        abajo = 'REE' if variante == 'a' else 'ree'
        arriba = 'DRAG' if variante == 'a' else 'Drag'
    else:                                        # c: compacto, DRAG a todo lo ancho (para el encabezado de la app)
        Ht = 1.42 * C
        abajo, arriba = 'REE', 'DRAG'
    g_rectos, g_redondos, barra_w = arbol(C, Ht, color)
    # "REE" a la derecha del árbol: la orilla de la barra queda a la misma distancia que entre letras
    _, ancho_ree, izq_ree, der_ree, _ = palabra(abajo, C)
    gap = 0.06 * C
    # el árbol se inclina alrededor de la línea base de REE; su barra de arriba va a la altura de la mayúscula
    base = 0.0
    tope = base - C
    x_arbol_base = 0.0                                              # centro del poste en la línea base
    der_barra_arriba = x_arbol_base + TAN * C + barra_w / 2         # orilla derecha de la barra (arriba, inclinada)
    # la R arranca con su tinta a "gap" de la barra, medido a la altura de la mayúscula (donde están más cerca)
    x_ree = der_barra_arriba + gap - izq_ree - TAN * C * 0.0
    piezas = [f'<g fill="{color}" transform="translate({x_arbol_base:.2f} {base:.2f}) skewX({-ANG:.3f}) translate(0 {-C:.2f})">{g_rectos}</g>',
              f'<g fill="{color}" transform="translate({x_arbol_base:.2f} {base - C:.2f})">{g_redondos}</g>',
              svg_palabra(abajo, C, x_ree, base, color)]
    izq_total = x_arbol_base - barra_w / 2 + TAN * (C - Ht)         # punta de abajo-izquierda del árbol (aprox.)
    izq_total = min(izq_total, x_arbol_base - barra_w / 2)
    der_total = x_ree + der_ree
    abajo_total = base + (Ht - C)
    if variante in ('a', 'b'):
        # DRAG arriba de REE, del mismo ancho de tinta y alineada a la R
        _, _, izq_d, der_d, _ = palabra(arriba, C)
        Cd = C * (der_ree - izq_ree) / (der_d - izq_d)
        _, _, izq_d, der_d, _ = palabra(arriba, Cd)
        base_d = tope - 0.22 * C
        x_d = x_ree + izq_ree - izq_d + TAN * (C + 0.22 * C) * 0.0
        piezas.append(svg_palabra(arriba, Cd, x_d, base_d, color))
        arriba_total = base_d - Cd
    else:
        # DRAG a todo lo ancho, del árbol a la última E
        _, _, izq_d, der_d, _ = palabra(arriba, C)
        ancho_t = der_total - izq_total
        Cd = C * ancho_t / (der_d - izq_d)
        _, _, izq_d, der_d, _ = palabra(arriba, Cd)
        base_d = tope - 0.2 * C
        x_d = izq_total - izq_d
        piezas.append(svg_palabra(arriba, Cd, x_d, base_d, color))
        arriba_total = base_d - Cd
    x0, y0 = izq_total - m, arriba_total - m
    w, h = der_total - izq_total + 2 * m + TAN * Ht, abajo_total - arriba_total + 2 * m
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.1f} {y0:.1f} {w:.1f} {h:.1f}" width="{w:.0f}" height="{h:.0f}">'
            + ''.join(piezas) + '</svg>')

if __name__ == '__main__':
    for v in 'abc':
        for nombre, color in (('', '#111'), ('_blanco', '#fff')):
            open(os.path.join(AQUI, f'logo_{v}{nombre}.svg'), 'w').write(logo(v, color))
    if '--sin-hoja' in sys.argv: sys.exit()
    from playwright.sync_api import sync_playwright
    titulos = {'a': 'A · como tu dibujo', 'b': 'B · igual, en minúsculas como tu imagen', 'c': 'C · compacto (para la app)'}
    for hoja, fondo, sufijo, tinta in (('claro', '#ffffff', '', '#555'), ('oscuro', '#141618', '_blanco', '#aaa')):
        celdas = ''.join(f'<figure><img src="logo_{v}{sufijo}.svg"><figcaption>{titulos[v]}</figcaption></figure>' for v in 'abc')
        html = f'''<!doctype html><meta charset="utf-8"><style>body{{margin:0;background:{fondo};font:600 22px system-ui;color:{tinta}}}
        main{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;padding:40px;align-items:end}} img{{width:100%}}
        figure{{margin:0}} figcaption{{margin-top:14px;text-align:center}}</style><main>{celdas}</main>'''
        ruta = os.path.join(AQUI, f'_hoja_{hoja}.html'); open(ruta, 'w').write(html)
        with sync_playwright() as p:
            b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1800, 'height': 800})
            pg.goto('file://' + ruta); pg.wait_for_timeout(300)
            pg.locator('main').screenshot(path=os.path.join(AQUI, f'hoja_{hoja}.png')); b.close()
        os.remove(ruta)
    print('listo')
