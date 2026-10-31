# Prueba de Race 1 vs 1 (0.7) en Chromium:
#  A. rival simulado: Race 1 vs 1 abre la carrera, sala, "Listo", pre-stage → stage → árbol, la medición sigue sola y sale
#     la boleta de los dos carriles; la reacción medida se parece a la inyectada; se guarda en el historial con run.race.
#  B. luz roja (reacción negativa): ese carril pierde.
#  C. dos "teléfonos" (dos contextos) emparejados con los códigos en texto por WebRTC ("¿Sin señal? Conectar con QR"), con autos simulados (?simsens):
#     el que crea elige Full y 1/8, los dos tocan Listo, las dos verdes salen casi juntas, la boleta es la misma en los dos
#     y el marcador cuenta; al cerrar uno, el otro ve que se perdió la conexión.
#  D. el invitado lee el QR del anfitrión con la cámara (video falso con ese QR).
# Uso: python3 carrera_test.py -> capturas/carrera_*.png; sale con código 1 si algo falla.
import json, os, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright

AQUI = os.path.dirname(os.path.abspath(__file__))
DIST = os.environ.get('DIST_DRAG') or os.path.join(AQUI, '..', 'app', 'dist')   # DIST_DRAG: probar otro armado
SH = os.path.join(AQUI, 'capturas', '')
os.makedirs(SH, exist_ok=True)
PUERTO = 8798
URL = f'http://localhost:{PUERTO}/index.html'
AJUSTES = {'fondo': 'gallos', 'tema': 'dark', 'rollout_ft': 1}
ARGS_MEDIOS = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']

fallas = []
def chk(cond, txt):
    print(('ok    ' if cond else 'FALLA ') + txt, flush=True)
    if not cond: fallas.append(txt)

def contexto(b, ajustes=None, ancho=393, alto=852):
    ctx = b.new_context(viewport={'width': ancho, 'height': alto}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        color_scheme='dark', permissions=['camera'])
    ctx.add_init_script(f"localStorage.setItem('dragtrim.settings', JSON.stringify({json.dumps(ajustes or AJUSTES)})); localStorage.setItem('dragtrim.guiaOculta', 'true');")
    return ctx

def pagina(ctx, url=URL):
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    pg.goto(url); pg.wait_for_timeout(400)
    return pg, errs

visible = lambda pg, sel: pg.evaluate(f"(() => {{ const e = document.querySelector('{sel}'); return !!e && !e.hidden && e.getClientRects().length > 0; }})()")

def esperar(pg, expr, ms=15000):
    try:
        pg.wait_for_function(expr, timeout=ms); return True
    except Exception:
        return False

def vigilar_arbol(pg, ms=9000):
    """Anota cuándo se prende cada luz del carril propio (ms desde que se tocó Listo, reloj de la página)."""
    pg.evaluate("""() => { window.__luces = {}; const t0 = performance.now();
        const ver = () => { for (const id of ['pre1', 'stg1', 'a0', 'a2', 'g']) {
              const e = document.getElementById('rc_izq_' + id) || document.getElementById('rc_der_' + id);
              if (e && e.classList.contains('on') && window.__luces[id] === undefined) window.__luces[id] = performance.now() - t0; }
            if (performance.now() - t0 < 12000) requestAnimationFrame(ver); };
        requestAnimationFrame(ver); }""")

def boleta(pg):
    return pg.evaluate("""(() => { const s = document.querySelector('.rc-slip'); if (!s) return null;
        const filas = [...s.querySelectorAll('tr')].map(tr => [...tr.children].map(td => td.textContent.trim()));
        return { filas, ganador: (document.querySelector('.rc-ganador') || {}).textContent || '', wins: [...s.querySelectorAll('.rc-win')].length }; })()""")

def rt_de(b, col):
    """R/T de la boleta en la columna 1 (izq) o 2 (der)."""
    for f in b['filas']:
        if f and f[0].upper().startswith('R/T'): return f[col]
    return None

def ganador_esperado(bo, perfecta, et):
    """Ganador según las reglas de pista con los números de la boleta: roja pierde; si no, menor reacción (desde la
    verde) + ET a la meta."""
    fila = lambda e: next((f for f in bo['filas'] if f and f[0] == e), None)
    rt, t = fila('R/T'), fila(et)
    lados = {}
    for k, col in (('izq', 1), ('der', 2)):
        txt = rt[col].upper()
        try: r = float(txt.split()[-1]) - perfecta
        except Exception: r = float('nan')
        try: e = float(t[col])
        except Exception: e = float('nan')
        lados[k] = ('ROJA' in txt, r + e)
    if lados['izq'][0] != lados['der'][0]: return 'der' if lados['izq'][0] else 'izq'
    return 'izq' if lados['izq'][1] < lados['der'][1] else 'der'

