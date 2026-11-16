# Lo que dicen los datos reales y qué probar después

## Primera prueba real (11 oct 2026, zip `dragtrim_20261011_143244`, rollout en la app 0.5 ft)

| | 60 ft | 1/8 (201 m) | 1/4 (402 m) | Velocidad 1/4 |
|---|---|---|---|---|
| Boleta | 2.650 | 9.339 @132.40 | 14.043 | 181.71 km/h |
| App | 2.653 | 9.476 @135.1 | 14.205 | trampa 166.8 |
| App − boleta | +0.003 | +0.137 | +0.162 | −14.9 km/h |

RT 0.622. El zip no está en el repo; si Daniel lo vuelve a mandar, guárdalo (ver skill
`dragtree-datos-reales`).

**Hallazgos de ese análisis**

- La distancia integrada coincide con la posición GPS (±2 m en 400 m): la fusión no está "inventando"
  distancia.
- El retraso del GPS estimado fue 0.52 s, pero los parciales de la boleta sugieren ~0.9–1.0 s. El
  modelo deriva+escala absorbió parte con una escala de −0.29 (muy grande: en simulación anda cerca de 0).
- Rollout y retraso son casi intercambiables con una sola corrida:
  - rollout 1.0 + retraso automático → −0.089 / +0.045 / +0.070
  - retraso 0.9 + rollout 0 → −0.004 / +0.020 / +0.030
- Acelerómetro: ruido en reposo ~2 m/s² (el soporte vibra), resolución 0.1 m/s², pico de 1.8 g.
- Velocidad de 1/4: GPS Doppler y posición dicen ~166–169 km/h; la boleta 181.71. La de 1/8 sí
  coincide (±2 %). La boleta no es coherente consigo misma (ver skill `arrancones`,
  `pista-y-boleta.md` §4). No ajustar a esa velocidad.

## Segunda prueba real (15 nov 2026, zip `dragtrim_20261115_154941`, rollout en la app 0 ft, app 0.8.3)

Datos en `fuente/pruebas/datos/reales/dragtrim_20261115_154941/` (zip, foto de la boleta, `boleta.txt`).
Mismo teléfono que la primera (Samsung S22 Ultra, Chrome) y misma pista (Autódromo Francisco Villa,
Chihuahua; cronometraje RaceAmerica T-Link inalámbrico). El auto patinaba al salir (pista con poca
tracción ese día). Boleta confirmada por Daniel.

| | 60 ft | 1/8 (201 m) | 1/4 (402 m) | Velocidad 1/4 |
|---|---|---|---|---|
| Boleta | 1.606 | 7.337 @155.74 | 11.385 | 193.96 km/h |
| App 0.8.3 (v2.3, rollout 0) | 1.777 | 7.580 @158.1 | 11.689 | trampa 185.5 |
| App − boleta | +0.171 | +0.243 | +0.304 | −8.5 km/h |
| v2.3 con rollout 1 ft | −0.129 | −0.057 | +0.004 | |
| **v2.4 con rollout 1 ft** | −0.058 | +0.041 | +0.109 | trampa 184.9 |
| v2.4, pista con pies de 30 cm, rollout 0.20 m | −0.031 | +0.012 | +0.029 | |
| v2.4, pista con pies de 30 cm, rollout 0.25 m | −0.053 | −0.010 | +0.007 | |

RT 0.769 (carril izquierdo; el derecho dio roja).

**Lo que se encontró (y cómo comprobarlo otra vez)**

1. **El teléfono se movió en su soporte al arrancar.** A 0.22 s del arranque hay un golpe (una muestra
   de 34 m/s²), el giroscopio marca ~12° de giro sobre la vertical y desde ahí el acelerómetro marca
   ~25 % menos empuje que el GPS: integrando solo el acelerómetro el auto llega a 139 km/h, y el GPS
   dice 185. La parte "vertical" sube +1 m/s² mientras el auto acelera: las dos cosas cuadran con el
   teléfono inclinado ~10° (la punta hacia abajo) entre 1 y 5 s, y ~4° después. El tamaño de la fuerza
   medida (√(a² + g²), que no depende de la inclinación) sí coincide con el GPS.
