# Skills de diseño de otros autores

Instaladas el 26 oct 2026 a pedido de Daniel ("algo estilo moderno, retro e impecable"). Son copias de
sus repos de GitHub; no son parte de la app (publicar.sh no las toca).

| Skill | De dónde | Versión copiada | Licencia | Para qué |
|---|---|---|---|---|
| `impeccable/` + `.claude/agents/impeccable-*.md` | github.com/pbakaus/impeccable (`.claude/skills/impeccable`, `.claude/agents`) | v4.7.1, commit ade3783 (26 oct 2026) | Apache 2.0 (LICENSE y NOTICE.md en la carpeta) | Pulir, revisar y rediseñar: `/impeccable polish`, `audit`, `critique`, `typeset`, `animate`, `bolder`, `quieter`, `colorize`, `layout`… |
| `ui-ux-pro-max/` | github.com/nextlevelbuilder/ui-ux-pro-max-skill (`.claude/skills/ui-ux-pro-max`) | commit 28b3b8d (26 oct 2026) | MIT | Catálogo de estilos (retro: Retro-Futurism, Y2K, Vaporwave, Vintage Analog / Retro Film, Pixel Art, Memphis, Bauhaus, Brutalismo, Cyberpunk; moderno: Liquid Glass, Bento, Glassmorphism, Material 3…), paletas, pares de letras y reglas de UX. Busca en sus CSV sin internet. |
| `apple-design/`, `mobile-native/`, `review-animations/` | github.com/emilkowalski/skills (`skills/…`) | commit 2d22863 (11 oct 2026) | MIT | Gestos y movimiento estilo Apple, que la PWA se sienta nativa en el teléfono, y revisión de animaciones (`review-animations` solo corre si se pide con `/review-animations`). |

Cambios locales:
- `ui-ux-pro-max/SKILL.md`: las rutas `${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/…` (solo sirven
  instalada como plugin) se cambiaron a `.claude/skills/ui-ux-pro-max/…` (desde la raíz del repo). Sin
  `scripts/tests/` (pruebas del autor). Para buscar: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "retro film" --domain style`.
- Impeccable: **sin sus hooks** (su repo los trae en `.claude/settings.json` para revisar cada edición y al
  terminar; aquí estorbarían). Se pueden prender por proyecto con `/impeccable hooks on` si Daniel lo pide.
  La primera vez su lanzador baja un programa de github.com/pbakaus/impeccable/releases a `~/.impeccable/`
  (fuera del repo) y lo comprueba con `scripts/engine-checksums.txt`; si no puede, la skill sigue leyendo
  sus guías. En un rediseño completo usa sus 4 agentes de ayuda (gasta más uso).

Ojo: el sistema de diseño que UI/UX Pro Max arma solo (`--design-system`) es genérico (para "drag racing"
propuso morado y letra de programador); usarlo como catálogo de estilos, no al pie de la letra.

Para actualizarlas: clonar el repo de cada una, copiar la carpeta encima, repetir los cambios locales y
poner aquí el commit nuevo.
