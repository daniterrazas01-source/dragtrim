# Race 1 vs 1 — notas de la plática con Daniel (solo ideas, sin programar)

Complementa `archivo/ideas/race_1vs1.md` (rama `claude/youthful-johnson-t02s8o`), que tiene el diseño
recomendado y las 3 propuestas originales. Aquí van las decisiones de Daniel y lo que cambian.
Todo son estimaciones: nada está probado con dos teléfonos.

## Lo que Daniel decidió (24 oct 2026)

- **Dónde:** autódromos y autódromos privados sin semáforo. En los dos hay **buena señal de celular**.
- **Teléfonos:** mezclados, iPhone y Android recientes.
- **Lo central:** un semáforo digital en cada auto. Cada quien lleva su teléfono en su carro; los dos
  se alinean, el árbol les da la salida **al mismo tiempo**, y la app mide reacción y tiempos de los
  dos, dice quién salió primero y quién dio roja.
- **Solo los dos teléfonos de los autos** (sin un tercer aparato como árbol central).
- **El resultado lo ven los dos teléfonos** (antes decía "ticket en un solo teléfono").

## Qué cambia en el diseño

1. **Se quita el modo sin señal** (golpes, chirrido, turnos cada 30 s). Con buena señal no hace falta,
   y simplifica mucho.
2. **Conexión en la línea:** un teléfono comparte su internet (hotspot) y el otro se conecta. Los
   autos están a 3–5 m, así que alcanza, y la conexión entre los dos es local y rápida: relojes
   juntos a ±1–5 ms (estimado). Con plan de datos, el hotspot del iPhone sí prende.
   - **Respaldo:** los dos por su señal de celular, pasando por un servicio de internet. Relojes a
     ±10–30 ms: la salida queda un poco menos pareja, pero el resultado sigue siendo justo (cada
     quien se mide contra su propia verde).
   - Durante la corrida no hace falta conexión; se reconecta al regresar.
3. **Alinear:** el teléfono **no puede ver la raya de salida** (el GPS se equivoca 3–5 m). Los focos
   de pre-stage y stage de la app significan "listo" y "quieto en la línea", no la posición. La
   alineación es con la raya pintada, conos o un ayudante, como hoy. Si uno queda un poco adelante,
   el resultado no cambia, porque cada auto mide sus 201/402 m desde donde arrancó (igual que cada
   carril en pista).
4. **Árbol con los dos carriles en cada teléfono**, como el real: ves cuándo el otro ya está en stage.
   - Pre-stage: los dos tocaron "Listo" (antes del burnout) y están conectados.
   - Stage: ese auto lleva ~2 s quieto (acelerómetro quieto y GPS en cero; 2 s y no 1 s porque el
     GPS llega con 0.5–1 s de retraso y cerca de cero marca 1–2 km/h).
   - Con los dos en stage: arranque automático tras una espera al azar (Práctica usa 0.6–1.5 s),
     Pro .400 o Full .500, igual que en Práctica.
   - Después de la verde la pantalla queda neutral (sin vibrar ni sonar).
5. **Roja:** se avisa al instante si el auto se mueve fuerte antes de la verde (como el foco rojo de la
   pista), pero la oficial se decide al procesar: el auto pasó el rollout antes de su verde. El aviso
   en vivo debe ser prudente porque la vibración del motor en two-step puede dar falsas rojas.
6. **Resultado en los dos teléfonos:** de cada carril, reacción (boleta y desde la verde), 60 ft,
   330 ft, 1/8 y velocidad, 1000 ft, 1/4 y velocidad. Además:
   - quién salió primero y por cuánto (diferencia de reacción);
   - quién ganó: gana quien llega primero (reacción + ET); roja pierde; con dos rojas pierde quien
     salió primero respecto a su verde. Si ganó con ET más lento, decir "holeshot";
   - margen de victoria y, si es menor que el error de la app, "empate técnico".
