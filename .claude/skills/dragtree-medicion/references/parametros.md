# Parámetros del algoritmo (`defaultConfig()` en dragcore.js = `drag_config.m`)

Unidades: s, m/s, m, m/s². Lo que el usuario cambia en Ajustes está marcado con ★ (`cfgActual()` en
`app.js`); lo demás solo se cambia en código.

| Parámetro | Valor | Qué controla | Si lo subes / bajas |
|---|---|---|---|
| ★ `rollout_ft` | 1.0 (Ajustes: 0–2 en décimas) | Pies que rueda antes de que corra el reloj | Más rollout = todos los tiempos más cortos (~0.1 s por medio pie en el simulador) |
| ★ `distancia_final` | 402.336 o 201.168 | Meta | — |
| `hitos` | 60, 330, 1/8, 1000, 1/4 ft | Parciales | No agregar sin revisar `app.js` (exportar usa estos nombres) |
| `dist_trampa_m` | 20.1168 (66 ft) | Zona de velocidad de trampa | Igual que la pista; no cambiar |
| `v_baja` | 1.0 | "Casi detenido" para el arranque | Más alto: confunde la alineación con arranque |
| ★ `v_confirma` | 50 km/h | Velocidad que confirma un arranque | Más bajo: un burnout largo podría contar |
| ★ `t_confirma` | 8 s | Tiempo máximo para llegar a `v_confirma` | — |
| `v_corrida` | 3.0 | Referencia interna para ubicar el arranque y contar movimientos previos | — |
| `v_quieto`, `t_parada_s` | 0.5, 5 | Fin por detenido (en vivo) | — |
| `umbral_mov` | 0.35 | Aceleración mínima para ver el arranque | Con soporte que vibra (ruido ~2) manda `4·ruido` |
| ★ `usar_acc` | true | Fusión con acelerómetro | false = solo GPS (décimas de error) |
| `fs` | 100 | Rejilla de cálculo (Hz) | — |
| `suavizado_s` | 0.10 | Promedio móvil del acelerómetro | Más = menos ruido pero inicio más borroso |
| `ventana_fwd_s` | 1.5 | Ventana para hallar el eje adelante (detección básica) | — |
| `refinar_inicio` | true | Inicio por la recta del frente de subida | false = detección básica (peor) |
| `reposo_s` | 0.7 | Reposo en stage para medir la gravedad | Si el stage es más corto, usa lo que haya |
| `pre_integracion_s` | 0.2 | Integra desde un poco antes del inicio | — |
| `fusion` | 'modelo' | Deriva + escala + 50 % del residuo | 'puntos' pasa por cada lectura (peor con saltos) |
| `peso_residuo` | 0.5 | Cuánto se cree al residuo de cada lectura GPS | 0 = solo el modelo suave; 1 = cada lectura |
| `latencia_gps_s` | NaN (estimar) | Retraso del GPS | Un número lo fija (lo usa `calibrar.js`) |
| `latencia_max_s` | 1.0 | Hasta dónde busca el retraso | La boleta sugiere ~0.9–1.0: está en el borde |
| `margen_final_m` | 15 | Metros extra tras la meta antes de cortar (en vivo) | — |
| `t_max_corrida` | 60 | Corte de seguridad (en vivo) | — |
| `t_inicio_busqueda` | −∞ | La app pone el arranque en vivo − 0.5 s | Evita confundir movimientos anteriores |

## Lo que devuelve `procesar()`

`R.ok`, `R.mensaje`, `R.avisos[]`, series `t v d a`, `t0` (inicio del movimiento), `tRo` (cruce del
rollout), `tFin`, `hitos[{nombre, dist_m, t, v_kmh}]` (t desde el rollout, v instantánea en la línea),
`trampa_kmh` (solo para la meta elegida), `t_0_100`, `t_0_60mph`, `est`, `calidad` (`metodo`,
`gps_hz`, `acc_hz`, `hacc_mediana_m`, `ruido_reposo`, `g_medida`, `latencia_gps_s`, `gps_descartadas`,
`mov_ignorados`, `dist_pos_m`, `dist_integrada_m`), `gps` (puntos GPS ya corridos por el retraso).

## Lo que guarda la app de cada corrida (IndexedDB 'dragtrim')

`raw.gps` (desde 20 s antes del arranque) y `raw.acc` (desde 8 s antes), `cfg`, resultados y
`calidad`. "Recalcular" corre `procesar()` otra vez sobre `raw` con los ajustes actuales.
Exportar arma el zip: `drag_raw_gps_*.csv` (t_s, lat, lon, v_mps, hacc_m), `drag_raw_acc_*.csv`
(t_s, ax, ay, az, con gravedad, m/s²), `drag_raw_meta_*.json` (distancia_final, t_inicio_busqueda,
rollout_ft), `drag_trim_result_*.csv` y `DRAGPACK_*.txt` (resultado en base64). Los tiempos `t_s` son
segundos del reloj interno del navegador, no hora del día.
