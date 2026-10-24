# Integración en la app: "Medir con el semáforo real" (beta 0.6)

Lo comprobé en el Chromium headless de este contenedor con scripts de prueba en `/tmp/claude-0/-home-user-dragtrim/a65c5199-085f-508d-960e-9da2e6ab558f/scratchpad/cam/`. Todo lo que dice "verificar en teléfono" todavía no está probado.

- **Cámara falsa de Chromium** (`--use-fake-device-for-media-stream --use-file-for-fake-video-capture=árbol.y4m`): `requestVideoFrameCallback` (rVFC) entrega `captureTime`. `now − captureTime` da unos 2.6 ms.
- **Cámara simulada en JS** (`canvas.captureStream(60)` en lugar de `getUserMedia`): `captureTime` sale `null`. `presentationTime` queda a menos de 1 ms de la hora en que se pintó el cuadro.
  - Sirve para la prueba de punta a punta con la reacción conocida.
  - También prueba el camino sin `captureTime`, que puede ser el de iPhone.
- **Video oculto:** rVFC funciona con `display:none`, fuera del DOM y a 2×2 px. En iOS hay que usar 2×2 px con opacidad 0.01, nunca `display:none`.
- **Video de archivo** (WebM de 60 fps, Full .5): `mediaTime` de la verde dio exactamente 2.500. Reproducido a 0.5× se saltó algún cuadro: el primer ámbar salió en 1.017 en lugar de 1.000. Por eso el análisis de video necesita una segunda pasada cuadro por cuadro.
- `MediaStreamTrackProcessor` existe en Chromium. Queda como camino rápido opcional, no para la v1.

## 0. Decisiones principales

1. **En vivo no se analiza nada.** Durante la medición la cámara solo guarda cuadros pequeños con su hora en un anillo de memoria. La búsqueda del árbol se hace **después**, en `finalizar()`, alrededor del `t0`/`tRo` de `procesar()`. Así es imposible dar pistas, y además se puede probar.
2. **`dragcore.js` y MATLAB no cambian.** La reacción se calcula fuera de `procesar()`, con la fórmula RT = `tRo − t_verde + ajuste`. No hace falta tocar `drag_procesar.m` ni regenerar `Drag_tree_v2_unico.m`.
3. **Un solo reloj:** `performance.now()/1000`, el mismo que ya usan el GPS y el acelerómetro. La hora del cuadro es `captureTime`; si no hay, `presentationTime`; si no, el `now` de la llamada. Se guardan los tres y la fuente usada.
4. **Se guarda lo crudo** (rasgos por cuadro de **las dos** columnas del árbol, más imágenes JPEG del árbol). Así se puede reanalizar al cambiar carril, árbol, rollout o ajuste, y mejorar el algoritmo con datos reales sin volver a la pista.
5. **Reacción en dos formatos, igual que Práctica:**
   - `rt_verde = tRo − t_verde` (perfecta .000).
   - `rt_boleta = rt_verde + perfecta` (.400 Pro / .500 Full).
   - `t_verde` es la referencia que se obtiene juntando el ámbar o los ámbar medidos y la verde, con la tabla fija del árbol. Si no se vio la verde (porque se prendió la roja), sale de los ámbar.
6. **Retrasos:** un ajuste por teléfono, `ajuste_s = L_cam − L_acc`, que se suma al RT. Se guarda en Ajustes, se calibra con la boleta y se aplica también al recalcular.
7. **La cámara solo está prendida mientras hay una medición armada** (y en la pantalla Apuntar). Se apaga 0.3 s después del evento `arranque` del DetectorVivo.

## 1. Módulos y cómo los junta build.py

| Archivo | Tipo | Qué hace |
|---|---|---|
| `fuente/app/src/semaforo.js` (nuevo) | Puro, UMD como `dragcore.js` (`window.Semaforo` / `module.exports`), sin DOM | Anillo de cuadros, localizar el árbol, rasgos por foco, buscar la secuencia, reacción, CSV, simulador de árbol |
| `fuente/app/src/camara.js` (nuevo) | IIFE de navegador → `window.DragCam` | `getUserMedia`, `<video>` y bucle rVFC, recorte al canvas, `Lector`, pantalla Apuntar, Analizar un video, JPEG |
| `fuente/app/src/app.js` | Ganchos | Ajustes, sesión, `finalizar`, resultado, historial, recalcular, exportar, demo |

