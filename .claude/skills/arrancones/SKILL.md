---
name: arrancones
description: Conocimiento de arrancones de 1/4 y 1/8 de milla (drag racing). Explica cómo funcionan la pista y el cronometraje (stage, rollout, 60 ft, 330 ft, 1/8, 1000 ft, 1/4, trampa de velocidad), el semáforo o árbol (Pro .400, Full .500, luz roja, tiempo de reacción), cómo leer una boleta (timeslip), bracket racing (dial-in, breakout), la física y mecánica de una salida (tracción, transferencia de peso, 60 ft contra ET, potencia/peso), y el efecto del clima y la altitud (densidad de altitud). Úsala siempre que se hable de arrancones, cuarto o octavo de milla, boletas, ET, reacción, semáforo, burnout, two-step, transbrake, slicks, caballos y peso para estimar tiempos, o cuando haya que diseñar o revisar algo de Drag Tree que deba ser fiel a cómo se corre de verdad, aunque no digan "drag racing".
---

# Arrancones (1/4 y 1/8 de milla)

Esta skill reúne lo que hace falta para hablar de arrancones con precisión y para que lo que se
construya (por ejemplo la app Drag Tree) se comporte como la pista real. Habla en español claro,
con los términos que usan los corredores en México (boleta, árbol, stage, quemada/burnout, carril,
"salir en roja"); explica la jerga técnica la primera vez que aparezca.

## Lo esencial en una tabla

| Concepto | Valor | Nota |
|---|---|---|
| 1/4 de milla | 1320 ft = **402.336 m** | En México la boleta dice "402 m" |
| 1/8 de milla | 660 ft = **201.168 m** | "201 m" |
| Parciales | 60 ft (18.288 m), 330 ft (100.584 m), 1000 ft (304.8 m) | 330 y 1000 no siempre salen en la boleta |
| Trampa de velocidad | últimos **66 ft (20.117 m)** antes de cada meta | La "velocidad" de la boleta es el promedio en esa zona, no la de la línea |
| Pre-stage → stage | **7 in** | Fuente: NHRA |
| Stage → guard beam | **13 3/8 in** | Si el auto llega a ese haz antes de la verde, es luz roja |
| Rollout | distancia que avanza el auto desde que queda en stage hasta que deja libre el haz de stage | Con llantas comunes ~1 ft; depende de la llanta y de qué tan adentro hagas stage |
| Árbol Pro | 3 ámbar juntos, verde **0.400 s** después | Reacción perfecta en boleta: .400 (o .000 si la pista la resta) |
| Árbol Full / Sportsman | ámbar uno por uno cada 0.500 s, verde **0.500 s** después del último | Perfecta: .500 (o .000) |
| ET (tiempo transcurrido) | del momento en que el auto deja el haz de stage al cruce de la meta | **No incluye la reacción** |

## Cómo se mide en la pista (resumen)

1. El auto entra al **pre-stage** (se prenden los focos de pre-stage) y luego al **stage**: la llanta
   delantera tapa el haz de stage, justo en la línea de salida.
2. Con los dos carriles en stage, el sistema (normalmente arranque automático) baja el árbol.
3. El **reloj de reacción** corre desde el último ámbar (Full) o los ámbares (Pro) hasta que el auto
   deja libre el haz de stage. Salir antes de la verde = **luz roja**.
4. El **reloj de ET** arranca cuando el auto deja libre el haz de stage (después del rollout) y se
   para al cruzar el haz de la meta. Cada parcial es el tiempo desde ese mismo arranque.
5. La **velocidad** de cada meta = 66 ft ÷ tiempo entre el haz de trampa y el de la meta.

Consecuencia importante para cualquier medidor con GPS: el auto ya trae velocidad cuando arranca
el reloj de ET (rodó ~1 ft). Si un medidor cuenta desde el primer movimiento, sale ~0.2–0.4 s más
lento en todos los parciales. Por eso existe el ajuste de **rollout**.

## Cuándo leer las referencias

- `references/pista-y-boleta.md` — distancias, fotoceldas, rollout con detalle (stage profundo o
  superficial), cómo leer cada renglón de la boleta, por qué un GPS no da lo mismo que la pista,
  revisiones de coherencia de una boleta (relaciones 60 ft–1/8–1/4, velocidades).
- `references/semaforo-y-reaccion.md` — árbol Pro y Full, formatos de reacción (.400/.500 o .000),
  luz roja, reglas 1 vs 1, bracket (dial-in, breakout, ventaja en la salida, "holeshot"),
  técnica de stage y de reacción.
- `references/fisica-y-preparacion.md` — por qué el 60 ft manda, transferencia de peso, tracción,
  potencia contra peso, ayudas de salida (two-step, transbrake, convertidor), burnout, presión de
  llantas, cambios, aerodinámica; valores típicos de aceleración.
- `references/clima-y-estimaciones.md` — densidad de altitud (DA), correcciones, fórmulas para
  estimar ET y velocidad con peso y caballos (Hale, Fox, Huntington), conversiones 1/8 ↔ 1/4.
- `references/glosario.md` — términos en español e inglés.

Lee solo la que necesites. Si la pregunta es de la app Drag Tree (cómo mide, cómo calibrar,
cómo publicar), usa también las skills `dragtree-medicion`, `dragtree-datos-reales` y
`dragtree-publicar` si están disponibles.

## Cómo responder

- **Distingue lo oficial de lo empírico.** Las distancias de pista y los tiempos del árbol son
  reglamento (NHRA). Las "reglas de dedo" (0.1 s de 60 ft ≈ 0.15–0.2 s de ET, una décima por cada
  1000 ft de DA, fórmulas de caballos) son aproximaciones de foros y pruebas; dilo así y da rangos,
  no un número exacto.
- **Las reglas cambian por pista y asociación.** Formato de la reacción en boleta, retraso del
  arranque automático, reglas de bracket: si importa, sugiere confirmar con la pista. Las pistas de
  Daniel (Villa, El Charco, Chihuahua, Caldera, Monterrey) usan boleta con reacción desde el último
  ámbar (su RT de 0.622 es de ese tipo).
- **Usa sus unidades.** Daniel piensa en km/h, metros (201/402 m), libras y caballos. Convierte
  si hace falta: 1 mph = 1.609344 km/h; 1 ft = 0.3048 m; 1 lb = 0.4536 kg.
- **Seguridad.** No recomiendes quitar equipo de seguridad ni correr en la calle; si preguntan por
  potencia o nitro, menciona los requisitos de seguridad de la pista (jaula, arnés, paracaídas según
  el tiempo) como contexto, sin sermonear.

## Fuentes y qué tan seguro es cada dato

- Seguro (reglamento/geometría): 1320/660/60/330/1000 ft, trampa de 66 ft, pre-stage a stage 7 in,
  stage a guard beam 13 3/8 in (columna de Alan Reinhart en nhra.com), árbol Pro .400 y Full .500,
  ET sin reacción, luz roja al dejar el haz antes de la verde.
- Bastante seguro (fórmulas publicadas): Hale ET = 5.825·(lb/hp)^⅓, MPH = 234·(hp/lb)^⅓;
  Fox 6.269/230; Huntington 6.290/224.
- Aproximado (foros, experiencia): rollout ~11.5 in, 2:1 entre 60 ft y ET, efecto de la DA, factores
  1/8 → 1/4, retraso del arranque automático (alrededor de 1 s; se configura en cada pista).
