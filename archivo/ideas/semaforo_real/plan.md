# Especificación: "Medir con el semáforo real" (beta 0.6)

Revisé `app.js`, `dragcore.js` (`procesar`, `refinarInicio`, `DetectorVivo`, `simularSesion`), `practica.js`, `index.template.html`, `build.py`, `publicar.sh`, `uitest.py` y `archivo/ideas/race_1vs1.md`. También corrí los prototipos del investigador de algoritmo (`/tmp/claude-0/-home-user-dragtrim/a65c5199-085f-508d-960e-9da2e6ab558f/scratchpad/arbol/sim.js`, `pwm.js`, `reloj.js`, `xcorr.js`) para comprobar sus cifras. A 60 fps de día con LED, el error σ del instante de un foco sale entre 4.0 y 5.0 ms; a 30 fps, entre 7.7 y 9.8 ms. Con PWM y el rasgo por filas, 3.4–4.3 ms a 60 fps. Con foco incandescente y el modelo de lámpara, 0.5–1 ms, con un sesgo de −2 ms. Todo esto es simulado: nada está validado con video real.

---

## 0. Resumen

- La función es un **registrador pasivo**. Mientras la medición está armada, la cámara trasera graba en memoria (un anillo) un recorte del árbol. **Durante la corrida no se analiza nada.** Todo se calcula en `finalizar()`, después de `procesar()`.
- La reacción termina en el instante L, la liberación del haz de stage. Hay dos maneras de medir L:
  - **L_cam**: el foco de stage del carril propio se apaga. Se mide con el mismo reloj de la cámara que el ámbar, así que el retraso de la cámara se cancela. Es la vía preferida.
  - **L_acel**: `tRo` de `procesar()`, pasado al reloj de la cámara con δ. δ se mide **en cada corrida** correlacionando el cabeceo de la salida que ve el giroscopio con el salto del árbol en la imagen (K1).
- Formatos de reacción: `rt_boleta = L − t_ámbar_ref`, medido directo (como el ticket), y `rt_verde = L − t_verde`.
- Lo que manda la precisión es la cuantización del cuadro: σ ≈ T/√12 por evento (4.8 ms a 60 fps, 9.6 ms a 30 fps). Los intervalos .4/.5 son múltiplos exactos de 1/30 y 1/60 s, así que **promediar ámbares casi no ayuda**.
- Lo que no se sabe y hay que medir antes de publicar: rVFC con video diminuto en la PWA de iOS, si hay `captureTime`, los fps reales, si el permiso se vuelve a pedir y si el foco de stage se apaga justo al liberar el haz. Para eso hay una página de prueba aparte (T6) y videos en cámara lenta de Daniel (F0), que se hacen en paralelo con el código.
- **No se tocan** `dragcore.js`, `fuente/matlab/*` ni `practica.js`.

---

## 1. Decisiones clave y por qué

### 1.1 Decisiones

1. **Nada en vivo mientras está armada.** Cada cuadro solo se recorta, se pasa a YUV y se mete al anillo. La única excepción es el chip "Cám", que depende solo de que lleguen cuadros. Por qué: así es imposible dar pistas o funcionar como "tree reader", y se puede probar con una prueba diferencial del DOM. El análisis en vivo solo existe en "Apuntar", que no se puede abrir con una medición armada.
2. **Recorte a resolución nativa, no el cuadro completo reducido.** El foco grande mide ~13 px a 1280 px de ancho y el de stage ~5 px. Un cuadro completo reducido a 160×90 deja el foco en 1.6 px y no sirve. Zona = caja del árbol con margen, aprendida por carril. Presupuesto: ≤ 40 000 px por cuadro en YUV 4:2:0 (60 KB) y un anillo de 40 MB (~11 s a 60 fps). Si todavía no hay zona, se graba el cuadro completo escalado a ~266×150: esa corrida "aprende" la zona con precisión menor. Aparte, una "vista general" de 240×135 en luma, 1 de cada 6 cuadros, para relocalizar el árbol si quedó fuera de la zona.
3. **Carril elegido al armar**, con dos botones: "Armar · carril izquierdo" y "Armar · carril derecho". Daniel arma en la fila, antes del burnout, y ahí ya sabe su carril. Esto elige la zona. Además hay revisión automática: con la cámara viendo al frente, tu columna es la más cercana al centro de la imagen y el árbol queda del lado contrario a tu carril. La cruzamos con el encendido de tu stage cuando el auto se detuvo. Si no concuerdan, aviso y botón "Cambiar carril".
4. **L con prioridad: L_cam, luego L_acel.** Se fusionan por varianza inversa solo cuando el sesgo acel↔cam ya está aprendido (≥ 3 corridas con stage visto). Si difieren más de 40 ms, se usa L_cam con aviso.
5. **`rt_boleta` se mide directo desde el ámbar de referencia**, no como `rt_verde + perfecta`. El intervalo real puede ser .370 o .350 (NHRA/Accutime). `rt_verde` usa la verde vista. Si no se vio (por roja u otra causa), usa `ámbar_ref + Δ_pista`, que por omisión es el nominal.
6. **La roja solo es una marca, nunca un instante.** Con TruSTART aparece después de la verde. `roja = roja_vista_en_tu_columna || rt_verde < 0`. Si no coinciden, sale "dudosa".
7. **Hora de cada cuadro:** se usa `captureTime` validado. Si no hay, `mediaTime`; si tampoco, el índice de cuadro (`presentedFrames`). Luego una recta sobre la **envolvente inferior** de la hora de llegada. El retraso constante que queda lo absorben K1 (por corrida) y K3 (boletas). Todo queda en el reloj `performance.now()/1000`, el mismo de `onMotion` y `tRo`.
8. **Se graba el giroscopio** (`rotationRate`) en `buf.gyr`, aparte de `buf.acc`. No cambia `procesar()` y es necesario para K1.
9. **Datos pesados en otro object store.** IndexedDB 'dragtrim' sube de versión 1 a 2 con el store nuevo `camdatos`. `run.cam` lleva solo un resumen de ~2 KB. Por qué: `DB.todos()` hace `getAll()` de `runs` al abrir Historial, y con clips de ~1.5 MB por corrida eso cargaría decenas de MB.
10. **Sin controles de cámara en v1:** ni exposición, ni foco, ni WB, ni `applyConstraints` durante la medición, nunca torch. En iOS no existen y en WebKit `applyConstraints` vuelve a abrir la cámara (bug 227933). Constraints solo con `ideal`, sin `exact` ni `min`.
11. **Captura v1 con rVFC en el hilo principal** (iOS 15.4+, Chrome 83+), detrás de la interfaz `DragCam.Lector`. `MediaStreamTrackProcessor` en un worker queda para la fase 2, si la página de prueba muestra 30 Hz en bajo consumo o un `proc_ms` alto.
12. **Video nunca con `display:none`:** 2×2 px, opacidad 0.01, tapado. Sin vista previa durante la corrida.

### 1.2 Contradicciones entre informes y cómo se resuelven

| Tema | Informes | Resolución |
|---|---|---|
| Ángulo al árbol | algoritmo: 40–70°; pista: 14–22° | **14–22°**: ~4.5–5.5 m de lado a ~14–15 m. Con el teléfono **horizontal** y la cámara principal (±32°) se ve sin girarlo. Vertical (±20°) queda en la orilla: hay que girarlo ~15° hacia el árbol o usar el gran angular. |
| Promediar los intervalos conocidos | plataforma: la recta a 4 eventos reduce σ a ½; algoritmo: casi nada | Gana algoritmo. En `sim.js` "modelo todos" ≈ "modelo último" (4.2 contra 4.1 ms, Pro a 60 fps). No se promete √N. |
| Análisis en vivo | algoritmo: eventos por cuadro en línea; integración: nada | Nada mientras está armada. |
| Resolución | integración: cuadro completo a 160×90 | Insuficiente. Recorte nativo de ≤ 40 k px (decisión 2). |
| Anillo | algoritmo: 6 s más disparo por acelerómetro; integración: 10 s | 40 MB fijos (~11 s a 60 fps) y se detiene en el evento `arranque`. Con los valores por omisión, `arranque` llega 2–5 s después de L. Si no alcanza: motivo `ventana`. |
| 120/240 fps | algoritmo: `applyConstraints` si `cap.max ≥ 120` | No durante la medición. Solo se registra `getCapabilities()` en la prueba. No hay vía web documentada. |
| Constraints | algoritmo: `exact`/`min` | Solo `ideal` (crbug 41400828). |
| Fuente de la hora | integración: `presentationTime`; otros: `mediaTime`/`VideoFrame` | Decisión 7. `presentationTime` tiene jitter de un vsync. |
| `rt_boleta` | integración: `rt_verde + perfecta`; otros: Δ medido | Decisión 5, sin "redondear" Δ a ±25 ms: a 30 fps eso escondería un .370. |
| Instante de la roja | algoritmo: `t_roja` = salida | Solo marca (TruSTART). |
| Fin de la RT | integración: solo `tRo` | `t_stage_off` primero y `tRo` de respaldo. `tRo` coincide con el haz solo si el rollout configurado es el real: 0.1 ft ≈ 10 ms. |
| Store de IndexedDB | integración: mismo `runs`, sin cambiar versión | v2 con `camdatos` (decisión 9). |
| "La delay box lee el árbol" (idea de Daniel) | pista | Hay que corregirlo con tacto (ver el final). La caja la dispara el piloto. Leer el árbol con un sensor es trampa. |

