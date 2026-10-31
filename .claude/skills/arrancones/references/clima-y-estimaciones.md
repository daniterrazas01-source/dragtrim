# Clima, altitud y cómo estimar tiempos

## Contenido
1. Densidad de altitud (DA)
2. Cuánto afecta
3. Fórmulas para estimar ET y velocidad
4. 1/8 ↔ 1/4
5. Lo que hace la calculadora Rooster Racing de Drag Tree

## 1. Densidad de altitud (DA)

Es la altitud "como la siente el motor": combina presión, temperatura y humedad en una sola cifra.
Aire caliente, húmedo o con poca presión = DA más alta = menos oxígeno = menos potencia.

- Atmósfera estándar: al nivel del mar 15 °C y 1013.25 hPa; la temperatura estándar baja ~2 °C por
  cada 1000 ft (0.0019812 °C/ft).
- Aproximación de la hoja de Daniel: DA ≈ (T − (15 − 0.002·alt))·120 + alt (en ft y °C), y luego
  multiplicaba por 1.075. La app calcula la DA real con presión, temperatura y humedad (Open-Meteo).
- Las pistas de Daniel están altas: Villa 5100 ft, El Charco 5600, Chihuahua 4900, Caldera 4100,
  Monterrey 1440. A 5100 ft y 20 °C la DA real (aire seco, presión estándar) es ~6800 ft.

## 2. Cuánto afecta

- **Motor atmosférico**: pierde aproximadamente 3 % de potencia por cada 1000 ft de DA (lo que usa la
  app; varía con el motor). Regla de foros: ~0.08–0.10 s de ET en el 1/4 por cada 1000 ft para autos
  rápidos; en autos de 13–15 s puede ser más (la tabla de corrección de NHRA da ~1.3 % del ET por cada
  1000 ft cerca de esas altitudes).
- **Turbo / supercargador**: pierde menos, porque el compresor recupera presión (hasta su límite).
- **Tracción**: la temperatura de la pista importa tanto como la del aire; pista muy fría o muy
  caliente agarra menos.
- Para comparar corridas de días distintos, anota hora, temperatura y DA junto a cada boleta.

## 3. Fórmulas para estimar ET y velocidad (1/4 de milla)

Todas tienen la forma ET = C·(lb/hp)^⅓ y MPH = K·(hp/lb)^⅓ (peso con piloto, en libras):

| Autor | C (ET) | K (MPH) | Comentario |
|---|---|---|---|
| Hale | 5.825 | 234 | La que usa la app (con potencia en la llanta, whp). Optimista para autos de calle |
| Fox | 6.269 | 230 | Más reciente que Huntington |
| Huntington | 6.290 | 224 | La más vieja; con potencia del motor |

Ojo: el comentario de `rooster.js` dice "Hale/Huntington" pero 5.825/234 son las constantes de Hale.

Son estimaciones: suponen buena tracción y cambios bien hechos. Sirven para "¿cuánto debería correr?"
y para detectar si algo anda mal, no para comprobar una boleta.

Ejemplo (valores de inicio de la app): 1320 lb, 308 hp → whp = 308·0.86 = 265 (a nivel del mar) →
Hale: ET = 5.825·(1320/265)^⅓ ≈ 9.95 s; MPH = 234·(265/1320)^⅓ ≈ 137 mph. A DA 6000 ft queda
whp ≈ 265·0.82 ≈ 217 → ET ≈ 10.6 s.

## 4. 1/8 ↔ 1/4

- ET 1/4 ≈ ET 1/8 × 1.55–1.60 (la app usa 1.565).
- Velocidad 1/4 ≈ velocidad 1/8 × 1.24–1.30 (la app usa 1.27).
- 60 ft ≈ 0.145 × ET 1/4 en autos con buena salida (la app).
Son promedios; autos con turbo o nitro que entra tarde tienen mejor segunda mitad.

## 5. Lo que hace la calculadora Rooster Racing

Está detallado en CLAUDE.md (punto 9). En resumen: whp = hp·0.86·(1 − 0.03·DA/1000) (+ nitro ya en
la llanta; turbo con la presión de la tabla a la DA), Hale para el 1/4, y los factores de arriba para
1/8 y 60 ft. `Rooster.hoja()` reproduce el Excel celda por celda (`fuente/pruebas/calc.js`). Cualquier
cambio de fórmula debe pasar `node calc.js` y Daniel debe confirmarlo.
