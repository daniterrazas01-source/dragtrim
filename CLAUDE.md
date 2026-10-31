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
   Con **"Tocar"** (0.6.6, Daniel): como alinearse en pista, 1.er toque pre-stage, 2.º stage (ahí baja el árbol solo) y
   3.º la salida; después de una salida, un toque solo vuelve a pre-stage. "Soltar" no cambió.
   Reacción en **dos formatos** (0.3.1): **boleta** (desde el último ámbar, perfecta .400 Pro /
   .500 Full, como el ticket de pista) y **desde la verde** (perfecta .000).
6. Pendiente / ideas acordadas:
   - **Validar con datos reales**: Daniel probará en autódromo y mandará los zips exportados +
     tiempos de la boleta oficial (60 ft, 1/8 o 1/4, velocidad). Ajustar rollout/algoritmo con eso.
   - Sección **"Medir con el semáforo real"** (Daniel lo pidió el 24 oct): publicada en beta 0.6 (25 oct) y
     en 0.6.1 quedó como tarjeta "en desarrollo" y **desde 0.6.2 está fuera de la app** (Daniel: "presentó uno que
     otro fallo"; se sigue trabajando más adelante, la idea y el código se quedan; no enfocarse en eso hasta que lo
     retome; 27 oct, Daniel: "descártalo por ahora": no revisarlo ni correr sus pruebas, o sea probar con
     `probar_todo.sh algoritmo calc ui practica instalar matlab carrera`, sin el grupo `semaforo`). No se ve en Medir, Ajustes, resultados ni Historial (las corridas grabadas con la 0.6 guardan sus datos
     de cámara, no se muestran), la cámara no se prende y `prueba/camara.html` ya no se publica (líneas comentadas
     en publicar.sh). Con `index.html?camdev` (o localStorage `dragtrim.camDev = true`) vuelve todo;
     cómo funciona y qué falta en el punto 13. Especificación en `archivo/ideas/semaforo_real/plan.md`
     (+ informes; prototipos en `fuente/pruebas/arbol_proto/`). El plan acordado por el límite de uso
     (detección y cálculos con ultracode; página de prueba, cámara e integración sin agentes; revisión final
     antes de publicar) ya se cumplió hasta la revisión final (25 oct, esfuerzo max sin agentes, como pidió
     Daniel) y se publicó en la 0.6.
   - **Race 1 vs 1** (idea de Daniel, 24 oct; "en desarrollo" en Medir desde 0.5.4, desplegable desde 0.6.5, botón chico desde 0.6.8;
     **publicado en la 0.7, 31 oct, ver punto 14**): dos autos, cada uno con la app en su teléfono, en pista sin semáforo o lugar
     controlado; la app da la salida a los dos a la vez (excepción a propósito al punto 3, solo en este modo),
     mide reacción y tiempos de ambos y el ticket de los dos sale en un teléfono. Diseño ya estudiado en
     `archivo/ideas/race_1vs1.md` (no repetir el análisis): (31 oct: ahora la conexión principal es una sala por internet con código, punto 14) hotspot de un teléfono + WebRTC emparejado con
     QR (sin internet ni servidores ajenos), sincronía tipo NTP con pings, stage = quieto (acelerómetro + GPS
     <1 km/h), árbol de practica.js tras espera al azar, RT = tRo − verde (calibrar el retraso de pantalla y
     sensor de cada teléfono: 20–60 ms por modelo), roja si cruza el rollout antes de la verde, "empate
     técnico" si la diferencia es menor al error. Primer paso: página de prueba aparte en sus teléfonos.
   - **Lo que sigue** (Daniel, 26 oct, al cerrar la 0.6.5: "ya terminamos" el diseño): **Race 1 vs 1** (en marcha, punto 14) y **correr solo pero
     con semáforo** (la app da la salida a un solo auto con el árbol, como el 1 vs 1 pero de uno; misma excepción al
     punto 3, solo en ese modo). No empezar hasta que Daniel lo pida; el diseño del 1 vs 1 está en `archivo/ideas/race_1vs1.md`.
   - Más adelante: app nativa (Capacitor) para Play Store/App Store; GNSS externo.
   - **Logo nuevo** (26 oct, en la app desde **0.6.3**): el C13 de `archivo/logo_pendiente/v5/` (historia de cada cambio
     en su LEEME). DRAG en letra de bloque dibujada a mano (forma de "Full Pack 2025") inclinada hacia atrás y creciendo de
     la G a la D; TREE = el árbol como T (una barra con 4 foquitos de stage, 3 ámbar, verde, rojo; girado 42° sobre su
     poste, paralelo a la R) + R, E, E cuadradas a lo alto (forma de "Platinum Sign Over"); TREE negro con contorno
     blanco; todo inclinado 8° hacia arriba; abajo "On the mark" en cursiva (Mr Dafoe, OFL; la calcomanía decía "On your
     mark"). Esas dos letras de dafont son solo de uso personal: **no usar sus archivos**, las letras están dibujadas en
     `hacer_logo.py`. Para cambiar el logo: editar `hacer_logo.py` y correrlo (regenera `fuente/app/src/logo.svg` y
     `fuente/app/src/icono/*.png`), luego build. En la app: barra de arriba (80 px de alto; desde 0.6.4 con "On the mark" abajo, un poco más grande, y sin la etiqueta
     "beta": Daniel la quitó y la versión ya no dice "beta"), colores por tema
     (`--logo-drag/-tree/-borde`, `.lg-*`), las luces se prenden al abrir (`.lz-0…5`); ícono = el logo en fondo #24282c
     (build.py lo toma de `src/icono/`). En iPhone el ícono ya instalado no cambia (iOS lo guarda al instalar; no pedir
     reinstalar); las instalaciones nuevas sí lo traen.

7. **Fondos de pantalla** (beta 0.4): 6 fondos sticker bomb que Daniel hizo (+ "Gallos" desde 0.6.2) (`fuente/fondos/*.png`,
   el build los convierte a WebP en `fondos/`). Con fondo, la app usa estilo sticker: paneles con
   borde blanco, títulos como etiqueta chueca, color principal según el fondo (neón / rojo / blanco).
   Ajustes: elegir fondo o "Sin fondo" y qué tanto se ve (velo). Por defecto: Combinado, nivel medio.
   En una corrida el velo sube a 0.92. Las luces del semáforo de Práctica no cambian.
   Ojo: los stickers tienen marcas reales (NOS, Holley, JEGS…); para tiendas de apps habría que cambiarlas.
   **Fondo "Gallos"** (0.6.2, 25 oct; 7.º fondo, color principal rojo): el Blanco y negro original (que no cambia) + los
   logos de Rooster Racing, el equipo de Daniel: **tres R rojas con flamas** (del logo 1, sin el texto; sticker con
   borde blanco y orilla negra: izquierda arriba, izquierda a media pantalla, derecha a media pantalla) y el **logo RRG**
   completo (sticker negro con borde blanco) arriba a la derecha, todos a los lados del árbol de Práctica. Los pega
   `fuente/fondos/logos_rooster.py` (para moverlos: LUGAR) sobre `archivo/originales/fondo_marcas_blanco_negro_sin_rooster.png`
   y deja su forma y su huella en `brillo/rooster-gallos*.png`; `hacer_mascaras.py` (PROPIOS, LOGOS['gallos'] = los del
   Blanco y negro) prende esos logos en verde y en rojo y salta solos los que quedaron tapados (JEGS, STRANGE, cápsula
   NOS). Brillo: verde 12.1 %, rojo 15.3 %.
   **Letra tipo Rooster Racing** (25 oct, con todos los fondos y sin fondo): **Saira Black Italic** (OFL, la más parecida
   a la letra del logo; `fuente/app/src/fuentes/`; build.py la mete en index.html como data URI) en lo que Daniel marcó:
   títulos de cada pantalla (`h2`), etiquetas (`.lab`: Modo, Árbol, Peso…), todos los selectores (`.seg button`), botones
   principales (`.primary`) y pestañas, en todas las pantallas. Las letras chiquitas (ayudas, descripciones, datos,
   tarjetas) no. `font-synthesis: none` para que no se incline doble. Si manda el archivo de la letra original, cambiarla.
   **Franja del notch / isla del iPhone** (0.6.2, 25 oct): es pantalla activa, como pidió Daniel: el fondo (fijo) se ve
   detrás de la hora y la batería y lo que se desliza hacia arriba pasa visible por ahí (se probó una franja `.notch` que lo
   tapaba y Daniel pidió quitarla). El contenido empieza bajo la hora (`padding-top: env(safe-area-inset-top)`). Ahí no
   caben GPS/Acel/Pantalla: iOS pone la hora y la batería a los lados de la isla. **No cambiar
   `apple-mobile-web-app-status-bar-style`** (black-translucent desde 0.2): iOS lo lee al instalar y cambiarlo exigiría
   reinstalar. Desde iOS 26.1 el sistema pone un degradado oscuro sobre la hora (no se puede quitar). La vista previa
   "Drag Trim en iPhone" lo simula (iframe a pantalla completa 393×852 con las zonas seguras puestas a 59/34 px).
   **Franja de la hora y la cámara en Android** (0.6.7, 27 oct, Daniel: "optimízalo para el notch de Samsung", trae un
   S22 Ultra y un S25): en Android la app instalada **no se puede dibujar detrás de la hora** (Chrome todavía no lo deja en
   apps instaladas; lo están arreglando; abajo, en la barra de gestos, sí llega desde Android 15). Esa franja, donde va el
   hoyito de la cámara, la pinta el sistema del color de `<meta name="theme-color">`: `pintarBarra()` en app.js le pone el
   color que queda arriba (lo de arriba del fondo con su velo, `ARRIBA` que calcula build.py con las filas 0.5–4 % de cada
   fondo; sin fondo, el color de la app; corrida = velo 0.92; Práctica, cámara y carga encima) y cambia sola
   (MutationObserver + cambio de modo oscuro del teléfono). Manifiesto: background_color y theme_color #141618 (la carga).
   Cuando Chrome lo arregle, el CSS de iPhone (`env(safe-area-inset-*)`) ya lo deja como en iPhone (barra_test.py H lo
   simula). En iPhone no cambia nada. Vistas previas (28 oct, Daniel se queda con dos): "Drag Tree en iPhone" y
   "Drag Tree en S24 Ultra" (384×832, tres modos: hoy, pantalla completa, como iPhone). Daniel pidió lo mismo que en iPhone (fondo detrás y pantalla activa):
   hoy solo se acerca **pantalla completa** (`display: fullscreen` o la API de pantalla completa + viewport-fit=cover: el
   fondo llega a la cámara y se toca, pero Android esconde la hora y la batería; sin probar en teléfono) o la **app nativa**
   (APK con Capacitor: ahí sí como iPhone). Pendiente que Daniel elija; no hacerlo sin que lo pida.
   **Atajos de Medir** (0.6.8, 30 oct, Daniel: "que los botones sean más chicos… para que se vea más el fondo", luego
   "ponlos de manera vertical" y al final "más cuadrados, que parezcan como semáforos en vertical"): "Corrida simulada"
   (`#btnDemo`), "Race 1 vs 1" y "Antes de la pista" son tres botones cuadrados de 72 px (ícono arriba, nombre abajo), uno
   encima de otro a la izquierda, dentro de una caja oscura como el árbol de Práctica (`.atajos-arbol`, 88 px de ancho;
   con fondo, borde blanco de sticker). A la derecha queda libre y se ve el fondo. Antes de salir a la pista (`#antesPista`, con
   `#howtoCam` adentro) ya no es `<details>`: su botón (`aria-expanded`/`aria-controls`) se prende con el color del fondo
   (sin fondo, ámbar) y abre su explicación a la derecha del semáforo (código junto a `#btnDemo` en app.js). Race 1 vs 1
   (`#atRace`) abre desde la 0.7 su pantalla completa (punto 14). Antes se probaron una fila horizontal y botones largos delgados.
   **Teléfono acostado** (0.7.2, 31 oct, Daniel: "en el soporte para celulares la mayor parte de las veces lo ponemos de forma
   horizontal"; pidió Medir y Race 1 vs 1, y lo demás "como tú la veas"): manifiesto `orientation: any` (en Android la app
   instalada lo toma cuando Chrome la actualiza, puede tardar ~1 día; en iPhone gira ya, sin el candado de rotación). Solo
   con `(orientation: landscape) and (max-height: 500px)` (teléfonos de lado; vertical y tablets no cambian), al final de
   style.css: logo, indicadores y pestañas en un **riel a la izquierda** (`--riel`; .top fijo arriba del riel, .tabs de
   arriba abajo con su indicador vertical); Medir en dos lados (el semáforo de atajos a la izquierda; distancia, los 4
   sensores en fila y el botón a la derecha; "Antes de la pista" ocupa ese lado mientras está abierto); midiendo: texto a la
   izquierda, velocidad y botones a la derecha; resultado: la boleta flota a la izquierda; Race 1 vs 1: cada pantalla en dos
   lados con `.rc-lado` (en vertical `display: contents`, no cambia nada), árbol más grande, boleta de los dos carriles a la
   izquierda y quién ganó + botones a la derecha; Práctica: zonas para los pulgares a los lados del árbol (solo: a la
   derecha); carga más chica. Respeta las zonas seguras (isla del iPhone a un lado). `horizontal_test.py` (iPhone 852×393
   con zonas 59/59/21, S24 Ultra 915×412, chico 667×375).
   **Deslizar entre pestañas** (0.6.2, 25 oct, Daniel lo pidió "como nativa de iPhone"): con el dedo a la izquierda/derecha
   se pasa a la pestaña de al lado. Al tomar el dedo de lado, las pestañas de los lados ya se pintan (`prepararVista`,
   `data-entra` = sin la cascada de entrada) a ±ancho y se mueven pegadas a la actual; cada una se pone a la altura donde
   quedará al pasar (si la actual está bajada, la nueva empieza arriba, bajo la hora; `sN`), así al soltar no hay brinco.
   Pasa con más de 1/3 del ancho o rápido (> 0.3 px/ms y > 24 px, sin regresar el dedo); si el dedo se detuvo > 80 ms
   antes de soltar, no cuenta la velocidad. Termina con la curva de iOS cubic-bezier(.25, 1, .5, 1) en 240–420 ms según
   la velocidad del dedo; la pestaña de abajo se marca al soltar. En la primera y la última, orilla elástica. Mientras
   termina (`ocupado`) no se toman toques, deslizadas ni clics. No se usa sin pestañas (corrida, resultado de corrida,
   semáforo de Práctica, cámara), desde la orilla (24 px: gesto de "atrás" de iPhone y Android), en un campo con el
   cursor, en un deslizador ni en algo que se recorre de lado (tablas de Calcular). Bloquea el clic del dedo 400 ms
   después de soltar. Sin animaciones: cambia al soltar, sin seguir al dedo. Código al final de la navegación en app.js.
   **Pantalla de carga** (0.6.4, 26 oct, Daniel): al abrir la app, 2 s en fondo #141618 con el logo mediano (con "On the
   mark"; las luces se prenden en orden) y abajo "By" a la izquierda del logo de Rooster Racing (desde 0.6.5; `fuente/app/src/carga/`, copia de
   `archivo/originales/logo_rooster_racing.png`; build.py lo recorta y lo mete como WebP). Se desvanece 0.3 s al final
   (sin animaciones solo se quita). `#carga` en index.template.html, `.carga` en style.css, el reloj al inicio de app.js.
   **En las pruebas automáticas no sale** (`navigator.webdriver`) salvo con `?carga` (carga_test.py), así las demás pruebas
   no esperan los 2 s.

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

