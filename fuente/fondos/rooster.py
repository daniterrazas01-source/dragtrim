"""Fondo "Rooster" (7 nov 2026, Daniel: "añadir un fondo más, que se llame Rooster… agregues dos logos de marcas de carros
con el mismo estilo de los stickers de estos fondos… Ford y Chevrolet, que aparezcan tres veces cada uno. Y los logos de
marcas que ya tenemos que aparezcan son la de NOS, AEM, Holley, Summit, el que dice Arrancones, Two Step, Fueltech, Jex,
MSD, el que dice Cuarto de Milla, la botellita chiquita de Nitro, Moroso, también el turbito chiquito de sticker, y
aeromotive"; y luego: "agrégale que aparezca tres veces este logo, el de la R con flama, como en el fondo de gallos").
"Jex" se tomó como JEGS (el de cuadritos).

Un sticker bomb nuevo armado solo con esas marcas:
  - los stickers de las marcas salen completos de los fondos de Daniel (STICKERS: de qué fondo, un punto del contorno
    negro de cada pieza y el ancho de su borde blanco), con los colores de este fondo: blanco, negro y el rojo de Rooster
    Racing (los de neón pasan a rojo o a blanco; VERSIONES);
  - Ford (el óvalo con "Ford" en letra script: Yellowtail, Apache 2.0, en rooster/letras/) y Chevrolet (el moño) se dibujan
    aquí con el mismo estilo: orilla negra, borde blanco recortado y sombra. Tres de cada uno (FORD, CHEVROLET);
  - la R con flamas de Rooster Racing, tres veces, igual que en Gallos (el mismo sticker de logos_rooster.py);
  - encima, completos y repartidos: las 3 R, los 3 Ford, los 3 Chevrolet y un sticker de cada marca; abajo, tapando todo lo demás,
    más stickers de las mismas marcas en sus dos versiones, encimados como un sticker bomb de verdad.
Sale de pie (1290×2796, como los demás fondos) y acostado (2700×1290, como acostados.py) con los stickers del mismo
tamaño, más las formas que se prenden en Práctica: verde = las R, Ford, Chevrolet, AEM y JEGS de encima; rojo = las R, Ford,
Chevrolet y todo lo rojo. Escribe fondo_marcas_rooster.png, acostados/fondo_marcas_rooster.png, brillo/rooster-<color>.png y
brillo/acostados/rooster-<color>.png; build.py los toma como a los demás.
Uso: python3 rooster.py              arma todo desde rooster/receta.json (solo numpy y PIL)
     python3 rooster.py buscar [n]   busca otro acomodo (necesita scipy; n = semilla) y reescribe rooster/receta.json
"""
import json
import pathlib
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import acostados as A   # noqa: E402  (cargar, rellenar, distancia, mezclas, colores, pegar, sombra)
import logos_rooster as LR   # noqa: E402  (la R con flamas de Rooster Racing, como en Gallos)
from hacer_mascaras import etiquetar   # noqa: E402

CARPETA = AQUI / 'rooster'
RECETA = CARPETA / 'receta.json'
LETRA_FORD = CARPETA / 'letras' / 'Yellowtail-Regular.ttf'
LIENZOS = {'vertical': (A.ANCHO, A.ALTO), 'acostado': (A.AH, A.AV)}
BLANCO, NEGRO, ROJO = (255, 255, 255), (18, 18, 18), (226, 18, 10)
AZUL_FORD = (20, 82, 196)                   # del azul de la botella de NOS
ORO, ORO_SOMBRA = (240, 192, 66), (214, 152, 34)
ROJO_SOMBRA = (184, 12, 6)
MARGEN, ORILLA = 13, 8                       # borde blanco y orilla negra de los stickers dibujados

