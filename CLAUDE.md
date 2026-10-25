# Drag Tree (antes Drag Trim) — contexto del proyecto

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
   - Sección **"Medir con el semáforo real"** (Daniel lo pidió el 24 oct; EN CURSO): la cámara graba el
     árbol mientras está armada y, al terminar, se calcula la reacción. Especificación completa en
     `archivo/ideas/semaforo_real/plan.md` (+ informes; prototipos en `fuente/pruebas/arbol_proto/`).
     Avance (25 oct): `semaforo_vision.js`, `semaforo.js` y `semaforo_sim.js` funcionan; pruebas
     `semaforo_mc.js` (todas las condiciones; resultados en `archivo/ideas/semaforo_real/resultados_mc.txt`),
     `reaccion.js` (punta a punta) y `semaforo_sim_test.js`. A 60 fps de día/sombra/noche/incandescente: RT con
     ±4–9 ms (solo cámara, sesgo ~2.6 ms). Pendiente en detección: PWM (sobre todo 1000 Hz), 30 fps (sesgo +5 ms
     en ámbar, σ ~20), sol de frente a veces no lee (58–92 %), 1 roja falsa en 24 y casos sueltos de 100–300 ms
     (noche Full, PWM 1000) desde que el cambio mínimo de un flanco bajó de 40 % a 12 % (por el sol): revisar. **Plan acordado con Daniel por
     el límite de uso:** (1) terminar detección + cálculos (semaforo_vision.js, semaforo.js,
     semaforo_sim.js y sus pruebas semaforo_mc.js/reaccion.js) **con ultracode**; (2) **PAUSAR y avisarle**
     para que baje el esfuerzo; (3) sin ultracode: página de prueba (T6), cámara (T3) e integración en la
     app (T4/T5); (4) revisión final corta con ultracode antes de publicar. Guardar (commit + push a la rama)
     al terminar cada parte.
   - **Race 1 vs 1** (idea de Daniel, 24 oct; tarjeta "en desarrollo" en Medir desde 0.5.4; no programar
     hasta que lo pida): dos autos, cada uno con la app en su teléfono, en pista sin semáforo o lugar
     controlado; la app da la salida a los dos a la vez (excepción a propósito al punto 3, solo en este modo),
     mide reacción y tiempos de ambos y el ticket de los dos sale en un teléfono. Diseño ya estudiado en
     `archivo/ideas/race_1vs1.md` (no repetir el análisis): hotspot de un teléfono + WebRTC emparejado con
     QR (sin internet ni servidores ajenos), sincronía tipo NTP con pings, stage = quieto (acelerómetro + GPS
     <1 km/h), árbol de practica.js tras espera al azar, RT = tRo − verde (calibrar el retraso de pantalla y
     sensor de cada teléfono: 20–60 ms por modelo), roja si cruza el rollout antes de la verde, "empate
     técnico" si la diferencia es menor al error. Primer paso: página de prueba aparte en sus teléfonos.
   - Más adelante: app nativa (Capacitor) para Play Store/App Store; GNSS externo.
   - **Logo nuevo** (pendiente, 23 oct): borradores y referencias en `archivo/logo_pendiente/`.
     Daniel quiere el logo de su calcomanía original; el redibujo v4 no lo convenció. No cambiar el
     logo de la app hasta que él lo retome.

7. **Fondos de pantalla** (beta 0.4): 6 fondos sticker bomb que Daniel hizo (`fuente/fondos/*.png`,
   el build los convierte a WebP en `fondos/`). Con fondo, la app usa estilo sticker: paneles con
   borde blanco, títulos como etiqueta chueca, color principal según el fondo (neón / rojo / blanco).
   Ajustes: elegir fondo o "Sin fondo" y qué tanto se ve (velo). Por defecto: Combinado, nivel medio.
   En una corrida el velo sube a 0.92. Las luces del semáforo de Práctica no cambian.
   Ojo: los stickers tienen marcas reales (NOS, Holley, JEGS…); para tiendas de apps habría que cambiarlas.

8. **Primera prueba real** (11 oct 2026, autódromo, zip `dragtrim_20261011_143244`, rollout 0.5 ft):
   boleta 60ft 2.650 / 201 m 9.339 @132.40 / 402 m 14.043 @ 181.71 km/h (confirmado por Daniel;
   ojo: GPS Doppler y posición dicen ~166–169 km/h en la meta, ~8% menos; la de 1/8 sí coincide ±2%) / RT 0.622. App: 2.653 / 9.476 @135.1 / 14.205 trampa 166.8 (+0.003/+0.137/+0.162).
   Hallazgos: la distancia integrada coincide con la posición GPS (±2 m en 400 m); el retraso GPS
   estimado fue 0.52 s pero los parciales de la boleta sugieren ~0.9–1.0 s (el modelo deriva+escala
   absorbe parte con escala −0.29); rollout y retraso son casi intercambiables con una sola corrida
   (ej. rollout 1.0 + lag auto → −0.089/+0.045/+0.070; lag 0.9 + rollout 0 → −0.004/+0.020/+0.030).
   Acelerómetro del teléfono: ruido en reposo ~2 m/s² (soporte vibra), resolución 0.1 m/s², pico de
   1.8 g al arrancar. Siguiente paso propuesto: más corridas con boleta y función "calibrar con boleta"
   (ajustar retraso GPS + rollout por teléfono usando varias corridas).

