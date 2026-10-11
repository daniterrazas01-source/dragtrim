# Drag Trim — contexto del proyecto

Medidor de tiempos de arrancones (1/8 y 1/4 de milla) con el GPS y el acelerómetro del
teléfono, más un simulador de semáforo para practicar la salida. El dueño (Daniel) corre en
autódromo con semáforo profesional. **Habla con él en español**, de forma clara y sin jerga
técnica innecesaria; prueba todo antes de publicar y dile qué tan seguro estás.

- App publicada (GitHub Pages): https://daniterrazas01-source.github.io/dragtrim/
- Repo: `daniterrazas01-source/dragtrim`. Pages sirve la raíz de **`gh-pages`** (confirmado con el
  flujo "pages build and deployment"); se hace push a `main` y a `gh-pages` para mantenerlas iguales.
- Daniel ya la tiene instalada en su teléfono como app web (PWA). Las actualizaciones le llegan
  solas al abrirla con internet (service worker "red primero"). **Nunca pedirle desinstalar**:
  borraría su historial de corridas.

## Historia y decisiones (resumen del chat original)

1. Empezó con un script de MATLAB Mobile (v1) que medía con la posición GPS a ~1 Hz y el reloj
   del bucle: errores de ~0.5–1 s. Se reescribió (v2 → v2.3).
2. Decisiones clave del algoritmo (`dragcore.js` = `drag_procesar.m`, deben quedar iguales):
   - Distancia = integral de la velocidad (no posición GPS). Hitos interpolados al instante exacto.
   - **Rollout 1 ft** como en pista (configurable, en décimas). Tiempos desde el cruce de 1 ft.
   - **Detección del arranque real**: solo cuenta si, saliendo de casi detenido (≤1 m/s), llega a
     50 km/h en ≤8 s sin detenerse. Así se ignoran burnout, salida del burnout, alineación y stage.
     Se puede armar la medición antes del burnout.
   - **Punto inicial preciso** (v2.3): gravedad medida en los 0.7 s de reposo en stage justo antes
     del arranque; inicio = cruce en cero de la recta del frente de subida (20–80% del pico) de la
     aceleración longitudinal; se integra desde 0.2 s antes (auto quieto). Eje "adelante" se
     calcula solo (el teléfono puede ir en cualquier orientación).
   - **Fusión GPS** modo `modelo`: error = deriva lineal + error de escala (inclinación/squat),
     ajustado por mínimos cuadrados a todo el GPS, + 50% del residuo; descarta saltos del GPS;
     estima solo el retraso del GPS (0–1 s).
   - Simulación con condiciones duras (stage 0.8–3 s, two-step, squat, pendiente, deriva):
     inicio del movimiento ~10 ms, cruce 1 ft ~10 ms, 60 ft ~8 ms, 1/4 ~10–13 ms (peor ~40 ms).
     **Aún no validado con datos reales** — ese es el siguiente paso.
3. Daniel pidió que la app **NO dé la salida** ni parezca un semáforo al medir: la pantalla de
   medición es neutral ("Esperando tu arranque" / "Corrida en curso"), sin luces ni vibración.
4. GPS del navegador ≈ 1 Hz; es suficiente porque el acelerómetro (~60 Hz) da la resolución fina.
   Para precisión tipo Dragy: receptor GNSS externo 10–25 Hz por Bluetooth (futuro; en iPhone
   complicado desde web).
5. Pestaña **Práctica** (beta 0.3): simulador de árbol Pro .4 / Full .5, solo y 1 vs 1 en el
   mismo teléfono (multitáctil), salida "soltar" (transbrake) o "tocar", luz roja (incluye salir
   antes de que baje el árbol), reglas de pista en 1 vs 1 (roja pierde; dos rojas: pierde quien
   salió primero), "retraso de tu auto", estadísticas por tipo de árbol.
   Reacción en **dos formatos** (0.3.1): **boleta** (desde el último ámbar, perfecta .400 Pro /
   .500 Full, como el ticket de pista) y **desde la verde** (perfecta .000).
