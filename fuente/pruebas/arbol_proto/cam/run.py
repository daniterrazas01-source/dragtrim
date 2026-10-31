import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright
D = os.path.dirname(os.path.abspath(__file__))
async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8799', '-d', D], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.7)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={D}/tree.y4m'])
            ctx = await b.new_context(permissions=['camera'])
            pg = await ctx.new_page()
            await pg.goto('http://localhost:8799/page.html')
            await pg.wait_for_function('window.res && window.res.done', timeout=30000)
            r = await pg.evaluate('window.res')
            print(json.dumps(r['info'], indent=0)[:800], r.get('err'))
            fr = r['frames']
            for f in fr[:3] + fr[60:75]: print({k: (round(v, 3) if isinstance(v, float) else v) for k, v in f.items()})
            import statistics
            dts = [fr[i+1]['mt'] - fr[i]['mt'] for i in range(len(fr)-1) if fr[i]['mt'] is not None]
            print('dt mediaTime med', statistics.median(dts) if dts else None)
            if fr[0].get('cap') is not None:
                lat = [f['now'] - f['cap'] for f in fr]; print('now - captureTime med', statistics.median(lat))
            await b.close()
    finally: srv.terminate()
asyncio.run(main())
