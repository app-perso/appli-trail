// Totaux d'une semaine (lundi → dimanche) : prévu vs fait (cahier des charges §4).
import type { Activity, PlannedSession, SessionType } from '../db/types';
import { kmEffort } from './calc';

/** Types comptés « à pied » : course à pied, rando, compétition. */
export const FOOT_TYPES: SessionType[] = ['Running', 'Rando', 'Course'];
const isFoot = (t: SessionType) => FOOT_TYPES.includes(t);

export interface WeekTotals {
  plannedKm: number;
  plannedDPlus: number;
  plannedMin: number;
  plannedSessions: number;
  doneKm: number;
  doneDPlus: number;
  /** null si aucune D− connue cette semaine */
  doneDMinus: number | null;
  doneMin: number;
  doneSessions: number;
  skippedSessions: number;
  doneKmEffort: number;
  renfoPlanned: number;
  renfoDone: number;
}

export function weekTotals(sessions: PlannedSession[], activities: Activity[]): WeekTotals {
  const planned = sessions.filter((s) => s.type !== 'Repos');
  const done = activities.filter((a) => !a.skipped && a.type !== 'Repos');
  const foot = done.filter((a) => isFoot(a.type));
  const dMinus = foot.filter((a) => a.elevationLoss !== undefined);
  return {
    plannedKm: planned.filter((s) => isFoot(s.type)).reduce((t, s) => t + (s.distanceKm ?? 0), 0),
    plannedDPlus: planned.filter((s) => isFoot(s.type)).reduce((t, s) => t + (s.elevationGain ?? 0), 0),
    plannedMin: planned.reduce((t, s) => t + (s.durationMin ?? 0), 0),
    plannedSessions: planned.length,
    doneKm: foot.reduce((t, a) => t + a.distanceKm, 0),
    doneDPlus: foot.reduce((t, a) => t + a.elevationGain, 0),
    doneDMinus: dMinus.length ? dMinus.reduce((t, a) => t + (a.elevationLoss ?? 0), 0) : null,
    doneMin: done.reduce((t, a) => t + a.durationMin, 0),
    doneSessions: done.length,
    skippedSessions: activities.filter((a) => a.skipped).length,
    doneKmEffort: foot.reduce((t, a) => t + kmEffort(a.distanceKm, a.elevationGain), 0),
    renfoPlanned: planned.filter((s) => s.type === 'Renfo').length,
    renfoDone: done.filter((a) => a.type === 'Renfo').length,
  };
}
