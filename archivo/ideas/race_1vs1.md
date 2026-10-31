# Race 1 vs 1 — diseño (idea guardada, beta, sin programar)

Idea de Daniel (24 oct 2026): dos autos, cada uno con la app en su teléfono, en una pista sin semáforo o
un lugar controlado. La app da la salida a los dos al mismo tiempo, mide reacción y tiempos de ambos y al
final imprime el ticket de la carrera en un solo teléfono. Se queda en beta.

Este diseño lo hicieron 3 agentes con enfoques distintos (todo local sin internet, con internet, lo más
simple) y un revisor escéptico que eligió el plan. Son estimaciones: nada está probado con dos teléfonos.

**Revisión crítica y diseño recomendado para Race 1 vs 1**

**Fallas de cada propuesta**

*Propuesta 1 (WebRTC por hotspot y QR, o golpes sin red)*
- La idea de fondo está bien: solo se necesita conexión en los pits y en la línea, donde los autos están a 3–5 m y el hotspot alcanza de sobra.
- El "stage automático por reposo" no funciona. El acelerómetro no detecta velocidad constante: un auto rodando a 2 km/h se ve igual que uno quieto.
- El ±5–10 ms de los golpes es optimista. Un golpe dura menos que una muestra a 60 Hz, y el retraso con que llega el dato del sensor cambia según el modelo.
- No está probado que funcione el hotspot de iPhone sin plan de datos, ni Android conectado a un Wi-Fi "sin internet".

*Propuesta 2 (internet y servidores MQTT públicos)*
- Depende de la señal justo donde es peor, y de servidores ajenos sin garantía. Daniel quiere control.
- Por datos celulares la ida y la vuelta tardan distinto, así que la sincronía queda en ±20–50 ms. El esquema PROPUESTA/OK/CANCELAR en la línea cancelaría muchas salidas.
- El respaldo con Date.now (50–500 ms de diferencia) no da una salida pareja.

*Propuesta 3 (chirrido y turnos cada 30 s)*
- La cuenta regresiva obliga al piloto a mirar el reloj y a estar en stage justo a tiempo. Distrae.
- La sincronía vence a los 10 min, y en pista (pits, fila, burnout) pasa más tiempo que eso.
- En web no se sabe cuánto tarda el micrófono. Además, el interruptor de silencio del iPhone interfiere. Es mucho trabajo para poca ganancia.
- La regla de 5 ms entre Date.now y performance.now anularía la sincronía sin motivo, porque Date.now se ajusta solo.

**Falla común (la más importante)**
Las tres dicen que "el ticket es justo aunque no haya sincronía". Eso solo vale con dos teléfonos del mismo modelo:
- La RT medida es la RT real más el retraso de la pantalla y del acelerómetro de ese teléfono: 20–60 ms, distinto en cada modelo. Entre un iPhone y un Android eso decide carreras cerradas. Hay que calibrar ese retraso en cada teléfono.
- Tampoco se puede detectar a un auto que avanza despacio en el stage, ni una mala alineación. Eso queda al honor de los pilotos o a un juez.

**Diseño recomendado: la base de la 1, con piezas de la 3**

- **Conexión:** el hotspot de un teléfono (o un router de bolsillo), sin internet y sin servidores ajenos.
  - Emparejar con dos QR, pidiendo la cámara antes de crear la oferta. Así Safari y Chrome usan las IP reales y conecta mejor.
  - Los datos van por WebRTC DataChannel.
  - Los resultados se mandan por la misma conexión al volver. Si falla: un QR, o un código para teclear (idea de la 3).
- **Sincronización:** pings tipo NTP. Se usan solo los más rápidos y se corrige la deriva con una recta. Los pings siguen hasta la verde.
- **Salida:**
  - El piloto toca "Listo" una vez, antes del burnout. En la línea no se toca nada.
  - Stage = acelerómetro quieto y GPS a menos de 1 km/h durante al menos 1 s, en los dos teléfonos.
  - Con los dos en stage, el anfitrión baja el árbol de practica.js después de una espera al azar de 1–2.5 s.
  - Si alguien se mueve antes de que baje el árbol, se cancela la salida, como cuando se pierde el stage en pista.
  - Brillo al máximo. Después de la verde, la pantalla queda neutral, sin vibración ni sonido.
- **Reacción y roja:**
  - La hora de la verde es el cuadro donde se pintó más el retraso calibrado de ese teléfono. RT = cruce del rollout (tRo de procesar) − esa hora.
  - Roja definitiva si el rollout se cruza antes de la verde. La roja en vivo solo es un aviso.
- **Ticket:**
  - En el anfitrión, a dos columnas, con las reglas de ganador de Práctica.
  - Si la diferencia es menor que el error esperado, dice "empate técnico" en lugar de dar ganador.
  - Se guarda en el historial de los dos teléfonos; el zip lleva un race_meta.json.
  - No poner botón de compartir sin preguntarle a Daniel.
- **Precisión esperada** (estimaciones, sin probar con dos teléfonos):
  - Las dos verdes juntas: ±10–25 ms.
  - RT: ±10–20 ms ya calibrada; sin calibrar, un sesgo de 20–60 ms.
  - Ganador firme solo con más de ~0.15 s de diferencia hoy, y ~0.05 s cuando exista "calibrar con boleta".
- **Riesgos:**
  - Que el hotspot o la conexión no funcionen en iOS.
  - Que la pantalla se mantenga encendida (Wake Lock) en la app instalada solo es confiable desde iOS 18.4.
  - Sol sobre la pantalla.
  - El avance lento en stage no se detecta.
  - El ET todavía no está calibrado.
- **Sin red (plan B, después):** turnos de la 3, pero sincronizados con golpes, y resultados por QR.

**Etapas: primero lo que puede tumbar el diseño**
0. Guardar la idea en CLAUDE.md, junto a "Medir con el semáforo real". No programar hasta que Daniel lo pida.
1. Página de prueba aparte, sin tocar la app: hotspot, QR y conexión en los teléfonos reales de Daniel y de un amigo (iPhone-iPhone, iPhone-Android). Medir ida y vuelta, desfase y Wake Lock con la app instalada. Si no funciona, se pasa al plan B.
2. Prueba "golpe → destello", grabada en cámara lenta a 240 fps: la app pone la pantalla en blanco al sentir un golpe. El tiempo entre el golpe y el destello es justo el sesgo de RT de ese teléfono. En la misma sesión, poner las dos pantallas a parpadear a una hora acordada.
3. Módulo de sincronía y un caso con hora de verde en mc.js (Node).
4. Árbol programado, stage y cancelación. Prueba en Playwright con dos páginas conectadas.
5. Ticket y historial. Confirmar con pt_test y uitest que Práctica y Medir no cambiaron.
6. Primero en un estacionamiento, despacio y filmado; luego en el autódromo.

---

## Propuestas originales (para consulta)

### Propuesta 1
**Enfoque:** Todo local, sin servidor y sin internet, en tres fases: 1) EMPAREJAR y SINCRONIZAR en los pits, con los dos teléfonos juntos; 2) CORRER cada teléfono por su cuenta, sin depender de la conexión; 3) JUNTAR los resultados al regresar. Un teléfono es el anfitrión (carril izquierdo): crea la carrera, elige el árbol (Pro .4 / Full .5) y al final imprime el ticket. El otro es el invitado (carril derecho).

Lo que hace viable todo esto: el ticket NO necesita que los relojes estén perfectos. Cada teléfono mide la reacción y los tiempos contra SU PROPIA verde (la que pintó en su pantalla), con su mismo reloj y su mismo acelerómetro. Ganador = la menor (reacción + ET), y esa suma ya viene relativa a la verde de cada uno. La sincronización solo sirve para que las dos verdes se vean al mismo tiempo y la carrera "en vivo" se sienta pareja. Para eso basta ±10–20 ms, y eso se logra hasta sin red.

