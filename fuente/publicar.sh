#!/usr/bin/env bash
# Construye la app y copia los archivos publicables a la raíz del repo (GitHub Pages).
set -euo pipefail
cd "$(dirname "$0")/.."
python3 fuente/app/tools/build.py
cp fuente/app/LEEME.txt fuente/app/dist/LEEME.txt
cp fuente/app/dist/{index.html,manifest.webmanifest,sw.js,icon-180.png,icon-192.png,icon-512.png,icon-maskable-512.png} .
mkdir -p fondos && cp fuente/app/dist/fondos/*.webp fondos/
# Página de prueba de la cámara (diagnóstico para leer el semáforo)
python3 fuente/app/tools/build_prueba.py
mkdir -p prueba && cp fuente/app/dist/prueba/camara.html prueba/
echo "Listo. Revisa con git diff, haz commit y push a main y a gh-pages."
