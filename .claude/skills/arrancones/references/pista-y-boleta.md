# La pista, el cronometraje y la boleta

## Contenido
1. Distancias y fotoceldas
2. Stage y rollout (con detalle)
3. Cómo leer una boleta
4. Revisar si una boleta es coherente
5. Por qué un medidor con GPS no da lo mismo que la pista

## 1. Distancias y fotoceldas

| Haz | Desde la línea de salida | Metros | Para qué |
|---|---|---|---|
| Pre-stage | 7 in antes del stage | — | Aviso: "ya casi" |
| Stage | 0 (línea de salida) | 0 | Reacción y arranque del ET |
| Guard beam | 13 3/8 in después del stage | 0.34 m | Evita hacer stage demasiado adentro (luz roja) |
| 60 ft | 60 ft | 18.288 | Calidad de la salida |
| 330 ft | 330 ft | 100.584 | Parcial |
| Trampa 1/8 | 594 ft | 181.05 | Inicio de la trampa de 1/8 |
| 1/8 (meta en pistas de 1/8) | 660 ft | 201.168 | ET y velocidad de 1/8 |
| 1000 ft | 1000 ft | 304.8 | Parcial (en Top Fuel/Funny Car es la meta) |
| Trampa 1/4 | 1254 ft | 382.22 | Inicio de la trampa de 1/4 |
| 1/4 | 1320 ft | 402.336 | ET y velocidad de 1/4 |

Cada haz es una fotocelda de lado a lado del carril, a pocas pulgadas del piso; se dispara cuando la
llanta delantera la tapa (en la meta, la primera parte del auto que la corta).

## 2. Stage y rollout

- **Stage superficial (shallow)**: el piloto se detiene en cuanto se prende el foco de stage. La
  llanta apenas tapa el haz. Tiene que rodar más para destaparlo → **más rollout** → la reacción sale
  más lenta (más tiempo antes de destapar el haz) pero el **ET sale más rápido** (el reloj arranca con
  el auto ya rodando).
- **Stage profundo (deep)**: rueda unas pulgadas más (en algunas clases se apaga el foco de pre-stage).
  **Menos rollout** → reacción más rápida, ET más lento, más riesgo de roja. No puede llegar al guard beam.
- **Geometría**: la llanta tapa el haz mientras su silueta cruza la altura del haz. Con radio de
  llanta R y altura del haz h, el tramo tapado mide 2·√(2Rh − h²). Llanta más grande o haz más alto →
  más rollout. Valor común que se cita: ~11.5 in (foros, no reglamento). Por eso los medidores de GPS
  (Dragy, RaceBox, Drag Tree) ofrecen "rollout 1 ft".
- **Cuánto pesa en el tiempo**: desde reposo, el primer pie se lleva una buena parte del tiempo
  porque el auto va lentísimo. Con aceleración constante a: t = √(2·0.3048/a) → 0.35 s a 0.5 g,
  0.25 s a 1 g (más en la realidad, porque la tracción entra poco a poco). En el simulador de
  Drag Tree, pasar de rollout 0.5 ft a 1.0 ft cambia todos los parciales ~0.1 s. **El rollout es
  la perilla más importante para empatar una boleta.**

## 3. Cómo leer una boleta

Renglones típicos (el orden y los nombres varían):

| Renglón | Qué es |
|---|---|
| Carril (L/R, izq/der) | Carril de la corrida |
| Dial | Tiempo que el piloto marcó (solo bracket) |
| R/T (reacción) | Desde el último ámbar (o desde la verde si la pista lo resta) hasta destapar el stage |
| 60' | Tiempo del stage al haz de 60 ft (no incluye reacción) |
| 330' | Parcial a 330 ft |
| 1/8 ET y MPH (o km/h) | Tiempo a 660 ft y velocidad de trampa (594–660 ft) |
| 1000' | Parcial |
| 1/4 ET y MPH | Tiempo a 1320 ft y velocidad de trampa (1254–1320 ft) |
| Margen de victoria | Diferencia con el rival en la meta (incluye reacción) |

Ejemplo real de Daniel (11 oct 2026, rollout de la app 0.5 ft): RT 0.622 · 60 ft 2.650 ·
201 m 9.339 @ 132.40 km/h · 402 m 14.043 @ 181.71 km/h.

## 4. Revisar si una boleta es coherente

Antes de calibrar algo contra una boleta, revisa que los números tengan sentido entre sí:

- **ET 1/4 ÷ ET 1/8** suele estar entre ~1.55 y ~1.60 (la calculadora de la app usa 1.565).
  Menos de 1.52 o más de 1.65 pide una explicación (cambio de velocidad fallado, se levantó el pie, nitro
  que entra tarde…).
- **Velocidad 1/4 ÷ velocidad 1/8** suele estar entre ~1.24 y ~1.30 (la app usa 1.27).
- **60 ft ÷ ET 1/4** suele andar en 0.13–0.16; un 60 ft muy lento para el ET indica patinada.
- **Velocidad contra tiempo**: con aceleración que va bajando, la velocidad de la meta debe ser menor
  que 2 × distancia ÷ ET (la que tendría con aceleración constante).

La primera boleta de Daniel falla dos de estas: 14.043/9.339 = 1.50 y 181.71/132.40 = 1.37. Su GPS
(Doppler y posición) dijo ~166–169 km/h en la meta, lo que da 1.26, normal. Hipótesis abiertas: error
de la trampa de 1/4 en esa pista o carril, o se anotó mal. **No ajustes la app para empatar esa
velocidad** hasta tener más boletas.

## 5. Por qué un medidor con GPS no da lo mismo que la pista

| Causa | Efecto típico | Qué hacer |
|---|---|---|
| Rollout distinto al real | Todos los parciales corridos por igual (décimas) | Calibrar el rollout con varias boletas |
| Retraso del GPS del teléfono (0.3–1 s) | Errores que crecen con la distancia | Estimarlo o calibrarlo |
| GPS a 1 Hz | Pocos puntos; sin acelerómetro los errores son de décimas | Fusión con el acelerómetro; GNSS externo 10–25 Hz |
| Velocidad de trampa contra velocidad en la línea | La de la línea es ~1–2 % mayor | Compara contra la de trampa (66 ft) |
| Stage profundo o superficial | Cambia el rollout real de esa corrida | Pedir al piloto que haga stage siempre igual |
| Pendiente de la pista | Pequeño, ~ms | El algoritmo lo absorbe |
| Teléfono que se mueve en el soporte | Ruido y eje mal estimado | Soporte firme, siempre en el mismo lugar |