### 1.3 Lo que no se puede saber sin el teléfono o la pista, y cómo medirlo

| Incógnita | Cómo se mide | Qué cambia según el resultado |
|---|---|---|
| ¿rVFC llega a 60 Hz con video de 2 px y opacidad .01 en la PWA de iOS? | T6, prueba "video oculto" | Si no: 32 px, o MSTP en worker (fase 2) |
| ¿Hay `captureTime` en iOS? ¿`mediaTime` es monótono? | T6 | δ por omisión: 0 con `cap`, −50 ms con envolvente |
| fps reales (principal y gran angular, normal y bajo consumo, 10 min) | T6, prueba de esfuerzo | Texto de calidad; aviso de calor |
| ¿Vuelve a pedir permiso al apagar y prender? | T6 | Si sí: mantener el track entre corridas (`enabled=false`) |
| Etiquetas de `enumerateDevices` en español | T6 | Lista para elegir la lente física |
| δ cámara↔IMU con el giroscopio (repetibilidad) | T6, "mueve el soporte 5 s" ×3 | σ de K1 |
| ¿El stage se apaga al liberar el haz? ¿Ámbares que se apagan? ¿PWM? ¿LED o incandescente? ¿Intervalo real? ¿Qué columna es de cada carril? | F0: videos a 240 fps + boletas | Sesgos por pista (K3), Δ_pista, viabilidad de L_cam |

---

## 2. API

### 2.1 Archivos y espacios de nombres

- `fuente/app/src/semaforo.js`: UMD (`window.Semaforo` / `module.exports`), puro, sin DOM. Contiene formatos, anillo, reloj, secuencia, reacción, K1, calibración, CSV y clip. Usa `SemaforoVision`.
- `fuente/app/src/semaforo_vision.js`: UMD (`window.SemaforoVision`), puro. Estabilización, eventos, localización, rasgos, ajuste de flancos y calidad.
- `fuente/app/src/semaforo_sim.js`: UMD (`window.SemaforoSim`). Simulador de cuadros y giroscopio, para Node, pruebas y la demo.
- `fuente/app/src/camara.js`: IIFE de navegador → `window.DragCam`. Crea su propio DOM (video, overlay de Apuntar).
- `fuente/app/src/camara.css`: estilos `.cam-*`. `build.py` la junta con `style.css`.

Orden en `index.template.html`: `/*CORE*/ /*SEMVISION*/ /*SEMAFORO*/ /*SEMSIM*/ /*CAMARA*/ /*APP*/ /*PRACTICA*/ /*ROOSTER*/ /*CALC*/`.

Regla: `app.js` siempre llama `Semaforo.x(...)` sin desestructurar, para que las pruebas puedan espiar.

### 2.2 Estructuras de datos

Unidades: s, px. Reloj = `performance.now()/1000`.

```js
Tiempos = { cb: Float64Array, cap: Float64Array /*NaN si no hay*/, pres: Float64Array,
            media: Float64Array, nf: Int32Array /*presentedFrames*/ }
Cuadros = { v:1, fmt:'yuv420'|'y8', w, h, n, tam /*w*h + 2*(w>>1)*(h>>1) en yuv420*/,
            datos: Uint8Array(n*tam), t: Float64Array(n) /*hora ajustada = centro de exposición supuesto*/,
            crudos: Tiempos, reloj: Reloj, zona:[x,y,w,h] /*px del cuadro original*/, orig:[W,H],
            escala /*recorte→original*/, vista: Cuadros|null /*general, y8*/ }
Reloj = { fuente:'cap'|'media'|'indice'|'cb'|'archivo', c0, c1, lat_min_s, jitter_s, perdidos, fps }
Mov = { t: Float64Array, dx: Float32Array, dy: Float32Array, q: Float32Array /*0–1*/, G: Float32Array /*ganancia AE*/ }
Foco = { x, y, r }  // coordenadas del recorte, en el cuadro de referencia
Disposicion = { ok, motivo, puntaje, abajo:[ux,uy], paso_px, caja:[x,y,w,h],
                focos: { izq: {pre,stg,a1,a2,a3,g,r: Foco|null}, der: {...} },
                carril_auto: 'izq'|'der'|null, evidencia_carril: {centro, stage_on}, candidatos: [...] }
Rasgos = { n, t: Float64Array, cols: string[] /*'izq.a1.e','izq.a1.p','izq.a1.c',…*/,
           datos: Float32Array(n*ncols), peso: Float32Array(n), G: Float32Array(n), mov: Mov, fuente_t }
Secuencia = { ok, motivo, tipo:'pro'|'full'|'otro', carril, carril_fuente:'usuario'|'auto',
   t_ambar:[t1,t2,t3] /*NaN si no se vio*/, t_ambar_ref, s_ambar,
   t_verde_vista /*NaN*/, s_verde, t_roja_vista /*NaN*/,
   t_stage_on, t_stage_off, s_stage_off, t_pre_off,      // NaN si no se vio
   delta_s /*verde − ámbar_ref*/, delta_nominal, delta_fuente:'medido'|'pista'|'nominal',
   lampara: {ambar:{tipo,tr_s}, verde, stage}, pwm: bool, E_s, nivel:'alta'|'media'|'baja',
   puntaje, otra: Secuencia|null /*otra columna*/, avisos: string[] }
K1 = { ok, motivo, delta_s /* t_imu − t_cam del mismo instante */, sigma_s, rho, amp_px,
       eje:{img:'x'|'y', giro:'a'|'b'|'g', signo:±1}, f_px_rad }
Reaccion = { ok, motivo, metodo:'camara'|'camara+acel'|'acel', L, L_cam, L_acel /*reloj de cámara*/,
   desacuerdo_s, rt_boleta, rt_verde, perfecta, tipo, roja, roja_vista, roja_dudosa,
   error_s, nivel, calibrado, delta:{s, fuente:'k1'|'guardado'|'supuesto'}, rollout_medido_ft, avisos:[] }
```

YUV (BT.601 de rango completo, entero):
- `Y = (77R + 150G + 29B) >> 8`
- `U = ((−43R − 85G + 128B) >> 8) + 128`
- `V = ((128R − 107G − 21B) >> 8) + 128`, sobre promedios de 2×2.
- `w` y `h` pares.

### 2.3 `semaforo.js`