En `index.template.html` las etiquetas de script quedan en este orden: `/*CORE*/ /*SEMAFORO*/ /*CAMARA*/ /*APP*/ /*PRACTICA*/ /*ROOSTER*/ /*CALC*/`. En `build.py` se agregan dos líneas `html.replace('/*SEMAFORO*/', …semaforo.js)` y `('/*CAMARA*/', …camara.js)`, y `VERSION = 'beta-0.6'`. `APP_VERSION = 'beta 0.6'`. `sw.js` y el manifest no cambian, porque todo va dentro del `index.html`.

**Regla:** `app.js` llama siempre como `Semaforo.x(...)`, sin desestructurar, para que las pruebas puedan espiar. `Semaforo._llamadas` cuenta las llamadas de análisis.

## 2. Flujo en Medir

### 2.1 Campo en Medir

Reemplaza la tarjeta `.proximo` "Medir con el semáforo real". La tarjeta de Race 1 vs 1 se queda como está.

```
[field] Leer el semáforo con la cámara  [beta]                      [toggle #inCam]
  hint: La cámara de atrás mira el árbol y al final la app calcula tu reacción.
        No te avisa nada durante la corrida.
  (si está activo)
  Carril:  [Izquierdo][Derecho]   (#segCamCarril — se recuerda; cambia en cada pasada)
  Árbol:   [Automático][Pro .4][Full .5]   (#segCamArbol)
  línea de estado #camEstado: "Cámara lista: 1280×720 a 60 cuadros/s" | "Sin probar" |
        "Sin permiso de cámara" | "Este navegador no puede leer la cámara"
  [Apuntar y probar la cámara] (#btnApuntar)   [Analizar un video] (#btnVideo)
```

- En el encabezado va un chip `#chipCam` ("Cám"), visible solo si `S.cam`. Tiene los mismos estados `on`/`warn`/`bad` que los otros chips, y su estado **solo** depende de que lleguen cuadros. Hay que revisar que quepa en 320 px; si no cabe, se oculta la etiqueta "Pantalla".
- "Antes de salir a la pista": agregar una viñeta "Con la cámara: arma la medición ya en la fila o la caja de agua; la cámara se prende solo mientras está armada."

### 2.2 Pantalla "Apuntar y probar" (`#camOverlay`)

Es una capa de pantalla completa como `#ptOverlay`, con `body.camara` (sin pestañas). Solo se abre **sin** medición armada.

- **Vista previa:** el `<video id="camVideo">` grande, con `object-fit: contain`, y encima un `<canvas id="camMarcas">`. Dibuja la zona de recorte, las luces encendidas que detecta `Semaforo.calidad` (≤ 5 Hz) y, si lo encuentra, el árbol con **tu** columna resaltada.
- **Controles:**
  - Carril. También se puede **tocar tu columna** en la imagen: el toque define la zona y el carril.
  - Árbol.
  - Zona: [Chica][Mediana][Toda la imagen]. Por defecto "toda la imagen" o la zona aprendida.
  - Cámara: [Principal][Gran angular], si `enumerateDevices` muestra varias traseras. Hay que evitar las cámaras virtuales "Dual/Triple" de iPhone porque cambian de lente solas.
  - [Olvidar zona].
  - [Listo].
- **Revisión** (lista con estado bien/regular/mal):
  - Resolución y cuadros por segundo medidos. Si salen ≤ 30 con 60 pedidos: "¿modo de bajo consumo?".
  - "Hora del cuadro: de la cámara" (`captureTime`) o "de la pantalla" (pide calibrar).
  - Luz: % de píxeles quemados o imagen oscura.
  - Movimiento: diferencia entre cuadros.
  - Tiempo de proceso por cuadro (ms).
- **Modo prueba:** cada segundo `Semaforo.prueba(últimos 5 s)`. Sirve en la fila mientras corren otros autos, o en casa con Práctica en otro teléfono. Muestra "Vi un árbol Full .5: último ámbar → verde 0.498 s (±0.009)" y guarda `S.cam_ultima_prueba`. Mostrar el árbol aquí está bien porque no es una medición.
- **Ajuste de exposición:** en Chrome, 2 s después de abrir se intenta `applyConstraints({advanced:[{exposureMode:'manual', whiteBalanceMode:'manual', focusMode:'manual'}]})` si `getCapabilities()` lo trae. En iOS no existe, y queda anotado en `meta`.

Guía plegable "Cómo poner el teléfono":

