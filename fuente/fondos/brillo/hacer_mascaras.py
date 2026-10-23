"""Formas de los logos que se encienden en Práctica para los fondos de un solo color.

En Combinado, Combinado rojo y Botella NOS los stickers ya son verdes y rojos (se recortan solos). En
Neón, Blanco y negro y Rojo (que no tiene verde) se eligieron a mano logos de marcas para cada color,
para que se prendan logos sueltos y no todo el fondo. Además, en los 6 fondos se agregaron 3 logos
chicos y 2 grandes por color (pedidos de Daniel, 23 oct 2026).

Cómo funciona: se separa cada sticker por la sombra gris que deja sobre el de abajo (blancos) o por su
contorno negro (Neón; ahí también se usan cajas negras), se juntan las letras de un mismo logo, y se
toman los logos de la lista LOGOS (cada uno por un punto dentro de él, en una imagen de 540 px de ancho).
Uso:  python3 hacer_mascaras.py   (deja <fondo>-verde.png y <fondo>-rojo.png aquí; build.py los usa)
Para cambiar qué marcas se prenden, edita LOGOS y vuelve a correrlo.
"""
import pathlib
import numpy as np
from PIL import Image

AQUI = pathlib.Path(__file__).resolve().parent
FONDOS = AQUI.parent
ANCHO = 540

# Fondos con stickers de color: la base de ese color se recorta sola (como en build.py).
COLOR_PROPIO = {'combinado': ('verde', 'rojo'), 'combinado_rojo': ('verde', 'rojo'), 'botella_nos': ('verde', 'rojo'), 'rojo': ('rojo',)}