Se reutiliza lo que ya existe: la secuencia del árbol y las reglas de luz roja de practica.js, y la medición de dragcore.js (DetectorVivo para saber cuándo empieza y termina la corrida, y procesar() para el cruce del rollout tRo y los hitos 60 ft / 330 ft / 1/8 / 1000 ft / 1/4 / trampa). El modo es aparte de "Medir": Medir sigue neutral, sin luces, como pidió Daniel. Aquí el árbol es justamente lo que se busca. Ya está el aviso "Race 1 vs 1 · en desarrollo" en index.template.html (cambio local, sin commit). Este diseño es la idea completa para guardarla en CLAUDE.md (pendientes) y no repetir el análisis.

**Conexion:** Plan A, con red local y SIN internet: WebRTC DataChannel. Funciona en Safari iOS y en Chrome Android, también instalada como app.
- Red: el hotspot de uno de los teléfonos (en Android funciona sin datos; en iPhone algunos operadores piden plan de datos para activarlo) o un router Wi-Fi de bolsillo en los pits. Sin red IP compartida, WebRTC no conecta. No hay Bluetooth web en iPhone y tampoco Wi-Fi Direct desde web.
- Señalización con QR, sin servidor: el anfitrión genera la oferta y la muestra como QR; el invitado la escanea con la cámara (getUserMedia), genera la respuesta y la muestra como QR; el anfitrión la escanea. Son unos 10 s. El SDP completo pesa 1–3 KB, así que se reduce a lo esencial (ice-ufrag, ice-pwd, huella DTLS de 32 bytes, rol, 1–3 candidatos IP:puerto), unos 150–250 bytes en base64, y se reconstruye del otro lado. Cabe en un QR chico, fácil de leer.
- Ventaja: como Safari ya dio permiso de cámara para el QR, expone las IP locales reales en lugar de nombres .local (mDNS). Eso ayuda a que conecte. Chrome usa .local; en hotspot normalmente se resuelve, pero hay que probarlo.
- Librerías: iOS no tiene BarcodeDetector, así que se incluye un lector de QR en JS (tipo jsQR, ~130 KB) y un generador de QR (~20 KB), dentro del index.html para que funcione sin internet (lo guarda el service worker).
- Durante la corrida la conexión NO hace falta (a 400 m y entre carrocerías se va a caer). El programa de la salida ya se mandó antes. Al volver se reconecta; si el canal murió, se vuelve a emparejar con QR o se usa el plan de QR para resultados.

Plan B, sin ninguna red: todo con QR y sensores.
- Sincronización por "golpes" (ver sincronización) y datos por QR: el invitado muestra un QR con sus marcas de tiempo; el anfitrión lo escanea, calcula la diferencia de relojes y muestra un QR con el programa (tipo de árbol, hora de la verde en el reloj del invitado, semilla). El invitado lo escanea.
- Resultados al final: el invitado muestra un QR con su resultado compacto (~300–500 bytes: RT, hitos, velocidades, banderas de roja y calidad) y el anfitrión lo escanea e imprime el ticket.

Opcional, si hay internet: un servidor público gratuito de señalización (tipo PeerJS) evitaría los QR. Pero es de terceros, por celular la latencia es de 30–100 ms con más variación y Daniel quiere control: no es el plan principal.

**Sincronizacion:** Reloj base: performance.now() en cada teléfono, el mismo que ya usan las marcas del acelerómetro (e.timeStamp en app.js). Safari lo redondea a 1 ms, suficiente. No usar Date.now(): el reloj del sistema puede saltar.

Con WebRTC (plan A): sincronización tipo NTP por ida y vuelta.
- El anfitrión manda unos 200 pings en 2–3 s; el invitado responde con su hora. offset = t_inv − (t_envío + t_llegada)/2. Se quedan solo los pings con ida y vuelta mínima (el 10% más rápido) y se toma la mediana.
- En Wi-Fi o hotspot local la ida y vuelta es de 2–10 ms, con lo que el offset queda en unos ±1–3 ms.
- Deriva: los cristales difieren 10–50 ppm (hasta ~3 ms por minuto). Mientras haya conexión se sigue haciendo ping cada 0.5 s hasta la verde y se ajusta la deriva con una recta.

Programación de la salida:
- Cuando los dos están en stage, el anfitrión elige la verde a 0.6–1.5 s al azar más un margen de ≥0.5 s. Manda "árbol baja en T (reloj del anfitrión), tipo Pro/Full".
- El invitado lo pasa a su reloj con el offset y la deriva. Así la latencia del mensaje no importa.

Sin red (plan B): sincronizar con golpes.
- Los dos teléfonos juntos (uno encima del otro o lado a lado en el cofre). Se dan 5 golpes secos con la mano. Ambos acelerómetros ven el mismo pico; se interpola el frente de subida de cada pico y se promedia.
- A 60–100 Hz da unos ±5–10 ms.
- La deriva no se puede corregir en vivo: hay que sincronizar poco antes (≤2–3 min antes de la verde: error extra ≤5–10 ms). Si se sincroniza dos veces separadas por unos minutos, se estima la deriva.
- La hora de la verde se acuerda por QR, como se dijo arriba.

Alternativas descartadas por ahora:
- Pitido o ultrasonido entre los teléfonos: el retardo de entrada y salida de audio varía por modelo (5–40 ms en iPhone, más en algunos Android). Para cancelarlo hay que hacer el método de doble chirrido (BeepBeep): mucho trabajo para la misma precisión que los golpes. El ruido de los motores lo complica y algunos teléfonos filtran >18 kHz.
- Un destello visto por las dos cámaras: cuadros de 33 ms, peor.

En cualquier modo, la pantalla agrega diferencias: 60 Hz contra 120 Hz y 1–3 cuadros de composición, es decir 5–20 ms entre modelos distintos. Por eso la verde se registra con la marca del requestAnimationFrame en que se pintó, no con la hora planeada.

**Salida y reaccion:** Flujo en cada teléfono:
1. "Listo" (un toque antes de alinear). Se arma la medición como en Medir: GPS + acelerómetro, burnout permitido.
2. Stage automático: auto quieto ≥1 s según el acelerómetro (la misma ventana de reposo de 0.7 s que ya usa dragcore para medir la gravedad). Se le avisa al otro teléfono; aparecen las luces de pre-stage/stage.
3. Con los dos en stage, el árbol baja a la hora acordada (secuencia de practica.js: Pro .4 todos los ámbar juntos, Full .5 en cascada).
4. Al soltar, el teléfono no hace nada especial: sigue grabando y DetectorVivo confirma la corrida (50 km/h en ≤8 s), sus hitos y el fin.

Reacción:
- RT = tRo − tVerde. tRo es el cruce del rollout (1 ft configurable), el mismo instante en que arranca el ET, igual que en pista: el haz de stage se libera cuando empieza el ET.
- tVerde = marca del cuadro donde se pintó la verde, en el mismo reloj que el acelerómetro.
- Formato boleta = RT + .400/.500, como ya hace Práctica.

Luz roja, en dos niveles:
- En vivo, provisional: si después del stage la aceleración longitudinal pasa ~0.25–0.3 g por ≥50 ms antes de la verde, se prende la roja en ese teléfono al instante, como el árbol real. Si se mueve antes de que baje el árbol, cuenta como "salió antes del árbol" (la misma regla de Práctica).
- Definitiva, al terminar: con procesar(), si tRo < tVerde es roja. El ticket usa la definitiva.
- Ojo: en pista la roja es por liberar el haz, no por moverse. Aquí el equivalente es pasar el rollout antes de la verde. Un movimiento leve (rodar en el stage) no debe dar roja; por eso el umbral en vivo es conservador y manda la regla de tRo.
- Reglas del ganador (las mismas de Práctica): roja pierde; dos rojas: pierde quien se adelantó más (la tRo − tVerde más negativa); si no hay rojas, gana la menor RT + ET a la distancia elegida (1/8 o 1/4). Opcional después: bracket con dial-in (verdes escalonadas por carril; el cálculo sigue igual de justo).

