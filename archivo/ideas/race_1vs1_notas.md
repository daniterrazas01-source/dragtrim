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
| Ninguno llega a la meta | Pendiente: ¿sin ganador, o el que iba adelante en la última marca que pasaron los dos? |
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

## Preguntas pendientes para Daniel

- Si ninguno de los dos llega a la meta, ¿quién gana?
- ¿Cuánto tiempo guarda la sala una carrera esperando los datos del otro? (propuesta: todo el día)
- ¿Solo "gana quien llega primero" o también bracket con dial-in más adelante?
- Si alguien se mueve en stage antes de que baje el árbol: ¿se cancela la salida (como en pista, donde
  se apaga el stage y no baja el árbol) o es roja (como en Práctica)?
- ¿Tiempo límite para hacer stage, como el arranque automático de pista (si uno ya está en stage y el
  otro no llega en X s)?