# tipo: (fondo de donde sale, un punto del contorno negro de cada pieza, borde blanco en px)
STICKERS = {
    'nos':        ('combinado', [(462, 888)], 13),
    'aem':        ('rojo', [(838, 1165)], 13),
    'holley':     ('combinado_rojo', [(283, 2367), (351, 2364), (377, 2363), (460, 2359), (554, 2355), (621, 2352)], 12),
    'summit':     ('combinado', [(1077, 1786)], 12),
    'arrancones': ('rojo', [(1104, 396)], 13),
    '2step':      ('blanco_negro', [(315, 662), (381, 693), (452, 677), (520, 685), (580, 692), (649, 700)], 12),
    'fueltech':   ('rojo', [(1240, 847)], 15),
    'jegs':       ('rojo', [(111, 319)], 13),
    'msd':        ('rojo', [(727, 1534)], 13),
    'cuarto':     ('combinado', [(647, 1627)], 13),
    'botella':    ('combinado', [(81, 1087)], 13),
    'moroso':     ('combinado', [(1197, 169), (1142, 172), (1081, 175), (1025, 178), (964, 181), (900, 183)], 12),
    'turbo':      ('blanco_negro', [(198, 406)], 15),
    'aeromotive': ('rojo', [(769, 618), (699, 641), (797, 616), (784, 629), (843, 612), (842, 624), (918, 607),
                            (948, 616), (1135, 591)], 12),
    # otras formas de las mismas marcas, solo abajo (para que no se vea siempre el mismo)
    'nos_pastilla': ('combinado', [(172, 81)], 12),
    'msd_circulo':  ('blanco_negro', [(1203, 2223)], 13),
}
INV = {'blanco': 'negro', 'negro': 'blanco'}
VERSIONES = {   # cambios de color de cada sticker; la primera es la del que va encima
    'nos': [{}, {'rojo': 'blanco'}], 'arrancones': [{}, {'rojo': 'blanco'}],
    'aem': [{}, INV], 'summit': [{}, INV], 'fueltech': [{}, INV], 'jegs': [{}, INV], 'msd': [{}, INV],
    'turbo': [{}, INV], 'msd_circulo': [{}, INV],
    'holley': [{'verde': 'rojo'}, {'verde': 'blanco'}], 'cuarto': [{'verde': 'rojo'}, {'verde': 'blanco'}],
    'botella': [{'verde': 'rojo'}, {'verde': 'blanco'}], 'moroso': [{'verde': 'rojo'}, {'verde': 'blanco'}],
    'nos_pastilla': [{'verde': 'rojo'}, {'verde': 'blanco'}],
    '2step': [{}, {'negro': 'rojo'}], 'aeromotive': [{}, {'negro': 'rojo'}],
}
SOLO_ABAJO = {'nos_pastilla', 'msd_circulo'}
LARGOS = {'arrancones', 'aeromotive', 'holley', 'summit', 'fueltech', 'moroso', '2step', 'cuarto'}   # pueden ir parados
FORD = [('azul', 430), ('azul', 380), ('negro', 400)]            # (versión, ancho en px) de cada uno
CHEVROLET = [('dorado', 450), ('dorado', 400), ('rojo', 420)]
ROOSTER_R = [411, 478, 411]   # ancho de cada R con flamas (los de Gallos: 172, 200 y 172 a 540 px de ancho)
MARCAS_DIBUJADAS = ('rooster_r', 'ford', 'chevrolet')   # van tres veces cada una, encima
VERDE_EXTRA = {'aem', 'jegs'}       # de encima que también se prenden en verde en Práctica


# ---------------------------------------------------------------- stickers de los fondos
_fondos = {}


def fondo(fid):
    """El fondo de pie y sus piezas negras (se calculan una vez)."""
    if fid not in _fondos:
        a = A.cargar(fid)
        _fondos[fid] = (a, etiquetar(a.max(axis=2) < A.NEGRO)[0])
    return _fondos[fid]


