Diseño: lector de árbol con cámara, ajuste de tiempos y presupuesto de error

## 0. Resumen

- **Qué hace.** La cámara trasera graba en un búfer circular mientras la medición está armada. Al terminar la corrida se buscan los focos del árbol del carril propio. El encendido de cada foco se ajusta con un modelo del cuadro (exposición, rolling shutter, forma de la lámpara y PWM) y con los intervalos conocidos del árbol. Con eso se obtienen `t_ultimo_ambar` y `t_verde` en el reloj de los sensores, y se calcula `RT_verde = L − t_verde` y `RT_boleta = RT_verde + Δ`.
- **La cámara solo mide.** No hay salida de ningún tipo (ni vibración, ni sonido, ni linterna) y la pantalla no cambia durante la corrida. Todo se calcula después de la corrida. No es un delay box.
- **Idea clave nueva: el foco de stage se apaga al salir.** El foco de stage del carril propio se apaga cuando la llanta libera el haz de stage, que es justo el instante con el que la boleta mide la RT. Si se ve:
  - `RT_cámara = t_stage_off − t_ultimo_ambar` se mide con las dos marcas en el mismo reloj de la cámara, así que el retraso de la cámara se cancela.
  - Además da el rollout efectivo en cada corrida. Eso rompe la confusión entre rollout y retraso GPS que CLAUDE.md §8 anota.
  - Falta confirmarlo con un video real.
- **Precisión de día con LED.** El límite es la cuantización del cuadro: σ ≈ T/√12.
  - Usar los intervalos conocidos casi no ayuda de día: a 30 y 60 fps exactos, .400 y .500 caen en un número entero de cuadros, así que todos los flancos tienen la misma fase.
  - La palanca real son los fps: pedir 120/240 si el teléfono los da.
  - Con exposición parcial (sombra o noche) el ajuste da precisión dentro del cuadro: de 0.1 a 2 ms.

Todo lo numérico sale de simulaciones que hice para este diseño. No está validado con video real.

## 1. Captura y reloj

```js
const s = await navigator.mediaDevices.getUserMedia({ audio:false, video:{ facingMode:{exact:'environment'},
  width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:60, min:30} }});
const tr = s.getVideoTracks()[0], cap = tr.getCapabilities?.() || {};
if (cap.frameRate?.max >= 120) await tr.applyConstraints({ frameRate:{ideal:Math.min(240, cap.frameRate.max)} });
// opcionales si están en cap: focusMode 'manual'/focusDistance=máx, whiteBalanceMode 'manual' (fija el tono);
// exposureMode: dejar AE (en sol la exposición corta es la que conviene); guardar getSettings() en la corrida.
```

**Ruta A (preferida): `MediaStreamTrackProcessor` en un Worker.**
- Chrome la tiene. Safari 18 solo en Worker y transfiriendo el track (verificar).
- Entrega todos los cuadros aunque la pantalla vaya a 60 Hz, que es necesario para 120 fps o más.
- Cada `VideoFrame` se reduce con `OffscreenCanvas.drawImage(frame, 0, 0, 320, 180)` y `getImageData`. Se toma `frame.timestamp` (µs) y se llama `frame.close()` de inmediato.

**Ruta B (respaldo): `<video playsinline muted>` + `requestVideoFrameCallback`.**
- El video no puede tener `display:none`: usar 1×1 px u opacidad 0.01. La vista previa solo se muestra en el paso "Apuntar".
- La marca de tiempo es `metadata.captureTime` si existe (mismo reloj que `performance.now`) o, si no, `mediaTime`.
- Un salto en `presentedFrames` indica cuadros perdidos.

**Pasar las marcas al reloj de los sensores.**
- Cada cuadro trae `ts_src` (la marca de la fuente) y `t_lleg = performance.now()` (cuándo llegó).
- Se ajusta la recta `t_lleg ≈ c0 + c1·ts_src` sobre la **envolvente inferior**: mínimos cuadrados iterativos sobre los puntos más bajos y luego bajar la recta al percentil 2 de los residuos.
- Entonces `t_cuadro = (c0 + c1·ts_src)/1000` s. Es el mismo origen que `e.timeStamp/1000` de `onMotion` y que `tRo` de `procesar()`.
- Simulado con jitter medio de 4 ms, atascos de 20–40 ms y 2 % de cuadros perdidos: error de 0.1 ms.
- La latencia mínima constante que queda la absorbe la calibración K1 (sección 6).

