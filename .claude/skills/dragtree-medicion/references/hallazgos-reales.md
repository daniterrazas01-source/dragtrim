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

## Por qué la simulación es optimista

`simularSesion` retrasa la velocidad GPS un tiempo fijo (`lag_gps`) y le suma ruido blanco. Un GPS de
teléfono real además **filtra** la velocidad (Kalman/suavizado del sistema operativo), sobre todo en
iPhone. Con aceleración constante, un filtro de primer orden con constante τ se ve igual que un
retraso τ; pero en la salida (aceleración que sube de golpe) y en los cambios de velocidad no, y eso
puede empujar al modelo a usar la "escala" para compensar, como pasó con −0.29. Hipótesis a probar:

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
- **Dos teléfonos en el mismo auto**: promediar o comparar ayuda a separar errores del teléfono de
  errores de la boleta.
