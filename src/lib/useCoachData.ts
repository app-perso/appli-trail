// Toutes les données utiles au coach, relues automatiquement quand la base change.
import { db } from '../db/db';
import { useLive } from './useLive';
import type { Data } from './coach';

export function useCoachData(): Data | undefined {
  return useLive(async () => {
    const [sessions, activities, checkIns] = await Promise.all([db.plannedSessions.toArray(), db.activities.toArray(), db.checkIns.toArray()]);
    return { sessions, activities, checkIns };
  });
}