7. **Teléfonos mezclados = calibrar cada teléfono una vez** (y guardarlo por modelo):
   - **Verdes juntas:** los dos teléfonos lado a lado parpadeando a la misma hora, grabados en cámara
     lenta (240 fps en iPhone). Mide qué tanto tarda cada pantalla y se compensa. Meta: que la verde
     se prenda en los dos con menos de ~15 ms de diferencia (el ojo no lo nota).
   - **Dos teléfonos en el mismo auto:** 3–4 salidas con los dos teléfonos en un solo auto. Como los
     dos ven la misma salida y se mueven igual, cualquier diferencia de reacción o ET entre ellos es
     error de los teléfonos. Un solo auto, en un estacionamiento, sin boleta.
   - Android: basta con que sea de los últimos 3–4 años con Chrome al día; lo que importa es
     calibrar el modelo, no que sea nuevo.

## Idea de Daniel: una "sala" (24 oct 2026)

Para esta sección los dos teléfonos tendrán datos o Wi-Fi. Daniel propone **crear una sala** donde
se conectan el teléfono A y el B; la sala da la salida del semáforo y junta las mediciones. Le parece
más lógico que usar servicios de terceros.

Lo que hay que saber: una sala por internet siempre vive en una computadora prendida en algún lado
(un servidor). La app hoy es solo una página en GitHub Pages, y GitHub Pages no puede guardar una
sala. Hay dos lugares donde puede vivir la sala:

**A. La sala vive en el teléfono A** (nada de internet ni de terceros)
- B se conecta al hotspot de A y escanea dos QR en los pits (~10 s).
- Es la conexión más rápida: verdes más parejas (relojes a ±1–5 ms, estimado).
- Punto débil: si la conexión se cae, hay que volver a escanear los QR.
- Dato a favor: durante la carrera los dos autos van juntos (carriles vecinos, a pocos metros), así
  que puede que la conexión ni se caiga. Hay que probarlo.

**B. La sala vive en internet, en una cuenta de Daniel** (no en un servicio público compartido)
- Uno crea la sala y le sale un código corto (4–5 letras); el otro lo teclea. Sin QR.
- Si se cae la señal, se reconectan solos. Los resultados llegan aunque estén lejos.
- La sala hace de **juez de salida**: sabe cuándo están los dos en stage, elige la espera al azar y
  manda a los dos "la verde se prende a tal hora" con anticipación (≥0.5 s, dentro de la misma
  espera al azar). Cada teléfono la prende con su reloj, así que el retraso de la señal no importa;
  solo importa qué tan juntos estén los relojes: ±10–30 ms por celular (estimado). El piloto no lo
  nota y el resultado sigue siendo justo (cada quien contra su verde).
- La sala corre en computadoras de una empresa (como la app ya corre en GitHub), pero es **de Daniel**:
  su cuenta, su código, sin depender de servidores públicos de otros. Para unas cuantas carreras al
  día, los planes gratis deberían alcanzar (confirmarlo al elegir).
- Contras: hay que crear y cuidar esa cuenta; sin señal no hay sala.

**Recomendación (Daniel eligió la B, ver abajo):** empezar con la B (es la idea de Daniel tal cual: sala con código). Si la prueba con
cámara lenta muestra que las verdes no salen parejas, agregar después la conexión directa por
hotspot como mejora, usando la misma sala para encontrarse (sin QR).

Ideas extra que permite la sala (para después): ver la carrera desde un tercer teléfono (en la tribuna)
y varias rondas en la misma sala (mejor de 3, marcador).

## Decisión: sala en internet (opción B) — 24 oct 2026

Daniel eligió la B. Lo que quiere, en sus palabras: que funcione "como un autódromo normal". Te formas,
el juez (la sala) te da la salida, y al final, hagas el tiempo que hagas y te falle o no el carro, **los
dos teléfonos reciben la boleta con los dos carriles**: tu tiempo contra el de tu rival, quién ganó,
reacción y todo. Le preocupa que si un carro se adelanta muchos metros, se desconecte el hotspot.

Cómo se cumple:

1. **Sin hotspot: cada teléfono usa sus propios datos.** Así la distancia entre los carros no importa;
   cada uno habla con la sala por su lado. El hotspot queda solo como respaldo para la salida, si un
   teléfono no tiene señal en la línea (ver punto 4).
