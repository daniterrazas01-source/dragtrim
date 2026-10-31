# Física de una corrida y preparación del auto

## Contenido
1. Las fases de una corrida
2. Tracción y transferencia de peso
3. Potencia contra peso
4. 60 ft contra ET
5. Ayudas de salida, burnout y llantas
6. Números típicos (para revisar si un dato tiene sentido)

## 1. Las fases de una corrida

1. **Salida (0–60 ft)**: limitada por **tracción**. La aceleración sube en décimas de segundo
   (la llanta se deforma, la suspensión se asienta, entra el convertidor/clutch) y llega a su pico.
   Autos de calle: 0.5–0.9 g; con slicks y buena preparación 1–1.5 g; los de Daniel marcaron un pico
   de ~1.8 g en el acelerómetro del teléfono (el soporte vibra: los picos se exageran).
2. **Medio (60–660 ft)**: pasa a estar limitada por **potencia**; cada cambio de velocidad es un hueco
   de aceleración de 0.1–0.3 s.
3. **Final (660–1320 ft)**: la resistencia del aire crece con v²; la aceleración baja mucho. A 160+
   km/h la aerodinámica se come buena parte de la potencia.

Relación útil: la distancia es la integral de la velocidad y la velocidad la de la aceleración; por
eso una salida mejor (más velocidad temprano) se paga en todos los parciales siguientes.

## 2. Tracción y transferencia de peso

Al acelerar, el peso se pasa a las llantas traseras: ΔW = W · (a/g) · (h/L), con h = altura del centro
de gravedad y L = distancia entre ejes. Más carga atrás = más agarre (en tracción trasera). Por eso:

- Suspensión que "se sienta" (squat) y levanta el frente ayuda a cargar las traseras.
- Barras anti-wheelie limitan cuánto se levanta el frente.
- La inclinación del auto (pitch) al arrancar también inclina el teléfono: el acelerómetro ve un poco
  de gravedad como si fuera aceleración. Drag Tree lo corrige con el término de "escala" del modelo.

Patinar al salir se ve en la boleta como **60 ft lento** y en el acelerómetro como un pico bajo o con
caídas.

## 3. Potencia contra peso

ET y velocidad dependen sobre todo de la relación peso/potencia (lb/hp), con raíz cúbica (ver
`clima-y-estimaciones.md`). Para bajar el ET un 10 % hay que mejorar la relación ~27 % (0.9³ ≈ 0.73).
Quitar 100 lb a un auto de 3000 lb es como ganar ~3.3 % de potencia.

La **velocidad de trampa** refleja la potencia mejor que el ET (le afecta menos la salida). Si el ET
mejora y la velocidad no, la mejora vino de la salida; si la velocidad sube y el ET no, el auto tiene
más potencia pero no la está poniendo en el piso.

## 4. 60 ft contra ET

Regla de dedo de foros y corredores: **0.1 s menos en el 60 ft ≈ 0.15–0.2 s menos en el 1/4**
(algunos dicen 2:1), siempre que el auto no patine después. En 1/8 el efecto es ~0.12–0.15 s.
El 60 ft es donde más se gana con técnica (presión de llantas, rpm de salida, suspensión).

## 5. Ayudas de salida, burnout y llantas

- **Burnout (quemada)**: calienta y limpia las llantas para que agarren. Después se hace stage.
  Drag Tree ignora el burnout, la salida del burnout y el stage gracias a su regla de arranque.
- **Line lock**: frena solo las delanteras para el burnout.
- **Two-step / launch control**: limita rpm en la salida para repetir siempre igual.
- **Transbrake**: sostiene el auto con la transmisión; se suelta con un botón.
- **Convertidor de par (stall)**: deja subir rpm en la salida con caja automática.
- **Llantas**: slicks (pista), drag radials (calle/pista). Menos presión = más huella (con límite
  de seguridad); la presión se ajusta en pasos chicos y anotando la boleta.
- **Nitro (shot)**: se mide en "caballos de shot"; a la calculadora se le suma ya en la llanta.
- **Turbo**: tarda en llenar (spool); con two-step se puede salir con presión.

## 6. Números típicos

| Dato | Rango normal | Si sale fuera… |
|---|---|---|
| Pico de aceleración, calle | 0.5–0.9 g | ¿Soporte del teléfono vibrando? ¿Eje mal? |
| Pico con slicks | 1.0–1.5 g (más en autos de competencia) | — |
| 60 ft, auto de calle | 2.0–2.5 s | >2.6 s: patinó o salida suave |
| 60 ft, auto preparado | 1.3–1.8 s | — |
| Tiempo al rollout (del primer movimiento a 1 ft) | 0.2–0.4 s | Explica por qué el rollout cambia tanto el ET |
| Velocidad en 1/8 ÷ en 1/4 | ~0.77–0.81 | Ver revisión de coherencia de la boleta |
