"""Semáforo con cámara dentro de la app (index.html de dist) en Chromium.
La cámara es un lienzo que pinta el árbol simulado (semaforo_sim.js) a la hora de la sesión simulada de uitest.py, y el
giroscopio sigue el mismo cabeceo. Revisa: A reacción medida y neutralidad (nada cambia en pantalla por el árbol),
C sin permiso de cámara, D historial/cambiar carril/recalcular/exportar, E migración de IndexedDB v1 → v2,
F corrida simulada con cámara, G diseño (320 px y horizontal).
Uso: python3 camara_test.py   (antes: bash fuente/publicar.sh)"""
import http.server, io, json, os, pathlib, shutil, socketserver, sys, tempfile, threading, time, zipfile
from playwright.sync_api import sync_playwright

AQUI = pathlib.Path(__file__).resolve().parent
DIST = AQUI.parent / 'app' / 'dist'
CAPT = AQUI / 'capturas'; CAPT.mkdir(exist_ok=True)
fallas, oks = [], []
def ok(c, msg):
    (oks if c else fallas).append(msg); print(('ok    ' if c else 'FALLA ') + msg, flush=True)

raiz = tempfile.mkdtemp()
shutil.copytree(DIST, raiz, dirs_exist_ok=True)
with open(os.path.join(raiz, 'migr.html'), 'w') as f:      # misma origen: crea la base vieja (v1) con 2 corridas
    f.write("""<!doctype html><script>
    window.listo = new Promise((res) => { const rq = indexedDB.open('dragtrim', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('runs', { keyPath: 'id' });
      rq.onsuccess = () => { const db = rq.result, t = db.transaction('runs', 'readwrite'), st = t.objectStore('runs');
        for (const id of [1700000000000, 1700000100000]) st.put({ id, fecha: new Date(id).toISOString(), sello: 's' + id, demo: true, app: 'beta 0.5.3', cfg: { distancia_final: 402.336, rollout_ft: 1 }, ok: false, mensaje: 'vieja', avisos: [], raw: { gps: { t: [] }, acc: { t: [] } } });
        t.oncomplete = () => { db.close(); res(true); }; }; });
    </script>""")

class Silencio(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=raiz, **k)
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), Silencio); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{PORT}/index.html?camdev'   # el semáforo está "en desarrollo": solo se ve con ?camdev (0.6.1)
URL_NORMAL = f'http://127.0.0.1:{PORT}/index.html'