- Soporte firme en el parabrisas.
- Cámara de atrás hacia adelante, sin que la tape el soporte, el limpiaparabrisas o la franja polarizada.
- En stage el árbol queda **a un lado y cerca**. Pon el teléfono del lado del árbol (carril izquierdo: centro o derecha del parabrisas; derecho: izquierda, sin tapar tu vista) y gíralo hacia él. Si cabe mejor, usa el gran angular.
- Limpia el lente y el parabrisas. Pon un trapo oscuro en el tablero para evitar reflejos.
- No lo muevas después de apuntar.
- Apaga el modo de bajo consumo.
- No lo dejes al sol directo (se calienta).

### 2.3 Durante la corrida: pantalla neutral

Estas reglas deben poder probarse:

- **Sin vista previa:** `#camVideo` pasa a `.cam-oculta` (`position:fixed; left:0; top:0; width:2px; height:2px; opacity:.01; pointer-events:none; z-index:-1`). Nunca `display:none`.
- `sesTexto` con cámara, siempre igual: "La app no da la salida: arranca con el semáforo de la pista. La cámara graba el árbol y tu reacción sale al final."
- **Nada** del DOM depende de lo que se ve en el árbol: no se analiza nada, no hay eventos del árbol, no hay `vibrate`. El único aviso de cámara es una falla ("La cámara se detuvo; reintentando") en `#eventLog` y el chip, y eso no tiene relación con las luces.

### 2.4 Cuándo está prendida la cámara

| Momento | Cámara |
|---|---|
| Medir sin armar | Apagada |
| "Activar sensores" con `S.cam` | Se pide el permiso **en el mismo toque**, después de `DeviceMotionEvent.requestPermission`: `getUserMedia` y `stop()` inmediato. No se queda prendida. |
| Apuntar / Prueba | Prendida con vista previa; se apaga al cerrar |
| "Armar medición" | `lector.iniciar()`, sin vista previa, anillo de 10 s |
| `visibilitychange` oculto, o `track` `ended`/`mute` | Se marca hueco (`perdidos`); al volver, un reintento |
| Evento `arranque` del DetectorVivo | Se apaga 0.3 s después (el anillo queda congelado) |
| Cancelar, salir o resultado | Apagada |
| Armada más de 30 min | Se apaga; chip `warn` y botón "Encender cámara" en la sesión |

- **v2:** pausa si el auto lleva 3 min detenido y se reanuda con el GPS > 1 m/s. Solo si en el iPhone de Daniel apagar y prender la cámara no vuelve a pedir el permiso; si lo pide, usar `track.enabled=false`.
- **Nota:** "Armar otra medición" vuelve a prender la cámara.

## 3. Captura (`DragCam.Lector`)

- **Restricciones:** `{video:{deviceId? , facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:60, min:24}}, audio:false}`. Se prefieren más cuadros por segundo antes que más resolución.
- **Bucle:** `video.requestVideoFrameCallback((now, md) => …)`. En cada cuadro:
  - `drawImage(video, zx, zy, zw, zh, 0, 0, cw, ch)` en un canvas `{willReadFrequently:true}`.
  - `getImageData`.
  - `anillo.push(t, rgba, {cb: now/1e3, cap: md.captureTime/1e3, pres: md.presentationTime/1e3, media: md.mediaTime, n: md.presentedFrames})`.
- **Cuadros perdidos:** saltos en `presentedFrames` > 1 suman a `perdidos`. Se mide `proc_ms`; si el promedio pasa de 8 ms, se avisa en Apuntar.
- **Recorte:** la zona en píxeles del cuadro, de `S.cam_zona[carril]` (normalizada 0–1) o el cuadro completo. Tamaño `cw×ch` con aspecto conservado y como máximo `pix_max = 14400` px (cuadro completo 16:9 → 160×90; zona cuadrada → 120×120). En stage el árbol es grande, así que basta.
- **Anillo:** un solo `Uint8Array(capacidad·cw·ch·3)` reservado una vez (10 s × 60 fps × 43 KB ≈ **26 MB**), más `Float64Array` de tiempos. Sin basura por cuadro.
- **Zona aprendida:** después de una lectura buena, `S.cam_zona[carril]` = caja del árbol × 2 (mínimo 25 % del cuadro), en coordenadas normalizadas. Se borra con "Olvidar zona".

## 4. Búsqueda de la secuencia: cuándo y dónde

En `finalizar()`, después de `procesar()` y solo si `R.ok`:

