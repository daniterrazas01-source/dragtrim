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

def arbol(C, Ht, color, lado=1, colores=False, una_barra=False, escala=1.0, filas=('ambar', 'ambar', 'verde', 'rojo'), pivote=None):
    """El árbol de la imagen de Daniel con origen en el centro de arriba (y hacia abajo; la línea base de las letras
    está en y = C). Los gruesos van en proporción a la mayúscula C (que pese igual que las letras); el largo es Ht.
    lado = 1: se inclina como la letra; -1: al lado contrario. Barras y poste se inclinan; los focos quedan redondos
    y solo su lugar sigue la inclinación. Con colores, cada foco tiene su caja (del color del árbol) y su luz de color:
    pre-stage y stage (foquitos), dos ámbar, verde y rojo. una_barra: pre-stage y stage en una sola barra con los
    foquitos adentro, para que el árbol se lea como una T.
    escala: el árbol más grande que las letras (anchos y focos); filas: colores de las filas de focos de arriba abajo.
    Ht = None: el poste baja lo justo debajo de la última fila.
    Devuelve (barras y poste [sin fill], cajas de los focos [sin fill], luces de color, derecha(y), xmin, xmax, Ht)."""
    k = escala
    barra_w = 0.92 * C * k
    if una_barra:
        barra_h, rr, poste_w = 0.21 * C * k, 0.03 * C * k, 0.16 * C * k
        filas_y0, paso = 0.43 * C * k, 0.215 * C * k
        foco_dx_t = 0.265 * C * k   # filas un poco más angostas: REE queda más cerca de la T
    else:
        barra_h, rr, poste_w = 0.15 * C, 0.025 * C, 0.11 * C
        filas_y0, paso = (0.74 * C, 0.226 * C) if Ht >= 1.9 * C else (0.64 * C, 0.19 * C)
    foquito_r = 0.05 * C
    foco_r, foco_dx, union_h = 0.088 * C * k, 0.29 * C * k, 0.05 * C * k
    if una_barra: foco_dx = foco_dx_t
    piv = C if pivote is None else pivote   # altura (desde arriba del árbol) alrededor de la que se inclina
    corre = lambda x, y: x + lado * TAN * (piv - y)
    rectos, cajas, luces, xs, formas = [], [], [], [], []
    def rect(x, y, w, h, extra=''):
        rectos.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}"{extra}/>')
        xs.extend(corre(px, py) for px in (x, x + w) for py in (y, y + h))
        formas.append(('r', x + w, y, y + h))
    def luz(cx, cy, r, tono):
        if colores:
            luces.append(f'<circle cx="{corre(cx, cy):.2f}" cy="{cy:.2f}" r="{r:.2f}" fill="{COLORES[tono]}"/>')
    def foco(cx, cy, r, tono):   # caja redonda del color del árbol + su luz
        x = corre(cx, cy); xs.extend((x - r, x + r)); formas.append(('c', x, cy, r))
        cajas.append(f'<circle cx="{x:.2f}" cy="{cy:.2f}" r="{r:.2f}"/>')
        luz(cx, cy, 0.72 * r, tono)
    if Ht is None: Ht = filas_y0 + paso * (len(filas) - 1) + foco_r + 0.24 * C * k
    rect(-poste_w / 2, 0, poste_w, Ht)                                                                       # poste
    if una_barra:                                                                                            # la T
        rect(-barra_w / 2, 0, barra_w, barra_h, f' rx="{rr:.2f}"')
        for dx in (-0.36, -0.2, 0.2, 0.36):
            luz(dx * C * k, barra_h / 2, 0.055 * C * k, 'stage')
    else:
        for y0 in (0.0, 0.33 * C):                                                                           # pre-stage y stage
            rect(-barra_w / 2, y0, barra_w, barra_h, f' rx="{rr:.2f}"')
            for dx in (-0.36, -0.18, 0.18, 0.36):
                foco(dx * C, y0 + barra_h, foquito_r, 'stage')
    for n, tono in enumerate(filas):
        cy = filas_y0 + paso * n
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
    return ''.join(rectos), ''.join(cajas), ''.join(luces), derecha, min(xs), max(xs), Ht

