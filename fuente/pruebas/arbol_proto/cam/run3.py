import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__))
async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8798', '-d', D], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.7)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(); pg = await (await b.new_context()).new_page()
            await pg.goto('http://localhost:8798/page3.html')
            await pg.wait_for_function('window.res && window.res.done', timeout=30000)
            r = await pg.evaluate('({res: window.res, cf: window.__camFalsa})')
            fr = r['res']['fr']; tp = r['cf']['tPintada']; tv = r['cf']['verdeEn']
            k = next(i for i, f in enumerate(fr) if f['g'] > 150)
            print('verdeEn', round(tv,1), 'pintada', round(tp,1))
            for f in fr[k-2:k+2]: print({a: (round(b2,1) if isinstance(b2,(int,float)) and b2 is not None else b2) for a,b2 in f.items()})
            import statistics; print('fps', 1000/statistics.median([fr[i+1]['now']-fr[i]['now'] for i in range(len(fr)-1)]))
            await b.close()
    finally: srv.terminate()
asyncio.run(main())