def correr_simulado(b, rt_mio, rt_rival, nombre):
    ctx = contexto(b)
    pg, errs = pagina(ctx)
    pg.click('#atRace'); pg.wait_for_timeout(300)
    chk(visible(pg, '#rc') and visible(pg, '#rcInicio'), f'{nombre}. "Race 1 vs 1" abre la carrera con Crear / Unirme / Rival simulado')
    pg.screenshot(path=SH + 'carrera_inicio.png')
    pg.click('#rcSimulado')
    chk(esperar(pg, "document.querySelector('#rcCarril_der .rc-est') && document.querySelector('#rcCarril_der .rc-est').textContent.includes('Listo')", 5000),
        f'{nombre}. sala: el rival simulado aparece listo')
    chk(visible(pg, '#rcListo'), f'{nombre}. sin sensores, tu auto es simulado y puedes tocar Listo')
    pg.screenshot(path=SH + f'carrera_sala_{nombre}.png')
    pg.evaluate(f"window.__carreraRT = {rt_mio}; window.__rivalRT = {rt_rival};")
    vigilar_arbol(pg)
    pg.click('#rcListo')
    chk(esperar(pg, "!document.getElementById('rcArbol').hidden", 4000), f'{nombre}. con los dos listos aparece el árbol')
    pg.wait_for_timeout(1700); pg.screenshot(path=SH + f'carrera_arbol_{nombre}.png')
    chk(esperar(pg, "document.getElementById('rc').hidden", 9000), f'{nombre}. después de la verde se quita el árbol (pantalla neutral)')
    L = pg.evaluate('window.__luces')
    orden = all(k in L for k in ('pre1', 'stg1', 'a0', 'g')) and L['pre1'] < L['stg1'] < L['a0'] <= L['g']
    chk(orden and 1300 <= L['pre1'] <= 1800 and 900 <= L['stg1'] - L['pre1'] <= 1150 and 950 <= L['a0'] - L['stg1'] <= 2600,
        f'{nombre}. pre-stage (~1.5 s), stage (+1 s), ámbar (+1–2.5 s) y verde en orden ({ {k: round(v) for k, v in L.items()} })')
    chk(abs((L['g'] - L['a0']) - 400) < 40, f'{nombre}. árbol Pro: la verde 0.4 s después de los ámbar ({round(L["g"] - L["a0"])} ms)')
    chk(esperar(pg, "!!document.querySelector('.rc-slip')", 45000), f'{nombre}. al pasar la meta sale la boleta de la carrera')
    chk(esperar(pg, "!document.querySelector('.rc-ganador').classList.contains('espera')", 30000), f'{nombre}. llega el resultado del rival y se decide')
    pg.wait_for_timeout(1500)   # la boleta se "imprime" con una animación
    bo = boleta(pg)
    pg.screenshot(path=SH + f'carrera_boleta_{nombre}.png', full_page=True)
    return ctx, pg, errs, bo

