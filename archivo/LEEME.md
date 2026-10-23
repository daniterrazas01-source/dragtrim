# Archivo de Drag Tree

Respaldo de los archivos originales de Daniel y de cada versión publicada de la app, para no
depender de una sesión o cuenta de Claude. El historial completo, cambio por cambio, también está
en git (`git log`); aquí queda a la vista y fácil de bajar.

## originales/

Archivos tal como Daniel los mandó, sin modificar.

| Archivo | Qué es | Cuándo |
|---|---|---|
| `ROOSTER_RACING.xlsx` | Calculadora de Excel (tiempos con peso, caballos y altitud) | 12 oct 2026 |

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
| `drag_beta_0.5.2.html` | beta 0.5.2 | (este commit) | Guía para instalar en iPhone, iPad y Android; calculadora con 1320 lb y 308 hp |

El código fuente editable de cada versión está en `fuente/` de ese commit:
`git checkout <commit>` o, en GitHub, "Browse files" en el commit.

## Al publicar una versión nueva

Agregar aquí su copia: `git show <commit>:index.html > archivo/versiones/drag_beta_X.html`
y su renglón en la tabla.