def capas(trazos, tinta, contorno, grueso):
    """Dibuja trazos (lista de (transform, svg sin fill)) en tinta; con contorno, primero todo en el color del contorno
    y más grueso (así el contorno rodea la figura completa y no se ve donde se juntan el poste y las barras)."""
    fuera = ''
    if contorno:
        fuera = ''.join(f'<g transform="{t}" fill="{contorno}" stroke="{contorno}" stroke-width="{2 * grueso:.2f}" stroke-linejoin="round">{x}</g>' for t, x in trazos)
    return fuera + ''.join(f'<g transform="{t}" fill="{tinta}">{x}</g>' for t, x in trazos)

def trazos_palabra(txt, alto_cap, x, base):
    glifos, ancho, izq, der, s = palabra(txt, alto_cap)
    return [(f'translate({x + dx:.2f} {base:.2f}) scale({s:.5f} {-s:.5f})', f'<path d="{d}"/>') for d, dx in glifos]

def logo(variante, color='#111', tinta_tree=None, contorno=None, grueso=0.02):
    """color: DRAG (y todo, si no se dice otra cosa). tinta_tree/contorno: color de TREE (árbol + REE) y de su contorno.
    grueso: contorno en fracciones de la mayúscula de REE."""
    C = 300.0                                    # alto de mayúscula de "REE"
    m = 60.0                                     # margen
    lado, colores, una = 1, False, False
    tinta_tree = tinta_tree or color
    if variante in ('a', 'b'):                   # a: como el dibujo de Daniel; b: igual en minúsculas
        Ht = 2.0 * C
        abajo = 'REE' if variante == 'a' else 'ree'
        arriba = 'DRAG' if variante == 'a' else 'Drag'
    else:                                        # c: compacto, DRAG a todo lo ancho (para el encabezado de la app)
        Ht = 1.42 * C                            # c2: árbol al lado contrario y con colores; c3: + la T de una barra
        abajo, arriba = 'REE', 'DRAG'
        if variante in ('c2', 'c3'): lado, colores = -1, True
        if variante == 'c3': una = True
    extra = {}
    if variante == 'c4':   # c4 (26 oct): la T más grande, inclinada como la letra y con tres ámbar, verde y rojo
        lado, colores, una, Ht = 1, True, True, None
        extra = dict(escala=1.22, filas=('ambar', 'ambar', 'ambar', 'verde', 'rojo'))
    g_rectos, g_cajas, g_luces, derecha, xmin, xmax, Ht = arbol(C, Ht, color, lado, colores, una, **extra)
    _, ancho_ree, izq_ree, der_ree, _ = palabra(abajo, C)
    base, tope = 0.0, -C
    # "REE" a la derecha del árbol: la R (su orilla izquierda sube inclinada) queda a "gap" de lo que le quede más
    # cerca del árbol a cualquier altura entre la línea base y la mayúscula (barras, focos o uniones).
    gap = (0.07 + (0.015 if variante == 'c4' else 0) + 2 * (grueso if contorno else 0)) * C   # c4: la T llega más cerca
    x_ree = max(d + gap - (izq_ree + TAN * (C - y)) for y in [C * k / 200 for k in range(201)] if (d := derecha(y)) is not None)
    trazos = [(f'translate(0 {base:.2f}) skewX({-lado * ANG:.3f}) translate(0 {-C:.2f})', g_rectos),
              (f'translate(0 {base - C:.2f})', g_cajas)] + trazos_palabra(abajo, C, x_ree, base)
    piezas = [capas(trazos, tinta_tree, contorno, grueso * C), f'<g transform="translate(0 {base - C:.2f})">{g_luces}</g>']
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

# DRAG en letra de bloque (26 oct): dibujada aquí, inspirada en la forma de "Full Pack 2025" (imagex) que mandó Daniel
# (esa letra es solo para uso personal, por eso no se usa su archivo). Letras derechas en unidades de su altura (y hacia
# arriba desde la línea base); se inclinan HACIA ATRÁS (arriba a la izquierda) ATRAS grados. Huecos con evenodd.
ATRAS = 20.0
def _letras_bloque():
    D, R, A, G = 1.05, 1.0, 1.0, 1.05
    letras = {
        'D': (D, [[(0, 0), (D - 0.3, 0), (D, 0.3), (D, 0.7), (D - 0.3, 1), (0, 1)],
                  [(0.3, 0.37), (D - 0.33, 0.37), (D - 0.33, 0.63), (0.3, 0.63)]]),
        'R': (R, [[(0, 0), (0.3, 0), (0.3, 0.34), (0.6, 0.34), (0.6, 0), (R, 0), (R, 0.4), (R - 0.16, 0.48), (R, 0.56),
                   (R, 0.8), (R - 0.2, 1), (0, 1)],
                  [(0.3, 0.6), (0.72, 0.6), (0.72, 0.78), (0.3, 0.78)]]),
        'A': (A, [[(0, 0), (0.3, 0), (0.3, 0.3), (0.7, 0.3), (0.7, 0), (A, 0), (A, 1), (0.36, 1), (0, 0.64)],
                  [(0.3, 0.52), (0.7, 0.52), (0.7, 0.72), (0.34, 0.72)]]),
        'G': (G, [[(0.18, 0), (G, 0), (G, 0.55), (0.56, 0.55), (0.56, 0.28), (0.3, 0.28), (0.3, 0.72), (G, 0.72), (G, 0.84),
                   (G - 0.16, 1), (0, 1), (0, 0.18)]]),
    }
    return letras
