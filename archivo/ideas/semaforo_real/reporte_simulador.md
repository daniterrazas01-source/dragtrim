Terminé `semaforo_sim.js` y su prueba de validación: las 49 comprobaciones de `node fuente/pruebas/semaforo_sim_test.js` pasan (0 fallas). Además, el detector real (`Semaforo.analizar`) ya lee el árbol en los cuadros simulados, salvo con sol de frente y con PWM. Sin commit ni push.

## Qué creé
- **`/home/user/dragtrim/fuente/app/src/semaforo_sim.js`** (1047 líneas, UMD como `dragcore.js`, sin dependencias). Usa `Semaforo.Anillo` para convertir y congelar los cuadros. Si no está, usa una copia de la conversión que da los mismos bytes.
- **`/home/user/dragtrim/fuente/pruebas/semaforo_sim_test.js`** (313 líneas): la validación del simulador por sí mismo. Es un archivo nuevo que no estaba en la lista del encargo; termina con código 1 si algo falla.
- No toqué otros archivos. `semaforo_vision.js` aparece modificado en git, pero lo cambió otro agente.

## API exacta
```js
SemaforoSim.VERSION = 'semaforo_sim v1'
SemaforoSim.escena(opts) → Escena
//  tipo 'pro'|'full', carril 'izq'|'der', w 160, h 256, rot (grados, cualquiera), centro [x,y],
//  paso_px 14, r_px 5, r_stage_px 2.5, sep_col_px 30,
//  pos_focos {pre:-2.2, stg:-1.4, a1:0, a2:1, a3:2, g:3, r:4} (en pasos)
//  tiempos: t_ambar_ref | t_verde | t_stage_off + rt_s (0.35); delta_s (nominal .4/.5), paso_full_s 0.5,
//    t_stage_on, t_pre_on, t_pre_off, stage_se_apaga true, ambar_se_apaga true,
//    roja null | {t} | {truestart:true} | true | false (si rt < 0 se prende sola al soltar el stage),
//    reset_s ∞, previas [t | {t_ambar_ref, tipo, rt_s}], stage_doble false,
//    otro {desfase_s 0 | null (sin auto), presente true, rt_s, roja}
//  luz: lampara {tipo:'led'|'inc', tr_s, tf_s = 0.6·tr} o por clase {ambar, verde, roja, stage},
//    pwm null | {f_hz, duty, fase_comun, fase, clases}, E_s 0.0003 | E_T (fracción de T), R_s 0, fps 60,
//    nivel_fondo 0.18, contraste 3, halo {k 0.22, w 1.3}, ganancia {deriva 0.004, salto_t null, salto 0.7},
//    ruido 0.02, fondo 'textura'|'liso'|'negro',
//    sol null | true | {contraste 0.3, fantasma true, velo 0.4, pos, …}, flicker null | {f_hz, prof},
//    distractores [{tipo:'freno'|'intermitente'|'reflejo', pos, r_px, amp, color, tramos, lampara, vel, …}]
//  movimiento: vibracion {amp_px 2, f_hz 31, ax_rel 0.6} | null,
//    cabeceo {t0 = L−0.15, amp_px 40 | amp_deg, dur_s 0.2, eje 'auto'|'x'|'y', osc 0.15, …} | null,
//    desenfoque true, f_px_rad 1000, giro_ejes {x:{eje:'g',signo:1}, y:{eje:'b',signo:-1}}
//  recorte: orig [1280,720], zona (centrada), escala 1, seed 1
SemaforoSim.pintar(escena, t_centro_exposicion, {out, ruido:true, vista:{w,h}}) → Uint8ClampedArray RGBA
SemaforoSim.simular(opts_escena & { fps 60, t_inicio L−6.5, t_fin L+1.2, perdidos 0.02, perdidos_cam 0,
   jitter_ms 4, atascos_ms [20,40], atascos_prob 0.01, proc_ms 1.5, vsync_hz 0, lat_cam_s 0.045,
   cap_desfase_s 0, fuente_t 'cap'|'media'|'indice', nf true, fps_ppm, giro_hz 60, lat_imu_s 0.010,
   giro_ruido_dps 0.3, giro_jitter_ms 0.3, giro_sesgo_dps 0.2, vista null|true|{w,h,cada},
   capacidad, mem_mb, fmt 'yuv420'|'y8', anillo true, escena })
 → { cuadros /*Cuadros §2.2, con .vista y8 si se pide*/, giro {t, a, b, g en °/s}, verdad, escena,
     stats {ms, ms_render, ms_cuadro, n_cuadros, n_vista} }
SemaforoSim.giro(escena, o), rotacion(escena, t) → {a,b,g}, desplazamiento(escena, t) → [dx,dy],
  ganancia(escena, t), condicion('dia'|'sombra'|'noche'|'inc20'|'inc40'|'pwm200'|'pwm400'|'pwm1000'|'sol'),
  desdeSesion(simularSesion(...), {rt_s,…}), serieFoco(o) → {t, y, peso, verdad:{tau}},
  lampara(tramos, o) → {integral(a,b), valor(t)}, aYUV(rgba, w, h, fmt)
```