```js
Semaforo.VERSION = 'semaforo v1';
Semaforo.ARBOLES = {
  pro:  { nombre:'Pro .4',  ambar:[0,0,0],     verde:0.400, perfecta:0.400, ref:[0,1,2] },  // ref: ámbares de la boleta
  full: { nombre:'Full .5', ambar:[0,0.5,1.0], verde:1.500, perfecta:0.500, ref:[2] } };
Semaforo.FOCOS = ['pre','stg','a1','a2','a3','g','r'];
Semaforo.defaultConfig() → cfg            // §2.7
Semaforo.Anillo = class { constructor({w, h, fmt='yuv420', capacidad});   // reserva una vez; sin basura por cuadro
  push(rgba /*Uint8ClampedArray w*h*4*/, tiempos /*{cb,cap,pres,media,nf}*/);   // convierte en su lugar
  pushPlano(datos /*Uint8Array tam*/, tiempos);                               // simulador / demo
  get n(); get tA(); get tB();
  congelar(tA=-Infinity, tB=Infinity) → Cuadros;   // copia ordenada + Semaforo.reloj
  vaciar(); }
Semaforo.reloj(crudos, {fps_nominal}) → Reloj & { t: Float64Array }
//  Elige la fuente:
//   'cap'  si ≥ 90% finitos, monótonos y |cb − cap| < 1 s
//   'media' si es estrictamente creciente con pasos de ≈ k·T
//   si no, 'indice' = nf (o un acumulado redondeado)
//  Ajuste t_llegada(cb) ≈ c0 + c1·src por mínimos cuadrados iterativos (3 vueltas, conservando el 20% más bajo de residuos);
//  luego se baja la recta al percentil 2. Con 'cap': t = cap. perdidos = Σ(saltos de nf − 1).
Semaforo.buscarSecuencia(rasgos, disp, {carril, arbol, L_ref, cfg}) → Secuencia
Semaforo.k1(mov, giro /*{t, a, b, g} grados/s*/, {L_ref, cfg}) → K1
Semaforo.reaccion(sec, {tRo, k1, delta_guardado_s, sesgo_acel_s, ajuste:{camara_s, acel_s}, R, cfg}) → Reaccion
Semaforo.rolloutMedido(R /*{t,d} de procesar*/, L_imu) → ft | NaN     // interp1(R.t, R.d, L_imu)/0.3048
Semaforo.analizar(cuadros, ctx) → { disp, mov, rasgos, sec, k1, rt, ms, motivo }
//  ctx = { carril:'izq'|'der', arbol:'auto'|'pro'|'full', tRo, R, giro, delta_guardado_s, sesgo_acel_s, ajuste, cfg,
//          hora_quieto /*s: el auto se detuvo en stage; de GPS/acel, opcional*/ }
Semaforo.reanalizar(guardado /*{rasgos, disp, mov, k1}*/, ctx) → { sec, rt }   // cambiar carril/árbol, sin cuadros
Semaforo.reaccionDe(sec, ctx) → Reaccion        // usado por "Recalcular" (solo cambia tRo/R/ajustes)
Semaforo.prueba(cuadros, {carril, arbol, cfg}) → Secuencia[]   // sin tRo: todas las secuencias completas (Apuntar, video)
Semaforo.fmtRT(rt, tipo, formato, rt_boleta) → string  // 'boleta': rt_boleta.toFixed(3); 'verde': ('+' si > 0) + rt.toFixed(3)
Semaforo.aCSV(rasgos, crudos) → string;   Semaforo.deCSV(texto) → { rasgos, crudos }
Semaforo.clip(cuadros, mov, caja, tA, tB) → { w, h, n, t: Float64Array, y: Uint8Array }   // luma estabilizada de la caja del árbol
Semaforo.tira(clip, marcas /*[{t, etiqueta, color}]*/, {cuadros_por_marca:6, alto:96}) → { w, h, rgba }
Semaforo.calibracion(corridas /*run.cam + run.boleta*/) → { sesgo_acel_s, n_sesgo, mad_sesgo_s,
     ajuste_camara_s, ajuste_acel_s, n_boletas, rollout_medido_ft, n_rollout, delta_por_carril:{izq,der} }
Semaforo._llamadas = { analizar:0, prueba:0, calidad:0, reanalizar:0 }
```

**`reaccion` (lógica exacta):**

```
δ = k1.ok ? k1.delta_s : (isFin(delta_guardado_s) ? delta_guardado_s : (fuente_t==='cap' ? 0 : -0.050))
δ_fuente = k1.ok ? 'k1' : (guardado ? 'guardado' : 'supuesto')
L_cam  = sec.t_stage_off (si sec.s_stage_off ≤ 2T y la calidad es ok)
L_acel = (R.ok && método con acelerómetro) ? tRo − δ − (sesgo_acel_s ?? 0) : NaN
si L_cam y L_acel y sesgo_acel_s calibrado (n ≥ 3): L = fusión por varianza inversa
       (σc = sec.s_stage_off, σa = √(0.014² + σ_δ²)); metodo = 'camara+acel'
   si |L_acel − L_cam| > 0.040 → L = L_cam, aviso 'desacuerdo'
si no, si L_cam: L = L_cam, metodo 'camara'
si no, si L_acel: L = L_acel, metodo 'acel'; si δ_fuente === 'supuesto' → nivel = 'baja', calibrado = false
si no: ok = false, motivo 'sin_salida'
aj = (metodo === 'acel') ? ajuste.acel_s : ajuste.camara_s
rt_boleta = L − sec.t_ambar_ref + aj
t_v = isFin(sec.t_verde_vista) ? sec.t_verde_vista : sec.t_ambar_ref + sec.delta_s(pista|nominal)
rt_verde = L − t_v + aj;   perfecta = ARBOLES[tipo].perfecta
roja = sec.t_roja_vista finito (en tu columna) || rt_verde < 0;   roja_dudosa = (roja_vista) XOR (rt_verde < 0)
error_s = √(σ(L)² + σ(t_ref)²);   nivel: ≤ 0.008 'alta', ≤ 0.020 'media', si no 'baja'
rollout_medido_ft = L_cam ? rolloutMedido(R, L_cam + δ) : NaN    // solo si δ_fuente === 'k1'
rt_verde fuera de [cfg.rt_min_s, cfg.rt_max_s] → ok = false, motivo 'sin_secuencia'
```

### 2.4 `semaforo_vision.js`: algoritmo paso a paso (después de la corrida)

```js
SemaforoVision.lineal(y8) → Float32 (LUT sRGB⁻¹)
SemaforoVision.estabilizar(cuadros, {kA, kB, busqueda_px, k_ref}) → Mov
SemaforoVision.eventos(cuadros, mov, {kA, kB, signo:+1|-1, cfg}) → Evento[]   // {k, t, x, y, area, pico, tono, sat}
SemaforoVision.manchasFijas(cuadros, mov, {kA, kB, cfg}) → Mancha[]         // {x, y, r, contraste, tono}
SemaforoVision.localizar(evOn, fijas, {carril, arbol, L_ref, hora_quieto, cfg}) → Disposicion
SemaforoVision.rasgos(cuadros, mov, disp, cfg) → Rasgos
SemaforoVision.ajustarFlanco(serie /*{t, y, peso}*/, {signo, tA, tB, T, cfg}) →
     { ok, t, sigma, lampara:{tipo:'led'|'inc', tr_s}, E_s, pwm, nivel_off, nivel_on, contraste }
SemaforoVision.calidad(rgba, w, h) → { brillo, saturado, oscuro, mov, focos:[{x,y,r,tono}] }   // solo Apuntar
```

1. **Ventana.** `L_ref = tRo − δ_guess`. Los cuadros con t ∈ [L_ref − 4.5, L_ref + 0.8]. Si el anillo empieza después de L_ref − 3.0 → `ventana`.
2. **Movimiento** (vibración y cabeceo de la salida, 20–90 px):
   - Imagen |∇Y| con máscara que excluye píxeles que se saturan (≥ 250) o con varianza temporal alta (focos).
   - Perfiles 1D por filas y por columnas. Correlación normalizada contra la referencia (mediana de [L_ref − 1.3, L_ref − 1.0]) con búsqueda ±80 px en los dos ejes.
   - Sub-píxel por parábola. `G_k` = mediana de Ylin en la máscara.
   - Peso 0 si |Δlog G| > 0.10 o |Δ(dx,dy)| > 6 px entre cuadros.
3. **Encendidos.** `D = Ylin_k(estabilizado) − max(dilatar₃ₓ₃(Ylin_{k−3..k−1}))`, en [L_ref − 3.6, L_ref + 0.6]:
   - Umbral `max(0.06·G_k, 6σ_píxel)`.
   - Componentes 4-conexas con área entre 3 y 600 px (a escala 1).
   - Persistencia: el cuadro siguiente sigue arriba de la mitad del umbral.
   - El tono se toma del anillo **no saturado** (Y < 235): ámbar 20–55°, verde 70–190°, rojo ≤ 15° o ≥ 340°.
   - Lo mismo con −D para los apagados.
4. **Hipótesis de columna:**
   - **Pro:** ≥ 2 encendidos a menos de 1.5T entre sí, colineales con paso s, y otro evento Δ ∈ [0.30, 0.60] s después en a3 + s·û (verde) o a3 + 2s·û con tono rojo (roja).
   - **Full:** 3 encendidos colineales hacia "abajo" con pasos de [0.42, 0.58] s, más verde o roja Δ ∈ [0.30, 0.60] s después.
   - `û` = dirección a1→g. **Derecha del mundo** = `(û_y, −û_x)` (cámara trasera sin espejo; probar con rotaciones de 0/90/180/270° en el simulador).
   - La columna izquierda es la de menor proyección sobre "derecha".
   - Las columnas se emparejan si son paralelas y están separadas 1.2s–4s.
   - Puntaje = contraste de los flancos + consistencia geométrica (paso ±30%, desviación de la columna < 0.5 paso) + tono − penalizaciones.
   - Se elige la **última** hipótesis con `L_ref − t_verde ∈ [−1.0, 1.5]`.
   - `arbol` ≠ 'auto' restringe el patrón.
   - En handicap **nunca** se usa la otra columna para dar el tiempo.
5. **Carril:**
   - Se usa el carril de usuario (el botón de armar).
   - `carril_auto` = la columna más cercana al centro horizontal de la imagen, y si se ve, la columna cuyo stage se encendió a ±0.5 s de `hora_quieto`.
   - Si `carril_auto` ≠ usuario y la evidencia es fuerte (las dos pruebas apuntan al otro lado) → aviso `carril_dudoso`. El resultado ofrece "Cambiar carril".
