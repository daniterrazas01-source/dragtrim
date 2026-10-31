# Capacidades de la plataforma web para "Medir con el semáforo real" (cámara + sensores)

**Nota sobre las fuentes:** en este contenedor WebFetch y curl no tenían salida (falla de DNS o el proxy da 403). Todo viene de los resúmenes de WebSearch (enlaces al final). Lo marcado **[verificar]** no tiene una fuente firme y hay que medirlo en el teléfono con la página de prueba de la sección 8. Del código revisé `fuente/app/src/app.js`: `onMotion` ya acepta `e.timeStamp` en época o relativo a `timeOrigin`, y `pedirPantalla` ya pide Wake Lock. La app no usa `location.hash`, `pushState` ni `history` (eso importa en la sección 5).

## 0. Resumen
- La cámara trasera funciona en las dos plataformas, también en la PWA instalada de iOS (desde iOS 13.4). Lo realista es **60 fps en iPhone** y **30 o 60 fps en Android según el fabricante**. Para 120/240 fps no hay ninguna vía web documentada.
- El error de cuantización es ±½ cuadro: σ≈4.8 ms a 60 fps y σ≈9.6 ms a 30 fps. Para bajarlo hay dos trucos: promediar con los intervalos conocidos del árbol (.400 / .500) y usar la fracción de brillo cuando la exposición es larga.
- **El mejor sello de tiempo** es el del cuadro capturado, no el de llegada:
  - `metadata.captureTime` de requestVideoFrameCallback (rVFC), si existe;
  - si no, `VideoFrame.timestamp` de MediaStreamTrackProcessor (MSTP);
  - si no, `mediaTime` de rVFC.
  - Ese reloj se ancla a `performance.now()` con la envolvente inferior de (llegada − sello), más una calibración cámara↔acelerómetro hecha con el giroscopio.
- **iOS no deja controlar exposición ni foco.** Solo zoom, balance de blancos (`whiteBalanceMode`) y linterna (`torch`). Chrome Android sí expone exposición, ISO, foco y puntos de interés, según el dispositivo. La detección tiene que ser relativa y aguantar los cambios de la exposición automática.
- Hay problemas reales en la PWA de iOS: el permiso se vuelve a pedir en cada arranque; la captura se corta al cambiar el hash, al ir a segundo plano o con `display:none`; Wake Lock solo funciona instalada desde 18.4; el modo de bajo consumo baja rAF/rVFC a 30 Hz. Todos tienen mitigación (sección 5).

## 1. getUserMedia con la cámara trasera

**iOS Safari / WebKit (también instalada)**
- **Cámara en la app instalada:** desde iOS 13.4. Antes no había cámara en web apps de pantalla de inicio (WebKit bug 185448).
- **Qué lente elige `facingMode:'environment'`:**
  - En 16.4 hubo una regresión: elegía la cámara virtual (triple o dual gran angular), que arranca en el campo más abierto, o sea **ultra gran angular** (bug 253186, resuelto).
  - Desde iOS 17 la "Back Triple Camera" **puede cambiar de lente sola** y recortar el video. Según un ingeniero de WebKit pasa con objetos cercanos (bug 262416). El árbol está lejos, así que el riesgo es bajo.
  - Aun así, en iOS 18 hay reportes de cambio de lente con `deviceId` y `exact:'environment'`.
  - **Recomendación:** después del primer permiso, llamar `enumerateDevices()` y preferir la cámara física gran angular (la principal 1×). Ojo: las etiquetas vienen traducidas al idioma del teléfono y el `deviceId` cambia en cada carga. Hay que guardar etiqueta + `groupId` y, si no aparecen, volver a `facingMode` **[verificar las etiquetas en español]**.