6. Pendiente / ideas acordadas:
   - **Validar con datos reales**: Daniel probará en autódromo y mandará los zips exportados +
     tiempos de la boleta oficial (60 ft, 1/8 o 1/4, velocidad). Ajustar rollout/algoritmo con eso.
   - Sección **"Medir con el semáforo real"** (beta, solo marcada "en desarrollo" en Medir):
     grabar el árbol con la cámara, medir la reacción y registrarla con la corrida. No empezar sin
     que Daniel lo pida.
   - Más adelante: app nativa (Capacitor) para Play Store/App Store; GNSS externo.

7. **Fondos de pantalla** (beta 0.4): 6 fondos sticker bomb que Daniel hizo (`fuente/fondos/*.png`,
   el build los convierte a WebP en `fondos/`). Con fondo, la app usa estilo sticker: paneles con
   borde blanco, títulos como etiqueta chueca, color principal según el fondo (neón / rojo / blanco).
   Ajustes: elegir fondo o "Sin fondo" y qué tanto se ve (velo). Por defecto: Combinado, nivel medio.
   En una corrida el velo sube a 0.92. Las luces del semáforo de Práctica no cambian.
   Ojo: los stickers tienen marcas reales (NOS, Holley, JEGS…); para tiendas de apps habría que cambiarlas.

## Estructura

```
index.html, sw.js, manifest.webmanifest, icon-*.png   ← lo publicado (generado, no editar a mano)
fuente/app/src/dragcore.js     algoritmo (procesar, DetectorVivo, simulador)
fuente/app/src/app.js          interfaz: sensores, sesión, resultados, historial (IndexedDB), ajustes, exportar zip
fuente/app/src/practica.js     simulador de semáforo
fuente/app/src/index.template.html, style.css
fuente/app/tools/build.py      junta todo en un index.html autocontenido + sw.js + íconos (sube VERSION al cambiar)
fuente/publicar.sh             build + copia a la raíz
fuente/matlab/                 script MATLAB Mobile v2.3 (mismo algoritmo); Drag_tree_v2_unico.m = todo en un archivo
fuente/pruebas/                pruebas (ver abajo)
fuente/fondos/                 fondos originales (PNG); se publican como fondos/*.webp
```

Versionado: `APP_VERSION` en `app.js` (se ve en Ajustes) y `VERSION` en `build.py` (nombre de la
caché del service worker; cambiarlo fuerza la actualización). Versión actual: **beta 0.4** (fondos de pantalla estilo sticker; antes 0.3.2: animaciones apagables en Ajustes),
algoritmo v2.3.

Los zips exportados desde la app traen `drag_raw_gps_*.csv`, `drag_raw_acc_*.csv`,
`drag_raw_meta_*.json` (compatibles con `drag_reprocesar.m`), el resultado y un `DRAGPACK_*.txt`.
Para analizar datos reales: cargar los CSV crudos y correr `procesar()` de `dragcore.js` en Node.

## Cómo probar y publicar

```bash
cd fuente/pruebas
node mc.js          # Monte Carlo del algoritmo (detección en vivo + errores por hito)
node inicio.js '[{}]'   # precisión del punto inicial (acepta variantes de cfg en JSON)
node spike.js       # robustez ante saltos del GPS
python3 uitest.py demo   # app completa en Chromium headless (corrida simulada, historial, exportar, recalcular)
python3 uitest.py real   # igual, pero con GPS/acelerómetro falsos a través de las APIs del navegador
python3 pt_test.py       # simulador de semáforo (tiempos, rojas, 1 vs 1)
python3 mcheck.py ../matlab/*.m   # revisión estructural de MATLAB (aquí no hay MATLAB/Octave)
```
Las pruebas de navegador usan Playwright (Python) con el Chromium preinstalado y dejan
capturas en `fuente/pruebas/capturas/` (ignorado por git): revísalas antes de publicar.

Publicar: `bash fuente/publicar.sh`, commit, `git push origin main` y `git push origin main:gh-pages`.
Confirmar con WebFetch que la página cambió (el CDN tarda 1–3 min). Si github.io no es accesible desde
el contenedor, confirmar que el flujo "pages build and deployment" del commit terminó en éxito.

Reglas al cambiar el algoritmo: mantener `dragcore.js` y `drag_procesar.m` equivalentes,
correr `mc.js`/`inicio.js`/`spike.js` antes y después, y regenerar `Drag_tree_v2_unico.m`
(concatenación de `Drag_tree_v2.m` + `drag_config.m` + `drag_procesar.m` + `drag_reporte.m`).
