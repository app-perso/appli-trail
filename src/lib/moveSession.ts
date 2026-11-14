import { db } from '../db/db';
import type { PlannedSession } from '../db/types';

/** Séances pas encore faites (ni débriefées) prévues ce jour-là, hors séance déplacée. */
export async function freeSessionsOn(date: string, exceptId?: string): Promise<PlannedSession[]> {
  const sessions = await db.plannedSessions.where('date').equals(date).toArray();
  const out: PlannedSession[] = [];
  for (const s of sessions) {
    if (s.id === exceptId) continue;
    const a = await db.activities.where('plannedSessionId').equals(s.id).first();
    if (!a) out.push(s);
  }
  return out;
}

/**
 * Décale une séance à un autre jour.
 * swap = true : les séances pas encore faites du jour visé prennent la place libérée (échange).
 * Le débrief éventuel suit la séance.
 */
export async function moveSession(id: string, toDate: string, swap: boolean): Promise<{ swapped: PlannedSession[] }> {
  return db.transaction('rw', db.plannedSessions, db.activities, async () => {
    const s = await db.plannedSessions.get(id);
    if (!s || s.date === toDate) return { swapped: [] };
    const from = s.date;
    const others = swap ? await freeSessionsOn(toDate, id) : [];
    await db.plannedSessions.update(id, { date: toDate });
    await db.activities.where('plannedSessionId').equals(id).modify({ date: toDate });
    for (const o of others) await db.plannedSessions.update(o.id, { date: from });
    return { swapped: others };
  });
}