6. **Focos fijos:**
   - Pre-stage y stage: manchas encendidas en la mediana de [τ − 0.25, τ − 0.05] (τ = primer ámbar), sobre la columna, entre 0.8s y 3.0s **arriba** de a1. Stage = la más cercana a a1; pre = la de arriba.
   - Los focos dobles uno al lado del otro (Portatree) se unen en una sola región.
   - r (roja): g + s·û, afinado con la mancha roja si aparece.
7. **Rasgos** por foco y cuadro, en la posición + mov_k:
   - `b` = mediana del anillo [2.0, 2.8]·r sin otros focos.
   - `e` = Σ max(0, Ylin − b) en el disco 1.6r, **solo con píxeles que no se saturan con el foco prendido**. Así se conserva la fracción de exposición de noche.
   - `p` = máximo por filas de la media de la fila (PWM).
   - `c` = tono.
   - `y = e/G_k`.
   - Se guardan las dos columnas.
8. **Ajuste del flanco** (`sim.js`/`pwm.js` llevados a producción):
   - Modelo `pred = a + b·[C(s+E−τ) − C(s−τ)]/E` con s = t_k − E/2. C = integral de la forma de la lámpara: LED = escalón; incandescente: 1 − e^(−t/τr) al subir y e^(−t/τf) al bajar, τf = 0.6τr.
   - Rejilla: τ cada 0.1 ms en [τ0 − max(2T, 90 ms), τ0 + 2T]; τr ∈ {0,5,10,20,30,45,60,80} ms; E ∈ {0.3 ms, T/4, T/2, 0.98T}.
   - a y b por mínimos cuadrados para cada τ. Pérdida Huber de 2.5·MAD. **Misma ventana de cuadros para todos los modelos**: [flanco − 6T − 20 ms, flanco + max(6T, 250 ms)].
   - Modo PWM si más del 15% de la meseta cae bajo la mitad: rasgo `p` y verosimilitud de mezcla.
   - Modelo por nll mínima + BIC. τ̂ = media ponderada por exp(−(nll − min)/(2σ̂²)); σ = desviación de esos pesos.
   - Ámbar de referencia: Full = ajuste de a3 solo (a1 y a2 son para revisar el paso). Pro = ajuste conjunto de a1–a3 con el mismo τ.
   - Verde y roja aparte. Δ = τ_verde − τ_ref. Si |Δ − nominal| > 1.5T, aviso "intervalo del árbol 0.37x".
9. **Stage apagado:** flanco −1 del foco `stg` buscado en L_ref ± 0.30 s. Se acepta si estuvo prendido ≥ 0.3 s antes de τ y queda apagado ≥ 3 cuadros. `t_pre_off` igual, solo como diagnóstico. `t_stage_on` si cae dentro del anillo.
10. **K1** (`Semaforo.k1`):
    - Ventana [L_ref − 1.0, L_ref + 0.3].
    - Se integra el giroscopio (a, b, g) a ángulos.
    - Para cada par eje de imagen × eje del giroscopio × signo (12 combinaciones): ajustar `pos(t_k) ≈ c + f·θ(t_k + δ) + d·t` con δ ∈ [−150, +150] ms cada 1 ms (θ interpolado). Se elige la ρ máxima y se refina por parábola.
    - Acepta si ρ ≥ 0.9 y amplitud ≥ 8 px.
    - σ por bootstrap de residuos, o de la curvatura del pico.
11. **Vista general** (si no se encontró el árbol en la zona): localización gruesa con encendidos en `vista` (8 Hz) → `disp_general` para actualizar la zona. Motivo `fuera_de_zona`.

### 2.5 `semaforo_sim.js`

```js
SemaforoSim.escena(opts) → Escena
//  opts: { tipo, w:160, h:256, rot:0|90|180|270, centro:[x,y], paso_px:14, r_px:5, r_stage_px:2.5, sep_col_px:30,
//    t_ambar_ref, delta_s, ambar_se_apaga:true, otro:{desfase_s:0|null, presente:true},
//    roja:null|{t}, t_stage_on, t_stage_off, t_pre_off, stage_doble:false,
//    lampara:{tipo:'led'|'inc', tr_s}, pwm:null|{f_hz, duty}, E_s, R_s:0,
//    ganancia:{deriva:0.004, salto_t:null, salto:0.7}, ruido:0.02, fondo:'textura', sol:null|{contraste:0.3, fantasma:true},
//    distractores:[{tipo:'freno'|'intermitente'|'reflejo', ...}], vibracion:{amp_px:2, f_hz:31},
//    cabeceo:{t0, amp_px:40, dur_s:0.2, eje:'y'}, desenfoque:true, seed }
SemaforoSim.pintar(escena, t_centro_exposicion) → Uint8ClampedArray RGBA   // también en canvas (prueba A)
SemaforoSim.simular(opts & { fps, t_inicio, t_fin, perdidos:0.02, jitter_ms:4, atascos_ms:[20,40],
                             lat_cam_s:0.045, fuente_t:'cap'|'media'|'indice', giro_hz:60, lat_imu_s:0.010 })
   → { cuadros: Cuadros, giro:{t,a,b,g}, verdad:{ t_ambar_ref, t_verde, t_roja, t_stage_off, delta_s, disp } }
```

El simulador usa la integral exacta de la lámpara (como `onda` de `sim.js`) y aplica el cabeceo a la imagen y al giroscopio con la misma θ(t).

### 2.6 `camara.js` (navegador)

```js
DragCam.soporte() → { ok, motivo:'no_soportado'|'inseguro'|null }   // mediaDevices + rVFC + isSecureContext
DragCam.permiso() → Promise<'granted'|'denied'|'prompt'|'?'>
DragCam.pedirPermiso() → Promise<{ok, motivo}>        // getUserMedia + stop (dentro del toque de "Activar sensores")
DragCam.camaras() → Promise<[{id, groupId, etiqueta, tipo:'principal'|'gran_angular'|'virtual'|'otra'}]>
//  'virtual' = /dual|triple/i; 'gran_angular' = /ultra|gran angular|wide/i; principal = posterior/trasera/back sin esas palabras
DragCam.video() → HTMLVideoElement   // único; muted, playsinline, autoplay; clase 'cam-oculta' por omisión
class DragCam.Lector {
  constructor({ zonaNorm /*[x,y,w,h] 0–1 | null*/, orig /*[W,H] con que se aprendió*/, camara /*{etiqueta, groupId}*/,
                pix_max:40000, mem_mb:40, fps:60, vista:{w:240, h:136, cada:6}, onfalla });
  async iniciar() → { ok, motivo, settings, caps, W, H, zona_px, escala }
  //  getUserMedia({audio:false, video:{deviceId?:{ideal}, facingMode:{ideal:'environment'}, width:{ideal:1280},
  //                height:{ideal:720}, frameRate:{ideal:60}}}); resizeMode:'none' si getSupportedConstraints().resizeMode
  //  Bucle: video.requestVideoFrameCallback((now, md) => { drawImage(video, zx,zy,zw,zh, 0,0,cw,ch) en un canvas
  //    {willReadFrequently:true}; getImageData; anillo.push(rgba, {cb:now/1e3, cap:md.captureTime/1e3, pres:md.presentationTime/1e3,
  //    media:md.mediaTime, nf:md.presentedFrames}); cada 6 cuadros: vista; proc_ms; volver a pedir rVFC })
  //  Si cambia videoWidth/videoHeight → vaciar, onfalla('rotacion'). track.onended/onmute, visibilitychange → hueco + 1 reintento.
  detener()                      // track.stop(); el anillo queda congelado
  congelar(tA, tB) → Cuadros     // incluye .vista
  estado() → { activo, fps, perdidos, fuente_t, W, H, ultimo_s, proc_ms, mute }
  alCuadro                       // null en medición (lo revisa la prueba); solo Apuntar lo usa
}
DragCam.abrirApuntar({ carril, zonas, alGuardar /*(carril, zonaNorm, orig, camara)*/ })  // overlay propio (DOM dinámico)
DragCam.jpeg({w, h, rgba}) → Promise<Uint8Array>     // canvas.toBlob('image/jpeg', 0.85)
```

La zona en px: si el área es ≤ `pix_max`, escala 1. Si no, `escala = √(pix_max/área)`. Tamaño par. Sin zona (o con `orig` distinto del actual) se usa el cuadro completo escalado a `pix_max`.

### 2.7 Parámetros iniciales (`Semaforo.defaultConfig()`)