1. `cuadros = lector.congelar(R.t0 − 8, R.t0 + 1.5)` (el lector ya se detuvo).
2. `Semaforo.analizar(cuadros, {carril, arbol, t0: R.t0, tRo: R.tRo, ajuste_s, prior: zona/toque})`:
   - **`localizar`:** busca el árbol en el periodo quieto de stage, antes de `t0`, cuando las luces de pre-stage y stage están prendidas. Da los focos de las dos columnas.
   - **`rasgos`:** valores por foco y por cuadro.
   - **`buscarSecuencia`:** solo en la ventana `[tRo − 4.0, tRo + 0.6]` (Full: los ámbar empiezan 1.5 s antes de la verde; RT de −1.0 a +1.5).
     - Elige la **última** secuencia coherente con la tabla del árbol antes de `tRo + 0.6`. Así ignora las salidas de los autos de adelante, que también se graban.
     - Con `arbol:'auto'` decide entre un ámbar o tres ámbar a 0.5 s.
     - Roja: si `rt_verde < 0` o si se vio la roja de tu columna. Si los dos datos no coinciden, se agrega un aviso.
3. Si `!R.ok`, se guardan los rasgos alrededor de `ses.det.tArr` solo como diagnóstico (`motivo:'sin_corrida'`).
4. Todo va en `try/catch`. Si falla, la corrida se guarda igual con el aviso "No se pudo leer el semáforo: <error>".

El algoritmo de visión (localizar, rasgos, interpolación dentro del cuadro, fusión) lo define el otro módulo. La integración solo fija las firmas y el formato de los datos (sección 9).

## 5. Resultado

- **Boleta (`.slip`):** primera fila `R/T` con `rt_boleta` (como el ticket). Si hay roja, sello `LUZ ROJA`. Si la confianza es baja, el valor va en gris con "?".
- **KPIs:** tarjeta "Reacción". En grande va el formato que eligió en Práctica (`LS 'dragtrim.practica.cfg'.formato`) y abajo el otro. Usar `Semaforo.fmtRT(rt, tipo, formato)`, copiado de Práctica, sin tocar `practica.js`.
- **Sección "Semáforo"** en Calidad:
  - Árbol detectado (Pro .4 / Full .5) y carril.
  - Confianza: alta / media / baja (±X ms).
  - Último ámbar → verde medido (0.401 contra 0.400).
  - Fuente de la hora.
  - Ajuste aplicado: "+0 ms, sin calibrar".
  - Cámara: resolución, fps y cuadros perdidos.
- **Imagen de revisión:** los cuadros del árbol de ±0.5 s alrededor de la verde, en un canvas, con la verde marcada.
- **Acciones:**
  - [Cambiar a carril derecho/izquierdo] y [Árbol Pro/Full]: llaman a `reanalizar` con los rasgos guardados y vuelven a guardar.
  - "R/T de tu boleta: [___] [Guardar]": guarda `run.boleta.rt_boleta` para calibrar.
  - [Revisar a mano] (fase 2): el piloto toca el primer cuadro con la verde (o el último ámbar). Queda `run.cam.manual = {t, que}`, con ±½ cuadro, marcado "(a mano)".

Si no se leyó, se muestra "Sin lectura del semáforo: …", con la imagen si la hay:

| motivo | Mensaje / qué hacer |
|---|---|
| `sin_permiso` | No hubo permiso de cámara. Pasos para iOS (Ajustes › Safari › Cámara) y Chrome (candado › Permisos). |
| `no_soportado` | Este navegador no puede leer la cámara. |
| `sin_cuadros` / `camara_detenida` | La cámara no grabó cerca de tu salida (¿app en segundo plano?, ¿calor?). |
| `ventana` | El arranque se confirmó tarde y el árbol ya no estaba guardado. |
| `sin_arbol` | No encontré el árbol en la imagen. Usa Apuntar; mira la imagen de la corrida. |
| `sin_secuencia` | Vi el árbol, pero no el ámbar ni la verde antes de tu salida. Prueba el otro carril o revisa a mano. |
| `ambigua` | Vi más de una posible secuencia. Revisa a mano. |
| `calidad` | Imagen muy oscura, quemada o movida. Revisa reflejos y limpia el lente. |
| `sin_corrida` | No hubo arranque válido. |

## 6. Datos

**IndexedDB:** el mismo store `runs`, sin cambio de versión. Las corridas viejas sin `cam` no cambian.

