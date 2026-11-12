// Extraction des valeurs d'une capture Suunto (écran « Stats », en français) à partir du texte lu.
// Principe : repérer le libellé (Distance, Durée, Ascension…) puis la valeur qui le suit.
// Une valeur introuvable reste vide : elle se saisit à la main sur l'écran de vérification.

export interface OcrValues {
  distanceKm?: number;
  durationMin?: number;
  elevationGain?: number;
  elevationLoss?: number;
  hrAvg?: number;
  hrMax?: number;
  /** % de temps en zone 1 à 5 (0-100) */
  zones?: [number, number, number, number, number];
}

export const OCR_FIELDS = ['distanceKm', 'durationMin', 'elevationGain', 'elevationLoss', 'hrAvg', 'hrMax'] as const;

/** Corrige les confusions classiques de lecture dans les nombres (O→0, l→1…). */
function cleanDigits(s: string): string {
  return s.replace(/(?<=\d)[oO](?=\d|\b)/g, '0').replace(/(?<=\d)[lI|](?=\d)/g, '1');
}

const num = (s: string) => Number(s.replace(/[\s  ]/g, '').replace(',', '.'));

/** Lignes à examiner, dans l'ordre : fin de la ligne du libellé, 2 lignes suivantes, puis la ligne d'avant. */
function around(lines: string[], label: RegExp, from = 0): { candidates: string[]; index: number } | null {
  for (let i = from; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (m && m.index !== undefined) {
      const rest = lines[i].slice(m.index + m[0].length);
      return { candidates: [rest, lines[i + 1] ?? '', lines[i + 2] ?? '', lines[i - 1] ?? ''], index: i };
    }
  }
  return null;
}

/** Première valeur lisible en parcourant les lignes une par une (évite de prendre la valeur d'un autre libellé). */
function firstValue<T>(candidates: string[], read: (txt: string) => T | undefined): T | undefined {
  for (const c of candidates) {
    const v = read(c);
    if (v !== undefined) return v;
  }
  return undefined;
}

function find<T>(lines: string[], label: RegExp, read: (txt: string) => T | undefined): T | undefined {
  const ctx = around(lines, label);
  return ctx ? firstValue(ctx.candidates, read) : undefined;
}

// --- Lecteurs de valeurs ---
function readKm(t: string): number | undefined {
  const m = t.match(/(\d{1,3}(?:[.,]\d{1,3})?)\s*km(?!\s*\/?\s*h)/i);
  const v = m ? num(m[1]) : undefined;
  return v !== undefined && v > 0 && v < 400 ? v : undefined;
}

