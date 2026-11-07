import base64, io, os, sys
sys.path.insert(0, 'pylib')  # segno (pip install segno)
import segno
from PIL import Image, ImageDraw, ImageEnhance
from playwright.sync_api import sync_playwright
R = '/home/user/dragtrim'
URL = 'https://daniterrazas01-source.github.io/dragtrim/'
OUT = R + '/archivo/qr'
def uri(im, fmt='PNG', **kw):
    b = io.BytesIO(); im.save(b, fmt, **kw); return f'data:image/{fmt.lower()};base64,' + base64.b64encode(b.getvalue()).decode()
qr = segno.make(URL, error='h')
b = io.BytesIO(); qr.save(b, kind='png', scale=24, border=0, dark='#111111', light='#ffffff')
q = Image.open(io.BytesIO(b.getvalue())).convert('RGB')
ic = Image.open(R + '/fuente/app/src/icono/icono.png').convert('RGB')
w = q.width; lado = int(w * 0.2); m = int(lado * 0.09)
ic = ic.resize((lado, lado), Image.LANCZOS)
mk = Image.new('L', (lado, lado), 0); ImageDraw.Draw(mk).rounded_rectangle((0, 0, lado - 1, lado - 1), radius=int(lado * 0.22), fill=255)
caja = Image.new('RGB', (lado + 2 * m, lado + 2 * m), 'white'); caja.paste(ic, (m, m), mk)
q.paste(caja, ((w - caja.width) // 2, (w - caja.height) // 2))
fondo = Image.open(R + '/fuente/fondos/fondo_marcas_gallos.png').convert('RGB').resize((1080, 2340), Image.LANCZOS).crop((0, 210, 1080, 2130))
roo = Image.open(R + '/fuente/app/src/carga/logo_rooster_racing.png').convert('RGBA'); roo = roo.crop(roo.getbbox()); roo.thumbnail((420, 420))
logo = open(R + '/fuente/app/src/logo.svg').read()
saira = base64.b64encode(open(R + '/fuente/app/src/fuentes/saira-black-italic.woff2', 'rb').read()).decode()
html = f"""<!doctype html><meta charset="utf-8"><style>
@font-face {{ font-family: Rooster; src: url(data:font/woff2;base64,{saira}) format('woff2'); }}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: #141618; }}
.p {{ width: 1080px; height: 1920px; position: relative; overflow: hidden; color: #fff; font-family: system-ui, sans-serif;
  background: url({uri(fondo, 'JPEG', quality=88)}) center/cover; }}
.velo {{ position: absolute; inset: 0; background:
  linear-gradient(180deg, rgba(20,22,24,.92) 0%, rgba(20,22,24,.55) 30%, rgba(20,22,24,.55) 62%, rgba(20,22,24,.95) 88%); }}
.c {{ position: relative; height: 100%; display: flex; flex-direction: column; align-items: center; padding: 70px 80px 56px; }}
.logo svg {{ width: 430px; height: auto; display: block; filter: drop-shadow(0 10px 24px rgba(0,0,0,.6)); }}
.lg-drag {{ fill: #fff; }} .lg-tree {{ fill: #111; }} .lg-borde {{ fill: #fff; stroke: #fff; }}
.sub {{ background: rgba(20,22,24,.75); padding: 14px 26px 16px; border-radius: 14px; font: 900 36px/1 Rooster; font-synthesis: none; white-space: nowrap; margin-top: 24px; text-shadow: 0 3px 12px #000; }}
.sub b {{ color: #e8202a; }}
.luces {{ display: flex; gap: 18px; margin: 34px 0 0; }}
.luces i {{ width: 30px; height: 30px; border-radius: 50%; border: 3px solid #111; box-shadow: 0 0 18px currentColor; background: currentColor; }}
.qr {{ margin-top: 34px; background: #fff; padding: 34px; border-radius: 34px; border: 10px solid #fff;
  box-shadow: 0 0 0 6px #111, 0 24px 60px rgba(0,0,0,.7); position: relative; }}
.qr img {{ width: 540px; display: block; image-rendering: pixelated; }}
.tag {{ position: relative; z-index: 1; margin-top: -14px; transform: rotate(-3deg); white-space: nowrap;
  background: #e8202a; color: #fff; font: 900 58px/1 Rooster; font-synthesis: none; padding: 18px 40px 20px;
  border: 7px solid #fff; border-radius: 16px; box-shadow: 0 0 0 5px #111, 0 12px 30px rgba(0,0,0,.6); }}
.pasos {{ margin-top: 40px; display: grid; gap: 18px; width: 860px; }}
.paso {{ display: flex; gap: 22px; align-items: center; background: rgba(20,22,24,.82); border: 4px solid #fff; border-radius: 20px; padding: 20px 26px; font-size: 32px; line-height: 1.25; }}
.paso span {{ flex: none; width: 58px; height: 58px; border-radius: 50%; background: #e8202a; display: grid; place-items: center; font: 900 34px/1 Rooster; font-synthesis: none; }}
.by {{ margin-top: 30px; display: flex; align-items: center; gap: 22px; font: 900 40px/1 Rooster; font-synthesis: none; }}
.by img {{ width: 260px; display: block; }}
.url {{ font-size: 24px; color: #ccc; margin-top: 14px; }}
</style><div class="p"><div class="velo"></div><div class="c">
<div class="logo">{logo}</div>
<div class="sub">Tiempos de <b>1/8</b> y <b>1/4</b> de milla en tu teléfono</div>
<div class="qr"><img src="{uri(q)}"></div><div class="tag">ESCANEA CON TU CÁMARA</div>
<div class="pasos">
<div class="paso"><span>1</span><div><b>iPhone:</b> ábrela en Safari → <b>Compartir</b> → <b>Agregar a inicio</b>.</div></div>
<div class="paso"><span>2</span><div><b>Android:</b> en Chrome toca <b>Instalar app</b>.</div></div>
</div>
<div class="by">By <img src="{uri(roo)}"></div>
<div class="url">{URL}</div>
</div></div>"""
open('portada.html', 'w').write(html)
with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(viewport={'width': 1080, 'height': 1920}, device_scale_factor=2)
    pg.set_content(html); pg.wait_for_timeout(500)
    pg.locator('.p').screenshot(path=OUT + '/portada_instalar_drag_tree.png'); br.close()
