// Nombres au format français : virgule décimale, espace pour les milliers (« 1 650 m »).
const nf = (digits: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export function formatNumber(n: number, digits = 1): string {
  // Intl utilise une espace fine insécable : on la remplace par une espace insécable classique
  return nf(digits).format(n).replace(/ /g, ' ');
}

export const km = (n: number) => `${formatNumber(n)} km`;
export const meters = (n: number) => `${formatNumber(n, 0)} m`;

/** 90 → « 1h30 », 45 → « 45 min », 120 → « 2h » */
export function formatDuration(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}

/** Lit un nombre tapé à la française (« 11,2 ») ; renvoie undefined si vide ou invalide. */
export function parseDecimal(raw: string): number | undefined {
  const v = Number(raw.replace(/\s/g, '').replace(',', '.'));
  return raw.trim() === '' || !Number.isFinite(v) ? undefined : v;
}
