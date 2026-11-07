"""Fondos para el teléfono acostado (7 nov 2026, Daniel: "rehacer los fondos de pantalla … para cuando se acueste el
celular, se vea con el mismo zoom con el que se ve un fondo cuando está el teléfono en vertical").

Con el teléfono acostado, el fondo vertical (1290×2796) tiene que cubrir una pantalla ancha y se agranda ~2.2 veces.
Aquí se arma uno acostado de 2700×1290 con los mismos stickers y del mismo tamaño (al cubrir la pantalla quedan ~4 %
más grandes que en vertical, no se nota; con 2796 de ancho saldrían idénticos, pero la unión necesitaba el doble de
stickers repetidos):
  - a la izquierda van las primeras 1290 filas del vertical y a la derecha las últimas 1290 (las 216 de en medio no
    se ven: de ahí salen stickers para la unión que no se repiten);
  - entre las dos queda un hueco de 120 px que se tapa con stickers completos del mismo fondo (los de hasta arriba,
    con todo su borde), encimados con su sombra como un sticker bomb de verdad. Las copias van casi siempre en su otra
    versión (cambio(): la misma marca en blanco o en negro, en rojo o en verde…), así no se ve que se repiten.
    RECETA dice cuáles, dónde, con qué giro y en qué versión; no se inventa ningún sticker;
  - Botella NOS = Combinado rojo acostado + la botella (sale de comparar los dos verticales), en medio;
  - Gallos = Blanco y negro acostado + los logos de Rooster Racing (logos_rooster.py) en LUGAR_ACOSTADO.
Escribe acostados/fondo_marcas_<id>.png y brillo/acostados/<id>-<color>.png (las formas que se prenden en Práctica,
con la misma receta; las copias en su otra versión no se prenden); build.py los pasa a WebP (fondos/<id>_h.webp y
fondos/<id>_h_brillo_<color>.webp) y la app los usa con la pantalla de lado (style.css, @media (orientation: landscape)).
Uso: python3 acostados.py              (solo numpy y PIL; ~20 s). Corre antes logos_rooster.py y brillo/hacer_mascaras.py
si cambiaron (usa sus resultados: las formas verticales de Práctica).
Para rehacer la unión de un fondo (otro acomodo, o un fondo nuevo): python3 acostados_buscar.py <id> (necesita scipy)
y copia aquí la receta que imprime.
"""
import pathlib
import sys
import numpy as np
from PIL import Image, ImageChops, ImageFilter

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI / 'brillo'))
from hacer_mascaras import etiquetar   # componentes conexos (solo numpy)

ANCHO, ALTO = 1290, 2796               # el vertical
HUECO = 120                            # lo que falta de ancho entre las dos mitades
AH, AV = 2 * ANCHO + HUECO, ANCHO      # el acostado: 2700 × 1290
FILAS_U = ALTO - ANCHO                 # la mitad derecha son las filas 1506–2795 del vertical
FRANJA = (ANCHO - 8, ANCHO + HUECO + 8)  # lo que deben tapar los stickers (el hueco y las dos orillas cortadas)
NEGRO = 95                             # contorno de los stickers: max(R, G, B) < 95
NEON = (210, 255, 0)                   # en Neón el margen de los stickers es neón, sin sombra
CHICO = (round(AH * 540 / ANCHO), 540)  # máscaras de brillo: 1130 × 540 (como las verticales, 540 de ancho)

