"""enlace.js (DragEnlace) en Chromium: dos contextos (anfitrión e invitado) en una página que solo carga enlace.js.
Como hará la app, cada uno pide la cámara antes (getUserMedia con cámara falsa) para que WebRTC use las IP reales.
Revisa: emparejar con los códigos de texto, errores claros, 'conectado' en los dos (≤ 10 s), mensajes en los dos
sentidos (y que lo que no es JSON no rompa nada), pings 20/s y luego 4/s, offset estimado contra el verdadero (los dos
contextos comparten el reloj del sistema: offset visto por el anfitrión = timeOrigin del anfitrión − el del invitado)
con error < 3 ms, también con un reloj del invitado corrido 5 s y con deriva de 50 ppm; cerrar el invitado (cerrar(),
congelar su proceso y soltarlo, cerrar la página) y que el anfitrión pase a 'desconectado' o 'fallo' (≤ 20 s) y
vuelva solo a 'conectado' al soltarlo. Al final prueba SIN pedir la cámara (candidatos .local) y lo reporta.
Uso: python3 enlace_test.py [--espera S] [--largo S]
  --espera S: segundos entre la respuesta y aceptar (cuánto puede tardar el anfitrión en leer el código)
  --largo S:  congela al invitado S segundos (cuánto aguanta la conexión sin señal antes de 'fallo')"""
import http.server, os, pathlib, re, shutil, signal, socketserver, subprocess, sys, tempfile, threading, time
from playwright.sync_api import sync_playwright

AQUI = pathlib.Path(__file__).resolve().parent
SRC = AQUI.parent / 'app' / 'src'
fallas = []
def ok(c, msg):
    if not c: fallas.append(msg)
    print(('ok    ' if c else 'FALLA ') + msg, flush=True)
def info(msg): print('      ' + msg, flush=True)
ESPERA = float(sys.argv[sys.argv.index('--espera') + 1]) if '--espera' in sys.argv else 0
LARGO = float(sys.argv[sys.argv.index('--largo') + 1]) if '--largo' in sys.argv else 0

raiz = tempfile.mkdtemp()
shutil.copy(SRC / 'enlace.js', raiz)
with open(os.path.join(raiz, 'p.html'), 'w', encoding='utf-8') as f:
    f.write("""<!doctype html><html lang="es"><head><meta charset="utf-8"><title>enlace</title></head><body><p>enlace</p>
<script src="enlace.js"></script>
<script>
window.L = { E: null, estados: [], mensajes: [], relojes: 0 };
window.armar = (rol, o) => {
  o = o || {};
  const op = { rol };
  if (o.desfase || o.ppm) { const k = 1 + (o.ppm || 0) * 1e-6; op.ahora = () => performance.now() * k + (o.desfase || 0); }
  if (o.limite_ms) op.limite_ms = o.limite_ms;
  const E = DragEnlace.crear(op);
  L.E = E; L.estados = []; L.mensajes = []; L.relojes = 0; L.tListo = 0; L.envios = []; L.k = op.ahora ? 1 + (o.ppm || 0) * 1e-6 : 1; L.desfase = o.desfase || 0;
  E.on('estado', (s, i) => L.estados.push({ s, t: performance.now(), causa: i.causa }));
  E.on('mensaje', (m) => L.mensajes.push(m));
  E.on('reloj', (r) => { L.relojes++; L.ultimoReloj = r; if (r.listo && !L.tListo) L.tListo = performance.now(); });
  return E.estado;
};
// anota la hora de cada ping que sale por el canal 'reloj' (después de crear la oferta o la respuesta)
window.espiarPings = () => { const r = L.E._.rel, s0 = r.send.bind(r);
  r.send = (d) => { if (typeof d === 'string' && d.startsWith('{"p":')) L.envios.push(performance.now()); return s0(d); }; return true; };
window.resumenPings = () => { const t0 = L.estados.find((x) => x.s === 'conectado').t, e = L.envios.map((t) => t - t0);
  return { rapido: e.filter((t) => t >= 0 && t < 2000).length, lento: e.filter((t) => t >= 2300 && t < 4300).length, listo: L.tListo - t0 }; };
window.pedirCamara = async () => { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((t) => t.stop()); return true; };
window.err = async (f) => { try { await f(); return null; } catch (e) { return { causa: e.causa, msg: e.message }; } };
window.esperarEstado = (lista, ms) => new Promise((r) => {
  const t0 = performance.now();
  const v = () => { if (lista.includes(L.E.estado)) return r({ s: L.E.estado, ms: performance.now() - t0, causa: L.E.causa });
    if (performance.now() - t0 > ms) return r({ s: L.E.estado, ms: -1, causa: L.E.causa }); setTimeout(v, 20); };
  v();
});
// lo que el reloj del enlace estima ahora y el reloj "propio" de esta página (con el desfase falso si lo hay)
window.relojAhora = () => { const p = performance.now(), t = p * L.k + L.desfase;
  return { t, p, origen: performance.timeOrigin, dw: Date.now() - p, off: L.E._.est.offsetEn(t), r: L.E.reloj }; };
</script></body></html>""")