9. **Calculadora "Rooster Racing"** (beta 0.5, pestaña **Calcular**): la hoja de Excel de Daniel
   (`archivo/originales/ROOSTER_RACING.xlsx`) para **aproximar** tiempos con peso y caballos (no para
   comprobar boletas). Fórmulas de Hale: ET 1/4 = 5.825·(lb/whp)^⅓, MPH = 234·(whp/lb)^⅓;
   whp = hp·0.86·(1 − 0.03·DA/1000) (+ shot de nitro ya en la llanta); turbo: (hp + hp·boost/presión)·…;
   1/8 = 1/4 ÷ 1.565 (tiempo) y ÷ 1.27 (velocidad); 60 ft = 0.145·ET; DA de la hoja =
   ((T − (15 − 0.002·alt))·120 + alt)·1.075. Condiciones del aire: "En la pista (teléfono)" =
   ubicación (redondeada ~1 km) + clima de Open-Meteo (presión, temperatura, humedad → DA real, sin
   el ×1.075; sin internet: altitud del GPS + temperatura escrita) o "Altura que yo elija" (pistas de
   la hoja: El Charco 5600, Villa 5100, Chihuahua 4900, Caldera 4100, Monterrey 1440 ft; u otra altura;
   o la DA escrita). Correcciones contra el Excel (Daniel debe confirmarlas): 0-60 siempre en mph (la
   hoja mezclaba km/h con el factor de mph), turbo con presión de la tabla a la DA (la hoja: 11.34 fijo),
   sin caballos desde el 60 ft (la hoja usaba 0.141 al revés), el inverso resta nitro/boost.
   `Rooster.hoja()` reproduce la hoja celda por celda (probado contra LibreOffice).
   Valores de inicio (0.5.2, guiño personal de Daniel): **1320 lb y 308 hp** (la hoja traía 3100/420;
   quien tenía guardados exactamente 3100/420 pasa a los nuevos). Condiciones de inicio: Villa 5100 ft, 20 °C.

10. **Nombre: Drag Tree** (0.5.1). Solo cambió lo que se ve (título, logo, boleta, manifest, Ajustes).
    A propósito NO cambiaron: la URL/repo `dragtrim` (cambiarla perdería la app instalada y su
    historial), las claves de almacenamiento `dragtrim.*`, la base IndexedDB 'dragtrim' ni los nombres
    de los zips exportados. En iPhone el nombre bajo el ícono queda como se instaló ("Drag Trim"):
    **no pedirle reinstalar** para cambiarlo (borraría el historial).
    Daniel decidió (13 oct) dejar así los íconos de sus dos dispositivos ("Drag Trim"); no proponer
    respaldar/reinstalar para cambiarlo. Instalaciones nuevas ya salen como "Drag Tree".

11. **Instalar en teléfonos de amigos** (0.5.2): guía de instalación en Medir (solo en teléfono, si no está instalada;
    "Ahora no" la oculta: `dragtrim.guiaOculta`) y en Ajustes ("Instalar la app"). **Sin botón de
    compartir, a propósito**: Daniel quiere pasar el enlace él mismo para tener control. Detecta iPhone/iPad Safari (Compartir → Agregar a inicio; iPad: arriba a la derecha),
    Chrome/Edge en iOS, navegadores dentro de Instagram/Facebook/TikTok (pide "Abrir en el navegador"),
    Android Chrome (botón Instalar con beforeinstallprompt, o menú ⋮) y Samsung Internet. En iOS los
    datos de Safari y los del ícono son distintos: por eso la guía dice usar siempre el ícono.
    Se corrigió la barra de pestañas ilegible con el teléfono en modo claro y tema Automático (venía de 0.4).

