"""Formas de los logos que se encienden en Práctica para los fondos de un solo color.

En Combinado, Combinado rojo y Botella NOS los stickers ya son verdes y rojos, y build.py los recorta
solo. En Neón, Blanco y negro y Rojo (que no tiene verde) se eligieron a mano logos de marcas para
cada color, para que se prendan logos sueltos y no todo el fondo (pedido de Daniel, 23 oct 2026).

Cómo funciona: se separa cada sticker por la sombra gris que deja sobre el de abajo (blancos) o por su
contorno negro (Neón), se juntan las letras de un mismo logo, y se toman los logos de la lista LOGOS
(cada uno por un punto dentro de él, en una imagen de 540 px de ancho).
Uso:  python3 hacer_mascaras.py   (deja <fondo>_verde.png y <fondo>_rojo.png aquí; build.py los usa)
Para cambiar qué marcas se prenden, edita LOGOS y vuelve a correrlo.
"""
import pathlib
import numpy as np
from PIL import Image

AQUI = pathlib.Path(__file__).resolve().parent
FONDOS = AQUI.parent
ANCHO = 540

LOGOS = {
    'neon': {
        'verde': [
            ('MSD', 422, 259),
            ('AEM', 369, 489),
            ('JEGS', 428, 756),
            ('COMP CAMS', 357, 18),
            ('TRICK FLOW', 115, 383),
            ('NITROUS', 101, 1005),
            ('ARP', 20, 1072),
            ('FLOWMASTER', 404, 563),
        ],
        'rojo': [
            ('NOS', 365, 380),
            ('SUMMIT', 419, 659),
            ('STRANGE', 400, 95),
            ('VORTECH', 343, 849),
            ('WILWOOD', 86, 605),
            ('AUTO METER', 193, 66),
            ('PSSSHH', 72, 29),
            ('MSD (círculo)', 514, 1029),
        ],
    },
    'blanco_negro': {
        'verde': [
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
        'rojo': [
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
    },
    'rojo': {
        'verde': [
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


def main():
    for fid, por_color in LOGOS.items():
        im = Image.open(FONDOS / f'fondo_marcas_{fid}.png').convert('RGB')
        im = im.resize((ANCHO, round(im.height * ANCHO / im.width)), Image.LANCZOS)
        m, palabras = cuerpos(fid, im)
        etq, G, bb, area = grupos(m, palabras=palabras)
        de_comp = {c: r for r, comps in G.items() for c in comps}
        for color, logos in por_color.items():
            sale = np.zeros(etq.shape, bool)
            for nombre, x, y in logos:
                c = int(etq[y, x])
                if c not in de_comp:
                    raise SystemExit(f'{fid} {color}: no encontré el logo {nombre} en ({x}, {y})')
                sale |= np.isin(etq, G[de_comp[c]])
            Image.fromarray((sale * 255).astype(np.uint8)).save(AQUI / f'{fid}_{color}.png', optimize=True)
            print(f'{fid:12} {color:5} {len(logos):2} logos, cubren {sale.mean() * 100:4.1f} % de la pantalla')


if __name__ == '__main__':
    main()
