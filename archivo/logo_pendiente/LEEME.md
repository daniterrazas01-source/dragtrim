# Logo de Drag Tree (pendiente)

Borradores del logo, guardados para retomarlos después (Daniel lo dejó para otro momento, 23 oct 2026).
La app sigue con su logo de siempre; nada de esto está en uso.

- `referencias/bosquejo_daniel.jpg`: su bosquejo ("Drag" de grande a chico con rayitas, "Tree" vertical, árbol en T).
- `referencias/foto_calcomania.jpg`: foto de la calcomanía original de "Drag Tree" que quiere usar por nostalgia
  (sin la franja "Track Service"; con "On your mark" en cursiva; letras blancas con contorno, luces ámbar/verde/roja).
- `v1` fiel al bosquejo, `v2` refinada, `v3` estilo sticker, `v4` redibujo de la calcomanía.
  Cada una: `icono.svg` (1024×1024), `encabezado.svg` (44 px de alto) y `icono_512.png`.

Comentario de Daniel sobre v4: "el logo es diferente al que me diste" — no se parece lo suficiente a la
calcomanía; al retomar, preguntarle qué partes no coinciden.

## v5 (26 oct 2026, Daniel retomó el logo)

- `referencias/drag_racing_marcado_v5.jpg`: la imagen que mandó (logo "Drag [árbol] Racing" con "Racing" tachado y su
  dibujo encima): usar esa letra, "DRAG" arriba de "TREE" y el árbol de salidas como la T; agregar R, E, E.
- `v5/hacer_logo.py` arma los SVG: letra **Inter Black Italic** (OFL, la más parecida a la de su imagen; las letras van
  como trazos, no hace falta la letra), el árbol se dibuja igual que el de su imagen (2 barras con foquitos + 4 filas de
  focos) con barras y poste inclinados como la letra (9.4°) y focos redondos.
  - `logo_a.svg`: como su dibujo (DRAG arriba de REE, árbol largo que baja como la T).
  - `logo_b.svg`: igual con "Drag" / "ree" en minúsculas como en su imagen.
  - `logo_c.svg`: compacto, DRAG a todo lo ancho (pensado para el encabezado de la app).
  - `*_blanco.svg` para fondo oscuro; `hoja_claro.png` / `hoja_oscuro.png` las tres juntas.
- **Daniel eligió la C** (26 oct) con dos cambios → `logo_c2.svg` / `logo_c2_blanco.svg` (`hoja_c2.png`): el árbol
  inclinado al lado contrario de la letra y con colores: foquitos del pre-stage y del stage amarillos, dos filas ámbar,
  verde y rojo (cada foco con un aro del color del árbol, como su caja). REE se separa lo justo para no chocar con
  ningún foco (`derecha()` en hacer_logo.py). Colores en COLORES.
- **C3** (26 oct, Daniel): pre-stage y stage en **una sola barra** (con sus 4 foquitos amarillos adentro) para que el
  árbol sea la T; poste más grueso (0.16 C). En fondo oscuro TREE (árbol + REE) va **negro con contorno blanco delgado**
  (0.02 C; el contorno rodea la figura completa: `capas()`), DRAG blanco. `logo_c3.svg` (claro), `logo_c3_oscuro.svg`,
  `logo_c3_encabezado.svg` (contorno 0.06 C para que a 60 px de alto se vea de ~1 px), `hoja_c3.png`.
- **C4** (26 oct, Daniel): la T **más grande** (×1.22 en anchos y focos), **inclinada como la letra** otra vez y con
  **tres ámbar** + verde + rojo (5 filas; el poste baja lo justo). `logo_c4.svg`, `logo_c4_oscuro.svg`,
  `logo_c4_encabezado.svg`, `hoja_c4.png`. Si "otro foco amarillo" eran los foquitos de la barra (3 por lado), se cambia
  en `arbol()` (la lista de dx de la barra).
- **C5** (26 oct, dibujo de Daniel sobre la C4): la T **sube 0.32 C** y su barra se monta un poco sobre la D y la R
  (TREE va encima de DRAG; en fondo claro el contorno blanco la separa); **R, E, E más largas hacia abajo** hasta casi el
  pie del árbol (se estiran a lo alto ×~1.6 sin cambiar la inclinación: `matrix` en `logo_c5()`); **contorno más grueso**
  (0.035 C; encabezado 0.08 C). `logo_c5.svg`, `logo_c5_oscuro.svg`, `logo_c5_encabezado.svg`, `hoja_c5.png`.
- **C6** (26 oct, Daniel): DRAG con la forma de la letra **"Full Pack 2025"** (imagex, dafont;
  `referencias/letra_full_pack_2025.jpg`) pero **inclinada hacia atrás** (ATRAS = 20°) y en blanco (negro en fondo claro).
  Esa letra es gratis solo para uso personal, así que **no se usa su archivo**: D, R, A, G están dibujadas a mano en
  `_letras_bloque()` (bloques con huecos angostos y esquinas cortadas). Si Daniel consigue la licencia comercial, se
  podría usar la letra real. `logo_c6.svg`, `logo_c6_oscuro.svg`, `logo_c6_encabezado.svg`, `hoja_c6.png`.
- **C7** (26 oct, Daniel): R, E, E con la forma de **"Platinum Sign Over"** (imagex, dafont, solo uso personal:
  `referencias/letra_platinum_sign.jpg`), dibujadas a mano en `ree_cuadrada()` **directo a lo alto** que ya tenían (no se
  estiran: esquinas a 45° y gruesos parejos), mismo ancho total que antes y la inclinación de la T (9.4°). R con pata
  diagonal y esquina cortada arriba a la derecha; E con esquina cortada arriba a la izquierda. TREE sigue negro con
  contorno blanco. `logo_c7.svg`, `logo_c7_oscuro.svg`, `logo_c7_encabezado.svg`, `hoja_c7.png`.
- Falta: que Daniel lo apruebe; luego pasarlo al encabezado y a los íconos de la app.

