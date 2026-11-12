// Calculs d'analyse (cahier des charges §4) : couloir de sécurité, ratio de charge.
// Réutilisés par l'export et, à l'étape 5, par les écrans Charge et Progression.
import type { Activity } from '../db/types';
import { kmEffort } from './calc';
import { addDays } from './dates';
import { FOOT_TYPES } from './week';

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