def recortar(a, nucleo, X0, Y0, margen, mapa, palabra):
    """Sticker con su borde: nucleo = lo de adentro del contorno (bool, con esquina en X0, Y0 del fondo). mapa cambia
    colores de la paleta (A.PALETA). En las palabras todo lo de afuera de las letras se pinta del color del borde."""
    d = A.distancia(nucleo, margen + 1.5)
    rgb = a[Y0:Y0 + nucleo.shape[0], X0:X0 + nucleo.shape[1]].astype(np.float32).copy()
    borde = np.array(BLANCO, np.float32)
    perm = np.array([A.NOMBRES.index(mapa.get(n, n)) for n in A.NOMBRES])
    if mapa:
        P = rgb[d == 0]
        I, J, T, err = A.mezclas(P)
        nuevo = A.COLORES[perm[I]] * (1 - T[:, None]) + A.COLORES[perm[J]] * T[:, None]
        rgb[d == 0] = np.where((err <= 50)[:, None], nuevo, P)
    if mapa or palabra:
        # la orilla suave entre el contorno (ya con su color nuevo) y el borde
        anillo = (d > 0) & (d <= 2.5)
        neg = A.COLORES[A.NOMBRES.index('negro')]
        t = np.clip(((rgb[anillo] - neg) @ (borde - neg)) / ((borde - neg) @ (borde - neg)), 0, 1)[:, None]
        rgb[anillo] = A.COLORES[perm[A.NOMBRES.index('negro')]] * (1 - t) + borde * t
    rgb[d > (2.5 if palabra else max(4, margen - 4))] = borde
    alfa = np.clip(margen + 1.0 - d, 0, 1)
    yy, xx = np.nonzero(alfa > 0)
    y0, y1, x0, x1 = yy.min(), yy.max() + 1, xx.min(), xx.max() + 1
    return Image.fromarray(np.dstack([rgb[y0:y1, x0:x1], alfa[y0:y1, x0:x1] * 255]).round().astype(np.uint8), 'RGBA')


def sacar(tipo, mapa):
    fid, puntos, margen = STICKERS[tipo]
    a, et = fondo(fid)
    piezas = np.isin(et, [et[y, x] for x, y in puntos])
    ys, xs = np.nonzero(piezas)
    R = margen + 8
    X0, Y0 = max(0, xs.min() - R), max(0, ys.min() - R)
    X1, Y1 = min(a.shape[1], xs.max() + 1 + R), min(a.shape[0], ys.max() + 1 + R)
    sub = piezas[Y0:Y1, X0:X1]
    nucleo = A.rellenar(sub)
    palabra = len(puntos) > 1
    if palabra:   # las letras traen huequitos de 1–2 px en el contorno: se cierran antes de rellenar
        r = 3
        g = A.rellenar(A.distancia(sub, r + 0.5) <= r)
        nucleo |= A.distancia(~g, r + 1.5) > r
    return recortar(a, nucleo, X0, Y0, margen, mapa, palabra)


# ---------------------------------------------------------------- Ford y Chevrolet, dibujados con el mismo estilo
S = 4   # se dibujan 4 veces más grandes y se achican: orillas suaves


def ford(version, ancho):
    """Óvalo de Ford: borde blanco recortado, orilla negra, relleno, la línea de adentro y "Ford" en script."""
    relleno, linea, letra = {'azul': (AZUL_FORD, BLANCO, BLANCO), 'negro': (NEGRO, BLANCO, BLANCO),
                             'blanco': (BLANCO, NEGRO, NEGRO)}[version]
    W, H = ancho, round(ancho / 2.45)
    pad = MARGEN + 6
    im = Image.new('RGBA', ((W + 2 * pad) * S, (H + 2 * pad) * S), BLANCO + (0,))
    d = ImageDraw.Draw(im)

    def ovalo(dentro, **kw):
        d.ellipse(((pad + dentro) * S, (pad + dentro) * S, (pad + W - dentro) * S, (pad + H - dentro) * S), **kw)
    ovalo(-MARGEN, fill=BLANCO + (255,))
    ovalo(0, fill=NEGRO + (255,))
    ovalo(ORILLA, fill=relleno + (255,))
    ovalo(ORILLA + 5, outline=linea + (255,), width=4 * S)
    f = ImageFont.truetype(str(LETRA_FORD), 100 * S)
    x0, y0, x1, y1 = d.textbbox((0, 0), 'Ford', font=f)
    k = 0.60 * W * S / (x1 - x0)
    f = ImageFont.truetype(str(LETRA_FORD), round(100 * S * k))
    x0, y0, x1, y1 = d.textbbox((0, 0), 'Ford', font=f)
    cx, cy = (pad + W / 2) * S, (pad + H / 2) * S
    d.text((cx - (x0 + x1) / 2, cy - (y0 + y1) / 2 - 0.02 * H * S), 'Ford', font=f, fill=letra + (255,),
           stroke_width=round(1.2 * S), stroke_fill=letra + (255,))
    return recorte_alfa(im.resize((W + 2 * pad, H + 2 * pad), Image.LANCZOS))


