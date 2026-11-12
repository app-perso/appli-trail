// Vue « Semaine » : stade dans la prépa, difficulté des séances, but de la semaine.
import type { Activity, PlannedSession, Race } from '../db/types';
import { addDays, mondayOf } from './dates';
import { norm } from './excel/cells';

export interface PrepWeek {
  monday: string;
  label?: string;
  phase?: string;
  status: 'done' | 'current' | 'future';
  /** séances prévues (hors repos) / faites */
  planned: number;
  done: number;
}

export interface Prep {
  weeks: PrepWeek[];
  /** index de la semaine en cours (−1 si hors prépa) */
  current: number;
  target?: Race;
}

/** La prépa = toutes les semaines du plan, de la 1re à la dernière séance prévue (20 semaines max en arrière). */
export function computePrep(sessions: PlannedSession[], activities: Activity[], races: Race[], today: string): Prep {
  const recent = sessions.filter((s) => s.date >= addDays(today, -140)).map((s) => s.date).sort();
  if (!recent.length) return { weeks: [], current: -1 };
  const first = mondayOf(recent[0]);
  const last = mondayOf(recent[recent.length - 1]);
  const cur = mondayOf(today);
  const weeks: PrepWeek[] = [];
  for (let m = first; m <= last; m = addDays(m, 7)) {
    const sun = addDays(m, 6);
    const ws = sessions.filter((s) => s.date >= m && s.date <= sun && s.type !== 'Repos');
    const wa = activities.filter((a) => a.date >= m && a.date <= sun && !a.skipped && a.type !== 'Repos');
    weeks.push({
      monday: m,
      label: ws.find((s) => s.week)?.week || undefined,
      phase: sessions.find((s) => s.date >= m && s.date <= sun && s.phase)?.phase || undefined,
      status: m < cur ? 'done' : m === cur ? 'current' : 'future',
      planned: ws.length,
      done: wa.length,
    });
  }
  const lastSun = addDays(last, 6);
  const inLastWeek = races.filter((r) => r.date >= last && r.date <= lastSun);
  const target = inLastWeek.sort((a, b) => b.distanceKm + b.elevationGain / 100 - (a.distanceKm + a.elevationGain / 100))[0] ?? races.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  return { weeks, current: weeks.findIndex((w) => w.status === 'current'), target };
}

/** Difficulté de 0 à 5 éclairs, d'après l'intensité prévue (zone la plus haute) ou le type. */
export function difficulty(s: Pick<PlannedSession, 'intensity' | 'type' | 'isKey'>): number {
  const zones = (s.intensity ?? '').match(/[zZ]\s?([1-5])/g)?.map((z) => Number(z.slice(-1)));
  if (zones?.length) return Math.max(...zones);
  if (s.type === 'Repos') return 0;
  if (s.type === 'Course') return 5;
  return s.isKey ? 3 : 2;
}

const PHASES: [RegExp, string][] = [
  [/^reprise/, 'Reprendre en douceur : régularité avant tout, aucune intensité.'],
  [/^readapt/, 'Réhabituer genoux et tendons : volume modéré, sans forcer en descente.'],
  [/^reconstr/, 'Reconstruire le volume pas à pas, en restant dans le couloir de sécurité.'],
  [/^construct/, 'Développer le volume et le D+, avec une séance de qualité.'],
  [/^bloc/, 'Bloc choc : enchaîner deux grosses sorties, puis récupérer vraiment.'],
  [/^pic/, 'Semaine la plus chargée : grosses sorties, sommeil et nutrition au top.'],
  [/^affut/, 'Affûtage : baisser le volume, garder un peu de rythme, arriver frais.'],
  [/^semaine course|^course/, 'Semaine de course : très léger, repos, nutrition et matériel prêts.'],
  [/^recup|^allege/, 'Semaine allégée : assimiler le travail des semaines précédentes.'],
];

/** Phrase de but de la semaine selon la phase du plan. */
export function phaseGoal(phase?: string): string | undefined {
  if (!phase) return undefined;
  const p = norm(phase);
  return PHASES.find(([re]) => re.test(p))?.[1];
}
