// Enregistre l'historique importé du fichier Excel dans la base du téléphone.
// Pour les données importées, le fichier fait foi : une séance importée qui n'est plus dans le fichier
// (plan recalé, séance renommée) est retirée — sauf si son débrief a été fait dans l'appli.
import { db, getSettings, updateSettings } from '../../db/db';
import { karvonenZones } from '../calc';
import type { V18Result } from './importV18';

export interface ImportDiff {
  added: number;
  updated: number;
  /** Séances importées précédemment et absentes du nouveau fichier : retirées */
  removed: string[];
  /** Séances absentes du fichier mais gardées car leur débrief a été fait dans l'appli */
  kept: string[];
}

export interface ApplyReport extends ImportDiff {
  sessions: number;
  activities: number;
  checkIns: number;
  checkInsKept: number;
}

/** Compare le fichier à ce qui est déjà dans l'appli (pour l'aperçu, rien n'est modifié). */
export async function diffV18(r: V18Result): Promise<ImportDiff> {
  const existing = await db.plannedSessions.filter((s) => s.source === 'excel-v18').toArray();
  const inFile = new Set(r.sessions.map((s) => s.id));
  const existingIds = new Set(existing.map((s) => s.id));
  const gone = existing.filter((s) => !inFile.has(s.id));
  const appDebriefs = new Set(
    (await db.activities.where('plannedSessionId').anyOf(gone.map((s) => s.id)).toArray())
      .filter((a) => a.source !== 'excel-v18')
      .map((a) => a.plannedSessionId),
  );
  const label = (s: { date: string; title: string }) => `${s.date.slice(8)}/${s.date.slice(5, 7)} ${s.title}`;
  return {
    added: r.sessions.filter((s) => !existingIds.has(s.id)).length,
    updated: r.sessions.filter((s) => existingIds.has(s.id)).length,
    removed: gone.filter((s) => !appDebriefs.has(s.id)).map(label),
    kept: gone.filter((s) => appDebriefs.has(s.id)).map(label),
  };
}

/**
 * Réimporter met à jour les éléments déjà importés (mêmes identifiants), sans doublon.
 * Ce qui a été saisi dans l'appli n'est jamais écrasé : un check-in ou un débrief fait dans l'appli est conservé.
 */
export async function applyV18(r: V18Result): Promise<ApplyReport> {
  const diff = await diffV18(r);
  let checkInsKept = 0;
  await db.transaction('rw', db.plannedSessions, db.activities, db.checkIns, async () => {
    // 1. Retire les séances importées qui ne sont plus dans le fichier (sauf débrief fait dans l'appli)
    const inFile = new Set(r.sessions.map((s) => s.id));
    const old = await db.plannedSessions.filter((s) => s.source === 'excel-v18' && !inFile.has(s.id)).toArray();
    for (const s of old) {
      const acts = await db.activities.where('plannedSessionId').equals(s.id).toArray();
      if (acts.some((a) => a.source !== 'excel-v18')) continue;
      await db.activities.bulkDelete(acts.map((a) => a.id));
      await db.plannedSessions.delete(s.id);
    }
    // 2. Séances du fichier
    await db.plannedSessions.bulkPut(r.sessions);
    // 3. Séances réalisées : un débrief fait dans l'appli sur la même séance a priorité sur le fichier
    const appDone = new Set(
      (await db.activities.where('plannedSessionId').anyOf(r.sessions.map((s) => s.id)).toArray())
        .filter((a) => a.source !== 'excel-v18')
        .map((a) => a.plannedSessionId),
    );
    const fileActIds = new Set(r.activities.map((a) => a.id));
    // anciennes réalisations importées qui ont disparu du fichier (ex. commentaire retiré)
    const staleActs = await db.activities.filter((a) => a.source === 'excel-v18' && inFile.has(a.plannedSessionId ?? '') && !fileActIds.has(a.id)).toArray();
    await db.activities.bulkDelete(staleActs.map((a) => a.id));
    await db.activities.bulkPut(r.activities.filter((a) => !appDone.has(a.plannedSessionId)));
    // 4. Check-ins : ceux saisis dans l'appli sont gardés
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
  return {
    ...diff,
    sessions: r.sessions.length,
    activities: r.activities.length,
    checkIns: r.checkIns.length - checkInsKept,
    checkInsKept,
  };
}