# El moño de Chevrolet: una cruz (la barra de en medio, más alta, y las alas) inclinada como paralelogramo, así todas las
# orillas inclinadas van paralelas. Caja de ~97 × 34, y hacia abajo, en el sentido del reloj.
def _mono(inclina=0.28, alto=34, alas=(9, 25), medio=(31, 62), largo=90):
    def p(x, y):
        return (round(x + inclina * (alto - y), 2), y)
    (a0, a1), (m0, m1) = alas, medio
    return [p(m0, 0), p(m1, 0), p(m1, a0), p(largo, a0), p(largo, a1), p(m1, a1), p(m1, alto), p(m0, alto),
            p(m0, a1), p(0, a1), p(0, a0), p(m0, a0)]


MONO = _mono()


def desplazar(P, dist):
    """El polígono con sus lados movidos dist px hacia afuera (negativo: hacia adentro), esquinas en punta."""
    P = np.asarray(P, float)
    n = len(P)
    area = 0.5 * sum(P[i, 0] * P[(i + 1) % n, 1] - P[(i + 1) % n, 0] * P[i, 1] for i in range(n))
    lados = []
    for i in range(n):
        u = P[(i + 1) % n] - P[i]
        u /= np.hypot(*u)
        nrm = np.array([u[1], -u[0]]) * (1 if area > 0 else -1)
        lados.append((P[i] + dist * nrm, u))
    out = []
    for i in range(n):
        (p1, u1), (p2, u2) = lados[i - 1], lados[i]
        M = np.array([u1, -u2]).T
        s = np.linalg.solve(M, p2 - p1)
        out.append(tuple(p1 + s[0] * u1))
    return out


def chevrolet(version, ancho):
    """El moño: borde blanco recortado (esquinas redondas), orilla negra, una línea blanca y el relleno en dos tonos."""
    claro, oscuro = {'dorado': (ORO, ORO_SOMBRA), 'rojo': (ROJO, ROJO_SOMBRA), 'negro': (NEGRO, NEGRO)}[version]
    ancho_m, alto_m = max(x for x, _ in MONO), max(y for _, y in MONO)
    k = ancho / ancho_m
    pad = MARGEN + 6
    W, H = ancho + 2 * pad, round(alto_m * k) + 2 * pad
    P = [((x * k + pad) * S, (y * k + pad) * S) for x, y in MONO]
    im = Image.new('RGBA', (W * S, H * S), BLANCO + (0,))
    d = ImageDraw.Draw(im)
    d.polygon(P, fill=BLANCO + (255,))
    d.line(P + [P[0]], fill=BLANCO + (255,), width=2 * MARGEN * S, joint='curve')
    for x, y in P:
        d.ellipse((x - MARGEN * S, y - MARGEN * S, x + MARGEN * S, y + MARGEN * S), fill=BLANCO + (255,))
    d.polygon(P, fill=NEGRO + (255,))
    d.polygon(desplazar(P, -ORILLA * S), fill=BLANCO + (255,))
    adentro = desplazar(P, -(ORILLA + 4) * S)
    d.polygon(adentro, fill=claro + (255,))
    # la mitad de abajo, más oscura (como el moño de verdad, que tiene un doblez)
    capa = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(capa).polygon(adentro, fill=oscuro + (255,))
    corte = Image.new('L', im.size, 0)
    ImageDraw.Draw(corte).rectangle((0, round((alto_m / 2 * k + pad) * S), W * S, H * S), fill=255)
    im.paste(capa, (0, 0), Image.fromarray(np.minimum(np.asarray(capa.getchannel('A')), np.asarray(corte))))
    return recorte_alfa(im.resize((W, H), Image.LANCZOS))


def recorte_alfa(im):
    a = np.asarray(im.getchannel('A'))
    ys, xs = np.nonzero(a > 0)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


# ---------------------------------------------------------------- catálogo
def catalogo():
    """{(tipo, versión): sticker RGBA} con las marcas en sus versiones, y Ford / Chevrolet de encima."""
    cat = {}
    for tipo, versiones in VERSIONES.items():
        for v, mapa in enumerate(versiones):
            cat[(tipo, v)] = sacar(tipo, mapa)
    for i, (v, ancho) in enumerate(FORD):
        cat[('ford', i)] = ford(v, ancho)
    for i, (v, ancho) in enumerate(CHEVROLET):
        cat[('chevrolet', i)] = chevrolet(v, ancho)
    for i, ancho in enumerate(ROOSTER_R):
        im, alfa, fondo_r = LR.sticker_r()
        cat[('rooster_r', i)] = recorte_alfa(LR.armar(im, alfa, fondo_r, ancho)[0])
    return cat


