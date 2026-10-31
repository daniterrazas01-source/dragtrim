# Valores de referencia de las pruebas del algoritmo

Salida de las pruebas con el algoritmo v2.3 sin cambios (24 oct 2026). Las semillas son fijas, así
que deben salir **idénticas** mientras no cambie el algoritmo ni el simulador. Si salen distintas
sin que hayas tocado nada, algo cambió por accidente.

## `node mc.js` (error medio / peor, en s; 40 sesiones por renglón)

```
GPS 1 Hz, retraso 0.25s: vivo OK 40/40, fusión 40/40, max err t0 0.04s
  60ft    fus 0.007/0.031   soloGPS 0.027/0.135
  1/4     fus 0.010/0.041   soloGPS 0.038/0.142
GPS 1 Hz, retraso 0.6s: vivo OK 40/40, fusión 40/40, max err t0 0.04s
  60ft    fus 0.007/0.027   soloGPS 0.029/0.116
  1/4     fus 0.013/0.045   soloGPS 0.033/0.158
GPS 10 Hz, retraso 0.3s: vivo OK 40/40, fusión 40/40, max err t0 0.03s
  60ft    fus 0.006/0.023   soloGPS 0.037/0.095
  1/4     fus 0.007/0.024   soloGPS 0.043/0.106
```

## `node inicio.js '[{}]'` (60 sesiones)

```
GPS 1 Hz {}
  cruce 1 ft   sesgo    3 ms | prom   9 | peor   32
  inicio mov.  sesgo    5 ms | prom   9 | peor   33
  60 ft        sesgo    3 ms | prom   8 | peor   29
  1/4 (ro)     sesgo    2 ms | prom  13 | peor   38
  1/4 sin ro   sesgo   -1 ms | prom  14 | peor   40
GPS 10 Hz {}
  cruce 1 ft   sesgo    4 ms | prom  10 | peor   33
  inicio mov.  sesgo    6 ms | prom   9 | peor   25
  60 ft        sesgo    3 ms | prom   7 | peor   19
  1/4 (ro)     sesgo    3 ms | prom   9 | peor   25
  1/4 sin ro   sesgo    1 ms | prom  14 | peor   48
```

## `node spike.js` (GPS con un salto falso de +14 km/h)

```
{"stage_min":0.8,"stage_max":3} vivo 40/40 | 1/4 con salto GPS: modelo 24 / 97 ms (descartadas 40) | puntos 64 / 199 ms
{"stage_min":3,"stage_max":6} vivo 40/40 | 1/4 con salto GPS: modelo 21 / 64 ms (descartadas 40) | puntos 60 / 210 ms
```

Para ver todo junto: `bash .claude/skills/dragtree-publicar/scripts/probar_todo.sh algoritmo`.
Si cambias el algoritmo a propósito, actualiza este archivo con los valores nuevos.
