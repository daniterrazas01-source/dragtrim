# Prueba de la sala por internet de Race 1 vs 1 (sin hotspot; cada teléfono con sus datos) en Chromium, con la sala de
# pruebas en esta computadora (sala_local.mjs, misma lógica que la de Cloudflare: fuente/sala/nucleo.js):
#  A. sin sala (?sala=): "Crear sala" avisa y abre "¿Sin señal en la pista? Conectar con QR"; sala que no contesta (sin
#     internet): vuelve al inicio con el aviso y lo del QR abierto; la app trae la dirección de la sala publicada.
#  B. el anfitrión crea la sala y ve su código de 5; el invitado lo teclea (en minúsculas) y entra solo; los dos se
#     sincronizan contra la sala; Full y 1/8; los dos Listo; las verdes casi juntas; la misma boleta en los dos.
#  C. errores al teclear: código con 0, sala que no existe, sala llena.
#  D. el invitado se queda sin señal sin enterarse (conexión muda): lo nota solo, el anfitrión lo ve, y vuelve solo.
#  E. el anfitrión pierde la señal a media corrida: el resultado del otro le llega al volver; boleta completa en los dos.
#  F. el invitado sale de la carrera y vuelve a entrar con el mismo código.
# Uso: python3 sala_test.py -> capturas/sala_*.png; sale con código 1 si algo falla.
import os, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright
from carrera_test import (contexto, pagina, visible, esperar, boleta, ganador_esperado, rt_de, chk, fallas, SH, DIST,
                          ARGS_MEDIOS, TARDE)

AQUI = os.path.dirname(os.path.abspath(__file__))
PUERTO, PSALA = 8797, 8796
URL = f'http://localhost:{PUERTO}/index.html'
SALA = f'ws://localhost:{PSALA}'
EN_SALA = "!document.getElementById('rcSala').hidden && !document.getElementById('rc').hidden"
CONECTADOS = "/^Sala [A-Z0-9]{5} · ±/.test(document.getElementById('rcChip').textContent)"
COMPLETA = "!!document.querySelector('.rc-slip') && !document.querySelector('.rc-ganador').classList.contains('espera')"

def sin_señal(modo, codigo, rol, ms):
    urllib.request.urlopen(f'http://localhost:{PSALA}/{modo}/{codigo}/{rol}?ms={ms}').read()

def errores(lista):
    # Chromium avisa en la consola cuando un WebSocket no logra conectar (la sala bloqueada "sin señal"): eso es esperado
    return [e for e in lista if 'WebSocket connection to' not in e]

def teclear_codigo(pg, cod):
    pg.fill('#rcCodIn', '')
    pg.type('#rcCodIn', cod, delay=40)