def girar(im, giro):
    return im.rotate(giro, resample=Image.BICUBIC, expand=True, fillcolor=BLANCO + (0,)) if giro else im


# ---------------------------------------------------------------- armar
def armar(cat, nombre, puestos):
    """El fondo (de abajo hacia arriba) y quién se ve en cada píxel."""
    W, H = LIENZOS[nombre]
    L = np.full((H, W, 3), 255, np.float32)       # si algo quedara sin tapar, se ve como borde blanco
    quien = np.full((H, W), -1, np.int16)
    for i, p in enumerate(puestos):
        im = girar(cat[(p['tipo'], p['v'])], p['giro'])
        A.pegar(L, im, p['x'], p['y'], A.con_sombra(im))
        al = np.asarray(im.getchannel('A')) >= 128
        X0, Y0 = max(0, p['x']), max(0, p['y'])
        X1, Y1 = min(W, p['x'] + im.width), min(H, p['y'] + im.height)
        if X1 > X0 and Y1 > Y0:
            quien[Y0:Y1, X0:X1][al[Y0 - p['y']:Y1 - p['y'], X0 - p['x']:X1 - p['x']]] = i
    return np.clip(L, 0, 255).round().astype(np.uint8), quien


def mascaras(img, quien, puestos):
    """Formas que se prenden en Práctica: verde = las R, Ford, Chevrolet, AEM y JEGS de encima; rojo = las R, Ford,
    Chevrolet y lo rojo. De Ford y Chevrolet se prende lo claro y lo rojo (las letras, el borde, el moño); de la R solo
    el logo (sin su borde blanco), como en Gallos."""
    luz = img.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32) >= 150
    hsv = np.asarray(Image.fromarray(img).convert('HSV')).astype(int)
    rojo = (hsv[..., 1] >= 115) & (hsv[..., 2] >= 89) & ((hsv[..., 0] <= 13) | (hsv[..., 0] >= 241))
    marcas = [i for i, p in enumerate(puestos) if p['tipo'] in ('ford', 'chevrolet')]
    erres = [i for i, p in enumerate(puestos) if p['tipo'] == 'rooster_r']   # de la R solo el logo, como en Gallos
    extra = [i for i, p in enumerate(puestos) if p.get('encima') and p['tipo'] in VERDE_EXTRA]
    verde = (np.isin(quien, marcas) & (luz | rojo)) | (np.isin(quien, erres) & rojo) | (np.isin(quien, extra) & luz)
    roja = (np.isin(quien, marcas) & (luz | rojo)) | rojo
    return verde, roja


def chica(m, tam):
    return Image.fromarray((m * 255).astype(np.uint8)).resize(tam, Image.LANCZOS).point(lambda v: 255 if v >= 128 else 0)


def main():
    receta = json.loads(RECETA.read_text(encoding='utf-8'))
    cat = catalogo()
    salidas = {
        'vertical': (AQUI / 'fondo_marcas_rooster.png', AQUI / 'brillo', (540, round(A.ALTO * 540 / A.ANCHO))),
        'acostado': (AQUI / 'acostados' / 'fondo_marcas_rooster.png', AQUI / 'brillo' / 'acostados', A.CHICO),
    }
    for nombre, (ruta, carpeta, tam) in salidas.items():
        puestos = receta[nombre]
        img, quien = armar(cat, nombre, puestos)
        Image.fromarray(img).save(ruta, optimize=True)
        verde, roja = mascaras(img, quien, puestos)
        for color, m in (('verde', verde), ('rojo', roja)):
            chica(m, tam).save(carpeta / f'rooster-{color}.png', optimize=True)
        n = {t: sum(1 for p in puestos if p['tipo'] == t) for t in MARCAS_DIBUJADAS}
        print(f'{nombre:9} {img.shape[1]}×{img.shape[0]}: {len(puestos)} stickers ({n["rooster_r"]} R de Rooster, {n["ford"]} Ford, '
              f'{n["chevrolet"]} Chevrolet); '
              f'sin tapar {np.mean(quien < 0) * 100:.2f} %; se prenden verde {verde.mean() * 100:.1f} %, rojo {roja.mean() * 100:.1f} %')


