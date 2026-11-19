// Propositions du coach, rangées par endroit d'affichage : sur une séance, ou sur la semaine.
import { db } from '../db/db';
import type { PlannedSession } from '../db/types';
import { proposals, type Proposal } from './adapt';
import { todayISO } from './dates';
import { useLive } from './useLive';

/** Conseils qui portent sur une semaine entière (affichés en haut de l'onglet Semaine). */
export const isWeekTip = (p: Proposal) => /^(couloir|recup)-/.test(p.id);

export interface Tips {
  all: Proposal[];
  week: Proposal[];
  /** id de séance → conseil qui la vise */
  bySession: Map<string, Proposal>;
  sessions: PlannedSession[];
}

export function useProposals(): Tips | undefined {
  const today = todayISO();
  return useLive(async () => {
    const [sessions, activities, checkIns, decisions, races] = await Promise.all([
      db.plannedSessions.toArray(),
      db.activities.toArray(),
      db.checkIns.toArray(),
      db.coachDecisions.toArray(),
      db.races.toArray(),
    ]);
    const all = proposals({ sessions, activities, checkIns }, decisions, today, races.map((r) => r.date));
    const week = all.filter(isWeekTip);
    const bySession = new Map<string, Proposal>();
    for (const p of all.filter((x) => !isWeekTip(x))) for (const c of p.options[0]?.changes ?? []) if (!bySession.has(c.id)) bySession.set(c.id, p);
    return { all, week, bySession, sessions };
  }, [today]);
}