13. **Medir con el semáforo real** (beta 0.6, publicada el 25 oct; fuera de la app desde 0.6.2 tras `CAM_DEV`, ver punto 6): el teléfono va fijo en el carro y la cámara
    trasera ve el árbol (como un "tree reader", pero solo mide). En Medir: interruptor "Medir con el semáforo real"
    (beta), árbol **Pro .400 / Full .500** (Daniel quitó "Automático" el 25 oct: en los autódromos solo hay esos dos;
    quien tenía "auto" toma el de Práctica), "Apuntar la cámara" (tocar los focos de tu carril; revisa luz, foco y
    temblor; se ve bien en horizontal) y "Armar" carril izquierdo o derecho. **Sigue neutral (punto 3):** armada, la cámara graba
    sin verse (video de 2×2 px, opacidad .01; nunca `display:none`, iOS deja de dar cuadros), no se analiza nada, no
    hay luces ni vibración; se apaga sola al detectar el arranque (o a los 30 min). Al terminar: "Leyendo el
    semáforo…" → reacción en boleta y desde la verde (el formato de Práctica manda cuál va primero), qué tan segura
    es, roja, tira de cuadros, avisos, "Cambiar carril", recalcular y "Tu boleta oficial (para calibrar)".
    - Archivos: `semaforo_vision.js` (cuadros → brillo de cada foco: estabiliza la imagen, ubica focos, ajusta
      flancos con modelo de LED/incandescente/exposición/PWM), `semaforo.js` (Anillo de cuadros YUV, reloj de
      cámara, flancos, Pro/Full, secuencia, K1, reacción, calibración, CSV), `semaforo_sim.js` (árbol y cámara
      simulados: pruebas y demo), `camara.js` + `camara.css` (DragCam: permiso, Lector con
      requestVideoFrameCallback, pantalla Apuntar). build.py los mete en index.html con los marcadores
      /\*SEMVISION\*/ /\*SEMAFORO\*/ /\*SEMSIM\*/ /\*CAMARA\*/.
    - Cálculo: la salida es el apagado del foco de stage (haz a 1 ft); RT boleta = salida − último ámbar (se mide
      directo, el intervalo real puede ser .370/.350); RT verde = salida − verde vista (o ámbar + intervalo
      nominal si no se vio o si cae a más de 70 ms + 1.5 cuadros del nominal: aviso "verde_dudosa"). Roja = roja vista en tu
      columna o RT verde < 0. Si no se ve el stage: salida = tRo − δ (acelerómetro). δ = reloj de sensores −
      reloj de cámara: K1 lo mide en cada corrida con el cabeceo del arranque (cámara contra giroscopio); si
      no, el guardado por carril. La búsqueda se centra en el cruce de 1 ft de procesar() (`tHaz`), no en el
      rollout configurado. El árbol se ubica en la imagen sea Pro o Full; el tipo elegido decide qué secuencia se lee
      y, si con él no hay ninguna, se lee el otro con el aviso "otro_arbol" (un Pro necesita los ámbares juntos y un
      Full escalonados, así que uno no se lee como el otro). K2: sesgo del acelerómetro aprendido de corridas con el stage visto (≥3, MAD < 30 ms).
      K3: corrección con boletas oficiales (≥3) en Ajustes con botón "Usar". También mide el rollout real.
      Con PWM, el ajuste fino usa el rasgo por filas p solo si separa prendido de apagado (contraste ≥ 6; si no, la
      energía e) y su ancla es el primer cuadro prendido en los dos rasgos (un reflejo o el sol la movían ~190 ms).
      En simulación, a 60 fps con PWM la energía sola dio mejor ámbar (σ 3–6 contra 6–10 ms) pero a 30 fps peor:
      revisarlo con video real.
    - Datos: IndexedDB 'dragtrim' **v2** con el store 'camdatos' (lo pesado, últimas 30 corridas); en 'runs' solo
      el resumen `run.cam` (~2 KB). El zip agrega `drag_raw_gyro`, `drag_raw_cam` (CSV de rasgos),
      `drag_raw_cam_meta`, `drag_cam_clip` (.bin) y `drag_cam_tira` (.jpg); el meta y el DRAGPACK traen la reacción.
    - Página de prueba aparte: `prueba/camara.html` (de `prueba_camara.template.html` con `build_prueba.py`;
      publicar.sh la arma y la copia): cámara y sensores, "mueve el soporte" ×3 (K1), permiso, segundo plano,
      prueba larga (`?larga=N`) y resultados en JSON para compartir o descargar (archivo de diagnóstico).
    - Resultados en simulación (aún **sin video real**): a 60 fps de día/sombra/noche/incandescente, ámbar y
      verde con σ ~2–5 ms; RT solo cámara 1.8 ± 5.6 ms; acelerómetro + K1 10 ± 12.5 ms (casi todo es el error
      del cruce de 1 ft de procesar(), que en 200 sesiones da +3.5 ± 12.4 ms; la parte del semáforo 0.9 ± 6.9);
      fusión con K2 de 5 corridas 3.0 ± 6.0; rojas 24/24, rojas falsas 0, carril equivocado 0/24.
      Límites conocidos: PWM (sobre todo 1000 Hz y a 30 fps: stage σ ~15–37 ms), 30 fps en general (RT σ ~8–26),
      sol de frente (a 60 fps lee 83–100 %; a 30 fps 67–92 %). Los criterios del plan que aún no se cumplen (73 al
      25 oct, casi todos de PWM, 30 fps y sol) están en `resultados_mc.txt`, la salida aceptada;
      `semaforo_mc.js --base` compara contra ella (si un cambio la mejora a propósito, se guarda la nueva).
    - Falta de Daniel: abrir `prueba/camara.html` en su iPhone (Safari y la app instalada) y mandar el JSON;
      videos en cámara lenta (240 fps) del árbol desde el carro + foto de la boleta; luego ≥5 corridas con la
      cámara y boleta para calibrar (K3).
    - Reglamento: los lectores del árbol ("tree readers") están prohibidos en eventos sancionados; la app no da
      la salida ni avisa nada en vivo, solo mide después. En un evento sancionado, avisar al director técnico.
    - Pendiente al retomarlo: en el contenedor nuevo (25 oct) camara_test.py falló a ratos en A/D (la cámara falsa
      de lienzo pierde cuadros: RT ±50 ms, 1 vista distinta en la neutralidad); el resto y la parte I (sin ?camdev) bien.
    - Selectores (`.seg`) de toda la app: la marca que se desliza va a la posición y al ancho del botón elegido
      (`marcaSeg` en app.js pone `--seg-x`/`--seg-w`). Antes suponía botones iguales y con textos largos
      ("Atmosférico", "Automático" a 320 px) quedaba corrida; camara_test.py (H) lo revisa en todas las pestañas.