# ---------------------------------------------------------------- buscar el acomodo (scipy)
K = 4        # la búsqueda va a 1/4 de resolución
E = 30       # celdas que se pueden salir los de abajo por cada orilla


def minpool(m):
    h, w = m.shape
    p = np.zeros((-(-h // K) * K, -(-w // K) * K), bool); p[:h, :w] = m
    return p.reshape(p.shape[0] // K, K, p.shape[1] // K, K).all(axis=(1, 3))


def maxpool(m):
    h, w = m.shape
    p = np.zeros((-(-h // K) * K, -(-w // K) * K), bool); p[:h, :w] = m
    return p.reshape(p.shape[0] // K, K, p.shape[1] // K, K).any(axis=(1, 3))


def buscar(cat, nombre, rng):
    from scipy.ndimage import gaussian_filter
    from scipy.signal import fftconvolve
    W, H = LIENZOS[nombre]
    Wc, Hc = -(-W // K), -(-H // K)
    variantes = {}

    def var(clave, giro):
        if (clave, giro) not in variantes:
            im = girar(cat[clave], giro)
            al = np.asarray(im.getchannel('A'))
            variantes[(clave, giro)] = (minpool(al >= 250), maxpool(al > 20))
        return variantes[(clave, giro)]

    puestos = []
    centros = {}   # tipo → [(cx, cy, v)] en px

    def poner(clave, giro, px, py, encima, ox=0, oy=0):
        O, F = var(clave, giro)
        im_w, im_h = girar(cat[clave], giro).size
        x, y = (px - ox) * K, (py - oy) * K
        puestos.append(dict(tipo=clave[0], v=clave[1], giro=giro, x=int(x), y=int(y), **({'encima': True} if encima else {})))
        centros.setdefault(clave[0], []).append((x + im_w / 2, y + im_h / 2, clave[1]))

    # 1) encima: las R, Ford, Chevrolet y una de cada marca, completos, sin tocarse y repartidos
    ocupado = np.zeros((Hc, Wc), bool)
    columna = np.zeros((Hc, Wc), np.float32)   # detrás del árbol de Práctica no se ven: las R, Ford y Chevrolet a los lados
    if nombre == 'vertical':
        columna[:, round(470 / K):round(820 / K)] = 1
    else:
        columna[:, round(1080 / K):round(1620 / K)] = 1
    heroes = [(t, i) for i in range(3) for t in MARCAS_DIBUJADAS]
    marcas = sorted((t for t in VERSIONES if t not in SOLO_ABAJO), key=lambda t: -int(np.asarray(cat[(t, 0)].getchannel('A')).sum()))
    heroes += [(t, 0) for t in marcas]
    del_tipo = {}   # dónde quedó cada R, Ford y Chevrolet: los iguales se reparten lejos entre sí
    for clave in heroes:
        lleno = np.pad(ocupado, 40, constant_values=True).astype(np.float32)
        campo = gaussian_filter(lleno, 28)[40:-40, 40:-40]
        if clave[0] in MARCAS_DIBUJADAS:
            campo = campo + 0.6 * columna
            if clave[0] in del_tipo:
                igual = gaussian_filter(del_tipo[clave[0]].astype(np.float32), 70)
                campo = campo + 0.8 * igual / igual.max()
        mejor = None
        for giro in [-12, -8, -4, 0, 4, 8, 12]:
            O, F = var(clave, giro)
            Fd = np.pad(F, 2)   # 2 celdas (8 px) de aire alrededor: entre ellos se asoman los de abajo
            choca = fftconvolve(ocupado.astype(np.float32), Fd[::-1, ::-1].astype(np.float32), mode='valid')
            gente = fftconvolve(campo, Fd[::-1, ::-1].astype(np.float32), mode='valid') / Fd.sum()
            gente = gente + rng.uniform(0, 0.03, gente.shape)
            gente[choca > 0.5] = np.inf
            j = np.unravel_index(np.argmin(gente), gente.shape)
            if np.isfinite(gente[j]) and (mejor is None or gente[j] < mejor[0]):
                mejor = (gente[j], giro, j[1], j[0])
        if mejor is None:
            raise SystemExit(f'{nombre}: no cupo {clave} encima sin tocar a los demás')
        _, giro, px, py = mejor
        Fd = np.pad(var(clave, giro)[1], 2)
        ocupado[py:py + Fd.shape[0], px:px + Fd.shape[1]] |= Fd
        if clave[0] in MARCAS_DIBUJADAS:
            m = del_tipo.setdefault(clave[0], np.zeros((Hc, Wc), bool))
            m[py:py + Fd.shape[0], px:px + Fd.shape[1]] |= Fd
        poner(clave, giro, px + 2, py + 2, True)

    # 2) abajo: tapar lo que falta, cada uno debajo de todo lo anterior
    tapado = np.zeros((Hc + 2 * E, Wc + 2 * E), bool)
    for p in puestos:
        O, F = var((p['tipo'], p['v']), p['giro'])
        px, py = p['x'] // K + E, p['y'] // K + E
        tapado[py:py + O.shape[0], px:px + O.shape[1]] |= O
    dentro = np.zeros_like(tapado); dentro[E:E + Hc, E:E + Wc] = True
    opciones = [((t, v), g) for t in VERSIONES for v in range(len(VERSIONES[t]))
                for g in [-24, -16, -8, 0, 8, 16, 24] + ([-96, -84, 84, 96] if t in LARGOS else [])]
    abajo, parados, minimo = 0, 0, 12
    usos = {}                     # cuántas veces va cada marca: se reparte parejo (si no, ganan las cajas grandes)
    for p in puestos:
        usos[p['tipo']] = usos.get(p['tipo'], 0) + 1
    while (dentro & ~tapado).any() and abajo < 320:
        U = (dentro & ~tapado).astype(np.float32)
        falta = U.sum()
        if minimo > 1:
            muestra = [opciones[i] for i in rng.choice(len(opciones), min(len(opciones), 90), replace=False)]
        else:
            muestra = opciones     # al final, huequitos sueltos: se prueban todos
        cands = []
        for clave, giro in muestra:
            if abs(giro) > 45 and parados >= 6:
                continue
            O, F = var(clave, giro)
            G = fftconvolve(U, O[::-1, ::-1].astype(np.float32), mode='valid')
            # lejos de otro igual: 420 px si es la misma versión, 220 si es la otra
            im_w, im_h = girar(cat[clave], giro).size
            cx = (np.arange(G.shape[1]) - E) * K + im_w / 2
            cy = (np.arange(G.shape[0]) - E) * K + im_h / 2
            for (x, y, v) in centros.get(clave[0], []):
                lim = 420 if v == clave[1] else 220
                G[np.hypot(cx[None, :] - x, cy[:, None] - y) < lim] = 0
            j = np.unravel_index(np.argmax(G), G.shape)
            if G[j] >= min(minimo, falta):
                cands.append((G[j] / (1 + usos.get(clave[0], 0)), clave, giro, j[1], j[0]))
        if not cands:
            if minimo > 1:
                minimo = 1
                continue
            break
        cands.sort(key=lambda c: -c[0])
        top = [c for c in cands if c[0] >= 0.75 * cands[0][0]]
        peso = np.array([c[0] for c in top]) ** 2
        g, clave, giro, px, py = top[rng.choice(len(top), p=peso / peso.sum())]
        O, F = var(clave, giro)
        tapado[py:py + O.shape[0], px:px + O.shape[1]] |= O
        poner(clave, giro, px, py, False, E, E)
        usos[clave[0]] = usos.get(clave[0], 0) + 1
        abajo += 1
        parados += abs(giro) > 45
    falta = int((dentro & ~tapado).sum())
    print(f'{nombre}: {len(heroes)} encima, {abajo} abajo; sin tapar (a 1/4) {falta} celdas')
    # de abajo hacia arriba: el último que se puso abajo es el de más abajo; los de encima al final
    return puestos[len(heroes):][::-1] + puestos[:len(heroes)][::-1]


def buscar_todo(semilla):
    rng = np.random.default_rng(semilla)
    cat = catalogo()
    receta = {nombre: buscar(cat, nombre, rng) for nombre in LIENZOS}
    CARPETA.mkdir(exist_ok=True)
    RECETA.write_text(json.dumps(receta, ensure_ascii=False, indent=0), encoding='utf-8')
    print('receta en', RECETA)


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'buscar':
        buscar_todo(int(sys.argv[2]) if len(sys.argv) > 2 else 0)
    else:
        main()
