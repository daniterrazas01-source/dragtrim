#!/usr/bin/env python3
"""Regenera fuente/matlab/Drag_tree_v2_unico.m = Drag_tree_v2.m + drag_config.m + drag_procesar.m + drag_reporte.m
(versión de un solo archivo para MATLAB Mobile). Uso: python3 unir_matlab.py [--revisar]
--revisar: no escribe nada; solo dice si el archivo actual está al día (sale con 1 si no)."""
import pathlib, subprocess, sys

raiz = pathlib.Path(subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True,
                                   cwd=pathlib.Path(__file__).parent).stdout.strip())
m = raiz / 'fuente' / 'matlab'
leer = lambda n: (m / n).read_text(encoding='utf-8')

principal = leer('Drag_tree_v2.m').split('\n')
assert principal[0] == '%% Drag_tree_v2.m', 'cambió el encabezado de Drag_tree_v2.m: revisa este script'
assert principal[3].startswith('% Archivos necesarios'), 'cambió el encabezado de Drag_tree_v2.m: revisa este script'
principal[0] = '%% Drag_tree_v2_unico.m'
principal[3:5] = ['% Versión de UN SOLO ARCHIVO: no necesita nada más en la carpeta.']
sep = '%% ' + '=' * 72
texto = ('\n'.join(principal) + '\n' + sep + '\n%% FUNCIONES (versión de un solo archivo)\n' + sep + '\n\n'
         + leer('drag_config.m') + '\n' + leer('drag_procesar.m') + '\n' + leer('drag_reporte.m'))

destino = m / 'Drag_tree_v2_unico.m'
if '--revisar' in sys.argv:
    ok = destino.read_text(encoding='utf-8') == texto
    print('Drag_tree_v2_unico.m', 'al día' if ok else 'DESACTUALIZADO: corre python3 unir_matlab.py')
    sys.exit(0 if ok else 1)
destino.write_text(texto, encoding='utf-8')
print('Escrito', destino.relative_to(raiz), len(texto.split('\n')), 'líneas')