2. **La conexión solo es indispensable hasta la verde.** La sala manda la hora de la verde antes de
   que baje el árbol. Desde ahí cada teléfono mide solo, con su GPS y su acelerómetro, y guarda todo
   en el teléfono. Si se pierde la señal en el trayecto, no pasa nada: el resultado sube a la sala
   en cuanto vuelva la señal (lo reintenta solo).
3. **La boleta se arma en la sala** y se manda a los dos. Cada teléfono muestra su mitad en cuanto
   termina, con "esperando al otro carril…", y se completa sola cuando llega la otra mitad. Se
   guarda en el historial de los dos. Igual que la boleta de pista, que trae los dos carriles.
4. **Antes de la salida, la sala revisa** que los dos estén conectados, con relojes sincronizados,
   GPS y sensores bien, y en stage. Si falta algo, el árbol no baja (como cuando el juez detiene la
   salida).
   - Si a un teléfono se le va la señal justo en el último segundo, la sala cancela la salida. En el
     caso raro de que uno ya haya visto su árbol, la carrera se marca "repetir".
   - Respaldo si en la línea un teléfono no tiene datos: que se conecte al hotspot del otro solo
     para la salida. Si después el hotspot se cae por la distancia, no importa (punto 2).

Qué pasa en cada caso (propuesta de reglas, a confirmar con Daniel):

| Caso | Qué dice la boleta |
|---|---|
| Los dos terminan, sin roja | Gana quien llega primero (reacción + ET). "Holeshot" si ganó con ET más lento |
| Uno da roja | Pierde el de la roja, aunque el otro llegue después o no termine |
| Dos rojas | Pierde quien salió primero respecto a su verde |
| A un carro le falla y no llega a la meta | Se ven sus parciales (60 ft, 1/8…) y "no terminó"; gana el otro |
| Un carro no arranca | "No salió" (si no se mueve en ~10–15 s después de la verde); gana el otro |
| Ninguno llega a la meta | Botón **Alto** (ver abajo): "sin ganador", con los parciales de los dos |
| Un teléfono se apaga o se cierra la app | Boleta con "sin datos" en ese carril; se completa si los datos llegan después |

Ideas que salen de esto:
- En esta sección la app **ya sabe cuándo fue la verde**, así que puede aceptar salidas malas (un
  carro que patina o se ahoga) que en Medir se ignorarían por la regla de "50 km/h en 8 s". Tocaría el
  algoritmo: hacerlo con cuidado (dragcore.js y drag_procesar.m iguales, pruebas antes y después).
- **iPhone: la app tiene que quedar abierta y con la pantalla encendida** toda la carrera. Si se
  bloquea la pantalla o entra una llamada, el teléfono deja de medir. Pedir "No molestar" o un modo
  de concentración al correr, y avisarlo en pantalla.
- Dónde vive la sala: me inclino por un servicio donde la sala tenga su propio "juez" (un programa
  chico que decide la salida y arma la boleta), por ejemplo Cloudflare. Firebase (Google) está más
  pensado para guardar datos. Se decide en la prueba de conexión.

## Más decisiones de Daniel (24 oct 2026)

- **Botón "Alto"** para parar la medición cuando los dos carros fallan o quieren salirse. Así no hace
  falta regla para "ninguno llegó": la boleta dice "sin ganador" y muestra hasta dónde llegó cada uno.
  - Propuesta: Alto **antes de la verde** = "me salgo", cancela la salida de los dos sin falta. Alto
    **después de la verde** = "no terminó" en ese carril; si el otro termina, gana el otro.
  - Por seguridad, el Alto se toca ya detenido. Además la corrida se cierra sola si el carro se
    detiene (como ya hace Medir), para no tener que tocar el teléfono en movimiento.
- **Sin cronómetro para hacer stage**, "reglas de calle": si uno ya está alineado y el otro tarda, no
  importa. El árbol baja cuando los dos estén en stage al mismo tiempo, sin límite.
  - La sala espera los datos del otro carril sin límite mientras esté abierta (no hace falta que
    Daniel lo decida).
  - Como la espera puede ser larga, los relojes se siguen sincronizando todo el tiempo en la sala.
- **Por ahora solo "gana el que llega primero".** Bracket con dial más adelante; el diseño no lo debe
  impedir (en bracket el árbol de cada carril baja a distinta hora).
