// Plan d'entraînement piloté par fichier (format décrit dans PLAN_FORMAT.md).
// Import : remplace uniquement les semaines à venir couvertes par le fichier, ne touche jamais
// aux séances faites / sautées / débriefées ni aux ressentis, ajoute les décisions au journal,
// et garde l'historique pour revenir en arrière.
import { db, getSettings, newId, updateSettings } from '../db/db';
import type { JournalEntry, PlannedSession, PlanVersion, SessionType } from '../db/types';
import { addDays, mondayOf, todayISO } from './dates';
import { norm } from './excel/cells';
import { DEFAULT_RULES, RULE_LIMITS, setActiveRules, type Rules } from './rules';

export const PLAN_FORMAT = 'appli-trail-plan';

export interface PlanSession {
  date: string;
  type: SessionType;
  title: string;
  description?: string;
  durationMin?: number;
  km?: number;
  dplus?: number;
  intensity?: string;
  key: boolean;
}
export interface PlanWeek {
  monday: string;
  name?: string;
  phase?: string;
  km?: number;
  dplus?: number;
  note?: string;
  sessions: PlanSession[];
}
export interface ParsedPlan {
  version: string;
  date: string;
  resume: string;
  weeks: PlanWeek[];
  rules: Partial<Rules>;
  decisions: { date: string; texte: string; categorie?: string }[];
  warnings: string[];
}

const TYPES: Record<string, SessionType> = {
  course: 'Running',
  running: 'Running',
  footing: 'Running',
  route: 'Running',
  trail: 'Running',
  fractionne: 'Running',
  rando: 'Rando',
  randonnee: 'Rando',
  marche: 'Rando',
  velo: 'Vélo',
  cyclisme: 'Vélo',
  renfo: 'Renfo',
  renforcement: 'Renfo',
  musculation: 'Renfo',
  repos: 'Repos',
  competition: 'Course',
  'course officielle': 'Course',
};
const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

const isISO = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T12:00').getTime());
const optNum = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : NaN);