# Logos elegidos a mano: (marca, x, y) con un punto dentro del logo en la imagen de 540 px de ancho.
# "base": fondos de un solo color (Neón, Blanco y negro y el verde de Rojo).
# "extra": 3 logos chicos + 2 grandes más por color en los 6 fondos (pedido de Daniel).
LOGOS = {
    'combinado': {
        'verde': {
            'base': [
            ],
            'extra': [
                ('AEM', 392, 209),   # 1.26 % de la pantalla
                ('NITROUS', 106, 638),   # 1.09 % de la pantalla
                ('NHRA', 77, 188),   # 0.71 % de la pantalla
                ('AUTO METER', 351, 919),   # 0.54 % de la pantalla
                ('ARP', 282, 1061),   # 0.65 % de la pantalla
            ],
        },
        'rojo': {
            'base': [
            ],
            'extra': [
                ('GARRETT', 419, 55),   # 1.45 % de la pantalla
                ('NITROUS OUTLET', 124, 916),   # 0.95 % de la pantalla
                ('RED LIGHT', 304, 407),   # 0.25 % de la pantalla
                ('HURST', 448, 1125),   # 0.58 % de la pantalla
                ('COMP CAMS', 167, 275),   # 0.51 % de la pantalla
            ],
        },
    },
    'combinado_rojo': {
        'verde': {
            'base': [
            ],
            'extra': [
                ('AEM', 398, 750),   # 1.26 % de la pantalla
                ('COMP CAMS', 361, 485),   # 0.84 % de la pantalla
                ('FUELTECH', 27, 141),   # 0.52 % de la pantalla
                ('INTERCOOLER', 92, 844),   # 0.2 % de la pantalla
                ('MAGNAFLOW', 510, 647),   # 0.24 % de la pantalla
            ],
        },
        'rojo': {
            'base': [
            ],
            'extra': [
                ('MSD', 218, 414),   # 0.81 % de la pantalla
                ('MALLORY', 143, 1139),   # 0.87 % de la pantalla
                ('SUMMIT RACING', 192, 627),   # 0.43 % de la pantalla
                ('PEDAL', 428, 226),   # 0.21 % de la pantalla
                ('GARRETT', 68, 1101),   # 0.6 % de la pantalla
            ],
        },
    },
    'botella_nos': {
        'verde': {
            'base': [
            ],
            'extra': [
                ('1/4 MILE', 358, 312),   # 1.38 % de la pantalla
                ('MALLORY', 143, 1139),   # 0.87 % de la pantalla
                ('FUELTECH', 27, 141),   # 0.52 % de la pantalla
                ('AEM', 434, 755),   # 0.72 % de la pantalla
                ('PRECISION', 247, 943),   # 0.52 % de la pantalla
            ],
        },
        'rojo': {
            'base': [
            ],
            'extra': [
                ('BOTELLA NOS', 344, 552),   # 2.56 % de la pantalla
                ('2-STEP', 133, 236),   # 0.81 % de la pantalla
                ('PEDAL', 428, 226),   # 0.21 % de la pantalla
                ('INTERCOOLER', 92, 844),   # 0.2 % de la pantalla
                ('MAGNAFLOW', 510, 647),   # 0.24 % de la pantalla
            ],
        },
    },
    'rojo': {
        'verde': {
            'base': [
                ('JEGS', 120, 181),
                ('WHIPPLE', 156, 120),
                ('BOOST', 457, 320),
                ('AUTO METER', 48, 295),
                ('FUELTECH', 451, 399),
                ('AEM', 271, 530),
                ('NHRA', 42, 511),
                ('MSD', 217, 650),
                ('STRANGE', 133, 743),
                ('STRANGE', 154, 733),
                ('NITROUS OUTLET', 377, 866),
                ('NITROUS OUTLET', 419, 838),
                ('HOOSIER', 426, 998),
                ('TRICK FLOW', 468, 769),
            ],
            'extra': [
                ('NITROUS', 106, 878),   # 1.04 % de la pantalla
                ('AEROMOTIVE', 391, 256),   # 0.82 % de la pantalla
                ('ARP', 314, 57),   # 0.59 % de la pantalla
                ('SUMMIT RACING', 162, 468),   # 0.55 % de la pantalla
                ('BBK', 159, 1137),   # 0.17 % de la pantalla
            ],
        },
        'rojo': {
            'base': [
            ],
            'extra': [
                ('HURST HOLLEY', 145, 1032),   # 1.56 % de la pantalla
                ('FLOWMASTER', 451, 77),   # 1.1 % de la pantalla
                ('RED LIGHT', 74, 695),   # 0.51 % de la pantalla
                ('COMP CAMS', 302, 464),   # 0.36 % de la pantalla
                ('WELD', 246, 1121),   # 0.51 % de la pantalla
            ],
        },
    },
    'blanco_negro': {
        'verde': {
            'base': [
                ('JEGS', 386, 158),
                ('2-STEP', 218, 299),
                ('AEM', 273, 392),
                ('BOOM', 58, 460),
                ('NITROUS', 214, 489),
                ('MSD', 329, 596),
                ('STRANGE', 110, 698),
                ('STRANGE', 124, 674),
                ('NHRA', 229, 926),
                ('EDELBROCK', 347, 1010),
                ('HOOSIER', 44, 1107),
                ('ARP', 141, 1097),
            ],
            'extra': [
                ('HOLLEY', 90, 109),   # 0.83 % de la pantalla
                ('FLOWMASTER 1/4 MILE', 431, 737),   # 1.02 % de la pantalla
                ('RACEPAK', 312, 243),   # 0.57 % de la pantalla
                ('COMP CAMS', 209, 547),   # 0.5 % de la pantalla
                ('MSD (círculo)', 500, 946),   # 0.53 % de la pantalla
            ],
        },
        'rojo': {
            'base': [
                ('ARRANCONES', 401, 32),
                ('HOOKER', 513, 275),
                ('FUELTECH', 96, 396),
                ('NOS', 374, 503),
                ('HOLLEY', 257, 715),
                ('PRECISION', 518, 718),
                ('SUMMIT', 163, 839),
                ('NITROUS OUTLET', 347, 828),
                ('NITROUS OUTLET', 365, 865),
                ('RED LIGHT', 471, 1012),
                ('MOROSO', 305, 1088),
                ('PSSSHH', 479, 1068),
            ],
            'extra': [
                ('TRICK FLOW WEIAND', 35, 719),   # 1.32 % de la pantalla
                ('WHIPPLE', 144, 261),   # 0.77 % de la pantalla
                ('WELD', 491, 459),   # 0.47 % de la pantalla
                ('NOS (cápsula)', 136, 610),   # 0.52 % de la pantalla
                ('CALAVERA', 367, 940),   # 0.29 % de la pantalla
            ],
        },
    },
    'neon': {
        'verde': {
            'base': [
                ('MSD', 422, 259),
                ('AEM', 369, 489),
                ('JEGS', 428, 756),
                ('COMP CAMS', 357, 18),
                ('TRICK FLOW', 115, 383),
                ('NITROUS', 101, 1005),
                ('ARP', 20, 1072),
                ('FLOWMASTER', 404, 563),
            ],
            'extra': [
                ('CALVERT', 404, 158),   # 0.51 % de la pantalla
                ('SIMPSON', 378, 1145),   # 0.52 % de la pantalla
                ('FAST', 121, 851),   # 0.24 % de la pantalla
                ('NITROUS EXPRESS', 369, 1077),   # 0.39 % de la pantalla
                ('VP', 223, 345),   # 0.16 % de la pantalla
            ],
        },
        'rojo': {
            'base': [
                ('NOS', 365, 380),
                ('SUMMIT', 419, 659),
                ('STRANGE', 400, 95),
                ('VORTECH', 343, 849),
                ('WILWOOD', 86, 605),
                ('AUTO METER', 193, 66),
                ('PSSSHH', 72, 29),
                ('MSD (círculo)', 514, 1029),
            ],
            'extra': [
                ('JEGS (caja)', 125, 559),   # 0.54 % de la pantalla
                ('TCI', 484, 907),   # 0.46 % de la pantalla
                ('MICKEY THOMPSON', 377, 897),   # 0.38 % de la pantalla
                ('INTERCOOLER', 500, 413),   # 0.17 % de la pantalla
                ('TUNERS', 195, 1151),   # 0.33 % de la pantalla
            ],
        },
    },
}