# Unión de cada fondo: stickers completos del mismo fondo. semilla = un píxel del contorno negro del sticker en el
# vertical; margen = ancho del borde de color alrededor (px); giro en grados; en = esquina del sticker ya girado en el
# acostado; al_reves = en su otra versión. Los hizo acostados_buscar.py (tapan toda la FRANJA; main() lo revisa);
# el 7 nov se escogió a ojo, de 6 semillas por fondo, la que mejor se veía.
RECETA = {
    'blanco_negro': [
        dict(semilla=(665, 1978), margen=12, giro=86, en=(1234, -40), al_reves=True),
        dict(semilla=(1101, 252), margen=14, giro=-11, en=(1162, 340), al_reves=True),
        dict(semilla=(824, 842), margen=12, giro=92, en=(1222, 584), al_reves=True),
        dict(semilla=(608, 1932), margen=13, giro=-15, en=(1034, 864), al_reves=True),
        dict(semilla=(455, 1404), margen=13, giro=20, en=(1154, 1052), al_reves=True),
        dict(semilla=(1040, 1850), margen=12, giro=-11, en=(1174, 1160), al_reves=True),
        dict(semilla=(1128, 2492), margen=13, giro=-3, en=(1166, 844)),
        dict(semilla=(381, 2417), margen=12, giro=-20, en=(1122, 352), al_reves=True),
    ],
    'combinado': [
        dict(semilla=(1229, 591), margen=12, giro=-7, en=(1242, -52), al_reves=True),
        dict(semilla=(1077, 1786), margen=12, giro=92, en=(1258, 152), al_reves=True),
        dict(semilla=(1115, 1275), margen=12, giro=20, en=(1206, 488)),
        dict(semilla=(399, 1418), margen=14, giro=-7, en=(1234, 668), al_reves=True),
        dict(semilla=(1114, 2466), margen=14, giro=-20, en=(1178, 856), al_reves=True),
        dict(semilla=(1100, 359), margen=15, giro=-15, en=(1134, 912), al_reves=True),
        dict(semilla=(462, 888), margen=13, giro=-11, en=(1094, 1128), al_reves=True),
        dict(semilla=(699, 2237), margen=14, giro=0, en=(1146, 44), al_reves=True),
        dict(semilla=(650, 2457), margen=14, giro=0, en=(1122, 984), al_reves=True),
    ],
    'combinado_rojo': [
        dict(semilla=(513, 382), margen=13, giro=-86, en=(1206, -96), al_reves=True),
        dict(semilla=(694, 2515), margen=14, giro=-80, en=(1170, 304), al_reves=True),
        dict(semilla=(822, 1947), margen=15, giro=11, en=(962, 680)),
        dict(semilla=(778, 1274), margen=13, giro=-3, en=(1162, 944), al_reves=True),
        dict(semilla=(335, 894), margen=13, giro=-3, en=(1190, 1060), al_reves=True),
        dict(semilla=(228, 1106), margen=13, giro=-3, en=(1270, 124), al_reves=True),
        dict(semilla=(1148, 1176), margen=14, giro=-14, en=(1222, 720), al_reves=True),
    ],
    'neon': [
        dict(semilla=(83, 2274), margen=14, giro=11, en=(1114, -84), al_reves=True),
        dict(semilla=(636, 1052), margen=13, giro=92, en=(1246, 192), al_reves=True),
        dict(semilla=(857, 1700), margen=13, giro=-7, en=(1134, 556)),
        dict(semilla=(1145, 521), margen=14, giro=-11, en=(1238, 720), al_reves=True),
        dict(semilla=(53, 1390), margen=13, giro=7, en=(1078, 964), al_reves=True),
        dict(semilla=(304, 1989), margen=13, giro=-7, en=(1218, 1088), al_reves=True),
        dict(semilla=(577, 747), margen=15, giro=24, en=(1238, 1116), al_reves=True),
        dict(semilla=(350, 720), margen=14, giro=-24, en=(1370, 524)),
        dict(semilla=(951, 1972), margen=13, giro=-15, en=(1122, 136), al_reves=True),
    ],
    'rojo': [
        dict(semilla=(807, 1888), margen=13, giro=98, en=(1170, -136)),
        dict(semilla=(111, 319), margen=13, giro=20, en=(1106, 224), al_reves=True),
        dict(semilla=(727, 1534), margen=13, giro=-3, en=(1122, 452), al_reves=True),
        dict(semilla=(838, 1165), margen=13, giro=-15, en=(1054, 604), al_reves=True),
        dict(semilla=(909, 1077), margen=12, giro=3, en=(1262, 832), al_reves=True),
        dict(semilla=(1239, 1773), margen=12, giro=3, en=(1122, 1120), al_reves=True),
        dict(semilla=(1070, 2333), margen=15, giro=-15, en=(1098, 1180), al_reves=True),
        dict(semilla=(100, 1149), margen=14, giro=14, en=(1114, 556), al_reves=True),
        dict(semilla=(146, 675), margen=14, giro=24, en=(1358, 184), al_reves=True),
    ],
}

