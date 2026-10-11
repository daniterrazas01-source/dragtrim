import os, asyncio, subprocess, sys, time, json
from playwright.async_api import async_playwright
DIST=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','app','dist'); SH=os.path.join(os.path.dirname(os.path.abspath(__file__)),'capturas')+'/'; os.makedirs(SH, exist_ok=True)
MOCK = r"""
(() => {
  const listeners = [];
  window.__mock = { started: false };
  const geo = {
    watchPosition(ok, err, opts) {
      const sim = window.DragCore.simularSesion({ gps_hz: 1, lag_gps: 0.3, acc_hz: 60, seed: 4242 });
      window.__mock.sim = sim; window.__mock.started = true;
      const t0 = performance.now();
      window.__mock.t0 = t0;
      let ig = 0, ia = 0;
      setInterval(() => {
        const ts = (performance.now() - t0) / 1000;
        while (ig < sim.gps.t.length && sim.gps.t[ig] <= ts) {
          // timestamp = momento real del fix (t0 + t_sim), como lo haría el navegador
          const fixEpoch = performance.timeOrigin + t0 + sim.gps.t[ig] * 1000;
          ok({ coords: { latitude: sim.gps.lat[ig], longitude: sim.gps.lon[ig], accuracy: sim.gps.hacc[ig], speed: sim.gps.v[ig] }, timestamp: fixEpoch });
          ig++;
        }
      }, 50);
      setInterval(() => {
        const ts = (performance.now() - t0) / 1000;
        while (ia < sim.acc.t.length && sim.acc.t[ia] <= ts) {
          window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: sim.acc.ax[ia], y: sim.acc.ay[ia], z: sim.acc.az[ia] }, interval: 16 }));
          ia++;
        }
      }, 16);
      return 1;
    },
    clearWatch() {}, getCurrentPosition() {},
  };
  Object.defineProperty(navigator, 'geolocation', { get: () => geo });
})();
"""
async def main(mode):
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                  color_scheme='dark', locale='es-MX')
        if mode == 'real': await ctx.add_init_script(MOCK)
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errs.append('console.' + m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        await pg.goto('http://localhost:8765/index.html')
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=SH + f'{mode}_01_inicio.png')
        if mode == 'demo':
            await pg.click('#btnDemo')
            await pg.wait_for_timeout(2500)
            await pg.screenshot(path=SH + 'demo_02_espera.png')
            # esperar arranque
            for _ in range(80):
                if await pg.evaluate("window.__dragtrim.ses.fase") != 'espera': break
                await pg.wait_for_timeout(100)
            await pg.wait_for_timeout(1200)
            await pg.screenshot(path=SH + 'demo_03_corrida.png')
            await pg.wait_for_selector('.slip', timeout=30000)
        else:
            await pg.click('#btnSensores')
            await pg.wait_for_timeout(3500)
            await pg.screenshot(path=SH + 'real_02_sensores.png')
            await pg.click('#btnArmar')
            # registrar cuándo se pasa por cada fase
            for _ in range(900):
                f = await pg.evaluate("window.__dragtrim.ses.fase")
                if f == 'corrida': break
                await pg.wait_for_timeout(100)
            await pg.screenshot(path=SH + 'real_03_arranque.png')
            await pg.wait_for_selector('.slip', timeout=60000)
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=SH + f'{mode}_04_resultado.png', full_page=True)
        info = await pg.evaluate("""() => { const r = window.__dragtrim.ses.ultimoRun; const m = window.__mock;
            return { ok: r.ok, mensaje: r.mensaje, metodo: r.calidad && r.calidad.metodo, lag: r.calidad && r.calidad.latencia_gps_s,
              hitos: r.hitos && r.hitos.map(h => +h.t.toFixed(3)), verdad: m && m.sim ? m.sim.verdad.t_hitos.map(x => +x.toFixed(3)) : null, t_rollout: r.t_rollout,
              avisos: r.avisos, ign: r.calidad && r.calidad.mov_ignorados, accHz: r.calidad && r.calidad.acc_hz, nacc: r.raw.acc.t.length }; }""")
        print(json.dumps(info, indent=1))
        # historial
        await pg.click('#rSalir')
        await pg.click('.tabs button[data-view="vHistorial"]')
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=SH + f'{mode}_05_historial.png')
        await pg.click('#histList button')
        await pg.wait_for_timeout(500)
        # exportar (descarga)
        async with pg.expect_download() as dl:
            await pg.click('#rExport')
        d = await dl.value
        await d.save_as(SH + f'{mode}_export.zip')
        await pg.click('.tabs button[data-view="vAjustes"]')
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=SH + f'{mode}_06_ajustes.png', full_page=True)
        # recalcular sin rollout
        await pg.fill('#inRollout', '0'); await pg.dispatch_event('#inRollout', 'change')
        await pg.click('.tabs button[data-view="vHistorial"]'); await pg.wait_for_timeout(300)
        await pg.click('#histList button'); await pg.wait_for_timeout(400)
        antes = await pg.evaluate("window.__dragtrim.ses.ultimoRun.hitos.map(h=>h.t)")
        await pg.click('#rRecalc'); await pg.wait_for_timeout(800)
        r2 = await pg.evaluate("(()=>{const r=window.__dragtrim.ses.ultimoRun; return {h:r.hitos.map(h=>h.t), ro:r.cfg.rollout_ft, tro:r.t_rollout, msg:document.querySelector('#vResultado .msg')?.textContent}})()")
        print('recalc antes', [round(x,3) for x in antes], 'despues', [round(x,3) for x in r2['h']], r2['ro'], r2['msg'])
        await pg.screenshot(path=SH + f'{mode}_07_recalc.png')
        await b.close()
    srv.terminate()
    print('ERRORES:', errs if errs else 'ninguno')
asyncio.run(main(sys.argv[1]))