Pantalla: el teléfono va en el soporte, a la vista del piloto. Wake Lock activo y la app al frente: si la app se va al fondo en iOS, se pierden timers, sensores y conexión, y la corrida se marca inválida.

**Ticket:** El ticket se imprime en el teléfono anfitrión, con el estilo de la boleta que ya existe y dos columnas, izquierdo y derecho:
- Por carril: nombre o auto, R/T (formato boleta, y desde la verde entre paréntesis), 60', 330', 1/8 ET y velocidad, 1000', 1/4 ET y velocidad (trampa), ganador marcado "WIN" o la flecha de la pista, y la luz roja si hubo ("RED" con el valor negativo).
- Margen de victoria en segundos y a cuánto equivale en metros a la meta.
- Encabezado: fecha y hora, lugar (redondeado), árbol Pro/Full, rollout, modo de sincronización (WebRTC ±x ms o golpes ±y ms) y calidad de los datos de cada carril (las mismas banderas de calidad de procesar()).
- Honestidad: si el margen es menor que el error esperado (hoy ~0.1–0.15 s en 1/4, después de calibrar ~0.03–0.05 s), el ticket dice "Muy cerrada: empate técnico" en vez de declarar ganador firme.

Cómo llegan los datos:
- El invitado manda su resultado por el DataChannel o por QR (plan B).
- El invitado guarda su propia corrida en su historial y además una copia del ticket conjunto (el anfitrión se la devuelve por la conexión, o el invitado escanea un QR del ticket).
- El ticket se guarda en el historial de los dos teléfonos como "Race 1 vs 1".
- Se exporta como imagen o PDF desde el anfitrión, y el zip de cada uno trae sus CSV crudos más un race_meta.json con offset, deriva, tVerde y el id de la carrera. Así se puede reprocesar en Node o MATLAB y juntar después.

**Precision esperada:** Siendo honestos, con lo que ya se midió en la primera prueba real y la simulación (aún sin validar del todo):
- Que las dos verdes salgan juntas: con WebRTC local, relojes ±1–3 ms y verdes visibles ±5–20 ms (domina la pantalla de cada modelo). Sin red, con golpes: ±10–25 ms. Las dos cosas son imperceptibles para el piloto; a 180 km/h, 20 ms son ~1 m de diferencia "visual" en la meta.
- Justicia del ticket: no depende de la sincronización, porque cada quien se mide contra su verde. Solo depende de la precisión de medir de cada teléfono.
- Reacción (RT) de cada piloto: cruce del rollout ~10 ms (simulación) más el retraso de pantalla de cada teléfono (~15–40 ms, en su mayoría constante). Sin calibrar: ±20–40 ms de sesgo y la boleta de la app NO es comparable al milésimo con la de pista. Calibrando el retraso de pantalla por teléfono (video en cámara lenta a 240 fps: 4 ms por cuadro): ±10–15 ms.
- ET: la primera prueba real dio 60 ft +0.003, 1/8 +0.137 y 1/4 +0.162 s contra la boleta, antes de calibrar el retraso GPS y el rollout. Si los dos teléfonos tienen el mismo sesgo, se cancela en buena parte; con modelos distintos, no.
- El ganador es confiable si la diferencia es mayor a ~0.15 s hoy, o a ~0.05 s después de la "calibración con boleta" pendiente.
- La luz roja la decide la regla de tRo, con resolución de ~10–20 ms: una roja de −0.005 puede salir como verde perfecta o al revés.

**Riesgos:**
- Hotspot del iPhone: algunos operadores piden plan de datos para activarlo; las redes Wi-Fi públicas o de la pista suelen aislar a los clientes y WebRTC no conecta. Hay que tener siempre el plan B (golpes + QR).
- Resolución .local (mDNS) en Chrome Android dentro de un hotspot: normalmente funciona pero no está garantizado; probarlo con iPhone↔Android, Android↔Android y iPhone↔iPhone antes de prometer.
- iOS suspende la PWA si se bloquea la pantalla o se cambia de app: se pierden conexión, timers y sensores. Hace falta Wake Lock (en algunas versiones de iOS no funcionó instalada como app; ya existe un intento en app.js) y avisar que no se toque el teléfono.
- Permisos de cámara en la app instalada en iOS: a veces los pide en cada sesión; el escaneo del QR puede costar con sol fuerte o pantalla con poco brillo (subir el brillo y QR grande).
- Diferencias de pantalla entre modelos (60/120 Hz, ProMotion que baja a 10–24 Hz en reposo): pueden sesgar la RT de un carril 10–30 ms. Mitigación: animación continua durante el árbol para forzar la tasa alta y calibración opcional con cámara lenta.
- Deriva de reloj en el plan B: si pasan más de ~3 min entre los golpes y la verde, se pierde la simultaneidad (sigue siendo justo para el ticket, pero se ve desparejo).
- Falsa luz roja en vivo por vibración del soporte (ruido de ~2 m/s² medido en reposo) o por el motor revolucionado en two-step; el umbral debe ser conservador y la decisión final la toma tRo.
- Sin haces de stage ni línea de meta física, alinear los dos autos depende de una raya o conos; un auto adelantado medio metro gana ~0.05–0.1 s visuales, aunque el ticket lo mide desde su propio rollout.
- Errores de ET aún no calibrados (+0.14/+0.16 s en la primera prueba): con dos modelos distintos de teléfono pueden decidir mal una carrera cerrada; por eso existe el 'empate técnico'.
- Seguridad: el teléfono en el soporte con un árbol brillante no debe distraer; la pantalla de corrida debe volver a ser neutral después de la verde, sin vibración ni sonidos durante la carrera.
- Peso de la app: lector y generador de QR inline suman ~150 KB al index.html autocontenido.

**Pasos:**
1. 0) Guardar esta idea en CLAUDE.md (pendientes/ideas acordadas) junto a 'Medir con el semáforo real': Race 1 vs 1 beta, emparejar con QR + WebRTC por hotspot, plan B con golpes + QR, ticket en el anfitrión, cada quien medido contra su propia verde. No programar hasta que Daniel lo pida.
2. 1) Prueba de factibilidad (página de prueba aparte, sin tocar la app): dos teléfonos, QR de oferta/respuesta comprimido, DataChannel por hotspot sin internet; medir la ida y vuelta y el offset. Combinaciones iPhone-iPhone, iPhone-Android y Android-Android.
3. 2) Módulo de sincronización (sync.js): pings con filtro de mínima ida y vuelta, deriva por recta y conversión de horas. Prueba en Node con relojes simulados (offset, deriva de 50 ppm, variación, pérdidas) y otra con golpes simulados en el acelerómetro (60–100 Hz).
4. 3) Medir el retraso de pantalla: verde pintada por rAF frente a video en cámara lenta de los dos teléfonos lado a lado; decidir si vale la pena una calibración por teléfono.
5. 4) Árbol programado: reutilizar la secuencia de practica.js con la hora acordada, stage por reposo del acelerómetro, roja en vivo provisional y registro de tVerde en el reloj de los sensores.
6. 5) Corrida y reacción: DetectorVivo + procesar() sin cambios en el algoritmo; RT = tRo − tVerde y roja definitiva por tRo < tVerde. Agregar a mc.js un caso con tVerde para medir el error de la RT.
7. 6) Resultados y ticket: mensaje compacto (DataChannel o QR), reglas del ganador de Práctica, margen y 'empate técnico'; guardar en el historial de los dos y exportar zip con race_meta.json.
8. 7) Interfaz en Medir: 'Race 1 vs 1 (beta)' con Crear carrera / Unirme, pasos guiados (escanear, golpes, Listo) y pantalla de árbol a la vista; avisos de Wake Lock y de no cambiar de app.
9. 8) Pruebas automáticas: Playwright con dos páginas de Chromium conectadas (WebRTC local), sensores falsos y offset de reloj artificial; capturas del ticket. Correr pt_test y uitest para confirmar que Práctica y Medir no cambiaron.
10. 9) Prueba de campo: estacionamiento con dos autos y dos teléfonos (verdes simultáneas filmadas en cámara lenta) y luego en el autódromo, contra el árbol y las boletas oficiales, para calibrar la RT y el ET.

