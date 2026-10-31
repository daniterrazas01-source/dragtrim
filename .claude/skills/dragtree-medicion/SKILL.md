---
name: dragtree-medicion
description: Cómo mide Drag Tree los tiempos de arrancones (dragcore.js y su gemelo drag_procesar.m) y cómo cambiar el algoritmo sin perder precisión. Úsala antes de tocar dragcore.js, drag_procesar.m, la detección del arranque, el rollout, la fusión GPS + acelerómetro, el retraso del GPS, la velocidad de trampa o el simulador; también cuando Daniel pregunte por qué la app da distinto que la boleta, qué tan precisa es, o pida ideas para medir mejor (calibrar con boleta, GNSS externo, otro teléfono).
---

# Medición en Drag Tree

El algoritmo vive en dos lugares que **deben dar lo mismo**: `fuente/app/src/dragcore.js` (la app) y
`fuente/matlab/drag_procesar.m` (MATLAB Mobile). Versión del algoritmo: v2.3.

## Cómo mide, paso a paso (`procesar(gps, acc, cfg)`)

| Paso | Función (JS) | Qué hace | Por qué |
|---|---|---|---|
| 1 | limpieza | Ordena el GPS, quita lecturas inválidas (iOS manda −1) y repetidas | — |
| 2 | `buscarArranque` | Arranque real = salir de ≤1 m/s y llegar a 50 km/h en ≤8 s | Ignora burnout, salida del burnout, alineación y stage; se puede armar antes del burnout |
| 3 | gravedad + `refinarInicio` | Gravedad = mediana del reposo justo antes (0.7 s en stage); eje "adelante" = dirección media de la aceleración; inicio = cruce en cero de la recta del frente de subida (20–80 % del pico) | El teléfono va en cualquier posición; el inicio sale con ~10 ms de error en simulación |
| 4 | integración | Integra la aceleración longitudinal desde 0.2 s antes del inicio | Resolución fina (60 Hz) que el GPS de 1 Hz no tiene |
| 5 | `estimarLatencia` + `mc2` | Corrige la velocidad integrada con el GPS: error = deriva·t + escala·v (mínimos cuadrados) + 50 % del residuo; descarta saltos; busca el retraso del GPS en 0–1 s | Deriva del sensor e inclinación del auto (squat) |
| 6 | `cumtrapz` | Distancia = integral de la velocidad (no la posición GPS) | La posición GPS a 1 Hz tiene metros de error |
| 7 | `cruce` | Instante exacto de cada hito por interpolación; tiempos desde el cruce del rollout | Como la pista: el ET arranca al destapar el stage |

Sin acelerómetro usable cae a "Solo GPS" (PCHIP sobre el GPS): errores de décimas.
`DetectorVivo` aplica la misma regla del paso 2 lectura por lectura (pantalla de medición en vivo);
si cambias una, cambia la otra.

Parámetros, valores y efecto de cada uno: `references/parametros.md`.

## Qué tan preciso es (lo que sabemos)

- **Simulación** (`fuente/pruebas/`): inicio ~10 ms, 60 ft ~8 ms, 1/4 ~10–13 ms (peor ~40 ms).
  Valores de referencia exactos para comparar: `references/referencia-pruebas.md`.
- **Realidad** (una sola corrida con boleta, 11 oct 2026): 60 ft +0.003, 1/8 +0.137, 1/4 +0.162 s.
  La simulación es **mucho más optimista** que la realidad: el error real no viene de lo que el
  simulador prueba. Diagnóstico y pistas en `references/hallazgos-reales.md`. Léelo antes de proponer
  cambios al algoritmo.

## Reglas para cambiar el algoritmo

1. **Primero mide, luego cambia.** Corre y guarda la salida de `node mc.js`, `node inicio.js '[{}]'`
   y `node spike.js` (en `fuente/pruebas/`) antes del cambio. `inicio.js` acepta variantes de cfg en
   JSON para comparar ideas sin tocar código: `node inicio.js '[{}, {"peso_residuo": 0.3}]'`.
2. **Con datos reales, usa la skill `dragtree-datos-reales`** (`analizar.js --variantes`,
   `calibrar.js`). Un cambio que mejora la simulación pero empeora las boletas reales no sirve.
3. **JS y MATLAB iguales.** Haz el mismo cambio en `dragcore.js` y `drag_procesar.m` (y
   `drag_config.m` si es un parámetro). Luego regenera el archivo único:
   `python3 .claude/skills/dragtree-medicion/scripts/unir_matlab.py` (con `--revisar` solo comprueba).
   Aquí no hay MATLAB ni Octave: revisa con `python3 fuente/pruebas/mcheck.py fuente/matlab/*.m` y
   compara la lógica línea por línea con el JS.
4. **Después**: vuelve a correr las tres pruebas y presenta una tabla antes/después por hito. Si algo
   empeora más de ~2 ms en promedio o ~10 ms en el peor caso, explícalo o no lo hagas.
5. **Si el cambio es por algo que el simulador no tiene** (ej. GPS filtrado como el de iPhone), agrega
   esa condición a `simularSesion` como opción (sin cambiar lo que da por defecto, o los números de
   referencia dejan de servir) y pruébala aparte.
6. **No rompas lo guardado**: el historial de Daniel guarda los datos crudos y "Recalcular" vuelve a
   procesarlos con el algoritmo nuevo. Los nombres de campos de `R` y `run` que usa `app.js` (hitos,
   calidad, trampa_kmh, t_rollout, serie, gpsPts) deben seguir existiendo.
7. Sube versión y publica con la skill `dragtree-publicar`. Anota en CLAUDE.md qué cambió y por qué.

## Ideas para medir mejor (en orden de lo que más promete)

Detalles y cómo probar cada una en `references/hallazgos-reales.md`.

1. **Calibrar con boleta** (ya acordado): ajustar rollout y retraso del GPS por teléfono con 3+
   corridas (`calibrar.js` ya lo hace fuera de la app; falta la función dentro de la app).
2. **Ampliar la búsqueda del retraso** a ~1.5 s: la boleta sugiere 0.9–1.0 s y hoy el límite es 1.0.
3. **Modelo de GPS más real** en el simulador: velocidad filtrada (como hace el teléfono), no solo
   retrasada.
4. **Montaje del teléfono**: ruido en reposo ~2 m/s² por vibración del soporte; un soporte firme
   mejora la gravedad medida y el inicio.
5. **GNSS externo 10–25 Hz por Bluetooth** (como Dragy/RaceBox): con Web Bluetooth funciona en Android
   Chrome; en iPhone Safari no existe Web Bluetooth (haría falta la app nativa con Capacitor).

## Lo que NO se debe hacer

- No dar la salida ni parecer semáforo al medir (Daniel lo pidió). La excepción es el modo
  "Race 1 vs 1" en beta (dos teléfonos, la app da la salida para pistas sin semáforo); solo cuando
  Daniel lo pida.
- No ajustar el algoritmo para empatar **una** boleta: rollout y retraso se compensan entre sí.
- No ajustar a la velocidad de 1/4 de la primera boleta (181.7 km/h): no cuadra ni con el GPS ni con
  su propia velocidad de 1/8.
