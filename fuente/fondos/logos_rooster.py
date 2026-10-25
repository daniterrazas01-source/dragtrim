"""Pega los logos de Rooster Racing (el equipo de Daniel) en el fondo Blanco y negro, como stickers (pedido del 25 oct 2026).

- Logo 1 (archivo/originales/logo_rooster_racing.png): solo la R roja con flamas (sin el texto), sticker con borde blanco.
- Logo 2 (archivo/originales/logo_rrg.png): el logo RRG completo, sobre un sticker negro con borde blanco.
Toma el fondo sin logos (archivo/originales/fondo_marcas_blanco_negro_sin_rooster.png) y escribe:
  fuente/fondos/fondo_marcas_blanco_negro.png      el fondo con los logos (build.py lo pasa a WebP)
  fuente/fondos/brillo/rooster-blanco_negro.png    la forma de los dos logos a 540 px de ancho: hacer_mascaras.py la
                                                   suma al verde y al rojo, para que se prendan en Práctica
Uso: python3 logos_rooster.py && python3 brillo/hacer_mascaras.py
Para moverlos: cambia LUGAR (centro a 540 px de ancho, ancho del logo, giro en grados). Quedan a los lados del árbol
de Práctica (que ocupa más o menos x 208–332 a 540 px).
"""
import pathlib
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageStat

AQUI = pathlib.Path(__file__).resolve().parent
ORIG = AQUI.parent.parent / 'archivo' / 'originales'
LUGAR = {
    'r_flamas': dict(cx=106, cy=640, ancho=200, giro=6),
    'rrg': dict(cx=434, cy=158, ancho=172, giro=-5),
}
K = 1290 / 540   # el fondo original mide 1290 px de ancho


def dilatar(a, r):
    """Máscara L 0/255 crecida ~r px (desenfoque + umbral)."""
    return a.filter(ImageFilter.GaussianBlur(r / 2)).point(lambda v: 255 if v > 8 else 0)


def rellenar(m):
    """Rellena los huecos de una máscara (lo que no se alcanza desde fuera)."""
    w, h = m.size
    p = Image.new('L', (w + 2, h + 2), 0); p.paste(m, (1, 1))
    ImageDraw.floodfill(p, (0, 0), 128)
    return p.crop((1, 1, w + 1, h + 1)).point(lambda v: 0 if v == 128 else 255)


def sticker_r():
    im = Image.open(ORIG / 'logo_rooster_racing.png').convert('RGBA')
    im = im.crop((14, 218, 600, 456))                      # la R con flamas; el texto "Rooster Racing" empieza en y≈456
    alfa = im.getchannel('A').point(lambda v: 255 if v > 100 else 0)
    return im, alfa, 'blanco'


def sticker_rrg():
    im = Image.open(ORIG / 'logo_rrg.png').convert('RGBA')
    alfa = im.getchannel('A').point(lambda v: 255 if v > 100 else 0)
    return im, alfa, 'negro'


def armar(im, alfa, fondo, ancho_px):
    """Logo escalado + sticker (relleno y borde blanco) + forma del logo para el brillo."""
    s = ancho_px / im.width
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    alfa = alfa.resize(im.size, Image.LANCZOS)
    pad = round(0.09 * im.height) if fondo == 'negro' else round(0.07 * im.height)
    borde = max(4, round(0.035 * im.height))
    W, H = im.width + 2 * (pad + borde) + 20, im.height + 2 * (pad + borde) + 20
    ox, oy = (W - im.width) // 2, (H - im.height) // 2
    forma = Image.new('L', (W, H), 0); forma.paste(alfa, (ox, oy))
    capa = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    if fondo == 'negro':   # rectángulo negro redondeado con orilla blanca
        r = round(0.16 * im.height)
        caja = (ox - pad, oy - pad, ox + im.width + pad, oy + im.height + pad)
        ImageDraw.Draw(capa).rounded_rectangle((caja[0] - borde, caja[1] - borde, caja[2] + borde, caja[3] + borde), r + borde, fill=(255, 255, 255, 255))
        ImageDraw.Draw(capa).rounded_rectangle(caja, r, fill=(12, 12, 12, 255))
    else:                  # recorte con orilla blanca siguiendo la forma (con los huecos rellenos, como un sticker)
        corte = rellenar(dilatar(forma, pad + borde))
        orilla = dilatar(corte, max(3, round(0.022 * im.height)))   # orilla negra fina, como los demás stickers
        capa.paste(Image.new('RGBA', (W, H), (14, 14, 14, 255)), (0, 0), orilla)
        capa.paste(Image.new('RGBA', (W, H), (255, 255, 255, 255)), (0, 0), corte)
    capa.alpha_composite(Image.new('RGBA', (W, H)), (0, 0))
    logo = Image.new('RGBA', (W, H), (0, 0, 0, 0)); logo.paste(im, (ox, oy))
    capa = Image.alpha_composite(capa, logo)
    return capa, forma


def pegar(fondo, capa, forma, cx, cy, giro):
    capa = capa.rotate(giro, resample=Image.BICUBIC, expand=True)
    forma = forma.rotate(giro, resample=Image.BICUBIC, expand=True)
    x, y = round(cx * K - capa.width / 2), round(cy * K - capa.height / 2)
    # sombra gris como la de los demás stickers
    sombra = capa.getchannel('A').filter(ImageFilter.GaussianBlur(7)).point(lambda v: v * 0.45)
    fondo.paste(Image.new('RGB', capa.size, (0, 0, 0)), (x + 5, y + 8), sombra)
    fondo.paste(capa, (x, y), capa)
    m = Image.new('L', fondo.size, 0); m.paste(forma, (x, y))
    return m


def main():
    fondo = Image.open(ORIG / 'fondo_marcas_blanco_negro_sin_rooster.png').convert('RGB')
    brillo = Image.new('L', fondo.size, 0)
    for clave, fn in (('r_flamas', sticker_r), ('rrg', sticker_rrg)):
        L = LUGAR[clave]
        im, alfa, tipo = fn()
        capa, forma = armar(im, alfa, tipo, round(L['ancho'] * K))
        brillo = ImageChops.lighter(brillo, pegar(fondo, capa, forma, L['cx'], L['cy'], L['giro']))
    fondo.save(AQUI / 'fondo_marcas_blanco_negro.png', optimize=True)
    b = brillo.resize((540, round(fondo.height * 540 / fondo.width)), Image.LANCZOS).point(lambda v: 255 if v > 90 else 0)
    b.save(AQUI / 'brillo' / 'rooster-blanco_negro.png', optimize=True)
    print('listo: fondo con los logos de Rooster Racing; brillo cubre', round(ImageStat.Stat(b).mean[0] / 255 * 100, 2), '% de la pantalla')


if __name__ == '__main__':
    main()