# Gallos acostado: los logos de Rooster Racing a los lados (cx, cy y ancho a 540 px de alto, como LUGAR en
# logos_rooster.py; el acostado mide 1130 × 540 a esa escala). En Práctica el árbol queda en medio (x ≈ 480–650).
LUGAR_ACOSTADO = [
    ('rrg', dict(cx=965, cy=112, ancho=172, giro=-5)),       # arriba a la derecha
    ('r_flamas', dict(cx=150, cy=140, ancho=172, giro=-5)),  # izquierda, arriba
    ('r_flamas', dict(cx=262, cy=405, ancho=200, giro=6)),   # izquierda, abajo
    ('r_flamas', dict(cx=850, cy=420, ancho=172, giro=-8)),  # derecha, abajo
]


def cargar(fid):
    return np.asarray(Image.open(AQUI / f'fondo_marcas_{fid}.png').convert('RGB'))


# ---------------------------------------------------------------- formas (solo numpy)
def rellenar(m):
    """Rellena los huecos de una máscara bool (lo que no se alcanza desde la orilla)."""
    et, _ = etiquetar(~m)
    fuera = np.unique(np.concatenate([et[0], et[-1], et[:, 0], et[:, -1]]))
    return m | ((et > 0) & ~np.isin(et, fuera))


def distancia(m, rmax):
    """Distancia euclidiana exacta de cada píxel a la máscara m, hasta rmax (más lejos: inf)."""
    h, w = m.shape
    R = int(np.ceil(rmax))
    pad = np.zeros((h + 2 * R, w + 2 * R), bool)
    pad[R:R + h, R:R + w] = m
    d2 = np.full((h, w), np.inf, np.float32)
    d2[m] = 0
    hecho = m.copy()
    offs = sorted(((dy * dy + dx * dx, dy, dx) for dy in range(-R, R + 1) for dx in range(-R, R + 1)
                   if 0 < dy * dy + dx * dx <= rmax * rmax))
    for q, dy, dx in offs:
        nuevo = pad[R + dy:R + dy + h, R + dx:R + dx + w] & ~hecho
        if nuevo.any():
            d2[nuevo] = q
            hecho |= nuevo
    return np.sqrt(d2)


def componente_negro(a, cache={}):
    """Etiquetas de lo negro del vertical (se calculan una vez por imagen)."""
    if cache.get('a') is not a:
        cache['a'], cache['et'] = a, etiquetar(a.max(axis=2) < NEGRO)[0]
    return cache['et']


# ---------------------------------------------------------------- stickers
# Colores de los stickers (los más comunes en los fondos). El borde es blanco; en Neón, neón (el "verde").
PALETA = {'blanco': (255, 255, 255), 'negro': (18, 18, 18), 'rojo': (226, 18, 10), 'verde': (210, 254, 2)}
NOMBRES = list(PALETA)
COLORES = np.array([PALETA[n] for n in NOMBRES], np.float32)


def mezclas(P):
    """Cada píxel como mezcla de dos colores de la paleta (las orillas suaves lo son): (i, j, t, error)."""
    err = np.full(len(P), np.inf, np.float32)
    I = np.zeros(len(P), int); J = np.zeros(len(P), int); T = np.zeros(len(P), np.float32)
    for i in range(len(NOMBRES)):
        for j in range(i + 1, len(NOMBRES)):
            dd = COLORES[j] - COLORES[i]
            t = np.clip(((P - COLORES[i]) @ dd) / (dd @ dd), 0, 1)
            e = np.linalg.norm(P - (COLORES[i] + t[:, None] * dd), axis=1)
            m = e < err
            err[m], I[m], J[m], T[m] = e[m], i, j, t[m]
    return I, J, T, err