- **fps:**
  - Un commit de WebKit sobre `AVVideoCaptureSource`, probado en iPhone 15 Pro, menciona rangos de presets "[1, 30] o [1, 60]". Es decir, 60 fps existe en iPhones recientes.
  - Pedir `frameRate:{ideal:60}` y confirmar con `getSettings()` y con los sellos reales.
  - Antes había errores con el límite de fps (bug 210186, arreglado; bug 261461, abierto en 2026).
  - Con poca luz iOS baja el fps (bug 196214). **Medir el fps real en cada corrida.**
  - Para 120/240 no hay evidencia **[verificar con `getCapabilities().frameRate.max`]**. Aunque existiera, rVFC no pasa de 60 Hz, así que solo serviría con MSTP en un worker.
- **Otros límites:** `resizeMode` no está soportado (caniuse, hasta 27). `applyConstraints` vuelve a abrir la cámara y causa un salto (bug 227933): **no cambiar constraints durante la medición**. Solo puede haber una captura a la vez; pedir otra cámara detiene la anterior.

**Android Chrome**
- `facingMode:{ideal:'environment'}` funciona. Hay que evitar `exact` y `min` en `frameRate`, que dan OverconstrainedError en algunos equipos (crbug 41400828), y además el error puede nombrar el constraint equivocado (crbug 520116387).
- **fps:** depende de los rangos que reporta Camera2. Samsung limita a 30 fps a las apps de terceros (foros de Samsung). En otras marcas suele haber 60 **[verificar en el equipo]**. Chrome no usa la sesión de alta velocidad de Camera2 (120/240) **[no documentado]**.
- **`resizeMode:'none'`** (Chrome 72+) da el modo nativo. Con `crop-and-scale` Chrome puede **diezmar cuadros** para cumplir `frameRate`.

## 2. Controles de cámara

| Control | iOS (WebKit) | Android Chrome |
|---|---|---|
| `zoom` | Sí, en `getCapabilities()` desde Safari 17. Ya aparecía en un iPhone 13 Pro con 16.4. | Sí, pero hay que pedir `zoom:true` en getUserMedia: abre el **permiso PTZ**. En Android es el único control PTZ. |
| `torch` | Existe (iOS 17/18); `getSettings()` arreglado en 18.4. **No usarlo: es una luz.** | Sí. No usarlo. |
| `whiteBalanceMode` | Sí (STP 181 → 17.x; `getSettings` arreglado en 18.4) | Sí, más `colorTemperature` |
| `exposureMode` / `exposureTime` / `exposureCompensation` / `iso` | **No expuestos** (foros de Apple y otras fuentes; nada lo contradice) | Sí, según el hardware. Manual requiere Camera2 FULL. `exposureTime` desde Chrome ~72. |
| `focusMode` / `focusDistance` | No | Sí, según el hardware (`focusDistance` desde Chrome ~72–76) |
| `pointsOfInterest` | No | Sí |
| ImageCapture | 18.4 (`getPhotoCapabilities` / `takePhoto`); `grabFrame` en 26.0 | Desde Chrome 59 |

Consecuencias:
- **iOS:** la exposición automática va a cambiar cuando se prendan los focos. Hay que detectar con contraste relativo (foco contra el fondo de su ROI o contra los otros focos), no con un umbral absoluto.
- **Android, opcional y experimental:** `exposureCompensation` de −1 a −2 EV para no saturar los focos, o fijar la exposición una vez estable, y `pointsOfInterest` sobre el árbol.
- **No acortar demasiado la exposición** en ningún teléfono: los árboles LED con PWM pueden parpadear en cámara (un sensor rolling shutter es lo más sensible). Una exposición más larga lo suaviza **[verificar en pista]**.

## 3. Marcar el tiempo de cada cuadro

**requestVideoFrameCallback**
- Soporte: Chrome 83, Safari 15.4, Firefox 132.
- Metadatos (spec del WICG):
  - `presentationTime` y `expectedDisplayTime`: ligados a la composición y al vsync. **Tienen jitter de hasta un refresco de pantalla y llegan tarde.**
  - `mediaTime`: el PTS del cuadro.
  - `presentedFrames`: sus huecos delatan cuadros perdidos.
  - `captureTime`: en fuente local, "el instante en que la cámara capturó el cuadro".
  - `receiveTime` y `rtpTimestamp`: solo para fuentes remotas (WebRTC).
