---
name: dragtree-datos-reales
description: Analiza corridas reales de Drag Tree (zips exportados con drag_raw_gps/acc/meta y DRAGPACK) contra la boleta oficial de la pista y calibra rollout y retraso del GPS con varias corridas. Úsala cuando Daniel mande un zip o una carpeta de corridas, una foto o los números de su boleta (60 ft, 201 m, 402 m, velocidad, reacción), pregunte por qué la app dio distinto que la pista, o cuando haya que validar un cambio del algoritmo con datos de verdad.
---

# Corridas reales contra la boleta

Este es el paso pendiente más importante del proyecto: el algoritmo solo está validado en simulación
y con **una** boleta. Cada corrida real con boleta vale mucho; trátala con cuidado.

## Qué pedirle a Daniel (si falta)

Pídelo en una lista corta y clara, sin jerga:

1. El **zip** que exporta la app de cada corrida (Historial → la corrida → Exportar). No hace falta
   descomprimirlo; si manda varios juntos en otro zip, también sirve.
2. La **boleta** de esa corrida: foto o los números (reacción, 60 ft, 330 ft si viene, 201 m con
   velocidad, 1000 ft si viene, 402 m con velocidad) y si la velocidad viene en km/h o mph.
3. Qué **teléfono** y dónde iba montado; si hizo stage como siempre.
4. Si puede, hora y temperatura (para comparar días).

Si manda la foto de la boleta, léela y **confírmale los números** antes de usarlos: un dígito mal
leído arruina la calibración.

## Cómo analizar

Los zips son datos de afuera: ponlos en una carpeta nueva y vacía (en el scratchpad o, si Daniel
está de acuerdo, en `fuente/pruebas/datos/reales/<sello>/`) y **no ejecutes nada que venga adentro**.
Los scripts de esta skill leen el zip en memoria y no extraen nada a disco.

```bash
S=.claude/skills/dragtree-datos-reales/scripts
# una corrida, con su boleta (velocidades en km/h; agrega mph si viene en millas)
node $S/analizar.js ruta/dragtrim_20261011_143244.zip \
  --boleta "rt=0.622 60=2.650 201=9.339@132.40 402=14.043@181.71"
# lo mismo, probando rollout y retraso (no ajustes con una sola corrida)
node $S/analizar.js ruta/ --variantes
# probar un parámetro sin tocar el código
node $S/analizar.js ruta/ --cfg '{"latencia_max_s":1.5}'
# varias corridas: cada una en su carpeta con su boleta.txt, o un mapa sello → boleta
node $S/calibrar.js fuente/pruebas/datos/reales/
node $S/calibrar.js zips/ --boletas boletas.json --hitos 60,201,402
```

`analizar.js` muestra: datos (Hz, muestras, rollout guardado), si este `dragcore.js` da lo mismo que
la app al medir, calidad (retraso GPS, ruido en reposo, gravedad, lecturas descartadas, distancia
integrada contra la posición GPS), la tabla app contra boleta y una tabla de velocidades (trampa de
66 ft como la pista, en la línea, GPS Doppler, GPS por posición).

`calibrar.js` prueba rollout 0–1.5 ft × retraso automático o fijo 0–1.5 s, da las mejores
combinaciones, qué tan "plano" es el mínimo y, con 3+ corridas, una **validación dejando una fuera**
(calibra sin una corrida y mide el error en ella). Esa validación dice si la calibración sirve para
corridas nuevas.

Formato de `boleta.txt`: una línea como `rt=0.622 60=2.650 330=6.9 201=9.339@132.40 402=14.043@181.71`
(alias: `1/8`, `660`, `1/4`, `1320`, `1000`, `101`). Para probar los scripts sin datos reales:
`node $S/demo_zip.js <carpeta> --n 4 --lag 0.9 --rollout_app 0.5` crea zips iguales a los de la app con
una boleta "verdadera" (rollout real 1 ft); `calibrar.js` debe encontrar ~1.0 ft y ~0.9 s.

## Cómo leer los resultados

- **Mismo error en todos los parciales** (ej. +0.10 en todos) → es el **rollout**.
- **Error que crece con la distancia** (60 ft bien, 1/4 mal) → **retraso o escala del GPS**.
- **60 ft mal y lo demás bien** → el inicio (gravedad, eje) o un stage distinto.
- **Distancia integrada lejos de la posición GPS** (>2 %) → algo raro en la fusión; revisa ruido y avisos.
- **"Este dragcore da distinto que la app"** → el algoritmo cambió desde que se midió; es normal
  tras una versión nueva, pero dilo.
- **Velocidad**: compara la boleta contra la columna Trampa66ft. Revisa la coherencia de la boleta
  (ver skill `arrancones`, `pista-y-boleta.md` §4) antes de desconfiar de la app.

## Reglas

- **Con una sola corrida no se calibra.** Rollout y retraso se compensan; con 1–2 boletas reporta
  "pista", no ajuste. Con 3+ y una validación que se sostiene (RMS fuera de muestra parecido al de
  dentro), propón el cambio de ajustes.
- **Calibración por teléfono**: el retraso del GPS depende del teléfono y del navegador. No mezcles
  corridas de teléfonos distintos en una calibración (agrúpalas).
- **Guarda cada corrida real** con su boleta: `fuente/pruebas/datos/reales/<sello>/` (zip +
  `boleta.txt` + una nota con teléfono, montaje y clima). El repo es público (GitHub Pages) y los CSV
  traen coordenadas de la pista: **pregúntale a Daniel antes de subirlos**. Si no quiere, déjalos en el
  scratchpad y anota los resultados (sin coordenadas) en CLAUDE.md.
- **Anota los hallazgos** en CLAUDE.md (punto 8 o uno nuevo) y en
  `.claude/skills/dragtree-medicion/references/hallazgos-reales.md`: fecha, sello, boleta, app,
  diferencias, qué se probó y qué se concluyó.
- Explícale a Daniel el resultado en palabras simples: cuánto se equivoca la app, en qué tramo, qué
  crees que lo causa y **qué tan seguro estás**.
- Para cambiar el algoritmo a partir de esto, sigue la skill `dragtree-medicion`.