**Búfer circular.**
- 6 s de cuadros a 320×180: luminancia de 8 bit más color a 160×90 (U y V) ≈ 86 KB por cuadro. Son unos 31 MB a 60 fps y 16 MB a 30 fps.
- Cuando el acelerómetro marca un disparo (a_long > 0.35 g durante ≥ 80 ms), se congela una copia de [t − 4.5 s, t + 0.5 s]. Si después el GPS no confirma la corrida, se descarta.
- Se guardan las 2 últimas copias.

## 2. Región del árbol y carril

**Automático (principal).** En la línea el piloto no puede tocar la pantalla.

- **En línea, en cada cuadro (barato):**
  - Luminancia lineal: `Ylin = sRGB⁻¹(Y)`.
  - Fondo lento: `B = (1−α)B + α·Ylin`, con α = 0.08/cuadro a 60 fps (≈0.2 s).
  - Eventos: `D = Ylin − dilatar(B, 5×5)`. La dilatación hace que bordes que vibran ±2 px no disparen.
  - Manchas con `D > max(0.08, 6σ)`, área de 3 a 400 px a 320×180, que duren ≥ 2 cuadros → evento de encendido `{t, x, y, r, color}`. Lo mismo con −D para los apagados.
  - **Color:** el tono medio del halo **no saturado**, porque el centro de un LED satura a blanco.
    - ámbar 20–55°
    - verde 70–190° (en cámara el verde LED se ve cian)
    - rojo ≤ 15° o ≥ 340°
    - stage/pre-stage: brillo alto con saturación < 0.25, o amarillo de 40–65°
- **Después de la corrida**, eventos en [tRo − 4 s, tRo + 0.3 s]:
  - Buscar una columna de manchas alineada con el "arriba" de la imagen (la gravedad del acelerómetro proyectada a la cámara) con alguno de estos patrones:
    - **Pro:** ≥ 2 ámbar que se encienden en ±1.5 cuadros, se apagan juntos Δ después, y en ese instante se enciende una verde o roja debajo.
    - **Full:** 3 ámbar en secuencia hacia abajo cada Δ ± 30 ms, y verde o roja Δ después.
  - Puntuación: flancos que cuadran, paso vertical constante (±30 %), columna recta (desviación < 0.5 paso), color correcto y RT plausible (−0.5 < tRo − t_verde < 1.5 s).
- **Carril propio**, en este orden:
  1. El ajuste del usuario (Izq/Der).
  2. El lado del árbol respecto al eje "adelante" `u` que ya calcula `refinarInicio`, combinado con el eje de la cámara (−z del teléfono). Si el árbol queda a la derecha, vamos en el carril izquierdo y nuestra columna es la izquierda de la imagen, y al revés.
  3. La columna cuyo foco de stage se prendió ±0.5 s de cuando el auto quedó quieto.
  - Si no concuerdan → aviso.
  - En carreras con handicap (bracket) nunca se usa la otra columna: el árbol del otro carril empieza a otra hora.
- **Manual (opcional).** En "Apuntar" se puede tocar el árbol en la vista previa. Eso solo limita la búsqueda (caja de ±25 % alrededor del toque).

## 3. Rasgos por foco y por cuadro (sobre la copia congelada)

```
para cada cuadro k:
  (dx,dy)_k = corrimiento global por correlación de fase sobre el gradiente a 128×72, sin los focos
              (o el ángulo del giroscopio × f px, más barato)
  G_k = mediana de Ylin en la caja del árbol fuera de los focos            // ganancia de la autoexposición
  para cada foco i (radio r_i):
    anillo = corona de 2.0–2.8·r_i corrida por (dx,dy), sin otros focos → b_ik = mediana(Ylin)
    E_ik   = Σ_{disco de 1.6·r_i corrido} max(0, Ylin − b_ik)   // "energía": no cambia con desenfoque ni con corrimientos pequeños
    P_ik   = percentil 90 por filas del foco                     // capta las bandas del PWM
    y_ik   = (modoPWM ? P_ik : E_ik) / G_k
  peso_k = 0 si |Δ log G| > 0.10 (salto de autoexposición) o si el corrimiento cambia > 6 px (sacudida)
```