class Silencio(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=raiz, **k)
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), Silencio); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{PORT}/p.html'

def renderers():
    out = subprocess.run(['ps', '-eo', 'pid=,args='], capture_output=True, text=True).stdout
    return [int(l.split()[0]) for l in out.splitlines() if '--type=renderer' in l and 'chrom' in l]
def cpu(pid):
    try:
        with open(f'/proc/{pid}/stat') as f: c = f.read().rsplit(')', 1)[1].split()
        return int(c[11]) + int(c[12])
    except Exception: return 0
def pid_de(pg):
    """El proceso de la página: el renderer que más CPU gasta mientras la página hace una cuenta larga (3 intentos)."""
    for _ in range(3):
        ps = renderers(); antes = {p: cpu(p) for p in ps}
        pg.evaluate('() => { const t = performance.now(); let x = 0; while (performance.now() - t < 1500) x += Math.sqrt(x + 1); return x; }')
        d = sorted(((cpu(p) - antes[p], p) for p in ps), reverse=True)
        if d and d[0][0] > 50 and (len(d) == 1 or d[0][0] > 3 * max(1, d[1][0])): return d[0][1]
    return None

def emparejar(A, B, nombre, opts_inv=None, camara=True, espera=0):
    """Empareja A (anfitrión) con B (invitado) por los códigos de texto. Devuelve los códigos y lo que tardó."""
    if camara:
        ok(A.evaluate('pedirCamara()') and B.evaluate('pedirCamara()'), f'{nombre}: los dos pidieron la cámara antes (getUserMedia)')
    A.evaluate("armar('anfitrion')"); B.evaluate("(o) => armar('invitado', o)", opts_inv or {})
    t0 = time.time()
    of = A.evaluate('L.E.oferta()')
    t_of = time.time() - t0
    ok(of.startswith('DT1') and A.evaluate('L.E.estado') == 'esperando', f'{nombre}: oferta {of[:4]}… de {len(of)} caracteres en {t_of:.2f} s; anfitrión "esperando"')
    t0 = time.time()
    re_ = B.evaluate('(c) => L.E.responder(c)', of)
    t_re = time.time() - t0
    ok(re_.startswith('DT1') and B.evaluate('L.E.estado') == 'esperando', f'{nombre}: respuesta {re_[:4]}… de {len(re_)} caracteres en {t_re:.2f} s; invitado "esperando"')
    if espera: info(f'{nombre}: esperando {espera:.0f} s antes de aceptar…'); time.sleep(espera)
    A.evaluate('(c) => L.E.aceptar(c)', re_)
    ok(A.evaluate('L.E.estado') in ('conectando', 'conectado'), f'{nombre}: aceptar → "{A.evaluate("L.E.estado")}"')
    return of, re_

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
    errores = []
    def pagina(nombre, permiso=True):
        ctx = b.new_context()
        if permiso: ctx.grant_permissions(['camera'])
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errores.append(f'{nombre}: {e}'))
        pg.on('console', lambda m: errores.append(f'{nombre}: {m.text}') if m.type == 'error' else None)
        pg.goto(URL)
        return ctx, pg

    # ================================================================ 1. con cámara: emparejar, errores, mensajes, reloj
    cA, A = pagina('anfitrión'); cB, B = pagina('invitado')
    ok(A.evaluate('DragEnlace.soporte()')['ok'] and A.evaluate('DragEnlace.soporte()')['deflate'], 'soporte: WebRTC y deflate-raw en Chromium')
    ok(A.evaluate('pedirCamara()') and B.evaluate('pedirCamara()'), 'los dos pidieron la cámara antes (getUserMedia)')
    A.evaluate("armar('anfitrion')"); B.evaluate("armar('invitado')")
    e = B.evaluate("err(() => L.E.oferta())")
    ok(e and e['causa'] == 'estado', f'el invitado no puede hacer oferta: {e}')
    t0 = time.time(); of = A.evaluate('L.E.oferta()'); t_of = time.time() - t0
    ok(of.startswith('DT1') and A.evaluate('L.E.estado') == 'esperando', f'oferta {of[:4]}… de {len(of)} caracteres en {t_of:.2f} s; anfitrión "esperando"')
    A.evaluate('espiarPings()')
    cand_of = A.evaluate('L.E.info().codigoPropio')
    info(f'candidatos de la oferta: {cand_of}')
    ok(any(c.startswith('ipv4') for c in cand_of['candidatos']), 'con permiso de cámara la oferta trae la IP real (IPv4), no un nombre .local')
    # errores con códigos equivocados (el invitado puede volver a intentar)
    e = B.evaluate("err(() => L.E.responder('hola'))"); ok(e and e['causa'] == 'no_es' and 'no es de Drag Tree' in e['msg'], f'invitado lee "hola": {e and e["msg"]}')
    e = B.evaluate("(c) => err(() => L.E.responder('DT2' + c.slice(3)))", of); ok(e and e['causa'] == 'otra_version', f'invitado lee un código DT2: {e and e["msg"]}')
    e = B.evaluate("(c) => err(() => L.E.responder(c.slice(0, 50)))", of); ok(e and e['causa'] == 'danado', f'invitado lee medio código: {e and e["msg"]}')
    ok(B.evaluate('L.E.estado') == 'nuevo', 'después de los errores el invitado sigue en "nuevo"')
    t0 = time.time(); re_ = B.evaluate('(c) => L.E.responder(c)', of); t_re = time.time() - t0
    ok(re_.startswith('DT1') and B.evaluate('L.E.estado') == 'esperando', f'respuesta {re_[:4]}… de {len(re_)} caracteres en {t_re:.2f} s; invitado "esperando"')
    e = B.evaluate("(c) => err(() => L.E.responder(c))", re_); ok(e and e['causa'] == 'estado', 'el invitado no contesta dos veces')
    # el anfitrión lee códigos equivocados y luego el bueno
    e = A.evaluate("(c) => err(() => L.E.aceptar(c))", of); ok(e and e['causa'] == 'es_oferta', f'anfitrión lee una oferta: {e and e["msg"]}')
    # una respuesta a otra oferta (código viejo): otro invitado contesta otra oferta
    cX, X = pagina('otro'); cY, Y = pagina('otro2')
    X.evaluate("armar('anfitrion')"); Y.evaluate("armar('invitado')")
    of_x = X.evaluate('L.E.oferta()'); re_viejo = Y.evaluate('(c) => L.E.responder(c)', of_x)
    e = A.evaluate("(c) => err(() => L.E.aceptar(c))", re_viejo); ok(e and e['causa'] == 'otro_emparejamiento', f'anfitrión lee la respuesta de otro emparejamiento: {e and e["msg"]}')
    e = B.evaluate("(c) => err(() => L.E.responder(c))", of_x)
    X.evaluate('L.E.cerrar()'); Y.evaluate('L.E.cerrar()'); cX.close(); cY.close()
    ok(A.evaluate('L.E.estado') == 'esperando', 'después de los errores el anfitrión sigue "esperando"')
    t_ac = time.time()
    A.evaluate('(c) => L.E.aceptar(c)', re_)
    ok(A.evaluate('L.E.estado') in ('conectando', 'conectado'), f'aceptar → "{A.evaluate("L.E.estado")}"')
    rA = A.evaluate("esperarEstado(['conectado', 'fallo'], 10000)"); rB = B.evaluate("esperarEstado(['conectado', 'fallo'], 10000)")
    t_con = time.time() - t_ac
    ok(rA['s'] == 'conectado' and rB['s'] == 'conectado' and t_con <= 10, f'"conectado" en los dos a los {t_con:.2f} s de aceptar (anfitrión {A.evaluate("L.E.info().conectar_ms"):.0f} ms)')
    ok([x['s'] for x in A.evaluate('L.estados')] == ['esperando', 'conectando', 'conectado'], f"estados del anfitrión: {[x['s'] for x in A.evaluate('L.estados')]}")
    ok([x['s'] for x in B.evaluate('L.estados')] == ['esperando', 'conectado'], f"estados del invitado: {[x['s'] for x in B.evaluate('L.estados')]}")
    d = A.evaluate('L.E.diagnostico()')
    info(f"par elegido: {d['par']['local']} ↔ {d['par']['remoto']}, rtt {d['par']['rtt_ms']} ms" if d and d['par'] else f'sin par: {d}')
    # mensajes en los dos sentidos, en orden; lo que no es JSON no rompe nada
    ok(A.evaluate("L.E.enviar({ hola: 'invitado', n: 1, lista: [1, 2, 3] })") is True, 'enviar → true')
    B.evaluate("L.E.enviar({ hola: 'anfitrión', acentos: 'ñáé' })")
    B.evaluate("""() => { const c = L.E._.ctl, r = L.E._.rel;
      c.send('esto no es json {'); c.send('[1,2]'); c.send('null'); c.send('{"x": 1}'); c.send(new Uint8Array([1, 2, 3]));
      r.send('}{'); r.send('{"q": 123, "r": 456}'); r.send('{"p": "x"}'); r.send(new Uint8Array([9]));
      L.E.enviar({ despues: true }); }""")
    A.evaluate("() => { for (let i = 0; i < 50; i++) L.E.enviar({ i }); }")
    time.sleep(0.6)
    mA, mB = A.evaluate('L.mensajes'), B.evaluate('L.mensajes')
    ok(mB[:1] == [{'hola': 'invitado', 'n': 1, 'lista': [1, 2, 3]}] and [m.get('i') for m in mB[1:]] == list(range(50)), f'invitado recibió el mensaje y los 50 en orden ({len(mB)})')
    ok(mA == [{'hola': 'anfitrión', 'acentos': 'ñáé'}, {'despues': True}], f'anfitrión recibió los 2 mensajes y nada de la basura: {mA}')
    ok(A.evaluate('L.E.estado') == 'conectado' and not errores, f'la basura no rompió nada (estado {A.evaluate("L.E.estado")}, errores {errores})')
    # pings: 20/s los primeros 2 s después de abrir, luego 4/s (horas de envío contra la hora de 'conectado')
    time.sleep(3.6)
    pi = A.evaluate('resumenPings()')
    ok(36 <= pi['rapido'] <= 42 and 7 <= pi['lento'] <= 9, f"pings: {pi['rapido']} en los primeros 2 s (20/s) y {pi['lento']} en los 2 s siguientes (4/s)")
    ok(0 < pi['listo'] < 1000, f"reloj listo a los {pi['listo']:.0f} ms de conectar")
    ur = A.evaluate('L.ultimoReloj')
    ok(A.evaluate('L.relojes') >= 1 and ur['listo'] and ur['n'] > 0 and abs(ur['offset_ms'] - A.evaluate('L.E.reloj.offset_ms')) < 0.01,
       f"evento 'reloj' {A.evaluate('L.relojes')} veces (solo cuando cambia ≥ 0.01 ms); el último coincide con E.reloj")
    ra, rb = A.evaluate('relojAhora()'), B.evaluate('relojAhora()')
    verdad_a = ra['origen'] - rb['origen']                  # offset visto por el anfitrión = reloj del invitado − el suyo
    verdad_dw = rb['dw'] - ra['dw']                          # comprobación con Date.now(): (D − pA) − (D − pB) = pB − pA
    ea, eb = ra['off'] - verdad_a, rb['off'] + verdad_a
    info(f"offset verdadero {verdad_a:.3f} ms (por Date.now {-verdad_dw:.1f}); anfitrión estima {ra['off']:.3f} (±{ra['r']['error_ms']:.2f}, rtt {ra['r']['rtt_ms']:.2f} ms, {ra['r']['n']} muestras, {ra['r']['metodo']})")
    ok(ra['r']['listo'] and abs(ea) < 3 and rb['r']['listo'] and abs(eb) < 3, f'offset estimado: error {ea:+.3f} ms en el anfitrión y {eb:+.3f} ms en el invitado (< 3)')
    ok(abs(A.evaluate('(t) => L.E.aOtro(t) - t', 1000.0) - verdad_a) < 3 and abs(B.evaluate('(t) => L.E.aLocal(t) - t', 1000.0) - verdad_a) < 3,
       'aOtro (anfitrión) y aLocal (invitado) pasan del reloj de uno al del otro')
    largos = {'oferta': len(of), 'respuesta': len(re_)}
    # cerrar() del invitado: el anfitrión lo sabe en seguida
    t0 = time.time(); B.evaluate('L.E.cerrar()')
    r = A.evaluate("esperarEstado(['desconectado', 'fallo'], 20000)")
    ok(r['s'] in ('desconectado', 'fallo') and r['ms'] >= 0, f"invitado cerrar(): anfitrión → '{r['s']}' ({r['causa']}) en {r['ms']:.0f} ms")
    ok(B.evaluate('L.E.estado') == 'cerrado' and B.evaluate('L.E.enviar({x: 1})') is False and A.evaluate('L.E.enviar({x: 1})') is False,
       'invitado "cerrado"; enviar → false en los dos')
    cA.close(); cB.close()

    # ================================================================ 2. reloj del invitado corrido 5 s y con 50 ppm; congelar y soltar
    cA, A = pagina('anfitrión 2'); cB, B = pagina('invitado 2')
    of2, re2 = emparejar(A, B, 'desfase 5 s + 50 ppm', {'desfase': 5000, 'ppm': 50}, espera=ESPERA)
    rA = A.evaluate("esperarEstado(['conectado', 'fallo'], 10000)"); rB = B.evaluate("esperarEstado(['conectado', 'fallo'], 10000)")
    ok(rA['s'] == 'conectado' and rB['s'] == 'conectado', f"conectado ({rA['s']}/{rB['s']})" + (f' después de esperar {ESPERA:.0f} s' if ESPERA else ''))
    time.sleep(3.0)
    def revisar_reloj(etq):
        ra, rb = A.evaluate('relojAhora()'), B.evaluate('relojAhora()')
        # invitado: t_inv = p_inv·k + 5000 con p_inv = p_anf + (origen_anf − origen_inv) al mismo tiempo
        k = 1 + 50e-6
        verdad_a = (ra['p'] + ra['origen'] - rb['origen']) * k + 5000 - ra['t']        # offset visto por el anfitrión en su t
        p_anf = (rb['t'] - 5000) / k + rb['origen'] - ra['origen']                     # el instante del invitado, en el reloj del anfitrión
        verdad_b = p_anf - rb['t']
        ea, eb = ra['off'] - verdad_a, rb['off'] - verdad_b
        ok(abs(ea) < 3 and abs(eb) < 3 and ra['r']['listo'], f"{etq}: offset {ra['off']:.2f} ms (verdadero {verdad_a:.2f}); error {ea:+.3f} en el anfitrión y {eb:+.3f} en el invitado (< 3)")
    revisar_reloj('desfase 5 s + 50 ppm')
    pid = pid_de(B)
    if pid:
        n_antes = A.evaluate('L.E.reloj.n'); t0 = time.time()
        os.kill(pid, signal.SIGSTOP)
        r = A.evaluate("esperarEstado(['desconectado', 'fallo'], 20000)")
        t_desc = time.time() - t0
        ok(r['s'] == 'desconectado', f"invitado congelado (SIGSTOP): anfitrión → '{r['s']}' a los {t_desc:.1f} s (≤ 20)")
        time.sleep(1.0)
        os.kill(pid, signal.SIGCONT); t0 = time.time()
        r = A.evaluate("esperarEstado(['conectado', 'fallo'], 20000)")
        ok(r['s'] == 'conectado', f"al soltarlo (SIGCONT) vuelve solo a '{r['s']}' en {time.time() - t0:.1f} s")
        time.sleep(1.5)
        ok(A.evaluate('L.E.reloj.n') > n_antes and A.evaluate('L.E.enviar({otra: 1})'), 'después siguen los pings y los mensajes')
        time.sleep(0.3)
        ok(B.evaluate('L.mensajes').count({'otra': 1}) == 1, 'el mensaje después de volver llega')
        revisar_reloj('después de congelar 1 s más')
        if LARGO:
            # ¿cuánto aguanta sin señal? (en la pista: mientras los autos corren y regresan)
            A.evaluate("""() => { const pc = L.E._.pc, c = L.E._.ctl; L.log = []; L.t0 = performance.now();
              const n = (k, v) => L.log.push(k + ' ' + v + ' ' + ((performance.now() - L.t0) / 1000).toFixed(1) + ' s');
              pc.addEventListener('iceconnectionstatechange', () => n('ice', pc.iceConnectionState));
              pc.addEventListener('connectionstatechange', () => n('conexión', pc.connectionState));
              c.addEventListener('close', () => n('canal', 'cerrado')); }""")
            os.kill(pid, signal.SIGSTOP); t0 = time.time()
            r1 = A.evaluate("esperarEstado(['desconectado', 'fallo'], 20000)"); t1 = time.time() - t0
            r2 = A.evaluate(f"esperarEstado(['fallo'], {LARGO * 1000:.0f})"); t2 = time.time() - t0
            os.kill(pid, signal.SIGCONT)
            r3 = A.evaluate("esperarEstado(['conectado', 'fallo'], 15000)")
            info(f"sin señal {LARGO:.0f} s: '{r1['s']}' a los {t1:.1f} s, " + (f"'fallo' a los {t2:.1f} s" if r2['s'] == 'fallo' else f"sin 'fallo' en {t2:.0f} s") +
                 f"; al volver: '{r3['s']}'")
            info(f"eventos del navegador (desde que se congeló): {A.evaluate('L.log')}")
    else:
        ok(False, 'no se encontró el proceso del invitado para congelarlo')
    # cerrar la página del invitado sin cerrar() (como cerrar la app)
    t0 = time.time(); cB.close()
    r = A.evaluate("esperarEstado(['desconectado', 'fallo'], 20000)")
    ok(r['s'] in ('desconectado', 'fallo') and r['ms'] >= 0, f"página del invitado cerrada: anfitrión → '{r['s']}' ({r['causa']}) a los {time.time() - t0:.1f} s (≤ 20)")
    largos['oferta (2)'] = len(of2); largos['respuesta (2)'] = len(re2)
    cA.close()

    # ================================================================ 3. sin pedir la cámara (candidatos .local)
    print('--- sin pedir la cámara antes', flush=True)
    cA, A = pagina('anfitrión sin cámara', permiso=False); cB, B = pagina('invitado sin cámara', permiso=False)
    A.evaluate("armar('anfitrion')"); B.evaluate("armar('invitado')")
    t0 = time.time(); of3 = A.evaluate('L.E.oferta()'); t_of3 = time.time() - t0
    re3 = B.evaluate('(c) => L.E.responder(c)', of3)
    info(f"oferta {len(of3)} car. en {t_of3:.2f} s, candidatos {A.evaluate('L.E.info().codigoPropio.candidatos')}; respuesta {len(re3)} car., "
         f"candidatos {B.evaluate('L.E.info().codigoPropio.candidatos')}")
    ok(all(c.startswith('mdns') for c in A.evaluate('L.E.info().codigoPropio.candidatos')), 'sin permiso de cámara Chromium da nombres .local (mDNS)')
    t0 = time.time(); A.evaluate('(c) => L.E.aceptar(c)', re3)
    rA = A.evaluate("esperarEstado(['conectado', 'fallo'], 25000)")
    rB = B.evaluate("esperarEstado(['conectado', 'fallo'], 1000)")
    sin_cam = f"anfitrión '{rA['s']}'" + (f" a los {rA['ms']:.0f} ms" if rA['ms'] >= 0 else '') + f" ({rA['causa'] or '—'}), invitado '{rB['s']}'"
    info(f'sin cámara: {sin_cam}')
    if rA['s'] == 'fallo': ok(rA['causa'] == 'no_conecto', f"si no conecta, a los 20 s da 'fallo' con el aviso claro: {A.evaluate('L.E.motivo')}")
    A.evaluate('L.E.cerrar()'); B.evaluate('L.E.cerrar()')
    cA.close(); cB.close()

    ok(not errores, f'sin errores de JavaScript ({errores})')
    b.close()

print(f"\nlargo de los códigos: {largos}; sin cámara: oferta {len(of3)}, respuesta {len(re3)}")
print(f"sin pedir la cámara: {sin_cam}")
print(f"\nFALLAS: {len(fallas)}")
if fallas:
    for f in fallas: print('  - ' + f)
    sys.exit(1)