/** Lit et vérifie un fichier plan. Lève une erreur claire (en français) si le fichier n'est pas valide. */
export function parsePlan(text: string): ParsedPlan {
  let raw: Record<string, any>;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`Ce fichier n'est pas un JSON valide (${(e as Error).message}).`);
  }
  const errors: string[] = [];
  const warnings: string[] = [];
  if (raw.format !== undefined && raw.format !== PLAN_FORMAT) errors.push(`« format » doit valoir "${PLAN_FORMAT}".`);
  if (typeof raw.version !== 'string' || !raw.version.trim()) errors.push('« version » est obligatoire (texte, ex. "2026-12 v1").');
  if (!isISO(raw.date)) errors.push('« date » est obligatoire, au format AAAA-MM-JJ.');
  if (typeof raw.resume !== 'string' || !raw.resume.trim()) errors.push('« resume » est obligatoire (2-3 phrases).');
  if (!Array.isArray(raw.semaines) || !raw.semaines.length) errors.push('« semaines » doit être une liste non vide.');

  const weeks: PlanWeek[] = [];
  (Array.isArray(raw.semaines) ? raw.semaines : []).forEach((w: Record<string, any>, i: number) => {
    const where = `semaines[${i}]`;
    if (!isISO(w?.debut)) return void errors.push(`${where} : « debut » doit être une date AAAA-MM-JJ (le lundi de la semaine).`);
    const monday = mondayOf(w.debut);
    if (monday !== w.debut) warnings.push(`${where} : ${w.debut} n'est pas un lundi, semaine calée sur le lundi ${monday}.`);
    if (weeks.some((x) => x.monday === monday)) errors.push(`${where} : la semaine du ${monday} est en double.`);
    const km = optNum(w.objectif_km);
    const dplus = optNum(w.objectif_dplus);
    if (Number.isNaN(km)) errors.push(`${where} : « objectif_km » doit être un nombre positif.`);
    if (Number.isNaN(dplus)) errors.push(`${where} : « objectif_dplus » doit être un nombre positif.`);
    if (!Array.isArray(w.seances)) return void errors.push(`${where} : « seances » doit être une liste (éventuellement vide).`);
    const sessions: PlanSession[] = [];
    w.seances.forEach((s: Record<string, any>, j: number) => {
      const at = `${where}.seances[${j}]`;
      // jour : « mardi » (ou « mar ») ou une date AAAA-MM-JJ dans la semaine
      let date: string | undefined;
      if (isISO(s?.jour)) date = s.jour;
      else if (typeof s?.jour === 'string') {
        const d = norm(s.jour);
        const k = DAYS.findIndex((x) => x === d || x.startsWith(d.slice(0, 3)));
        if (k >= 0 && d.length >= 3) date = addDays(monday, k);
      }
      if (!date) return void errors.push(`${at} : « jour » doit être un jour (lundi … dimanche) ou une date AAAA-MM-JJ.`);
      if (date < monday || date > addDays(monday, 6)) warnings.push(`${at} : le ${date} est hors de la semaine du ${monday}.`);
      const type = TYPES[norm(String(s.type ?? ''))] ?? (['Running', 'Rando', 'Vélo', 'Renfo', 'Repos', 'Course'].includes(s.type) ? s.type : undefined);
      if (!type) return void errors.push(`${at} : type « ${s.type} » inconnu (course, trail, rando, velo, renfo, repos, competition).`);
      const title = String(s.titre ?? s.description ?? '').trim();
      if (!title) return void errors.push(`${at} : « titre » (ou « description ») est obligatoire.`);
      const nums = { duree_min: optNum(s.duree_min), km: optNum(s.km), dplus: optNum(s.dplus) };
      for (const [k, v] of Object.entries(nums)) if (Number.isNaN(v)) errors.push(`${at} : « ${k} » doit être un nombre positif.`);
      if (s.cle !== undefined && typeof s.cle !== 'boolean') errors.push(`${at} : « cle » doit valoir true ou false.`);
      sessions.push({
        date,
        type,
        title: s.titre ? String(s.titre).trim() : title.slice(0, 60),
        description: s.titre && s.description ? String(s.description).trim() : undefined,
        durationMin: nums.duree_min,
        km: nums.km,
        dplus: nums.dplus,
        intensity: s.intensite ? String(s.intensite) : undefined,
        key: s.cle === true,
      });
    });
    const keys = sessions.filter((s) => s.key).length;
    if (keys > 3) warnings.push(`${where} : ${keys} séances clés (3 maximum conseillé).`);
    weeks.push({ monday, name: w.nom ? String(w.nom) : undefined, phase: w.phase ? String(w.phase) : undefined, km, dplus, note: w.note ? String(w.note) : undefined, sessions });
  });

  const rules: Partial<Rules> = {};
  if (raw.regles !== undefined) {
    if (typeof raw.regles !== 'object' || Array.isArray(raw.regles)) errors.push('« regles » doit être un objet { "nom": valeur }.');
    else
      for (const [k, v] of Object.entries(raw.regles as Record<string, unknown>)) {
        if (!(k in DEFAULT_RULES)) {
          warnings.push(`regles : « ${k} » n'est pas une règle connue, ignorée.`);
          continue;
        }
        const [min, max] = RULE_LIMITS[k as keyof Rules];
        if (typeof v !== 'number' || v < min || v > max) errors.push(`regles.${k} doit être un nombre entre ${min} et ${max}.`);
        else rules[k as keyof Rules] = v;
      }
  }

  const decisions: ParsedPlan['decisions'] = [];
  if (raw.decisions !== undefined && !Array.isArray(raw.decisions)) errors.push('« decisions » doit être une liste.');
  (Array.isArray(raw.decisions) ? raw.decisions : []).forEach((d: Record<string, any>, i: number) => {
    if (!isISO(d?.date) || typeof d?.texte !== 'string' || !d.texte.trim()) return void errors.push(`decisions[${i}] : « date » (AAAA-MM-JJ) et « texte » sont obligatoires.`);
    decisions.push({ date: d.date, texte: d.texte.trim(), categorie: d.categorie ? String(d.categorie) : undefined });
  });

  if (errors.length) throw new PlanError(errors);
  weeks.sort((a, b) => a.monday.localeCompare(b.monday));
  return { version: raw.version.trim(), date: raw.date, resume: raw.resume.trim(), weeks, rules, decisions, warnings };
}