def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PUERTO), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(args=ARGS_MEDIOS)
            # ---------------- A. rival simulado, reacción conocida
            ctx, pg, errs, bo = correr_simulado(b, 0.150, 0.300, 'A')
            rt = rt_de(bo, 1) if bo else None
            print('   boleta A:', bo)
            chk(bo is not None and rt is not None, f'A. la boleta trae R/T del carril izquierdo ({rt})')
            try: rtv = float(rt.split()[-1].replace('+', ''))
            except Exception: rtv = float('nan')
            chk(abs(rtv - 0.550) < 0.035, f'A. tu reacción ~0.150 desde la verde = 0.550 en boleta Pro ({rtv})')
            g = ganador_esperado(bo, 0.4, '1/4')
            chk(('izquierdo' if g == 'izq' else 'derecho') in bo['ganador'].lower().split('gana')[-1] and bo['wins'] == 1,
                f'A. gana quien llega primero a la meta (reacción + ET): {g} → "{bo["ganador"]}"')
            corridas = pg.evaluate("window.__dragtrim.DB.todos().then(rs => rs.map(r => r.race ? { rival: !!r.race.rival, carril: r.race.carril, ganador: r.race.ganador && r.race.ganador.ganador } : null))")
            chk(corridas and corridas[0] and corridas[0]['rival'] and corridas[0]['carril'] == 'izq', f'A. la corrida se guardó con los datos de la carrera ({corridas[:1]})')
            pg.click('#rcVerMia'); pg.wait_for_timeout(400)
            chk(visible(pg, '.rc-slip') and visible(pg, '#rVolverCarrera'), 'A. "Ver los detalles de mi corrida": la boleta de la carrera arriba y "Volver a la carrera"')
            pg.click('#rVolverCarrera'); pg.wait_for_timeout(400)
            chk(visible(pg, '#rcSala') and 'Marcador' in pg.inner_text('#rcMarcador'), f'A. "Volver a la carrera" regresa a la sala con el marcador ({pg.inner_text("#rcMarcador")})')
            pg.on('dialog', lambda d: d.accept())   # "¿Salir de la carrera?"
            pg.click('#rcSalir'); pg.wait_for_timeout(400)
            chk(not visible(pg, '#rc') and visible(pg, '#medirIdle'), 'A. "Salir" en la sala cierra la carrera y regresa a Medir')
            pg.click('.tabs button[data-view="vHistorial"]'); pg.wait_for_timeout(400)
            chk('Race 1 vs 1' in pg.inner_text('#histList'), 'A. el Historial marca la corrida como Race 1 vs 1')
            chk(not errs, 'A. sin errores: ' + '; '.join(errs))
            ctx.close()
            # ---------------- B. luz roja
            ctx, pg, errs, bo = correr_simulado(b, -0.040, 0.250, 'B')
            print('   boleta B:', bo)
            chk(bo is not None and 'derech' in bo['ganador'].lower(), f'B. con luz roja pierde el carril izquierdo: "{bo and bo["ganador"]}"')
            chk(bo is not None and any('ROJA' in (f[1] if len(f) > 1 else '').upper() for f in bo['filas']), 'B. la boleta marca la roja')
            chk(not errs, 'B. sin errores: ' + '; '.join(errs))
            ctx.close()
            # ---------------- E. cancelar ya corriendo y salir desde la boleta (Daniel, 31 oct: "Salir de la carrera" no hacía
            # nada, "Otra carrera" llevaba al menú y al salir de ahí volvía la boleta anterior)
            ctx = contexto(b); pg, errs = pagina(ctx)
            pg.on('dialog', lambda d: d.accept())
            EN_MEDIR = ("!document.getElementById('medirIdle').hidden && document.getElementById('vResultado').hidden"
                        " && !document.body.classList.contains('sesion') && document.getElementById('rc').hidden")
            def a_correr():
                pg.click('#atRace'); pg.click('#rcSimulado')
                esperar(pg, "document.querySelector('#rcCarril_der .rc-est').textContent.includes('Listo')", 5000)
                pg.evaluate("window.__carreraRT = 0.150; window.__rivalRT = 0.200;")
                pg.click('#rcListo')
                return esperar(pg, "document.getElementById('rc').hidden && !document.getElementById('medirSesion').hidden", 12000)
            chk(a_correr(), 'E. después de la verde queda la pantalla de la medición con "Cancelar"')
            pg.click('#btnCancelar')
            chk(esperar(pg, "!!document.querySelector('.rc-slip')", 5000), 'E. al cancelar ya corriendo sale la boleta de la carrera')
            pg.click('#rcSalirRes'); pg.wait_for_timeout(400)
            chk(pg.evaluate(EN_MEDIR), 'E. "Salir de la carrera" desde esa boleta regresa a Medir')
            pg.screenshot(path=SH + 'carrera_salir_boleta.png')
            chk(a_correr(), 'E. otra carrera con el rival simulado')
            pg.click('#btnCancelar')
            esperar(pg, "!!document.querySelector('.rc-slip')", 5000)
            pg.click('#rcOtra')
            chk(esperar(pg, "!document.getElementById('rcSala').hidden && !document.getElementById('rc').hidden", 3000), 'E. "Otra carrera" regresa a la sala')
            pg.click('#rcSalir'); pg.wait_for_timeout(400)
            chk(pg.evaluate(EN_MEDIR), 'E. "Salir" desde la sala regresa a Medir (sin la boleta anterior)')
            chk(not errs, 'E. sin errores: ' + '; '.join(errs))
            ctx.close()
            # ---------------- C. dos teléfonos por WebRTC (códigos en texto)
            cA = contexto(b); cB = contexto(b)
            A, eA = pagina(cA, URL + '?simsens'); B, eB = pagina(cB, URL + '?simsens')
            for pg in (A, B): pg.on('dialog', lambda d: d.accept())
            A.click('#atRace'); A.click('.rc-sinred summary'); A.click('#rcCrear')
            chk(esperar(A, "/^DT1o/i.test(window.__carrera.codigo())", 10000), 'C. el anfitrión arma su código (oferta)')
            oferta = A.evaluate('window.__carrera.codigo()')
            print(f'   largo del código de oferta: {len(oferta)}')
            A.screenshot(path=SH + 'carrera_qr_anfitrion.png')
            B.click('#atRace'); B.click('.rc-sinred summary'); B.click('#rcUnirme'); B.wait_for_timeout(300)
            B.click('#rcEscTexto'); B.fill('#rcCodOtro', oferta); B.click('#rcConectarTexto')
            chk(esperar(B, "/^DT1a/i.test(window.__carrera.codigo())", 10000), 'C. el invitado arma su respuesta')
            resp = B.evaluate('window.__carrera.codigo()')
            print(f'   largo del código de respuesta: {len(resp)}')
            A.click('#rcQrTexto'); A.fill('#rcCodOtro', resp); A.click('#rcConectarTexto')
            ok = esperar(A, "!document.getElementById('rcSala').hidden", 15000) and esperar(B, "!document.getElementById('rcSala').hidden", 15000)
            chk(ok, 'C. los dos llegan a la sala conectados')
            chk(esperar(B, "window.__carrera.R.E && window.__carrera.R.E.reloj && window.__carrera.R.E.reloj.listo", 8000), 'C. el invitado sincroniza su reloj')
            rel = B.evaluate("({ off: window.__carrera.R.E.reloj.offset_ms, err: window.__carrera.R.E.reloj.error_ms, oA: 0 })")
            oA, oB = A.evaluate('performance.timeOrigin'), B.evaluate('performance.timeOrigin')
            chk(abs(rel['off'] - (oB - oA)) < 5, f'C. la sincronía da el desfase real de los relojes ({rel["off"]:.1f} contra {oB - oA:.1f} ms)')
            # el anfitrión elige Full y 1/8; el invitado lo ve
            A.click('#segRcArbol button[data-v="full"]'); A.click('#segRcDist button[data-v="201.168"]')
            chk(esperar(B, "document.querySelector('#segRcArbol button[data-v=\"full\"]').getAttribute('aria-checked') === 'true' && document.querySelector('#segRcDist button[data-v=\"201.168\"]').getAttribute('aria-checked') === 'true'", 5000),
                'C. el invitado ve el árbol Full y 1/8 que eligió el anfitrión')
            chk(B.evaluate("document.querySelector('#segRcArbol button').disabled"), 'C. el invitado no puede cambiar el árbol')
            A.screenshot(path=SH + 'carrera_sala_anfitrion.png'); B.screenshot(path=SH + 'carrera_sala_invitado.png')
            A.evaluate('window.__carreraRT = 0.120'); B.evaluate('window.__carreraRT = 0.260')
            A.click('#rcListo'); A.wait_for_timeout(500)
            chk(not A.evaluate("!document.getElementById('rcArbol').hidden"), 'C. con un solo carril listo el árbol no baja')
            B.click('#rcListo')
            ok = esperar(A, "!document.getElementById('rcArbol').hidden", 5000) and esperar(B, "!document.getElementById('rcArbol').hidden", 5000)
            chk(ok, 'C. con los dos listos baja el árbol en los dos')
            chk(esperar(A, "Number.isFinite(window.__carrera.R.tVerde)", 9000) and esperar(B, "Number.isFinite(window.__carrera.R.tVerde)", 9000), 'C. los dos pintan la verde')
            gA = A.evaluate('performance.timeOrigin + window.__carrera.R.tVerde'); gB = B.evaluate('performance.timeOrigin + window.__carrera.R.tVerde')
            chk(abs(gA - gB) < 25, f'C. las dos verdes salen casi juntas ({gA - gB:+.1f} ms)')
            chk(A.evaluate("window.__carrera.R.prog.arbol") == 'full' and B.evaluate("window.__carrera.R.prog.arbol") == 'full', 'C. los dos corren árbol Full')
            ok = esperar(A, "!!document.querySelector('.rc-slip') && !document.querySelector('.rc-ganador').classList.contains('espera')", 45000) \
                and esperar(B, "!!document.querySelector('.rc-slip') && !document.querySelector('.rc-ganador').classList.contains('espera')", 45000)
            chk(ok, 'C. los dos teléfonos muestran la boleta completa')
            bA, bB = boleta(A), boleta(B)
            print('   boleta anfitrión:', bA); print('   boleta invitado:', bB)
            chk(bA and bB and bA['ganador'] == bB['ganador'] and bA['filas'][1:] == bB['filas'][1:], 'C. la boleta y el ganador son los mismos en los dos teléfonos')
            g = ganador_esperado(bA, 0.5, '1/8') if bA else None
            chk(bA and ('izquierdo' if g == 'izq' else 'derecho') in bA['ganador'].lower().split('gana')[-1],
                f'C. gana quien llega primero a la meta en 1/8 (reacción + ET): {g} → "{bA and bA["ganador"]}"')
            try: rI = float(rt_de(bA, 1).split()[-1]); rD = float(rt_de(bA, 2).split()[-1])
            except Exception: rI = rD = float('nan')
            chk(abs(rI - 0.620) < 0.04 and abs(rD - 0.760) < 0.04, f'C. reacciones en boleta Full: izq ~0.620 ({rI}), der ~0.760 ({rD})')
            A.wait_for_timeout(1500)
            A.screenshot(path=SH + 'carrera_boleta_anfitrion.png', full_page=True); B.screenshot(path=SH + 'carrera_boleta_invitado.png', full_page=True)
            A.click('#rcOtra'); B.click('#rcOtra'); A.wait_for_timeout(500)
            chk(visible(A, '#rcSala') and visible(B, '#rcSala') and '1' in A.inner_text('#rcMarcador'), f'C. "Otra carrera" regresa a la sala y el marcador cuenta ({A.inner_text("#rcMarcador")})')
            B.close()
            chk(esperar(A, "/Sin conexión|rival salió/.test(document.getElementById('rcChip').textContent)", 25000), f'C. al cerrar el otro teléfono se ve que se perdió la conexión ({A.inner_text("#rcChip")})')
            chk(not eA and not eB, 'C. sin errores: ' + '; '.join(eA + eB))
            cA.close(); cB.close()
            b.close()
            # ---------------- D. el invitado lee el QR del anfitrión con la cámara (video falso con ese QR)
            y4m = os.path.join(tempfile.mkdtemp(), 'qr.y4m')
            b1 = p.chromium.launch(args=ARGS_MEDIOS)
            c1 = contexto(b1); H, eH = pagina(c1)
            H.click('#atRace'); H.click('.rc-sinred summary'); H.click('#rcCrear')
            esperar(H, "/^DT1o/i.test(window.__carrera.codigo())", 10000)
            img = H.evaluate("""(() => { const c = document.getElementById('rcQrCanvas'); const x = c.getContext('2d').getImageData(0, 0, c.width, c.height);
                return { w: c.width, h: c.height, d: Array.from(x.data.filter((_, i) => i % 4 === 0)) }; })()""")
            escribir_y4m(y4m, img)
            b2 = p.chromium.launch(args=ARGS_MEDIOS + [f'--use-file-for-fake-video-capture={y4m}'])
            c2 = contexto(b2); G, eG = pagina(c2)
            G.click('#atRace'); G.click('.rc-sinred summary'); G.click('#rcUnirme')
            chk(esperar(G, "/^DT1a/i.test(window.__carrera.codigo())", 15000), 'D. el invitado leyó el QR con la cámara y armó su respuesta')
            G.screenshot(path=SH + 'carrera_qr_invitado.png')
            chk(not eH and not eG, 'D. sin errores: ' + '; '.join(eH + eG))
            b1.close(); b2.close()
    finally:
        srv.terminate()
    print('FALLAS:', len(fallas))
    for f in fallas: print('  -', f)
    sys.exit(1 if fallas else 0)

def escribir_y4m(ruta, img, lado=480, cuadros=60):
    """Video falso: el QR (gris) centrado en un cuadro de lado×lado, con un poco de gris alrededor."""
    w, h, d = img['w'], img['h'], img['d']
    lado_qr = int(lado * 0.8)
    y = bytearray([170]) * (lado * lado)
    x0 = (lado - lado_qr) // 2
    for j in range(lado_qr):
        sj = j * h // lado_qr
        for i in range(lado_qr):
            y[(x0 + j) * lado + x0 + i] = d[sj * w + i * w // lado_qr]
    uv = bytes([128]) * (lado * lado // 4)
    with open(ruta, 'wb') as f:
        f.write(f'YUV4MPEG2 W{lado} H{lado} F30:1 Ip A1:1 C420jpeg\n'.encode())
        for _ in range(cuadros):
            f.write(b'FRAME\n'); f.write(bytes(y)); f.write(uv); f.write(uv)

if __name__ == '__main__':
    main()