def cambio(fid, usa):
    """Otra versión de un sticker (para las copias de la unión: en un sticker bomb la misma marca sale en varios colores,
    así una copia no se ve igual que su original). Blanco y negro: negro <-> blanco. Con rojo o verde: rojo <-> verde
    (en Rojo, que no tiene verde: rojo <-> negro). En Neón: neón <-> negro."""
    if fid == 'neon':
        return {'verde': 'negro', 'negro': 'verde'}
    if 'rojo' in usa or 'verde' in usa:
        return {'rojo': 'negro', 'negro': 'rojo'} if fid == 'rojo' else {'rojo': 'verde', 'verde': 'rojo'}
    return {'blanco': 'negro', 'negro': 'blanco'}


def otra_version(a, semilla, margen, fid):
    """¿Se puede hacer la otra versión de este sticker? (que la paleta lo explique: sin azules ni degradados raros)"""
    st, _ = sacar(a, semilla, margen, fid)
    P = np.asarray(st, np.float32)[..., :3][np.asarray(st)[..., 3] == 255]
    I, J, T, err = mezclas(P)
    return bool((err > 50).mean() < 0.02)


def sacar(a, semilla, margen, fid, al_reves=False):
    """Sticker completo del vertical: su contorno negro (el que pasa por la semilla) relleno, más su margen.
    El borde se repinta del color del margen (blanco, o neón en Neón) para que no traiga la sombra de abajo.
    al_reves: la otra versión del sticker (ver cambio()).
    Devuelve (RGBA de PIL, (x, y) de su esquina en el vertical)."""
    neon = fid == 'neon'
    et = componente_negro(a)
    x, y = semilla
    e = et[y, x]
    assert e > 0, f'la semilla {semilla} no cae en un contorno negro'
    ys, xs = np.nonzero(et == e)
    R = margen + 4
    X0, Y0 = max(0, xs.min() - R), max(0, ys.min() - R)
    X1, Y1 = min(a.shape[1], xs.max() + 1 + R), min(a.shape[0], ys.max() + 1 + R)
    nucleo = rellenar(et[Y0:Y1, X0:X1] == e)
    d = distancia(nucleo, margen + 1.5)
    color = np.array(NEON if neon else (255, 255, 255), np.float32)
    rgb = a[Y0:Y1, X0:X1].astype(np.float32)
    if al_reves:
        P = rgb[d == 0]
        I, J, T, err = mezclas(P)
        peso = np.zeros(len(NOMBRES))
        np.add.at(peso, I, 1 - T); np.add.at(peso, J, T)
        sigma = cambio(fid, {NOMBRES[k] for k in range(len(NOMBRES)) if peso[k] > 0.01 * len(P)})
        perm = np.array([NOMBRES.index(sigma.get(n, n)) for n in NOMBRES])
        nuevo = COLORES[perm[I]] * (1 - T[:, None]) + COLORES[perm[J]] * T[:, None]
        rgb[d == 0] = np.where((err <= 50)[:, None], nuevo, P)
        # la orilla suave entre el contorno (negro) y el borde: el contorno ya cambió de color, el borde no
        anillo = (d > 0) & (d <= 2.5)
        neg = COLORES[NOMBRES.index('negro')]
        t = np.clip(((rgb[anillo] - neg) @ (color - neg)) / ((color - neg) @ (color - neg)), 0, 1)[:, None]
        rgb[anillo] = COLORES[perm[NOMBRES.index('negro')]] * (1 - t) + color * t
    rgb[d > max(4, margen - 4)] = color          # el borde, de un solo color (y lo de afuera, para girar sin orilla gris)
    alfa = np.clip(margen + 1.0 - d, 0, 1)
    yy, xx = np.nonzero(alfa > 0)
    y0, y1, x0, x1 = yy.min(), yy.max() + 1, xx.min(), xx.max() + 1
    rgba = np.dstack([rgb[y0:y1, x0:x1], alfa[y0:y1, x0:x1] * 255]).round().astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA'), (X0 + x0, Y0 + y0)


def girar(im, giro, neon=False):
    if not giro:
        return im
    if im.mode == 'RGBA':
        fondo = (*(NEON if neon else (255, 255, 255)), 0)
        return im.rotate(giro, resample=Image.BICUBIC, expand=True, fillcolor=fondo)
    return im.rotate(giro, resample=Image.BICUBIC, expand=True)


