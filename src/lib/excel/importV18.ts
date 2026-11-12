// Import de l'historique depuis le fichier Excel « Prepa_Trail_Soleil_Levens » (v18).
// Seule la feuille « Plan » est lue (+ FC repos / max de « Zones & règles »).
// Le fichier n'est jamais envoyé nulle part : tout se passe sur le téléphone.
import type { Workbook, Worksheet } from 'exceljs';
import type { Activity, CheckIn, PlannedSession, SessionType } from '../../db/types';
import { isoDate, norm, number, text } from './cells';

export interface V18Result {
  sessions: PlannedSession[];
  activities: Activity[];
  checkIns: CheckIn[];
  hr?: { hrRest: number; hrMax: number };
  firstDate?: string;
  lastDate?: string;
  warnings: string[];
}

// Colonnes reconnues d'après leur titre (ligne d'en-têtes). Entre parenthèses : position par défaut (§8).
const COLUMNS = {
  week: { re: /^semaine$/, col: 1 },
  phase: { re: /^phase$/, col: 2 },
  date: { re: /^date$/, col: 3 },
  type: { re: /^type$/, col: 5 },
  key: { re: /^cle$/, col: 6 },
  title: { re: /^seance$/, col: 7 },
  durPlan: { re: /^duree prevue/, col: 8 },
  kmPlan: { re: /^distance prevue/, col: 9 },
  dPlusPlan: { re: /^d\+ prevu/, col: 10 },
  intensity: { re: /^intensite/, col: 11 },
  instructions: { re: /^consignes/, col: 12 },
  durDone: { re: /^duree realisee/, col: 13 },
  kmDone: { re: /^distance realisee/, col: 14 },
  dPlusDone: { re: /^d\+ realise/, col: 15 },
  hrAvg: { re: /^fc moy/, col: 16 },
  hrMax: { re: /^fc max/, col: 17 },
  z1: { re: /zone 1$/, col: 18 },
  z2: { re: /zone 2$/, col: 19 },
  z3: { re: /zone 3$/, col: 20 },
  z4: { re: /zone 4$/, col: 21 },
  z5: { re: /zone 5$/, col: 22 },
  rpe: { re: /^rpe/, col: 23 },
  knee: { re: /^douleur genou/, col: 24 },
  forme: { re: /^forme matin/, col: 25 },
  sleep: { re: /^sommeil/, col: 26 },
  comment: { re: /^commentaire/, col: 27 },
} as const;
type Col = keyof typeof COLUMNS;

/** « D− 1 547 m », « D- 1547m », « D – 810 m » dans un commentaire → 1547 */
export function dMinusFromComment(comment: string | undefined): number | undefined {
  const m = comment?.match(/\bD\s?[−–-]\s*:?\s*(\d{1,2}[\s\u00a0\u202f]?\d{3}|\d{1,4})\s*m\b/);
  if (!m) return undefined;
  const v = Number(m[1].replace(/[\s\u00a0\u202f]/g, ''));
  return v > 0 && v < 15000 ? v : undefined;
}

const SKIPPED = /\bpas fait\b|\bpas le temps\b|\bpas de course\b|\bannul|\bpas pu\b/i;

function mapType(raw: string | undefined): SessionType {
  const t = norm(raw ?? '');
  if (t.startsWith('velo')) return 'Vélo';
  if (t.startsWith('rando')) return 'Rando';
  if (t.startsWith('renfo')) return 'Renfo';
  if (t.startsWith('repos')) return 'Repos';
  if (t.startsWith('compet') || t === 'course') return 'Course';
  return 'Running';
}

/** Identifiant stable : réimporter le fichier met à jour au lieu de dupliquer. */
function stableId(date: string, type: string, title: string, used: Set<string>): string {
  const slug = norm(`${type} ${title}`)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  let id = `v18-${date}-${slug}`;
  for (let i = 2; used.has(id); i++) id = `v18-${date}-${slug}-${i}`;
  used.add(id);
  return id;
}

function findHeader(ws: Worksheet): { row: number; cols: Record<Col, number> } | null {
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const titles = new Map<number, string>();
    ws.getRow(r).eachCell((cell, c) => {
      const t = text(cell.value);
      if (t) titles.set(c, norm(t));
    });
    if (![...titles.values()].includes('date') || ![...titles.values()].includes('seance')) continue;
    const cols = {} as Record<Col, number>;
    for (const [k, { re, col }] of Object.entries(COLUMNS) as [Col, { re: RegExp; col: number }][]) {
      const found = [...titles.entries()].find(([, t]) => re.test(t));
      cols[k] = found ? found[0] : col;
    }
    return { row: r, cols };
  }
  return null;
}