### Propuesta 2
**Enfoque:** Idea central: la conexión entre los dos teléfonos solo hace falta ANTES de la salida (para emparejarse, sincronizar relojes y avisar la salida) y DESPUÉS de la carrera (para juntar resultados). Durante la corrida cada teléfono mide solo, con su propio GPS y acelerómetro y el algoritmo actual (dragcore.js `procesar`). Así, que la señal se caiga en medio de la pista no importa.

Lo que más pesa en el diseño: cada teléfono mide la reacción contra SU PROPIO árbol y con SU PROPIO reloj (performance.now, el mismo reloj que ya usan los sensores en app.js). Por eso la boleta es justa aunque los relojes de los dos teléfonos no estén perfectamente sincronizados. El ganador se decide igual que en pista: gana quien tenga menor (reacción + ET), roja pierde, y con dos rojas pierde quien salió primero (las mismas reglas de practica.js). Sincronizar bien solo sirve para que las dos verdes caigan casi juntas y los autos vayan físicamente parejos, que la carrera "se vea" real. Si la sincronización falla por 30 ms, la boleta sigue siendo correcta.

Roles: el teléfono A ("árbol", el que crea la sala) decide cuándo baja el árbol y al final imprime la boleta de los dos carriles. El teléfono B se une. Es una pestaña o sección nueva "Race 1 vs 1 (beta)", aparte de Medir: Medir sigue neutral, sin dar la salida, como pidió Daniel. Esta sección sí da la salida, porque ese es su propósito.

Tres niveles según la señal en el autódromo:
1) Con internet: conexión directa entre teléfonos (WebRTC) con un servicio público gratuito de respaldo. Es el modo normal.
2) Con un teléfono como hotspot y sin internet: experimental, solo si se comprueba que funciona en sus teléfonos.
3) Sin señal: "salida programada" con la hora del teléfono (las verdes caen menos parejas, pero la boleta sigue justa) y resultados pasados por código QR.

**Conexion:** Emparejar (en los pits, con señal): A muestra un código QR y además un código corto de 4–5 letras. B escanea el QR con la cámara o escribe el código. El QR lleva el nombre de la sala (aleatorio, largo) y una clave de cifrado. Así nadie más puede leer ni meter mensajes, aunque el servicio sea público. Para leer el QR en iPhone hace falta incluir un lector en la app, porque Safari no trae BarcodeDetector. Es una librería chica (tipo jsQR) que se mete en el index.html autocontenido, igual que todo lo demás, para que funcione sin conexión.

Transporte recomendado (sin servidor propio y sin cuentas):
- Primario: WebRTC DataChannel, una conexión directa entre los dos teléfonos. Safari y Chrome lo soportan. Tiene menor retraso y menos variación: mejor sincronización.
- Para que los teléfonos se encuentren (señalización) y como respaldo: un broker MQTT público y gratuito por WebSocket seguro (por ejemplo broker.hivemq.com o broker.emqx.io; se configuran dos por si uno falla). El tema es dragtree/<sala> y los mensajes van cifrados con AES-GCM (WebCrypto) usando la clave del QR. STUN público de Google para atravesar el NAT. Sin TURN.
- Si WebRTC no conecta en ~8 s (pasa seguido con datos celulares por el CGNAT de las compañías), todo sigue por el broker MQTT. Alcanza de sobra porque los mensajes son pocos y chicos: pings de sincronización, estado, "árbol en T", resultados (~1 KB).
- Alternativa más confiable si los brokers públicos fallan: Firebase Realtime Database, plan gratis. Requiere que Daniel cree un proyecto de Google (una vez) y reglas de seguridad. Se deja como plan B. No uso PeerJS cloud como dependencia principal (no tiene garantía), aunque sirve para el prototipo.
- Descartado: Web Bluetooth (no existe en iPhone), NFC web (tampoco), y servidor propio (no hay).

Mensajes: HOLA (versión de la app, modelo, carril, nombre), PING/PONG (marcas de tiempo), ESTADO (GPS listo, acelerómetro Hz, quieto/stage, batería), PROPUESTA(T, tipo de árbol, ronda), OK, CANCELAR, RESULTADO, ACUSE. Todo lleva número de ronda para no mezclar carreras.

Con mala señal: emparejar y sincronizar en los pits, donde suele haber mejor señal. Mantener la conexión viva con pings cada 2 s hasta la línea. Si en la línea no hay conexión, se ofrece la "salida programada" (ver sincronización). Los resultados se mandan solos cuando vuelve la conexión (cola con reintentos). Si nunca vuelve: en los pits B muestra un QR con su resultado y A lo escanea. Este respaldo funciona 100 % sin internet.

Hotspot sin internet (experimental): un teléfono comparte su Wi-Fi, el otro se conecta y la señalización WebRTC se hace con dos QR (oferta/respuesta). En red local el retraso es de 2–10 ms, ideal para sincronizar. Pero en iPhone no es seguro que funcione (candidatos mDNS, aislamiento del hotspot, el hotspot de iPhone puede necesitar datos). Hay que probarlo en sus teléfonos antes de prometerlo.

**Sincronizacion:** No usar Date.now() ni la "hora del GPS". En el navegador, pos.timestamp de la Geolocation NO es la hora atómica del GPS: es la hora del sistema cuando llegó el dato (iOS y Chrome). Date.now() puede brincar cuando el teléfono ajusta su hora. Se usa performance.now() (el reloj continuo que ya usan app.js y los sensores) y se calcula el desfase entre los dos teléfonos directamente, sin servidor de hora.

Método tipo NTP entre teléfonos: B manda PING(t1). A responde con t2 (cuando lo recibió) y t3 (cuando contesta). B anota t4. Ida y vuelta = (t4−t1)−(t3−t2); desfase = ((t2−t1)+(t3−t4))/2. Se hacen 30–50 pings en ~5 s. Se queda el 20 % con menor ida y vuelta y se toma la mediana del desfase. Error estimado ≈ ida y vuelta mínima / 2, que es el peor caso si el camino de ida y el de vuelta tardan distinto. Los pings siguen cada 1–2 s mientras esperan en la línea y el valor se va actualizando. Así también se corrige la deriva de los relojes de cuarzo (~10–50 ppm, unos 0.6–3 ms por minuto).

Sincronización alcanzable (diferencia entre los relojes):
- WebRTC en hotspot/red local: 1–5 ms.
- WebRTC directo por datos celulares: 5–20 ms.
- Por broker MQTT público: 10–50 ms (con señal mala, peor).
Se muestra en pantalla ("Sincronía: ±8 ms"). Si pasa de ~30 ms se avisa "salida menos pareja", pero se deja correr porque la boleta sigue justa.

