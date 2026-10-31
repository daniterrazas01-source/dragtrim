# Race 1 vs 1 — cómo se programa (31 oct 2026)

Daniel lo pidió el 31 oct: "programa esta sección, incluyendo la sala, la forma de vincular ambos teléfonos, de la
forma más sencilla que se pueda y visual". Él alinea los dos autos en la realidad; luego le dicen a la app "ya estamos
alineados" y la app prende pre-stage, luego stage y luego baja el árbol. Al entrar a la carrera se elige árbol Full
(.500) o Pro (.400). Diseño de fondo: `race_1vs1.md` (WebRTC por hotspot, emparejar con dos QR, pings tipo NTP, cada
quien medido contra su propia verde, ticket con reglas de Práctica, "muy cerrada" si la diferencia es menor al error).

## Piezas (archivos nuevos en `fuente/app/src/`)

| Archivo | Global | Quién lo usa | Qué hace |
|---|---|---|---|
| `vendor/jsQR.js` | `jsQR` | qr.js | lector de QR (jsQR 1.4.0, Apache-2.0), minificado |
| `vendor/qrcode.js` | `qrcode` | qr.js | generador de QR (qrcode-generator, MIT), minificado |
| `qr.js` | `DragQR` | carrera.js | dibujar QR en canvas, leer QR de imagen, escáner con la cámara |
| `enlace.js` | `DragEnlace` | carrera.js | WebRTC sin servidor (códigos en QR), mensajes, sincronía de relojes |
| `carrera_nucleo.js` | `DragCarreraNucleo` | carrera.js | lógica pura: programa del árbol, luces, resultado, ganador, filas del ticket |
| `carrera.js` | `DragCarrera` | app | pantallas: inicio, emparejar, sala, árbol, ticket; rival simulado |

Todo va dentro del index.html autocontenido (build.py con marcadores), sin internet ni servidores ajenos. Cada archivo
es un IIFE que define su global en `window` (y `module.exports` si existe `module`, para probarlo en Node).
Reloj de todo: `performance.now()` en ms (el mismo de los sensores en app.js, que guardan segundos = ms/1000).

## qr.js → `window.DragQR`

- `DragQR.dibujar(canvas, texto, opts?)` → `{version, modulos}`. Negro sobre blanco, margen de 4 módulos, módulos de
  tamaño entero en píxeles reales (canvas.width = tamaño CSS × devicePixelRatio), nítido (sin suavizado). ECC 'M'
  si cabe en versión ≤ 25, si no 'L'. `opts.ecc` lo fuerza.
- `DragQR.matriz(texto, ecc?)` → `{n, oscuro: (fila, col) => bool}` (para pruebas y para dibujar en otro lado).
- `DragQR.leerImagen(imageData)` → `string | null` (jsQR, `inversionAttempts: 'attemptBoth'`).
- `DragQR.pedirCamara()` → `Promise<MediaStream | null>`: pide la cámara de atrás. Se usa antes de crear la oferta
  WebRTC: con el permiso de cámara, Chrome y Safari ponen las IP locales reales en los candidatos (si no, Chrome usa
  nombres .local y Safari puede no dar candidatos locales). `DragQR.soltar(stream)` la apaga.
- `DragQR.escaner(video, {alLeer, filtro?, alError?})` → `{iniciar(): Promise<void>, detener()}`. Cámara de atrás
  (`facingMode: {ideal: 'environment'}`, ~1280×720), `<video playsinline muted autoplay>`. ~10 lecturas por segundo:
  `BarcodeDetector` si existe y soporta 'qr_code' (Android Chrome); si no, jsQR sobre el cuadro reducido a ≤ 720 px
  (iPhone no tiene BarcodeDetector). Solo llama `alLeer(texto)` si `filtro(texto)` es verdadero (p. ej. empieza con
  "DT1"), una sola vez, y se detiene solo. `detener()` apaga la cámara.

## enlace.js → `window.DragEnlace`

- `DragEnlace.crear({rol: 'anfitrion' | 'invitado', stun?: boolean})` → objeto `E`:
  - `E.oferta()` (anfitrión) → `Promise<string>` código "DT1o…".
  - `E.responder(codigoOferta)` (invitado) → `Promise<string>` código "DT1a…".
  - `E.aceptar(codigoRespuesta)` (anfitrión) → `Promise<void>`.
  - `E.estado`: 'nuevo' | 'esperando' | 'conectando' | 'conectado' | 'desconectado' | 'fallo' | 'cerrado'.
  - `E.on('estado', fn)`, `E.on('mensaje', fn(obj))`, `E.on('reloj', fn(reloj))`.
  - `E.enviar(obj)` → `boolean` (JSON por el canal confiable; false si no está abierto).
  - `E.reloj` = `{listo, offset_ms, error_ms, rtt_ms, n}` con offset = reloj del otro − reloj propio (ms).
  - `E.aLocal(tOtroMs)` → ms en mi `performance.now()`; `E.aOtro(tLocalMs)`.
  - `E.cerrar()`.
- Dos canales negociados (sin `ondatachannel`): id 0 'ctl' confiable y ordenado (mensajes), id 1 'reloj' sin orden y sin
  reintentos (pings). Los dos lados mandan pings: 20/s los primeros 2 s después de abrir, luego 4/s, mientras esté
  conectado. Cada ping lleva t1; el otro contesta con t1 y su hora t2 (al recibir, sin esperar). Al volver: t4.
  rtt = t4 − t1; offset = t2 − (t1 + t4) / 2.