function readDuration(t: string): number | undefined {
  // Ignore l'allure (« 9'18 /km »)
  const s = t.split('\n').filter((l) => !/\/\s*km/i.test(l)).join('\n');
  let m = s.match(/(\d{1,2})\s*[:h]\s*(\d{2})\s*[''’′`:.]\s*(\d{2})/); // 1:44'23 · 1:44:23 · 1h44'23
  if (m) return +m[1] * 60 + +m[2] + +m[3] / 60;
  m = s.match(/(\d{1,2})\s*h\s*(\d{1,2})\s*(?:min|m)?\b/i); // 1 h 44 min
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/(\d{1,2}):(\d{2})(?![\d'’′])/); // 1:44
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/(\d{1,2})\s*[''’′]\s*(\d{2})/); // 44'23 (moins d'une heure)
  if (m) return +m[1] + +m[2] / 60;
  m = s.match(/(\d{1,3})\s*min/i);
  if (m) return +m[1];
  return undefined;
}

function readMeters(t: string): number | undefined {
  const m = t.match(/(\d{1,2}[\s  .]\d{3}|\d{1,4})\s*m(?![a-zé/])/i);
  const v = m ? num(m[1].replace('.', '')) : undefined;
  return v !== undefined && v < 15000 ? v : undefined;
}

function readBpm(t: string): number | undefined {
  const m = t.match(/(\d{2,3})\s*(?:[bo0][pr]n?m|bat)/i) ?? t.match(/(?<![\d:'’,.])(\d{2,3})(?![\d:'’,.%])/);
  const v = m ? +m[1] : undefined;
  return v !== undefined && v >= 40 && v <= 230 ? v : undefined;
}

function readZones(lines: string[]): OcrValues['zones'] {
  const start = Math.max(0, lines.findIndex((l) => /zones?/i.test(l)));
  const found: (number | undefined)[] = [undefined, undefined, undefined, undefined, undefined];
  for (const l of lines.slice(start)) {
    // « 5  0:02'10  2 % » ou « Zone 4 ... 10 % »
    const m = l.match(/^\W{0,3}(?:zone\s*)?([1-5])\b(?!\s*[:'’,.]\d).*?(\d{1,3}(?:[.,]\d)?)\s*%/i);
    if (m) {
      const z = +m[1] - 1;
      if (found[z] === undefined) found[z] = num(m[2]);
    }
  }
  const n = found.filter((v) => v !== undefined).length;
  if (n >= 3) {
    const zones = found.map((v) => v ?? 0) as [number, number, number, number, number];
    const sum = zones.reduce((a, b) => a + b, 0);
    if (sum >= 90 && sum <= 110) return zones;
  }
  // Secours : 5 pourcentages à la suite après « Zones » (dans l'ordre 5, 4, 3, 2, 1)
  const pcts = lines
    .slice(start)
    .join('\n')
    .match(/\d{1,3}(?:[.,]\d)?\s*%/g)
    ?.map((p) => num(p.replace('%', '')));
  if (pcts && pcts.length >= 5) {
    const five = pcts.slice(0, 5);
    const sum = five.reduce((a, b) => a + b, 0);
    if (sum >= 90 && sum <= 110) return [five[4], five[3], five[2], five[1], five[0]];
  }
  return undefined;
}

export function parseSuunto(text: string): OcrValues {
  const lines = cleanDigits(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const out: OcrValues = {};

  out.distanceKm = find(lines, /\bdistance\b/i, readKm);
  out.durationMin = find(lines, /\bdur[ée]e\b(?!\s*(?:de|du|en)\b)/i, readDuration);
  out.elevationGain = find(lines, /\b(?:ascension|mont[ée]e|d[ée]nivel[ée]\s*(?:positif|\+)|D\+)/i, readMeters);
  out.elevationLoss = find(lines, /\b(?:descente|d[ée]nivel[ée]\s*(?:n[ée]gatif|-|−)|D[-−])/i, readMeters);

  // FC : « Fréquence cardiaque moy. » puis « Fréquence cardiaque max. »
  const hr = /(?:fr[ée]q\w*\s*card\w*|\bFC\b)/i;
  out.hrAvg = find(lines, new RegExp(hr.source + /\s*(?:moy|moyenne)\b\.?/.source, 'i'), readBpm);
  out.hrMax = find(lines, new RegExp(hr.source + /\s*max\w*\.?/.source, 'i'), readBpm);
  if (out.hrAvg === undefined || out.hrMax === undefined) {
    // Secours : 1re occurrence = moyenne, 2e = max
    const first = around(lines, hr);
    const second = first ? around(lines, hr, first.index + 1) : null;
    if (out.hrAvg === undefined && first) out.hrAvg = firstValue(first.candidates, readBpm);
    if (out.hrMax === undefined && second) out.hrMax = firstValue(second.candidates, readBpm);
  }

  out.zones = readZones(lines);

  for (const k of Object.keys(out) as (keyof OcrValues)[]) if (out[k] === undefined) delete out[k];
  if (out.durationMin !== undefined) out.durationMin = Math.round(out.durationMin * 10) / 10;
  return out;
}

/** Fusionne les résultats de plusieurs captures : la première valeur trouvée l'emporte. */
export function mergeValues(list: OcrValues[]): OcrValues {
  const out: OcrValues = {};
  for (const v of list) for (const [k, val] of Object.entries(v)) if ((out as Record<string, unknown>)[k] === undefined) (out as Record<string, unknown>)[k] = val;
  return out;
}