Problema de iPhone: si la pantalla se apaga o se cambia de app, el JavaScript se congela, performance.now deja de avanzar y la conexión se corta. Hay que mantener la pantalla encendida con Wake Lock (la app ya pide wake lock al medir; en PWA de iPhone funciona bien solo en iOS recientes, hay que confirmarlo en el de Daniel). Con el evento visibilitychange se invalida la sincronización y se repite al volver.

Salida sin señal ("salida programada"): si no hay conexión en la línea, los dos teléfonos ya acordaron en los pits una hora de salida con cuenta regresiva ("Árbol en 0:45"). Cada uno baja su árbol a esa hora según su propio reloj. Si se sincronizaron en los pits con performance.now y no se apagó la pantalla, la diferencia es la de esa sincronización más la deriva: ~5–30 ms después de 5–10 min. Si se perdió (pantalla apagada), se usa Date.now() del teléfono (hora de la red celular), con diferencias típicas de 50–500 ms. Las verdes no caen juntas, pero cada reacción se mide contra su propio árbol y la boleta sigue siendo justa.

Descartado: sincronizar contra un servidor HTTP de hora. El encabezado Date solo da segundos, las APIs de hora con milisegundos no son confiables ni tienen CORS seguro, y cada teléfono sumaría su propio error de red. La sincronización directa entre teléfonos es mejor. (Una idea a futuro, no para la primera versión: sincronizar por sonido con los teléfonos juntos en los pits, cada uno emite y graba un chirrido, ~1 ms. Es complejo de calibrar.)

**Salida y reaccion:** Secuencia en la línea:
1) Cada piloto tiene su teléfono fijo en el tablero, viendo la pantalla. La app ya pidió permiso del acelerómetro con un toque (en iPhone es obligatorio que el usuario toque) y tiene GPS. Burnout y alineación como siempre: la medición se puede armar antes, igual que hoy.
2) STAGE: el piloto toca "Listo/Stage" cuando el auto está en su marca. El teléfono confirma que el auto está quieto (aceleración estable durante 0.7 s, la misma ventana que ya usa el algoritmo para medir la gravedad). Cada teléfono manda ESTADO y los dos ven "Carril izq: STAGE · Carril der: esperando". La alineación de los dos autos en la línea es manual (una marca pintada); no hay fotoceldas.
3) Cuando los dos están en stage, la sincronía es aceptable y la conexión está viva, A elige un retraso al azar de 0.8–2.5 s (como un juez de salida), calcula T = momento de encender el árbol en su reloj y manda PROPUESTA(T) con al menos 2–3 s de anticipación. B la convierte a su reloj (T − desfase) y contesta OK. A solo baja su árbol si recibió el OK antes de T − 0.3 s. Si no, manda CANCELAR varias veces y los dos muestran "Salida cancelada: señal". Caso raro: B ya se comprometió y no le llega el cancelar. Entonces B corre solo y su resultado queda marcado "carrera anulada". No hay forma perfecta de evitarlo sin una conexión confiable, y se dice en pantalla.
4) Árbol: mismo dibujo y tiempos que practica.js (Pro .4 o Full .5, elegido al crear la sala). Cada teléfono programa el árbol con setTimeout hasta ~20 ms antes y luego afina con requestAnimationFrame. Guarda como hora de la verde (y del último ámbar) la marca del cuadro en que realmente se pintó, no la hora planeada. Solo luces en pantalla. El sonido no se oye con el motor, y la vibración no existe en iPhone.
5) Reacción: se mide con el algoritmo actual (gravedad en stage, inicio del movimiento con el acelerómetro, rollout configurable). Reacción = cruce del rollout − hora de la verde (formato "desde la verde", perfecta .000), y también desde el último ámbar (formato "boleta", perfecta .400/.500), como ya hace Práctica. El cruce del rollout equivale a cuando el auto sale del haz de stage en pista. La búsqueda del arranque se limita a la ventana [árbol − 2 s, verde + 3 s], así no se confunde con el burnout. La regla de 50 km/h en 8 s se mantiene para confirmar que fue una corrida.
6) Luz roja: es roja si el cruce del rollout ocurre antes de la verde (reacción negativa, por ejemplo −0.012, como en la boleta de pista). Si el auto se mueve fuerte después de stage y antes de que baje el árbol, también es roja (como en Práctica). En vivo se puede encender la roja al instante con un detector sencillo: aceleración hacia adelante > ~0.3 g durante 100 ms antes de la verde. El veredicto final lo da `procesar` después de la corrida, que es más preciso. Una roja de unos milisegundos es dudosa: el inicio del movimiento tiene ~10 ms de error en simulación, aún sin validar con datos reales. El soporte del teléfono vibra (~2 m/s² de ruido en reposo), así que el arrastre lento del auto ("creep") no se detecta con confianza.
7) Después de la verde, cada teléfono sigue como una corrida normal (DetectorVivo, hitos 60 ft, 330 ft, 1/8, 1000 ft, 1/4, velocidad) y guarda su corrida completa en su propio historial, con los datos crudos para exportar el zip como hoy.

**Ticket:** Al terminar, cada teléfono procesa su corrida y manda RESULTADO a A (y A a B, para que los dos vean la boleta si hay conexión). Si no hay conexión: cola con reintentos, o en los pits B muestra un QR con su resultado y A lo escanea. El resultado lleva: carril, nombre/auto, tipo de árbol, reacción (boleta y desde la verde), roja sí/no, 60 ft, 330 ft, 1/8 ET + velocidad, 1000 ft, 1/4 ET + velocidad, calidad de los datos (Hz del acelerómetro, GPS), sincronía estimada, versión de la app y modelo del teléfono, y número de ronda.

Boleta de A, con estilo de ticket de pista y dos columnas (izquierdo / derecho): RT, 60', 330', 1/8 ET, 1/8 MPH (km/h), 1000', 1/4 ET, 1/4 MPH (km/h). Abajo: GANADOR, margen de victoria = diferencia de (RT + ET), y avisos: "ROJA", "carrera anulada", "salida programada (sin señal)", "sincronía ±X ms". Si el margen es menor que la incertidumbre (hoy ~0.05 s, ver precisión), dice "Muy cerrado: dentro del margen de error de la app" en lugar de declarar un ganador seguro. Se guarda como "carrera" en el historial (IndexedDB) con las dos corridas. "Imprimir": se muestra en pantalla y se puede guardar como imagen (PNG desde canvas). Desde la hoja de Compartir del teléfono se puede mandar a una impresora AirPrint o por WhatsApp. Ojo: Daniel pidió no poner botón de compartir para la guía de instalación; aquí sería otra cosa, pero conviene preguntarle. Imprimir directo en impresora térmica Bluetooth no es posible desde la web en iPhone.

**Precision esperada:** Honesto, por partes:
- Qué tan juntas caen las dos verdes: con internet, 10–50 ms de diferencia entre teléfonos (sincronía 5–50 ms, más pantalla). En hotspot local, 5–20 ms. En "salida programada" sin señal, 5–30 ms si se conserva la sincronía de los pits, o 50–500 ms con la hora del teléfono. Además cada pantalla enciende la luz en el siguiente cuadro (8–17 ms) y tiene un retraso propio del panel (10–40 ms), distinto entre un iPhone y un Android.
- Reacción medida (cada teléfono contra su propio árbol): repetible ~±10 ms. Exactitud absoluta ±20–30 ms, porque hay un sesgo fijo por modelo de teléfono entre "cuándo se vio la luz" y "cuándo se registró el acelerómetro" (el acelerómetro de Safari va a ~60 Hz y llega con 10–30 ms de retraso). Ese sesgo se puede calibrar grabando los dos teléfonos y el arranque con cámara lenta de 240 fps desde un tercer teléfono. Así se baja a ~±10 ms.
- Tiempos (ET): los mismos de la app hoy. 60 ft muy cerca de la boleta (2.653 vs 2.650 en la prueba real). 1/8 y 1/4 todavía con +0.14/+0.16 s contra la boleta oficial hasta calibrar el retraso del GPS y el rollout. Si los dos teléfonos tienen errores distintos (modelo, soporte), la diferencia entre carriles puede tener 0.05–0.15 s de error en 1/4 mientras no se calibre.
- Ganador: confiable cuando el margen es mayor a ~0.1 s hoy. Una vez calibrado con varias corridas con boleta oficial, ~0.03–0.05 s. Por debajo de eso la boleta lo marca como "muy cerrado".
Nada de esto se ha probado con dos teléfonos reales; son estimaciones de diseño.