export class PlanError extends Error {
  constructor(public errors: string[]) {
    super(`Fichier plan invalide (${errors.length} erreur${errors.length > 1 ? 's' : ''}) : ${errors[0]}`);
  }
}

// ---------- Aperçu des changements ----------
export interface WeekDiff {
  monday: string;
  name?: string;
  phase?: string;
  goal?: { km?: number; dplus?: number };
  oldSessions: PlannedSession[];
  newSessions: PlanSession[];
  kept: PlannedSession[];
  oldKm: number;
  newKm: number;
  oldDplus: number;
  newDplus: number;
}
export interface PlanDiff {
  from: string;
  to: string;
  weeks: WeekDiff[];
  removed: PlannedSession[];
  toAdd: PlanSession[];
  kept: PlannedSession[];
  skippedPast: number;
  rulesChanged: { key: keyof Rules; before: number; after: number }[];
  newDecisions: ParsedPlan['decisions'];
}

const foot = (t: SessionType) => t === 'Running' || t === 'Rando' || t === 'Course';

export async function diffPlan(p: ParsedPlan, today = todayISO()): Promise<PlanDiff> {
  const to = addDays(p.weeks[p.weeks.length - 1].monday, 6);
  const from = p.weeks[0].monday > today ? p.weeks[0].monday : today;
  const inRange = await db.plannedSessions.where('date').between(from, to, true, true).toArray();
  const acts = await db.activities.where('date').between(from, to, true, true).toArray();
  const doneIds = new Set(acts.map((a) => a.plannedSessionId));
  const kept = inRange.filter((s) => doneIds.has(s.id));
  const removed = inRange.filter((s) => !doneIds.has(s.id));
  const doneDays = new Set(kept.filter((s) => s.date <= today).map((s) => s.date));
  const all = p.weeks.flatMap((w) => w.sessions);
  // une séance du fichier est ignorée si elle est passée, ou si une séance du même type est déjà faite / sautée ce jour-là
  const toAdd = all.filter((s) => s.date >= from && !(s.date <= today && doneDays.has(s.date)) && !kept.some((k) => k.date === s.date && k.type === s.type));
  const settings = await getSettings();
  const cur = { ...DEFAULT_RULES, ...(settings.rules ?? {}) };
  const next = { ...DEFAULT_RULES, ...p.rules };
  const rulesChanged = (Object.keys(DEFAULT_RULES) as (keyof Rules)[]).filter((k) => cur[k] !== next[k]).map((k) => ({ key: k, before: cur[k], after: next[k] }));
  const existing = new Set((await db.journal.toArray()).map((j) => j.id));
  const newDecisions = p.decisions.filter((d) => !existing.has(journalId(d.date, d.texte)));

  const weeks: WeekDiff[] = p.weeks
    .filter((w) => addDays(w.monday, 6) >= from)
    .map((w) => {
      const sun = addDays(w.monday, 6);
      const o = removed.filter((s) => s.date >= w.monday && s.date <= sun);
      const n = toAdd.filter((s) => s.date >= w.monday && s.date <= sun);
      return {
        monday: w.monday,
        name: w.name,
        phase: w.phase,
        goal: { km: w.km, dplus: w.dplus },
        oldSessions: o.sort((a, b) => a.date.localeCompare(b.date)),
        newSessions: n,
        kept: kept.filter((s) => s.date >= w.monday && s.date <= sun),
        oldKm: o.filter((s) => foot(s.type)).reduce((t, s) => t + (s.distanceKm ?? 0), 0),
        newKm: n.filter((s) => foot(s.type)).reduce((t, s) => t + (s.km ?? 0), 0),
        oldDplus: o.filter((s) => foot(s.type)).reduce((t, s) => t + (s.elevationGain ?? 0), 0),
        newDplus: n.filter((s) => foot(s.type)).reduce((t, s) => t + (s.dplus ?? 0), 0),
      };
    });
  return { from, to, weeks, removed, toAdd, kept, skippedPast: all.length - toAdd.length, rulesChanged, newDecisions };
}