- Todos son DOMHighResTimeStamp **en el mismo reloj que `performance.now()`**, relativo a `performance.timeOrigin`. La spec Media Capture Extensions lo dice explícitamente para `captureTime`.
- **Chrome:**
  - Lleva `reference_time` en los metadatos y, desde 2024, `capture_begin_time` con el sello del sistema operativo (crbug 40287630).
  - En Android usa `Image.getTimestamp()` de Camera2 convertido a TimeTicks, que es el mismo reloj monótono de `performance.now()`.
  - Riesgo: si el sensor usa `TIMESTAMP_SOURCE_REALTIME` (BOOTTIME), el sello puede ir desfasado por el tiempo que el teléfono estuvo suspendido. **Descartar cualquier `captureTime` que esté a más de 1 s de `performance.now()`** (igual que hace hoy `onMotion`).
- **Safari:** no hay confirmación de que llene `captureTime` en la cámara local. La prueba de WebKit lo trata como opcional **[verificar]**.
- En iOS, rVFC va con el bucle de dibujo: **30 Hz en modo de bajo consumo** (WebKit bug 215745, es intencional) y como máximo 60 Hz.

**MediaStreamTrackProcessor / VideoFrame**
- **Chrome 94+:** solo en Window. Para mover el trabajo a un worker: `postMessage({readable}, [readable])`. Los VideoFrame también son transferibles.
- **Safari 18+:** **solo en DedicatedWorker**. Se transfiere el track: `postMessage({track}, [track])`, y el MSTP se crea dentro del worker. Por eso `typeof MediaStreamTrackProcessor` da `undefined` en la página principal; la detección hay que hacerla dentro del worker.
- `VideoFrame.timestamp` está en µs, pero **no es el reloj de `performance.now()`**: viene del PTS menos un desfase, y en Chrome se reinicia si la cámara se vuelve a abrir (crbug 40825013). El espaciado entre cuadros sí es fiable; el desfase hay que estimarlo.
- MSTP entrega cada cuadro sin depender del dibujo. Es la vía para 60 fps reales en modo de bajo consumo **[verificar en iOS]**.
- **Cerrar cada frame con `frame.close()` de inmediato.** Si se acumulan frames sin cerrar, se agota el pool y la cámara se congela.

**Relojes y precisión**
- `performance.now()` dentro de un worker tiene **otro origen**. Para pasarlo al reloj de la página: `t_main = (perfW.timeOrigin + perfW.now()) − performance.timeOrigin`.
- `DeviceMotionEvent.timeStamp` es `Event.timeStamp`: relativo a `timeOrigin` (WebKit lo cambió a alta resolución en el bug 154246; las versiones viejas daban época, y `onMotion` ya cubre los dos casos).
- Ese sello es el **momento en que se creó el evento**, no el de la muestra del sensor, así que también trae su retraso. Por eso conviene calibrar cámara contra acelerómetro (sección 8), y no cada uno por separado.
- Resolución de `performance.now()`: Safari 1 ms, Chrome 100 µs. Es suficiente.
- Retraso típico de la cámara en un Android nativo: 57–106 ms de punta a punta. De eso, hasta ~33 ms son del sensor y ~24 ms del paso sensor→app (Inovex, Pixel 2). Es mayormente constante, así que se puede calibrar. Lo que hay que eliminar es el jitter.