14. **Race 1 vs 1** (0.7, 31 oct, Daniel: "programa esta sección, incluyendo la sala, la forma de vincular ambos teléfonos, de
    la forma más sencilla que se pueda y visual"; él alinea los autos en la realidad, luego le dicen a la app "ya estamos
    alineados" y la app pone pre-stage, stage y baja el árbol; al entrar se elige Full o Pro .400). Especificación de las
    piezas: `archivo/ideas/race_1vs1_programa.md`; diseño de fondo: `race_1vs1.md`. Es la excepción al punto 3: solo aquí
    la app da la salida.
    - Entrada: el cuadro "Race 1 vs 1" del semáforo de Medir abre la pantalla completa `#rc` (carrera.js): **Crear sala /
      Unirme con código** (lo principal), Probar con rival simulado y, plegado, "¿Sin señal en la pista? Conectar con QR"
      (Crear carrera con QR / Unirme con QR: un teléfono prende su punto de acceso, sin internet).
    - **Sala por internet** (31 oct, Daniel: "sin necesidad de un hotspot", idea de la plática "Race 1 vs 1 feature ideas",
      `archivo/ideas/race_1vs1_notas.md`; él eligió la opción B: sala en una cuenta suya): cada teléfono con sus datos; uno
      crea la sala y ve un código de 5 (sin I, O, 0, 1), el otro lo teclea y entra solo al completar las 5. `DragSala`
      (sala.js) se porta igual que el enlace WebRTC (estado, mensaje, reloj, enviar, aLocal/aOtro) y carrera.js usa
      cualquiera; estados extra: 'esperando' (dentro, falta el otro) y 'desconectado' (reintenta solo; un ping por segundo
      vigila la conexión: 4 s sin respuesta = muerta). Reloj: los dos contra la hora de la sala (Date.now del servidor);
      el programa del árbol va en hora de la sala (`aRef`/`deRef` en carrera.js) con 2.5 s de anticipación. La boleta no
      depende de la sincronía (cada carril contra su verde); la sincronía solo dice qué tan juntas se prenden las verdes.
      Servidor: `fuente/sala/` (Cloudflare Worker + Durable Object con SQLite, plan gratis; `nucleo.js` = la lógica;
      guarda el último hola/config/estado/resultado de cada teléfono para quien se reconecte; se borra al día sin uso;
      solo acepta la app publicada y localhost). **Publicada el 31 oct** en la cuenta de Cloudflare de Daniel (la creó con
      Claude en Chrome siguiendo `fuente/sala/PARA_EL_AGENTE.md`): `https://dragtree-sala.dani-terrazas01.workers.dev`
      (`SALA_PUBLICADA` en carrera.js). Secretos CLOUDFLARE_API_TOKEN y CLOUDFLARE_ACCOUNT_ID en GitHub;
      `.github/workflows/sala.yml` la vuelve a publicar con wrangler al cambiar `fuente/sala/` (en main o en la rama de
      trabajo) y luego corre `fuente/pruebas/sala_real_test.mjs` contra ella (desde el contenedor de Claude no se llega a
      workers.dev: revisar el resultado en el registro de Actions). Sin internet, "Crear sala" vuelve al inicio con lo del
      QR abierto. Pruebas: `?sala=ws://localhost:PUERTO` con `fuente/pruebas/sala_local.mjs` (misma lógica; `/cortar` y
      `/callar` simulan perder la señal); `?sala=` = como si no hubiera sala.
    - Emparejar con dos QR (`DragQR`, qr.js + vendor/jsQR.js y vendor/qrcode.js, licencias en vendor/LICENCIAS.md): el que
      crea muestra su código (oferta WebRTC, "DT1o…"); el otro lo escanea y muestra el suyo ("DT1a…"); el primero lo escanea
      ("Ya lo escaneó: leer su código"). Respaldo: copiar y pegar el código en texto. Antes de armar cada código se pide la
      cámara: con ese permiso Chrome y Safari ponen la IP real (sin él, Chrome usa .local y Safari puede no dar candidatos).
    - Enlace (`DragEnlace`, enlace.js): WebRTC sin servidores (iceServers vacío), canal 'ctl' (mensajes) y 'reloj' (pings
      tipo NTP en los dos sentidos; offset = reloj del otro − propio, con recta para la deriva).
    - Sala: los dos carriles (quien crea = izquierdo, puede cambiar), sensores y "Listo"; el que crea elige árbol Pro/Full y
      distancia 1/8 o 1/4 (el otro lo ve). "Listo: ya estamos alineados" arma la medición de siempre en ese teléfono
      (`DragApp.armarCarrera`, con la distancia de la carrera). Con los dos listos y el reloj sincronizado, el que crea
      manda el programa con 1.5 s de anticipación por Wi-Fi o 2.5 s por la sala (`DragCarreraNucleo.programa`: pre-stage, stage +1 s, árbol +1–2.5 s al
      azar, verde según Pro/Full); el otro lo pasa a su reloj y confirma; si no confirma a tiempo se cancela en los dos.
      Cada salida gasta los dos "Listo" y el estado lleva la ronda (un "Listo" viejo que llega tarde no cuenta).
    - Árbol en los dos carriles (mismas luces de Práctica); la verde y el último ámbar se toman del cuadro de rAF en que se
      pintaron; 1.2 s después de la verde el árbol se quita y queda la pantalla neutral de la medición. RT = cruce del
      rollout (R.tRo de procesar) − verde; roja si es negativa; boleta = RT + .400/.500. Sin arranque a los 25 s: "No salió".
      "Cancelar" antes de la verde cancela la salida de los dos; ya corriendo, solo ese carril queda sin terminar.
    - Boleta de los dos carriles (`htmlBoleta`): R/T, 60', 330', 1/8, 1000', 1/4 y velocidades, WIN, texto del ganador con
      las reglas de Práctica (roja pierde; dos rojas pierde quien salió primero; si no, menor RT + ET) y "muy cerrada" si la
      diferencia es menor a 0.10 s. Se guarda en `run.race` (programa, verde, sincronía, los dos resultados); el Historial
      dice "Race 1 vs 1, ganaste/perdiste"; el zip trae `drag_race_meta_*.json`. "Otra carrera" vuelve a la sala con
      marcador; si se perdió la conexión, "Volver a emparejar" (por QR) o se reconecta sola (por la sala) y los resultados
      se reenvían solos.
    - Rival simulado: otro teléfono de mentira que contesta como el real (su resultado sale de una sesión simulada); si no
      hay sensores, el auto propio también es simulado. Pruebas: `?simsens` hace simulado el auto propio con rival real.
    - **Confirmado por Daniel (31 oct):** los dos teléfonos tocan "Listo"; espera al azar de 1 a 2.5 s entre stage y el
      árbol (`tArbol = tStage + 1000 + 1500·azar`); "muy cerrada" si la diferencia es menor a 0.100 s (`margenDudoso`).
    - Falta: probarlo con dos teléfonos reales (por la sala con datos, y
      por QR con hotspot de iPhone o Android, iPhone con Android); calibrar el retraso de pantalla de cada modelo (hoy 0 ms,
      `ajusteMs`).
    - Publicado en la **0.7** (31 oct, Daniel: "publícala para probarla, jugar con ella para ver si le sale algún fallo").
      Al publicar, qr_camara_test.py falló solo en el caso extremo "QR lejos y de lado" (lo lee, pero a veces en más de 5 s;
      en la máquina de la mañana pasaba y su código no cambió): depende de la velocidad de la máquina. Si molesta en
      teléfonos reales, hacer más seguido en el ciclo de qr.js los intentos ampliados.

```
index.html, sw.js, manifest.webmanifest, icon-*.png   ← lo publicado (generado, no editar a mano)
fuente/app/src/dragcore.js     algoritmo (procesar, DetectorVivo, simulador)
fuente/app/src/app.js          interfaz: sensores, sesión, resultados, historial (IndexedDB), ajustes, exportar zip
fuente/app/src/practica.js     simulador de semáforo
fuente/app/src/rooster.js      fórmulas de la calculadora (hoja exacta + versión de la app)
fuente/app/src/calculadora.js  pestaña Calcular
fuente/app/src/semaforo_vision.js, semaforo.js, semaforo_sim.js   semáforo real: visión, análisis, simulador (punto 13)
fuente/app/src/camara.js, camara.css   cámara en el navegador (DragCam) y pantalla Apuntar
fuente/app/src/carrera.js      Race 1 vs 1: pantallas, sala, salida, boleta (punto 14); carrera_nucleo.js = sus reglas
fuente/app/src/sala.js         conexión por la sala en internet (DragSala); enlace.js = por WebRTC (DragEnlace); qr.js + vendor/
fuente/sala/                   la sala por internet (Cloudflare Worker): sala.js, nucleo.js, wrangler.toml, LEEME.md (publicarla)
fuente/app/src/prueba_camara.template.html + tools/build_prueba.py   página de prueba prueba/camara.html
fuente/app/src/index.template.html, style.css
fuente/app/src/logo.svg, icono/  logo de la barra de arriba y de la carga, e ícono (los genera archivo/logo_pendiente/v5/hacer_logo.py)
fuente/app/src/carga/          logo de Rooster Racing para la pantalla de carga
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
                               + de diseño, de otros autores (26 oct, Daniel: "moderno, retro e impecable"):
                               impeccable (pulir/revisar; sus agentes en .claude/agents/), ui-ux-pro-max
                               (catálogo de estilos retro y modernos), apple-design, mobile-native,
                               review-animations (Emil Kowalski), no-ui-slop (UXKIN, sin su servidor de paga).
                               Origen, licencias y cambios: .claude/skills/EXTERNAS.md.
                               Las decisiones de este archivo mandan sobre lo que digan esas skills (p. ej.
                               pantalla de medición neutral, no cambiar apple-mobile-web-app-status-bar-style,
                               identidad sticker/logo/Saira).
```

Versionado: `APP_VERSION` en `app.js` (se ve en Ajustes) y `VERSION` en `build.py` (nombre de la
caché del service worker; cambiarlo fuerza la actualización). En la rama, sin publicar: **0.7.2** (la app de lado, punto 7
"Teléfono acostado"). Publicada: **0.7.1** (31 oct 2026: Race 1 vs 1, "Salir de la
carrera" desde la boleta de una corrida cancelada ya corriendo (o "No salió") no hacía nada y la boleta vieja reaparecía:
`terminar()` y `volver()` en carrera.js ahora siempre regresan a Medir; carrera_test.py E); antes **0.7** (31 oct 2026: Race 1 vs 1, punto 14: sala
por internet con código de 5 letras (o QR por Wi-Fi sin señal), "Listo" de los dos, pre-stage, stage y árbol en los dos
teléfonos, boleta de los dos carriles; trae la 0.6.8: atajos de Medir como semáforo vertical, punto 7); antes **0.6.7** (28 oct 2026: en Android/Samsung la franja de la hora y la cámara toma el color de lo que hay debajo, punto 7); antes **0.6.6** (27 oct 2026: Práctica con "Tocar": pre-stage, stage y salida en tres toques); antes **0.6.5** (26 oct 2026: pantalla de carga: "By" a la izquierda del logo de Rooster Racing; en Calcular se quitó la nota "Para un auto con buena salida…" entre "Tiempo estimado" y "Peso para un tiempo meta", Daniel la pidió quitar; lo mismo sigue explicado en "Cómo calcula"; en Medir, Race 1 vs 1 es un desplegable como "Antes de salir a la pista" (`#race1v1`): cerrado solo dice el nombre y al abrirlo "en desarrollo" y la explicación, para que Medir se vea menos cargada); antes **0.6.4** (26 oct 2026: pantalla de carga de 2 s con el logo y "By Rooster Racing"; "On the mark" en la barra de arriba; sin la etiqueta "beta": la versión se llama "0.6.4" y la caché `v-0.6.4`); antes **beta 0.6.3** (26 oct 2026: el logo nuevo en la barra de arriba y en el ícono, punto 6); antes **beta 0.6.2** (25 oct 2026: el semáforo con
cámara sale de la app; fondo nuevo "Gallos" con los logos de Rooster Racing; Práctica: botón "Mantén" más chico (19vh, 300 px de ancho en solo), cuadro de la reacción compacto y más abajo, focos que caben sin tocarlo; letra tipo Rooster Racing en títulos, etiquetas, selectores, botones principales y pestañas; Práctica: Modo, Árbol, Cómo sales y Formato en un solo panel con solo la explicación de lo elegido (EXPLICA en practica.js), 892 → 648 px de alto; el contenido también junto al notch del iPhone; deslizar el dedo entre pestañas); **beta 0.6.1** (25 oct 2026: el semáforo con cámara vuelve a "en desarrollo"); 0.6 (25 oct 2026: semáforo real
con la cámara, punto 13; trae también la 0.5.4: tarjeta Race 1 vs 1 "en desarrollo"). Antes: **beta 0.5.3** (fondo de Práctica que responde a la reacción; 0.5.2: guía para instalar; 0.5.1: nombre nuevo: **Drag Tree**, desde el 13 oct 2026; antes 0.5: calculadora Rooster Racing; antes 0.4: fondos sticker; 0.3.2: animaciones),
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
python3 pt_tocar_test.py # Práctica con "Tocar": pre-stage, stage, salida (y que el árbol espere al 2.º toque)
node calc.js             # calculadora: hoja exacta vs LibreOffice (datos/rooster_vectores.json) + app
python3 calc_test.py     # pestaña Calcular en Chromium (GPS y clima falsos, sin internet)
python3 brillo_test.py   # Práctica: brillo verde/rojo por fondo y que no cambie durante el árbol
python3 instalar_test.py # guía de instalación por teléfono/navegador, iPad vertical/horizontal, contraste de pestañas
python3 deslizar_test.py # deslizar el dedo entre pestañas (toques reales por CDP): pasa, regresa, orillas, corrida, semáforo
python3 carga_test.py    # pantalla de carga: logo + "By" Rooster Racing, 2 s, se desvanece, sin "beta" (con ?carga)
python3 barra_test.py    # Android: color de la franja de la hora/cámara (theme-color) por fondo, velo, tema, corrida, Práctica, carga; pantallas de Samsung
python3 atajos_test.py   # Medir: Corrida simulada / Race 1 vs 1 / Antes de la pista como semáforo (3 cuadros a la izquierda); abren su explicación a la derecha, una a la vez
python3 horizontal_test.py  # teléfono acostado (iPhone, S24 Ultra, chico): riel, Medir, midiendo, resultado, Race 1 vs 1, Práctica, carga; vertical igual
node carrera_nucleo_test.js; node qr_test.js; node enlace_test.js; node sala_nucleo_test.mjs   # Race 1 vs 1 sin navegador
python3 carrera_test.py  # Race 1 vs 1: rival simulado, roja, dos teléfonos por WebRTC (códigos en texto) y QR con la cámara
python3 sala_test.py     # Race 1 vs 1 por la sala en internet (sala_local.mjs): crear, unirse, carrera, errores, sin señal
python3 enlace_test.py; python3 qr_camara_test.py   # enlace WebRTC entre dos páginas; leer QR con cámara falsa
python3 mcheck.py ../matlab/*.m   # revisión estructural de MATLAB (aquí no hay MATLAB/Octave)
node semaforo_sim_test.js   # simulador del árbol y la cámara
node reaccion.js            # semáforo punta a punta: sesión simulada + árbol + análisis (~75 s)
node semaforo_mc.js rapido --base ../../archivo/ideas/semaforo_real/resultados_mc.txt   # lectura en todas las
                            # condiciones (~7 min); sin --base revisa los criterios del plan (varios aún no se cumplen)
python3 camara_lector_test.py  # cámara en Chromium con video falso (.y4m): Lector y Apuntar
python3 camara_test.py      # semáforo en la app: neutralidad, demo, permiso negado, historial, zip, migración v1→v2
python3 prueba_camara_test.py  # página de prueba prueba/camara.html (antes: python3 ../app/tools/build_prueba.py)
```
Todas juntas: `bash .claude/skills/dragtree-publicar/scripts/probar_todo.sh` (o por grupos; ver la skill).
Las pruebas de navegador usan Playwright (Python) con el Chromium preinstalado y dejan
capturas en `fuente/pruebas/capturas/` (ignorado por git): revísalas antes de publicar.

Publicar: `bash fuente/publicar.sh`, commit, `git push origin main` y `git push origin main:gh-pages`.
Agregar la copia de la versión a `archivo/versiones/` (ver archivo/LEEME.md).
Confirmar con WebFetch que la página cambió (el CDN tarda 1–3 min). Si github.io no es accesible desde
el contenedor, confirmar que el flujo "pages build and deployment" del commit terminó en éxito.

Reglas al cambiar el algoritmo: mantener `dragcore.js` y `drag_procesar.m` equivalentes,
correr `mc.js`/`inicio.js`/`spike.js` antes y después, y regenerar `Drag_tree_v2_unico.m`
(concatenación de `Drag_tree_v2.m` + `drag_config.m` + `drag_procesar.m` + `drag_reporte.m`).
