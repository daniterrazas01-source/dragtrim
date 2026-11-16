---
name: dragtree-medicion
description: Cómo mide Drag Tree los tiempos de arrancones (dragcore.js y su gemelo drag_procesar.m) y cómo cambiar el algoritmo sin perder precisión. Úsala antes de tocar dragcore.js, drag_procesar.m, la detección del arranque, el rollout, la fusión GPS + acelerómetro, el retraso del GPS, la velocidad de trampa o el simulador; también cuando Daniel pregunte por qué la app da distinto que la boleta, qué tan precisa es, o pida ideas para medir mejor (calibrar con boleta, GNSS externo, otro teléfono).
---

# Medición en Drag Tree

El algoritmo vive en dos lugares que **deben dar lo mismo**: `fuente/app/src/dragcore.js` (la app) y
`fuente/matlab/drag_procesar.m` (MATLAB Mobile). Versión del algoritmo: **v2.4** (15 nov 2026: fusión por
nodos con posición GPS; la v2.3 sigue disponible con `fusion: 'modelo', primer_pico: false`).

## Cómo mide, paso a paso (`procesar(gps, acc, cfg)`)

| Paso | Función (JS) | Qué hace | Por qué |
|---|---|---|---|
| 1 | limpieza | Ordena el GPS, quita lecturas inválidas (iOS manda −1) y repetidas | — |
| 2 | `buscarArranque` | Arranque real = salir de ≤1 m/s y llegar a 50 km/h en ≤8 s | Ignora burnout, salida del burnout, alineación y stage; se puede armar antes del burnout |
| 3 | gravedad + `refinarInicio` | Gravedad = mediana del reposo justo antes (0.7 s en stage); eje "adelante" = dirección media de la aceleración; inicio = cruce en cero de la recta del frente de subida (20–80 % del pico) | El teléfono va en cualquier posición; el inicio sale con ~10 ms de error en simulación |
| 4 | integración | Integra la aceleración longitudinal desde 0.2 s antes del inicio | Resolución fina (60 Hz) que el GPS de 1 Hz no tiene |
| 5 | `fusionNodos` | Corrige la velocidad integrada con una curva lineal a tramos (nodo cada 3 s, 0 en el arranque) ajustada por mínimos cuadrados a la **velocidad GPS** (con su retraso, que se busca en 0–1 s) y a la **posición GPS** a lo largo de la pista (a tiempo); descarta saltos | El error del acelerómetro cambia a media corrida cuando el teléfono se mueve en su soporte (corrida real del 15 nov: 10° de inclinación al arrancar); el modelo deriva + escala de la v2.3 no lo sigue |
| 6 | `cumtrapz` | Distancia = integral de la velocidad ya corregida | La posición GPS sola, a 1 Hz, no da el instante exacto; entra al ajuste del paso 5 |
| 7 | `cruce` | Instante exacto de cada hito por interpolación; tiempos desde el cruce del rollout | Como la pista: el ET arranca al destapar el stage |

Sin acelerómetro usable cae a "Solo GPS" (PCHIP sobre el GPS): errores de décimas.
`DetectorVivo` aplica la misma regla del paso 2 lectura por lectura (pantalla de medición en vivo);
si cambias una, cambia la otra.

Parámetros, valores y efecto de cada uno: `references/parametros.md`.

## Qué tan preciso es (lo que sabemos)

- **Simulación clásica** (`mc.js`, `inicio.js`): inicio ~10 ms, 60 ft ~8 ms, 1/4 ~11–14 ms (peor ~45 ms).
- **Simulación "como en la pista"** (`real.js`: velocidad GPS promediada, vibración, teléfono que se
  inclina): 60 ft 15–25 ms, 1/4 16–45 ms (peor 45–170). Con la v2.3 eran 30–70 y 40–140 (peor hasta 870).
  Valores de referencia exactos: `references/referencia-pruebas.md`.
- **Realidad** (dos corridas con boleta, mismo S22 Ultra, Autódromo Francisco Villa): con la v2.4 y
  rollout 1 ft, la del 15 nov da 60 ft −0.06, 1/8 +0.04, 1/4 +0.11 s. Lo que sobra crece con la
  distancia como si la pista estuviera medida con pies de 30 cm (1/4 = 396 m); con eso y rollout
  0.2–0.25 m queda en ±0.03 s. Es **una** corrida: pista, no ajuste. Todo en
  `references/hallazgos-reales.md`; léelo antes de proponer cambios al algoritmo.

## Reglas para cambiar el algoritmo

