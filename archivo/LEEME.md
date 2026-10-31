# Archivo de Drag Tree

Respaldo de los archivos originales de Daniel y de cada versión publicada de la app, para no
depender de una sesión o cuenta de Claude. El historial completo, cambio por cambio, también está
en git (`git log`); aquí queda a la vista y fácil de bajar.

## originales/

Archivos tal como Daniel los mandó, sin modificar.

| Archivo | Qué es | Cuándo |
|---|---|---|
| `ROOSTER_RACING.xlsx` | Calculadora de Excel (tiempos con peso, caballos y altitud) | 12 oct 2026 |
| `logo_rooster_racing.png` | Logo de Rooster Racing (el equipo de Daniel): R roja con flamas y el texto | 25 oct 2026 |
| `logo_rrg.png` | Logo RRG (Rooster Racing Garage) | 25 oct 2026 |
| `fondo_marcas_blanco_negro_sin_rooster.png` | Fondo Blanco y negro como lo hizo Daniel: la base del fondo "Gallos" (lo usa `fuente/fondos/logos_rooster.py`) | 25 oct 2026 |

El script original de MATLAB Mobile (v1) con el que empezó el proyecto se mandó en un chat
anterior que no quedó guardado aquí. Si se encuentra, va en esta carpeta.

## versiones/

Cada versión publicada de la app, en un solo archivo (`index.html` autocontenido de ese momento).
Para ver una versión vieja: descargar el archivo y abrirlo en el navegador.
**No instalarla en el teléfono ni usarla para medir**: comparte el almacenamiento con la app y
podría mezclar ajustes.

| Archivo | Versión | Commit | Qué trajo |
|---|---|---|---|
| `drag_beta_0.2.html` | beta 0.2 | d62f9e5 | Primera app web instalable (GPS + acelerómetro, algoritmo v2.3) |
| `drag_beta_0.3.html` | beta 0.3 | afe23e1 | Pestaña Práctica: simulador de semáforo, solo y 1 vs 1 |
| `drag_beta_0.3.1.html` | beta 0.3.1 | 85f5329 | Reacción en formato boleta (.400/.500) y desde la verde |
| `drag_beta_0.3.2.html` | beta 0.3.2 | d7db1da | Animaciones en la interfaz |
| `drag_beta_0.4.html` | beta 0.4 | 093a6f2 | Fondos de pantalla estilo sticker |
| `drag_beta_0.5.html` | beta 0.5 | 090b946 | Calculadora Rooster Racing (pestaña Calcular) |
| `drag_beta_0.5.1.html` | beta 0.5.1 | 2a5ec18 | Nombre nuevo: Drag Tree |
| `drag_beta_0.5.2.html` | beta 0.5.2 | 702fe15 | Guía para instalar en iPhone, iPad y Android; calculadora con 1320 lb y 308 hp |
| `drag_beta_0.5.3.html` | beta 0.5.3 | 7444dbc | Práctica: logos del fondo se prenden verde/rojo según la reacción, al soltar |
| `drag_beta_0.6.html` | beta 0.6 | 44c4884 | Medir con el semáforo real (cámara, beta); tarjeta Race 1 vs 1 en desarrollo; página de prueba de la cámara |
| `drag_beta_0.6.1.html` | beta 0.6.1 | 2118f28 | El semáforo con cámara vuelve a "en desarrollo" (oculto; `?camdev` lo muestra) |
| `drag_beta_0.6.2.html` | beta 0.6.2 | fdba3eb | Semáforo con cámara fuera de la app; fondo Gallos (Rooster Racing); letra tipo Rooster Racing; Práctica más compacta; contenido también junto al notch; deslizar entre pestañas |
| `drag_beta_0.6.3.html` | beta 0.6.3 | dd83a4b | Logo nuevo (DRAG / árbol como T + REE, "On the mark") en la barra de arriba y en el ícono |
| `drag_0.6.4.html` | 0.6.4 | 2209032 | Pantalla de carga (logo + "By Rooster Racing", 2 s); "On the mark" en la barra; sin la etiqueta "beta" |
| `drag_0.6.5.html` | 0.6.5 | ff1c732 | "By" a la izquierda en la pantalla de carga; Calcular sin la nota de "buena salida"; Race 1 vs 1 desplegable |
| `drag_0.6.6.html` | 0.6.6 | 3c8ebfe | Práctica con "Tocar" en tres toques: pre-stage, stage y salida |
| `drag_0.6.7.html` | 0.6.7 | 0f766e1 | En Android (Samsung) la franja de la hora y la cámara toma el color de lo que hay debajo |
| `drag_0.7.html` | 0.7 | 430f8f9 | Race 1 vs 1: sala por internet con código (o QR por Wi-Fi), árbol en los dos teléfonos y boleta de los dos carriles; atajos de Medir como semáforo (0.6.8) |

El código fuente editable de cada versión está en `fuente/` de ese commit:
`git checkout <commit>` o, en GitHub, "Browse files" en el commit.

## ideas/

Diseños e investigaciones guardados para no repetirlos.

| Archivo | Qué es |
|---|---|
| `race_1vs1.md` | Diseño de "Race 1 vs 1" (dos teléfonos; la app da la salida a los dos). Sin programar. |
| `semaforo_real/plan.md` | Especificación de "Medir con el semáforo real" (cámara que lee el árbol) |
| `semaforo_real/informe_*.md`, `reporte_simulador.md` | Investigación: pista, algoritmo, plataforma (navegador y teléfono), integración, simulador |
| `semaforo_real/resultados_mc.txt` | Salida aceptada de `semaforo_mc.js rapido` (base para `--base`) |
| `semaforo_real/resultados_reaccion.txt` | Salida aceptada de `reaccion.js` |

## Al publicar una versión nueva

Agregar aquí su copia: `git show <commit>:index.html > archivo/versiones/drag_X.html` (hasta la 0.6.3 se llamaban drag_beta_X)
y su renglón en la tabla.
