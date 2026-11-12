// Le « coach » de l'appli (cahier des charges §4) : charge, alertes, feu du jour, récupération.
// Fonctions pures : elles reçoivent les données et la date du jour, et ne lisent pas la base.
import type { Activity, CheckIn, PlannedSession } from '../db/types';
import { kmEffort } from './calc';
import { addDays, mondayOf, sleepMinutes, weekDays } from './dates';
import { dailyKmEffort, loadRatio, loadZone, weeklySeries, type WeekStat } from './analysis';
import { FOOT_TYPES } from './week';
import { formatNumber } from './format';
import { R, corridorFactor, tolerance } from './rules';

export type Level = 'ok' | 'info' | 'warn' | 'stop';
export interface Alert {
  id: string;
  level: Level;
  icon: 'descente' | 'charge' | 'forme' | 'douleur' | 'couloir' | 'recup';
  title: string;
  text: string;
}

const isFoot = (a: { type: Activity['type'] }) => FOOT_TYPES.includes(a.type);
const doneFoot = (acts: Activity[]) => acts.filter((a) => !a.skipped && isFoot(a));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface Data {
  sessions: PlannedSession[];
  activities: Activity[];
  checkIns: CheckIn[];
}

// ---------- Ratio de charge ----------
export function currentRatio(d: Data, today: string) {
  const daily = dailyKmEffort(d.activities);
  const first = doneFoot(d.activities)
    .map((a) => a.date)
    .sort()[0];
  // Séances prévues sur les 7 derniers jours sans aucun débrief : le ratio serait faussement bas
  const weekAgo = addDays(today, -6);
  const recentActs = d.activities.filter((a) => a.date >= weekAgo && a.date <= today);
  const missing = d.sessions.filter(
    (s) => s.date >= weekAgo && s.date < today && s.type !== 'Repos' && !recentActs.some((a) => a.plannedSessionId === s.id),
  ).length;
  const stale = recentActs.length === 0 && missing > 0;
  const ratio = stale ? undefined : loadRatio(daily, today, first);
  return {
    ratio,
    zone: ratio === undefined ? undefined : loadZone(ratio),
    historyDays: first ? daysBetween(first, today) + 1 : 0,
    /** Nombre de séances passées des 7 derniers jours sans débrief */
    missing,
    stale,
  };
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

// ---------- Tuiles de la semaine (km-effort, D+, D−) vs moyenne des 4 semaines précédentes ----------
export interface Tile {
  value: number | null;
  avg: number | null;
  /** écart en % par rapport à la moyenne */
  diff: number | null;
  high: boolean;
}

export function weekTiles(d: Data, today: string): { keff: Tile; dPlus: Tile; dMinus: Tile } {
  const mon = mondayOf(today);
  const thisWeek = doneFoot(d.activities).filter((a) => a.date >= mon && a.date <= today);
  const prevWeeks = [1, 2, 3, 4].map((i) => {
    const m = addDays(mon, -7 * i);
    return doneFoot(d.activities).filter((a) => a.date >= m && a.date <= addDays(m, 6));
  });
  const tile = (val: (xs: Activity[]) => number | null, threshold = R().dmoins_semaine_facteur): Tile => {
    const value = val(thisWeek);
    const prev = prevWeeks.map(val).filter((v): v is number => v !== null);
    // Moyenne sur les semaines où il y a eu des sorties (évite qu'une semaine sans données écrase la moyenne)
    const active = prev.filter((v) => v > 0);
    const avg = active.length ? sum(active) / active.length : null;
    const diff = value !== null && avg ? ((value - avg) / avg) * 100 : null;
    return { value, avg, diff, high: value !== null && avg !== null && value > avg * threshold };
  };
  return {
    keff: tile((xs) => sum(xs.map((a) => kmEffort(a.distanceKm, a.elevationGain)))),
    dPlus: tile((xs) => sum(xs.map((a) => a.elevationGain))),
    dMinus: tile((xs) => {
      const known = xs.filter((a) => a.elevationLoss !== undefined);
      return xs.length && !known.length ? null : sum(known.map((a) => a.elevationLoss ?? 0));
    }),
  };
}

// ---------- Jour par jour (semaine en cours) ----------
export interface DayBar {
  date: string;
  done: number;
  planned: number;
  renfoDone: boolean;
  renfoPlanned: boolean;
  high: boolean;
}

export function dayBars(d: Data, today: string): DayBar[] {
  const mon = mondayOf(today);
  // Repère « grosse journée » : plus de 40 % du km-effort d'une semaine habituelle
  const tiles = weekTiles(d, today);
  const bigDay = tiles.keff.avg ? tiles.keff.avg * 0.4 : Infinity;
  return weekDays(mon).map((date) => {
    const acts = d.activities.filter((a) => a.date === date);
    const sess = d.sessions.filter((s) => s.date === date);
    const done = sum(doneFoot(acts).map((a) => kmEffort(a.distanceKm, a.elevationGain)));
    const doneIds = new Set(acts.map((a) => a.plannedSessionId));
    const planned = sum(
      sess
        .filter((s) => FOOT_TYPES.includes(s.type) && !doneIds.has(s.id) && date >= today)
        .map((s) => kmEffort(s.distanceKm ?? 0, s.elevationGain ?? 0)),
    );
    return {
      date,
      done,
      planned,
      renfoDone: acts.some((a) => a.type === 'Renfo' && !a.skipped),
      renfoPlanned: sess.some((s) => s.type === 'Renfo' && !doneIds.has(s.id)),
      high: done > bigDay,
    };
  });
}

// ---------- Alertes ----------
export function alerts(d: Data, today: string): Alert[] {
  const out: Alert[] = [];
  const fmt = (n: number) => formatNumber(n, 0);

  // Descente : D− cumulé sur 2 jours > 2 000 m (dans les 7 derniers jours)
  const dMinusOn = (date: string) => sum(doneFoot(d.activities).filter((a) => a.date === date).map((a) => a.elevationLoss ?? 0));
  for (let i = 0; i < 7; i++) {
    const day = addDays(today, -i);
    const two = dMinusOn(day) + dMinusOn(addDays(day, -1));
    if (two > R().dmoins_2j_max_m) {
      out.push({
        id: 'descente-2j',
        level: 'warn',
        icon: 'descente',
        title: 'Beaucoup de descente en 2 jours',
        text: `${fmt(two)} m de D− les ${formatShort(addDays(day, -1))} et ${formatShort(day)}. Quadris et genou très sollicités : prochaine séance très facile ou repos.`,
      });
      break;
    }
  }
  // Descente : D− de la semaine > 1,3 × moyenne des 4 semaines précédentes
  const t = weekTiles(d, today);
  if (t.dMinus.value !== null && t.dMinus.avg && t.dMinus.value > t.dMinus.avg * R().dmoins_semaine_facteur && !out.some((a) => a.id === 'descente-2j')) {
    out.push({
      id: 'descente-semaine',
      level: 'warn',
      icon: 'descente',
      title: 'Semaine chargée en descente',
      text: `${fmt(t.dMinus.value)} m de D− cette semaine, +${fmt(t.dMinus.diff ?? 0)} % par rapport à ta moyenne (${fmt(t.dMinus.avg)} m). Lève le pied sur les descentes.`,
    });
  }

  // Ratio de charge
  const r = currentRatio(d, today);
  if (r.ratio !== undefined && r.zone === 'risque')
    out.push({ id: 'ratio', level: 'stop', icon: 'charge', title: `Ratio de charge à ${formatNumber(r.ratio, 2)} : risque`, text: 'Tu as beaucoup plus chargé que d’habitude sur 7 jours. Allège les prochains jours (sortie courte et facile, ou repos).' });
  else if (r.ratio !== undefined && r.zone === 'attention')
    out.push({ id: 'ratio', level: 'warn', icon: 'charge', title: `Ratio de charge à ${formatNumber(r.ratio, 2)} : attention`, text: 'Charge en hausse rapide. Pas de nouvelle augmentation cette semaine.' });

  // Forme : forme ≤ 2/10 deux matins de suite, ou sommeil ≤ 2/5 trois nuits sur 7
  const ci = (date: string) => d.checkIns.find((c) => c.date === date);
  const lastTwo = [ci(today) ? today : addDays(today, -1)].flatMap((day) => [ci(day), ci(addDays(day, -1))]);
  const badSleep = [0, 1, 2, 3, 4, 5, 6].map((i) => ci(addDays(today, -i))).filter((c) => c?.sleepQuality !== undefined && c.sleepQuality <= R().qualite_sommeil_min).length;
  if (lastTwo.every((c) => c?.forme !== undefined && c.forme <= R().forme_min))
    out.push({ id: 'forme', level: 'warn', icon: 'forme', title: 'Forme basse deux matins de suite', text: 'Allège la séance du jour : version courte et facile, ou repos.' });
  else if (badSleep >= R().nuits_difficiles_max)
    out.push({ id: 'sommeil', level: 'warn', icon: 'forme', title: `Sommeil difficile ${badSleep} nuits sur 7`, text: 'Allège la séance du jour et vise un coucher vers 23h.' });

  // Douleur au réveil (règles genou / cheville)
  const todayCi = ci(today);
  const maxPain = todayCi ? Math.max(0, ...todayCi.pains.map((p) => p.score)) : 0;
  if (maxPain >= R().douleur_stop)
    out.push({ id: 'douleur', level: 'stop', icon: 'douleur', title: `Douleur ${maxPain}/10 ce matin`, text: 'Arrêt de la course à pied, avis kiné / médecin (gonflement ou boiterie : même règle).' });
  else if (maxPain >= 1)
    out.push({ id: 'douleur', level: 'warn', icon: 'douleur', title: `Douleur encore là au réveil (${maxPain}/10)`, text: 'Séance du jour sans dénivelé (ou vélo), pas de hausse de volume.' });

  // Couloir de sécurité (km à pied)
  const series = recentSeries(d, today);
  const cur = series.find((w) => w.current);
  const next = series.find((w) => w.monday === addDays(mondayOf(today), 7));
  if (cur?.ceiling.km !== undefined) {
    if (cur.totals.doneKm > cur.ceiling.km)
      out.push({ id: 'couloir', level: 'warn', icon: 'couloir', title: `Couloir dépassé : ${fmt(cur.totals.doneKm)} km, plafond ${fmt(cur.ceiling.km)} km`, text: 'Termine la semaine en facile, sans ajouter de volume.' });
    else if (cur.totals.plannedKm > cur.ceiling.km * tolerance())
      out.push({ id: 'couloir-prevu', level: 'info', icon: 'couloir', title: `${cur.label ?? 'Cette semaine'} : ${fmt(cur.totals.plannedKm)} km prévus, plafond ${fmt(cur.ceiling.km)} km`, text: 'Le plan dépasse le couloir de sécurité. Raccourcis une sortie si tu sens de la fatigue.' });
  }
  if (next && next.totals.plannedKm > 0 && cur) {
    // Plafond de la semaine prochaine si cette semaine se termine comme prévu
    const ref = series.filter((w) => w.complete && !w.unknown).slice(-2).map((w) => w.totals.doneKm);
    ref.push(Math.max(cur.totals.doneKm, cur.totals.plannedKm));
    const ceil = (sum(ref) / ref.length) * corridorFactor();
    if (next.totals.plannedKm > ceil * tolerance())
      out.push({ id: 'couloir-suivante', level: 'info', icon: 'couloir', title: `${next.label ?? 'Semaine prochaine'} : ${fmt(next.totals.plannedKm)} km prévus, plafond ~${fmt(ceil)} km`, text: 'Saut de volume au-dessus du couloir (+15 %). À ajuster dans le plan si possible.' });
  }

  // Hausse d'une semaine sur l'autre (règle « hausse_max_semaine_pct »)
  const pct = R().hausse_max_semaine_pct;
  const prevW = series.filter((w) => w.complete && !w.unknown).slice(-1)[0];
  if (pct > 0 && cur && prevW && prevW.totals.doneKm > 0) {
    const v = Math.max(cur.totals.doneKm, cur.totals.plannedKm);
    const lim = prevW.totals.doneKm * (1 + pct / 100);
    if (v > lim * tolerance())
      out.push({ id: 'hausse-semaine', level: 'info', icon: 'couloir', title: `+${fmt(((v - prevW.totals.doneKm) / prevW.totals.doneKm) * 100)} % de volume vs la semaine dernière`, text: `${fmt(v)} km cette semaine (prévus ou faits) contre ${fmt(prevW.totals.doneKm)} km la semaine dernière. La règle de ton plan : +${pct} % maximum.` });
  }

  // Nuit courte (règle « sommeil_min_h »)
  const ciToday = ci(today);
  const hSleep = ciToday?.bedTime && ciToday.wakeTime ? sleepMinutes(ciToday.bedTime, ciToday.wakeTime) / 60 : undefined;
  if (hSleep !== undefined && hSleep < R().sommeil_min_h)
    out.push({ id: 'nuit-courte', level: 'warn', icon: 'forme', title: `Nuit courte : ${formatNumber(hSleep, 1)} h`, text: `Sous ton seuil de ${formatNumber(R().sommeil_min_h, 1)} h : allège la séance du jour.` });

  // Fatigue ressentie élevée après une séance récente (règle « fatigue_alerte »)
  const tired = d.activities
    .filter((a) => !a.skipped && a.date >= addDays(today, -2) && a.date <= today && (a.feelings.fatigue ?? 0) >= R().fatigue_alerte)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (tired)
    out.push({ id: 'fatigue', level: 'warn', icon: 'forme', title: `Fatigue ${tired.feelings.fatigue}/10 après ta séance du ${formatShort(tired.date)}`, text: 'Garde la séance suivante facile ou raccourcis-la.' });

  // Récupération : 1 semaine allégée toutes les N
  const rec = recoveryAdvice(series);
  if (rec) out.push(rec);

  const order: Record<Level, number> = { stop: 0, warn: 1, info: 2, ok: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** Semaines de l'historique jusqu'à la semaine prochaine. */
export function recentSeries(d: Data, today: string, weeksBack = 12): WeekStat[] {
  const dates = [...d.sessions.map((s) => s.date), ...d.activities.map((a) => a.date)].sort();
  const from = dates[0] && dates[0] > addDays(today, -7 * weeksBack) ? dates[0] : addDays(today, -7 * weeksBack);
  return weeklySeries(d.sessions, d.activities, today, from, addDays(mondayOf(today), 13));
}

/**
 * 3 semaines de construction d'affilée (aucune baisse de 25 % ou plus) → proposer une semaine allégée (−25 à −35 %).
 */
export function recoveryAdvice(series: WeekStat[]): Alert | null {
  const done = series.filter((w) => w.complete).map((w) => w.totals.doneKm);
  const need = R().semaine_allegee_toutes_les - 1;
  if (done.length < need || done.slice(-need).every((v) => v === 0)) return null;
  let build = 0;
  for (let i = done.length - 1; i >= 1; i--) {
    if (done[i] >= done[i - 1] * (1 - R().allegement_pct / 100 + 0.05) && done[i] > 0) build++;
    else break;
  }
  if (build < need) return null;
  const ref = done[done.length - 1];
  return {
    id: 'recup',
    level: 'info',
    icon: 'recup',
    title: 'Semaine allégée conseillée',
    text: `${build} semaines de construction d'affilée. Vise environ ${formatNumber(ref * (1 - R().allegement_pct / 100 - 0.05), 0)}-${formatNumber(ref * (1 - R().allegement_pct / 100 + 0.05), 0)} km cette semaine (−${R().allegement_pct} % environ) pour assimiler.`,
  };
}

function formatShort(iso: string) {
  return new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }).replace('.', '');
}

// ---------- Feu du jour ----------
export type Light = 'vert' | 'orange' | 'rouge';
export interface Feu {
  light: Light | null;
  reasons: string[];
}

/** Feu vert / orange / rouge à partir du check-in du jour (sommeil, forme, douleur) et du ratio de charge. */
export function feuDuJour(d: Data, today: string): Feu {
  const ci = d.checkIns.find((c) => c.date === today);
  if (!ci) return { light: null, reasons: ['Fais ton check-in pour avoir le feu du jour.'] };
  const red: string[] = [];
  const orange: string[] = [];
  const maxPain = Math.max(0, ...ci.pains.map((p) => p.score));
  if (maxPain >= R().douleur_stop) red.push(`douleur ${maxPain}/10`);
  else if (maxPain >= 3) orange.push(`douleur ${maxPain}/10`);
  else if (maxPain >= 1) orange.push(`douleur encore là au réveil (${maxPain}/10)`);

  const yesterday = d.checkIns.find((c) => c.date === addDays(today, -1));
  if (ci.forme !== undefined && ci.forme <= R().forme_min && yesterday?.forme !== undefined && yesterday.forme <= R().forme_min) red.push('forme basse 2 matins de suite');
  else if (ci.forme !== undefined && ci.forme <= R().forme_orange) orange.push(`forme ${ci.forme}/10`);

  const sleepH = ci.bedTime && ci.wakeTime ? sleepMinutes(ci.bedTime, ci.wakeTime) / 60 : undefined;
  if (ci.sleepQuality !== undefined && ci.sleepQuality <= R().qualite_sommeil_min) orange.push('nuit difficile');
  else if (sleepH !== undefined && sleepH < R().sommeil_min_h) orange.push(`${formatNumber(sleepH, 1)} h de sommeil`);

  const r = currentRatio(d, today);
  if (r.zone === 'risque') red.push(`charge très élevée (ratio ${formatNumber(r.ratio!, 2)})`);
  else if (r.zone === 'attention') orange.push(`charge en hausse (ratio ${formatNumber(r.ratio!, 2)})`);

  if (red.length) return { light: 'rouge', reasons: [...red, ...orange] };
  if (orange.length) return { light: 'orange', reasons: orange };
  return { light: 'vert', reasons: ['bonne forme, charge maîtrisée'] };
}

// ---------- Anneaux de la semaine ----------
export function weekRings(d: Data, today: string) {
  const mon = mondayOf(today);
  const sun = addDays(mon, 6);
  const sess = d.sessions.filter((s) => s.date >= mon && s.date <= sun && s.type !== 'Repos');
  const acts = d.activities.filter((a) => a.date >= mon && a.date <= sun && !a.skipped);
  const foot = acts.filter(isFoot);
  return {
    km: { done: sum(foot.map((a) => a.distanceKm)), planned: sum(sess.filter((s) => FOOT_TYPES.includes(s.type)).map((s) => s.distanceKm ?? 0)) },
    dPlus: { done: sum(foot.map((a) => a.elevationGain)), planned: sum(sess.filter((s) => FOOT_TYPES.includes(s.type)).map((s) => s.elevationGain ?? 0)) },
    renfo: { done: acts.filter((a) => a.type === 'Renfo').length, planned: sess.filter((s) => s.type === 'Renfo').length },
  };
}