Robustez:
- **Vibración del motor y two-step:** disco agrandado más compensación de movimiento más pérdida Huber.
- **Autoexposición:** cociente contra el fondo y G.
- **Sol de frente o reflejo fantasma:** baja el contraste pero el escalón sigue ahí, y el umbral es adaptativo. Con contraste de 0.3 la simulación da el mismo error.
- **Luces falsas** (frenos del rival, intermitentes, el reflejo del árbol en el cofre): la geometría y el patrón de tiempos las descartan. **Una roja solo cuenta en la posición de la roja de la columna propia.**

## 4. Encendido de cada foco y ajuste con los intervalos conocidos

**Horarios** (s desde τ = primer encendido de ámbar). Son los mismos que `secuencia()` de `practica.js`, más variantes:
- `PRO_.4`: a1, a2, a3 en [0, .4); verde en .4. Último ámbar = τ.
- `FULL_.5`: a_i en [.5(i−1), .5i); verde en 1.5. Último ámbar = τ + 1.0.
- `PRO_.5` y `FULL_.4` también se prueban.
- Variante "ámbar que se queda prendido hasta la verde": verificar en video si existe.

**Modelo directo del valor esperado** del foco i en el cuadro k:

```
s   = t_k + δ0 + y_i·R − E/2              // inicio de la exposición de la fila del foco (δ0, R de K1; E: exposición)
p   = (C_i(s+E−τ) − C_i(s−τ)) / E         // C_i = integral de la forma unitaria del foco según el horario y la lámpara
      (E→0: p = L_i(s−τ));  lámpara: LED = escalón; incandescente = 1−e^(−t/τr) al subir, e^(−t/τf) al bajar (τf = 0.6τr)
pred = a_i + b_i·p                        // a_i, b_i por mínimos cuadrados para cada τ (nivel apagado/encendido de cada foco)
```

**Ajuste (posterior en rejilla):**

```
τ0 = mediana(cruce del 50 % de cada foco − su desfase)
para cada horario h compatible con el patrón, lámpara m ∈ {LED, inc τr ∈ {5,10,20,30,45,60,80} ms}, E (de settings o rejilla si hay cuadros parciales):
  para τ en [τ0 − max(2T, 90 ms), τ0 + 2T] cada 0.1 ms:           // ¡90 ms hacia atrás! El 50 % de una incandescente llega ~28 ms tarde
     nll(τ) = Σ_i Σ_{k ∈ [flanco − 6T − 20 ms, flanco + max(6T, 250 ms)]} peso_k·ρ_Huber(y_ik − pred, 2.5·MAD) / σ²
            (MISMA ventana para todos los modelos; si no, la elección de modelo queda sesgada)
     modo PWM (si > 15 % de los cuadros de la meseta caen bajo la mitad): verosimilitud de mezcla
            encendido: d·N(y; on, 3σ) + (1−d)·N(y; off, σ)   apagado: N(y; off, σ);   d = fracción observada en la meseta
  elegir (h, m) por nll mínimo + BIC
τ̂ = Σ τ·w / Σ w,  w = exp(−(nll − nll_min)/(2σ̂²)),  σ_τ = desviación de w      // meseta plana (día) → su centro
t_LA = τ̂ + (Full ? 2Δ : 0);   t_G = t_LA + Δ
```

**Pro o Full:** sale del patrón (ámbar simultáneos o en secuencia). Δ medido = t_verde − t_LA, se ajusta a .400 o .500 si cae a ±25 ms; si no, "árbol desconocido Δ=…". La boleta perfecta = Δ.

**Roja:** encendido de la roja propia en su posición. Su instante es el momento en que el auto salió (la cámara cancela su propio retraso), así que `RT_verde = t_roja − t_G < 0`. La roja de la cámara manda sobre la del acelerómetro. Si no concuerdan → "dudosa".