**Qué trae `verdad`:** `t_ambar[3]`, `t_ambar_ref`, `t_verde`, `verde_visible`, `t_roja` (NaN si no hay), `roja`, `t_stage_on`/`t_stage_off`, `t_pre_on`/`t_pre_off`, `delta_s`, `rt_s`, `rt_boleta_s`, `perfecta`, `hora_quieto`, `otro`, `previas`, `disp` (`abajo`, `derecha`, `paso_px`, `caja`, `focos.izq`/`.der` con `{x, y, r, dt_fila_s}`), `cabeceo`.

**Lo que agrega `simular` a la verdad:**
- `t_cuadros`: hora física de cada cuadro entregado.
- `desfase_cam_s`: diferencia entre `cuadros.t` y la hora física.
- `en_camara`: lo que debe dar el detector en el reloj de la cámara, ya con la fila de cada foco.
- `k1.delta_s` (= t_imu − t_cam), con `eje` y `f_px_rad`.

Nada de esto llega al detector.

## Diferencias con la especificación, y por qué
1. **`cabeceo.eje` por omisión es 'auto'** (la vertical del árbol), no 'y'. Con rot 0 es lo mismo; con el teléfono girado 90° el cabeceo real mueve la imagen en x. 'x' e 'y' se siguen aceptando.
2. **Por omisión el recorte va centrado en un cuadro de 1280×720**, como lo graba el Lector, y `R_s` es el tiempo de lectura de ese cuadro completo. Así el rolling shutter por fila es realista (con el recorte como cuadro completo barría unas 3 veces más rápido por píxel) y la vista general sirve para probar `fuera_de_zona`.
3. **Hora del cuadro** = centro de la exposición de la fila central del cuadro original; la fila Y se expone `R_s·(Y − (H−1)/2)/H` después.
4. **El foco tiene borde gaussiano (σ 0.5 px) más halo**, no un disco duro. Con disco, la luz total variaba ±0.5 % según la posición sub-píxel, lo que fingía un parpadeo al ritmo de la vibración; ahora varía 1e-4.
5. **La autoexposición es una suma de 8 senos y el ruido sale de una tabla sembrada por t.** Así `pintar(escena, t)` depende solo de t: lo necesita la prueba con `captureStream` y garantiza que `simular` dé byte a byte lo mismo que `pintar`.
6. **Incandescente con PWM:** se ignora el PWM (el filamento lo promedia).
7. **Con roja, la verde de tu carril no se prende** (como en NHRA). `roja:{truestart:true}` la pone a la hora de la verde.
8. **La vista general usa una sola escala** (la del ancho): 240×136 cubre 725 filas en vez de 720 (0.7 %).
9. **Agregados** que la especificación no pedía: `escena` y `stats` en el resultado, `pwm.clases`, `fmt:'y8'`, `anillo:false`, `previas`, `stage_se_apaga:false` y `flicker`.

