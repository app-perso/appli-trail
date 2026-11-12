// Calculs d'analyse (cahier des charges §4) : couloir de sécurité, ratio de charge.
// Réutilisés par l'export et, à l'étape 5, par les écrans Charge et Progression.
import type { Activity, PlannedSession } from '../db/types';
import { kmEffort } from './calc';
import { addDays, mondayOf } from './dates';
import { FOOT_TYPES, weekTotals, type WeekTotals } from './week';

export const CORRIDOR_FACTOR = 1.15;

/** km-effort à pied par jour (séances faites uniquement). */
export function dailyKmEffort(activities: Activity[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of activities) {
    if (a.skipped || !FOOT_TYPES.includes(a.type)) continue;
    m.set(a.date, (m.get(a.date) ?? 0) + kmEffort(a.distanceKm, a.elevationGain));
  }
  return m;
}

/**
 * Ratio de charge au jour « day » = km-effort des 7 derniers jours ÷ (km-effort des 28 derniers jours / 4).
 * Renvoie undefined si l'historique couvre moins de 28 jours (ratio non significatif) ou si la charge chronique est nulle.
 */
export function loadRatio(daily: Map<string, number>, day: string, historyStart: string | undefined): number | undefined {
  if (!historyStart || addDays(historyStart, 27) > day) return undefined;
  let acute = 0;
  let chronic = 0;
  for (let i = 0; i < 28; i++) {
    const v = daily.get(addDays(day, -i)) ?? 0;
    chronic += v;
    if (i < 7) acute += v;
  }
  return chronic > 0 ? acute / (chronic / 4) : undefined;
}

/** Plafond du couloir pour une semaine = moyenne des (jusqu'à) 3 semaines précédentes × 1,15. */
export function corridorCeiling(previousWeeks: number[]): number | undefined {
  const prev = previousWeeks.slice(-3);
  if (!prev.length) return undefined;
  return (prev.reduce((a, b) => a + b, 0) / prev.length) * CORRIDOR_FACTOR;
}

export function loadZone(ratio: number): 'bas' | 'équilibré' | 'attention' | 'risque' {
  if (ratio < 0.8) return 'bas';
  if (ratio <= 1.3) return 'équilibré';
  if (ratio <= 1.5) return 'attention';
  return 'risque';
}

// ---------- Série hebdomadaire (Progression, export) ----------

export type Metric = 'km' | 'dPlus' | 'dMinus' | 'min';

export interface WeekStat {
  monday: string;
  sunday: string;
  label?: string;
  phase?: string;
  totals: WeekTotals;
  /** Semaine terminée (dimanche passé) */
  complete: boolean;
  /** Semaine en cours */
  current: boolean;
  future: boolean;
  /**
   * Semaine terminée avec des séances prévues mais AUCUN débrief (ni fait ni « pas fait ») :
   * les chiffres réalisés sont inconnus (et non nuls). Elle n'entre pas dans le calcul du couloir.
   */
  unknown: boolean;
  /** Plafond du couloir pour chaque indicateur (moyenne des 3 semaines terminées précédentes × 1,15) */
  ceiling: Partial<Record<Metric, number>>;
}

/** Valeur réalisée d'un indicateur (null si inconnue, ex. D− de l'historique v18). */
export function doneValue(t: WeekTotals, m: Metric): number | null {
  return m === 'km' ? t.doneKm : m === 'dPlus' ? t.doneDPlus : m === 'dMinus' ? t.doneDMinus : t.doneMin;
}
/** Valeur prévue d'un indicateur (pas de D− prévu). */
export function plannedValue(t: WeekTotals, m: Metric): number | null {
  return m === 'km' ? t.plannedKm : m === 'dPlus' ? t.plannedDPlus : m === 'dMinus' ? null : t.plannedMin;
}

export function weeklySeries(sessions: PlannedSession[], activities: Activity[], today: string, from: string, to: string): WeekStat[] {
  const out: WeekStat[] = [];
  const history: Record<Metric, number[]> = { km: [], dPlus: [], dMinus: [], min: [] };
  const curMonday = mondayOf(today);
  for (let mon = mondayOf(from); mon <= to; mon = addDays(mon, 7)) {
    const sun = addDays(mon, 6);
    const ws = sessions.filter((s) => s.date >= mon && s.date <= sun);
    const wa = activities.filter((a) => a.date >= mon && a.date <= sun);
    const totals = weekTotals(ws, wa);
    const ceiling: Partial<Record<Metric, number>> = {};
    for (const m of ['km', 'dPlus', 'dMinus', 'min'] as Metric[]) {
      const c = corridorCeiling(history[m]);
      if (c !== undefined) ceiling[m] = c;
    }
    const complete = sun < today;
    const unknown = complete && wa.length === 0 && ws.some((x) => x.type !== 'Repos');
    out.push({
      monday: mon,
      sunday: sun,
      label: ws.find((s) => s.week)?.week || undefined,
      phase: ws.find((s) => s.phase)?.phase || undefined,
      totals,
      complete,
      current: mon === curMonday,
      future: mon > today,
      unknown,
      ceiling,
    });
    // Seules les semaines terminées servent de référence aux suivantes
    if (complete && !unknown) {
      for (const m of ['km', 'dPlus', 'dMinus', 'min'] as Metric[]) {
        const v = doneValue(totals, m);
        if (v !== null) history[m].push(v);
      }
    }
  }
  return out;
}