```
captura: fps 60, 1280×720, pix_max 40000, mem_mb 40, vista 240×136 cada 6, armado_max_min 30
reloj: env_pct 20, iter 3, pct_final 2, cap_max_desfase_s 1.0
ventana: antes_s 4.5, despues_s 0.8, buscar [−3.6, +0.6], ventana_minima_antes_s 3.0
mov: busqueda_px 80, ref [−1.3, −1.0], salto_max_px 6, salto_AE 0.10
eventos: umbral_min 0.06·G, umbral_sigma 6, area [3, 600] px, persistir 2 cuadros
tonos: ámbar 20–55°, verde 70–190°, rojo ≤15°|≥340°, sin saturar Y<235
árbol: pro_simult 1.5T, full_paso [0.42, 0.58] s, delta [0.30, 0.60] s, paso_tol 0.30, col_desv 0.5·paso,
       sep_col [1.2, 4.0]·paso, pre/stage [0.8, 3.0]·paso arriba de a1
disco 1.6r, anillo 2.0–2.8r
flanco: rejilla 1e-4 s, rango [−max(2T,0.09), +2T], ventana [−6T−0.02, +max(6T,0.25)], huber 2.5·MAD,
        tr {0,5,10,20,30,45,60,80} ms, tf = 0.6·tr, E {0.0003, T/4, T/2, 0.98T}, pwm_frac 0.15
stage: busqueda ±0.30 s, prendido_min 0.3 s, apagado_min 3 cuadros
rt: [−1.0, 1.5] s, desacuerdo 0.040 s, sigma_acel 0.014 s, nivel alta ≤ 0.008, media ≤ 0.020
k1: ventana [−1.0, +0.3], rango ±0.150 s paso 1 ms, rho_min 0.9, amp_min 8 px
delta_supuesto: 'cap' 0, otras −0.050 s
zona aprendida: caja + margen max(0.8·alto_caja, 80 px) por lado; zonas por carril
```

---

## 3. Flujo de UI en Medir y textos

**Medir sin armar.** El campo nuevo reemplaza la tarjeta `.proximo` "Medir con el semáforo real". La tarjeta de Race 1 vs 1 se queda como está.

```
[field] Leer el semáforo con la cámara  [beta]                     [toggle #inCam]
  hint: "La cámara de atrás graba el árbol mientras la medición está armada. Al terminar,
         la app calcula tu reacción como en la boleta. No te avisa nada durante la corrida."
  (si está activo)
  Árbol: [Automático][Pro .4][Full .5]  (#segCamArbol)
  #camEstado (una línea):
    "Sin probar: toca 'Apuntar la cámara' antes de ir a la pista."
    "Lista: 1280×720, 60 cuadros/s, hora de la cámara."   | "... hora calculada (se calibra sola)."
    "La cámara da 30 cuadros/s: tu reacción sale con ±15 ms en vez de ±8 ms. ¿Modo de bajo consumo?"
    "Sin permiso de cámara. iPhone: Ajustes › Apps › Safari › Cámara. Android: candado de la barra › Permisos."
    "Este navegador no puede leer la cámara."
  [Apuntar la cámara] (#btnApuntar)
  small: "Solo mide: no se conecta al auto ni da señales. En eventos con reglamento (NHRA, IHRA…)
          un teléfono que mira el árbol puede tomarse como 'lector de árbol', que está prohibido:
          úsalo en práctica o test & tune y avísale al director técnico."
```

- **Con `S.cam`:** `#btnArmar` se oculta y aparecen `#btnArmarIzq` "Armar · carril izquierdo" y `#btnArmarDer` "Armar · carril derecho". Lo mismo para "Armar otra medición" en el resultado.
- **Chip** `#chipCam` "Cám", visible solo con `S.cam`. `on`: llegaron cuadros en el último segundo. `warn`: armada sin cuadros, o fps < 45. `bad`: falla. Revisar que quepa a 320 px; si no, a esa medida se oculta la etiqueta "Pantalla".
- **"Antes de salir a la pista"**, viñetas nuevas cuando está activo:
  - "Pon el teléfono **horizontal**, con la cámara de atrás viendo al frente por el parabrisas, sin que la tapen el soporte, el limpiaparabrisas ni la franja polarizada."
  - "El árbol queda a un lado (~20°). Con el teléfono horizontal lo ves en los dos carriles sin girarlo."
  - "Limpia la lente y el parabrisas; un trapo oscuro en el tablero evita reflejos."
  - "Arma la medición en la fila, eligiendo tu carril: la cámara solo graba mientras está armada (máx. 30 min)."
  - "Apaga el modo de bajo consumo y no dejes el teléfono al sol."

**Apuntar** (`DragCam.abrirApuntar`, overlay de pantalla completa como `#ptOverlay`; no se abre con una medición armada):
- Vista previa con `object-fit: contain` y un canvas encima con la zona del carril elegido.
- Tocar define el centro de la zona de ese carril: `[Izquierdo][Derecho]`.
- Botones: `[Olvidar zona]`, `[Cámara: Principal | Gran angular]` (solo físicas; las virtuales Dual/Triple nunca).
- Revisión con estados bien/regular/mal: resolución y fps medidos; "Hora: de la cámara / calculada"; luz (% quemado u oscuro); movimiento; ms por cuadro.
- "Modo prueba" cada 1 s con `Semaforo.prueba(últimos 5 s)`: "Vi un árbol Full .5: último ámbar → verde 0.500 s (±0.008)". Sirve con Práctica en otro teléfono con brillo al máximo, o con los autos de la fila. Solo informa secuencias que **terminaron hace ≥ 0.5 s**. Las manchas detectadas se pintan a ≤ 2 Hz.
- `[Listo]` guarda zonas y cámara y deja `#camEstado`.

**Armada.**
- `sesTexto` constante: "La app no da la salida: arranca con el semáforo de la pista. La cámara graba el árbol; tu reacción sale al final."
- `#camVideo` en `.cam-oculta`: `position:fixed; left:0; top:0; width:2px; height:2px; opacity:.01; pointer-events:none; z-index:-1`.
- Las únicas líneas de cámara en `#eventLog`: "La cámara se detuvo; reintentando." / "La cámara no volvió: esta corrida se mide sin semáforo."
- Ciclo de vida:
  - **Armar:** `iniciar()`. Si falla, la medición sigue sin cámara.
  - **`arranque`:** `detener()` de inmediato. El anillo cubre ~11 s hacia atrás.
  - **Cancelar o salir:** detener y vaciar.
  - **30 min armada:** detener y poner chip `warn`.
  - **Permiso:** con `S.cam` se pide en "Activar sensores", justo después de `DeviceMotionEvent.requestPermission`.

**Procesando.** `sesTexto` = "Leyendo el semáforo…". Se cede el hilo entre etapas con `await` + `setTimeout(0)`.

**Resultado:**
- **Boleta (`.slip`):** primera fila `R/T  0.622`, en el formato de `dragtrim.practica.cfg.formato` (el otro va entre paréntesis en los KPI). Sello `LUZ ROJA` si hay roja. Con nivel 'baja': gris con "?".
- **KPI "Reacción":** grande "0.622 (boleta)", abajo "+0.122 desde la verde · ±7 ms".
- **Calidad › Semáforo:**
  - Árbol (Pro .4 / Full .5) y carril (y si fue automático).
  - "Último ámbar → verde 0.401 s (Pro .400)".
  - "Fin de tu reacción: foco de stage (cámara) | acelerómetro | los dos".
  - "Hora del cuadro: de la cámara | calculada".
  - "Retraso cámara↔sensores: −47 ms (de esta corrida | guardado | supuesto)".
  - "Corrección aplicada: +0 ms, sin calibrar".
  - "Cámara: 1280×720, 59.9 cuadros/s, 2 perdidos".
  - "Rollout medido por la cámara: 0.62 ft (tienes 0.5)" cuando aplica.
- **Imagen de revisión:** la tira de 6 cuadros alrededor del ámbar de referencia, de la verde (o roja) y del stage apagado, con su t relativo a L.
- **Acciones:**
  - `[Cambiar a carril derecho/izquierdo]` y `[Árbol Pro/Full]`: `reanalizar` con `camdatos`, y se vuelve a guardar.
  - Formulario plegable "Tu boleta (para calibrar)": R/T (obligatoria para K3) y, opcionales, 60', 1/8 t y vel., 1/4 t y vel. `[Guardar]`.
- **Sin lectura:** "Sin lectura del semáforo: <mensaje>" y la imagen si la hay.