- **Moverse antes = falta y pierde automáticamente**, como en cualquier autódromo.
  - En cuanto un teléfono detecta la falta, los dos lo ven ("Falta: carril izquierdo").
  - El árbol del otro carril **sigue y baja normal**: el otro decide si corre. Gana de todos modos;
    si corre, la boleta trae sus tiempos.
  - Como la falta hace perder, una falta falsa (por la vibración del motor en two-step) arruina la
    carrera. El detector en vivo debe pedir un movimiento claro hacia adelante, no vibración. La
    boleta confirma con los datos completos (pasó el rollout antes de su verde).
  - Idea: probar el detector con los datos crudos de la primera prueba (zip del 11 oct, que trae el
    stage con el motor prendido) antes de salir a pista. Hace falta que Daniel mande ese zip (no está
    en el repo).

## Modo Solo: "yo solo en pista" (idea de Daniel, 24 oct 2026)

Lo mismo que el 1 vs 1, pero con un solo carro: la app da la salida con el árbol y mide la corrida.
Va aparte del 1 vs 1.

- **No es Medir.** Medir sigue neutral, sin luces (decisión 3 de CLAUDE.md), para cuando la pista
  tiene su semáforo. El modo Solo es para cuando no hay semáforo. Propuesta: la sección tiene dos
  opciones, **Solo** y **1 vs 1**.
- **No necesita internet ni sala.** El mismo teléfono prende la verde y mide, con el mismo reloj:
  no hay que sincronizar nada.
- Flujo: elegir árbol (Pro .400 / Full .500) y distancia (1/8 o 1/4) → stage → espera al azar →
  árbol → corrida → boleta.
- Boleta de un carril: reacción (boleta y desde la verde), 60 ft, 330 ft, 1/8 y velocidad, 1000 ft,
  1/4 y velocidad. Si se mueve antes de su verde: "ROJA", con sus tiempos de todos modos.
- Se guarda en el historial como las corridas de Medir, marcada "con árbol".
- **Recomendación: hacer el Solo primero.** Usa casi todas las piezas del 1 vs 1 (árbol en el
  soporte, stage, detector de falta, reacción con el carro real, salidas malas, boleta), menos la
  sala. Se prueba con un teléfono y un carro. Luego el 1 vs 1 solo agrega la sala encima.

## Hueco en el plan: el stage automático en la fila

El plan decía: tocar "Listo" antes del burnout y el stage es "carro quieto ~2 s". Problema: en el
autódromo el carro también se queda quieto en la fila y en la caja de agua antes del burnout. La app
creería que está en stage y bajaría el árbol ahí. En el 1 vs 1 pasa igual: los dos carros esperan
juntos en la fila.

Propuesta: **un toque grande de "Stage"** (toda la pantalla) ya parado en la línea. Después, el
teléfono confirma que el carro está quieto y baja el árbol tras la espera al azar (1 vs 1: cuando los
dos tocaron). Como el piloto necesita las manos para el two-step o el transbrake, un ajuste de
"tiempo para prepararte" (unos 3–5 s) antes de que empiece la espera al azar. Idea para probar
después: un botoncito Bluetooth en el volante (control de cámara), si el navegador lo puede leer.

## Decisión: cómo se hace el stage (24 oct 2026)

Como en la vida real: los carros ya están alineados en la línea. **Cada quien toca la pantalla de su
teléfono → se prende su pre-stage. 2–3 s después se prende su stage.** Cuando los dos tocaron, es como
si ya estuvieran en stage en la pista y empieza el semáforo normal. En Solo, igual con un carril.

Detalles propuestos (Daniel puede corregir):
- Stage a los **3 s** del toque (ajustable de 2 a 5 s en Ajustes). Es el tiempo para agarrar el
  volante y el two-step o el transbrake.
- Con los dos en stage, **espera al azar de 0.6–1.5 s** (como el arranque automático de pista y
  Práctica) y baja el árbol Pro o Full.
- Si el carro se mueve **en pre-stage** (antes de que prenda su stage): se apaga el pre-stage y toca
  otra vez, sin falta (como acomodarse en la pista). Si se mueve **con su stage prendido** y antes de
  su verde: falta.
