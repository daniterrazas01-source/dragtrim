# Valores de referencia de las pruebas del algoritmo

Salida de las pruebas con el algoritmo **v2.4** (15 nov 2026: fusión por nodos + `primer_pico`). Las
semillas son fijas, así que deben salir **idénticas** mientras no cambie el algoritmo ni el simulador.
Si salen distintas sin que hayas tocado nada, algo cambió por accidente. (Los valores de la v2.3 están
en el historial de git de este archivo; con `{"fusion":"modelo","primer_pico":false}` el algoritmo de
la v2.3 se reproduce idéntico.)

## `node mc.js` (error medio / peor, en s; 40 sesiones por renglón)

```
GPS 1 Hz, retraso 0.25s: vivo OK 40/40, fusión 40/40, max err t0 0.04s
  60ft    fus 0.008/0.023   soloGPS 0.027/0.135
  330ft   fus 0.011/0.039   soloGPS 0.037/0.146
  1/8     fus 0.012/0.039   soloGPS 0.036/0.142
  1000ft  fus 0.012/0.035   soloGPS 0.038/0.148
  1/4     fus 0.011/0.033   soloGPS 0.038/0.142
GPS 1 Hz, retraso 0.6s: vivo OK 40/40, fusión 40/40, max err t0 0.04s
  60ft    fus 0.009/0.028   soloGPS 0.029/0.116
  330ft   fus 0.012/0.038   soloGPS 0.031/0.133
  1/8     fus 0.013/0.038   soloGPS 0.033/0.144
  1000ft  fus 0.011/0.031   soloGPS 0.033/0.149
  1/4     fus 0.011/0.030   soloGPS 0.033/0.158
GPS 10 Hz, retraso 0.3s: vivo OK 40/40, fusión 40/40, max err t0 0.03s
  60ft    fus 0.006/0.022   soloGPS 0.037/0.095
  330ft   fus 0.007/0.023   soloGPS 0.041/0.099
  1/8     fus 0.007/0.022   soloGPS 0.043/0.103
  1000ft  fus 0.007/0.020   soloGPS 0.043/0.106
  1/4     fus 0.007/0.021   soloGPS 0.043/0.106
```

## `node inicio.js '[{}]'` (60 sesiones)

```
GPS 1 Hz {}
  cruce 1 ft   sesgo   -1 ms | prom   7 | peor   20
  inicio mov.  sesgo    5 ms | prom   9 | peor   32
  60 ft        sesgo    7 ms | prom   9 | peor   27
  1/4 (ro)     sesgo    5 ms | prom  13 | peor   44
  1/4 sin ro   sesgo   -1 ms | prom  13 | peor   42
GPS 10 Hz {}
  cruce 1 ft   sesgo   -2 ms | prom   8 | peor   31
  inicio mov.  sesgo    6 ms | prom   9 | peor   25
  60 ft        sesgo    6 ms | prom   7 | peor   26
  1/4 (ro)     sesgo    3 ms | prom   8 | peor   30
  1/4 sin ro   sesgo   -5 ms | prom   9 | peor   28
```

## `node spike.js` (GPS con un salto falso de +14 km/h)

```
{"stage_min":0.8,"stage_max":3} vivo 40/40 | 1/4 con salto GPS: app (nodos) 11 / 39 ms (descartadas 56) | puntos 64 / 199 ms
{"stage_min":3,"stage_max":6} vivo 40/40 | 1/4 con salto GPS: app (nodos) 11 / 31 ms (descartadas 57) | puntos 60 / 210 ms
```
(Con el modelo de la v2.3 eran 24 / 97 y 21 / 64 ms.)

## `node real.js` (condiciones "como en la pista"; ms, promedio / peor, 40 sesiones)

```
error de cada tiempo en ms: promedio / peor   (40 sesiones por escenario)
teléfono firme
  nodos (v2.4)  60 ft  20 /  64   1/8  19 /  62   1/4  19 /  57
  modelo (v2.3) 60 ft  40 / 106   1/8  56 / 140   1/4  56 / 153
teléfono que se inclina 12°
  nodos (v2.4)  60 ft  22 /  64   1/8  46 / 141   1/4  45 / 127
  modelo (v2.3) 60 ft  73 / 331   1/8 152 / 925   1/4 141 / 871
auto rápido, teléfono firme
  nodos (v2.4)  60 ft  15 /  44   1/8  16 /  59   1/4  14 /  42
  modelo (v2.3) 60 ft  28 /  86   1/8  39 / 111   1/4  40 / 130
auto rápido, se inclina 12°
  nodos (v2.4)  60 ft  15 /  69   1/8  25 /  56   1/4  25 /  68
  modelo (v2.3) 60 ft  49 / 201   1/8  73 / 407   1/4  68 / 501
auto rápido, 12°, posición GPS mala
  nodos (v2.4)  60 ft  15 /  75   1/8  26 /  59   1/4  27 /  66
  modelo (v2.3) 60 ft  49 / 201   1/8  73 / 407   1/4  68 / 501
GPS a 2 Hz, se inclina 8°
  nodos (v2.4)  60 ft  26 /  89   1/8  39 / 157   1/4  40 / 170
  modelo (v2.3) 60 ft  51 / 211   1/8 109 / 300   1/4 101 / 289
FALLAS: 0
```

## `bash fuente/pruebas/octave/igual.sh` (la app contra MATLAB, con Octave)

```
19 sesiones
38 resultados de la app, 38 de Octave; mayor diferencia 5.0e-10 s
FALLAS: 0
```

Para ver todo junto: `bash .claude/skills/dragtree-publicar/scripts/probar_todo.sh algoritmo`.
Si cambias el algoritmo a propósito, actualiza este archivo con los valores nuevos.