12. **Práctica con fondo que responde** (0.5.3, publicada 23 oct 2026): **en cuanto ese carril sale** (con su tiempo ya medido;
    nunca antes, para no dar pistas de la verde; transición 0.08 s) se encienden logos del fondo: verdes según qué tan cerca de la perfecta
    (v = (1 − rt/0.200)^1.3; rt desde la verde, .000 = .400 Pro/.500 Full), rojos con luz roja o reacción
    lenta (r = (rt − 0.250)/0.250). Se apaga al hacer stage otra vez. 1 vs 1: cada mitad con su carril.
    Qué se prende: `fuente/fondos/brillo/<fondo>-<color>.png`, generados por `hacer_mascaras.py`:
    los stickers que ya son de ese color (Combinado, Combinado rojo, Botella NOS y el rojo de Rojo) +
    logos de marcas **elegidos a mano** en la lista LOGOS (Neón, Blanco y negro y el verde de Rojo: logos
    sueltos, no todo el fondo; y en los 6 fondos **3 logos chicos + 2 grandes extra por color**, p. ej.
    la botella de NOS completa en rojo). Para cambiar marcas: editar LOGOS y correr el script.
    build.py los convierte en `fondos/<id>_brillo_{verde,rojo}.webp` (si falta el PNG, recorta solo
    por color). Fuerza máxima por fondo = min(1, 0.20/cobertura), inyectada en app.js como BRILLO;
    brillo_test revisa que cada color cubra 4–22 % de la pantalla y que brille 0.12 s después de soltar. Sin fondo: resplandor
    detrás del árbol. Las luces del árbol siguen sin transición; pt_test da los mismos tiempos.

```
index.html, sw.js, manifest.webmanifest, icon-*.png   ← lo publicado (generado, no editar a mano)
fuente/app/src/dragcore.js     algoritmo (procesar, DetectorVivo, simulador)
fuente/app/src/app.js          interfaz: sensores, sesión, resultados, historial (IndexedDB), ajustes, exportar zip
fuente/app/src/practica.js     simulador de semáforo
fuente/app/src/rooster.js      fórmulas de la calculadora (hoja exacta + versión de la app)
fuente/app/src/calculadora.js  pestaña Calcular
fuente/app/src/index.template.html, style.css
fuente/app/tools/build.py      junta todo en un index.html autocontenido + sw.js + íconos (sube VERSION al cambiar)
fuente/publicar.sh             build + copia a la raíz
fuente/matlab/                 script MATLAB Mobile v2.3 (mismo algoritmo); Drag_tree_v2_unico.m = todo en un archivo
fuente/pruebas/                pruebas (ver abajo)
fuente/fondos/                 fondos originales (PNG); se publican como fondos/*.webp
fuente/fondos/brillo/          logos que se prenden en Práctica para fondos de un solo color (hacer_mascaras.py + PNG)
archivo/                       respaldo: originales/ (archivos de Daniel sin tocar, p. ej. ROOSTER_RACING.xlsx)
                               y versiones/ (index.html de cada versión publicada); ideas/ (diseños guardados); ver archivo/LEEME.md
.claude/settings.json          "enableWorkflows": true (Daniel lo pidió el 24 oct para usar `/effort ultracode`;
                               en su plan vienen apagados). No afecta la app.
.claude/skills/                skills del proyecto (24 oct, Daniel las pidió): arrancones (cómo se corre y
                               se mide en pista), dragtree-medicion (algoritmo y cómo cambiarlo),
                               dragtree-datos-reales (zips + boleta: analizar.js, calibrar.js),
                               dragtree-publicar (probar_todo.sh y pasos para publicar)
```

Versionado: `APP_VERSION` en `app.js` (se ve en Ajustes) y `VERSION` en `build.py` (nombre de la
caché del service worker; cambiarlo fuerza la actualización). Versión actual: **beta 0.5.3** (fondo de Práctica que responde a la reacción; 0.5.2: guía para instalar; 0.5.1: nombre nuevo: **Drag Tree**, desde el 13 oct 2026; antes 0.5: calculadora Rooster Racing; antes 0.4: fondos sticker; 0.3.2: animaciones),
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
node calc.js             # calculadora: hoja exacta vs LibreOffice (datos/rooster_vectores.json) + app
python3 calc_test.py     # pestaña Calcular en Chromium (GPS y clima falsos, sin internet)
python3 brillo_test.py   # Práctica: brillo verde/rojo por fondo y que no cambie durante el árbol
python3 instalar_test.py # guía de instalación por teléfono/navegador, iPad vertical/horizontal, contraste de pestañas
python3 mcheck.py ../matlab/*.m   # revisión estructural de MATLAB (aquí no hay MATLAB/Octave)
```
Las pruebas de navegador usan Playwright (Python) con el Chromium preinstalado y dejan
capturas en `fuente/pruebas/capturas/` (ignorado por git): revísalas antes de publicar.

Publicar: `bash fuente/publicar.sh`, commit, `git push origin main` y `git push origin main:gh-pages`.
Agregar la copia de la versión a `archivo/versiones/` (ver archivo/LEEME.md).
Confirmar con WebFetch que la página cambió (el CDN tarda 1–3 min). Si github.io no es accesible desde
el contenedor, confirmar que el flujo "pages build and deployment" del commit terminó en éxito.

Reglas al cambiar el algoritmo: mantener `dragcore.js` y `drag_procesar.m` equivalentes,
correr `mc.js`/`inicio.js`/`spike.js` antes y después, y regenerar `Drag_tree_v2_unico.m`
(concatenación de `Drag_tree_v2.m` + `drag_config.m` + `drag_procesar.m` + `drag_reporte.m`).