**Stage apagado:** el mismo ajuste de un solo flanco (LED, con su fila), buscado en tRo ± 150 ms. Se acepta si el foco estuvo prendido ≥ 0.3 s antes de τ.

## 5. Combinación con tRo y qué se guarda

```
L_acel = tRo                         // reloj de devicemotion; la cámara ya está pasada a ese reloj con K1
L_cam  = t_stage_off (si se aceptó)
sesgo  = mediana de (L_acel − L_cam) en corridas ANTERIORES de ese teléfono y auto   // autocalibra rollout + retraso del acelerómetro
L = (L_cam/σc² + (L_acel − sesgo)/σa²) / (1/σc² + 1/σa²),  σa ≈ 14 ms, σc = σ del ajuste del flanco
si |L_acel − sesgo − L_cam| > 40 ms → usar L_cam y avisar
rt (desde la verde) = L − t_G;   boleta = rt + Δ   (misma convención que fmtRT de practica.js);   roja = roja_cam || rt < 0
```

Se guarda en la corrida:

`run.semaforo = {v, ruta:'mstp'|'rvfc', fps, res, E_ms, R_ms, k1:{δ0_ms, fecha}, arbol:'pro'|'full', delta, lampara, pwm, carril, t_ultimo_ambar, t_verde, sigma_tau_ms, t_stage_off|null, roja_cam, rt, metodo:'camara'|'camara+acel'|'acel', sigma_rt_ms, calibrado, avisos[]}`

- Los tiempos se guardan **en el reloj absoluto de los sensores**, para que "recalcular" con otro rollout vuelva a calcular la RT.
- El zip exportado lleva `drag_raw_cam_*.json` (marcas de los cuadros, serie de cada foco, geometría) y, si el usuario quiere, un clip MJPEG del área del árbol de ~4.5 s (≈1.5 MB).
- Rotación del teléfono: grabar `rotationRate` en archivo aparte (`drag_raw_gyro_*.csv`) para no romper `drag_reprocesar.m`.

## 6. Calibración de los retrasos fijos

- **K1 – cámara ↔ sensores** (automática en cada corrida, más un paso de 8 s en los pits: "con el teléfono en el soporte, mece el soporte o el auto suavemente").
  - Corrimiento de la imagen por bandas horizontales comparado con el ángulo integrado de `rotationRate` (mismo evento y misma marca que el acelerómetro).
  - Se prueban las 8 formas de emparejar los ejes y sus signos.
  - Ajuste de `pos_px ≈ a + f·θ_giro(t_k − δ) + c·t` buscando δ en [−150, +150] ms con interpolación parabólica.
  - **δ por banda = δ0 + y·R** → la recta da el retraso base **y** el tiempo de lectura R del rolling shutter.
  - En carrera se usa la ventana [tRo − 1.5 s, tRo + 0.1 s]: el cabeceo del arranque ayuda y el avance del auto todavía es casi nulo.
  - Simulado ideal: 0.1–0.3 ms. Real, estimado: 1–3 ms.
  - Lo que queda (diferencia entre el acelerómetro y el giroscopio, sesgo de tRo, rollout) lo absorben K2 y K3.
- **K2 – stage apagado** (cada corrida en que se ve): `sesgo` de la sección 5 y rollout efectivo = d(L_cam) en la distancia integrada. Así "calibrar con boleta" ya no tiene que separar rollout y retraso GPS con una sola corrida.
- **K3 – boleta:** Daniel escribe la RT de su boleta.
  - `e = RT_app − RT_boleta`; corrección = mediana con ≥ 3 corridas. Con σ ≈ 15 ms y N = 5 queda ≈ ±7 ms.
  - Con camino solo-cámara, `e` debería ser ≈ 0. Si no, es sesgo de la lámpara o del árbol de esa pista (incandescentes) y se guarda por pista.
- **Video de prueba:** un segundo teléfono en cámara lenta a 240 fps (4 ms) graba el árbol y la llanta delantera en la línea. Así se validan juntas la RT de la app, la RT solo-cámara y la boleta.

## 7. Presupuesto de error (1σ en ms; p95 entre paréntesis)