```js
run.cam = {
  v: 1, semaforo: Semaforo.VERSION,
  cfg: { carril, arbol },                       // de ESTA corrida (cambian por pasada)
  ajuste_s,                                     // con el que se calculó (el vigente es S.cam_ajuste_ms)
  camara: { W, H, fps_pedido, fps_medido, perdidos, fuente_t, proc_ms, etiqueta, settings, bloqueos },
  zona: [x,y,w,h] /*px del cuadro*/, recorte: [cw,ch],
  disp,                                         // Disposicion o null
  rasgos: { t: Float64Array, cols: [...], datos: Float32Array, tiempos: {cb,cap,pres,media,n} },  // [t0−8, t0+1.5]
  tira:  { jpg: Uint8Array, w, h, cols, t: [...] } | null,   // caja del árbol, todos los cuadros ±0.5 s de la verde
  vista: { jpg: Uint8Array, w, h, cols, t: [...] } | null,   // recorte completo [t0−4, t0+0.5]; todos los cuadros si S.cam_cuadros, si no a 4 Hz
  sec, rt,                                      // Secuencia y Reaccion (sección 9)
  manual: null | { t, que: 'verde'|'ambar' },
  motivo: null | 'sin_permiso' | ...
};
run.boleta = null | { rt_boleta, tipo }         // general: después se agregan t_60ft, t_1_8… para "calibrar con boleta"
```

- Tamaño: unos 0.3 MB de rasgos más 0.05–1.5 MB de JPEG (cuadros completos activos por defecto en la beta, para validar).
- Los JPEG se hacen con `canvas.toBlob('image/jpeg', 0.9)` y se guardan con `await` antes de `DB.put`.
- Se guarda `Uint8Array`, no `Blob`, porque es más seguro en Safari.

**Recalcular:** después de `aplicarR(run, R)`, si hay `run.cam?.rasgos` y `R.ok`:
- `Object.assign(run.cam, Semaforo.reanalizar(run.cam.rasgos, {carril: run.cam.cfg.carril, arbol: run.cam.cfg.arbol, t0: R.t0, tRo: R.tRo, ajuste_s: S.cam_ajuste_ms/1e3}))`.
- Si hay `manual`, se usa `reaccion({t_verde: manual…}, R.tRo, …)`.
- Mensaje: "Recalculada con rollout X ft, ajuste de reacción Y ms."

**Historial:** a la línea de abajo se agrega `, RT 0.622` o `, roja`.

**Exportar:** `zip()` acepta `f.data` (Uint8Array) además de `f.text`. Archivos nuevos:

- `drag_raw_cam_<sello>.csv`: una fila por cuadro. Columnas:
  - Tiempos: `t_s, t_llamada_s, t_captura_s, t_presentacion_s, t_media_s, n_presentados, fondo_y, mov`.
  - Por columna (`izq`/`der`) y foco (`pre, stg, a1, a2, a3, g, r`): `_y` (luma media), `_c` (color propio), `_pk` (percentil 90) y `_q00.._q11` (cuadrantes, para el obturador rodante en cualquier orientación).
  - El módulo de visión puede agregar columnas. El contrato: cabecera con nombres, tiempos crudos, y descripción en `meta.columnas`.
- `drag_raw_cam_meta_<sello>.json`: `semaforo, cfg, ajuste_s, camara, zona, recorte, disp, sec, rt, boleta, columnas, tira/vista (índices y t)`.
- `drag_cam_tira_<sello>.jpg` y `drag_cam_vista_<sello>.jpg`.
- `drag_raw_meta_*.json` suma `semaforo: {rt_boleta, rt_verde, tipo, roja, nivel}`.
- DRAGPACK: clave nueva de primer nivel `reaccion: {…}`, sin tocar `resultados`, por compatibilidad con la v1. `drag_reprocesar.m` ignora los archivos nuevos.

## 7. Analizar un video (`#vidOverlay`)

- Abre con `<input type="file" accept="video/*">`, sin `capture`, para poder elegir de Fotos o Archivos.
- Usa los mismos controles de zona, carril y árbol que Apuntar.
- `DragCam.leerVideo(file, …)`:
  - **Pasada 1:** `playbackRate = min(1, 30/fps_estimado)` y rVFC. La hora es `mediaTime` (`fuente_t:'archivo'`). Los huecos se ven en `presentedFrames`/`mediaTime`.
  - **Pasada 2:** busca cuadro por cuadro (`currentTime = (k+0.5)/fps` y rVFC) en ±0.25 s alrededor de cada cambio que encontró.
