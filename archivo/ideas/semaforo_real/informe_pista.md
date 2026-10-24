# Investigación: el árbol real y sus reglas, para "Medir con el semáforo real"

Sobre las fuentes: en este contenedor el proxy bloquea WebFetch y curl (403 o error de DNS). Por eso todo lo de abajo viene de los extractos de WebSearch. Lo marcado **(foro)** o **(inferencia)** es menos seguro. Las cifras críticas hay que confirmarlas con un video del árbol de la pista de Daniel.

## 0. Resumen
1. **El fin de la RT se ve en el árbol.** La boleta mide desde el último ámbar (Full) o desde los ámbar (Pro) hasta que la llanta delantera libera el haz de stage. El ET arranca en ese mismo instante. En el árbol se ve así: **el foco de stage de tu carril se apaga** ([manual PortaTree](https://www.manualsdir.com/manuals/407314/portatree-accurate-drag-race-starting-line.html), [guía PortaTree](https://portatree.com/media/ecom/html/pdf/Instruct-StartLine.pdf)). La cámara puede medir la RT completa con dos eventos del mismo árbol, en el mismo reloj. Así el retraso de la cámara se cancela.
2. **El intervalo ámbar→verde no siempre es exacto.** NHRA usó **.370** en el árbol Pro (una compensación de .03 por los LED) y lo regresó a .400 en 2022, pero solo en S/Comp, Gas y Street ([DRAO 2022](https://dragracingactiononline.com/2022/03/making-things-easier/)). Un árbol Accutime se puso en .370 y se habló de pasarlo a .350 ([CompetitionPlus](https://competitionplus.com/nhra-racers-adjust-to-accutime-differences-at-michigan/)). **Hay que medirlo en el video, no suponerlo.**
3. **En handicap, cada carril tiene su propio reloj.** La columna del rival puede prenderse antes o después. Si la app lee la columna equivocada, el error es igual a la diferencia de handicap.
4. **La roja no sirve como referencia de tiempo.** Con TruSTART se muestra la verde y la roja aparece después ([Wikipedia bracket](https://en.wikipedia.org/wiki/Bracket_racing), [Dragzine](https://www.dragzine.com/news/overdue-compulink-reveals-worst-red-system-for-bracket-racers/)).
5. **Tiempo de encendido:** LED ≈1 ms, incandescente ≥16 ms ([patente Daktronics US6695460](https://patents.google.com/patent/US6695460)). Hay árboles mixtos.
6. **Geometría:** el árbol está a ~12.2 m del guard beam, con el ámbar superior a 2.13–2.21 m de altura ([FIA](https://www.fia.com/sites/default/files/2023_fia_drag_racing_-_race_procedures_-_en_marked_up.pdf)). Desde el parabrisas queda a ~14–15 m, 14–22° hacia un lado y 1–5° arriba del horizonte.
7. **La delay box no lee el árbol.** Leer el árbol con un sensor es trampa ("tree reader"). CompuLink vende una defensa contra eso ("Defender"). La app debe ser un registrador pasivo y no dar ninguna señal durante la corrida.

## 1. Cómo está armado el árbol y qué columna es de cada carril
- **Por carril, de arriba abajo:** pre-stage, stage, 3 ámbar grandes, verde y roja ([NHRA 101](https://www.nhra.com/nhra101)). Hay una columna por carril y las dos son iguales.
- **Árbol actual de NHRA/CompuLink (desde abril de 2011):** pre-stage y stage son un juego de LED azules partido en dos: la mitad de arriba es pre-stage y la de abajo stage. Antes eran focos ámbar chicos ([Wikipedia](https://en.wikipedia.org/wiki/Christmas_tree_(drag_racing))). Arriba tiene un "sombrero" con indicadores de stage para el público ([CompetitionPlus](https://competitionplus.com/node/47100)).
- **Árbol típico local (Portatree):** "dual pre-stage & stage bulbs", es decir 2 focos de pre-stage y 2 de stage por carril. En total son 8 focos amarillos "bug light" de 60 W, incandescentes aunque los ámbar sean LED. Verde y roja son "flood lamps". La cabeza mide 49×19×8 in (~1.25 × 0.48 m) ([Portatree](https://portatree.com/product/national-event-tree-with-6-amber-led-bulbs-6-ft-tall/)).
  - Ojo: los focos de stage pueden ser amarillos, casi del mismo color que los ámbar. Hay que distinguirlos por posición, no por color.
- **Qué columna es la tuya:** NHRA dice que cada piloto mira "the three large amber lights on his or her side". O sea, carril izquierdo = columna izquierda, vista desde la línea hacia la pista.
  - En la imagen de la cámara trasera (no está en espejo), desde el carril izquierdo el árbol queda a la derecha y tu columna es la izquierda de las dos, la más cercana a ti.
  - Desde el carril derecho es al revés.
  - No encontré un reglamento que lo diga con "izquierda/derecha". Hay que confirmarlo en el video.

## 2. Secuencia y precisión
- **Pro:** los 3 ámbar se prenden juntos y la verde 0.400 s después. **Full:** los ámbar se prenden uno por uno cada 0.5 s y la verde 0.5 s después del tercero, 1.5 s después del primero ([NHRA 101](https://www.nhra.com/nhra101)).
- Hay eventos con árbol Pro de .5 **(foro)**.
- **No está confirmado si los ámbar se apagan** al prenderse el siguiente o la verde. No hay que depender de eso; se ve en el video.
- **Reloj de la pista:** registra hasta 0.00001 s ([Wikipedia bracket](https://en.wikipedia.org/wiki/Bracket_racing)). La variación entre corrida y corrida del árbol debe ser menor a 1 ms **(inferencia)**. Lo que cambia es el intervalo configurado (.400, .370, .350).
- **Arranque automático (CompuLink):** con los dos autos en stage al menos 0.6 s, el árbol arranca 0.6–1.4 s después (Full: 0.6–1.1 s), más 0–0.2 s al azar ([Mission Raceway](https://missionraceway.com/information/compulink-timing-system-tree/autostart/)). Wikipedia dice que arranca dentro de 1.3 s. En pistas locales el starter puede soltarlo a mano, sin límite de espera.
- **Handicap:** el auto más lento arranca primero; al rápido se le retrasa el árbol la diferencia de dial (ej. .600) ([Wikipedia árbol](https://en.wikipedia.org/wiki/Christmas_tree_(drag_racing))). Las clases por índice (Stock, Super Stock, Comp) también usan handicap ([Dragzine](https://www.dragzine.com/?p=5349)). Puede haber handicap con árbol Pro o Full.

## 3. Cómo se mide la reacción en la boleta
- **Inicio:**
  - Convención vieja (la de la boleta de Daniel): desde el último ámbar en Full o desde los ámbar en Pro. La perfecta es .500 / .400 ([glosario](https://www.goracesgmp.com/drag-racing-glossary)).
  - Convención moderna (NHRA): .000 = perfecta contra la verde.
- **Fin:** la llanta delantera **deja de tapar** el haz de stage. El reloj del ET arranca en ese mismo instante. Si el guard beam se corta primero, cuenta el que pase primero ([manual PortaTree](https://www.manualsdir.com/manuals/407314/portatree-accurate-drag-race-starting-line.html)).
- **Qué incluye la RT:** reacción humana + respuesta del auto + **tiempo del rollout** + delay box si hay ([Performance Trends](https://performancetrends.com/blog/?p=68)).
- **Medidas de la línea:**
  - El pre-stage está ~7 in (178 mm) antes del stage ([Wikipedia](https://en.wikipedia.org/wiki/Christmas_tree_(drag_racing))).
  - Los haces van a ~2 in del piso ([guía PortaTree](https://portatree.com/media/ecom/html/pdf/Instruct-StartLine.pdf)).
  - El guard beam está 13⅜ in después del stage según CompuLink ([CompetitionPlus](https://competitionplus.com/compulink-founder-explains-the-use-of-timing-system-guard-beam/)); los foros dicen 15–16 in.
- **Rollout por geometría (mi cálculo):** la llanta tapa el haz a lo largo de una cuerda L = 2√(2rh − h²).
  - Con llanta de 24–30 in y haz a 2 in, L = 13.3–15.0 in. Stage "shallow": **rollout ≈ 1.1–1.25 ft**. Con haz a 1.5 in: 0.97–1.09 ft.
  - Deep stage (avanzar hasta que se apaga el pre-stage): rollout ≈ **7 in ≈ 0.58 ft**.
  - El 0.5 ft que calibró Daniel encaja con un stage profundo o con la llanta aplastada. **La cámara ve si el pre-stage seguía prendido al momento del stage**, así que puede sugerir el rollout de cada corrida.
- **Relación con la app:** `tRo` de `procesar()` (el cruce del rollout) es el mismo instante en que se apaga el foco de stage.

## 4. Luz roja
- **Mano a mano clásico:** si sales antes de la verde, se prende tu roja *en vez* de la verde ([Wikipedia drag racing](https://en.wikipedia.org/wiki/Drag_racing)).
- **Handicap con TruSTART (CompuLink, desde 2016):** al que salió antes se le muestra la verde, y la roja (solo la peor) aparece cuando ya salieron los dos ([Dragzine](https://www.dragzine.com/news/overdue-compulink-reveals-worst-red-system-for-bracket-racers/)).
- **Otros casos:**
  - Cortar el guard beam con el árbol corriendo y la verde todavía apagada prende la roja ([FIA](https://www.fia.com/sites/default/files/2023_fia_drag_racing_-_race_procedures_-_en_marked_up.pdf)).
  - Pasarse del tiempo para hacer stage también da roja.
  - En SCCA, cortar el guard beam apaga el stage ([SCCA ProSolo](https://www.scca.com/articles/2004176-notice-changes-to-2016-prosolo-rules-5-3-16)).
- **Cómo usarla en la app:** la roja solo marca la corrida. El tiempo se calcula como verde esperada = ámbar de referencia + intervalo; si la RT desde la verde sale negativa, es roja.

## 5. LED vs incandescente y parpadeo
- **Tiempos de encendido:**
  - Encendido "efectivo": incandescente ≥0.016 s, LED 0.001 s ([patente US6695460](https://patents.google.com/patent/US6695460)).
  - Foros de electrónica: 30–100 ms para llegar a corriente plena y ~40 ms al 80 % de brillo ([piclist](https://pic.hallikainen.org/piclist/2006/a/06/27/190033a.txt), foro).
  - Un foco de stage incandescente tarda ~.03 s en apagarse, según un artículo citado en los extractos ([CompetitionPlus](https://competitionplus.com/why-the-nhra-needed-to-change-the-christmas-tree-routine/)).
- **Historia en NHRA:** cambió a ámbar LED en 2003 por focos fundidos, y a LED azules de stage en 2011. El LED más rápido provocó muchas rojas, y por eso nació la compensación .03 ([DRAO](https://dragracingactiononline.com/2022/03/making-things-easier/)).
- **Qué ve la cámara:** el reloj de la pista mide contra la señal eléctrica, no contra la luz. Con incandescente, la luz visible se retrasa 10–30 ms o más; es constante por pista y se calibra con boletas.
  - Para la RT por cámara: ámbar ON y stage OFF son las dos transiciones lentas si los dos focos son incandescentes. Se cancelan en parte, pero no del todo.
- **Parpadeo PWM:** el árbol LED de Portatree tiene "LED Brightness Adjustable" ([Portatree](https://portatree.com/product/eliminator-next-gen-national-event-tree-w-6-amber-led-bulbs-2-led-display/)). Lo más probable es que eso sea PWM **(inferencia; frecuencia desconocida)**.
  - Con exposición corta (de día), PWM de 100–500 Hz se ve como bandas o cuadros oscuros ([ScienceABC](https://www.scienceabc.com/innovation/why-do-led-lights-flicker-on-camera)).

## 6. Delay box, tree readers y qué es legal
- **Cómo funciona la delay box:** el piloto suelta el botón del transbrake al ver el **ámbar superior** (Full) o los ámbar (Pro). La caja espera un tiempo programado y luego suelta. Valores típicos desde el ámbar superior: 0.950–0.990 s en autos con puertas y 1.020–1.080 s en dragsters. El modo "crossover" suma la diferencia de handicap ([manual Auto Meter](https://sdda.semadata.org/Standard/Auto%20Meter/2650-1303.pdf), [Wikipedia](https://en.wikipedia.org/wiki/Delay_box)).
  - **Hay que corregir la idea de Daniel con cuidado: la delay box no lee el árbol. Lo lee el piloto.**
- **Qué es legal:**
  - Depende de la clase: en Super Pro se permite una caja solo al transbrake o al throttle stop; en Pro ET está prohibida y hay que quitarla ([NHRA Summit D2](https://www.nhraracer.com/Files/Competition/SummitETSeriesGuidelines_D2.pdf)).
  - Los botones deben ser mecánicos; los interruptores por luz o láser están prohibidos.
  - Los registradores de datos solo se permiten en algunas clases ([reglamento 2023](https://www.sonomaraceway.com/documents/2023_nhra_rulebook_22_11_08-1-.pdf)). Una copia vieja del reglamento dice: "Data Recorder may not be activated by ... nor by the Christmas Tree" ([copia](https://my5ltr.tripod.com/NHRArules.html)).
- **Tree readers:** son sensores ópticos apuntados al árbol y conectados a la caja. A veces van escondidos en una cámara o un celular. Es trampa, y hay relatos de pilotos vetados **(foro)** ([YellowBullet](https://www.yellowbullet.com/threads/tree-reading.2683236/)).
  - CompuLink lanzó "Defender" (2023): software más un poco de hardware que funciona como "escudo" contra la lectura del árbol. No dicen cómo funciona ([DragRaceResults](https://www.dragraceresults.com/fullstory.cfm?id=7145&type=2)). Podría afectar a la detección por cámara.
- **Qué significa para la app:**
  - Cero salida durante la corrida: ni sonido, ni vibración, ni cambios de pantalla, ni conexión con el auto.
  - Resultados solo al terminar.
  - En la app, decir claramente que es "solo para medir, en práctica / test & tune; avisa al director técnico". Un celular apuntando al árbol puede parecer un tree reader.

## 7. Geometría vista desde el parabrisas (números)
- **Distancias y alturas:**
  - Árbol a 1220 cm del guard beam, unos 12.6 m de la línea. Centro del pre-stage a 2410 mm del piso; ámbar superior a 2130 mm (2210 mm en el árbol LED azul de CompuLink) ([FIA](https://www.fia.com/sites/default/files/2023_fia_drag_racing_-_race_procedures_-_en_marked_up.pdf)).
  - Los foros dicen 40–42 ft ([Corvette Forum](https://www.corvetteforum.com/forums/drag-racing/2611594-starting-line-staging-measurements.html)); Houston dice 42 ft ([HMP](http://www.houstonmotorsportspark.com/dhowto.htm)).
  - FIA: 18.5–22 m de muro a muro ([FIA pistas](https://www.fia.com/sites/default/files/procedures_for_the_recognition_of_fia_drag_strip_-v17.06.21.pdf)). Eso pone a cada auto a 3.5–5.5 m del eje del árbol.
- **Desde la cámara:** queda a ~14–15.5 m, girado **14–22°** hacia un lado, y entre +1° y +5° de elevación (cámara a ~1.2 m; verde y roja a ~1.3–1.6 m de altura, estimado).
- **Tamaño en pixeles** (cámara principal ≈65° horizontal en horizontal, 1920 px de ancho ≈ 29.5 px/°):

  | Cámara / resolución | Foco grande (~16 cm) | Foco de stage (~6 cm) | Cabeza del árbol | Cabeceo de 2° al arrancar |
  |---|---|---|---|---|
  | Principal, 1920 px | ~19 px | ~7 px | ~57×149 px | ~59 px |
  | Principal, 1280 px | ~13 px | ~5 px | ~38×99 px | ~39 px |
  | Ultra gran angular | ~11 px | ~4 px | ~34×90 px | ~36 px |
  | Tele 2x (hay que apuntarla) | ~32 px | ~12 px | ~95×248 px | ~98 px |

  - Con el teléfono vertical solo hay ~±25° horizontales: el árbol queda pegado a la orilla.
- **Carril izquierdo vs derecho:** se invierte el lado. En el carril derecho, si el teléfono va a la derecha del espejo, el espejo, el poste del parabrisas o la jaula pueden tapar el árbol. Hay que revisar la vista previa en los dos carriles.
- **De día:** el sol de frente al atardecer es un problema real; en Pacific Raceways han tenido que parar ([CompetitionPlus](https://www.competitionplus.com/drag-racing/news/10955-seattle-sun-presents-challenge)).
  - El reflejo del sol en el reflector puede hacer que un foco apagado parezca prendido (inferencia).
  - El tablero se refleja en el parabrisas.
  - El humo del burnout puede pasar entre el auto y el árbol.
- **De noche:** los focos se saturan, se ven blancos y con halo. Hay que identificarlos por posición, no por color. La pantalla del teléfono debe ir negra para que no se refleje en el vidrio frente a la lente.
- **Que el árbol se ve desde el parabrisas está probado:** los pilotos pegan "tree blockers" en el parabrisas para ver solo ciertos focos ([patente](https://patents.justia.com/patent/20070099160)).

## 8. Qué implica para detectar las luces con la cámara
1. **Eventos a detectar en la columna propia:** pre-stage y stage (ON/OFF), ámbar 1–3 (ON, y OFF si existe), verde ON y roja ON.
   - **RT de boleta = t(stage OFF) − t(ámbar de referencia)**: en Pro los ámbar, en Full el 3.º.
   - **RT desde la verde = RT de boleta − I.** I es el intervalo medido (verde − ámbar) si se vio la verde; si no, el de la pista (.400/.500 por defecto, editable).
2. **Combinar con el acelerómetro:** `tRo` es la otra forma de marcar el fin de la RT. Hace falta conocer el desfase entre el reloj de la cámara y el del acelerómetro. Se puede estimar en cada corrida comparando el cabeceo al arrancar (giroscopio) con el salto vertical del árbol en la imagen.
   - Con eso, la distancia integrada hasta el "stage OFF" da el **rollout real de cada corrida**. Ayuda a separar rollout y retraso del GPS, el problema de la primera prueba real (punto 8 de CLAUDE.md).
   - Si no se detecta el stage OFF (foco chico, humo), usar `tRo` + desfase.
3. **Fijar la columna propia:**
   - Por la regla geométrica de arriba.
   - Por correlación: los focos de pre-stage y stage que se prenden justo cuando el auto avanza en el stage (acelerómetro/GPS) son los tuyos.
   - Que el usuario la confirme al preparar la medición.
   - En Pro mano a mano, los ámbar del rival se prenden al mismo tiempo y sirven para afinar el tiempo; en handicap no.
4. **Cómo sacar el tiempo de cada foco:** brillo de cada foco contra su propio fondo, medido durante el stage, para detectar cambios y no valores absolutos.
   - Para la subida: la misma técnica del inicio por acelerómetro en v2.3 (recta del frente de subida y cruce en cero). Así sirven también los incandescentes.
   - Un foco se da por "prendido" si sigue así al menos 2 cuadros (por PWM y vibración), pero se fecha con el primer cuadro.
5. **Cuadros por segundo:** pedir al menos 60 fps y registrar los fps que de verdad se logran y la hora de cada cuadro (`requestVideoFrameCallback`).
   - Error de la RT por cámara (diferencia de dos eventos): σ ≈ T/√6, es decir **13.6 ms a 30 fps, 6.8 ms a 60 fps y 3.4 ms a 120 fps**.
   - 0.4 y 0.5 s son múltiplos exactos de 1/30 y 1/60 s. A 30 fps, la diferencia entre .370 y .400 es menos de un cuadro: se resuelve promediando corridas, o con precisión dentro del cuadro si la exposición es larga y el foco no se satura.
6. **Exposición:** limitarla o fijarla donde se pueda (Chrome en Android: `exposureMode`/`exposureTime`; en iOS hay que verificar si se puede). Medir la luz sobre el árbol.
7. **Movimiento:** cuando se apaga el stage, el auto ya avanzó 0.15–0.35 m y cabeceó 1–3°, es decir 30–90 px. Hay que seguir el árbol en la imagen y predecir el salto con el giroscopio. Además, la vibración del motor en el transbrake o el two-step mueve la imagen.
8. **Cuándo procesar a todo ritmo:** desde que se prende el stage propio, porque el árbol baja en ~2.5 s como máximo con arranque automático. Si lo suelta el starter a mano, esperar con un límite de tiempo.
9. **Pantalla neutral:** sin vista previa durante la corrida y con la pantalla en negro.
10. **Guardar con la corrida:** las series de brillo de cada foco y algunos recortes del árbol, en el historial y en el zip exportado, para calibrar con boletas. Guardar también un desfase por pista (lo calibrado con boletas: tipo de foco y retraso de la pista).
11. **Prueba 0 con Daniel:** un segundo teléfono en cámara lenta a 240 fps junto al que mide, más las boletas. Así se sabe:
    - si los focos son LED o incandescentes;
    - si los ámbar se apagan;
    - si el stage se apaga justo al liberar el haz;
    - qué hace la roja;
    - cuánto vale el intervalo real;
    - si hay parpadeo PWM.
12. **Para Race 1 vs 1:** se reutilizan el cálculo `tRo` − verde, la calibración del desfase entre cámara y acelerómetro, y el formato de datos. En una pista con árbol, una sola cámara ve las dos columnas y los dos focos de stage, así que podría medir la RT de los dos carriles.

**Pendiente de confirmar en la pista:**
- qué columna es de cada carril;
- si los ámbar se apagan;
- que el stage OFF coincida con la liberación del haz, sin retraso del controlador;
- el intervalo real (.400, .370 u otro);
- el tipo de focos y el PWM;
- si la pista tiene CompuLink Defender o TruSTART.