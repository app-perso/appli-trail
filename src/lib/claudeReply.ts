// Réponse de Claude collée dans l'appli : un bloc JSON de modifications de séances + des enseignements pour la mémoire,
// ou un plan complet (format appli-trail-plan, traité par l'import de plan).
import { db, newId } from '../db/db';
import type { Activity, CoachDecision, JournalEntry, PlannedSession } from '../db/types';
import { formatDayShort, todayISO } from './dates';
import { norm } from './excel/cells';
import { journalId, parsePlan, PLAN_FORMAT, toSessionType, type ParsedPlan } from './planFile';

export const REPLY_FORMAT = 'appli-trail-reponse';

export type OpKind = 'modifier' | 'deplacer' | 'supprimer' | 'ajouter';
export interface Op {
  kind: OpKind;
  before?: PlannedSession;
  after?: PlannedSession;
}
export interface ParsedReply {
  resume: string;
  ops: Op[];
  lessons: { texte: string; categorie?: string }[];
  errors: string[];
}
export type Reply = { kind: 'plan'; plan: ParsedPlan } | { kind: 'changes'; reply: ParsedReply };

const isISO = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T12:00').getTime());
const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : NaN);
const dayLabel = (d: string) => {
  const { dow, day } = formatDayShort(d);
  return `${dow.toLowerCase()} ${day}`;
};

/** Trouve le bloc JSON dans la réponse de Claude (bloc ```json, sinon le texte entier, sinon le premier { … dernier }). */
export function extractJson(text: string): Record<string, any> {
  const candidates: string[] = [];
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) candidates.push(m[1]);
  candidates.push(text);
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a >= 0 && b > a) candidates.push(text.slice(a, b + 1));
  let found: Record<string, any> | undefined;
  for (const c of candidates) {
    try {
      const o = JSON.parse(c.trim());
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        // on garde le dernier bloc reconnu (Claude met souvent le bloc final à la fin)
        if (o.format === REPLY_FORMAT || o.format === PLAN_FORMAT || o.modifications || o.semaines) found = o;
        else found ??= o;
      }
    } catch {
      /* pas du JSON */
    }
  }
  if (!found) throw new Error("Je ne trouve pas de bloc JSON dans ce texte. Demande à Claude : « Donne-moi le bloc pour l'appli ».");
  return found;
}

