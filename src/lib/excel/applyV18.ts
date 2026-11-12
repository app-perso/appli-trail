// Enregistre l'historique importé du fichier v18 dans la base du téléphone.
import { db, getSettings, updateSettings } from '../../db/db';
import { karvonenZones } from '../calc';
import type { V18Result } from './importV18';

export interface ApplyReport {
  sessions: number;
  activities: number;
  checkIns: number;
  checkInsKept: number;
}

/**
 * Réimporter le même fichier met à jour les éléments déjà importés (mêmes identifiants), sans doublon.
 * Ce qui a été saisi dans l'appli n'est jamais écrasé : un check-in du même jour est conservé.
 */
export async function applyV18(r: V18Result): Promise<ApplyReport> {
  let checkInsKept = 0;
  await db.transaction('rw', db.plannedSessions, db.activities, db.checkIns, async () => {
    await db.plannedSessions.bulkPut(r.sessions);
    await db.activities.bulkPut(r.activities);
    const existing = await db.checkIns.where('date').anyOf(r.checkIns.map((c) => c.date)).toArray();
    const ownDates = new Set(existing.filter((c) => c.source !== 'excel-v18').map((c) => c.date));
    const toPut = r.checkIns.filter((c) => !ownDates.has(c.date));
    checkInsKept = r.checkIns.length - toPut.length;
    await db.checkIns.bulkPut(toPut);
  });
  if (r.hr) {
    const s = await getSettings();
    if (s.hrRest !== r.hr.hrRest || s.hrMax !== r.hr.hrMax) {
      await updateSettings({ ...r.hr, zones: karvonenZones(r.hr.hrRest, r.hr.hrMax) });
    }
  }
  return { sessions: r.sessions.length, activities: r.activities.length, checkIns: r.checkIns.length - checkInsKept, checkInsKept };
}