def sombra(alfa):
    """Sombra gris suave alrededor, como la de los stickers del fondo (un poco hacia abajo)."""
    s = alfa.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(4))
    return np.asarray(s, np.float32) / 255 * 0.22


def pegar(L, im, x0, y0, sombra_arr=None, sombra_de=(1, 3)):
    """Pega un RGBA de PIL en el lienzo float L (alto × ancho × 3) con su esquina en (x0, y0); antes, la sombra."""
    H, W = L.shape[:2]
    def zona(x, y, w, h):
        X0, Y0, X1, Y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
        return X0, Y0, X1, Y1, X0 - x, Y0 - y
    if sombra_arr is not None:
        P = (sombra_arr.shape[1] - im.width) // 2
        X0, Y0, X1, Y1, ox, oy = zona(x0 - P + sombra_de[0], y0 - P + sombra_de[1], *sombra_arr.shape[::-1])
        if X1 > X0 and Y1 > Y0:
            L[Y0:Y1, X0:X1] *= (1 - sombra_arr[oy:oy + Y1 - Y0, ox:ox + X1 - X0])[..., None]
    arr = np.asarray(im, np.float32)
    X0, Y0, X1, Y1, ox, oy = zona(x0, y0, im.width, im.height)
    if X1 > X0 and Y1 > Y0:
        a = arr[oy:oy + Y1 - Y0, ox:ox + X1 - X0, 3:] / 255
        L[Y0:Y1, X0:X1] = L[Y0:Y1, X0:X1] * (1 - a) + arr[oy:oy + Y1 - Y0, ox:ox + X1 - X0, :3] * a


def con_sombra(im):
    P = 24
    pad = Image.new('L', (im.width + 2 * P, im.height + 2 * P), 0)
    pad.paste(im.getchannel('A'), (P, P))
    return sombra(pad)


# ---------------------------------------------------------------- el acostado
def base(a):
    """Las dos mitades; el hueco se llena con las orillas en espejo (lo tapan los stickers)."""
    L = np.empty((AV, AH, 3), np.float32)
    L[:, :ANCHO] = a[:ANCHO]
    L[:, ANCHO + HUECO:] = a[FILAS_U:]
    m = HUECO // 2
    L[:, ANCHO:ANCHO + m] = L[:, ANCHO - 1:ANCHO - 1 - m:-1]
    L[:, ANCHO + m:ANCHO + HUECO] = L[:, ANCHO + HUECO + (HUECO - m) - 1:ANCHO + HUECO - 1:-1]
    return L


def armar(fid, a, receta):
    """Acostado de un fondo con su receta. Devuelve (lienzo float, lo que se pegó, cobertura opaca de la franja)."""
    neon = fid == 'neon'
    L = base(a)
    tapado = np.zeros((AV, FRANJA[1] - FRANJA[0]), bool)
    pegados = []
    for r in receta:
        st, origen = sacar(a, r['semilla'], r['margen'], fid, r.get('al_reves', False))
        g = girar(st, r['giro'], neon)
        x0, y0 = r['en']
        pegar(L, g, x0, y0, None if neon else con_sombra(g))
        op = np.asarray(g.getchannel('A')) >= 250
        X0, X1 = max(FRANJA[0], x0), min(FRANJA[1], x0 + g.width)
        Y0, Y1 = max(0, y0), min(AV, y0 + g.height)
        if X1 > X0 and Y1 > Y0:
            tapado[Y0:Y1, X0 - FRANJA[0]:X1 - FRANJA[0]] |= op[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]
        pegados.append(dict(origen=origen, tam=st.size, giro=r['giro'], en=(x0, y0), alfa=g.getchannel('A'),
                            al_reves=r.get('al_reves', False)))
    return L, pegados, tapado