export function parseV18(wb: Workbook): V18Result {
  const ws = wb.worksheets.find((w) => norm(w.name) === 'plan') ?? wb.worksheets[0];
  if (!ws) throw new Error('Le fichier ne contient aucune feuille.');
  const header = findHeader(ws);
  if (!header) throw new Error("Feuille « Plan » introuvable : il manque la ligne d'en-têtes (Semaine, Date, Séance…).");

  const res: V18Result = { sessions: [], activities: [], checkIns: [], warnings: [] };
  const used = new Set<string>();
  const mornings = new Map<string, { forme?: number; sleep?: number }>();
  let lastYear: number | undefined;

  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: Col) => row.getCell(header.cols[k]).value;
    const title = text(get('title'));
    const date = isoDate(get('date'), lastYear);
    if (!title && !date) continue;
    if (!date) {
      res.warnings.push(`Ligne ${r} ignorée : date illisible.`);
      continue;
    }
    lastYear = +date.slice(0, 4);
    const type = mapType(text(get('type')));
    const id = stableId(date, type, title ?? type, used);
    const comment = text(get('comment'));

    const durDone = number(get('durDone'));
    const kmDone = number(get('kmDone'));
    const dPlusDone = number(get('dPlusDone'));
    const hrAvg = number(get('hrAvg'));
    const hrMax = number(get('hrMax'));
    const zonesRaw = (['z1', 'z2', 'z3', 'z4', 'z5'] as const).map((k) => number(get(k)));
    const rpe = number(get('rpe'));
    const knee = number(get('knee'));
    const hasMetrics = [durDone, kmDone, dPlusDone, hrAvg, hrMax].some((v) => v !== undefined);

    const session: PlannedSession = {
      id,
      date,
      week: text(get('week')) ?? '',
      phase: text(get('phase')) ?? '',
      type,
      isKey: (text(get('key')) ?? '').includes('⭐'),
      title: title ?? type,
      durationMin: number(get('durPlan')),
      distanceKm: number(get('kmPlan')),
      elevationGain: number(get('dPlusPlan')),
      intensity: text(get('intensity')),
      instructions: text(get('instructions')),
      source: 'excel-v18',
    };

    if (hasMetrics || (comment && SKIPPED.test(comment) && type !== 'Repos')) {
      const zones = zonesRaw.some((z) => z !== undefined)
        ? (zonesRaw.map((z) => {
            const v = z ?? 0;
            return v > 1 ? v / 100 : v; // accepte 38 ou 0,38
          }) as Activity['zones'])
        : undefined;
      res.activities.push({
        id: `${id}-fait`,
        plannedSessionId: id,
        date,
        type,
        durationMin: durDone ?? 0,
        distanceKm: kmDone ?? 0,
        elevationGain: dPlusDone ?? 0,
        // Le fichier n'a pas de colonne D− : on le reprend s'il est écrit dans le commentaire (« D− 1 547 m »)
        elevationLoss: hasMetrics ? dMinusFromComment(comment) : undefined,
        hrAvg,
        hrMax,
        zones,
        feelings: {},
        pains: knee !== undefined ? [{ zone: 'Genou', score: knee }] : [],
        rpe,
        note: comment,
        skipped: hasMetrics ? undefined : true,
        source: 'excel-v18',
      });
    } else if (comment) {
      session.note = comment;
    }
    res.sessions.push(session);

    // Forme du matin et sommeil : un seul check-in par jour (première valeur trouvée)
    const forme = number(get('forme'));
    const sleep = number(get('sleep'));
    if (forme !== undefined || sleep !== undefined) {
      const m = mornings.get(date) ?? {};
      m.forme ??= forme;
      m.sleep ??= sleep;
      mornings.set(date, m);
    }
  }

  for (const [date, m] of mornings) {
    res.checkIns.push({
      id: `v18-checkin-${date}`,
      date,
      sleepQuality: m.sleep !== undefined ? Math.min(5, Math.max(1, Math.round(m.sleep))) : undefined,
      forme: m.forme !== undefined ? Math.min(10, Math.max(0, Math.round(m.forme * 2))) : undefined,
      pains: [],
      source: 'excel-v18',
    });
  }

  const dates = res.sessions.map((s) => s.date).sort();
  res.firstDate = dates[0];
  res.lastDate = dates[dates.length - 1];

  // FC repos / max dans « Zones & règles »
  const zr = wb.worksheets.find((w) => norm(w.name).startsWith('zones'));
  if (zr) {
    let hrRest: number | undefined;
    let hrMaxS: number | undefined;
    zr.eachRow((row) => {
      const label = norm(text(row.getCell(1).value) ?? '');
      if (label === 'fc repos') hrRest = number(row.getCell(2).value);
      if (label === 'fc max') hrMaxS = number(row.getCell(2).value);
    });
    if (hrRest && hrMaxS && hrRest < hrMaxS) res.hr = { hrRest, hrMax: hrMaxS };
  }
  if (!res.sessions.length) throw new Error('Aucune séance trouvée dans la feuille « Plan ».');
  return res;
}

export async function readV18File(file: Blob): Promise<V18Result> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error("Ce fichier n'est pas un fichier Excel (.xlsx) lisible.");
  }
  return parseV18(wb);
}
