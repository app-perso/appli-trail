// Appliquer / refuser / annuler une proposition du coach.
import { db } from '../db/db';
import type { CoachDecision } from '../db/types';
import type { Option, Proposal } from './adapt';

export async function acceptProposal(p: Proposal, o: Option): Promise<CoachDecision> {
  const ids = o.changes.map((c) => c.id);
  const before = (await db.plannedSessions.bulkGet(ids)).filter((s): s is NonNullable<typeof s> => !!s);
  const decision: CoachDecision = { id: p.id, decidedAt: new Date().toISOString(), decision: 'accepted', option: o.key, title: p.title, before };
  await db.transaction('rw', db.plannedSessions, db.coachDecisions, async () => {
    for (const c of o.changes) await db.plannedSessions.update(c.id, c.patch);
    await db.coachDecisions.put(decision);
  });
  return decision;
}

export async function refuseProposal(p: Proposal): Promise<void> {
  await db.coachDecisions.put({ id: p.id, decidedAt: new Date().toISOString(), decision: 'refused', title: p.title });
}

/** Remet les séances comme avant l'adaptation. */
export async function undoDecision(id: string): Promise<void> {
  const d = await db.coachDecisions.get(id);
  if (!d?.before?.length) return;
  await db.transaction('rw', db.plannedSessions, db.coachDecisions, async () => {
    await db.plannedSessions.bulkPut(d.before!);
    await db.coachDecisions.update(id, { undone: true });
  });
}
