// arbol_y4m.js — Video .y4m (I420) de un árbol simulado con semaforo_sim.js, para la cámara falsa de Chromium
// (--use-file-for-fake-video-capture). Chromium lo repite en bucle: una secuencia por vuelta.
// Uso: node arbol_y4m.js salida.y4m [--tipo full|pro] [--fps 30] [--w 640] [--h 360] [--seg 6] [--ref 2.0] [--rt 0.3]
//      [--cond dia] [--carril izq]
// Imprime en JSON dónde quedó el árbol (caja y focos, en px del cuadro) y los tiempos dentro del video.
'use strict';
const fs = require('fs');
const Sim = require(__dirname + '/../app/src/semaforo_sim.js');
const a = process.argv.slice(2), sal = a[0];
const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const tipo = arg('tipo', 'full'), fps = +arg('fps', 30), W = +arg('w', 640) & ~1, H = +arg('h', 360) & ~1, seg = +arg('seg', 6);
const ref = +arg('ref', 2.0), rt = +arg('rt', 0.3), cond = arg('cond', 'dia'), carril = arg('carril', 'izq');
if (!sal) { console.error('falta el archivo de salida'); process.exit(2); }
const E = Sim.escena(Object.assign({}, Sim.condicion(cond), {
  tipo, carril, w: W, h: H, orig: [W, H], zona: [0, 0, W, H], centro: [W / 2, H / 2], t_ambar_ref: ref, rt_s: rt, fps,
  seed: 7, vibracion: null, cabeceo: null, otro: { desfase_s: 0, presente: true },
}));
const out = fs.openSync(sal, 'w');
fs.writeSync(out, `YUV4MPEG2 W${W} H${H} F${fps}:1 Ip A1:1 C420jpeg\n`);
const N = Math.round(seg * fps), Y = Buffer.alloc(W * H), U = Buffer.alloc((W >> 1) * (H >> 1)), V = Buffer.alloc((W >> 1) * (H >> 1));
for (let k = 0; k < N; k++) {
  const rgba = Sim.pintar(E, (k + 0.5) / fps);
  // BT.601 de rango limitado (lo que Chromium supone en un y4m)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    Y[y * W + x] = Math.max(0, Math.min(255, Math.round(16 + 0.257 * r + 0.504 * g + 0.098 * b)));
  }
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    let r = 0, g = 0, b = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = ((y + dy) * W + x + dx) * 4; r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; }
    r /= 4; g /= 4; b /= 4;
    const c = (y >> 1) * (W >> 1) + (x >> 1);
    U[c] = Math.max(0, Math.min(255, Math.round(128 - 0.148 * r - 0.291 * g + 0.439 * b)));
    V[c] = Math.max(0, Math.min(255, Math.round(128 + 0.439 * r - 0.368 * g - 0.071 * b)));
  }
  fs.writeSync(out, 'FRAME\n'); fs.writeSync(out, Y); fs.writeSync(out, U); fs.writeSync(out, V);
}
fs.closeSync(out);
const v = E.verdad;
console.log(JSON.stringify({ archivo: sal, W, H, fps, seg, tipo, carril, caja: v.disp.caja, focos: v.disp.focos,
  t_ambar: v.t_ambar, t_ambar_ref: v.t_ambar_ref, t_verde: v.t_verde, delta_s: v.delta_s, t_stage_off: v.t_stage_off }));