2. **El modelo deriva + escala de la v2.3 no puede seguir eso** (un error que cambia a media corrida):
   dio escala +0.27 (en la primera prueba, −0.29; en simulación nunca pasa de 0.12), residuo 0.67 m/s y
   deformó la salida: por eso con rollout 0 "casi" empataba y con el rollout real quedaba 0.13 s corto
   en 60 ft. El retraso estimado (0.72 s) también salía inflado.
3. **Cómo mide el GPS del S22 Ultra** (Chrome): lecturas exactas cada 1.000 s. La **velocidad** es
   prácticamente la distancia entre dos posiciones seguidas (el promedio del último segundo), así que
   llega ~0.5–0.6 s atrasada. La **posición** llega a tiempo: en los primeros 2.5 s coincide con el
   acelerómetro corregido a ±0.03 s. Antes de moverse el GPS repite la misma posición exacta (se queda
   "pegado") y la primera lectura en movimiento no sigue la regla del promedio.
4. **Fusión por nodos (v2.4):** con una corrección lineal a tramos, la velocidad GPS sola, la posición
   GPS sola o las dos juntas dan la misma curva (retraso de la velocidad 0.58–0.64 s). El 60 ft cambia
   ±0.02 s según la separación de los nodos (1.5–4 s); 1/8 y 1/4 casi no cambian.
5. **Lo que sobra crece con la distancia** (60 ft ≈ 0, 1/8 +0.04, 1/4 +0.11 con rollout 1 ft): ningún
   rollout ni retraso lo quita, pero una **escala de distancia de ~0.984–0.99** sí. 0.984 = 30 / 30.48:
   como si la pista se hubiera medido con pies de 30 cm (60 ft = 18.0 m, 1/8 = 198 m, 1/4 = 396 m). Con
   eso y un rollout de 0.20–0.25 m (8–10 in, lo normal) los tres tiempos quedan en ±0.03 s. El GPS dice
   que al cruzar la meta de la boleta el auto iba en ~396 m. En la primera prueba el patrón era el
   mismo (+0.045 y +0.070 en 1/8 y 1/4 con rollout 1 ft). **Es una hipótesis con una corrida y media:**
   falta que Daniel pregunte o mida la pista (del haz de stage a la meta) y más boletas.
6. **La velocidad de 1/4 de la boleta (193.96) otra vez no cuadra:** el GPS marca 183–185.5 km/h durante
   2 s alrededor de la meta y el acelerómetro marca que el auto ya casi no acelera. La de 1/8 (155.74)
   coincide (app 155.0). Los sensores de trampa de esa pista se ponen a mano; no ajustar a esa velocidad.
7. El `primer_pico` (buscar el arranque en el primer empujón fuerte) salió de la simulación con
   vibración y auto rápido: el pico mayor podía caer después del primer cambio y el arranque quedaba
   1.4 s tarde. En esta corrida real no cambia nada.
8. MATLAB: `drag_procesar.m` tenía un error escondido desde la v2.3 (la variable `res` se usaba como
   vector y luego como estructura; en MATLAB eso truena en la rama 'modelo'). Se corrigió y por primera
   vez se comparó con Octave: da lo mismo que `dragcore.js` a 5e-10 s (`fuente/pruebas/octave/igual.sh`).

**Para repetir el análisis:** `node .claude/skills/dragtree-datos-reales/scripts/analizar.js
fuente/pruebas/datos/reales/dragtrim_20261115_154941/` (con `--cfg '{"fusion":"modelo","primer_pico":false}'`
sale lo de la 0.8.3) y `--cfg '{"rollout_ft":0.8}'` etc. Para probar otra escala de pista, cambiar
`hitos` y `distancia_final` en `--cfg`.