| motivo | Mensaje |
|---|---|
| `sin_permiso` | No hubo permiso de cámara (pasos de iOS/Chrome). |
| `no_soportado` | Este navegador no puede leer la cámara. |
| `camara_detenida` / `sin_cuadros` | La cámara no grabó cerca de tu salida (¿segundo plano, llamada o calor?). |
| `rotacion` | El teléfono cambió de orientación durante la medición. |
| `ventana` | Tu arranque se confirmó tarde y el árbol ya no estaba guardado. |
| `fuera_de_zona` | El árbol quedó fuera de la zona que graba la cámara; la próxima corrida se ajusta sola. |
| `sin_arbol` | No encontré el árbol en la imagen. Usa "Apuntar" y revisa la imagen de esta corrida. |
| `sin_secuencia` | Vi el árbol, pero no los ámbares ni la verde antes de tu salida. Prueba "Cambiar carril". |
| `ambigua` | Vi más de una secuencia posible. |
| `calidad` | Imagen muy oscura, quemada o movida: revisa reflejos y limpia la lente. |
| `sin_salida` | No vi tu foco de stage apagarse y la corrida no tiene acelerómetro. |
| `sin_corrida` | No hubo arranque válido. |

**Historial:** a la línea de abajo se agrega ", RT 0.622" o ", roja".

**Ajustes**, campo nuevo "Semáforo con cámara (beta)":
- "Corrección de tu reacción: cámara +0 ms / acelerómetro +0 ms (con N boletas)". Con ≥ 3 boletas: "Tus boletas dicen +12 ms (rango 8–15) [Usar]".
- "Rollout medido: 0.62 ft (5 corridas) [Usar 0.6 ft]". Al cambiar el rollout se reinicia el sesgo acel.
- `[Olvidar dónde está el árbol]`.
- "Guardar los cuadros del árbol (ayuda a mejorar la app; ~1.5 MB por corrida, se conservan las últimas 30)", prendido en la beta.
- Enlace "Página de prueba de la cámara" (`prueba/camara.html`, dentro del alcance de la PWA).

---

## 4. Datos guardados y exportados

**`run.cam`** (en `runs`, ~2 KB):

```js
{ v:1, semaforo:'semaforo v1', cfg:{carril, arbol}, camara:{W,H,fps_medido,perdidos,fuente_t,proc_ms,etiqueta,settings},
  zona, escala, reloj:{fuente,c0,c1,lat_min_s,jitter_s},
  sec /*Secuencia sin 'candidatos'*/, k1, rt /*Reaccion*/, delta_usado:{s,fuente}, ajuste_usado:{camara_s, acel_s},
  manual:null, motivo:null|'...', tiene_datos:bool }
```

**`run.boleta`**: `null | { rt, t_60, t_330, t_1_8, v_1_8, t_1000, t_1_4, v_1_4, unidad, fecha }`. Es general: luego lo usará "calibrar con boleta" del ET.

**`run.raw.gyr`**: `{t, a, b, g}` en grados/s, mismo recorte que `raw.acc`.

**IndexedDB v2:**

```js
indexedDB.open('dragtrim', 2); onupgradeneeded = () => { const db = rq.result;
  if (!db.objectStoreNames.contains('runs')) db.createObjectStore('runs', {keyPath:'id'});
  if (!db.objectStoreNames.contains('camdatos')) db.createObjectStore('camdatos', {keyPath:'id'}); }
camdatos = { id /*= run.id*/, rasgos /*Float32Array…*/, crudos, mov, disp, clip:{w,h,n,t,y:Uint8Array},
             tira_jpg: Uint8Array, vista_jpg: Uint8Array|null }
```

- Se guarda `Uint8Array`, no Blob (más seguro en Safari).
- `DB.putCam`, `getCam`, `borrarCam`. `borrar` y `borrarTodo` también limpian `camdatos`.
- Se podan los `camdatos` fuera de las últimas 30 corridas con cámara. El resumen en `run.cam` se queda.
- Nunca se cambia el nombre 'dragtrim'.

**Recalcular:** después de `aplicarR`, si hay `run.cam?.sec`: `run.cam.rt = Semaforo.reaccionDe(run.cam.sec, {tRo:R.tRo, R, k1:run.cam.k1, …ajustes actuales})`. No necesita `camdatos`. Mensaje: "Recalculada con rollout X ft; reacción con corrección Y ms."

**Zip.** `zip()` acepta `f.data: Uint8Array` además de `f.text`. Archivos nuevos:
- `drag_raw_gyro_<sello>.csv`: `t_s, alpha_dps, beta_dps, gamma_dps`.
- `drag_raw_cam_<sello>.csv`: una fila por cuadro.
  - Columnas fijas: `t_s, t_llamada_s, t_captura_s, t_presentacion_s, t_media_s, n_presentados, dx_px, dy_px, ganancia, peso`.
  - Luego `<col>.<foco>.<rasgo>` para izq/der × pre, stg, a1, a2, a3, g, r × e, p, c.
- `drag_raw_cam_meta_<sello>.json`: `semaforo, cfg, camara, reloj, zona, escala, disp, sec, k1, rt, boleta, columnas (descripción), clip:{w,h,n}`.
- `drag_cam_clip_<sello>.bin`: luma de la caja del árbol, cuadros seguidos, w×h por cuadro. Sus t están en el CSV y en el meta.
- `drag_cam_tira_<sello>.jpg`.
- `drag_raw_meta_*.json` suma `semaforo:{rt_boleta, rt_verde, tipo, roja, metodo, nivel}`.
- DRAGPACK suma la clave de primer nivel `reaccion:{…}`; `resultados` queda igual.
- `drag_reprocesar.m` ignora todo lo nuevo.

---

## 5. Calibración

| | Qué | Cuándo | Precisión esperada |
|---|---|---|---|
| **K0** | Reloj de cuadros (envolvente inferior) | Automático, en cada congelado | 0.1 ms (simulado) |
| **K1** | δ cámara↔IMU: cabeceo de la salida (giroscopio contra salto de la imagen) | Cada corrida. Se guarda la mediana por carril/zona (`S.cam_delta[carril] = {s, n, mad}`) como respaldo | 1–3 ms estimado; 0.1–0.5 ms simulado. El rolling shutter en la zona queda incluido |
| **K2** | Sesgo acel = mediana(L_acel_sin_sesgo − L_cam) en corridas con stage visto, y **rollout medido** = d(L_cam + δ)/0.3048 | Cada corrida con stage visto. Se ofrece "Usar" con n ≥ 3 y MAD < 0.1 ft | ±0.1 ft por corrida; la mediana de 5 da ~±0.05 ft |
| **K3** | Corrección por método = mediana(rt_app_sin_corrección − rt_boleta) | Con ≥ 3 boletas. En la beta solo se propone; Daniel toca "Usar" | Con σ ≈ 7–15 ms y N = 5: ±4–8 ms |
| **Δ_pista** | Mediana del Δ medido | Informativo en v1; por pista en la fase 2 | Detecta .370 contra .400 con ~5 corridas a 30 fps |

- **Orden recomendado:** rollout (K2) → retraso GPS (lo que ya existe) → K3.
- Con stage visto, K3 de "cámara" debería salir ≈ 0. Si no, es el retraso de las lámparas o del controlador de esa pista (incandescente: +10 a +30 ms). En la fase 2 se guarda por pista (ubicación redondeada).

---

## 6. Banco de pruebas y criterios de aceptación

**Antes de todo:** copiar los prototipos `/tmp/claude-0/-home-user-dragtrim/a65c5199-085f-508d-960e-9da2e6ab558f/scratchpad/arbol/{sim.js,pwm.js,reloj.js,xcorr.js}` y `.../scratchpad/cam/{gen_y4m.py,page*.html,run*.py}` a `fuente/pruebas/arbol_proto/`. El scratchpad se borra.

**`fuente/pruebas/semaforo_mc.js` (Node).**
- Matriz: {día LED E=0.3 ms, sombra E=8 ms, noche E≈T con saturación, incandescente τr 20/40 ms, PWM 200/400/1000 Hz, sol de frente contraste 0.3 con fantasma} × {30, 60 fps} × {Pro, Full} × {izq, der} × {normal, roja} × rot {0, 90}.
- Más: vibración ±1–3 px a 25–60 Hz, cabeceo 20–90 px en 0.2 s con desenfoque, salto de AE, 2% de cuadros perdidos, jitter de 4 ms con atascos, distractores (frenos e intermitentes), secuencia previa 40 s antes, handicap con desfase de 0.1–1.5 s, ámbares que se quedan prendidos.
- 200 corridas por celda. Sale con código 1 si algo falla.