# Sensores falsos (como uitest.py 'real') + giroscopio + cámara = lienzo con el árbol simulado
MOCK = r"""
(() => {
  const plan = window.__plan || {};
  window.__mock = { started: false };
  window.__vibra = 0; navigator.vibrate = () => { window.__vibra++; return true; };
  const W = 640, H = 360;
  window.__cam = { escena: null, pintados: 0, negar: !!plan.negar };
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  let g2 = null;
  function pintar() {
    if (!g2) g2 = cv.getContext('2d');
    const E = window.__cam.escena, t = performance.now() / 1000;
    if (E && window.SemaforoSim && !plan.sinArbol) g2.putImageData(new ImageData(SemaforoSim.pintar(E, t), W, H), 0, 0);
    else { g2.fillStyle = '#6f7378'; g2.fillRect(0, 0, W, H); g2.fillStyle = '#50545a'; for (let x = 0; x < W; x += 40) g2.fillRect(x, 200 + (x % 80 ? 0 : 6), 20, 40); }
    window.__cam.pintados++;
  }
  const md = navigator.mediaDevices;
  md.getUserMedia = async () => {
    if (window.__cam.negar) { const e = new Error('negado'); e.name = 'NotAllowedError'; throw e; }
    pintar();
    if (!window.__cam.timer) window.__cam.timer = setInterval(pintar, 16);
    return cv.captureStream(60);
  };
  md.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'falsa', groupId: 'g', label: 'Cámara trasera' }];
  function armarEscena(sim, t0) {
    const v = sim.verdad, T0 = t0 / 1000;
    window.__cam.escena = SemaforoSim.escena(Object.assign({}, SemaforoSim.condicion('dia'), {
      tipo: plan.tipo || 'pro', carril: 'izq', w: W, h: H, orig: [W, H], zona: [0, 0, W, H], centro: [W / 2, H / 2],
      t_stage_off: T0 + v.t_ro_abs, rt_s: plan.rt_s || 0.35, cabeceo: { t0: T0 + v.t_arranque }, vibracion: { amp_px: 0.8, f_hz: 23 },
      otro: { desfase_s: 0.2, presente: true }, seed: 11 }));
    window.__cam.verdad = { stage_off: T0 + v.t_ro_abs, rt_s: plan.rt_s || 0.35, tipo: plan.tipo || 'pro' };
  }
  const geo = {
    watchPosition(okf) {
      const sim = window.DragCore.simularSesion({ gps_hz: 1, lag_gps: 0.3, acc_hz: 60, seed: 4242 });
      window.__mock.sim = sim; window.__mock.started = true;
      const t0 = performance.now(); window.__mock.t0 = t0;
      armarEscena(sim, t0);
      let ig = 0, ia = 0;
      setInterval(() => {
        const ts = (performance.now() - t0) / 1000;
        while (ig < sim.gps.t.length && sim.gps.t[ig] <= ts) {
          const fixEpoch = performance.timeOrigin + t0 + sim.gps.t[ig] * 1000;
          okf({ coords: { latitude: sim.gps.lat[ig], longitude: sim.gps.lon[ig], accuracy: sim.gps.hacc[ig], speed: sim.gps.v[ig] }, timestamp: fixEpoch });
          ig++;
        }
      }, 50);
      setInterval(() => {
        const ts = (performance.now() - t0) / 1000;
        while (ia < sim.acc.t.length && sim.acc.t[ia] <= ts) {
          const r = window.__cam.escena ? SemaforoSim.rotacion(window.__cam.escena, performance.now() / 1000) : { a: 0, b: 0, g: 0 };
          window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: sim.acc.ax[ia], y: sim.acc.ay[ia], z: sim.acc.az[ia] },
            rotationRate: { alpha: r.a, beta: r.b, gamma: r.g }, interval: 16 }));
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
# zona del árbol (640×360, centro 320,181): la que guardaría "Apuntar"
ZONA = [0.5 - 0.0625, 181 / 360 - 0.1735, 0.125, 0.347]
AJUSTES = {'cam': True, 'cam_zona': {'izq': ZONA, 'der': ZONA}, 'cam_orig': [640, 360], 'cam_carril': 'izq', 'fondo': 'ninguno'}

# Instantánea de lo que se ve durante la sesión armada (sin el chip Cám, que solo dice si llegan cuadros)
OBS = r"""
(() => {
  window.__fotos = new Set(); window.__analizarAntes = null; window.__videoMal = 0; window.__alCuadro = 0;
  const foto = () => {
    const d = window.__dragtrim, f = d && d.ses.fase;
    if (f !== 'espera' && f !== 'corrida') return;
    const m = document.getElementById('medirSesion');
    const chips = [...document.querySelectorAll('.sensors .chip')].filter((c) => c.id !== 'chipCam').map((c) => c.id + ':' + c.className).join(' ');
    window.__fotos.add((m ? m.innerText : '') + ' | ' + chips + ' | ' + document.body.className);
    if (window.Semaforo) window.__analizarAntes = Semaforo._llamadas.analizar + Semaforo._llamadas.prueba + Semaforo._llamadas.calidad;
    const v = document.getElementById('camVideo');
    if (v) { const cs = getComputedStyle(v); if (parseFloat(cs.width) > 4 || parseFloat(cs.opacity) > 0.05 || cs.display === 'none') window.__videoMal++; }
    if (d.ses.lector && d.ses.lector.alCuadro) window.__alCuadro++;
  };
  const empezar = () => new MutationObserver(foto).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
  if (document.documentElement) empezar(); else document.addEventListener('readystatechange', empezar, { once: true });
  setInterval(foto, 200);
})();
"""

def sesion(b, plan, viewport=None, carril='izq'):
    """Una sesión 'real' con cámara: activa sensores, arma por carril y espera el resultado. Devuelve (ctx, pg, errores)."""
    ctx = b.new_context(viewport=viewport or {'width': 390, 'height': 844}, color_scheme='dark', locale='es-MX', accept_downloads=True)
    ctx.add_init_script(f"window.__plan = {json.dumps(plan)}; localStorage.setItem('dragtrim.settings', {json.dumps(json.dumps(AJUSTES))});")
    ctx.add_init_script(MOCK); ctx.add_init_script(OBS)
    pg = ctx.new_page(); errores = []
    pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
    pg.goto(URL); pg.wait_for_timeout(500)
    pg.click('#btnSensores'); pg.wait_for_timeout(3000)
    pg.click('#btnArmarIzq' if carril == 'izq' else '#btnArmarDer')
    t0 = time.time(); paro = None
    while time.time() - t0 < 90:
        f = pg.evaluate('window.__dragtrim.ses.fase')
        if f == 'corrida' and paro is None:
            pg.wait_for_timeout(300)
            paro = pg.evaluate('!!(window.__dragtrim.ses.lector && window.__dragtrim.ses.lector.activo)')
        if f == 'resultado': break
        pg.wait_for_timeout(150)
    return ctx, pg, errores, paro

with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])

    # ---------------- A: reacción medida y neutralidad
    ctx, pg, errores, paro = sesion(b, {'rt_s': 0.35, 'tipo': 'pro'})
    ok(pg.evaluate('window.__dragtrim.ses.fase') == 'resultado', 'A: la corrida con cámara termina')
    run = pg.evaluate('window.__dragtrim.ses.ultimoRun')
    cam = run.get('cam') or {}
    rt = cam.get('rt') or {}
    ok(rt.get('ok') is True, f"A: se leyó el semáforo (motivo {cam.get('motivo')}, {cam.get('error')})")
    if rt.get('ok'):
        ok(rt['tipo'] == 'pro', f"A: árbol Pro ({rt['tipo']})")
        ok(abs(rt['rt_verde'] - 0.35) <= 0.03, f"A: reacción desde la verde {rt['rt_verde']:.3f} (real 0.350, método {rt['metodo']})")
        ok(abs(rt['rt_boleta'] - 0.75) <= 0.03, f"A: reacción boleta {rt['rt_boleta']:.3f} (real 0.750)")
    ok(paro is False, 'A: la cámara se apaga en cuanto se confirma el arranque')
    ok(pg.evaluate('window.__analizarAntes') == 0, f"A: nada se analiza mientras la medición está armada ({pg.evaluate('window.__analizarAntes')})")
    ok(pg.evaluate('window.__videoMal') == 0, 'A: el video nunca se ve durante la corrida (≤ 4 px, opacidad ≤ 0.05)')
    ok(pg.evaluate('window.__alCuadro') == 0, 'A: el lector no mira los cuadros durante la medición')
    ok(pg.evaluate('window.__vibra') == 0, 'A: sin vibración')
    slip = pg.locator('.slip').inner_text()
    ok('R/T' in slip, 'A: la boleta trae R/T')
    txt = pg.locator('#vResultado').inner_text()
    ok('Semáforo' in txt and 'Reacción' in txt, 'A: resultado con reacción y sección Semáforo')
    pg.wait_for_timeout(800)
    ok(pg.evaluate("!document.getElementById('camTira').hidden"), 'A: se ve la tira de cuadros de revisión')
    pg.screenshot(path=str(CAPT / 'camara_resultado.png'), full_page=True)
    fotosA = set(pg.evaluate('[...window.__fotos]'))
    # ---------------- D: historial, recalcular, cambiar carril, exportar
    rt0 = rt.get('rt_boleta')
    pg.fill('#inRollout', '0') if pg.locator('#inRollout').is_visible() else None
    pg.evaluate("() => { const d = window.__dragtrim; d.S.rollout_ft = 0; }")
    pg.click('#rRecalc'); pg.wait_for_timeout(1500)
    r2 = pg.evaluate('window.__dragtrim.ses.ultimoRun.cam.rt')
    if rt.get('metodo') == 'camara': ok(abs(r2['rt_boleta'] - rt0) < 1e-6, f"D: recalcular con rollout 0 no cambia la reacción de cámara ({r2['rt_boleta']:.4f})")
    pg.evaluate("() => { window.__dragtrim.S.rollout_ft = 1; }")
    sA = pg.evaluate('window.__dragtrim.ses.ultimoRun.cam.sec')
    pg.click('#rCamCarril'); pg.wait_for_timeout(1500)
    r3 = pg.evaluate('window.__dragtrim.ses.ultimoRun.cam')
    # la otra columna va 0.2 s después (handicap simulado); su stage es el del otro auto, que aquí sale en roja
    # (con roja, la verde de ese carril no se prende): se compara el último ámbar
    dv = (r3['sec'] or {}).get('t_ambar_ref', float('nan')) - sA['t_ambar_ref']
    ok(r3['cfg']['carril'] == 'der' and abs(dv - 0.2) <= 0.034, f"D: cambiar a carril derecho lee la otra columna (su último ámbar llega {dv:.3f} s después; simulado 0.200)")
    pg.click('#rCamCarril'); pg.wait_for_timeout(1200)
    r4 = pg.evaluate('window.__dragtrim.ses.ultimoRun.cam')
    ok(r4['cfg']['carril'] == 'izq' and r4['rt'] and abs(r4['rt']['rt_boleta'] - rt0) < 1e-6, 'D: volver al carril izquierdo da la misma reacción')
    # boleta para calibrar
    pg.locator('#rCamBoleta summary').click()
    pg.fill('#bRT', '0.760'); pg.fill('#b60', '2.650'); pg.click('#bGuardar'); pg.wait_for_timeout(600)
    ok(abs(pg.evaluate('window.__dragtrim.ses.ultimoRun.boleta.rt') - 0.76) < 1e-9, 'D: la boleta se guarda con la corrida')
    with pg.expect_download() as dl:
        pg.click('#rExport')
    z = zipfile.ZipFile(dl.value.path())
    nombres = z.namelist()
    tiene = lambda pre: any(n.startswith(pre) for n in nombres)
    ok(all(tiene(x) for x in ['drag_raw_gps_', 'drag_raw_acc_', 'drag_raw_gyro_', 'drag_raw_cam_', 'drag_raw_cam_meta_', 'drag_cam_clip_', 'drag_cam_tira_']), f"D: el zip trae los archivos de la cámara {sorted(nombres)}")
    camcsv = next((n for n in nombres if n.startswith('drag_raw_cam_') and n.endswith('.csv')), None)
    if camcsv:
        lineas = z.read(camcsv).decode().splitlines()
        ok(lineas[0].startswith('t_s,') and len(lineas) > 100, f"D: CSV de la cámara con cabecera y {len(lineas) - 1} filas")
    meta = json.loads(z.read(next(n for n in nombres if n.startswith('drag_raw_meta_'))).decode())
    ok('semaforo' in meta and abs(meta['semaforo']['rt_boleta'] - rt0) < 0.05, f"D: el meta trae la reacción ({meta.get('semaforo')})")
    cm = json.loads(z.read(next(n for n in nombres if n.startswith('drag_raw_cam_meta_'))).decode())
    ok(cm.get('boleta', {}).get('rt') == 0.76 and cm.get('clip', {}).get('n', 0) > 10, f"D: el meta de la cámara trae la boleta y el clip ({cm.get('clip', {}).get('n')} cuadros)")
    pg.click('#rSalir'); pg.wait_for_timeout(400)
    pg.click('nav.tabs button[data-view="vHistorial"]'); pg.wait_for_timeout(600)
    ok('RT ' in pg.locator('#histList').inner_text(), 'D: el historial muestra la reacción')
    pg.click('nav.tabs button[data-view="vAjustes"]'); pg.wait_for_timeout(600)
    ok('boleta' in pg.locator('#ajCamCal').inner_text(), 'D: Ajustes muestra la calibración con boletas')
    ok(not errores, f'A/D: sin errores {errores[:3]}')
    ctx.close()

    # ---------------- A (neutralidad): misma sesión sin árbol → lo que se vio en pantalla es idéntico
    ctx, pg, errores, _ = sesion(b, {'sinArbol': True})
    fotosB = set(pg.evaluate('[...window.__fotos]'))
    ok(len(fotosA) >= 5, f'A: el observador registró lo que se vio durante la sesión ({len(fotosA)} vistas)')
    ok(fotosA == fotosB, f'A: pantalla idéntica con y sin árbol ({len(fotosA)} vistas distintas; diferencias {len(fotosA ^ fotosB)})')
    if fotosA != fotosB:
        for x in list(fotosA ^ fotosB)[:4]: print('   dif:', x[:200])
    run = pg.evaluate('window.__dragtrim.ses.ultimoRun')
    ok(run['cam'] and not (run['cam'].get('rt') or {}).get('ok') and run['cam'].get('motivo') in ('sin_arbol', 'sin_secuencia', 'fuera_de_zona'),
       f"A: sin árbol no inventa una reacción (motivo {run['cam'] and run['cam'].get('motivo')})")
    ok('Sin lectura del semáforo' in pg.locator('#vResultado').inner_text(), 'A: dice que no hubo lectura')
    ok(not errores, f'A: sin errores {errores[:3]}')
    ctx.close()

    # ---------------- C: sin permiso de cámara
    ctx, pg, errores, _ = sesion(b, {'negar': True})
    run = pg.evaluate('window.__dragtrim.ses.ultimoRun')
    ok(run['ok'] is True and run['cam'] and run['cam'].get('motivo') == 'sin_permiso', f"C: sin permiso se mide igual ({run['cam'] and run['cam'].get('motivo')})")
    ok('no hubo permiso de cámara' in pg.locator('#vResultado').inner_text(), 'C: mensaje del permiso en español')
    ok(not errores, f'C: sin errores {errores[:3]}')
    ctx.close()

    # ---------------- E: migración de la base v1 (sin camdatos) → v2
    ctx = b.new_context(viewport={'width': 390, 'height': 844}); pg = ctx.new_page(); errores = []
    pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.goto(f'http://127.0.0.1:{PORT}/migr.html'); pg.evaluate('window.listo')
    pg.goto(URL); pg.wait_for_timeout(600)
    pg.click('nav.tabs button[data-view="vHistorial"]'); pg.wait_for_timeout(800)
    ok(pg.locator('#histList li').count() == 2, f"E: las 2 corridas viejas siguen ({pg.locator('#histList li').count()})")
    info = pg.evaluate("""() => new Promise((res) => { const rq = indexedDB.open('dragtrim'); rq.onsuccess = () => { const db = rq.result; res({ v: db.version, stores: [...db.objectStoreNames] }); db.close(); }; })""")
    ok(info['v'] == 2 and 'camdatos' in info['stores'] and 'runs' in info['stores'], f'E: base v2 con camdatos {info}')
    pg.evaluate("() => window.__dragtrim.DB.putCam({ id: 1700000000000, rasgos: null, clip: null })")
    pg.locator('#histList li button').last.click(); pg.wait_for_timeout(500)
    pg.on('dialog', lambda d: d.accept())
    pg.click('#rBorrar'); pg.wait_for_timeout(800)
    quedan = pg.evaluate("() => window.__dragtrim.DB.getCam(1700000000000)")
    ok(quedan is None and pg.locator('#histList li').count() == 1, 'E: borrar una corrida borra también sus datos de cámara')
    ok(not errores, f'E: sin errores {errores[:3]}')
    ctx.close()

    # ---------------- E2: otra pestaña con la versión anterior (base v1) abierta detiene la actualización a v2
    ctx = b.new_context(viewport={'width': 390, 'height': 844}); vieja = ctx.new_page(); errores = []
    vieja.goto(f'http://127.0.0.1:{PORT}/migr.html'); vieja.evaluate('window.listo')
    vieja.evaluate("""() => new Promise((res) => { const rq = indexedDB.open('dragtrim', 1); rq.onsuccess = () => { window.__db = rq.result; res(true); }; })""")
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errores.append(str(e)))
    t0 = time.time(); pg.goto(URL); pg.wait_for_timeout(400)
    pg.click('nav.tabs button[data-view="vHistorial"]'); pg.wait_for_timeout(3500)
    txt = pg.locator('#histEmpty').inner_text() if pg.locator('#histEmpty').is_visible() else ''
    ok('sigue guardado' in txt and pg.locator('#histList li').count() == 0, f'E2: con la base bloqueada el Historial lo explica ({txt[:60]}…)')
    pg.evaluate("""() => window.__dragtrim.DB.put({ id: 1700000200000, fecha: new Date(1700000200000).toISOString(), sello: 'nueva', demo: true, app: 'beta 0.6',
      cfg: { distancia_final: 402.336, rollout_ft: 1 }, ok: false, mensaje: 'en memoria', avisos: [], raw: { gps: { t: [] }, acc: { t: [] } } })""")
    vieja.close(); pg.wait_for_timeout(1500)
    n = pg.locator('#histList li').count()
    ok(n == 3 and not pg.locator('#histEmpty').is_visible(), f'E2: al cerrarse la pestaña vieja aparecen las 2 corridas viejas y la nueva ({n})')
    info = pg.evaluate("""() => new Promise((res) => { const rq = indexedDB.open('dragtrim'); rq.onsuccess = () => { const db = rq.result, t = db.transaction('runs'), g = t.objectStore('runs').count();
      g.onsuccess = () => { res({ v: db.version, n: g.result }); db.close(); }; }; })""")
    ok(info['v'] == 2 and info['n'] == 3, f'E2: la corrida hecha mientras estaba bloqueada quedó guardada en la base {info}')
    ok(not errores, f'E2: sin errores {errores[:3]}')
    ctx.close()

    # ---------------- F: corrida simulada con la cámara prendida
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, color_scheme='dark')
    ctx.add_init_script(f"localStorage.setItem('dragtrim.settings', {json.dumps(json.dumps(AJUSTES))});")
    pg = ctx.new_page(); errores = []
    pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(500)
    ok(pg.locator('#camOpciones').is_visible() and pg.locator('#chipCam').is_visible(), 'F: con la cámara prendida se ven sus opciones y el chip Cám')
    pg.click('#btnDemo')
    pg.wait_for_selector('.slip', timeout=60000); pg.wait_for_timeout(500)
    run = pg.evaluate('window.__dragtrim.ses.ultimoRun')
    rt = (run.get('cam') or {}).get('rt') or {}
    sim = ((run.get('cam') or {}).get('camara') or {}).get('simulada')
    if rt.get('ok') and sim:
        real = sim['rt_s'] + (0.5 if sim['tipo'] == 'full' else 0.4)
        ok(abs(rt['rt_boleta'] - real) <= 0.02, f"F: corrida simulada: reacción {rt['rt_boleta']:.3f} contra la real {real:.3f}")
    else:
        ok(False, f"F: la corrida simulada no leyó el árbol ({(run.get('cam') or {}).get('motivo')})")
    ok('Árbol simulado' in pg.locator('#vResultado').inner_text(), 'F: dice que el árbol fue simulado')
    pg.screenshot(path=str(CAPT / 'camara_demo_resultado.png'), full_page=True)
    ok(not errores, f'F: sin errores {errores[:3]}')
    # Apuntar desde Medir (y se cierra sin cambiar nada)
    pg.click('#rSalir'); pg.wait_for_timeout(400)
    pg.click('#btnApuntar'); pg.wait_for_timeout(1500)
    ok(pg.locator('#camApuntar').is_visible(), 'F: "Apuntar la cámara" abre su pantalla')
    pg.click('.cam-x'); pg.wait_for_timeout(300)
    ok(pg.locator('#camApuntar').count() == 0, 'F: Apuntar se cierra')
    ctx.close()

    # ---------------- G: diseño a 320 px y en horizontal
    for vp, nombre in [({'width': 320, 'height': 640}, '320'), ({'width': 844, 'height': 390}, 'horizontal')]:
        ctx = b.new_context(viewport=vp, color_scheme='dark')
        ctx.add_init_script(f"localStorage.setItem('dragtrim.settings', {json.dumps(json.dumps(AJUSTES))});")
        pg = ctx.new_page(); pg.goto(URL); pg.wait_for_timeout(600)
        ok(pg.evaluate('document.documentElement.scrollWidth') <= vp['width'], f'G: Medir sin scroll horizontal a {nombre}')
        top = pg.locator('header.top').bounding_box()
        # el logo mide 80 px desde 0.6.4 (+ 18 de margen = 98): con el chip Cám no debe crecer a otro renglón
        ok(top['height'] < 105, f"G: encabezado con el chip Cám cabe ({top['height']:.0f} px a {nombre})")
        pg.screenshot(path=str(CAPT / f'camara_medir_{nombre}.png'), full_page=True)
        ctx.close()

    # ---------------- I: sin ?camdev (lo publicado): la sección es solo una tarjeta "en desarrollo" y la cámara no se prende
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, color_scheme='dark')
    ctx.add_init_script(f"localStorage.setItem('dragtrim.settings', {json.dumps(json.dumps(AJUSTES))});")
    pg = ctx.new_page(); errores = []; pg.on('pageerror', lambda e: errores.append(str(e)))
    pg.goto(URL_NORMAL); pg.wait_for_timeout(600)
    vis = pg.evaluate("['#campoCam', '#ajCam', '#chipCam'].map((q) => !!document.querySelector(q).offsetParent || !document.querySelector(q).hidden)")
    medir = pg.locator('#vMedir').inner_text().lower()
    ok(vis == [False, False, False] and 'semáforo real' not in medir and 'cámara' not in medir, f'I: sin ?camdev no queda nada del semáforo en Medir {vis}')
    pg.click('#btnDemo'); pg.wait_for_selector('.slip', timeout=60000); pg.wait_for_timeout(400)
    run = pg.evaluate('window.__dragtrim.ses.ultimoRun')
    ok(not run.get('cam') and 'Semáforo' not in pg.locator('#vResultado').inner_text(), 'I: la corrida simulada sale sin semáforo aunque estuviera prendido')
    ok(not errores, f'I: sin errores {errores[:3]}')
    ctx.close()

    # ---------------- H: árbol Pro .400 / Full .500 y la marca de los selectores sobre el botón elegido
    MARCA = r"""() => [...document.querySelectorAll('.seg')].filter(s => s.offsetParent).map(s => {
      const bs = [...s.querySelectorAll(':scope > button')], sel = bs.findIndex(b => b.getAttribute('aria-checked') === 'true');
      if (sel < 0) return { id: s.id, err: 0 };
      const cs = getComputedStyle(s, '::before'), r = s.getBoundingClientRect(), m = new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform);
      const x = r.left + s.clientLeft + parseFloat(cs.left) + m.m41, w = parseFloat(cs.width), bb = bs[sel].getBoundingClientRect();
      return { id: s.id, err: Math.max(Math.abs(x - bb.left), Math.abs(x + w - bb.right)) }; })"""
    for w in (320, 390):
        ctx = b.new_context(viewport={'width': w, 'height': 800}, color_scheme='dark')
        ctx.add_init_script(f"localStorage.setItem('dragtrim.settings', {json.dumps(json.dumps(dict(AJUSTES, cam_arbol='auto', fondo='combinado_rojo')))});"
                            "localStorage.setItem('dragtrim.practica.cfg', JSON.stringify({ arbol: 'full' }));")
        pg = ctx.new_page(); errores = []; pg.on('pageerror', lambda e: errores.append(str(e)))
        pg.goto(URL); pg.wait_for_timeout(700)
        if w == 320:
            txt = pg.locator('#segCamArbol button').all_inner_texts()
            ok(txt == ['Pro .400', 'Full .500'], f'H: el árbol solo ofrece Pro .400 y Full .500 {txt}')
            sel = pg.locator('#segCamArbol button[aria-checked="true"]').inner_text()
            guard = pg.evaluate("JSON.parse(localStorage.getItem('dragtrim.settings')).cam_arbol")
            ok(sel == 'Full .500' and guard == 'full', f'H: quien tenía "Automático" toma el árbol de Práctica ({sel}, guardado {guard})')
        malos = []
        for v in ['pro', 'full', 'pro', 'full']:
            pg.click(f'#segCamArbol button[data-v="{v}"]'); pg.wait_for_timeout(450)
            malos += [f"{x['id']} {x['err']:.1f}px" for x in pg.evaluate(MARCA) if x['err'] > 0.6]
        for vista in ['vPractica', 'vCalc', 'vAjustes']:
            pg.click(f'nav.tabs button[data-view="{vista}"]'); pg.wait_for_timeout(450)
            malos += [f"{vista} {x['id']} {x['err']:.1f}px" for x in pg.evaluate(MARCA) if x['err'] > 0.6]
        pg.click('nav.tabs button[data-view="vCalc"]'); pg.wait_for_timeout(300)
        for v in ['atmos', 'nitro', 'turbo', 'atmos']:   # "Atmosférico" hace ese botón más ancho
            pg.click(f'#segCMotor button[data-v="{v}"]'); pg.wait_for_timeout(450)
            malos += [f"segCMotor({v}) {x['err']:.1f}px" for x in pg.evaluate(MARCA) if x['id'] == 'segCMotor' and x['err'] > 0.6]
        ok(not malos, f'H: a {w} px la marca de cada selector cae sobre el botón elegido {malos[:4]}')
        ok(not errores, f'H: sin errores a {w} px {errores[:3]}')
        ctx.close()
    b.close()
srv.shutdown()
shutil.rmtree(raiz, ignore_errors=True)
print(f'\n{len(oks)} bien, {len(fallas)} fallas')
print('FALLAS: ' + str(len(fallas)))
sys.exit(1 if fallas else 0)