# ---------------------------------------------------------------- componentes conexos (solo numpy)
def etiquetar(m):
    """m: arreglo bool (alto, ancho). Devuelve (etiquetas int32, n). Conectividad 4."""
    H, W = m.shape
    padre = [0]
    def raiz(a):
        while padre[a] != a:
            padre[a] = padre[padre[a]]; a = padre[a]
        return a
    tramos_prev = []  # (x0, x1, etiqueta) del renglón anterior
    etq = np.zeros((H, W), np.int32)
    tramos_todos = []
    for y in range(H):
        fila = m[y]
        d = np.diff(np.concatenate(([0], fila.view(np.int8), [0])))
        ini = np.flatnonzero(d == 1); fin = np.flatnonzero(d == -1)
        actuales = []
        j = 0
        for x0, x1 in zip(ini, fin):
            lab = 0
            # tramos del renglón anterior que se traslapan [x0, x1)
            while j < len(tramos_prev) and tramos_prev[j][1] <= x0:
                j += 1
            k = j
            while k < len(tramos_prev) and tramos_prev[k][0] < x1:
                l2 = raiz(tramos_prev[k][2])
                if lab == 0: lab = l2
                elif l2 != lab:
                    a, b = sorted((lab, l2)); padre[b] = a; lab = a
                k += 1
            if lab == 0:
                lab = len(padre); padre.append(lab)
            actuales.append((x0, x1, lab))
            tramos_todos.append((y, x0, x1, lab))
        tramos_prev = actuales
    # compactar etiquetas
    mapa = {}
    for (y, x0, x1, lab) in tramos_todos:
        r = raiz(lab)
        if r not in mapa: mapa[r] = len(mapa) + 1
        etq[y, x0:x1] = mapa[r]
    return etq, len(mapa)

def erosionar(m, k):
    m = m.copy()
    for _ in range(k):
        e = m.copy()
        e[1:, :] &= m[:-1, :]; e[:-1, :] &= m[1:, :]; e[:, 1:] &= m[:, :-1]; e[:, :-1] &= m[:, 1:]
        e[0, :] = e[-1, :] = False; e[:, 0] = e[:, -1] = False
        m = e
    return m

def crecer(etq, dentro, k):
    """Extiende cada etiqueta k pasos dentro de la máscara 'dentro' (sin pisar otras)."""
    etq = etq.copy()
    for _ in range(k):
        nuevo = etq.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            vec = np.roll(etq, (dy, dx), axis=(0, 1))
            libre = (nuevo == 0) & dentro & (vec > 0)
            nuevo[libre] = vec[libre]
        etq = nuevo
    return etq

# ---------------------------------------------------------------- stickers y logos
def grupos(m, amin_frac=0.0001, tol=2, palabras=False):
    etq, n = etiquetar(m)
    H, W = m.shape
    area = np.bincount(etq.ravel(), minlength=n + 1)
    ys, xs = np.nonzero(etq)
    l = etq[ys, xs]
    x0 = np.full(n + 1, W); x1 = np.zeros(n + 1, int); y0 = np.full(n + 1, H); y1 = np.zeros(n + 1, int)
    np.minimum.at(x0, l, xs); np.maximum.at(x1, l, xs); np.minimum.at(y0, l, ys); np.maximum.at(y1, l, ys)
    # fuera: pedacitos y manchas gigantes (en Neón, las orillas de todos los stickers forman una sola)
    ids = [i for i in range(1, n + 1) if amin_frac * m.size <= area[i] <= 0.05 * m.size]
    bba = {i: (x1[i] - x0[i] + 1) * (y1[i] - y0[i] + 1) for i in ids}
    # solo puede contener a otros un sticker "lleno" y no enorme (evita redes de orillas que junten vecinos)
    puede = {i: area[i] >= 0.12 * bba[i] and bba[i] <= 0.06 * m.size for i in ids}
    orden = sorted(ids, key=lambda i: -bba[i])
    padre = {}
    for idx, i in enumerate(orden):
        mejor = None
        for j in orden[:idx]:          # solo los de caja más grande
            if not puede[j]: continue
            if x0[j] - tol <= x0[i] and x1[i] <= x1[j] + tol and y0[j] - tol <= y0[i] and y1[i] <= y1[j] + tol:
                if mejor is None or bba[j] < bba[mejor]: mejor = j
        padre[i] = mejor
    def raiz(i):
        while padre.get(i): i = padre[i]
        return i
    G = {}
    for i in ids:
        G.setdefault(raiz(i), []).append(i)
    if palabras:
        G = juntar_palabras(G, (x0, x1, y0, y1), m.size)
    return etq, G, (x0, x1, y0, y1), area