| Criterio | 60 fps | 30 fps |
|---|---|---|
| t_ámbar_ref y t_verde, día LED (tubería completa) | \|sesgo\| ≤ 2 ms, σ ≤ 7, p95 ≤ 12 | \|sesgo\| ≤ 3, σ ≤ 12, p95 ≤ 20 |
| Ajuste de flanco solo (rasgos ideales, igual que `sim.js`) | σ ≤ 6, p95 ≤ 10 | σ ≤ 11, p95 ≤ 18 |
| Sombra | σ ≤ 3 | σ ≤ 7 |
| Noche | σ ≤ 2 | σ ≤ 3 |
| Incandescente τr 40 ms (contra el instante eléctrico) | \|sesgo\| ≤ 4, σ ≤ 3 | \|sesgo\| ≤ 5, σ ≤ 5 |
| PWM 400–1000 Hz | σ ≤ 6, p95 ≤ 12 | σ ≤ 11, p95 ≤ 20 |
| Stage apagado con cabeceo | detección ≥ 90% (≥ 98% sin cabeceo), σ ≤ 7, p95 ≤ 13 | σ ≤ 13, p95 ≤ 24 |
| RT solo cámara (stage − ámbar) | σ ≤ 9, p95 ≤ 16 | σ ≤ 16, p95 ≤ 28 |
| Sol de frente | detección ≥ 95%; σ ≤ 1.3× día | igual |

Generales:
- Detección del árbol ≥ 99% en condiciones normales.
- Pro/Full correcto en 100% de los casos.
- **0** lecturas en el carril equivocado en 500 corridas con handicap.
- **0** rojas falsas en 500 corridas.
- Roja detectada en ≥ 99% de los casos con RT programada de −0.02 a −0.30.
- |error| ≤ 2·`error_s` en ≥ 95% de los casos.
- K1: |error de δ| p95 ≤ 3 ms con cabeceo ≥ 1°. Sin cabeceo: `ok:false` en ≥ 95%.
- `Anillo.push` ≤ 1.5 ms por cuadro de 40 k px. `analizar` ≤ 1.5 s para 11 s a 60 fps (en la PC del contenedor).

**`fuente/pruebas/reaccion.js` (Node, punta a punta).**
- `simularSesion` → `procesar`.
- `SemaforoSim.simular` con L_verdad = `verdad.t_ro_abs` (haz a 1 ft), verde = L − RT programada (0.0–0.5 s), `lat_cam` 0.02–0.08 s y `lat_imu` 0.01 s. El mismo cabeceo va al giroscopio.
- Luego `analizar`. Criterios:
  - Solo cámara, 60 fps: |sesgo| ≤ 2 ms, σ ≤ 9.
  - Acel + K1: |sesgo| ≤ 5, σ ≤ 18, p95 ≤ 35.
  - Fusión con sesgo aprendido de 5 corridas: σ ≤ 8.
  - Acel con δ supuesto: siempre `nivel:'baja'`.
  - `reaccionDe` con rollout 0.5 en vez de 1.0: ΔRT_acel = ΔtRo (±1e-6) y RT_cam sin cambio.
  - `rolloutMedido` ≈ 1.0 ± 0.1 ft con rollout configurado 0.5.
  - `aCSV` → `deCSV` → `reanalizar` da el mismo `rt` (±1e-6).
  - Roja con RT de −0.05: `roja: true`.

**`fuente/pruebas/camara_test.py` (Playwright, Chromium).**
- **A. Punta a punta y neutralidad.**
  - Montaje: MOCK de `uitest.py` + `rotationRate` coherente con el cabeceo. `getUserMedia` reemplazado por `canvas.captureStream(60)` que pinta con `SemaforoSim.pintar` a la hora de `performance.now()`. Árbol Pro con la verde en `t0 + t_ro_abs − 0.35`.
  - Resultado: `rt_verde = 0.35 ± 0.03`, `rt_boleta = 0.75 ± 0.03`, `tipo 'pro'`.
  - **Prueba diferencial:** dos corridas con los mismos sensores y árboles distintos (verde a −0.35 contra −0.60, y sin árbol). Las instantáneas de `#medirSesion` y `.sensors` en cada mutación, de Armar a 'procesando', forman **el mismo conjunto** en las tres.
  - `Semaforo._llamadas.analizar === 0` hasta 'procesando'. `navigator.vibrate` (espía) sin llamadas. `#camVideo` ≤ 4 px y opacidad ≤ 0.05 durante la sesión. `lector.alCuadro === null`.
  - La cámara se apaga al `arranque` y al cancelar, y vuelve con "Armar otra".
- **B. Apuntar** con `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<árbol.y4m>` (30 fps, generado por `SemaforoSim`): fps ≈ 30, "Hora: de la cámara" (`captureTime`), el modo prueba ve Full con Δ = 0.500 ± 0.034, el toque define la zona del carril, capturas.
- **C. Permiso negado** (`NotAllowedError`): mensaje en español, corrida medida sin cámara, motivo `sin_permiso`.
- **D. Historial y exportar:** el zip trae el CSV de la cámara (cabecera y filas), el meta, el gyro, el clip y la tira. Recalcular con rollout 0 cambia `rt` solo si el método fue 'acel'. "Cambiar carril" usa la otra columna, que tiene un desfase conocido.
- **E. Migración de IndexedDB:** crear la v1 con 2 corridas viejas, abrir la app nueva: las corridas siguen, existe `camdatos`, borrar una corrida borra sus `camdatos`.
- **F. Demo con `S.cam`:** aparece la R/T con el valor simulado (±0.02).
- **G. Diseño:** capturas a 320×640 (chip) y horizontal 844×390 (sesión y resultado), sin scroll horizontal.

**`fuente/pruebas/arbol_video.js` (Node con ffmpeg/ffprobe).**
- Uso: `node arbol_video.js <video> [--zona x,y,w,h] [--carril izq|der] [--como-fps 60|30] [--json salida.json]`.
- `ffprobe -select_streams v -show_entries frame=pts_time` da t exactos. `ffmpeg -vf crop=…,format=yuv420p -f rawvideo -` da Cuadros con `fuente:'archivo'`.
- Corre `Semaforo.prueba` y, si ve el stage apagado, RT solo cámara. `--como-fps` diezma para imitar la web.
- Detecta escala de cámara lenta (separaciones ≈ k × .4/.5 → ×k).
- Validación: video del simulador codificado en h264 a 60 fps: t dentro de ±½ cuadro.

**Siguen pasando sin cambios:** `mc.js`, `inicio.js`, `spike.js`, `uitest.py demo|real`, `pt_test.py`, `brillo_test.py`, `instalar_test.py`, `calc.js`, `calc_test.py` (`cam` viene apagado por omisión).

---

## 7. Presupuesto de error (1σ en ms salvo que diga sesgo)

| Componente | 30 fps | 60 fps | Tipo / quién lo corrige |
|---|---|---|---|
| Cuantización por evento, LED de día | 9.6 | 4.8 | aleatorio |
| Sombra / noche (exposición parcial) | 1–7 | 0.5–3 | aleatorio |
| PWM (rasgo por filas + mezcla) | 8–11 | 4–6 | aleatorio; sin esto, p95 hasta 95 ms |
| Incandescente, con modelo | ±2–5 | ±2–4 | sesgo por forma real → K3 |
| Reloj de cuadros (envolvente) | 0.1 | 0.1 | |
| δ cámara↔IMU: K1 de la corrida / guardado / supuesto | 1–3 / 3–8 / sesgo de 20–100 | igual | K1 → K3 |
| tRo del acelerómetro | ~14 (peor 30–37) | ~14 | simulado, sin validar |
| Rollout mal puesto | 10 por cada 0.1 ft | igual | sesgo → K2 |
| Foco de stage apagado (cuantización + desenfoque) | 10–12 | 5–6 | aleatorio |
| Luz contra señal eléctrica del árbol | LED ~1; incandescente 16–40 | | sesgo por pista → K3 |
| Controlador (haz → stage apagado) | desconocido | | sesgo → K3 / F0 |
| **RT solo cámara** | **13.6 (p95 ≈ 27)** | **6.8 (p95 ≈ 13)** | sesgo: solo lámparas/controlador |
| **RT acel + K1** | **≈ 17** | **≈ 15** | + rollout (K2/K3) |
| **RT combinada (calibrada)** | **≈ 11** | **≈ 6.5** | |
| Sin stage visto, sin K1 ni boletas | sesgo de 30–150 | | se muestra "aproximada, sin calibrar" |

Expectativa honesta: ya calibrado y a 60 fps, **±7–10 ms** si se ve el foco de stage y **±15–18 ms** si solo hay acelerómetro. A 30 fps, el doble en la parte de la cámara.

---

## 8. Riesgos y lo que debe validar Daniel

**Riesgos:**
1. Que el foco de stage no se apague al liberar el haz, o que sea muy chico o se mueva demasiado. Queda la vía de acelerómetro, menos precisa.
2. Que la PWA de iOS no entregue 60 fps con el video oculto, o que no haya `captureTime`. Se mide con T6.
3. Calor y bajo consumo, que bajan los fps. Se mitiga con el límite de 30 min, 720p y armar solo en la fila.
4. iOS pide el permiso en cada arranque de la app (inevitable: una vez por arranque). Puede volver a pedirlo al apagar la cámara; T6 lo dice.
5. Cambio de lente en cámaras virtuales: se elige una física.
6. Sin control de exposición en iOS: saturación de noche, sol de frente.
7. PWM en árboles LED.
8. Carril equivocado en handicap.
9. Reglamento: un "tree reader" está prohibido; CompuLink "Defender" podría estorbar a la cámara.
10. Memoria (40 MB) y espacio en IndexedDB (~1.5 MB por corrida, se podan).
11. App fija en vertical en Android (`manifest orientation: portrait`) con el teléfono horizontal: el cuadro llega rotado. El localizador prueba rotaciones; no cambiar el manifest.
12. El soporte se flexiona al arrancar: no afecta a K1, porque el giroscopio y la imagen son del mismo teléfono.