def acostar_mascara(m, pegados):
    """La misma receta sobre una máscara del vertical (bool, alto × ancho a resolución completa)."""
    M = np.zeros((AV, AH), bool)
    M[:, :ANCHO] = m[:ANCHO]
    M[:, ANCHO + HUECO:] = m[FILAS_U:]
    for p in pegados:
        (ox, oy), (w, h) = p['origen'], p['tam']
        # las copias en su otra versión no se prenden (lo que se prendía ya cambió de color)
        trozo = Image.fromarray((m[oy:oy + h, ox:ox + w] * (0 if p['al_reves'] else 255)).astype(np.uint8))
        trozo = np.asarray(girar(trozo, p['giro'])) >= 128
        alfa = np.asarray(p['alfa']) >= 128
        x0, y0 = p['en']
        X0, Y0, X1, Y1 = max(0, x0), max(0, y0), min(AH, x0 + alfa.shape[1]), min(AV, y0 + alfa.shape[0])
        a_ = alfa[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]
        M[Y0:Y1, X0:X1][a_] = trozo[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0][a_]
    return M


def mascara_vertical(fid, color):
    """Formas que se prenden en Práctica (brillo/<id>-<color>.png, 540 px de ancho) a resolución completa."""
    m = Image.open(AQUI / 'brillo' / f'{fid}-{color}.png').convert('L').resize((ANCHO, ALTO), Image.NEAREST)
    return np.asarray(m) >= 128


def chica(M):
    """Máscara del acostado a 1130 × 540 (como las verticales a 540 de ancho)."""
    im = Image.fromarray((M * 255).astype(np.uint8)).resize(CHICO, Image.LANCZOS)
    return im.point(lambda v: 255 if v >= 128 else 0)


# ---------------------------------------------------------------- la botella de NOS
def botella():
    """La botella del fondo NOS: Botella NOS = Combinado rojo + la botella encima. Se saca como los demás stickers: su
    contorno negro (lo negro que no está en el Combinado rojo) relleno, más su borde blanco (26 px). Entre la válvula y
    la manguera tiene un hueco por donde se ve el fondo: ese no se rellena (adentro se ve lo de abajo, no la botella).
    Devuelve (RGBA de PIL, sombra (arreglo con 30 px de orilla), forma bool, esquina en el vertical)."""
    X0, Y0, X1, Y1 = 350, 880, 950, 2000
    C = cargar('botella_nos')[Y0:Y1, X0:X1].astype(np.float32)
    B = cargar('combinado_rojo')[Y0:Y1, X0:X1].astype(np.float32)
    distinto = np.abs(C - B).max(axis=2) > 40
    et, n = etiquetar(C.max(axis=2) < NEGRO)
    area = np.bincount(et.ravel(), minlength=n + 1)
    cambia = np.bincount(et.ravel(), weights=distinto.ravel(), minlength=n + 1)
    contorno = np.isin(et, [i for i in range(1, n + 1) if area[i] > 300 and cambia[i] > 0.6 * area[i]])
    # huecos del contorno: todos son de la botella (etiqueta, válvula, manómetro...) menos el de la manguera
    eh, nh = etiquetar(~contorno)
    fuera = set(np.unique(np.concatenate([eh[0], eh[-1], eh[:, 0], eh[:, -1]])))
    fuera.add(eh[1110 - Y0, 740 - X0])                     # el hueco de la manguera (ahí se ve lo de abajo)
    rellenos = [i for i in range(1, nh + 1) if i not in fuera]
    nucleo = contorno | np.isin(eh, rellenos)
    margen = 26
    d = distancia(nucleo, margen + 1.5)
    forma = d <= margen + 1
    ys, xs = np.nonzero(forma)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb = C.copy()
    rgb[d > margen - 4] = 255                      # el borde blanco parejo (sin la sombra de lo de abajo)
    alfa = np.clip(margen + 1.0 - d, 0, 1)
    rgba = Image.fromarray(np.dstack([rgb, alfa * 255])[y0:y1, x0:x1].round().astype(np.uint8), 'RGBA')
    forma = forma[y0:y1, x0:x1]
    P = 30
    pad = Image.new('L', (rgba.width + 2 * P, rgba.height + 2 * P), 0)
    pad.paste(Image.fromarray((forma * 255).astype(np.uint8)), (P, P))
    sombra_b = np.asarray(pad.filter(ImageFilter.GaussianBlur(8)), np.float32) / 255 * 0.6   # medida contra el original
    return rgba, sombra_b, forma, (X0 + x0, Y0 + y0)


