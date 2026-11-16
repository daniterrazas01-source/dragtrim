// Compara js.txt (dragcore.js) con oct.txt (drag_procesar.m en Octave). Uso: node comparar.js <carpeta>
const fs = require('fs'), path = require('path');
const lee = (f) => fs.readFileSync(path.join(process.argv[2], f), 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/));
const a = lee('js.txt'), b = lee('oct.txt');
let peor = 0, fallas = a.length === b.length ? 0 : 1;
for (let i = 0; i < Math.min(a.length, b.length); i++) {
  let d = 0;
  for (let k = 2; k < a[i].length; k++) d = Math.max(d, Math.abs(parseFloat(a[i][k]) - parseFloat(b[i][k])) / (k === a[i].length - 1 ? 1000 : 1));
  if (!(d < 1e-6)) { fallas++; console.log('DISTINTO', a[i][0], a[i][1], d.toExponential(1)); }
  peor = Math.max(peor, d);
}
console.log(`${a.length} resultados de la app, ${b.length} de Octave; mayor diferencia ${peor.toExponential(1)} s`);
console.log('FALLAS: ' + fallas);
process.exit(fallas ? 1 : 0);