**Qué pedirle a Daniel:**
- **Página de prueba (T6):**
  - Abrirla en Safari y también desde la app instalada (Ajustes → "Página de prueba de la cámara").
  - En cada caso: tocar "Probar" con el teléfono en el soporte; tocar "Mover el soporte" (5 s de mover suave, ×3); repetir con el modo de bajo consumo prendido; tocar "Prueba larga (10 min)".
  - Mandar los JSON.
- **F0, videos en cámara lenta con la app Cámara normal, a 240 fps:**
  1. Con el teléfono en el soporte, donde va a ir, de 3 a 5 salidas en los dos carriles: desde el stage hasta 2 s después de salir.
  2. Si se puede, otro video solo del árbol desde las gradas o detrás del muro, con zoom, durante varias salidas de otros autos. Con eso se ve qué columna es de cada carril, si los ámbares se apagan, si el stage se apaga al salir, la roja, si hay parpadeo, el tipo de focos y el intervalo real.
  3. Foto de cada boleta con la hora, para emparejarla con su video.
  4. Mandar los videos **como Documento** en WhatsApp o por Drive o iCloud: el original, sin compresión.
  5. Anotar: marca del árbol si se ve (CompuLink, Portatree), si las salidas son Pro o Full, y si hay handicap.
- **Con beta 0.6:** ≥ 5 corridas con cámara en la misma sesión (los dos carriles si se puede), con su zip y su boleta completa (R/T, 60', 1/8 y 1/4 con velocidad).
- **En casa:** Práctica en un segundo teléfono a 3–5 m, con brillo al máximo, y "Apuntar → modo prueba". Esperado: Δ .400/.500 ± 1 cuadro.

---

## 9. Tareas en paralelo (cada archivo tiene un solo dueño)

| Tarea | Crea / cambia (dueño único) | Depende de | Entrega |
|---|---|---|---|
| **T1a núcleo** | `fuente/app/src/semaforo.js` | contrato de §2.2/2.4 (la visión puede ir con un stub) | Anillo, reloj, buscarSecuencia, k1, reaccion/reaccionDe, rolloutMedido, analizar/reanalizar/prueba, fmtRT, CSV, clip, tira, calibracion |
| **T1b visión** | `fuente/app/src/semaforo_vision.js` | §2.4 | estabilizar, eventos, manchasFijas, localizar, rasgos, ajustarFlanco (desde `sim.js`/`pwm.js`), calidad |
| **T2 simulador y pruebas Node** | `fuente/app/src/semaforo_sim.js`, `fuente/pruebas/semaforo_mc.js`, `fuente/pruebas/reaccion.js`, `fuente/pruebas/arbol_proto/` (copia) | API de T1 | criterios de §6 |
| **T3 cámara** | `fuente/app/src/camara.js`, `fuente/app/src/camara.css` | API de `Semaforo.Anillo` | Lector, permisos, cámaras, Apuntar (DOM propio), jpeg |
| **T4 integración** | `app.js`, `index.template.html`, `style.css`, `fuente/app/tools/build.py` | API de T1/T3 | §3–§5. Detalle abajo |
| **T5 navegador** | `fuente/pruebas/camara_test.py` (+ generador de y4m dentro) | DOM e ids de T4, `window.__dragtrim` | pruebas A–G |
| **T6 página de prueba** | `fuente/app/src/prueba_camara.template.html`, `fuente/app/tools/build_prueba.py` (genera `dist/prueba/camara.html`), `fuente/publicar.sh` (copiar `prueba/`) | ninguna para las sondas; para K1 y árbol, incluye `semaforo*.js` si existen | JSON descargable o para compartir (detalle abajo) |
| **T7 videos** | `fuente/pruebas/arbol_video.js` | T1 | análisis de los videos de Daniel |
| **T8 documentación** (al final) | `CLAUDE.md` (punto 13, archivos, pruebas), `archivo/ideas/semaforo_real.md` (esta especificación), `archivo/LEEME.md` y `archivo/versiones/drag_beta_0.6.html` al publicar | todo | |

**T4 con detalle:**
- `DEF` suma `cam:false, cam_arbol:'auto', cam_zona:{izq:null,der:null}, cam_camara:null, cam_delta:{izq:null,der:null}, cam_sesgo_acel:null, cam_ajuste:{camara_ms:0, acel_ms:0}, cam_cuadros:true`.
- `buf.gyr` y `onMotion` con `rotationRate`. Recortes. `raw.gyr`.
- `activarSensores`: llama a `DragCam.pedirPermiso`.
- `armar(carril)` con el Lector.
- `alGps` en `arranque`: `detener()`.
- `salirSesion`.
- `finalizar`: `analizar` → `run.cam` + `camdatos`, aprende zona/δ/sesgo.
- `recalcular`.
- `mostrarResultado`.
- `pintarHistorial`.
- `exportar` + `zip` binario.
- `DB` v2.
- Chip.
- Ajustes.
- Demo con cámara.
- `APP_VERSION = 'beta 0.6'`.
- `build.py`: `VERSION = 'beta-0.6'`, los placeholders `/*SEMVISION*/ /*SEMAFORO*/ /*SEMSIM*/ /*CAMARA*/`, y la CSS = `style.css` + `camara.css`.

**T6 con detalle:** `getSupportedConstraints`, `getCapabilities`, `getSettings`, etiquetas de `enumerateDevices`, fps por ruta (rVFC visible, rVFC con 2 px y opacidad .01, MSTP en worker si existe), estadística de `captureTime` / `mediaTime` / `presentationTime` (presencia, monotonía, now − cap), cuadros perdidos, `proc_ms` con 40 k px, prueba larga de 10 min (fps contra tiempo), si se vuelve a pedir el permiso al detener y reiniciar, estado del track tras ir a segundo plano, Wake Lock, y K1 "mueve el soporte" ×3 (δ, ρ, σ).

**Fases:**
- **F0 + T6 + T1/T2/T7, ahora y en paralelo.**
- **T3/T4/T5:** en paralelo, contra los contratos.
- **Publicar beta 0.6:** solo después de recibir los JSON de T6. Valores por omisión que pueden cambiar con ellos: tamaño del video oculto, δ supuesto, mantener o no el track.

**Ojo al publicar:**
- La rama actual (`claude/youthful-johnson-t02s8o`) ya trae `index.html` 0.5.4 en la raíz (tarjeta de Race 1 vs 1, sin publicar). Publicar la página de prueba con push a `gh-pages` publica también la 0.5.4. Confirmarlo con Daniel, o agregar solo `prueba/` a gh-pages.
- La página vive dentro del alcance de la PWA, y el service worker "red primero" la sirve sin cambios.

**Fase 2:** MSTP en worker (iOS 18+/Chrome), "Analizar un video" dentro de la app, K1 en Apuntar, corrección y Δ por pista, revisión a mano del cuadro, localización en vivo sin salida (solo si la zona aprendida falla y Daniel lo aprueba).

**Lo que se reutiliza en Race 1 vs 1:**
- `DragCam.Lector` (también para leer los QR).
- `Semaforo.reaccion` / `fmtRT` y las reglas de roja.
- K1 como calibración de cámara↔IMU de cada teléfono.
- En una pista con árbol pero sin cronómetro, cada teléfono mide su RT contra su propia lectura del mismo árbol, sin sincronizar relojes.
- Con una cámara se pueden leer las dos columnas.

---

**Para decirle a Daniel** (en palabras simples, con tacto):
- Un detalle importante: la delay box no lee el semáforo. El piloto suelta el botón al ver el ámbar y la caja espera el tiempo programado.
- Los aparatos que sí leen el árbol con un sensor ("tree readers") están prohibidos en carreras con reglamento.
- Lo que vamos a hacer se parece, pero sin trampa: la cámara solo graba, la app calcula todo cuando la corrida ya terminó, y nunca avisa ni toca el auto. En eventos con reglamento conviene avisarle al director técnico.
- Qué tan seguro estoy: el diseño está probado solo en simulación. Lo que más falta confirmar es que su iPhone dé 60 cuadros por segundo así y que el foco de stage se vea apagarse al salir. Eso se resuelve con la página de prueba y sus videos en cámara lenta.