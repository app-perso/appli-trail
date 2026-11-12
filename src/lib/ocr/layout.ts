// Lecture « par position » des écrans Suunto : tuiles sur deux colonnes, libellé au-dessus de la valeur.
// Tesseract donne chaque mot avec sa position ; on regroupe les mots en morceaux (un libellé, une valeur),
// puis pour chaque libellé on prend la valeur juste en dessous dans la même colonne (ou juste à droite).
import type { OcrValues } from './parse';
import { readBpm, readDuration, readKm, readMeters } from './parse';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface Word {
  text: string;
  bbox: Box;
}
interface Segment extends Box {
  text: string;
}

/** Coupe chaque ligne en morceaux là où il y a un grand espace (= changement de colonne). */
export function toSegments(lines: Word[][]): Segment[] {
  const out: Segment[] = [];
  for (const words of lines) {
    const ws = words.filter((w) => w.text.trim()).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    if (!ws.length) continue;
    const h = Math.max(...ws.map((w) => w.bbox.y1 - w.bbox.y0), 1);
    let cur: Word[] = [ws[0]];
    const flush = () => {
      out.push({
        text: cur.map((w) => w.text).join(' '),
        x0: Math.min(...cur.map((w) => w.bbox.x0)),
        y0: Math.min(...cur.map((w) => w.bbox.y0)),
        x1: Math.max(...cur.map((w) => w.bbox.x1)),
        y1: Math.max(...cur.map((w) => w.bbox.y1)),
      });
    };
    for (let i = 1; i < ws.length; i++) {
      if (ws[i].bbox.x0 - ws[i - 1].bbox.x1 > h * 1.6) {
        flush();
        cur = [];
      }
      cur.push(ws[i]);
    }
    flush();
  }
  return out;
}

/** Morceaux candidats pour la valeur d'un libellé : d'abord en dessous (même colonne), puis à droite. */
function candidates(label: Segment, segs: Segment[], width: number): Segment[] {
  const h = label.y1 - label.y0;
  const below = segs
    .filter((s) => s !== label && s.y0 >= label.y1 - h * 0.3 && s.y0 <= label.y1 + h * 2.5 && Math.abs(s.x0 - label.x0) < width * 0.08)
    .sort((a, b) => a.y0 - b.y0);
  const midY = (label.y0 + label.y1) / 2;
  const right = segs
    .filter((s) => s !== label && s.x0 > label.x1 && s.y0 < midY + h * 0.5 && s.y1 > midY - h * 0.5)
    .sort((a, b) => a.x0 - b.x0);
  return [...below, ...right];
}

/** Petits symboles parasites en fin de libellé (icône « i », « © », « (1) »…). */
const TAIL = String.raw`(?:\s*(?:\(?\s*[i1l]\s*\)?|[©®@)(]+|\W)){0,3}\s*$`;
const L = (body: string) => new RegExp('^\\W*' + body + TAIL, 'i');

const LABELS = {
  distanceKm: L('distance'),
  durationMin: L('dur[ée]e'),
  elevationGain: L('(?:ascension|d[ée]nivel[ée] positif|D\\+)'),
  elevationLoss: L('(?:descente|d[ée]nivel[ée] n[ée]gatif|D[-−])'),
  hrAvg: L('(?:fr[ée]quence cardiaque|FC)\\s*moy(?:enne)?\\.?'),
  hrMax: L('(?:fr[ée]quence cardiaque|FC)\\s*max(?:i|imum|imale)?\\.?'),
  /** Libellé coupé par Suunto : « Fréquence cardiaque m… » (1re = moyenne, 2e = max) */
  hrCut: L('fr[ée]quence cardiaque m\\s*(?:\\.{2,}|…)'),
};

export type Field = 'distanceKm' | 'durationMin' | 'elevationGain' | 'elevationLoss' | 'hrAvg' | 'hrMax';
export interface LayoutResult {
  values: OcrValues;
  /** Rectangle de chaque valeur trouvée, pour une 2e lecture ciblée */
  boxes: Partial<Record<Field, Box>>;
}

export function parseLayout(lines: Word[][], width: number): LayoutResult {
  const segs = toSegments(lines);
  // Ordre de lecture : de haut en bas, puis de gauche à droite
  segs.sort((a, b) => (Math.abs(a.y0 - b.y0) < (a.y1 - a.y0) * 0.5 ? a.x0 - b.x0 : a.y0 - b.y0));

  /** Valeur du n-ième (skip) libellé correspondant, avec le rectangle où elle a été lue. */
  const valueFor = (label: RegExp, read: (t: string) => number | undefined, skip = 0): { v: number; box: Box } | undefined => {
    let n = 0;
    for (const s of segs) {
      if (!label.test(s.text.trim())) continue;
      for (const c of candidates(s, segs, width)) {
        if (Object.values(LABELS).some((re) => re.test(c.text.trim()))) continue; // un autre libellé, pas une valeur
        const v = read(c.text);
        if (v !== undefined) {
          if (n++ >= skip) return { v, box: c };
          break;
        }
      }
    }
    return undefined;
  };

  const values: OcrValues = {};
  const boxes: Partial<Record<Field, Box>> = {};
  const take = (field: Field, r: { v: number; box: Box } | undefined) => {
    if (!r) return;
    values[field] = r.v;
    boxes[field] = r.box;
  };
  take('distanceKm', valueFor(LABELS.distanceKm, readKm));
  take('durationMin', valueFor(LABELS.durationMin, readDuration));
  take('elevationGain', valueFor(LABELS.elevationGain, readMeters));
  take('elevationLoss', valueFor(LABELS.elevationLoss, readMeters));
  take('hrAvg', valueFor(LABELS.hrAvg, readBpm) ?? valueFor(LABELS.hrCut, readBpm, 0));
  take('hrMax', valueFor(LABELS.hrMax, readBpm) ?? valueFor(LABELS.hrCut, readBpm, 1));
  return { values, boxes };
}