def svg_drag_bloque(izq, der, base, color):
    """DRAG en bloque inclinada hacia atrás, que llena de izq a der (tinta); línea base en base. Devuelve (svg, alto)."""
    L, sep, t = _letras_bloque(), 0.1, math.tan(math.radians(ATRAS))
    total = sum(L[c][0] for c in 'DRAG') + 3 * sep
    H = (der - izq) / (total + t)              # arriba a la izquierda sobresale t·H
    x0 = izq + t * H
    d, x = [], 0.0
    for c in 'DRAG':
        w, polis = L[c]
        for pts in polis:
            q = [(x0 + H * (x + px - t * py), base - H * py) for px, py in pts]
            d.append('M' + ' L'.join(f'{a:.2f} {b:.2f}' for a, b in q) + ' Z')
        x += w + sep
    return f'<path fill="{color}" fill-rule="evenodd" d="{" ".join(d)}"/>', H

# REE cuadrada (26 oct): dibujada aquí, inspirada en la forma de "Platinum Sign Over" (imagex) que mandó Daniel (solo
# uso personal: no se usa su archivo). Se dibuja directo a lo alto que ya tenía REE (no se estira: esquinas a 45° y
# gruesos parejos) y con la misma inclinación que la T. Devuelve (trazos para capas(), ancho, alto).
def ree_cuadrada(x, base, H, ancho, C):
    a, st, ch, sep = 0.30 * C, 0.27 * C, 0.16 * C, 0.085 * C      # brazos, palos, esquina cortada, entre letras
    wR = (ancho - 2 * sep) / 2.84                                   # R un poco más ancha que las E
    wE = 0.92 * wR
    m0, m1 = (H - a) / 2, (H + a) / 2                               # barra de en medio
    xa, lw = st + 0.1 * wR, 1.12 * st                               # pata de la R (diagonal)
    R = [[(0, 0), (st, 0), (st, m0), (xa, m0), (wR - lw, 0), (wR, 0), (xa + lw, m0), (wR, m0),
          (wR, H - ch), (wR - ch, H), (0, H)],
         [(st, m1), (wR - st, m1), (wR - st, H - a), (st, H - a)]]
    def E(w):
        return [[(0, 0), (w, 0), (w, a), (st, a), (st, m0), (0.86 * w, m0), (0.86 * w, m1), (st, m1), (st, H - a),
                 (w, H - a), (w, H), (ch, H), (0, H - ch)]]
    d, xx = [], x
    for polis, w in ((R, wR), (E(wE), wE), (E(wE), wE)):
        for pts in polis:
            q = [(xx + px + TAN * py, base - py) for px, py in pts]
            d.append('M' + ' L'.join(f'{u:.2f} {v:.2f}' for u, v in q) + ' Z')
        xx += w + sep
    return [('', f'<path fill-rule="evenodd" d="{" ".join(d)}"/>')], xx - sep - x

CURSIVA = os.path.join(AQUI, 'fuentes', 'MrDafoe-Regular.ttf')   # Mr Dafoe (OFL), letra a mano estilo hot rod
def cursiva(txt, ancho):
    """Trazos del lema en cursiva para que mida 'ancho' px. Devuelve (glifos, ancho, alto sobre la base, bajo la base, escala)."""
    fc = TTFont(CURSIVA); gs, cm = fc.getGlyphSet(), fc.getBestCmap()
    x, gl, arriba, abajo = 0.0, [], 0.0, 0.0
    for ch in txt:
        g = gs[cm[ord(ch)]]; pen = SVGPathPen(gs); g.draw(pen); bp = BoundsPen(gs); g.draw(bp)
        if bp.bounds: arriba, abajo = max(arriba, bp.bounds[3]), min(abajo, bp.bounds[1])
        gl.append((pen.getCommands(), x)); x += g.width
    k = ancho / x
    return [(d, dx * k) for d, dx in gl], ancho, arriba * k, -abajo * k, k

