"""Busca cómo tapar la unión del fondo acostado con stickers del mismo fondo (ver acostados.py) e imprime la receta.

1. Encuentra los stickers completos (los de hasta arriba): un contorno negro cerrado (o caja negra) con un margen
   parejo del color del borde (blanco; neón en Neón) alrededor, sin nada encima y sin tocar la orilla.
2. Los apila de arriba a abajo sobre la unión: cada uno tapa todo el ancho de la franja desde donde terminó el anterior
   (encimado un poco, así no quedan rendijas) y se elige al azar entre los que más avanzan (otro lugar a lo ancho, otro
   giro: casi todos derechos, ±20°, a lo más dos parados). Reglas: los de abajo se siguen viendo; una copia queda lejos
   de su original (1100 px; las 216 filas de en medio del vertical no se ven y esos stickers se prefieren), o más cerca
   si va en su otra versión (cambio() en acostados.py: blanco <-> negro, rojo <-> verde...); y la unión queda igual de
   clara u oscura que el resto. Al final, dos adornos chicos encima de las orillas de la franja.
3. Cada --semilla da otro acomodo: deja su vista en acostados/vista_<id>_<semilla>.png (y todas las recetas en
   acostados/recetas_<id>.json), el catálogo de stickers con sus números en acostados/catalogo_<id>.png (para quitar
   los que se separen mal con --sin), e imprime la receta del que tapa todo con menos stickers, para pegarla en
   RECETA de acostados.py (o escoge otra semilla viendo las vistas: el 7 nov se escogieron a ojo).
Uso: python3 acostados_buscar.py <id> [--semillas 0,1,2,3,4,5] [--sin 4,8]
Necesita scipy (pip install scipy); acostados.py no.
"""
import argparse
import pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
from scipy.signal import fftconvolve
from scipy.spatial import ConvexHull

import acostados as A

# Stickers que se separan mal (números del catálogo): una parte suelta de otro sticker, o con un pedazo tapado.
SIN = {
    'blanco_negro': [5, 7, 8, 10, 12],
    'combinado': [],
    'combinado_rojo': [10, 11, 14],
    'rojo': [7, 15, 17],
    'neon': [14, 18],
}
K = 4                                   # la búsqueda va a 1/4 de resolución
VX0, VX1 = A.ANCHO - 640, A.ANCHO + A.HUECO + 640
VY0, VY1 = -220, A.AV + 224


def margen_color(a, neon):
    if neon:
        hsv = np.asarray(Image.fromarray(a).convert('HSV')).astype(int)
        return (hsv[..., 1] >= 150) & (hsv[..., 0] >= 39) & (hsv[..., 0] <= 70) & (hsv[..., 2] >= 200)
    a = a.astype(np.int16)
    return (a.min(axis=2) >= 228) & ((a.max(axis=2) - a.min(axis=2)) <= 22)


