# Práctica: el fondo se enciende según la reacción (verde = cerca de la perfecta, rojo = roja o lenta).
# Comprueba que NO cambia antes ni durante el árbol (no debe dar pistas). Capturas en capturas/brillo_*.png.
import asyncio, os, subprocess, sys
from playwright.async_api import async_playwright
AQUI = os.path.dirname(os.path.abspath(__file__)); DIST = os.path.join(AQUI, '..', 'app', 'dist'); SH = os.path.join(AQUI, 'capturas', '')
os.makedirs(SH, exist_ok=True); PUERTO = 8787
PRESS = "([k,id]) => document.getElementById('ptZona_'+k).dispatchEvent(new PointerEvent('pointerdown',{pointerId:id,bubbles:true,isPrimary:id===1}))"
RELEASE = "([k,id]) => document.getElementById('ptZona_'+k).dispatchEvent(new PointerEvent('pointerup',{pointerId:id,bubbles:true}))"
RELEASE_AFTER_GREEN = """([k,id,ms]) => new Promise(res => { const st = window.__practica.st;
  const chk = () => { if (Number.isFinite(st.tVerde)) setTimeout(() => { document.getElementById('ptZona_'+k).dispatchEvent(new PointerEvent('pointerup',{pointerId:id,bubbles:true})); res(true); }, ms); else requestAnimationFrame(chk); };
  chk(); })"""
OPAC = "(k) => [+getComputedStyle(document.getElementById('ptBv_'+k)).opacity, +getComputedStyle(document.getElementById('ptBr_'+k)).opacity]"
fallas = []
def chk(c, t):
    print(('ok    ' if c else 'FALLA ') + t)
    if not c: fallas.append(t)

def revisar_mascaras():
    # Que en ningún fondo se prenda casi toda la pantalla: solo logos sueltos (como en Combinado)
    from PIL import Image, ImageStat
    import glob
    for f in sorted(glob.glob(os.path.join(DIST, 'fondos', '*_brillo_*.webp'))):
        cubre = ImageStat.Stat(Image.open(f).getchannel('A')).mean[0] / 255
        chk(0.04 <= cubre <= 0.22, f'{os.path.basename(f)}: se prende el {cubre * 100:.1f} % de la pantalla')
async def main():
    revisar_mascaras()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PUERTO), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(0.8)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            for fondo in ('combinado', 'combinado_rojo', 'botella_nos', 'neon', 'rojo', 'blanco_negro', 'gallos', 'ninguno'):
                ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, color_scheme='dark', device_scale_factor=2)
                await ctx.add_init_script(f"localStorage.setItem('dragtrim.settings', JSON.stringify({{fondo: '{fondo}'}}))")
                pg = await ctx.new_page(); errs = []
                pg.on('pageerror', lambda e: errs.append(str(e)))
                pg.on('response', lambda r: errs.append(f'{r.status} {r.url}') if r.status >= 400 else None)
                await pg.goto(f'http://localhost:{PUERTO}/index.html'); await pg.wait_for_timeout(400)
                await pg.click('.tabs button[data-view="vPractica"]'); await pg.click('#segPModo button[data-v="solo"]'); await pg.click('#btnPractica'); await pg.wait_for_timeout(400)
                for nombre, ms in (('perfecta', 2), ('buena', 70), ('lenta', 420), ('roja', None)):
                    await pg.evaluate(PRESS, ['l', 1])
                    await pg.wait_for_function("window.__practica.st.fase==='arbol'")
                    durante = await pg.evaluate(OPAC, 'l')
                    chk(durante == [0, 0], f'{fondo} {nombre}: el fondo no cambia mientras baja el árbol {durante}')
                    if ms is None:
                        await pg.wait_for_timeout(150); await pg.evaluate(RELEASE, ['l', 1])
                    else:
                        await pg.evaluate(RELEASE_AFTER_GREEN, ['l', 1, ms])
                    # se prende en cuanto sueltas: 0.12 s después ya brilla y la ronda aún no termina
                    await pg.wait_for_timeout(120)
                    pronto, fase = await pg.evaluate(OPAC, 'l'), await pg.evaluate("window.__practica.st.fase")
                    chk(max(pronto) > 0.3 and fase != 'resultado', f'{fondo} {nombre}: ya brilla 0.12 s después de soltar {pronto} (fase {fase})')
                    await pg.wait_for_function("window.__practica.st.fase==='resultado'", timeout=6000); await pg.wait_for_timeout(1100)
                    v, r = await pg.evaluate(OPAC, 'l'); rt = await pg.evaluate("window.__practica.st.c.l.rt")
                    if nombre == 'perfecta': ok = v > 0.8 and r == 0
                    elif nombre == 'buena': ok = 0.2 < v < 0.8 and r == 0
                    elif nombre == 'lenta': ok = v == 0 and r > 0.4
                    else: ok = v == 0 and r > 0.85
                    chk(ok, f'{fondo} {nombre} (rt {rt if rt is None else round(rt, 3)}): verde {v:.2f} rojo {r:.2f}')
                    await pg.screenshot(path=SH + f'brillo_{fondo}_{nombre}.png')
                # al empezar otra salida, el fondo se apaga
                await pg.evaluate(PRESS, ['l', 1]); await pg.wait_for_timeout(500)
                chk(await pg.evaluate(OPAC, 'l') == [0, 0], f'{fondo}: al hacer stage otra vez el fondo se apaga')
                await pg.evaluate(RELEASE, ['l', 1]); await pg.wait_for_timeout(300)
                await pg.click('#ptCerrar')
                if fondo == 'combinado':
                    # 1 vs 1: cada mitad con su carril
                    await pg.click('#segPModo button[data-v="duelo"]'); await pg.click('#btnPractica'); await pg.wait_for_timeout(300)
                    await pg.evaluate(PRESS, ['l', 1]); await pg.evaluate(PRESS, ['r', 2])
                    await pg.wait_for_function("window.__practica.st.fase==='arbol'"); await pg.wait_for_timeout(200)
                    await pg.evaluate(RELEASE, ['r', 2])      # derecha: roja
                    await pg.evaluate(RELEASE_AFTER_GREEN, ['l', 1, 20])
                    await pg.wait_for_function("window.__practica.st.fase==='resultado'", timeout=6000); await pg.wait_for_timeout(1100)
                    L, R = await pg.evaluate(OPAC, 'l'), await pg.evaluate(OPAC, 'r')
                    chk(L[0] > 0.6 and L[1] == 0 and R[0] == 0 and R[1] > 0.85, f'1 vs 1: izquierda verde {L}, derecha roja {R}')
                    await pg.screenshot(path=SH + 'brillo_duelo.png')
                    await pg.click('#ptCerrar'); await pg.click('#segPModo button[data-v="solo"]')
                chk(not errs, f'{fondo}: sin errores ni archivos faltantes {errs}')
                await ctx.close()
            await b.close()
    finally: srv.terminate()
    print('FALLAS:', len(fallas)); sys.exit(1 if fallas else 0)
asyncio.run(main())