function journalId(date: string, texte: string) {
  let h = 0;
  for (const c of date + texte) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return `j-${date}-${(h >>> 0).toString(36)}`;
}

// ---------- Application ----------
export async function applyPlan(p: ParsedPlan, d: PlanDiff): Promise<PlanVersion> {
  const settings = await getSettings();
  const vid = `v-${newId().slice(0, 8)}`;
  const added: PlannedSession[] = d.toAdd.map((s, i) => ({
    id: `plan-${vid}-${s.date}-${i}`,
    date: s.date,
    week: p.weeks.find((w) => s.date >= w.monday && s.date <= addDays(w.monday, 6))?.name ?? '',
    phase: p.weeks.find((w) => s.date >= w.monday && s.date <= addDays(w.monday, 6))?.phase ?? '',
    type: s.type,
    isKey: s.key,
    title: s.title,
    durationMin: s.durationMin,
    distanceKm: s.km,
    elevationGain: s.dplus,
    intensity: s.intensity,
    instructions: s.description,
    source: 'plan',
    planVersion: vid,
  }));
  const version: PlanVersion = {
    id: vid,
    version: p.version,
    date: p.date,
    resume: p.resume,
    importedAt: new Date().toISOString(),
    from: d.from,
    to: d.to,
    removed: d.removed,
    added: added.map((s) => s.id),
    rulesBefore: settings.rules as Record<string, number> | undefined,
    rules: p.rules as Record<string, number>,
    weekGoals: p.weeks.map((w) => ({ monday: w.monday, km: w.km, dplus: w.dplus, phase: w.phase, note: w.note })),
    seq: (await db.planVersions.count()) + 1,
  };
  const entries: JournalEntry[] = d.newDecisions.map((x) => ({ id: journalId(x.date, x.texte), date: x.date, texte: x.texte, categorie: x.categorie, planVersion: vid }));
  await db.transaction('rw', [db.plannedSessions, db.planVersions, db.journal], async () => {
    await db.plannedSessions.bulkDelete(d.removed.map((s) => s.id));
    await db.plannedSessions.bulkAdd(added);
    await db.journal.bulkPut(entries);
    await db.planVersions.add(version);
  });
  await updateSettings({ rules: p.rules });
  setActiveRules(p.rules);
  return version;
}

/** Ordre d'import (numéro d'ordre, puis date d'import). */
export function sortVersions<T extends { seq?: number; importedAt: string }>(v: T[]): T[] {
  return [...v].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.importedAt.localeCompare(b.importedAt));
}

/** Version active = la dernière importée et non annulée. */
export async function activeVersion(): Promise<PlanVersion | undefined> {
  const all = await db.planVersions.toArray();
  return sortVersions(all).filter((v) => !v.reverted).pop();
}

/**
 * Revenir à la version précédente : retire les séances ajoutées par le dernier import (sauf celles déjà
 * faites), remet les séances qu'il avait remplacées, restaure les règles d'avant et retire ses décisions du journal.
 */
export async function revertLastPlan(): Promise<PlanVersion | undefined> {
  const v = await activeVersion();
  if (!v) return undefined;
  await db.transaction('rw', [db.plannedSessions, db.activities, db.planVersions, db.journal], async () => {
    const done = new Set((await db.activities.where('plannedSessionId').anyOf(v.added).toArray()).map((a) => a.plannedSessionId));
    await db.plannedSessions.bulkDelete(v.added.filter((id) => !done.has(id)));
    await db.plannedSessions.bulkPut(v.removed);
    await db.journal.where('id').anyOf((await db.journal.toArray()).filter((j) => j.planVersion === v.id).map((j) => j.id)).delete();
    await db.planVersions.update(v.id, { reverted: true });
  });
  await updateSettings({ rules: v.rulesBefore });
  setActiveRules(v.rulesBefore);
  return v;
}