- Usa `Semaforo.prueba` y muestra una lista de secuencias: tipo, horas del ámbar y la verde, separación medida contra la de la tabla, ±error.
- **Cámara lenta:** si la separación sale ≈ k × 0.4/0.5 (videos de cámara lenta exportados a 30 fps), se detecta `escala = k` y se corrige ("Video en cámara lenta ×8").
- [Exportar análisis] genera un zip con el CSV y el meta. No se guarda en el historial.
- **Prueba en casa:** Práctica en el teléfono B, con brillo al máximo para que la pantalla no parpadee (PWM), grabado con A en vivo (Apuntar) o con la cámara lenta normal y luego Analizar.

## 8. Ajuste y calibración (ganchos)

- **Ajustes,** campo nuevo "Semáforo con cámara (beta)":
  - "Corrección de la reacción de este teléfono" (`#inCamAjuste`, en ms, de −150 a 150).
  - "Con N boletas: tu teléfono marca X ms (mediana, rango) [Usar]". Calcula `mediana(rt_boleta_i − rt_boleta_med_i)`, con `rt_med` recalculado con ajuste 0 y el rollout actual. Se ofrece desde 3 boletas.
  - [Olvidar zonas del árbol].
  - "Guardar los cuadros del árbol (para mejorar la app)" (`S.cam_cuadros`, prendido en la beta).
- **Orden recomendado:** primero rollout y retraso GPS, luego el ajuste del RT, porque el rollout también mueve `tRo`.
- **Golpecitos (opcional, fase 2):** golpecitos al soporte, vistos por la cámara y por el acelerómetro, miden directamente `L_cam − L_acc`. La API sería `DragCam.calibrarGolpes()`.

## 9. API exacta

```js
// ---- semaforo.js (puro)
Semaforo.VERSION = 'semaforo v1';
Semaforo.ARBOLES = { pro: {nombre:'Pro .4', ambar:[0,0,0], verde:0.400, perfecta:0.400},
                     full:{nombre:'Full .5', ambar:[0,0.5,1.0], verde:1.500, perfecta:0.500} };
Semaforo.FOCOS = ['pre','stg','a1','a2','a3','g','r'];
Semaforo.defaultConfig() → { carril:'izq', arbol:'auto', ajuste_s:0, anillo_s:10, fps:60, pix_max:14400,
   buscar_antes_s:4.0, buscar_despues_s:0.6, rt_min_s:-1.0, rt_max_s:1.5,
   guardar_antes_s:8, guardar_despues_s:1.5, tira_s:0.5, vista_antes_s:4, vista_hz:4 }
class Semaforo.Anillo { constructor({w,h,capacidad}); push(t, rgba, tiempos); get n; get t0; get t1;
   congelar(tA=-Inf, tB=Inf) → Cuadros; vaciar() }
// Cuadros = { w,h,n, t:Float64Array, rgb:Uint8Array(n·w·h·3), tiempos:{cb,cap,pres,media:Float64Array,n:Int32Array},
//             fuente_t, zona:[x,y,w,h], orig:[W,H], escala:1 }
Semaforo.localizar(cuadros, {carril, t_ref, prior}) → Disposicion
//  { ok, motivo, puntaje, caja:[x,y,w,h], angulo, focos:{izq:{pre:{x,y,r},…,r:{…}}, der:{…}} }
Semaforo.rasgos(cuadros, disp) → Rasgos      // { t, cols, datos:Float32Array(n·ncols), tiempos, fuente_t }
Semaforo.buscarSecuencia(rasgos, {carril, arbol, t0, tRo, cfg}) → Secuencia
//  { ok, motivo, tipo, carril, t_ambar:[], t_verde_vista, t_roja_vista, t_verde /*fusionada, sin ajuste*/,
//    gap_s, error_s, nivel:'alta'|'media'|'baja', candidatos, avisos:[] }
Semaforo.reaccion(sec | {t_verde, tipo}, tRo, {ajuste_s}) → Reaccion
//  { ok, motivo, rt_verde, rt_boleta, perfecta, tipo, roja, roja_vista, error_s }
Semaforo.analizar(cuadros, ctx) → { disp, rasgos, sec, rt }    // ctx = {carril, arbol, t0, tRo, ajuste_s, prior, cfg}
Semaforo.reanalizar(rasgos, ctx) → { sec, rt }
Semaforo.prueba(cuadros, {carril, arbol}) → Secuencia[]         // sin t0 (Apuntar, video)
Semaforo.calidad(rgba, w, h) → { brillo, saturado, mov, focos:[{x,y,r,color}] }
Semaforo.tira(cuadros, disp|null, tA, tB, {alto, hz}) → { w,h,cols,n,t:[], rgba }
Semaforo.aCSV(rasgos) → string;  Semaforo.deCSV(texto) → Rasgos
Semaforo.fmtRT(rt, tipo, formato) → string
Semaforo.simularArbol(opts) → { cuadros, verdad }
//  opts: {tipo, fps, w, h, t_ambar, t_inicio, t_fin, otro_desfase_s, roja, ruido, vibracion_px, ae_deriva,
//         perdidos, rotacion, fuente_t, previa_s, seed};  verdad: {t_ambar[], t_verde, t_roja, disp}
Semaforo._llamadas = { analizar:0, prueba:0, calidad:0 }        // para pruebas de neutralidad

// ---- camara.js (navegador)
DragCam.soporte() → {ok, motivo}
DragCam.permiso() → Promise<'granted'|'denied'|'prompt'|'?'>
DragCam.pedirPermiso() → Promise<{ok, motivo}>
DragCam.camaras() → Promise<[{id, etiqueta, tipo:'principal'|'gran_angular'|'otra'}]>
class DragCam.Lector { constructor({video, cfg, deviceId, zonaNorm, vista:false});
   iniciar() → Promise<{ok, motivo, settings}>; detener(); congelar(tA,tB) → Cuadros; setZona(norm);
   estado() → {activo, fps, perdidos, fuente_t, W, H, ultimo_s, proc_ms};
   alCuadro /*solo Apuntar*/; onfalla(motivo) }
DragCam.leerVideo(file, {zonaNorm, cfg, alProgreso}) → Promise<Cuadros>
DragCam.abrirApuntar({S, guardar}); DragCam.abrirVideo({S}); DragCam.jpeg(tira) → Promise<Uint8Array>
```