**Riesgos:**
- La pantalla se apaga o se cambia de app en iPhone: se congela el JavaScript, se pierde la conexión y la sincronía. Requiere Wake Lock (en PWA de iPhone funciona bien solo en iOS recientes) y volver a sincronizar al regresar. Hay que probarlo en el iPhone de Daniel.
- Señal celular mala en el autódromo: no se puede emparejar ni mandar la salida. Mitigación: emparejar y sincronizar en los pits, 'salida programada' sin señal y resultados por QR.
- Con datos celulares la conexión directa (WebRTC) suele fallar por el NAT de las compañías. Entonces todo va por el broker público, con más retraso y peor sincronía (10–50 ms).
- Los brokers MQTT públicos gratuitos no tienen garantía: pueden caerse, limitar o desaparecer. Configurar dos y tener a Firebase (cuenta gratis de Daniel) como plan B.
- Problema de los 'dos generales': si se pierde el OK o el CANCELAR justo antes de la salida, un carril puede correr solo. Se marca como 'carrera anulada'.
- El sesgo pantalla/acelerómetro cambia por modelo (iPhone 120 Hz vs Android 60 Hz, modo de bajo consumo que limita a 60 Hz): reacciones con 10–30 ms de sesgo hasta calibrar con video en cámara lenta.
- Luz roja por milímetros: el 'creep' lento no se detecta por el ruido del soporte (~2 m/s²). Rojas de pocos ms son dudosas.
- La alineación de los dos autos en la línea es a ojo (no hay haces de stage): la carrera física puede verse distinta a la boleta, aunque la boleta sea justa.
- Seguridad: el piloto mira el teléfono en el tablero en lugar de la pista. Solo en pista cerrada o en un ambiente controlado, nunca en la calle. Poner ese aviso en la sección.
- El hotspot sin internet con WebRTC y señalización por QR puede no funcionar en iPhone (mDNS, aislamiento del hotspot). Es experimental.
- Más código y dependencias incluidas en el index.html (cliente MQTT, lector de QR): crece el archivo. Todo debe funcionar sin conexión con el service worker.
- Dos teléfonos con versiones distintas de la app pueden calcular distinto: HOLA debe comparar versiones y avisar.
- Los errores actuales de 1/8 y 1/4 contra la boleta (+0.14/+0.16 s) siguen ahí hasta la función 'calibrar con boleta'. Conviene tenerla antes de usar Race 1 vs 1 para decidir ganadores cerrados.

**Pasos:**
1. 0. Guardar la idea en CLAUDE.md (punto nuevo 'Race 1 vs 1, beta, solo idea'): dos teléfonos, la app da la salida, la boleta se imprime en uno, la boleta es justa aunque la sincronía no sea perfecta, transporte WebRTC + broker público, respaldo por QR. No programar hasta que Daniel lo pida.
2. 1. Prototipo de conexión y sincronía, sin árbol ni sensores: sala con QR y código, WebRTC con señalización por MQTT público cifrado y respaldo por MQTT. Mostrar la sincronía estimada (±ms). Probar con dos navegadores en Playwright (dos contextos con desfase de reloj falso y pérdida de mensajes simulada) y luego con los teléfonos de Daniel en casa y en el autódromo.
3. 2. Medir de verdad qué tan juntas caen las verdes: los dos teléfonos lado a lado con un árbol de prueba, grabados con cámara lenta de 240 fps desde un tercer teléfono. Repetir con Wi-Fi, con datos celulares y en modo 'salida programada'.
4. 3. Reutilizar el árbol de practica.js en un módulo nuevo (por ejemplo carrera.js): pintar las luces a una hora programada en el reloj local, registrar la marca real del cuadro de la verde y del último ámbar, protocolo PROPUESTA/OK/CANCELAR.
5. 4. Unir con la medición: stage con 'quieto' del acelerómetro, ventana de búsqueda del arranque alrededor de la verde en `procesar` (mantener dragcore.js y drag_procesar.m equivalentes si se toca el algoritmo; correr mc.js/inicio.js/spike.js antes y después), reacción en los dos formatos y regla de roja. Pruebas con el simulador de sesiones (simularSesion) con un árbol inyectado.
6. 5. Resultados y boleta: mensaje RESULTADO con cola de reintentos, respaldo por QR (lector incluido en la app), boleta de dos carriles con margen de error, guardado en el historial como 'carrera', imagen PNG.
7. 6. Modo sin señal: 'salida programada' con cuenta regresiva y avisos claros en la boleta.
8. 7. Sección 'Race 1 vs 1 (beta)' con aviso de seguridad (solo pista cerrada). Pruebas de navegador nuevas (dos teléfonos falsos, señal mala, rojas, cancelación) y capturas revisadas antes de publicar. Subir APP_VERSION/VERSION.
9. 8. Prueba real en el autódromo con boleta oficial de ambos carriles, cuando haya semáforo, para comparar reacción y ET. Calibrar el sesgo por teléfono (y usar 'calibrar con boleta' cuando exista).

### Propuesta 3
**Enfoque:** "Cada teléfono por su cuenta, con un solo momento compartido": nada de conexión entre los teléfonos durante la carrera. Los dos teléfonos "oyen" juntos UN evento físico en los pits (un chirrido que da un teléfono, o una palmada), unos minutos antes de correr. Cada uno toma ese instante como su "cero" con su propio reloj, y todo lo demás (árbol, reacción, tiempos) se calcula a partir de ese cero. Como los dos oyen el mismo sonido al mismo tiempo (con 10–20 cm de separación el sonido tarda 0.3–0.6 ms), no hace falta mandar la hora de un teléfono al otro ni tener internet. El árbol sale en "turnos" programados (cada 30 s, configurable) a la misma hora relativa en los dos. Antes de cada árbol hay una espera al azar, igual en los dos porque sale de una semilla compartida, para que nadie pueda adivinar la verde. Cada teléfono detecta su arranque, mide su reacción y sus tiempos con el algoritmo actual (procesar() de dragcore.js) y arma su mitad de la boleta. Al final, un teléfono muestra un QR con su resultado (unos 300 bytes), el otro lo escanea e imprime el ticket de los dos carriles. Descarté a propósito: WebRTC (necesita un servidor de señalización o un intercambio manual muy frágil en iPhone), Web Bluetooth y NFC (no existen en iPhone), la hora del sistema y la del GPS (entre teléfonos pueden diferir 10–100+ ms) y los servicios de hora por internet (±20–100 ms con datos móviles y sin señal no sirven). Es menos automático porque nadie "confirma stage" a distancia, pero se puede validar por partes con una cámara lenta, y funciona sin señal.

