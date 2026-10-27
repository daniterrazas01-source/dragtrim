# Práctica con salida "Tocar" (0.6.6): como alinearse en pista. 1.er toque pre-stage, 2.º stage (el árbol baja solo),
# 3.º la salida; después de una salida, un toque solo vuelve a pre-stage (el árbol no baja hasta el 2.º toque).
# Uso: python3 pt_tocar_test.py -> sale con código 1 si algo falla.
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(AQUI, '..', 'app', 'dist')
SH = os.path.join(AQUI, 'capturas', '')
os.makedirs(SH, exist_ok=True)
PUERTO = 8787
fallas = []
def chk(cond, txt):
    print(('ok    ' if cond else 'FALLA ') + txt)
    if not cond: fallas.append(txt)

TOCA = "(k) => document.getElementById('ptZona_' + k).dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true, isPrimary: true }))"
TOCA_TRAS_VERDE = """([k, ms]) => new Promise(res => { const st = window.__practica.st;
  const ver = () => { if (Number.isFinite(st.tVerde)) setTimeout(() => { document.getElementById('ptZona_' + k).dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, bubbles: true, isPrimary: true })); res(true); }, ms); else requestAnimationFrame(ver); };
  ver(); })"""

def estado(pg, k='l'):
    return pg.evaluate(f"(() => {{ const st = window.__practica.st, c = st.c.{k}; return {{ fase: st.fase, pre: c.preStage, stg: c.staged, "
                       f"salio: c.salio, rojo: c.rojo, rt: c.rt, texto: document.querySelector('#ptZona_{k} span').textContent }}; }})()")

def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PUERTO), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, color_scheme='dark')
            ctx.add_init_script("localStorage.setItem('dragtrim.practica.cfg', JSON.stringify({salida: 'tocar', modo: 'solo', arbol: 'pro'})); localStorage.setItem('dragtrim.guiaOculta', 'true');")
            pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(f'http://localhost:{PUERTO}/index.html'); pg.wait_for_timeout(500)
            pg.click('.tabs button[data-view="vPractica"]'); pg.wait_for_timeout(300)
            pg.click('#btnPractica'); pg.wait_for_timeout(300)
            e = estado(pg)
            chk(e['fase'] == 'idle' and 'pre-stage' in e['texto'].lower(), f'al abrir pide pre-stage ({e["texto"]})')
            # 1.er toque: pre-stage y nada más
            pg.evaluate(TOCA, 'l'); pg.wait_for_timeout(2200)
            e = estado(pg)
            chk(e['pre'] and not e['stg'] and e['fase'] == 'idle', f'1.er toque: pre-stage y el árbol no baja (aunque pasen 2 s) {e}')
            pg.screenshot(path=SH + 'pt_tocar_prestage.png')
            # 2.º toque: stage y el árbol baja solo
            pg.evaluate(TOCA, 'l'); pg.wait_for_timeout(100)
            e = estado(pg)
            chk(e['stg'] and e['fase'] in ('espera', 'arbol') and 'STAGED' in e['texto'], f'2.º toque: stage {e}')
            pg.wait_for_function("window.__practica.st.fase === 'arbol'", timeout=3000)
            # 3.º toque con la verde: la salida
            pg.evaluate(TOCA_TRAS_VERDE, ['l', 200])
            pg.wait_for_function("window.__practica.st.fase === 'resultado'", timeout=5000); pg.wait_for_timeout(300)
            e = estado(pg)
            chk(e['salio'] and not e['rojo'] and abs(e['rt'] - 0.2) < 0.03, f'3.er toque: salida con reacción ~0.200 ({e["rt"]:.3f})')
            chk('pre-stage' in e['texto'].lower(), f'en el resultado pide pre-stage para la otra ({e["texto"]})')
            # después de la salida: un toque solo vuelve a pre-stage
            pg.evaluate(TOCA, 'l'); pg.wait_for_timeout(2000)
            e = estado(pg)
            chk(e['pre'] and not e['stg'] and e['fase'] == 'idle', f'otra salida: un toque solo vuelve a pre-stage, el árbol espera {e}')
            # tocar antes de la verde: roja
            pg.evaluate(TOCA, 'l'); pg.wait_for_function("window.__practica.st.fase === 'arbol'", timeout=3000)
            pg.wait_for_timeout(150); pg.evaluate(TOCA, 'l')
            pg.wait_for_function("window.__practica.st.fase === 'resultado'", timeout=5000); pg.wait_for_timeout(300)
            e = estado(pg)
            chk(e['rojo'], f'tocar antes de la verde da luz roja {e}')
            chk(not errs, 'sin errores: ' + '; '.join(errs))
            ctx.close()
            # 1 vs 1: el árbol baja hasta que los dos hacen stage
            ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            ctx.add_init_script("localStorage.setItem('dragtrim.practica.cfg', JSON.stringify({salida: 'tocar', modo: 'duelo', arbol: 'full'})); localStorage.setItem('dragtrim.guiaOculta', 'true');")
            pg = ctx.new_page(); pg.goto(f'http://localhost:{PUERTO}/index.html'); pg.wait_for_timeout(500)
            pg.click('.tabs button[data-view="vPractica"]'); pg.wait_for_timeout(300)
            pg.click('#btnPractica'); pg.wait_for_timeout(300)
            modo = pg.evaluate("window.__practica.st.c && document.getElementById('ptZona_r') && getComputedStyle(document.getElementById('ptZona_r')).display !== 'none'")
            if modo:
                for t in ('l', 'l', 'r'): pg.evaluate(TOCA, t)
                pg.wait_for_timeout(1800)
                chk(estado(pg)['fase'] == 'idle', '1 vs 1: con uno en stage y otro en pre-stage el árbol espera')
                pg.evaluate(TOCA, 'r'); pg.wait_for_timeout(100)
                chk(estado(pg)['fase'] in ('espera', 'arbol'), '1 vs 1: cuando los dos hacen stage el árbol baja')
            else:
                print('(sin 1 vs 1 en esta configuración: se salta)')
            ctx.close(); b.close()
    finally:
        srv.terminate()
    print('FALLAS:', len(fallas))
    for f in fallas: print('  -', f)
    sys.exit(1 if fallas else 0)

main()
