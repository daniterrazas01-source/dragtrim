import os, asyncio, subprocess, sys, time, json
from playwright.async_api import async_playwright
SH=os.path.join(os.path.dirname(os.path.abspath(__file__)),'capturas')+'/'; os.makedirs(SH, exist_ok=True)
JS_PRESS = """(k,id)=>document.getElementById('ptZona_'+k).dispatchEvent(new PointerEvent('pointerdown',{pointerId:id,bubbles:true,isPrimary:id===1}))"""
JS_RELEASE_AFTER_GREEN = """([k,id,ms]) => new Promise(res => {
  const st = window.__practica.st;
  const chk = () => { if (Number.isFinite(st.tVerde)) setTimeout(() => { document.getElementById('ptZona_'+k).dispatchEvent(new PointerEvent('pointerup',{pointerId:id,bubbles:true})); res(true); }, ms); else requestAnimationFrame(chk); };
  chk(); })"""
async def main():
    srv = subprocess.Popen([sys.executable,'-m','http.server','8767','-d',os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','app','dist')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(0.8)
    errs=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,color_scheme='dark')
        pg=await ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto('http://localhost:8767/')
        await pg.click('.tabs button[data-view="vPractica"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=SH+'pt_01_menu.png', full_page=True)
        await pg.click('#btnPractica'); await pg.wait_for_timeout(300)
        # A) solo, suelta 180 ms después de la verde (x3)
        rts=[]
        for i in range(3):
            await pg.evaluate(JS_PRESS, ['l',1] if False else None) if False else None
            await pg.evaluate("(a)=>("+JS_PRESS+")(a[0],a[1])", ['l',1])
            if i==0:
                await pg.wait_for_timeout(450); await pg.screenshot(path=SH+'pt_02_staged.png')
                await pg.wait_for_function("window.__practica.st.fase==='arbol'"); await pg.wait_for_timeout(120)
                await pg.screenshot(path=SH+'pt_03_ambar.png')
            await pg.evaluate(JS_RELEASE_AFTER_GREEN, ['l',1,180])
            await pg.wait_for_function("window.__practica.st.fase==='resultado'", timeout=5000)
            await pg.wait_for_timeout(500)
            rts.append(await pg.evaluate("window.__practica.st.c.l.rt"))
        await pg.screenshot(path=SH+'pt_04_resultado.png')
        print('A solo rt (esperado ~0.180):', [round(x,3) for x in rts])
        # B) salida antes de la verde -> roja
        await pg.evaluate("(a)=>("+JS_PRESS+")(a[0],a[1])", ['l',1])
        await pg.wait_for_function("window.__practica.st.fase==='arbol'")
        await pg.wait_for_timeout(250)
        await pg.evaluate("document.getElementById('ptZona_l').dispatchEvent(new PointerEvent('pointerup',{pointerId:1,bubbles:true}))")
        await pg.wait_for_function("window.__practica.st.fase==='resultado'", timeout=5000); await pg.wait_for_timeout(300)
        c=await pg.evaluate("window.__practica.st.c.l"); print('B roja:', c['rojo'], round(c['rt'],3), await pg.inner_text('#ptLab_l'))
        await pg.screenshot(path=SH+'pt_05_roja.png')
        # C) suelta antes de que baje el árbol
        await pg.evaluate("(a)=>("+JS_PRESS+")(a[0],a[1])", ['l',1]); await pg.wait_for_timeout(400)
        await pg.evaluate("document.getElementById('ptZona_l').dispatchEvent(new PointerEvent('pointerup',{pointerId:1,bubbles:true}))")
        await pg.wait_for_timeout(300); print('C antes del árbol:', await pg.inner_text('#ptRt_l'), '|', await pg.inner_text('#ptLab_l'))
        print('historial solo:', await pg.evaluate("window.__practica.hist().length"))
        await pg.click('#ptCerrar'); await pg.wait_for_timeout(200)
        # D) 1 vs 1, árbol full
        await pg.click('#segPModo button[data-v="duelo"]'); await pg.click('#segPArbol button[data-v="full"]')
        await pg.click('#btnPractica'); await pg.wait_for_timeout(200)
        await pg.evaluate("(a)=>("+JS_PRESS+")(a[0],a[1])", ['l',1]); await pg.evaluate("(a)=>("+JS_PRESS+")(a[0],a[1])", ['r',2])
        await pg.wait_for_function("window.__practica.st.fase==='arbol'"); await pg.wait_for_timeout(700)
        await pg.screenshot(path=SH+'pt_06_duelo_full.png')
        await asyncio.gather(pg.evaluate(JS_RELEASE_AFTER_GREEN, ['l',1,90]), pg.evaluate(JS_RELEASE_AFTER_GREEN, ['r',2,240]))
        await pg.wait_for_function("window.__practica.st.fase==='resultado'", timeout=5000); await pg.wait_for_timeout(500)
        print('D duelo:', await pg.inner_text('#ptRt_l'), await pg.inner_text('#ptRt_r'), '|', await pg.inner_text('#ptMsg'), '| marcador', await pg.inner_text('#ptScore'))
        await pg.screenshot(path=SH+'pt_07_duelo_res.png')
        await pg.click('#ptCerrar'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=SH+'pt_08_stats.png', full_page=True)
        await b.close()
    srv.terminate(); print('errores:', errs or 'ninguno')
asyncio.run(main())