def logo_c5(color='#111', tinta_tree='#111', contorno='#fff', grueso=0.035, drag='inter', letra_ree='inter', giro=0.0, lema=None):
    """C5 (26 oct, dibujo de Daniel): la T sube y se monta un poco sobre la D y la R de DRAG (va encima, con su
    contorno); R, E, E más largas hacia abajo, hasta el pie del árbol (se estiran a lo alto sin cambiar la
    inclinación); contorno más grueso. color: DRAG; tinta_tree/contorno: TREE y su contorno."""
    C, m = 300.0, 60.0
    sube = 0.32 * C                                  # cuánto sube la T: su barra se monta 0.12 C sobre DRAG
    Y_top = -C                                       # arriba de R, E, E (donde estaba)
    Y_t = Y_top - sube                               # arriba de la T
    # el árbol (primero sin saber dónde queda la línea base de REE: su largo no depende de eso)
    *_, Ht = arbol(C, None, tinta_tree, 1, True, True, 1.22, ('ambar', 'ambar', 'ambar', 'verde', 'rojo'))
    Y_b = Y_t + Ht - 0.04 * C                        # línea base de R, E, E: casi al pie del árbol
    v = (Y_b - Y_top) / C                            # cuánto se estiran a lo alto
    piv = Y_b - Y_t
    g_rectos, g_cajas, g_luces, derecha, xmin, xmax, Ht = arbol(C, None, tinta_tree, 1, True, True, 1.22,
                                                                ('ambar', 'ambar', 'ambar', 'verde', 'rojo'), piv)
    glifos, ancho_ree, izq_ree, der_ree, s = palabra('REE', C)
    gap = (0.085 + 2 * grueso) * C
    x_ree = max(d + gap - (izq_ree + TAN * (Y_b - Y)) for Y in [Y_top + (Y_b - Y_top) * k / 300 for k in range(301)]
                if (d := derecha(Y - Y_t)) is not None)
    cc = s * TAN * (v - 1)                           # estirar a lo alto conservando la inclinación de la letra
    ree = [(f'matrix({s:.5f} 0 {cc:.5f} {-s * v:.5f} {x_ree + dx:.2f} {Y_b:.2f})', f'<path d="{d}"/>') for d, dx in glifos]
    der_ree_total = x_ree + der_ree + TAN * C * (v - 1)
    if letra_ree == 'cuadrada':   # c7: R, E, E cuadradas del mismo ancho que las de Inter, dibujadas a lo alto
        x_rq = max(dd + gap - TAN * (Y_b - Y) for Y in [Y_top + (Y_b - Y_top) * k / 300 for k in range(301)]
                   if (dd := derecha(Y - Y_t)) is not None)
        ree, ancho_q = ree_cuadrada(x_rq, Y_b, Y_b - Y_top, der_ree - izq_ree, C)
        pie_ree = (x_rq, x_rq + ancho_q)   # dónde pisa REE (para el lema)
        der_ree_total = x_rq + ancho_q + TAN * (Y_b - Y_top)
    trazos = [(f'translate(0 {Y_t + piv:.2f}) skewX({-ANG:.3f}) translate(0 {-piv:.2f})', g_rectos),
              (f'translate(0 {Y_t:.2f})', g_cajas)] + ree
    izq_total = xmin
    der_total = der_ree_total
    # DRAG a todo lo ancho, del árbol a la última E; va abajo de la T (la T se monta encima)
    base_d = Y_top - 0.2 * C
    if drag == 'bloque':   # c6: DRAG en letra de bloque inclinada hacia atrás
        g_drag, Cd = svg_drag_bloque(izq_total, der_total, base_d, color)
        der_drag = der_total
    else:
        _, _, izq_d, der_d, _ = palabra('DRAG', C)
        Cd = C * (der_total - izq_total) / (der_d - izq_d)
        _, _, izq_d, der_d, _ = palabra('DRAG', Cd)
        x_d = izq_total - izq_d
        g_drag, der_drag = svg_palabra('DRAG', Cd, x_d, base_d, color), x_d + der_d
    piezas = [g_drag, capas(trazos, tinta_tree, contorno, grueso * C), f'<g transform="translate(0 {Y_t:.2f})">{g_luces}</g>']
    arriba_total, abajo_total = base_d - Cd, max(Y_b, Y_t + Ht)
    caja = [izq_total, arriba_total, max(der_total, der_drag), abajo_total]
    if giro:
        # c8 (26 oct): todo el logo sube hacia la derecha (giro°, como la calcomanía original) y abajo, en el hueco que
        # queda bajo REE, el lema en cursiva (Mr Dafoe, OFL) derecho, del color de DRAG
        cx, cy = (caja[0] + caja[2]) / 2, (caja[1] + caja[3]) / 2
        ca, sa = math.cos(math.radians(giro)), math.sin(math.radians(giro))
        rot = lambda x, y: (cx + (x - cx) * ca + (y - cy) * sa, cy - (x - cx) * sa + (y - cy) * ca)
        esquinas = [rot(x, y) for x in (caja[0], caja[2]) for y in (caja[1], caja[3])]
        piezas = [f'<g transform="rotate({-giro:.2f} {cx:.2f} {cy:.2f})">' + ''.join(piezas) + '</g>']
        caja = [min(p[0] for p in esquinas), min(p[1] for p in esquinas), max(p[0] for p in esquinas), max(p[1] for p in esquinas)]
        if lema:
            (p1x, p1y), (p2x, p2y) = rot(pie_ree[0], Y_b), rot(pie_ree[1], Y_b)
            y_pie = lambda x: p1y + (x - p1x) * (p2y - p1y) / (p2x - p1x)   # orilla de abajo de REE, ya girada
            glifos, ancho_l, sube_l, baja_l, k = cursiva(lema, 0.78 * (pie_ree[1] - pie_ree[0]))
            xd = p2x - 0.02 * C                                              # termina bajo la última E
            xi = xd - ancho_l
            base_l = y_pie(xi) + grueso * C + 0.07 * C + sube_l              # su parte de arriba, justo bajo REE
            piezas.append(f'<g fill="{color}">' + ''.join(
                f'<path transform="translate({xi + dx:.2f} {base_l:.2f}) scale({k:.5f} {-k:.5f})" d="{d}"/>' for d, dx in glifos) + '</g>')
            caja = [min(caja[0], xi), caja[1], max(caja[2], xd), max(caja[3], base_l + baja_l)]
    x0, y0 = caja[0] - m, caja[1] - m
    w, h = caja[2] - caja[0] + 2 * m, caja[3] - caja[1] + 2 * m
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.1f} {y0:.1f} {w:.1f} {h:.1f}" width="{w:.0f}" height="{h:.0f}">'
            + ''.join(piezas) + '</svg>')