| Componente | 30 fps | 60 fps | 120 fps* | Nota |
|---|---|---|---|---|
| τ del árbol, día LED (E 0.3 ms) | 8 (14) | 4 (7) | 2 (3.5) | cuantización; todos los focos ganan 10–15 % solo por el rolling shutter |
| τ en sombra (E 8 ms) | 5.5 (10) | 1.5 (3.5) | 0.1 | exposición parcial |
| τ de noche (E≈T) | 0.6 | 0.2 | 0.1 | |
| τ incandescente τr 40 ms, con modelo | −2±1 | −2±0.5 | −1.7±0.3 | con umbral 50 %: **+27 ms**; la forma real cambia el sesgo → K3 por pista |
| τ con PWM 200–1000 Hz, mezcla | 8–9 | 4–5 | 2–3.5 | sin mezcla, p95 hasta 95 ms |
| Reloj de cuadros (envolvente) | 0.1 | 0.1 | 0.1 | |
| Flanco de stage apagado | 9.6 | 4.8 | 2.4 | T/√12 |
| tRo del acelerómetro | 14 (peor 30–37) | 14 | 14 | simulado, sin validar; tipo Chrome +4 ms de sesgo |
| K1 lo que queda | 1–3 | 1–3 | 1–3 | |
| Rollout mal puesto | 1 cm ≈ 3 ms; 0.1 ft ≈ 10 ms | | | lo arregla K2 |
| **RT solo cámara, día** | **12.5 (≈25)** | **6.3 (≈12.5)** | **3.1** | no depende de retrasos |
| **RT cámara + acelerómetro, calibrada** | 16.5 (≈30) | 15 (≈28) | 14.5 | manda tRo |
| **RT combinando las dos** | 11 | 6 | 3 | |
| Sin calibrar y sin stage | sesgo desconocido de 20–150 ms | | | mostrar "aproximada, sin calibrar" |

*120 fps solo si el teléfono los da (verificar).

## 8. Banco de pruebas

1. **`fuente/pruebas/arbol_mc.js` (Node, estilo `mc.js`).**
   - Un generador dibuja cuadros de 320×180: fondo con textura, caja negra con 2×7 focos (gaussianas con centro saturado y halo de color, lente fantasma con sol), rolling shutter por fila, exposición E, LED/incandescente/PWM, vibración de 25–60 Hz ±1–3 px, ráfaga de two-step, cabeceo al arrancar (20 px en 0.2 s) con desenfoque, ganancia de autoexposición que deriva más un salto, ruido, gamma sRGB, 8 bit, 2 % de cuadros perdidos y jitter de llegada.
   - Distractores: luces de freno rojas, intermitentes y el reflejo del árbol.
   - Ligado a `simularSesion()`: τ = t_ro_abs − RT_real − desfase del árbol, y latencias b_cam y b_acel conocidas.
   - Escenarios {día, sombra, noche, incandescente, PWM, sol} × {30, 60, 120} × {Pro, Full} × {Izq, Der} × {normal, roja}.
   - Métricas: árbol encontrado, Pro/Full, carril, roja (verdaderas y falsas), stage apagado, error de RT en boleta y desde la verde (sesgo/σ/p95/peor) por camino, y ms por cuadro.
   - Criterios iniciales:
     - día LED a 60 fps: |sesgo| ≤ 1.5 ms, σ ≤ 6 ms, p95 ≤ 10 ms; a 30 fps σ ≤ 10 ms
     - detección ≥ 99 % (≥ 95 % con sol)
     - Pro/Full 100 % y 0 rojas falsas en 500 corridas
     - ≤ 4 ms por cuadro en la PC
   - Mis prototipos sirven de base. Los dejé en la carpeta temporal de la sesión, que no es parte del repo y se borra; hay que copiarlos a `fuente/pruebas/` si se van a usar:
     - `/tmp/claude-0/-home-user-dragtrim/a65c5199-085f-508d-960e-9da2e6ab558f/scratchpad/arbol/sim.js` (modelo y estimadores)
     - `/tmp/claude-0/-home-user-dragtrim/a65c5199-085f-508d-960e-9da2e6ab558f/scratchpad/arbol/pwm.js` (PWM con mezcla)
     - `/tmp/claude-0/-home-user-dragtrim/a65c5199-085f-508d-960e-9da2e6ab558f/scratchpad/arbol/reloj.js` (envolvente y error de tRo)
     - `/tmp/claude-0/-home-user-dragtrim/a65c5199-085f-508d-960e-9da2e6ab558f/scratchpad/arbol/xcorr.js` (K1)
