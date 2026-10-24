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

## Preguntas pendientes para Daniel

- ¿Está bien usar un servicio gratis de internet (de otra empresa) para conectar los teléfonos y
  mandar resultados? Solo sería el respaldo, o para emparejar con un código corto en lugar de dos QR.
- ¿Solo "gana quien llega primero" o también bracket con dial-in más adelante?
- Si alguien se mueve en stage antes de que baje el árbol: ¿se cancela la salida (como en pista, donde
  se apaga el stage y no baja el árbol) o es roja (como en Práctica)?
- ¿Tiempo límite para hacer stage, como el arranque automático de pista (si uno ya está en stage y el
  otro no llega en X s)?