**`app.js`:**
- `DEF` suma `cam:false, cam_carril:'izq', cam_arbol:'auto', cam_ajuste_ms:0, cam_disp:'', cam_zona:{izq:null,der:null}, cam_cuadros:true`.
- `camCfg()` nueva.
- `activarSensores`: llama a `pedirPermiso`.
- `armar`: `ses.lector = new DragCam.Lector(…)` e `iniciar()`.
- `alGps`, en `arranque`: `setTimeout(() => ses.lector?.detener(), 300)`.
- `salirSesion`: detiene el lector.
- `finalizar`: analiza y guarda `run.cam` (sección 4).
- `construirRun` y `recalcular`: sección 6.
- `mostrarResultado`: sección 5.
- `pintarHistorial` y `exportar`: sección 6.
- `chips` y `tickEstado`: `#chipCam`.
- Demo con `S.cam`: alimenta un `Semaforo.Anillo` con `simularArbol({t_verde: sim.verdad.t_ro_abs − rtAlAzar})` usando las horas de la simulación.
- `window.__dragtrim` expone `lector`.

## 10. Pruebas

**Node:**
- `fuente/pruebas/semaforo_mc.js`: Monte Carlo de `simularArbol`. Casos: Pro/Full, 30/60 fps, fase al azar, ruido, vibración, AE, cuadros perdidos, rotación 90°, secuencia previa 40 s antes, otro carril con desfase (handicap), roja, cámara lenta. Revisa:
  - Tasa de lectura.
  - Error de `t_verde` (p50/p95).
  - Cero lecturas en el carril equivocado.
  - Roja detectada.
  - Que el `±error_s` reportado cubra el error real.
  - Sale con código 1 si algo falla.
- `fuente/pruebas/reaccion.js`: `simularSesion` + `simularArbol` alineados → `procesar` → `analizar`. Revisa:
  - Error del RT.
  - Roja con RT programado de −0.05.
  - Que `reanalizar` tras cambiar el rollout dé ΔRT = ΔtRo.
  - Que `aCSV` → `deCSV` → `reanalizar` dé el mismo `rt` (±1e-6).

**Playwright: `fuente/pruebas/camara_test.py`** (los videos se generan con numpy/ffmpeg en `capturas/`):
- **A. Punta a punta:**
  - Ajustes con `cam:true`, el mock GPS/acelerómetro de `uitest` y `getUserMedia` reemplazado por `canvas.captureStream(60)`, con un árbol Pro cuya verde se pinta en `t_ro_abs − 0.35` de la simulación (semilla con stage ≥ 1.5 s).
  - Espera: `rt_verde ≈ 0.35 ± 0.03`, `rt_boleta ≈ 0.75`, `tipo 'pro'`.
  - **Neutralidad:** `innerHTML` de `#medirSesion` y `.sensors` igual antes del ámbar, durante el ámbar y en la verde. `Semaforo._llamadas` en 0 hasta `procesando`. Sin llamadas a `navigator.vibrate`. `#camVideo` de ≤ 4 px y opacidad ≤ 0.05.
  - La cámara se apaga después del arranque y al cancelar, y vuelve con "Armar otra".
