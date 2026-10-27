---
name: dragtree-publicar
description: Lista de pasos para probar, versionar y publicar Drag Tree en GitHub Pages sin romper la app instalada de Daniel ni su historial. Úsala siempre antes de hacer commit de un cambio en la app (fuente/app, fuente/fondos, index.html, sw.js), cuando Daniel diga "publícalo", "súbelo", "ya quedó", o cuando haya que revisar qué pruebas correr según lo que se cambió.
---

# Probar y publicar Drag Tree

Daniel ya tiene la app instalada (PWA) y la usa en la pista; las actualizaciones le llegan solas al
abrirla con internet. Un error publicado le llega directo al teléfono. Por eso: probar todo, revisar
capturas, y decirle qué tan seguro estás.

## 1. Antes de empezar

- `git fetch origin` y revisa si `main` cambió: puede haber otra sesión trabajando en la app (pasó el
  24 oct con "Race 1 vs 1"). Integra esos cambios antes de publicar; nunca publiques encima de algo
  que no has visto.
- No cambies nunca: la URL/repo `dragtrim`, las claves `dragtrim.*` de localStorage, la base
  IndexedDB `'dragtrim'`, ni los nombres de los zips exportados. **Nunca le pidas desinstalar o
  reinstalar** (perdería su historial).

## 2. Qué pruebas correr

`bash .claude/skills/dragtree-publicar/scripts/probar_todo.sh` corre todas (≈15 min; el Monte Carlo del semáforo tarda ~7), arma
`fuente/app/dist` y da un resumen OK/FALLA; los registros quedan en `fuente/pruebas/capturas/registros/`.
Si falta Playwright de Python lo instala en la misma versión que el de Node (nunca `playwright install`).
Por grupos:

| Cambiaste… | Grupo | Pruebas |
|---|---|---|
| `dragcore.js`, `drag_*.m` | `algoritmo matlab ui` | mc.js, inicio.js, spike.js, mcheck.py, archivo único al día, uitest demo/real |
| `practica.js`, fondos, brillo | `practica` | pt_test.py, brillo_test.py |
| `rooster.js`, `calculadora.js` | `calc` | calc.js, calc_test.py |
| Guía de instalación, pestañas (también deslizar entre ellas), tema, franja de la hora en Android (theme-color) | `instalar ui` | instalar_test.py, deslizar_test.py, carga_test.py, barra_test.py, uitest |
| `semaforo*.js`, `camara.js/.css`, la página de prueba | `semaforo ui` | semaforo_sim_test.js, reaccion.js, semaforo_mc.js rapido (contra `archivo/ideas/semaforo_real/resultados_mc.txt`), camara_lector_test.py, camara_test.py, prueba_camara_test.py |
| `app.js`, `style.css`, `index.template.html` | `ui practica instalar semaforo` | lo de navegador |
| Solo texto/docs/skills | `rapido` | lo que no usa navegador |

Antes de publicar, corre **todo** aunque hayas cambiado poco.

- Algoritmo: compara contra `.claude/skills/dragtree-medicion/references/referencia-pruebas.md`.
- **Revisa las capturas** (`fuente/pruebas/capturas/*.png`) con la herramienta Read: textos
  cortados, contraste, que se lean los tiempos sobre el fondo, modo claro y oscuro.

## 3. Versión

Sube la versión en los **tres** lugares:
1. `APP_VERSION` en `fuente/app/src/app.js` (`'beta 0.5.4'`; se ve en Ajustes).
2. `VERSION` en `fuente/app/tools/build.py` (`'beta-0.5.4'`; nombre de la caché del service worker:
   si no cambia, el teléfono de Daniel no se entera de la versión nueva).
3. La línea "Versión actual" de `CLAUDE.md`, con una frase de qué trajo.

Si una versión queda "sin publicar" (en desarrollo), dilo en el mensaje del commit:
`Beta 0.5.4 (sin publicar): …`.

## 4. Publicar (solo si Daniel lo pidió o lo aprobó)

```bash
bash fuente/publicar.sh                  # build + copia index.html, sw.js, manifest, íconos y fondos a la raíz
git add -A && git commit -m "Beta X.Y.Z: <qué cambió, en español>"
git push origin <rama-de-la-sesión>      # la rama asignada a la sesión
git push origin HEAD:main                # solo si Daniel pidió publicar
git push origin HEAD:gh-pages            # GitHub Pages sirve gh-pages: main y gh-pages deben quedar iguales
```

Si el push a `main`/`gh-pages` no es fast-forward, **no fuerces**: trae los cambios, intégralos,
vuelve a probar.

Después:
- Copia de la versión: `git show <commit>:index.html > archivo/versiones/drag_beta_X.Y.Z.html` y su
  renglón en la tabla de `archivo/LEEME.md` (versión, commit, qué trajo). Commit y push otra vez.
- Confirma que se publicó: WebFetch a https://daniterrazas01-source.github.io/dragtrim/ (tarda 1–3 min;
  busca la versión nueva). Si github.io no responde desde el contenedor, revisa con las herramientas de
  GitHub que el flujo "pages build and deployment" de ese commit terminó en éxito.

## 5. Contarle a Daniel

En español, corto y sin jerga: qué cambió, qué probaste, qué tan seguro estás, y qué debe hacer él
(normalmente nada: abrir la app con internet; si no ve el cambio, cerrarla del todo y abrirla otra vez).
Si algo no se pudo probar (por ejemplo, en un iPhone real), dilo.
