// Enregistrement d'une séance importée (.fit ou historique Suunto) : séance réalisée + trace.
import { db, newId } from '../db/db';
import type { Activity, Feelings, PainEntry, PlannedSession, Source } from '../db/types';
import type { FitSummary } from './fit';

/** Séance déjà importée avec la même date et heure de départ (à 2 min près). */
export async function findDuplicate(s: Pick<FitSummary, 'date' | 'time' | 'startAt'>): Promise<Activity | undefined> {
  const sameDay = await db.activities.where('date').equals(s.date).toArray();
  const t = new Date(s.startAt).getTime();
  return sameDay.find((a) => (a.startAt && Math.abs(new Date(a.startAt).getTime() - t) <= 120_000) || (a.startTime && a.startTime === s.time));
}

/** Séances prévues ce jour-là auxquelles rattacher l'import (hors repos). */
export async function candidateSessions(date: string): Promise<{ session: PlannedSession; activity?: Activity }[]> {
  const sessions = (await db.plannedSessions.where('date').equals(date).toArray()).filter((s) => s.type !== 'Repos');
  const acts = await db.activities.where('date').equals(date).toArray();
  return sessions.map((session) => ({ session, activity: acts.find((a) => a.plannedSessionId === session.id) }));
}

export interface Debrief {
  feelings: Partial<Feelings>;
  rpe?: number;
  pains: PainEntry[];
  note?: string;
}

/**
 * sessionId : séance prévue à laquelle rattacher (null = séance non prévue → créée dans le plan).
 * replaceId : séance réalisée existante à remplacer (doublon ou débrief déjà fait).
 */
export async function saveImported(s: FitSummary, sessionId: string | null, debrief: Debrief, replaceId?: string, source: Source = 'fit'): Promise<{ activityId: string; sessionId: string }> {
  return db.transaction('rw', db.plannedSessions, db.activities, db.tracks, async () => {
    let sid = sessionId;
    if (!sid) {
      sid = newId();
      await db.plannedSessions.add({
        id: sid,
        date: s.date,
        week: '',
        phase: '',
        type: s.type,
        isKey: false,
        title: `${s.kindLabel} ${String(Math.round(s.distanceKm * 10) / 10).replace('.', ',')} km (non prévue)`,
        durationMin: Math.round(s.durationMin),
        distanceKm: s.distanceKm,
        elevationGain: s.elevationGain,
        source,
      });
    }
    // Une seule réalisation par séance prévue : on remplace celle qui existe
    const existing = replaceId ? await db.activities.get(replaceId) : await db.activities.where('plannedSessionId').equals(sid).first();
    const id = existing?.id ?? newId();
    if (existing && existing.plannedSessionId !== sid) {
      // doublon rattaché à une autre séance : on le retire de là-bas
      await db.activities.delete(existing.id);
    }
    const a: Activity = {
      id,
      plannedSessionId: sid,
      date: s.date,
      type: s.type,
      durationMin: s.durationMin,
      elapsedMin: s.elapsedMin,
      distanceKm: s.distanceKm,
      elevationGain: s.elevationGain,
      elevationLoss: s.elevationLoss,
      hrAvg: s.hrAvg,
      hrMax: s.hrMax,
      zones: s.zones,
      feelings: debrief.feelings,
      pains: debrief.pains,
      rpe: debrief.rpe,
      note: debrief.note,
      source,
      startAt: s.startAt,
      startTime: s.time,
      subSport: s.subSport ?? s.kindLabel.toLowerCase(),
      vo2max: s.vo2max,
      recoveryHours: s.recoveryHours,
      trainingEffect: s.trainingEffect,
      vamUp: s.vamUp,
      vamDown: s.vamDown,
    };
    await db.activities.put(a);
    if (s.points.length) await db.tracks.put({ id, points: s.points });
    else await db.tracks.delete(id);
    return { activityId: id, sessionId: sid };
  });
}
