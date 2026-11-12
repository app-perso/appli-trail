// Lecture des captures avec Tesseract.js, directement sur le téléphone (aucun serveur).
// Tesseract travaille dans un Web Worker : l'écran reste fluide pendant la lecture.
import type { Worker } from 'tesseract.js';
import { mergeValues, parseSuunto, type OcrValues } from './parse';
import { preprocessForOcr } from './image';

let workerPromise: Promise<Worker> | null = null;
let onProgress: ((p: number) => void) | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const base = new URL(`${import.meta.env.BASE_URL}tesseract/`, window.location.href).href;
      return createWorker(['fra', 'eng'], 1 /* LSTM */, {
        workerPath: `${base}worker.min.js`,
        corePath: `${base}core`,
        langPath: `${base}lang`,
        gzip: true,
        logger: (m) => {
          if (m.status === 'recognizing text') onProgress?.(m.progress);
        },
      });
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

export interface OcrOutcome {
  values: OcrValues;
  texts: string[];
}

/** Lit toutes les captures et renvoie les valeurs trouvées (fusionnées). */
export async function readScreenshots(images: Blob[], progress: (fraction: number, label: string) => void): Promise<OcrOutcome> {
  progress(0, 'Préparation du lecteur…');
  const worker = await getWorker();
  const results: OcrValues[] = [];
  const texts: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const label = images.length > 1 ? `Lecture de la capture ${i + 1} / ${images.length}…` : 'Lecture de la capture…';
    progress(i / images.length, label);
    onProgress = (p) => progress((i + p) / images.length, label);
    const canvas = await preprocessForOcr(images[i]);
    const { data } = await worker.recognize(canvas);
    texts.push(data.text);
    results.push(parseSuunto(data.text));
  }
  onProgress = null;
  progress(1, 'Terminé');
  return { values: mergeValues(results), texts };
}
