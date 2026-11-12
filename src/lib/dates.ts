/** Date du jour au format AAAA-MM-JJ (heure locale du téléphone). */
export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Nombre de jours entre aujourd'hui et la date donnée. */
export function daysUntil(iso: string, from = new Date()): number {
  const a = parseISO(todayISO(from)).getTime();
  const b = parseISO(iso).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** « 7 juillet 2027 » */
export function formatLongDate(iso: string): string {
  return parseISO(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** « 12 nov. 2026 à 10:42 » */
export function formatDateTime(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}