# ---------------------------------------------------------------- todo
def main():
    import logos_rooster as LR
    sal = AQUI / 'acostados'
    sal_b = AQUI / 'brillo' / 'acostados'
    sal.mkdir(exist_ok=True); sal_b.mkdir(exist_ok=True)
    hechos = {}
    for fid, receta in RECETA.items():
        a = cargar(fid)
        L, pegados, tapado = armar(fid, a, receta)
        falta = int((~tapado).sum())
        assert falta == 0, f'{fid}: los stickers de la unión no tapan {falta} px del hueco'
        im = Image.fromarray(np.clip(L, 0, 255).round().astype(np.uint8))
        hechos[fid] = (im, pegados)
        if fid in ('blanco_negro', 'combinado', 'combinado_rojo', 'rojo', 'neon'):
            im.save(sal / f'fondo_marcas_{fid}.png', optimize=True)
            for color in ('verde', 'rojo'):
                chica(acostar_mascara(mascara_vertical(fid, color), pegados)).save(sal_b / f'{fid}-{color}.png', optimize=True)
        print(f'{fid:15} {len(receta)} stickers en la unión')

    # Botella NOS = Combinado rojo acostado + la botella en medio
    rgba, sombra_b, forma, (bx, by) = botella()
    im, pegados = hechos['combinado_rojo']
    L = np.asarray(im, np.float32).copy()
    x0, y0 = (AH - rgba.width) // 2, (AV - rgba.height) // 2
    pegar(L, rgba, x0, y0, sombra_b, (0, 0))
    Image.fromarray(np.clip(L, 0, 255).round().astype(np.uint8)).save(sal / 'fondo_marcas_botella_nos.png', optimize=True)
    for color in ('verde', 'rojo'):
        m = mascara_vertical('botella_nos', color)
        debajo = mascara_vertical('combinado_rojo', color)
        lugar = np.zeros_like(m); lugar[by:by + forma.shape[0], bx:bx + forma.shape[1]] = forma
        de_la_botella = m[by:by + forma.shape[0], bx:bx + forma.shape[1]] & forma
        m = np.where(lugar, debajo, m)                       # lo que tapaba la botella en el vertical, ya sin ella
        M = acostar_mascara(m, pegados)
        M[y0:y0 + forma.shape[0], x0:x0 + forma.shape[1]][forma] = de_la_botella[forma]
        chica(M).save(sal_b / f'botella_nos-{color}.png', optimize=True)
    print('botella_nos     la botella en medio del Combinado rojo')

    # Gallos = Blanco y negro acostado + los logos de Rooster Racing a los lados
    im, pegados = hechos['blanco_negro']
    fondo = im.copy()
    brillo = Image.new('L', fondo.size, 0); huella = Image.new('L', fondo.size, 0)
    for clave, Lg in LUGAR_ACOSTADO:
        logo, alfa, tipo = {'r_flamas': LR.sticker_r, 'rrg': LR.sticker_rrg}[clave]()
        capa, f = LR.armar(logo, alfa, tipo, round(Lg['ancho'] * LR.K))
        m, h = LR.pegar(fondo, capa, f, Lg['cx'], Lg['cy'], Lg['giro'])
        brillo = ImageChops.lighter(brillo, m); huella = ImageChops.lighter(huella, h)
    fondo.save(sal / 'fondo_marcas_gallos.png', optimize=True)
    propios = np.asarray(brillo) > 90
    tapa = np.asarray(huella) > 128
    for color in ('verde', 'rojo'):
        M = acostar_mascara(mascara_vertical('blanco_negro', color), pegados)   # Gallos prende lo mismo que Blanco y negro
        chica((M & ~tapa) | propios).save(sal_b / f'gallos-{color}.png', optimize=True)
    print('gallos          Blanco y negro + logos de Rooster Racing')


if __name__ == '__main__':
    main()