if __name__ == '__main__':
    VARIANTES = ('a', 'b', 'c', 'c2')
    for v in VARIANTES:
        for nombre, color in (('', '#111'), ('_blanco', '#fff')):
            open(os.path.join(AQUI, f'logo_{v}{nombre}.svg'), 'w').write(logo(v, color))
    # c3 (26 oct): la T de una barra; TREE negro con contorno blanco delgado
    open(os.path.join(AQUI, 'logo_c3.svg'), 'w').write(logo('c3', '#111'))
    open(os.path.join(AQUI, 'logo_c3_oscuro.svg'), 'w').write(logo('c3', '#fff', '#111', '#fff', 0.02))
    open(os.path.join(AQUI, 'logo_c3_encabezado.svg'), 'w').write(logo('c3', '#fff', '#111', '#fff', 0.06))   # chiquito: contorno de ~1 px
    # c5 (26 oct): la T se monta sobre DRAG, REE más largas, contorno más grueso (en claro el contorno separa la T de DRAG)
    open(os.path.join(AQUI, 'logo_c5.svg'), 'w').write(logo_c5('#111', '#111', '#fff', 0.035))
    open(os.path.join(AQUI, 'logo_c5_oscuro.svg'), 'w').write(logo_c5('#fff', '#111', '#fff', 0.035))
    open(os.path.join(AQUI, 'logo_c5_encabezado.svg'), 'w').write(logo_c5('#fff', '#111', '#fff', 0.08))
    # c6 (26 oct): como c5 pero DRAG en letra de bloque inclinada hacia atrás
    open(os.path.join(AQUI, 'logo_c6.svg'), 'w').write(logo_c5('#111', '#111', '#fff', 0.035, 'bloque'))
    open(os.path.join(AQUI, 'logo_c6_oscuro.svg'), 'w').write(logo_c5('#fff', '#111', '#fff', 0.035, 'bloque'))
    open(os.path.join(AQUI, 'logo_c6_encabezado.svg'), 'w').write(logo_c5('#fff', '#111', '#fff', 0.08, 'bloque'))
    # c7 (26 oct): como c6 pero R, E, E cuadradas (forma de Platinum Sign Over), dibujadas a lo alto
    open(os.path.join(AQUI, 'logo_c7.svg'), 'w').write(logo_c5('#111', '#111', '#fff', 0.035, 'bloque', 'cuadrada'))
    open(os.path.join(AQUI, 'logo_c7_oscuro.svg'), 'w').write(logo_c5('#fff', '#111', '#fff', 0.035, 'bloque', 'cuadrada'))
    open(os.path.join(AQUI, 'logo_c7_encabezado.svg'), 'w').write(logo_c5('#fff', '#111', '#fff', 0.08, 'bloque', 'cuadrada'))
    # c8 (26 oct): c7 inclinado hacia arriba con "On the mark" en cursiva abajo
    for nombre, args in (('logo_c8', ('#111', '#111', '#fff', 0.035)), ('logo_c8_oscuro', ('#fff', '#111', '#fff', 0.035)),
                         ('logo_c8_encabezado', ('#fff', '#111', '#fff', 0.08))):
        open(os.path.join(AQUI, nombre + '.svg'), 'w').write(logo_c5(*args, 'bloque', 'cuadrada', giro=8.0, lema='On the mark'))
    # c4 (26 oct): la T más grande, inclinada como la letra, tres ámbar
    open(os.path.join(AQUI, 'logo_c4.svg'), 'w').write(logo('c4', '#111'))
    open(os.path.join(AQUI, 'logo_c4_oscuro.svg'), 'w').write(logo('c4', '#fff', '#111', '#fff', 0.02))
    open(os.path.join(AQUI, 'logo_c4_encabezado.svg'), 'w').write(logo('c4', '#fff', '#111', '#fff', 0.06))
    if '--sin-hoja' in sys.argv: sys.exit()
    from playwright.sync_api import sync_playwright
    FONDO = os.path.abspath(os.path.join(AQUI, '..', '..', '..', 'fondos', 'gallos.webp'))
    html = f"""<!doctype html><meta charset="utf-8"><style>
      body{{margin:0;font:600 22px system-ui;color:#555;background:#fff}}
      main{{display:grid;grid-template-columns:1fr 1fr;gap:0}} section{{padding:40px 50px 30px}}
      .os{{background:#141618;color:#aaa}} img.g{{width:100%}} p{{margin:16px 0 0;text-align:center}}
      .app{{grid-column:1/3;background:#141618;color:#aaa;padding:30px 50px;display:flex;gap:40px;justify-content:center;align-items:end}}
      .tel{{width:393px;border-radius:28px;overflow:hidden;position:relative;height:150px;background:url('file://{FONDO}') center top/cover}}
      .tel.sin{{background:#24282c}}
      .tel:not(.sin)::before{{content:"";position:absolute;inset:0;background:rgba(10,10,11,.78)}}
      .barra{{position:absolute;left:16px;right:16px;top:62px;display:flex;align-items:center;justify-content:space-between}}
      .barra img{{height:60px}} .chips{{font:12px system-ui;color:#ddd;background:rgba(16,16,18,.93);border:1.5px solid rgba(255,255,255,.24);
            border-radius:99px;padding:5px 9px}}
    </style><main>
      <section><img class="g" src="logo_c8.svg"><p>En fondo blanco</p></section>
      <section class="os"><img class="g" src="logo_c8_oscuro.svg"><p>En fondo oscuro: TREE negro con contorno blanco</p></section>
      <div class="app">
        <div><div class="tel"><div class="barra"><img src="logo_c8_encabezado.svg"><span class="chips">● GPS ● Acel ● Pantalla</span></div></div>
          <p>Arriba en la app, con el fondo Gallos</p></div>
        <div><div class="tel sin"><div class="barra"><img src="logo_c8_encabezado.svg"><span class="chips">● GPS ● Acel ● Pantalla</span></div></div>
          <p>Arriba en la app, sin fondo</p></div>
      </div>
    </main>"""
    ruta = os.path.join(AQUI, '_hoja.html'); open(ruta, 'w').write(html)
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1600, 'height': 900}, device_scale_factor=1)
        pg.goto('file://' + ruta); pg.wait_for_timeout(400)
        pg.locator('main').screenshot(path=os.path.join(AQUI, 'hoja_c8.png')); b.close()
    os.remove(ruta)
    print('listo')
