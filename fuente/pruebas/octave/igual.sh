#!/usr/bin/env bash
# ¿drag_procesar.m (MATLAB) da lo mismo que dragcore.js (la app)? Corre 19 sesiones en los dos y compara.
# Necesita Octave: apt-get update && apt-get install -y --no-install-recommends octave   (~2 min)
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
command -v octave-cli >/dev/null || { echo "Falta Octave (ver arriba cómo instalarlo)."; exit 2; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir "$T/m"
cp "$AQUI/../../matlab/drag_procesar.m" "$AQUI/../../matlab/drag_config.m" "$T/m/"
# Octave 8 no acepta median(x, 'omitnan') (MATLAB sí): solo en esta copia se cambia por lo equivalente
sed -i "s/median(hG(segG), 'omitnan')/median(hG(segG \& isfinite(hG)))/" "$T/m/drag_procesar.m"
node "$AQUI/gen.js" "$T"
cp "$AQUI/correr.m" "$T/"
( cd "$T" && octave-cli --no-gui -q correr.m )
node "$AQUI/comparar.js" "$T"
