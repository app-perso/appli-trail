// Nombres au format français : virgule décimale, espace pour les milliers (« 1 650 m »).
const nf = (digits: number) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export function formatNumber(n: number, digits = 1): string {
  // Intl utilise une espace fine insécable : on la remplace par une espace insécable classique
  return nf(digits).format(n).replace(/ /g, ' ');
}

export const km = (n: number) => `${formatNumber(n)} km`;
export const meters = (n: number) => `${formatNumber(n, 0)} m`;
