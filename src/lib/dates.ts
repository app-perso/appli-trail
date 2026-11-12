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

/** Minutes écoulées entre le coucher et le lever (gère le passage de minuit). */
export function sleepMinutes(bedTime: string, wakeTime: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  let d = toMin(wakeTime) - toMin(bedTime);
  if (d <= 0) d += 24 * 60;
  return d;
}

/** « jeudi 12 novembre » */
export function formatWeekday(iso: string): string {
  return parseISO(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Ajoute n jours à une date AAAA-MM-JJ. */
export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return todayISO(d);
}

/** Lundi de la semaine qui contient cette date (semaines du lundi au dimanche). */
export function mondayOf(iso: string): string {
  const d = parseISO(iso);
  const dow = (d.getDay() + 6) % 7; // lundi = 0
  return addDays(iso, -dow);
}

/** Les 7 jours (lundi → dimanche) d'une semaine. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** « Lun 9 » */
export function formatDayShort(iso: string): { dow: string; day: number } {
  const d = parseISO(iso);
  const dow = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
  return { dow: dow.charAt(0).toUpperCase() + dow.slice(1), day: d.getDate() };
}

/** « 9 → 15 nov. » ou « 27 oct. → 2 nov. » */
export function formatWeekRange(monday: string): string {
  const a = parseISO(monday);
  const b = parseISO(addDays(monday, 6));
  const m = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'short' });
  return a.getMonth() === b.getMonth() ? `${a.getDate()} → ${b.getDate()} ${m(b)}` : `${a.getDate()} ${m(a)} → ${b.getDate()} ${m(b)}`;
}
