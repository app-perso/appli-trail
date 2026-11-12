// Copie le moteur de lecture d'images (Tesseract.js) dans public/tesseract/
// pour que l'appli le serve elle-même : aucun serveur externe, marche hors ligne.
// Lancé automatiquement avant « npm run dev » et « npm run build ».
import { copyFileSync, mkdirSync } from 'node:fs';

const out = 'public/tesseract';
mkdirSync(`${out}/core`, { recursive: true });
copyFileSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  copyFileSync(`node_modules/tesseract.js-core/${f}`, `${out}/core/${f}`);
}
console.log('Tesseract copié dans public/tesseract/');