1. **Primero mide, luego cambia.** Corre y guarda la salida de `node mc.js`, `node inicio.js '[{}]'`
   y `node spike.js` (en `fuente/pruebas/`) antes del cambio. `inicio.js` acepta variantes de cfg en
   JSON para comparar ideas sin tocar código: `node inicio.js '[{}, {"peso_residuo": 0.3}]'`.
2. **Con datos reales, usa la skill `dragtree-datos-reales`** (`analizar.js --variantes`,
   `calibrar.js`). Un cambio que mejora la simulación pero empeora las boletas reales no sirve.
3. **JS y MATLAB iguales.** Haz el mismo cambio en `dragcore.js` y `drag_procesar.m` (y
   `drag_config.m` si es un parámetro). Luego regenera el archivo único:
   `python3 .claude/skills/dragtree-medicion/scripts/unir_matlab.py` (con `--revisar` solo comprueba).
   Revisa la estructura con `python3 fuente/pruebas/mcheck.py fuente/matlab/*.m` y **compara los números**
   con Octave: `bash fuente/pruebas/octave/igual.sh` (si falta Octave: `apt-get update && apt-get install -y
   --no-install-recommends octave`, ~2 min). Corre 19 sesiones (simuladas y la real) en los dos y deben
   coincidir a menos de 1e-6 s.
4. **Después**: vuelve a correr las tres pruebas y `node real.js`, y presenta una tabla antes/después por hito. Si algo
   empeora más de ~2 ms en promedio o ~10 ms en el peor caso, explícalo o no lo hagas.
5. **Si el cambio es por algo que el simulador no tiene** (ej. GPS filtrado como el de iPhone), agrega
   esa condición a `simularSesion` como opción (sin cambiar lo que da por defecto, o los números de
   referencia dejan de servir) y pruébala aparte. Ya existen (apagadas por defecto, las usa `real.js`):
   `gps_vel_media_s`, `pos_ruido_m`, `pos_deriva_m`, `incl_salto_deg`, `incl_yaw_deg`, `vib_corrida`,
   `cuant`, `rapido`.
6. **No rompas lo guardado**: el historial de Daniel guarda los datos crudos y "Recalcular" vuelve a
   procesarlos con el algoritmo nuevo. Los nombres de campos de `R` y `run` que usa `app.js` (hitos,
   calidad, trampa_kmh, t_rollout, serie, gpsPts) deben seguir existiendo.
7. Sube versión y publica con la skill `dragtree-publicar`. Anota en CLAUDE.md qué cambió y por qué.

## Ideas para medir mejor (en orden de lo que más promete)

Detalles y cómo probar cada una en `references/hallazgos-reales.md`.

1. **Largo real de la pista** (hipótesis del 15 nov): si se confirma que el Autódromo Francisco Villa
   está medido con pies de 30 cm, un ajuste "pista" (escala de distancias 0.984) quita +0.03/+0.10 s.
   Falta que Daniel lo confirme (preguntar en la pista o medir) y más boletas.
2. **Calibrar con boleta** (ya acordado): rollout (y, con la v2.4, la escala de la pista) con 3+
   corridas (`calibrar.js` ya lo hace fuera de la app; falta la función dentro de la app).
3. **Inclinación del teléfono con el propio acelerómetro**: mientras el auto empuja fuerte, el tamaño
   de la fuerza medida (√(a² + g²)) no depende de la inclinación. Probado el 15 nov: mejora la salida
   cuando el teléfono se movió, pero mete ruido cuando no; quedó fuera (la fusión por nodos ya lo corrige).
4. **Montaje del teléfono**: ruido en reposo ~2 m/s² por vibración del soporte; un soporte firme
   mejora la gravedad medida y el inicio.
5. **GNSS externo 10–25 Hz por Bluetooth** (como Dragy/RaceBox): con Web Bluetooth funciona en Android
   Chrome; en iPhone Safari no existe Web Bluetooth (haría falta la app nativa con Capacitor).

## Lo que NO se debe hacer

- No dar la salida ni parecer semáforo al medir (Daniel lo pidió). La excepción es el modo
  "Race 1 vs 1" en beta (dos teléfonos, la app da la salida para pistas sin semáforo); solo cuando
  Daniel lo pida.
- No ajustar el algoritmo para empatar **una** boleta: rollout y retraso se compensan entre sí.
- No ajustar a la velocidad de 1/4 de las boletas (181.7 y 193.96 km/h): en las dos corridas sale 5–9 %
  arriba del GPS, que marca que el auto ya casi no acelera en la meta; la de 1/8 sí coincide.
- No volver al modelo deriva + escala como principal: con el teléfono inclinándose 10° dio escala 0.27
  (antes −0.29) y movió el 60 ft más de una décima.