def candidatos(a, neon):
    """Stickers completos: [(semilla, margen, centro en el vertical)] ordenados de arriba a abajo."""
    H, W = a.shape[:2]
    negro = a.max(axis=2) < A.NEGRO
    M = margen_color(a, neon)
    etq, _ = ndi.label(negro)
    res = []
    for i, sl in enumerate(ndi.find_objects(etq), 1):
        if sl is None: continue
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if (y1 - y0) < 60 or (x1 - x0) < 60: continue
        P = 40
        Y0, Y1, X0, X1 = max(0, y0 - P), min(H, y1 + P), max(0, x0 - P), min(W, x1 + P)
        comp = etq[Y0:Y1, X0:X1] == i
        nucleo = ndi.binary_fill_holes(comp)
        area = int(nucleo.sum())
        if area < 9000: continue
        if area < 1.25 * comp.sum() and comp.sum() / ((x1 - x0) * (y1 - y0)) < 0.5: continue
        ys, xs = np.nonzero(nucleo ^ ndi.binary_erosion(nucleo))
        try: conv = area / ConvexHull(np.c_[xs, ys]).volume
        except Exception: continue
        if conv < 0.75: continue
        dist = ndi.distance_transform_edt(~nucleo)
        Mloc = M[Y0:Y1, X0:X1]
        f = np.array([Mloc[(dist > d - 1) & (dist <= d)].mean() for d in range(1, 36)])
        m = 0
        for d in range(3, 36):
            if f[d - 1] < 0.8: break
            m = d
        if m < 7 or f[2:m].mean() < 0.93: continue
        if y0 - m <= 2 or x0 - m <= 2 or y1 + m >= H - 2 or x1 + m >= W - 2: continue
        sil = dist <= m + 1
        cy, cx = [v.mean() for v in np.nonzero(sil)]
        yy, xx = np.nonzero(comp)
        semilla = (int(X0 + xx[0]), int(Y0 + yy[0]))
        res.append(dict(semilla=semilla, margen=int(m), centro=(X0 + cx, Y0 + cy), sil=sil, caja=(X0, Y0), area=int(sil.sum())))
    # sin los de adentro de otro (el marco interior de una caja, etc.)
    res.sort(key=lambda c: -c['area'])
    quedan = []
    for c in res:
        dentro = False
        for k in quedan:
            (cx0, cy0), (kx0, ky0) = c['caja'], k['caja']
            x0, y0 = max(cx0, kx0), max(cy0, ky0)
            x1 = min(cx0 + c['sil'].shape[1], kx0 + k['sil'].shape[1]); y1 = min(cy0 + c['sil'].shape[0], ky0 + k['sil'].shape[0])
            if x1 <= x0 or y1 <= y0: continue
            s1 = c['sil'][y0 - cy0:y1 - cy0, x0 - cx0:x1 - cx0]; s2 = k['sil'][y0 - ky0:y1 - ky0, x0 - kx0:x1 - kx0]
            if (s1 & s2).sum() > 0.5 * c['area']: dentro = True; break
        if not dentro: quedan.append(c)
    quedan.sort(key=lambda c: (c['caja'][1], c['caja'][0]))
    for n, c in enumerate(quedan, 1):
        c['n'] = n
    return quedan


def en_acostado(c):
    x, y = c['centro']
    if y < A.ANCHO: return (x, y)
    if y >= A.FILAS_U: return (x + A.ANCHO + A.HUECO, y - A.FILAS_U)
    return None                                            # en las 216 filas que no se ven