## Por qué la simulación es optimista

`simularSesion` retrasa la velocidad GPS un tiempo fijo (`lag_gps`) y le suma ruido blanco. Un GPS de
teléfono real además **filtra** la velocidad (Kalman/suavizado del sistema operativo), sobre todo en
iPhone. Con aceleración constante, un filtro de primer orden con constante τ se ve igual que un
retraso τ; pero en la salida (aceleración que sube de golpe) y en los cambios de velocidad no, y eso
puede empujar al modelo a usar la "escala" para compensar, como pasó con −0.29. Hipótesis a probar:

(15 nov 2026: resuelto de otra forma, ver la segunda prueba real: el simulador ya tiene opciones "como
en la pista" y la fusión por nodos sustituye al modelo deriva + escala. Lo que sigue queda como historia.)

1. Agregar a `simularSesion` una opción `gps_filtro_s` (velocidad GPS = filtro de primer orden de la
   real, más el retraso) y ver si reproduce: retraso estimado bajo, escala muy negativa, error que
   crece con la distancia.
2. Si lo reproduce: probar (a) `latencia_max_s: 1.5`, (b) estimar el retraso con el modelo filtrado,
   (c) limitar la escala a un rango físico (inclinación de pocos grados ⇒ |escala| < ~0.05).
3. Validar cada idea con `analizar.js --cfg` en las corridas reales antes de tocar el código, y con
   `calibrar.js` cuando haya 3+ boletas.

## Calibrar con boleta (función acordada para la app)

Diseño propuesto (pedir visto bueno a Daniel antes de hacerlo):

- En el historial, en cada corrida: "Agregar boleta" (60 ft, 1/8, 1/4 y velocidades; reacción opcional).
- Con 3+ corridas con boleta del mismo teléfono: "Calibrar" busca rollout (0–1.5 ft) y retraso fijo
  (0–1.5 s o automático) que minimizan el RMS de los tiempos, como `calibrar.js`, y muestra el error
  antes/después y la validación dejando una fuera.
- Guarda el resultado en Ajustes (rollout + retraso fijo) y permite volver a "automático".
- Las velocidades no entran a la calibración (ver arriba).
- Guardar las boletas dentro de cada corrida en IndexedDB (campo nuevo, opcional) para no romper el
  historial existente; incluirlas en el zip exportado (`boleta_*.json`).

## Otras ideas

- **Trampa**: la app calcula la trampa con la velocidad integrada; compararla siempre con el GPS
  Doppler cerca de la meta (`analizar.js` lo muestra). Si difieren más de ~3 %, avisar en la corrida.
- **Soporte del teléfono**: pedir a Daniel que lo ponga firme (o en el piso/consola) y siempre en el
  mismo lugar; el ruido de 2 m/s² empeora la gravedad medida y el inicio.
- **GNSS externo** 10–25 Hz: con 10 Hz el error "solo GPS" baja mucho y la fusión mejora (ver
  `mc.js` con 10 Hz). Web Bluetooth solo en Android Chrome; iPhone necesita app nativa.
- **Más lecturas del GPS del teléfono** (Daniel, 28 oct: a ratos marca 2 Hz; ¿se puede fijar en 2–3?): desde la web
  no se puede pedir más (ya va `enableHighAccuracy: true, maximumAge: 0`; el navegador decide). En simulación casi no
  ayuda: 1/4 con acelerómetro, prom/peor en ms, retraso 0.6 s: 1 Hz 13/36, 2 Hz 12/28, 3 Hz 13/39, 5 Hz 11/38,
  10 Hz 9/39 (60 sesiones, semillas 5000+). Lo que pesa en la realidad es el retraso/filtro del GPS del teléfono y el
  rollout (+0.14/+0.16 s), no las lecturas por segundo; un GNSS externo ayuda sobre todo porque no trae ese retraso.
- **Dos teléfonos en el mismo auto**: promediar o comparar ayuda a separar errores del teléfono de
  errores de la boleta.
