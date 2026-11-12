// Lecture des captures avec Tesseract.js, directement sur le téléphone (aucun serveur).
// Tesseract travaille dans un Web Worker : l'écran reste fluide pendant la lecture.
import type { PSM as TessPSM, Worker } from 'tesseract.js';
import { mergeValues, parseSuunto, readZones, type OcrValues } from './parse';
import { parseLayout, type Field, type Word } from './layout';
import { readBpm, readDuration, readKm, readMeters } from './parse';
import { preprocessForOcr } from './image';

let workerPromise: Promise<Worker> | null = null;
// Modes de découpage de Tesseract (valeurs de son énumération PSM)
const PSM = { AUTO: '3' as TessPSM, SINGLE_LINE: '7' as TessPSM };

const READERS: Record<Field, (t: string) => number | undefined> = {
  distanceKm: readKm,
  durationMin: readDuration,
  elevationGain: readMeters,
  elevationLoss: readMeters,
  hrAvg: readBpm,
  hrMax: readBpm,
};
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
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    texts.push(data.text);
    // Lignes avec la position de chaque mot (pour les tuiles sur deux colonnes)
    const lines: Word[][] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => l.words)));
    let values: OcrValues;
    if (lines.length) {
      const layout = parseLayout(lines, canvas.width);
      values = layout.values;
      // 2e lecture : chaque valeur relue seule, en mode « une ligne » (bien plus fiable sur les chiffres fins)
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
      for (const [field, box] of Object.entries(layout.boxes) as [Field, NonNullable<(typeof layout.boxes)[Field]>][]) {
        const h = box.y1 - box.y0;
        const rectangle = {
          left: Math.max(0, Math.round(box.x0 - h * 0.6)),
          top: Math.max(0, Math.round(box.y0 - h * 0.4)),
          width: Math.round(box.x1 - box.x0 + h * 1.2),
          height: Math.round(h * 1.8),
        };
        const { data: d } = await worker.recognize(canvas, { rectangle });
        const again = READERS[field](d.text);
        if (again !== undefined) values[field] = again;
      }
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    } else {
      values = parseSuunto(data.text);
    }
    const zones = readZones(data.text.split('\n').map((l) => l.trim()).filter(Boolean));
    if (zones) values.zones = zones;
    results.push(values);
  }
  onProgress = null;
  progress(1, 'Terminé');
  return { values: mergeValues(results), texts };
}
