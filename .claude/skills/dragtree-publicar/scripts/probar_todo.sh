#!/usr/bin/env bash
# Corre todas las pruebas de Drag Tree y da un resumen corto. No publica nada (solo arma fuente/app/dist).
#
#   bash probar_todo.sh            todo
#   bash probar_todo.sh rapido     sin navegador (algoritmo, calculadora, MATLAB, semáforo sin el Monte Carlo)
#   bash probar_todo.sh <grupo>... algoritmo | calc | ui | practica | instalar | matlab | semaforo
#
# Los registros completos quedan en fuente/pruebas/capturas/registros/ (ignorado por git), junto a las capturas.
set -uo pipefail
RAIZ="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
P="$RAIZ/fuente/pruebas"
LOG="$P/capturas/registros"
mkdir -p "$LOG"

grupos="${*:-todo}"
quiere() { [[ " $grupos " == *" todo "* ]] || [[ " $grupos " == *" $1 "* ]] || { [[ " $grupos " == *" rapido "* ]] && [[ "$1" =~ ^(algoritmo|calc_node|matlab|semaforo_node)$ ]]; }; }

# Las pruebas de navegador usan Playwright de Python con el Chromium ya instalado (/opt/pw-browsers).
# Si falta, se instala la MISMA versión que la de Node (así encuentra ese Chromium). Nunca "playwright install".
necesita_navegador=0
for g in ui practica calc instalar semaforo; do quiere "$g" && necesita_navegador=1; done
if [ "$necesita_navegador" = 1 ] && ! python3 -c "import playwright" 2>/dev/null; then
  V=$(node -e "console.log(require('playwright/package.json').version)" 2>/dev/null)
  echo "Instalando Playwright de Python $V (igual que el de Node)..."
  pip install -q --break-system-packages "playwright==$V" >/dev/null 2>&1 || echo "AVISO: no se pudo instalar Playwright de Python"
fi

declare -a RES
correr() {   # nombre, patrón que debe salir en la salida (o vacío = basta el código de salida), comando...
  local nombre="$1" patron="$2"; shift 2
  local f="$LOG/${nombre//[^a-zA-Z0-9_]/_}.txt" t0=$SECONDS
  ( cd "$P" && "$@" ) >"$f" 2>&1; local rc=$?
  local ok=1
  [ $rc -ne 0 ] && ok=0
  if [ -n "$patron" ] && ! grep -qE "$patron" "$f"; then ok=0; fi
  if [ $ok = 1 ]; then RES+=("OK     $nombre ($((SECONDS - t0)) s)"); else RES+=("FALLA  $nombre (ver $f)"); fi
}

echo "Armando fuente/app/dist (build.py)..."
if ! ( cd "$RAIZ" && python3 fuente/app/tools/build.py ) >"$LOG/build.txt" 2>&1; then
  echo "FALLA build.py:"; tail -20 "$LOG/build.txt"; exit 1
fi
if quiere semaforo && ! ( cd "$RAIZ" && python3 fuente/app/tools/build_prueba.py ) >"$LOG/build_prueba.txt" 2>&1; then
  echo "FALLA build_prueba.py:"; tail -20 "$LOG/build_prueba.txt"; exit 1
fi

if quiere algoritmo; then
  correr "mc.js"      ''  node mc.js
  correr "inicio.js"  ''  node inicio.js '[{}]'
  correr "spike.js"   ''  node spike.js
fi
if quiere calc || quiere calc_node; then correr "calc.js" ', 0 mal' node calc.js; fi
if quiere calc;      then correr "calc_test.py"     'FALLAS: 0'           python3 calc_test.py; fi
if quiere ui;        then correr "uitest.py demo"   'ERRORES: ninguno'    python3 uitest.py demo
                          correr "uitest.py real"   'ERRORES: ninguno'    python3 uitest.py real; fi
if quiere practica;  then correr "pt_test.py"       'errores: ninguno'    python3 pt_test.py
                          correr "pt_tocar_test.py" 'FALLAS: 0'           python3 pt_tocar_test.py
                          correr "brillo_test.py"   'FALLAS: 0'           python3 brillo_test.py; fi
if quiere instalar;  then correr "instalar_test.py" 'FALLAS: 0'           python3 instalar_test.py; fi
if quiere instalar;  then correr "deslizar_test.py" 'FALLAS: 0'           python3 deslizar_test.py; fi
if quiere instalar;  then correr "carga_test.py"    'FALLAS: 0'           python3 carga_test.py; fi
if quiere instalar;  then correr "barra_test.py"    'FALLAS: 0'           python3 barra_test.py; fi
# Semáforo real (cámara). El Monte Carlo se compara contra la salida guardada (varios criterios del plan todavía no se
# cumplen: PWM, 30 fps, sol); si un cambio lo mejora a propósito, guarda la salida nueva en resultados_mc.txt.
if quiere semaforo || quiere semaforo_node; then
  correr "semaforo_sim_test.js" ''            node semaforo_sim_test.js
  correr "reaccion.js"          'Todo cumple' node reaccion.js
fi
if quiere semaforo; then
  correr "semaforo_mc.js rapido" 'Sin retrocesos' node semaforo_mc.js rapido --base "$RAIZ/archivo/ideas/semaforo_real/resultados_mc.txt"
  correr "camara_lector_test.py" 'FALLAS: 0' python3 camara_lector_test.py
  correr "camara_test.py"        'FALLAS: 0' python3 camara_test.py
  correr "prueba_camara_test.py" 'FALLAS: 0' python3 prueba_camara_test.py
fi
if quiere matlab; then
  correr "mcheck.py" '' bash -c 'python3 mcheck.py ../matlab/*.m | tee /dev/stderr | grep -v "OK" && exit 1 || exit 0'
  correr "Drag_tree_v2_unico.m al día" 'al día' python3 "$RAIZ/.claude/skills/dragtree-medicion/scripts/unir_matlab.py" --revisar
fi

echo
printf '%s\n' "${RES[@]}"
if quiere algoritmo; then
  echo; echo "--- Algoritmo (compara contra los valores de referencia de la skill dragtree-medicion) ---"
  grep -E "^GPS|^ +(60|1\/4|cruce)|^\{" "$LOG/mc_js.txt" "$LOG/inicio_js.txt" "$LOG/spike_js.txt" 2>/dev/null | sed "s|$LOG/||" | head -40
fi
echo; echo "Capturas para revisar: $P/capturas/"
printf '%s\n' "${RES[@]}" | grep -q '^FALLA' && exit 1 || exit 0
