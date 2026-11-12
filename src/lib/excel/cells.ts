// Petits outils pour lire des cellules ExcelJS (formules, texte enrichi, dates…).

/** Valeur « simple » d'une cellule : résultat des formules, texte des liens et du texte enrichi. */
export function plain(v: unknown): string | number | Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('result' in o) return plain(o.result);
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join('');
    if (typeof o.text === 'string') return o.text;
    if ('error' in o) return null;
  }
  return null;
}

export function text(v: unknown): string | undefined {
  const p = plain(v);
  if (p === null) return undefined;
  const s = (p instanceof Date ? p.toISOString() : String(p)).trim();
  return s === '' ? undefined : s;
}

export function number(v: unknown): number | undefined {
  const p = plain(v);
  if (typeof p === 'number') return Number.isFinite(p) ? p : undefined;
  if (typeof p === 'string') {
    const n = Number(p.replace(/[\s  ]/g, '').replace(',', '.').replace('%', ''));
    if (p.trim() === '' || !Number.isFinite(n)) return undefined;
    return p.includes('%') ? n / 100 : n;
  }
  return undefined;
}

/** Date Excel → « AAAA-MM-JJ ». Excel n'a pas de fuseau : ExcelJS renvoie minuit UTC. */
export function isoDate(v: unknown, fallbackYear?: number): string | undefined {
  const p = plain(v);
  const fmt = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (p instanceof Date) return fmt(p.getUTCFullYear(), p.getUTCMonth() + 1, p.getUTCDate());
  if (typeof p === 'number' && p > 30000 && p < 80000) {
    const d = new Date(Math.round((p - 25569) * 86_400_000));
    return fmt(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (typeof p === 'string') {
    const m = p.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (m) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : fallbackYear;
      if (y) return fmt(y, +m[2], +m[1]);
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(p)) return p.slice(0, 10);
  }
  return undefined;
}

/** Texte sans accents, en minuscules, pour comparer des en-têtes. */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