2. **`fuente/pruebas/arbol_video.py` (Playwright).**
   - Chromium con `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=<abs>.y4m|.mjpeg`. Los archivos los hace el mismo generador (y4m directo o ffmpeg) con una **franja de código binario con el número de cuadro**.
   - La página lee ese número → verdad por cuadro. Se revisa:
     - rutas MSTP y rVFC, cuadros perdidos, `getSettings().frameRate`
     - τ dentro de 1 cuadro, y el mismo error que en Node para el mismo contenido
     - de punta a punta con sensores falsos como en `uitest.py real`: el arranque se programa respecto al cuadro N leído
     - **pantalla neutral:** un MutationObserver sobre la vista de medición no debe ver cambios entre el pre-stage y el fin
     - que se guarde en IndexedDB y que el zip traiga `drag_raw_cam_*.json`
3. **Videos reales:** `node arbol_video.js video.mov` saca los cuadros con su marca exacta (ffprobe/ffmpeg) y corre el mismo detector. Da la RT solo-cámara de los videos en cámara lenta de Daniel.

## 9. Parámetros iniciales

```
proc 320×180; anillo_s 6; congelar [−4.5 s, +0.5 s]; disparo 0.35 g ≥ 80 ms
α 0.08/cuadro@60; dilatación 5×5; umbral max(0.08, 6σ); área 3–400 px; ≥ 2 cuadros
tonos: ámbar 20–55°, verde 70–190°, rojo ≤ 15°|≥ 340°, stage sat < 0.25 o 40–65°
disco 1.6r, anillo 2.0–2.8r; salto AE 0.10; sacudida 6 px
rejilla 0.1 ms; rango [τ0 − max(2T, 90 ms), τ0 + 2T]; ventana [−6T − 20 ms, +max(6T, 250 ms)]; Huber 2.5·MAD
τr ∈ {0,5,10,20,30,45,60,80} ms, τf = 0.6τr; PWM si > 15 % de la meseta bajo la mitad
Δ ∈ {.400, .500} ± 25 ms; RT plausible −0.5…+1.5 s; stage apagado en tRo ± 150 ms; desacuerdo > 40 ms → aviso
R por omisión 0.7·T hasta K1; σa 14 ms; K1 en ±150 ms, correlación normalizada > 0.9
```

## 10. Riesgos a validar y orden sugerido

**Riesgos a verificar en video y en el iPhone de Daniel:**
1. Que el stage se apague justo al liberar el haz.
2. Si los ámbar del Full se apagan en secuencia.
3. Fps reales en Safari como app instalada (60 o 120) y si `captureTime` o MSTP en Worker existen.
4. Que la cámara vea el árbol: queda a 40–70° del frente del auto, así que hay que girar el teléfono o usar el gran angular; el poste del parabrisas y el polarizado estorban.
5. Calentamiento del teléfono: encender la cámara solo al armar y a baja resolución.
6. Que iOS pida el permiso de cámara en cada sesión.
7. Luces falsas tomadas como roja.

**Orden:**
- **F0:** Daniel graba 3–5 salidas en cámara lenta con el teléfono en el soporte y manda las boletas. Analizarlas sin conexión en Node.
- **F1:** `semaforo.js` (UMD, igual en Node y navegador) + `arbol_mc.js` hasta cumplir los criterios.
- **F2:** página de prueba aparte en sus teléfonos: captura, reloj, K1, fps y temperatura.
- **F3:** integrar en Medir con pantalla neutral, resultado, guardado, exportar y recalcular; prueba en Chromium.
- **F4:** pista con boletas y segundo teléfono en cámara lenta (K2/K3).

**Para Race 1 vs 1** sirven el mismo lector (puede leer el árbol de Práctica en la pantalla de otro teléfono y medir con una sola cámara qué tan juntas caen las dos verdes), la infraestructura K1 y la misma convención de RT y reglas de roja de `practica.js`.