def minpool(m):
    h, w = m.shape
    p = np.zeros((-(-h // K) * K, -(-w // K) * K), bool); p[:h, :w] = m
    return p.reshape(p.shape[0] // K, K, p.shape[1] // K, K).all(axis=(1, 3))


def maxpool(m):
    h, w = m.shape
    p = np.zeros((-(-h // K) * K, -(-w // K) * K), bool); p[:h, :w] = m
    return p.reshape(p.shape[0] // K, K, p.shape[1] // K, K).any(axis=(1, 3))


def giros(im):
    w, h = im.size
    if 0.85 < w / h < 1.18:
        return [-24, -14, -6, 0, 6, 14, 24]
    g = [-20, -15, -11, -7, -3, 3, 7, 11, 15, 20]
    if max(w, h) / min(w, h) >= 1.9:
        g += [80, 86, 92, 98, -80, -86, -92, -98]
    return g


def buscar(cands, sts, inv, luz, semilla, max_paradas=2):
    """Apila stickers de arriba a abajo: cada uno tapa el ancho completo de la franja desde donde terminó el anterior
    (así no quedan rendijas). Entre las opciones que más avanzan se elige una al azar (otro lugar a lo ancho, otro
    giro), cuidando que una copia no quede cerca de su original (en su otra versión puede quedar más cerca), que los
    de abajo se sigan viendo y que la unión no quede más clara ni más oscura que el resto (luz[i] = brillo normal y
    en su otra versión). Devuelve los puestos (dict con i, giro, invertir, en, c)."""
    rng = np.random.default_rng(semilla)
    Wv, Hv = (VX1 - VX0) // K, (VY1 - VY0) // K
    bl, br = (A.FRANJA[0] - VX0) // K, -(-(A.FRANJA[1] - VX0) // K)   # columnas de la franja (a 1/4)
    bw = br - bl
    oy0 = (0 - VY0) // K                                              # fila 0 del lienzo en la ventana
    filas = -(-A.AV // K)
    capa = np.zeros((Hv, Wv), np.int16)
    area, puestos, usados, paradas = {}, [], set(), 0
    meta = np.mean([l[0] for l in luz])
    suma_luz = suma_area = 0.0
    var = []
    for i, st in enumerate(sts):
        for g in giros(st):
            alfa = np.asarray(A.girar(st, g).getchannel('A'))
            O, F = minpool(alfa >= 250), maxpool(alfa > 20)
            h, w = O.shape
            if w < bw: continue
            cs = np.concatenate([np.zeros((h, 1), int), np.cumsum(O, axis=1)], axis=1)
            pxs = np.arange(br - w, bl + 1)                    # la orilla izquierda del sticker (puede quedar fuera de la franja)
            lleno = (cs[:, br - pxs] - cs[:, bl - pxs]) == bw    # filas del sticker que tapan todo el ancho, por posición
            for k, px in enumerate(pxs):
                col = np.concatenate([[False], lleno[:, k], [False]])
                d = np.diff(col.astype(int)); ini_, fin_ = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
                if not len(ini_): continue
                j = int(np.argmax(fin_ - ini_))
                var.append((i, g, O, F, int(px), int(ini_[j]), int(fin_[j] - ini_[j])))
    y = 0
    vis_min, lejos, cerca = 0.45, 1100.0, 450.0          # copia igual: a 1100 px de su original; en su otra versión: a 450
    while y < filas:
        opciones = []
        for (i, g, O, F, px, r0, largo) in var:
            if i in usados or (abs(g) > 45 and paradas >= max_paradas): continue
            h, w = O.shape
            encima_ = int(rng.integers(0, max(1, largo // 4)))   # se encima un poco con el de arriba
            py = oy0 + y - r0 - encima_                         # su primera fila llena queda arriba de donde va la cuenta
            if py < 0 or py + h > Hv: continue
            cx, cy = VX0 + (px + w / 2) * K, VY0 + (py + h / 2) * K
            o = en_acostado(cands[i])
            otros = [q['c'] for q in puestos if q['i'] == i] + ([o] if o is not None else [])
            dist = min((np.hypot(cx - x_, cy - y_) for x_, y_ in otros), default=9e9)
            formas = [False] if dist >= lejos else []
            if inv[i] and dist >= cerca: formas.append(True)
            if not formas: continue
            avance = min(largo - encima_, filas - y) * (1.3 if o is None and not otros else 1.0) * (0.9 if abs(g) > 45 else 1.0)
            opciones.append((avance, i, g, O, F, px, py, formas, largo - encima_))
        buenas = []
        mejor = max((o_[0] for o_ in opciones), default=0)
        opciones = [o_ for o_ in opciones if o_[0] >= 0.55 * mejor]
        if len(opciones) > 400:                               # una muestra basta (y es mucho más rápido)
            opciones = [opciones[k] for k in rng.choice(len(opciones), 400, replace=False)]
        visible = np.bincount(capa.ravel(), minlength=len(puestos) + 1)
        for avance, i, g, O, F, px, py, formas, paso in opciones:
            h, w = O.shape
            zona = capa[py:py + h, px:px + w]
            tapa = np.bincount(zona[F], minlength=len(puestos) + 1)
            if any(visible[j] - tapa[j] < vis_min * area[j] for j in range(1, len(puestos) + 1)):
                continue
            def desvio(al_reves):
                l = luz[i][1 if al_reves else 0]
                return abs((suma_luz + l * F.sum()) / (suma_area + F.sum()) - meta)
            al_reves = min(formas, key=desvio)
            buenas.append((avance * max(0.05, 1 - 0.015 * desvio(al_reves)), i, g, O, F, px, py, al_reves, paso))
        if not buenas:
            if vis_min > 0.2: vis_min -= 0.05; continue
            if lejos > 650: lejos -= 50; cerca = max(350.0, cerca - 25); continue
            if usados: usados = set(); continue                 # ya se usaron todos: se puede repetir alguno (lejos)
            break
        # al azar entre los que más avanzan (pesa más el que más avanza), para que no salga una pila ordenada
        top = sorted(buenas, key=lambda b: -b[0])
        top = [b for b in top if b[0] >= 0.6 * top[0][0]]
        peso = np.array([b[0] for b in top]) ** 2
        avance, i, g, O, F, px, py, al_reves, paso = top[rng.choice(len(top), p=peso / peso.sum())]
        h, w = O.shape
        j = len(puestos) + 1
        capa[py:py + h, px:px + w][F] = j
        area[j] = F.sum()
        suma_luz += luz[i][1 if al_reves else 0] * F.sum(); suma_area += F.sum()
        usados.add(i); paradas += abs(g) > 45
        y += paso                                           # lo que avanzó (su tramo lleno, menos lo encimado)
        puestos.append(dict(i=i, giro=g, invertir=al_reves, en=(int(VX0 + px * K), int(VY0 + py * K)),
                            c=(VX0 + (px + w / 2) * K, VY0 + (py + h / 2) * K)))
    # adornos: unos stickers más chicos encima de las orillas de la franja, para que no se vea una columna
    adornos = 0
    for intento in range(400):
        if adornos >= 2: break
        i = int(rng.integers(len(sts)))
        if i in usados: continue
        g = int(rng.choice(giros(sts[i])))
        if abs(g) > 45: continue
        alfa = np.asarray(A.girar(sts[i], g).getchannel('A'))
        F = maxpool(alfa > 20)
        h, w = F.shape
        if F.sum() > 3000: continue                         # solo chicos (a 1/4: < ~48 000 px)
        lado = bl if rng.random() < 0.5 else br
        cx = lado + int(rng.integers(-w // 3, w // 3 + 1))
        cy = oy0 + int(rng.integers(h // 2, filas - h // 2))
        px, py = cx - w // 2, cy - h // 2
        if px < 0 or py < 0 or px + w > Wv or py + h > Hv: continue
        o = en_acostado(cands[i])
        ccx, ccy = VX0 + (px + w / 2) * K, VY0 + (py + h / 2) * K
        otros = [q['c'] for q in puestos if q['i'] == i] + ([o] if o is not None else [])
        dist = min((np.hypot(ccx - x_, ccy - y_) for x_, y_ in otros), default=9e9)
        formas = [False] if dist >= lejos else []
        if inv[i] and dist >= cerca: formas.append(True)
        if not formas: continue
        zona = capa[py:py + h, px:px + w]
        visible = np.bincount(capa.ravel(), minlength=len(puestos) + 1)
        tapa = np.bincount(zona[F], minlength=len(puestos) + 1)
        if any(visible[j] - tapa[j] < 0.5 * area[j] for j in range(1, len(puestos) + 1)):
            continue
        if any(abs(q['c'][1] - ccy) < 260 and q.get('adorno') for q in puestos): continue   # repartidos a lo alto
        al_reves = min(formas, key=lambda r: abs((suma_luz + luz[i][1 if r else 0] * F.sum()) / (suma_area + F.sum()) - meta))
        j = len(puestos) + 1
        capa[py:py + h, px:px + w][F] = j
        area[j] = F.sum()
        suma_luz += luz[i][1 if al_reves else 0] * F.sum(); suma_area += F.sum()
        usados.add(i); adornos += 1
        puestos.append(dict(i=i, giro=g, invertir=al_reves, en=(int(VX0 + px * K), int(VY0 + py * K)),
                            c=(ccx, ccy), adorno=True))
    return puestos, float(max(0, filas - y))


def catalogo(fid, cands, sts):
    f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
    filas, fila, x, alto = [], [], 0, 0
    for c, st in zip(cands, sts):
        im = st.resize((max(1, st.width // 2), max(1, st.height // 2)), Image.LANCZOS)
        if x + im.width + 10 > 1300 and fila:
            filas.append((fila, alto)); fila, x, alto = [], 0, 0
        fila.append((c, im, x)); x += im.width + 14; alto = max(alto, im.height)
    filas.append((fila, alto))
    hoja = Image.new('RGB', (1300, sum(a + 34 for _, a in filas) + 10), (120, 70, 140))
    d = ImageDraw.Draw(hoja)
    y = 6
    for fila, alto in filas:
        for c, im, x in fila:
            hoja.paste(im, (x + 6, y + 26), im)
            d.text((x + 6, y), f"{c['n']}{'' if en_acostado(c) else ' (no se ve)'}", fill=(255, 255, 0), font=f)
        y += alto + 34
    hoja.save(A.AQUI / 'acostados' / f'catalogo_{fid}.png')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('fid')
    ap.add_argument('--semillas', default='0,1,2,3,4,5')
    ap.add_argument('--sin', default=None)
    args = ap.parse_args()
    fid = args.fid
    neon = fid == 'neon'
    (A.AQUI / 'acostados').mkdir(exist_ok=True)
    a = A.cargar(fid)
    cands = candidatos(a, neon)
    sts = [A.sacar(a, c['semilla'], c['margen'], fid)[0] for c in cands]
    catalogo(fid, cands, sts)
    sin = set(int(n) for n in args.sin.split(',')) if args.sin else set(SIN.get(fid, []))
    elegibles = [k for k, c in enumerate(cands) if c['n'] not in sin]
    cands = [cands[k] for k in elegibles]; sts = [sts[k] for k in elegibles]
    inv = [A.otra_version(a, c['semilla'], c['margen'], fid) for c in cands]
    def brillo(st):
        x = np.asarray(st, np.float32); al = x[..., 3] / 255
        return float((x[..., :3].mean(axis=2) * al).sum() / al.sum())
    luz = [(brillo(st), brillo(A.sacar(a, c['semilla'], c['margen'], fid, True)[0]) if v else brillo(st)) for c, st, v in zip(cands, sts, inv)]
    mejor, todas = None, {}
    for s in (int(x) for x in args.semillas.split(',')):
        puestos, falta = buscar(cands, sts, inv, luz, s)
        receta = [dict(semilla=cands[p['i']]['semilla'], margen=cands[p['i']]['margen'], giro=p['giro'], en=p['en'],
                       **({'al_reves': True} if p['invertir'] else {})) for p in puestos]
        L, pegados, tapado = A.armar(fid, a, receta)
        hueco = int((~tapado).sum())
        todas[s] = dict(receta=receta, hueco=hueco)
        Image.fromarray(np.clip(L, 0, 255).round().astype(np.uint8)).resize((A.AH // 2, A.AV // 2), Image.LANCZOS).save(A.AQUI / 'acostados' / f'vista_{fid}_{s}.png')
        print(f'semilla {s}: {len(receta)} stickers ({sum(1 for r in receta if r.get("al_reves"))} en su otra versión), sin tapar {hueco} px')
        if hueco == 0 and (mejor is None or len(receta) < len(mejor[1])):
            mejor = (s, receta, L)
    import json
    json.dump({str(k): v for k, v in todas.items()}, open(A.AQUI / 'acostados' / f'recetas_{fid}.json', 'w'))
    if mejor is None:
        raise SystemExit('ninguna semilla tapó todo: prueba otras (--semillas) o quita menos stickers (--sin)')
    s, receta, L = mejor
    Image.fromarray(np.clip(L, 0, 255).round().astype(np.uint8)).resize((A.AH // 2, A.AV // 2), Image.LANCZOS).save(A.AQUI / 'acostados' / f'vista_{fid}.png')
    print(f'\nmejor: semilla {s}, {len(receta)} stickers. Receta para acostados.py:\n')
    print(f"    '{fid}': [")
    for r in receta:
        print(f"        dict(semilla={r['semilla']}, margen={r['margen']}, giro={r['giro']}, en={r['en']}{', al_reves=True' if r.get('al_reves') else ''}),")
    print('    ],')


if __name__ == '__main__':
    main()
