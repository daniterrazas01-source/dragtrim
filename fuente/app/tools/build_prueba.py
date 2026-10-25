"""Arma dist/prueba/camara.html: la página de prueba de la cámara, autocontenida (incluye semaforo_vision.js y
semaforo.js para medir el retraso cámara↔giroscopio con el mismo código que la app). La copia fuente/publicar.sh."""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, DIST = ROOT / 'src', ROOT / 'dist' / 'prueba'
DIST.mkdir(parents=True, exist_ok=True)

html = (SRC / 'prueba_camara.template.html').read_text(encoding='utf-8')
for marca, archivo in (('/*SEMVISION*/', 'semaforo_vision.js'), ('/*SEMAFORO*/', 'semaforo.js')):
    assert marca in html, f'falta {marca} en la plantilla'
    html = html.replace(marca, (SRC / archivo).read_text(encoding='utf-8'))
(DIST / 'camara.html').write_text(html, encoding='utf-8')
print('ok prueba/camara.html', len(html), 'bytes')