def main():
    web = subprocess.Popen([sys.executable, '-m', 'http.server', str(PUERTO), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    sala = subprocess.Popen(['node', os.path.join(AQUI, 'sala_local.mjs'), str(PSALA)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(args=ARGS_MEDIOS)
            # ---------------- A. sin sala publicada
            c0 = contexto(b); P, e0 = pagina(c0, URL + '?sala=')
            P.click('#atRace'); P.click('#rcCrearSala'); P.wait_for_timeout(200)
            chk('todavía no está publicada' in P.inner_text('#rcInicioMsg') and P.evaluate("document.querySelector('.rc-sinred').open"),
                f'A. sin sala, "Crear sala" avisa y abre la conexión con QR ({P.inner_text("#rcInicioMsg")})')
            P.goto(URL + '?sala=ws://localhost:8794'); P.wait_for_timeout(300)
            P.click('#atRace'); P.click('#rcCrearSala')
            chk(esperar(P, "/No se pudo conectar con la sala/.test(document.getElementById('rcInicioMsg').textContent) && !document.getElementById('rcInicio').hidden && document.querySelector('.rc-sinred').open", 12000),
                f'A. sala que no contesta: vuelve al inicio con el aviso y lo del QR abierto ({P.inner_text("#rcInicioMsg")})')
            chk('wss://dragtree-sala.dani-terrazas01.workers.dev' in open(os.path.join(DIST, 'index.html'), encoding='utf-8').read(),
                'A. la app trae la dirección de la sala publicada')
            P.screenshot(path=SH + 'sala_sin_publicar.png')
            chk(not errores(e0), 'A. sin errores: ' + '; '.join(e0))
            c0.close()

            # ---------------- B. crear, teclear el código, carrera completa
            cA, cB = contexto(b), contexto(b)
            q = f'?simsens&sala={SALA}'
            A, eA = pagina(cA, URL + q); B, eB = pagina(cB, URL + q)
            for pg in (A, B): pg.on('dialog', lambda d: d.accept())
            A.click('#atRace'); A.screenshot(path=SH + 'sala_inicio.png')
            A.click('#rcCrearSala')
            chk(esperar(A, "/^[A-HJ-NP-Z2-9]{5}$/.test(document.getElementById('rcCodigoTxt').textContent)", 8000), 'B. el anfitrión crea la sala y ve su código de 5')
            cod = A.inner_text('#rcCodigoTxt').strip()
            chk(esperar(A, "!document.getElementById('rcCodigoEspera').hidden", 4000), f'B. con el código en grande: "Esperando a tu rival…" ({cod})')
            A.screenshot(path=SH + 'sala_codigo.png')
            B.click('#atRace'); B.click('#rcUnirSala'); B.wait_for_timeout(200)
            chk(visible(B, '#rcUnir') and visible(B, '#rcCodIn'), 'B. "Unirme con código" muestra dónde escribirlo')
            B.screenshot(path=SH + 'sala_unirme.png')
            teclear_codigo(B, cod.lower())
            ok = esperar(A, EN_SALA, 10000) and esperar(B, EN_SALA, 10000)
            chk(ok, 'B. con las 5 letras (aunque sean minúsculas) entra solo y los dos llegan a la sala')
            chk(esperar(A, CONECTADOS, 10000) and esperar(B, CONECTADOS, 10000), f'B. los dos sincronizados contra la sala ({A.inner_text("#rcChip")} / {B.inner_text("#rcChip")})')
            # la sala de prueba usa la hora de esta computadora: lo que cada teléfono cree que es la hora de la sala ≈ Date.now()
            dA = A.evaluate("window.__carrera.R.E.aOtro(performance.now()) - Date.now()")
            dB = B.evaluate("window.__carrera.R.E.aOtro(performance.now()) - Date.now()")
            chk(abs(dA) < 5 and abs(dB) < 5, f'B. los dos saben la hora de la sala ({dA:+.1f} y {dB:+.1f} ms)')
            chk(cod in A.inner_text('#rcSalaCod') and cod in B.inner_text('#rcSalaCod'), 'B. la sala muestra su código (para volver a entrar)')
            A.click('#segRcArbol button[data-v="full"]'); A.click('#segRcDist button[data-v="201.168"]')
            chk(esperar(B, "document.querySelector('#segRcArbol button[data-v=\"full\"]').getAttribute('aria-checked') === 'true' && document.querySelector('#segRcDist button[data-v=\"201.168\"]').getAttribute('aria-checked') === 'true'", 5000),
                'B. el invitado ve el árbol Full y 1/8 que eligió el anfitrión')
            A.screenshot(path=SH + 'sala_sala_anfitrion.png'); B.screenshot(path=SH + 'sala_sala_invitado.png')
            A.evaluate('window.__carreraRT = 0.120'); B.evaluate('window.__carreraRT = 0.260')
            A.click('#rcListo'); A.wait_for_timeout(600)
            chk(not A.evaluate("!document.getElementById('rcArbol').hidden"), 'B. con un solo carril listo el árbol no baja')
            B.click('#rcListo')
            ok = esperar(A, "!document.getElementById('rcArbol').hidden", 5000) and esperar(B, "!document.getElementById('rcArbol').hidden", 5000)
            chk(ok, 'B. con los dos listos baja el árbol en los dos')
            chk(esperar(A, "Number.isFinite(window.__carrera.R.tVerde)", 10000) and esperar(B, "Number.isFinite(window.__carrera.R.tVerde)", 10000), 'B. los dos pintan la verde')
            gA = A.evaluate('performance.timeOrigin + window.__carrera.R.tVerde'); gB = B.evaluate('performance.timeOrigin + window.__carrera.R.tVerde')
            chk(abs(gA - gB) < 25, f'B. las dos verdes salen casi juntas ({gA - gB:+.1f} ms)')
            ok = esperar(A, COMPLETA, 45000) and esperar(B, COMPLETA, 45000)
            chk(ok, 'B. los dos teléfonos muestran la boleta completa')
            bA, bB = boleta(A), boleta(B)
            print('   boleta anfitrión:', bA)
            chk(bA and bB and bA['ganador'] == bB['ganador'] and bA['filas'][1:] == bB['filas'][1:], 'B. la boleta y el ganador son los mismos en los dos teléfonos')
            g = ganador_esperado(bA, 0.5, '1/8') if bA else None
            chk(bA and ('izquierdo' if g == 'izq' else 'derecho') in bA['ganador'].lower().split('gana')[-1], f'B. gana quien llega primero (reacción + ET): {g} → "{bA and bA["ganador"]}"')
            try: rI = float(rt_de(bA, 1).split()[-1]); rD = float(rt_de(bA, 2).split()[-1])
            except Exception: rI = rD = float('nan')
            tA, tB = A.evaluate(TARDE), B.evaluate(TARDE)   # verde pintada tarde en esta máquina: ver carrera_test.TARDE
            chk(abs(rI - (0.620 - tA)) < 0.04 and abs(rD - (0.760 - tB)) < 0.04,
                f'B. reacciones en boleta Full: izq ~0.620 ({rI}), der ~0.760 ({rD}); verdes pintadas {tA * 1000:+.0f} / {tB * 1000:+.0f} ms')
            race = A.evaluate("window.__dragtrim.DB.todos().then(rs => rs[0] && rs[0].race && { conexion: rs[0].race.conexion, sala: rs[0].race.sala, sinc: rs[0].race.sincronia })")
            chk(race and race['conexion'] == 'internet' and race['sala'] == cod and race['sinc'], f'B. la corrida guarda que fue por internet, su sala y la sincronía ({race})')
            A.wait_for_timeout(1500); A.screenshot(path=SH + 'sala_boleta.png', full_page=True)
            A.click('#rcOtra'); B.click('#rcOtra')
            chk(esperar(A, EN_SALA, 3000) and esperar(B, EN_SALA, 3000), 'B. "Otra carrera" regresa a la sala')

            # ---------------- C. errores al teclear
            cC = contexto(b); C, eC = pagina(cC, URL + q)
            C.click('#atRace'); C.click('#rcUnirSala')
            teclear_codigo(C, 'KR0PX'); C.click('#rcEntrar'); C.wait_for_timeout(200)
            chk('no lleva O, I, 0 ni 1' in C.inner_text('#rcUnirMsg'), f'C. código con 0: "{C.inner_text("#rcUnirMsg")}"')
            otro = 'ZZZZZ' if cod != 'ZZZZZ' else 'YYYYY'
            teclear_codigo(C, otro)
            chk(esperar(C, "/No hay ninguna sala/.test(document.getElementById('rcUnirMsg').textContent)", 8000), f'C. sala que no existe: "{C.inner_text("#rcUnirMsg")}"')
            teclear_codigo(C, cod)
            chk(esperar(C, "/ya tiene a sus dos teléfonos/.test(document.getElementById('rcUnirMsg').textContent)", 8000), f'C. sala llena: "{C.inner_text("#rcUnirMsg")}"')
            C.screenshot(path=SH + 'sala_error.png')
            chk(not errores(eC), 'C. sin errores: ' + '; '.join(eC))
            cC.close()
            chk(esperar(A, CONECTADOS, 3000) and esperar(B, CONECTADOS, 3000), 'C. el que no pudo entrar no movió a los dos de la sala')

            # ---------------- D. el invitado se queda sin señal sin enterarse
            t0 = time.time()
            sin_señal('callar', cod, 'invitado', 7000)
            chk(esperar(B, "/Sin señal/.test(document.getElementById('rcChip').textContent)", 9000), f'D. el invitado nota solo que no hay señal ({time.time() - t0:.1f} s)')
            chk(esperar(A, "/Esperando rival/.test(document.getElementById('rcChip').textContent)", 6000), 'D. el anfitrión ve que el otro no está')
            A.screenshot(path=SH + 'sala_sin_senal.png')
            chk(esperar(A, CONECTADOS, 20000) and esperar(B, CONECTADOS, 20000), f'D. al volver la señal se reconecta solo ({time.time() - t0:.1f} s)')

            # ---------------- E. el anfitrión pierde la señal a media corrida
            A.evaluate('window.__carreraRT = 0.200'); B.evaluate('window.__carreraRT = 0.090')
            A.click('#rcListo'); B.click('#rcListo')
            ok = esperar(A, "Number.isFinite(window.__carrera.R.tVerde)", 12000) and esperar(B, "Number.isFinite(window.__carrera.R.tVerde)", 12000)
            chk(ok, 'E. segunda carrera: los dos pintan la verde')
            sin_señal('cortar', cod, 'anfitrion', 14000)
            chk(esperar(B, COMPLETA + " === false && !!document.querySelector('.rc-slip')", 30000), 'E. el invitado termina y espera el resultado del otro')
            chk(esperar(A, "!!document.querySelector('.rc-slip')", 30000) and A.evaluate("window.__carrera.R.E.estado") != 'conectado', 'E. el anfitrión termina su corrida sin señal')
            ok = esperar(A, COMPLETA, 30000) and esperar(B, COMPLETA, 30000)
            chk(ok, 'E. al volver la señal, la boleta se completa en los dos')
            bA, bB = boleta(A), boleta(B)
            chk(bA and bB and bA['ganador'] == bB['ganador'] and bA['filas'][1:] == bB['filas'][1:], f'E. la misma boleta en los dos ("{bA and bA["ganador"]}")')
            A.click('#rcOtra'); B.click('#rcOtra')
            chk(esperar(A, "(document.getElementById('rcMarcador').textContent.match(/\\d+/g) || []).reduce((a, x) => a + +x, 0) === 2", 3000),
                f'E. el marcador lleva las dos carreras ({A.inner_text("#rcMarcador")})')

            # ---------------- F. el invitado sale y vuelve a entrar con el código
            B.click('#rcSalir')
            chk(esperar(A, "/rival salió/.test(document.getElementById('rcChip').textContent)", 6000) and cod in A.inner_text('#rcMsg'),
                f'F. el anfitrión ve que el otro salió y con qué código puede volver ({A.inner_text("#rcMsg")})')
            B.click('#atRace'); B.click('#rcUnirSala'); teclear_codigo(B, cod)
            chk(esperar(A, CONECTADOS, 10000) and esperar(B, EN_SALA, 10000), 'F. vuelve a entrar con el mismo código y los dos quedan conectados')
            todos = errores(eA + eB)
            chk(not todos, 'B–F. sin errores: ' + '; '.join(todos))
            cA.close(); cB.close()
            b.close()
    finally:
        web.terminate(); sala.terminate()
    print('FALLAS:', len(fallas))
    for f in fallas: print('  -', f)
    sys.exit(1 if fallas else 0)

if __name__ == '__main__':
    main()