- `DragEnlace.EstimadorReloj` (puro, se prueba en Node): `agregar(t1, t2, t4)`; `estimar()` → `{listo, offset_ms,
  error_ms, rtt_ms, n}`. Usa las muestras de los últimos 60 s; se queda con las de menor rtt (las del 25 % más rápido o
  rtt ≤ mínima + 2 ms) y, si abarcan ≥ 10 s, ajusta una recta (deriva de los cristales, 10–50 ppm) y evalúa en el
  momento actual; si no, la mediana. `listo` con ≥ 8 muestras. `error_ms` ≈ máx(rtt mínima / 2, dispersión).
- Códigos: "DT1" + 'o' u 'a' + base64url(deflate-raw(SDP recortado)) con `CompressionStream` (si no existe, sin
  comprimir con 'O'/'A'). `DragEnlace.empacar(tipo, sdp)` / `desempacar(codigo)` → Promise, para pruebas. Recorte del
  SDP: solo candidatos UDP, IPv4 primero (IPv6 solo si no hay IPv4), máximo 4; sin `a=extmap-allow-mixed` ni
  `a=msid-semantic`. Se espera a juntar candidatos (icegatheringstate 'complete') hasta 2.5 s.
- Sin servidores: `iceServers: []`. Con `stun: true` agrega `stun:stun.l.google.com:19302` (solo si hay internet y
  Daniel lo acepta; por ahora apagado).

## carrera_nucleo.js → `window.DragCarreraNucleo` (puro; también `module.exports`)

- `SECUENCIA` como Práctica: Pro ámbar [0, .4) los tres, verde .4; Full ámbar [0,.5), [.5,1), [1,1.5), verde 1.5 (s).
- `programa({arbol, t0, azar})` (ms): pre-stage en t0, stage en t0 + 1000, primer ámbar en stage + 1000 + 1500·azar
  (azar ∈ [0,1)), verde según la secuencia. Devuelve `{arbol, tPre, tStage, tArbol, tVerde, tAmbar: [[ini,fin]×3],
  tFin}` (tFin = verde + 1200: ahí se quita el árbol de la pantalla).
- `moverPrograma(prog, deltaMs)` → copia con todos los tiempos + delta (para pasarlo al reloj del otro).
- `luces(prog, t)` → `{pre, stage, ambar: [b, b, b], verde}` en el instante t (ms). Pre y stage siguen prendidas hasta
  tFin.
- `resultadoPropio({R, tVerde, tUltimoAmbar, ajusteMs, arbol, dist})` → resultado compacto (lo que se manda al otro):
  `{ok, motivo?, rt_verde, rt_boleta, roja, et, v_kmh, hitos: [{n, t, v}], completo, metodo}`. R = salida de
  `DragCore.procesar` (R.tRo en s). tVerde y tUltimoAmbar en ms (marca del cuadro de rAF en que se pintó).
  rt_verde = R.tRo − tVerde/1000 − ajusteMs/1000. roja si rt_verde < 0. rt_boleta = rt_verde + .400 (Pro) / .500 (Full).
  et = tiempo del hito a la distancia elegida (`R.hitos[].dist_m`), v_kmh = trampa si es la meta. Sin R.ok →
  `{ok:false, motivo: R.mensaje}`.
- `ganador(izq, der, opts?)` → `{ganador: 'izq'|'der'|null, regla, margen, dudosa, texto}`. Reglas de pista (como
  Práctica): roja pierde; dos rojas: pierde quien salió primero (rt_verde más negativa); si nadie dio roja gana la
  menor rt_verde + et (quien llega primero a la meta); quien no terminó pierde contra quien sí; nadie → null.
  Empate si margen < 0.0005 s. `dudosa` si margen < `opts.margenDudoso` (0.10 s): el texto lo dice ("muy cerrada,
  dentro del margen de error de la app").
- `filasTicket(izq, der, {dist, formato})` → filas para la boleta de dos columnas: R/T (formato boleta o desde la verde,
  como Práctica), 60', 330', 1/8 y velocidad, 1000' y 1/4 con velocidad si la distancia es 1/4. Textos con 3 decimales.

## carrera.js (pantallas) y cambios en app.js

- En Medir, el cuadro "Race 1 vs 1" del semáforo abre la carrera (ya no despliega "en desarrollo").
- Pantalla completa `#rc`: inicio (Crear carrera / Unirme / Probar con rival simulado; aviso de red: un teléfono
  prende su punto de acceso y el otro se conecta, no necesita internet) → emparejar con dos QR (paso 1 de 2 / 2 de 2,
  con respaldo de copiar y pegar el código) → sala (los dos carriles, quién es quién, sensores, árbol Pro/Full y
  distancia que elige quien creó la carrera, sincronía) → "Listo: ya estamos alineados" en los dos teléfonos → árbol
  (pre-stage, stage, ámbar, verde) → la medición normal sigue (pantalla neutral) → boleta de los dos carriles con
  ganador → otra carrera.
- app.js expone `window.DragApp` (sensores, armar para carrera con su distancia, alimentar sensores simulados, hook al
  terminar y al mostrar, guardar, mostrar resultado). La corrida se guarda con `run.race` (rival, ganador, programa,
  sincronía) y el Historial la marca como Race 1 vs 1.