## 4. Leer píxeles sin calentar el teléfono
- **Solo leer la zona del árbol (ROI)**, reducida a ≤64×128 px. Hay que evitar `getImageData` de cuadros completos: en iOS 16.6/17 hubo una regresión a 0.5 fps leyendo 4032×3024 (bug 260898). También hay errores ocasionales "Unable to get image data" (bug 259676): atraparlos y seguir.
- **Vía con worker** (Chrome, Safari 18+): `frame.copyTo(buf, {rect})`. Lee NV12 (plano Y + UV), suficiente para separar rojo / ámbar / verde. La conversión a `format:'RGBA'` llegó después (intent de Chrome de 2024; PR de WebKit #77118) **[verificar versiones]**.
- **Respaldo:** rVFC + `drawImage(video, sx,sy,sw,sh, 0,0,dw,dh)` en un canvas chico con `willReadFrequently:true` + `getImageData`. OffscreenCanvas existe en worker: 2D desde Safari 16.4, WebGL desde Safari 17.
- WebGL (`texImage2D(video)` + shader de reducción + `readPixels` de unos pocos px) solo si hace falta buscar el árbol automáticamente o si un cuadro tarda >3 ms.
- **Tamaño del foco en imagen** (estimación, no medida): lente principal ≈65–70° horizontal en 16:9; foco de ~10 cm a ~6 m ≈ 1°. A 1280 px de ancho son ~18 px por foco; a 640 px, ~9 px. **720p a 60 fps basta**: menos resolución significa menos calor. El zoom no hace falta y agranda la vibración.

## 5. PWA de iOS: problemas conocidos y cómo evitarlos
- **Video:** `<video muted playsinline autoplay>` (también `video.playsInline=true`), `srcObject=stream` y `await video.play()` dentro del toque de "Armar".
  - **No usar `display:none`**: el video retiene buffers, el pool de la cámara se agota y la captura falla (commit de WebKit 3d75fe4, con una regresión posterior).
  - Dejarlo en el DOM con tamaño real y taparlo con el panel neutral durante la corrida (opacity/overlay).
- **Navegación:** no cambiar `location.hash` ni usar `pushState` con la cámara activa. En la app instalada eso detiene los tracks y **reinicia el permiso** (bug 215884, foros de Apple 2025). La app hoy no lo hace: mantenerlo así.
- **Permiso:** en la app instalada se pide **otra vez en cada arranque**, y no hay forma de evitarlo. Dentro de una misma carga, WebKit no vuelve a preguntar para el mismo tipo de dispositivo. Pedir la cámara una vez por sesión y reusar el stream (o un `clone()`).
- **Segundo plano:** al volver, la cámara puede quedar negra o con el track en `ended` (vue-qrcode-reader #298, WebKit 252465). Escuchar `track.onended`, `onmute`/`onunmute` y `visibilitychange`, y **volver a pedir el stream**. Si hubo interrupción entre el stage y la salida, marcar la corrida como "sin semáforo". Una llamada, Siri o la app Cámara también cortan la captura.
- **Wake Lock:** en Safari desde 16.4, pero **en la app instalada solo desde iOS 18.4** (WebKit bug 254545; la nota de MDN; Progressier). Hay reportes mixtos, así que dejar el try/catch que ya existe y, si falla, avisar que se ponga el bloqueo automático en "Nunca".
- **Modo de bajo consumo:** rAF/rVFC a 30 Hz. Detectarlo por el fps medido y avisar, o usar MSTP en worker (iOS 18+).

## 6. Todo a la vez (cámara + devicemotion + GPS + Wake Lock), consumo y calor
- No encontré conflictos documentados entre los cuatro en ninguna plataforma. Orden dentro del toque:
  1. `DeviceMotionEvent.requestPermission()` (iOS lo exige con el toque, como ya hace la app);
  2. `getUserMedia({video, audio:false})` (nunca audio: cambia la sesión de audio);
  3. `watchPosition`;
  4. `wakeLock`.
- **Calor:** AVFoundation baja fps o **interrumpe la captura** si la presión del sistema llega a "shutdown". La web no expone `systemPressureState`; se nota como caída de fps o como `mute`.
- Mitigaciones:
  - cámara encendida solo desde "Armar" hasta ~3 s después de detectar la salida;
  - `track.stop()` al terminar;
  - apagarla sola tras ~5 min sin corrida;
  - 720p a 60 fps, solo la ROI, todo en un worker, sin WebGL pesado.
- Guardar en cada corrida el fps real, los cuadros perdidos y si hubo `mute`.

## 7. Matriz de compatibilidad

| Capacidad | iOS Safari / PWA | Android Chrome |
|---|---|---|
| Cámara en PWA instalada | 13.4+ | Sí |
| 60 fps | Sí en iPhones recientes [verificar el modelo] | Según el fabricante (Samsung: 30) |
| 120/240 fps | No documentado | No documentado |
| `resizeMode:'none'` | No | 72+ |
| Exposición / foco | No | Sí, según hardware |
| zoom / WB / torch | Sí / Sí / Sí (no usar torch) | Sí (zoom pide permiso PTZ) / Sí / Sí |
| rVFC | 15.4+ (máx. 60 Hz; 30 Hz en bajo consumo) | 83+ |
| rVFC `captureTime` en cámara local | [verificar] | Probable (reference/capture_begin_time) [verificar] |
| MSTP | 18+, solo worker (transferir el track) | 94+, solo Window (transferir `readable`) |
| WebCodecs VideoFrame / copyTo | 16.4 (parcial), 26 completo | 94+ |
| OffscreenCanvas | 2D 16.4, WebGL 17 | Sí |
| Wake Lock | 16.4; en PWA instalada 18.4 | 84+ |
| Resolución de `performance.now` | 1 ms | 0.1 ms |

## 8. Recomendaciones concretas

**Qué pedir**
```js
const v = { facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720},
            frameRate:{ideal:60, max:60} };
if (navigator.mediaDevices.getSupportedConstraints().resizeMode) v.resizeMode = 'none'; // Chrome
const s = await navigator.mediaDevices.getUserMedia({ video: v, audio: false });
// Luego, solo en la preparación (nunca durante la corrida):
// leer getSettings()/getCapabilities(); si frameRate < 50, probar 640x480@60 y 1920x1080@60;
// en iOS elegir el deviceId de la lente principal; dejar torch apagado.
```

**Ruta para los cuadros, en orden de preferencia**
1. MSTP en worker: Safari 18+ con el track transferido; Chrome con el `readable` transferido.
2. rVFC sobre `<video>` visible y tapado, con `drawImage` de la ROI.
3. rAF + `performance.now()` (sin sello de cámara, error de ±1 refresco).

**Sello de cada cuadro**
```
t_src = captureTime (si existe y |now − captureTime| < 1 s y es monótono)
        | VideoFrame.timestamp/1e3 | mediaTime*1e3
t_arr = performance.now() al recibir el cuadro (en el reloj de la página)
desfase = percentil 1–5 de (t_arr − t_src) en una ventana de ~2 s   // envolvente inferior: quita el jitter
t_cuadro = t_src + desfase − L        // L = retraso de la cámara contra devicemotion (calibrado)
```
Si se pierden cuadros (hueco > 1.5× el periodo), marcarlo. Exportar en el zip la serie por cuadro (t_src, t_arr, brillo/color por foco) y unos recortes chicos de la ROI alrededor de cada evento, para validar con las boletas.

**Calibración L (cámara contra devicemotion), una vez por teléfono**
- En los pits: 5 s moviendo el teléfono suavemente.
- Correlación cruzada entre el movimiento global de la imagen (corrimiento por fase o centroide en ~80×45 de luma) y `rotationRate` del giroscopio. Remuestrear a 1 kHz y afinar el pico con una parábola.
- Si se hace por franjas de la imagen se obtiene además la **dirección y el tiempo de lectura del rolling shutter**. Esa corrección importa si la ROI no está al centro: el teléfono vertical probablemente lee a lo largo del eje horizontal de la imagen [verificar].
- Hay literatura que lo respalda (Ovrén y Forssén, ICRA 2015; CRISP; Kalibr). Precisión esperada: unos pocos ms [estimado, sin medir].
- La validación final es la RT de la boleta en varias corridas: así se estima el sesgo constante.

**Usar la estructura del árbol**
- Árbol Full: 3 ámbar + verde cada 0.500 s. Ajustar una recta a los 4 eventos reduce σ a ≈½.
- Árbol Pro: ámbar + 0.400 = verde, dos eventos, σ/√2.
- Si la diferencia medida verde − ámbar se aleja de .400/.500, sirve como control de calidad.
- De noche (exposición ≈ periodo del cuadro), la fracción de brillo del primer cuadro encendido da tiempo sub-cuadro. De día queda la cuantización de ±½ cuadro.

**Primer paso:** una página de prueba aparte, como la que ya se acordó para Race 1 vs 1. Debe volcar en un JSON:
- `getSupportedConstraints`, `getCapabilities`, `getSettings`;
- las etiquetas de `enumerateDevices`;
- el fps real por cada ruta (MSTP y rVFC);
- si existe `captureTime` y la estadística de (t_arr − t_src);
- el resultado de la calibración con el giroscopio.

Daniel la abre en su iPhone (instalada y en Safari) y en Android si tiene uno, y manda el JSON. Eso resuelve todos los [verificar] antes de programar la función.

**Reglas que no cambian:** la cámara solo mide. Sin torch, sin vibración y sin vista en vivo de las luces durante la corrida (la vista previa es solo para apuntar en la preparación). Pantalla neutral.

## Fuentes
- [spec rVFC (WICG)](https://wicg.github.io/video-rvfc/)
- [web.dev rVFC](https://web.dev/articles/requestvideoframecallback-rvfc)
- [caniuse rVFC](https://caniuse.com/wf-request-video-frame-callback)
- [Media Capture Extensions](https://w3c.github.io/mediacapture-extensions/)
- [Registro de metadatos de VideoFrame](https://www.w3.org/TR/webcodecs-video-frame-metadata-registry/)
- [W3C sobre el timestamp de los frames](https://lists.w3.org/Archives/Public/public-webrtc-logs/2024Sep/0143.html)
- [crbug 40287630](https://issues.chromium.org/issues/40287630)
- [Chromium video_capture_device_android.cc](https://chromium.googlesource.com/chromium/src/media/+/refs/heads/master/capture/video/android/video_capture_device_android.cc)
- [Chromium video_capture_device.h](https://chromium.googlesource.com/chromium/src/+/2c057fab4c3571ed19ff2d3c4f6cc74ab6f3aef1/media/capture/video/video_capture_device.h)
- [crbug 40825013](https://issues.chromium.org/issues/40825013)
- [crbug 41400828](https://issues.chromium.org/issues/41400828)
- [crbug 520116387](https://issues.chromium.org/issues/520116387)
- [WebKit en Safari 18.0](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/)
- [Blog de Mozilla: MSTP/VTG](https://blog.mozilla.org/webrtc/unbundling-mediastreamtrackprocessor-and-videotrackgenerator/)
- [MDN MSTP](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrackProcessor)
- [Intent to Ship: Breakout Box](https://groups.google.com/a/chromium.org/g/blink-dev/c/oo6MQoRbDXk/m/7Kjjfe9NAwAJ)
- [caniuse MSTP](https://caniuse.com/mdn-api_mediastreamtrackprocessor)
- [WebKit en Safari 17.0](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)
- [WebKit en Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)
- [Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
- [STP 181](https://webkit.org/blog/14721/release-notes-for-safari-technology-preview-181/)
- [STP 251](https://webkit.org/blog/18194/release-notes-for-safari-technology-preview-251/)
- [WebKit 280970](https://bugs.webkit.org/show_bug.cgi?id=280970)
- [WebKit 243075](https://bugs.webkit.org/show_bug.cgi?id=243075)
- [WebKit 270779](https://bugs.webkit.org/show_bug.cgi?id=270779)
- [caniuse getPhotoCapabilities](https://caniuse.com/mdn-api_imagecapture_getphotocapabilities)
- [Foro de Apple 724230](https://developer.apple.com/forums/thread/724230)
- [WebKit 253186](https://bugs.webkit.org/show_bug.cgi?id=253186)
- [WebKit 262416](https://bugs.webkit.org/show_bug.cgi?id=262416)
- [Foro de Apple 776460](https://developer.apple.com/forums/thread/776460)
- [Commit de WebKit sobre rangos de fps](https://www.mail-archive.com/webkit-changes@lists.webkit.org/msg216164.html)
- [WebKit 210186](https://bugs.webkit.org/show_bug.cgi?id=210186)
- [WebKit 261461](https://bugs.webkit.org/show_bug.cgi?id=261461)
- [WebKit 196214](https://bugs.webkit.org/show_bug.cgi?id=196214)
- [WebKit 227933](https://bugs.webkit.org/show_bug.cgi?id=227933)
- [caniuse resizeMode](https://caniuse.com/mdn-api_mediadevices_getusermedia_constraints_resizemode_parameter)
- [Foros de Samsung: fps](https://forum.developer.samsung.com/t/allow-1080p-60fps-in-any-3rd-party-camera-apps/10653)
- [web.dev PTZ](https://web.dev/articles/camera-pan-tilt-zoom)
- [Blog de Chrome: ImageCapture](https://developer.chrome.com/blog/imagecapture)
- [Estado de implementación de mediacapture-image](https://github.com/w3c/mediacapture-image/blob/main/implementation-status.md)
- [WebKit 185448](https://bugs.webkit.org/show_bug.cgi?id=185448)
- [WebKit 215884](https://bugs.webkit.org/show_bug.cgi?id=215884)
- [Foro de Apple 788518](https://developer.apple.com/forums/thread/788518)
- [vue-qrcode-reader #298](https://github.com/gruhn/vue-qrcode-reader/issues/298)
- [WebKit 252465](https://bugs.webkit.org/show_bug.cgi?id=252465)
- [Commit de WebKit sobre display:none](https://github.com/WebKit/WebKit/commit/3d75fe46264aa2aaa58b3d85eeece0d53d8c821b)
- [WebKit 254545](https://bugs.webkit.org/show_bug.cgi?id=254545)
- [Progressier: Wake Lock](https://progressier.com/pwa-capabilities/screen-wake-lock)
- [WebKit 215745](https://bugs.webkit.org/show_bug.cgi?id=215745)
- [WebKit 260898](https://bugs.webkit.org/show_bug.cgi?id=260898)
- [WebKit 259676](https://bugs.webkit.org/show_bug.cgi?id=259676)
- [MDN VideoFrame.copyTo](https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame/copyTo)
- [blink-dev: conversión a RGB en copyTo](https://www.mail-archive.com/blink-dev@chromium.org/msg10251.html)
- [WebKit PR 77118](https://github.com/WebKit/WebKit/pull/77118)
- [WebKit 263010 (OffscreenCanvas)](https://bugs.webkit.org/show_bug.cgi?id=263010)
- [caniuse WebCodecs](https://caniuse.com/webcodecs)
- [High Resolution Time](https://w3c.github.io/hr-time/)
- [Blog de Chrome: timestamps de alta resolución](https://developer.chrome.com/blog/high-res-timestamps)
- [Commit de WebKit: Event.timeStamp](https://webkit.googlesource.com/WebKit/+/8e7403520f2828457611bf784c9e727445631593%5E%21/Source/WebCore/dom/Event.h)
- [webkit-dev: resolución de timers](https://lists.webkit.org/pipermail/webkit-dev/2021-March/031743.html)
- [Inovex: latencia de cámara en Android](https://inovex.de/wp-content/uploads/Talk_Stefan-Lengfeld_glass-to-glass-latency-in-Android.v1.pdf)
- [arXiv 2608.11566](https://arxiv.org/abs/2608.11566)
- [Apple: systemPressureState](https://developer.apple.com/documentation/avfoundation/avcapturedevice/systempressurestate-swift.property.md)
- [Ovrén y Forssén, ICRA 2015](https://people.isy.liu.se/cvl/perfo/papers/ovren_icra15.pdf)
- [CRISP](https://pypi.org/project/crisp/)
- [webrtcHacks: Safari](https://webrtchacks.com/guide-to-safari-webrtc/)