/** Analyse la réponse : plan complet, ou liste de modifications vérifiées sur le plan actuel. */
export function readReply(text: string, sessions: PlannedSession[], activities: Activity[], today = todayISO()): Reply {
  const raw = extractJson(text);
  if (raw.format === PLAN_FORMAT || Array.isArray(raw.semaines)) return { kind: 'plan', plan: parsePlan(JSON.stringify(raw)) };

  const errors: string[] = [];
  const done = new Set(activities.map((a) => a.plannedSessionId).filter(Boolean));
  // Copie de travail : les opérations s'enchaînent (ex. déplacer puis modifier)
  const work = new Map(sessions.map((s) => [s.id, { ...s }]));
  const touched = new Map<string, PlannedSession>(); // id → état d'origine
  const added = new Set<string>();
  const deleted = new Set<string>();

  const find = (date: string, hint: unknown, at: string): PlannedSession | undefined => {
    const onDay = [...work.values()].filter((s) => s.date === date && !deleted.has(s.id));
    const h = hint ? norm(String(hint)) : '';
    let c = h ? onDay.filter((s) => norm(s.title).includes(h) || h.includes(norm(s.title))) : onDay.filter((s) => s.type !== 'Repos');
    if (!c.length && !h) c = onDay;
    if (!c.length) return void errors.push(`${at} : aucune séance ${h ? `« ${hint} » ` : ''}le ${dayLabel(date)} (${date}).`);
    if (c.length > 1) return void errors.push(`${at} : plusieurs séances le ${dayLabel(date)}, précise « seance » (${c.map((s) => `« ${s.title} »`).join(', ')}).`);
    if (done.has(c[0].id)) return void errors.push(`${at} : « ${c[0].title} » est déjà faite, on n'y touche pas.`);
    return c[0];
  };
  const fields = (m: Record<string, any>, at: string): Partial<PlannedSession> | undefined => {
    const p: Partial<PlannedSession> = {};
    if (m.type !== undefined) {
      const t = toSessionType(m.type);
      if (!t) return void errors.push(`${at} : type « ${m.type} » inconnu (course, trail, rando, velo, renfo, repos, competition).`);
      p.type = t;
    }
    if (m.titre !== undefined) p.title = String(m.titre).trim();
    const n = { duree_min: num(m.duree_min), km: num(m.km), dplus: num(m.dplus) };
    for (const [k, v] of Object.entries(n)) if (Number.isNaN(v)) return void errors.push(`${at} : « ${k} » doit être un nombre positif.`);
    if (n.duree_min !== undefined) p.durationMin = n.duree_min;
    if (n.km !== undefined) p.distanceKm = n.km;
    if (n.dplus !== undefined) p.elevationGain = n.dplus;
    if (m.intensite !== undefined) p.intensity = String(m.intensite);
    if (m.description !== undefined) p.instructions = String(m.description);
    if (m.cle !== undefined) p.isKey = m.cle === true;
    if (p.type === 'Repos') Object.assign(p, { durationMin: undefined, distanceKm: undefined, elevationGain: undefined, intensity: undefined });
    return p;
  };
  const touch = (s: PlannedSession) => {
    if (!added.has(s.id) && !touched.has(s.id)) touched.set(s.id, sessions.find((x) => x.id === s.id)!);
  };

  const mods = raw.modifications;
  if (mods !== undefined && !Array.isArray(mods)) errors.push('« modifications » doit être une liste.');
  (Array.isArray(mods) ? mods : []).forEach((m: Record<string, any>, i: number) => {
    const at = `modifications[${i}]`;
    const action = norm(String(m?.action ?? ''));
    if (!isISO(m?.date)) return void errors.push(`${at} : « date » (AAAA-MM-JJ) est obligatoire.`);
    if (m.date < today) return void errors.push(`${at} : le ${m.date} est passé, on ne modifie que les séances à venir.`);
    if (action === 'ajouter') {
      const f = fields(m, at);
      if (!f) return;
      if (!f.type || !f.title) return void errors.push(`${at} : pour ajouter, « type » et « titre » sont obligatoires.`);
      const s: PlannedSession = { id: `claude-${newId()}`, date: m.date, week: '', phase: '', isKey: false, source: 'appli', ...f } as PlannedSession;
      work.set(s.id, s);
      added.add(s.id);
      return;
    }
    const s = find(m.date, m.seance, at);
    if (!s) return;
    if (action === 'supprimer') {
      touch(s);
      deleted.add(s.id);
    } else if (action === 'deplacer') {
      if (!isISO(m.vers)) return void errors.push(`${at} : « vers » (AAAA-MM-JJ) est obligatoire pour déplacer.`);
      if (m.vers < today) return void errors.push(`${at} : on ne déplace pas une séance dans le passé (${m.vers}).`);
      touch(s);
      s.date = m.vers;
      const f = fields(m, at);
      if (f) Object.assign(s, f);
    } else if (action === 'modifier') {
      const f = fields(m, at);
      if (!f) return;
      if (!Object.keys(f).length) return void errors.push(`${at} : rien à modifier (titre, type, duree_min, km, dplus, intensite, description, cle).`);
      touch(s);
      Object.assign(s, f);
    } else errors.push(`${at} : action « ${m?.action} » inconnue (modifier, deplacer, supprimer, ajouter).`);
  });

  const lessons: ParsedReply['lessons'] = [];
  const ens = raw.enseignements;
  if (ens !== undefined && !Array.isArray(ens)) errors.push('« enseignements » doit être une liste.');
  (Array.isArray(ens) ? ens : []).forEach((e: unknown, i: number) => {
    const t = typeof e === 'string' ? e : (e as Record<string, any>)?.texte;
    if (typeof t !== 'string' || !t.trim()) return void errors.push(`enseignements[${i}] : « texte » est obligatoire.`);
    lessons.push({ texte: t.trim(), categorie: typeof e === 'object' && (e as any).categorie ? String((e as any).categorie) : undefined });
  });

  const ops: Op[] = [];
  for (const [id, before] of touched) ops.push({ kind: deleted.has(id) ? 'supprimer' : work.get(id)!.date !== before.date ? 'deplacer' : 'modifier', before, after: deleted.has(id) ? undefined : work.get(id) });
  for (const id of added) if (!deleted.has(id)) ops.push({ kind: 'ajouter', after: work.get(id) });
  ops.sort((a, b) => (a.after ?? a.before)!.date.localeCompare((b.after ?? b.before)!.date));
  if (!ops.length && !lessons.length && !errors.length) errors.push('Le bloc ne contient ni « modifications » ni « enseignements ».');
  const resume = typeof raw.resume === 'string' && raw.resume.trim() ? raw.resume.trim() : `${ops.length} modification${ops.length > 1 ? 's' : ''} décidée${ops.length > 1 ? 's' : ''} avec Claude`;
  return { kind: 'changes', reply: { resume, ops, lessons, errors } };
}

/** Applique les modifications (annulable comme un conseil du coach) et ajoute les enseignements à la mémoire. */
export async function applyReply(r: ParsedReply): Promise<CoachDecision | undefined> {
  const today = todayISO();
  const entries: JournalEntry[] = [
    ...(r.ops.length ? [{ id: journalId(today, r.resume), date: today, texte: `Décidé avec Claude : ${r.resume}`, categorie: 'claude' }] : []),
    ...r.lessons.map((l) => ({ id: journalId(today, l.texte), date: today, texte: l.texte, categorie: l.categorie ?? 'enseignement' })),
  ];
  let decision: CoachDecision | undefined;
  await db.transaction('rw', [db.plannedSessions, db.coachDecisions, db.journal], async () => {
    if (r.ops.length) {
      const before = r.ops.map((o) => o.before).filter((s): s is PlannedSession => !!s);
      const addedIds = r.ops.filter((o) => o.kind === 'ajouter').map((o) => o.after!.id);
      for (const o of r.ops) {
        if (o.kind === 'supprimer') await db.plannedSessions.delete(o.before!.id);
        else await db.plannedSessions.put(o.after!);
      }
      decision = { id: `claude-${newId()}`, decidedAt: new Date().toISOString(), decision: 'accepted', option: 'claude', title: `Avec Claude : ${r.resume}`, before, added: addedIds };
      await db.coachDecisions.put(decision);
    }
    if (entries.length) await db.journal.bulkPut(entries);
  });
  return decision;
}

/** Texte des erreurs, prêt à renvoyer à Claude. */
export function errorsForClaude(errors: string[]): string {
  return `Ton bloc pour l'appli a des erreurs, corrige-les et redonne-moi le bloc complet :\n${errors.map((e) => `- ${e}`).join('\n')}`;
}