## Cómo lo probé (números)
- **A. Integral exacta de la lámpara contra muestreo fino:** 240 ventanas (LED, PWM 200/1000 Hz, incandescente τr 20/45/80 ms), error máximo 0.033 % de E (es el límite del muestreo, no de la integral); aditividad 3e-17.
- **B. Lo pintado coincide con los tiempos verdaderos:** fracción encendida medida contra la integral/E, error máximo 0.0014 (LED E=T/2), 0.0001 (E=0.3 ms), 0.0033 (incandescente 40 ms) y 0.0032 por fila con R_s=30 ms.
- **C. Posición de los focos:** centroide contra la verdad ≤ 0.002 px con rot 0/90/180/270/17°. "Abajo" y "derecha" cumplen la convención de la visión, `(û_y, −û_x)`.
- **D. Semilla:** misma semilla da los mismos bytes y otra semilla, otros. El cuadro k de `simular` es igual byte a byte a `pintar(escena, t_cuadros[k])`. La ruta sin anillo da lo mismo. Con un anillo de 4 MB quedan los últimos 65 de 205 cuadros, con su verdad alineada.
- **E. YUV:** idéntico a `Anillo.push` en yuv420 y en y8.
- **F. Hora de los cuadros (con `Semaforo.reloj`):** con 'cap' el error es 0. Con 'media' e 'indice' la envolvente queda 0.10–0.12 ms del `lat_cam`, σ 0.06 ms a 60 fps y 0.13 ms a 30 fps. Los cuadros perdidos que cuenta el reloj coinciden con los de la entrega.
- **G. Giroscopio e imagen con el mismo θ(t):** δ recuperado con un K1 propio contra `verdad.k1`: |error| ≤ 0.24 ms en todos los casos sin vibración (cap, media, R_s 25 ms, 30 fps, rot 90); f = 1000–1006 px/rad. Con vibración y giroscopio a 100 Hz: ≤ 0.38 ms.
- **H. Desenfoque:** la luz total (con exposición ≈ T, cabeceo y vibración, barrido de 11.5 px) cambia ≤ 0.41 % por el redondeo a 8 bits; el centro del foco borroso coincide con su posición media durante la exposición (error 0.017 px).
- **I. Secuencias:** Pro y Full, ámbares que se quedan, roja (clásica y TruSTART), handicap, otro carril sin auto o ausente, secuencias previas, stage que no se apaga y `desdeSesion`: todo correcto.
- **J. Velocidad** (11 s a 60 fps, 642 cuadros de 160×256):

  | Caso | Total | Por cuadro |
  |---|---|---|
  | Día | 0.74 s | 1.0 ms |
  | Noche con cabeceo (desenfoque) | 1.7 s | 2.45 ms |
  | PWM + rolling shutter + distractores | 0.89 s | 1.2 ms |
  | Con vista general | 0.95 s | 1.1 ms |
  | 30 fps (323 cuadros) | 0.41 s | 1.1 ms |
  | `pintar` suelto a 640×360 | — | 5.1 ms (cabe a 60 Hz) |

- **`serieFoco` con `ajustarFlanco`:** LED 60 fps σ 4.3 ms; 30 fps σ 8.6 ms; incandescente 40 ms σ 1.8 ms con sesgo −1.35 ms; sombra σ 2.2 ms. Coincide con las cifras de los prototipos.
- **También carga en un contexto tipo navegador** (`self`, sin `module`).

## Para los dueños del detector y de las pruebas
- **K1:** el error viene de la vibración de 31 Hz, que se mezcla al muestrearla a 60 Hz. Error de δ, p95: 7.0 ms con vibración; 1.2 ms sin ella; 0.1 ms con giroscopio a 200 Hz. Con la vibración por omisión de la especificación, el criterio "p95 ≤ 3 ms" no se alcanza salvo que K1 filtre.
- **Sol de frente (contraste 0.3):** la detección depende del ruido por píxel. Con 1 % ve el árbol 4 de 4 veces; con 2 %, 2 de 4; con 3 %, 0 de 4. Dejé el preset 'sol' con 2 %, igual que el día, para que lo único distinto sea el sol.
- **PWM 400/1000 Hz:** el stage, que es chico, desaparece entero en muchos cuadros y no se detecta su apagado. En algunas corridas los ámbares y la verde se equivocan por 100–270 ms. `pwm.clases` permite probar con PWM solo en los focos grandes.
- **30 fps:** en 2 de 3 corridas el stage salió con unos −17 ms de error. Son pocas corridas para concluir.
- **En `reaccion.js` hay que sortear el RT al azar:** si el RT programado cae justo en la rejilla de 1/60 s, el ámbar y el stage comparten fase y sus errores se cancelan (salió < 1 ms), lo que escondería el error real.
- **Reloj en `reaccion.js`:** `giro.t` = instante físico + `lat_imu_s`. Hay que sumar lo mismo a `acc.t` y `gps.t` antes de `procesar()` para que `tRo` quede en ese reloj. El δ verdadero está en `verdad.k1.delta_s`.
- **Tiempo de la matriz completa del MC** (192 celdas × 200 corridas): varias horas, más el tiempo de `analizar`. Conviene una ventana más corta (`t_inicio = L − 5`).

## Pendientes
- **Sin validar contra video real (F0):** tamaño y brillo de los focos, halo, ruido, fantasma y vibración son supuestos míos, no medidos.
- **No simula:** compresión del video, cambio del tiempo de exposición por la autoexposición (solo cambia la ganancia), ni el filtro interno del giroscopio.
- **El generador de y4m** para `camara_test.py` no está; es de T5.

Qué tan seguro estoy: el simulador cumple su propia física con mucha precisión. Que se parezca a una pista real todavía no está demostrado.