def juntar_palabras(G, bb, N):
    """Junta grupos que parecen letras de una misma palabra: mismo renglón, alturas parecidas, pegados."""
    x0, x1, y0, y1 = bb
    caja = {r: [min(x0[i] for i in G[r]), max(x1[i] for i in G[r]), min(y0[i] for i in G[r]), max(y1[i] for i in G[r])] for r in G}
    raices = list(G)
    padre = {r: r for r in raices}
    def ra(r):
        while padre[r] != r: padre[r] = padre[padre[r]]; r = padre[r]
        return r
    cambio = True
    while cambio:
        cambio = False
        for a in raices:
            for b in raices:
                A, B = ra(a), ra(b)
                if A >= B: continue
                ca, cb = caja[A], caja[B]
                ha, hb = ca[3] - ca[2] + 1, cb[3] - cb[2] + 1
                if not (0.6 <= ha / hb <= 1.6): continue
                trasl = min(ca[3], cb[3]) - max(ca[2], cb[2]) + 1
                if trasl < 0.6 * min(ha, hb): continue
                hueco = max(ca[0], cb[0]) - min(ca[1], cb[1])
                if hueco > 0.35 * (ha + hb) / 2: continue
                nueva = [min(ca[0], cb[0]), max(ca[1], cb[1]), min(ca[2], cb[2]), max(ca[3], cb[3])]
                if (nueva[1] - nueva[0] + 1) * (nueva[3] - nueva[2] + 1) > 0.06 * N: continue
                padre[B] = A; caja[A] = nueva; cambio = True
    G2 = {}
    for r in raices:
        G2.setdefault(ra(r), []).extend(G[r])
    return G2


def cuerpos(fid, im):
    """Píxeles que se encienden: el blanco puro de los stickers (o el neón, en Neón)."""
    a = np.asarray(im).astype(int)
    hsv = np.asarray(im.convert('HSV')).astype(int)
    if fid == 'neon':
        return (hsv[..., 1] >= 150) & (hsv[..., 0] >= 39) & (hsv[..., 0] <= 70) & (hsv[..., 2] >= 200), True
    v = a.max(axis=2)
    return (v >= 250) & (v - a.min(axis=2) <= 25), False


def color_propio(im, color):
    """Stickers que ya son de ese color (mismos umbrales que build.py)."""
    hsv = np.asarray(im.convert('HSV')).astype(int)
    h, s_, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    c = (s_ >= 115) & (v >= 89)
    return c & (h >= 39) & (h <= 120) if color == 'verde' else c & ((h <= 13) | (h >= 241))


def cajas_negras(im):
    """Relleno de las cajas negras (en Neón sus letras neón no se separan; la caja sí)."""
    v = np.asarray(im.convert('HSV'))[..., 2].astype(int)
    tinta = v < 70
    et, _ = etiquetar(erosionar(tinta, 2))
    return crecer(et, tinta, 2)


def main():
    for fid, por_color in LOGOS.items():
        im = Image.open(FONDOS / f'fondo_marcas_{fid}.png').convert('RGB')
        im = im.resize((ANCHO, round(im.height * ANCHO / im.width)), Image.LANCZOS)
        m, palabras = cuerpos(fid, im)
        etq, G, bb, area = grupos(m, palabras=palabras)
        de_comp = {c: r for r, comps in G.items() for c in comps}
        cajas = cajas_negras(im) if fid == 'neon' else None
        for color, listas in por_color.items():
            sale = color_propio(im, color) if color in COLOR_PROPIO.get(fid, ()) else np.zeros(etq.shape, bool)
            n = 0
            for nombre, x, y in listas['base'] + listas['extra']:
                c = int(etq[y, x])
                if c in de_comp:
                    sale |= np.isin(etq, G[de_comp[c]])
                elif cajas is not None and cajas[y, x] > 0:
                    sale |= cajas == cajas[y, x]
                else:
                    raise SystemExit(f'{fid} {color}: no encontré el logo {nombre} en ({x}, {y})')
                n += 1
            Image.fromarray((sale * 255).astype(np.uint8)).save(AQUI / f'{fid}-{color}.png', optimize=True)
            print(f'{fid:15} {color:5} {n:2} logos elegidos, cubren {sale.mean() * 100:4.1f} % de la pantalla')


if __name__ == '__main__':
    main()