**Conexion:** Sin conexión durante la carrera. Solo hay intercambio antes y después, siempre con los teléfonos juntos en la mano:
1) EMPAREJAR (antes): el teléfono A ("Carril izquierdo", el anfitrión) crea la carrera y muestra un CÓDIGO DE 6 DÍGITOS, grande. El teléfono B lo teclea. El código contiene la semilla de las esperas al azar (4 dígitos), el tipo de árbol (Pro .4 / Full .5) y la distancia (1/8 o 1/4). Así B no necesita cámara para empezar. Opcional: el mismo código como QR para escanearlo.
2) DURANTE: nada. Cada teléfono funciona solo y con la pantalla siempre encendida (wakeLock, que app.js ya usa).
3) JUNTAR (después, en los pits): B muestra un QR con su resultado compacto: código de la carrera, turno en que salió, RT, 60/330 ft, 1/8, 1000 ft y 1/4 con velocidades, luz roja, modelo del teléfono, rollout y calibración, más el sello de la sincronía de cierre (ver sincronización). A lo escanea con la cámara y arma el ticket. Detalles: en iPhone no existe BarcodeDetector, así que hay que incluir un lector de QR en JavaScript (jsQR, ~130 KB, dentro del index.html autocontenido) y un generador de QR (~20 KB). Si la cámara falla, hay un respaldo: B muestra un código de ~30 dígitos con dígito verificador (los tiempos en milisegundos) y A lo teclea. Opcional: A muestra después un QR con el ticket completo para que B también lo guarde. Los datos crudos de cada teléfono se quedan en su propio historial y zip, como hoy.
NO usar enlaces compartidos (#race=…) para pasar datos: en iPhone abren Safari y no la app instalada, y los datos de Safari y los del ícono son distintos (CLAUDE.md, punto 11).

**Sincronizacion:** EVENTO COMPARTIDO (no se manda la hora). En los pits, con los motores apagados o lejos, se ponen los dos teléfonos juntos (tocándose o a menos de 20 cm) y se toca "Sincronizar" en los dos. Los dos abren el micrófono (getUserMedia + AudioContext). A emite 3–5 chirridos conocidos (barrido de 2–6 kHz, 50 ms cada uno, separados 0.7 s). B no necesita emitir nada. Cada teléfono, A incluido porque se oye a sí mismo, busca los chirridos en lo que grabó con un filtro adaptado (precisión de una muestra, ~0.02 ms) y pasa ese instante a su reloj performance.now(). El "cero" de cada teléfono es el promedio de los chirridos, y se descartan los que no cuadren con la separación conocida. A también se graba a sí mismo, así que el retraso de su bocina se cancela. Respaldo sin bocina: una palmada o un chasquido entre los dos teléfonos, a la misma distancia de cada uno. Segundo respaldo, sin micrófono: los dos teléfonos juntos en la mano y un golpe seco contra la palma, 3 veces, detectado con el acelerómetro. Es más simple pero peor: a 60 Hz y con la marca de tiempo de entrega del evento (e.timeStamp, como en onMotion) queda en ±8–15 ms.
LO QUE NO SE CANCELA: la diferencia del retraso de entrada del micrófono entre los dos teléfonos. En iPhone es de ~5–10 ms y bastante estable. En Android varía mucho (10–40 ms) y el navegador no la reporta bien. Entre dos iPhone el error esperado es de ±1–3 ms. Entre un iPhone y un Android, de ±10–30 ms, hasta calibrar el par con video (paso de validación). La calibración se guarda como "ajuste del par" en milisegundos.
DERIVA: los relojes de los teléfonos se separan ~10–50 partes por millón: 2–4 ms en 3 min, hasta 30 ms en 10 min. Por eso la sincronía VENCE a los 10 min (configurable), con un aviso "vuelve a sincronizar" y una cuenta visible. Opcional y recomendada: una SINCRONÍA DE CIERRE con un segundo chirrido al volver a los pits. Viaja en el QR final y deja medir y corregir la deriva en línea recta. También sirve para validar: si los dos intervalos difieren más de 5 ms, el ticket lo marca.
INVALIDACIÓN: si la página se oculta (cambio de app, pantalla bloqueada), o si el avance de Date.now() y el de performance.now() difieren más de 5 ms entre revisiones (por ejemplo, porque el teléfono se suspendió y su reloj se detuvo), la sincronía se anula y la pantalla pide repetirla. Es la regla que protege contra la limitación más grande de iPhone: no corre nada en segundo plano.

**Salida y reaccion:** ÁRBOL EN TURNOS: después de sincronizar, cada teléfono calcula turnos k = 1, 2, 3… en T0 + 60 s + k·30 s, usando su propio cero. El intervalo se elige en el código: 20/30/45/60 s. Antes de cada turno, la pantalla muestra "Próximo árbol en 25 s…". En los últimos 5 s cambia a "Árbol activo" y se quita la cuenta. Luego viene la espera al azar (0.6–2.5 s, sale de la semilla y del número de turno, así que es idéntica en los dos teléfonos), después los ámbares (Pro: los 3 juntos; Full: 3 ámbares a 0.5 s) y la verde a los 0.400 / 0.500 s. Para dibujarlo se reutiliza el árbol de practica.js, a pantalla completa y con el brillo al máximo. No se usa vibración (en iPhone no existe) ni sonido (los motores lo tapan). Quien no está listo deja pasar el turno. Los pilotos se ven lado a lado y acuerdan con una seña. Cada corrida queda ligada al turno en que salió. Si solo uno salió en ese turno, es una "pasada sola". Así no hace falta confirmar stage a distancia.
PINTAR LA VERDE: se elige el cuadro de requestAnimationFrame más cercano a la hora planeada y se guarda la hora real de ese cuadro como "verde mostrada". El error es de ±8 ms a 60 Hz y de ±4 ms a 120 Hz. Además, cada pantalla tarda en mostrar la imagen (20–50 ms, según el modelo). Esa demora se mide con video y se compensa por teléfono ("retraso de pantalla"): el teléfono más lento adelanta su árbol.
REACCIÓN Y ROJA (al terminar, no en vivo): procesar() ya da el inicio preciso del movimiento y el cruce del rollout (tRo), que hace las veces del haz de stage. Con eso:
- RT boleta = tRo − último ámbar (perfecta .400 / .500).
- RT desde la verde = tRo − verde (perfecta .000), los mismos dos formatos que Práctica.
- Hay LUZ ROJA si tRo < verde, incluso si arrancó antes de que bajara el árbol.
- La corrida se liga al turno cuyo árbol cae entre −3 s y +3 s del arranque detectado. Los burnouts ya los descarta DetectorVivo (de casi detenido a 50 km/h en ≤8 s).
- El ET cuenta desde tRo, como hoy. Gana quien llega primero: RT desde la verde + ET. Las reglas de roja son las de Práctica: la roja pierde; con dos rojas, pierde quien salió primero.
Aviso en vivo opcional: si el acelerómetro marca un movimiento fuerte antes de la verde, se prende un foco rojo en el árbol. Solo es informativo, porque con la vibración del motor (~2 m/s² de ruido) daría falsas alarmas. Lo oficial es lo procesado.

**Ticket:** El ticket se imprime en el teléfono A (o en el que escaneó) con formato de boleta de pista, a dos columnas, Carril izq. / Carril der.: nombre o auto de cada uno, RT (formato boleta y desde la verde), 60 ft, 330 ft, 1/8 ET @ velocidad, 1000 ft (si es 1/4), 1/4 ET @ velocidad, luz roja ("RED LIGHT" en lugar del RT), marca de ganador y margen de victoria (diferencia de RT desde la verde + ET). Abajo: tipo de árbol, distancia, turno, hora, rollout de cada teléfono, modelos de los teléfonos y una línea de CALIDAD DE SINCRONÍA ("par calibrado ±10 ms" / "sin calibrar ±30 ms" / "sin sincronía de cierre"). Para ser honestos: si el margen es menor que la incertidumbre combinada (unos 0.05 s en 1/8 y 0.10–0.20 s en 1/4 mientras no estén calibrados), el ticket dice "Demasiado cerrado para decidir (±X s)" en lugar de dar un ganador. Si un teléfono salió en otro turno, o no hay QR del otro, el ticket queda como pasada sola. Se guarda en el historial de A, junto a sus corridas, como un tipo "Race". Opcional: devolverlo a B por QR y guardarlo como imagen para compartirlo (sin botón de compartir automático, hay que preguntarle a Daniel, como pasó con la guía de instalación).

**Precision esperada:** Hay que separar tres cosas:
(1) JUSTICIA DE LA SALIDA (si las dos verdes se ven al mismo tiempo):
- Entre dos iPhone, ya calibrados con video: ±8–12 ms, casi todo por el cuadro de pantalla (±8 ms a 60 Hz).
- iPhone con Android sin calibrar: típico 15–30 ms, peor caso ~50 ms.
- Si la sincronía se hizo hace más de 10 min: se suman 5–30 ms de deriva, a menos que se haga la sincronía de cierre.
(2) RT DE CADA PILOTO: el inicio y el cruce del rollout dan ~10 ms en la simulación, pero no están validados con datos reales. A eso se suma un sesgo fijo por teléfono, la demora de pantalla (20–50 ms) más el retraso del sensor (~10–20 ms), que hace que el RT salga 30–60 ms "lento" hasta calibrarlo. Calibrado con video o con una boleta de semáforo real: ±15–25 ms. Al comparar a los dos pilotos sin calibrar: ±20–40 ms.
(3) ET Y VELOCIDAD: lo mismo que la app hoy. En la prueba real: 60 ft +0.003, 1/8 +0.137 y 1/4 +0.162 s contra la boleta antes de calibrar (retraso GPS/rollout). Cada teléfono tiene su propio sesgo, así que la diferencia entre carriles no se cancela del todo.
Conclusión honesta: el ganador es confiable cuando el margen es mayor a ~0.05 s en 1/8 o ~0.10–0.20 s en 1/4 hasta que exista "calibrar con boleta" por teléfono. Para carreras más cerradas, la app no debe declarar ganador. Un semáforo profesional mide al milisegundo; esto no lo va a igualar con teléfonos.

**Riesgos:**
- iPhone no corre nada en segundo plano. Si se bloquea la pantalla o se cambia de app entre la sincronía y la corrida, el reloj puede pausarse y la sincronía se pierde. Mitigación: wakeLock (en apps de inicio de iPhone confiable desde iOS 18.4), detección con Date.now vs performance.now y anular la sincronía.
- En iPhone, al usar el micrófono, el sonido puede salir por la bocina de llamadas y en voz baja, y el interruptor de silencio apaga Web Audio. Mitigación: teléfonos tocándose, pedir quitar el modo silencio, navigator.audioSession = 'play-and-record' (Safari 16.4+) y la palmada como respaldo, que no depende de la bocina.
- El retraso del micrófono en Android es variable y no se reporta bien: iPhone con Android puede quedar desfasado 10–30 ms sin calibración con video.
- Permisos en la app instalada en iPhone: micrófono, cámara y movimiento se pueden pedir de nuevo en cada apertura, y todos necesitan un toque del usuario. El flujo debe pedirlos en orden y explicar por qué.
- Cada pantalla tarda distinto en mostrar la imagen (20–50 ms según el modelo), y eso hace injusta la salida si no se mide y se compensa por teléfono.
- Sin confirmación de stage a distancia, los turnos dependen de que los pilotos se pongan de acuerdo con señas. Puede haber pasadas solas o turnos perdidos.
- Ruido del acelerómetro con el motor (~2 m/s²) y un soporte que vibra: el aviso de roja en vivo daría falsas alarmas. Por eso la roja oficial se decide al procesar.
- Leer el QR con la cámara bajo el sol o con la pantalla sucia; en iPhone no hay BarcodeDetector y hay que incluir jsQR, lo que hace crecer el index.html. Respaldo: código tecleado.
- La deriva de los relojes si pasan muchos minutos entre la sincronía y la carrera (burnouts largos, fila en los pits).
- El algoritmo y el rollout aún no están validados con suficientes datos reales: los sesgos de ET de cada teléfono pueden decidir carreras cerradas. Hace falta 'calibrar con boleta' primero.
- Riesgo de seguridad y de expectativas: no debe parecer un semáforo oficial ni usarse en vía pública. Dejarlo en beta con el aviso 'solo pista o lugar controlado'.
- El modo de medición actual (Medir) no debe cambiar: Daniel pidió que ahí la app no dé la salida. Race va en su propia sección.

**Pasos:**
1. 0. Guardar la idea ahora (lo que pidió Daniel): agregar en CLAUDE.md, en 'Pendiente / ideas acordadas', la entrada 'Race 1 vs 1 (beta)' con este diseño resumido (evento compartido por sonido, turnos con espera al azar sembrada, sin conexión durante la carrera, juntar por QR o código, ticket de dos carriles, límites de precisión). El aviso 'en desarrollo' de Medir ya existe en index.template.html. No programar hasta que Daniel lo pida.
2. 1. Prueba de sincronía sin autos (en casa o en el garage): un modo de prueba que, después de sincronizar, haga parpadear las dos pantallas 10 veces a horas planeadas. Se graba con un tercer teléfono en cámara lenta a 240 fps y se cuentan los cuadros de diferencia (±4 ms). Repetir a 1, 5 y 10 min de la sincronía, con iPhone+iPhone y con iPhone+Android, y con chirrido, palmada y golpe. Meta: ≤10 ms de promedio y ≤17 ms de máximo; si no se logra, este diseño no sirve.
3. 2. Medir el retraso de pantalla y de sensor de cada teléfono: en cámara lenta, filmar la pantalla con el árbol y la llanta del auto saliendo despacio en un estacionamiento. RT del video contra RT de la app → 'retraso de pantalla y sensor' por teléfono, guardado en Ajustes.
4. 3. Validar la reacción y la roja con un semáforo real (enlaza con 'Medir con el semáforo real' y con 'calibrar con boleta'): en el autódromo, con la boleta oficial, comparar el RT, la roja y el ET de la app, y ajustar rollout y retraso GPS por teléfono. Sin esto, el ticket no debe declarar ganadores cerrados.
5. 4. Construir en este orden: (a) emparejar con el código de 6 dígitos y la semilla; (b) sincronía por chirrido, con palmada y golpe de respaldo, con vencimiento, anulación y prueba de parpadeo; (c) árbol en turnos, reutilizando el de practica.js, con compensación de pantalla; (d) ligar la corrida al turno y calcular RT y roja con tRo de procesar(); (e) QR o código de resultado y lector jsQR; (f) ticket de dos carriles con calidad de sincronía y 'demasiado cerrado'; (g) sincronía de cierre opcional.
6. 5. Pruebas automáticas antes de publicar (como las actuales): simulación de dos teléfonos con desfase, deriva y retrasos de pantalla conocidos (extender simularSesion), que confirme que la app asigna bien el turno, la roja y el ganador; prueba de navegador con micrófono y cámara falsos para la sincronía y el QR; confirmar que Práctica y Medir no cambian (pt_test, uitest).
7. 6. Primera prueba real en un lugar controlado, con los dos autos: además de la app, filmar la salida desde atrás de la línea en cámara lenta, con las dos pantallas o los dos autos a la vista, para confirmar quién salió primero y la justicia de la salida. Daniel manda los zips de los dos teléfonos y los videos; se ajusta y luego se publica como beta.
8. 7. Futuro (no ahora): conexión en vivo (WebRTC con intercambio por QR, o app nativa con Bluetooth vía Capacitor) para confirmar stage y lanzar el árbol cuando los dos estén listos, y un receptor GNSS externo para mejorar el ET.