- Si el carro no está quieto a los 3 s, el stage espera a que se quede quieto.
- Alto antes de la verde = "me salgo": se cancela la salida de los dos, sin falta, y vuelven a tocar
  (Daniel no lo objetó; queda así salvo que diga otra cosa).

## Pantallas paso a paso (propuesta, 24 oct 2026)

**Dónde va:** en Medir, arriba, "¿Quién da la salida?": [Semáforo de la pista] [Solo] [1 vs 1].
Por defecto "Semáforo de la pista", que es Medir como hoy, neutral. Así no hace falta una sexta pestaña
(ya hay Medir, Práctica, Calcular, Historial y Ajustes). Alternativa: pestaña nueva "Carrera".

### Solo
1. **Preparar:** árbol Pro/Full y distancia 1/8 o 1/4 (se recuerdan). Estado de GPS y acelerómetro,
   como hoy. Avisos: "Activa No molestar", "deja la app abierta", "pon el teléfono alto, donde lo
   veas sin bajar la vista". Botón **Ir a la línea** (arma la medición; el burnout se ignora).
2. **En la línea:** árbol grande apagado y "Toca la pantalla cuando estés alineado". Botón chico
   **Alto** en una esquina.
3. **Árbol:** toque → pre-stage → 3 s → stage → espera al azar → ámbar → verde. Brillo al máximo. Si
   sale antes: roja (sigue midiendo).
4. **Corrida:** después de la verde, pantalla neutral "Corrida en curso", sin vibrar ni sonar. Se
   cierra sola cuando el carro se detiene, o con Alto.
5. **Boleta:** reacción (boleta y desde la verde), 60 ft, 330 ft, 1/8 y velocidad, 1000 ft, 1/4 y
   velocidad; "ROJA" si hubo. Botones **Otra corrida** (vuelve al paso 2) y **Ver en historial**.

### 1 vs 1
1. **Entrar:** **Crear sala** o **Unirme**. Nombre del piloto y del carro (opcional, se recuerda).
2. **Crear:** el que crea elige árbol y distancia; le sale un código grande (p. ej. KR7PX) y
   "Esperando a tu rival…". **Unirme:** teclear el código.
3. **Sala:** los dos ven lo mismo:
   - carril izquierdo y derecho con nombres, botón **Cambiar de carril** (según dónde se formen);
   - árbol, distancia y número de ronda;
   - palomitas de cada teléfono: señal, GPS, sensores, relojes al tiempo.
   - Cada quien toca **Ir a la línea** cuando va a la fila. Se ve el estado del otro ("en la fila",
     "en la línea").
4. **En la línea:** árbol con los dos carriles en cada teléfono. Cada quien toca su pantalla cuando
   está alineado: su pre-stage se prende en los dos teléfonos y 3 s después su stage. Con los dos en
   stage: espera al azar y baja el árbol en los dos.
   - Falta de uno: su roja se ve en los dos teléfonos; el árbol del otro sigue y él decide si corre.
   - Se va la señal antes de la verde: "Sin señal del carril derecho, el árbol no baja". Vuelven a
     tocar cuando regrese.
   - Alto antes de la verde: se cancela la salida de los dos; vuelven a tocar.
5. **Corrida:** pantalla neutral "Corrida en curso". Nada del rival mientras corres.
6. **Boleta:** tu carril sale primero; el otro dice "esperando…" y se completa solo. Dos columnas,
   ganador marcado, margen, quién salió primero y por cuánto, "holeshot", faltas, "no terminó", "sin
   ganador". Botones **Otra ronda** (misma sala) y **Salir de la sala**. Se guarda en el historial
   de los dos.
7. **Historial:** las carreras se ven con los dos carriles; el zip de cada teléfono trae sus datos
   crudos más los datos de la carrera.

Ojo: un toque por error en la fila bajaría el árbol en Solo. Para eso está el Alto. En 1 vs 1 es menos
probable porque tienen que tocar los dos.

## Preguntas pendientes para Daniel

- ¿La sección va dentro de Medir ("¿Quién da la salida?") o en una pestaña nueva "Carrera"?
- ¿Marcador de rondas en la sala (p. ej. Daniel 2 – Juan 1) desde la primera versión, o después?