- **B. Apuntar:** Chromium con `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture=<árbol.y4m>` (30 fps). Revisa fps, "de la cámara" (`captureTime`), la secuencia del modo prueba, el toque que define la zona, el carril y las capturas.
- **C. Video:** WebM VP8 de 60 fps Full y Pro, más uno ×8 con `setpts=8*PTS` a 30 fps, cargados con `set_input_files`. Separaciones 0.500/0.400 ± 0.017 y escala ×8.
- **D. Historial y exportar:**
  - El zip trae el CSV (cabecera y filas), el meta y los JPEG.
  - Recalcular con rollout 0 cambia el RT según `tRo`.
  - "Cambiar carril" usa la otra columna, que en la prueba tiene un desfase conocido.
- **E. Permiso negado:** el mock rechaza con `NotAllowedError`. Aparece el mensaje en español, la corrida se mide sin cámara y el resultado dice "sin_permiso".
- **Siguen pasando sin cambios:** `mc.js`, `inicio.js`, `spike.js`, `uitest.py demo|real`, `pt_test.py`, `brillo_test.py`, `instalar_test.py`, `calc.js`, `calc_test.py`. Como `cam` viene apagado por defecto, no corre nada de cámara.

## 11. Archivos

- **Crear:**
  - `fuente/app/src/semaforo.js`
  - `fuente/app/src/camara.js`
  - `fuente/pruebas/semaforo_mc.js`
  - `fuente/pruebas/reaccion.js`
  - `fuente/pruebas/camara_test.py`
- **Cambiar:**
  - `fuente/app/src/index.template.html`: campo en Medir en lugar de la tarjeta, `#chipCam`, `#camOverlay`, `#vidOverlay`, `<video id="camVideo" playsinline muted>`, campo en Ajustes, viñeta de la guía y los dos placeholders.
  - `fuente/app/src/style.css`: `.cam-*`, `.cam-oculta`, la imagen de revisión, la fila R/T de la boleta y la versión con fondo sticker `:root[data-fondo] .cam-…`.
  - `fuente/app/src/app.js`
  - `fuente/app/tools/build.py`
  - `CLAUDE.md`: punto 13, archivos y pruebas.
  - Al publicar: `archivo/LEEME.md` y `archivo/versiones/drag_beta_0.6.html`.
- **No se tocan:** `dragcore.js`, `fuente/matlab/*` y `practica.js`. Idea opcional para después: "árbol en bucle para probar la cámara" en Práctica.

## 12. Fases y lo que falta verificar en teléfonos reales

- **Fase 1:** `semaforo.js` con el simulador, `Lector`, Apuntar básico, análisis después de la corrida, resultado, guardado, exportar, recalcular, Analizar un video y las pruebas A–E.
- **Fase 2:** revisión a mano, zona aprendida, calibrar con boletas, pausa por quietud, golpecitos, `MediaStreamTrackProcessor` en Chrome y carril `'auto'` (la luz de stage de tu columna se prende cuando el auto se detiene).

**Por verificar en el iPhone de Daniel y un Android:**
1. rVFC con el video de 2 px dentro de la app instalada (si no, probar 32 px).
2. Si iOS entrega `captureTime`. Si no, que el desfase de `presentationTime` sea estable.
3. 60 fps a 720p con la cámara principal y la gran angular, y la caída a 30 fps en modo de bajo consumo.
4. Si vuelve a pedir el permiso al apagar y prender la cámara.
5. Calor después de 15–30 min.
6. Memoria (26 MB) y espacio en IndexedDB (1–2 MB por corrida).
7. Cambio de lente en las cámaras virtuales.
8. Sin bloqueo de exposición en iOS.
9. Reflejos y polarizado.

**Estimación sin probar:** la cámara agregaría un sesgo de 20–60 ms al RT antes de calibrar, y ±10–15 ms ya calibrada.

**Race 1 vs 1:**
- Reusa `Lector` (también para leer QR) y `Semaforo.reaccion` (RT = `tRo − t_verde + ajuste`; ahí `t_verde` sale de rAF).
- En una pista con árbol pero sin cronometraje, cada teléfono mide RT y ET contra **su** lectura del mismo árbol, así que se pueden comparar sin sincronizar relojes.