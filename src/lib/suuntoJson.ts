// Import unique de l'historique « suunto_resume.json » : séances (workouts) + nuits (sleep).
// Les séances sont converties au même format que les séances importées en .fit.
import { db } from '../db/db';
import type { CheckIn, Sleep } from '../db/types';
import { addDays } from './dates';
import { mapSport, type FitSummary } from './fit';
import { candidateSessions, findDuplicate, saveImported } from './fitSave';

export interface SuuntoResume {
  workouts: FitSummary[];
  sleeps: Sleep[];
  warnings: string[];
  firstDate?: string;
  lastDate?: string;
}

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(',', '.').replace(/[^\d.+-]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};
const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
};

/** « 2026-11-11 », « 11/11/2026 », « 2026-11-11T07:30… » → « 2026-11-11 » */
function isoDate(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}
/** « 7:30 », « 07:30:12 », « 7h30 » → « 07:30 » */
function hhmm(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const m = v.trim().match(/(\d{1,2})\s*[:h]\s*(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined;
}
/** Heure de Paris → instant UTC (ISO). */
export function parisToUtc(date: string, time: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' });
  const p = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const asParis = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess - (asParis - guess)).toISOString();
}

/** Zones en minutes : [z1..z5], {z1..z5}, {Z1..}… */
function zonesOf(v: unknown): [number, number, number, number, number] | undefined {
  let arr: (number | undefined)[] | undefined;
  if (Array.isArray(v)) arr = v.map(num);
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    arr = [1, 2, 3, 4, 5].map((i) => num(pick(o, `z${i}`, `Z${i}`, `zone${i}`, String(i))));
  }
  if (!arr || arr.length < 5 || arr.slice(0, 5).every((x) => x === undefined)) return undefined;
  return arr.slice(0, 5).map((x) => x ?? 0) as [number, number, number, number, number];
}

export function parseSuuntoResume(text: string): SuuntoResume {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Ce fichier n'est pas un JSON lisible.");
  }
  const rawW = (pick(data, 'workouts', 'Workouts', 'seances') as Record<string, unknown>[] | undefined) ?? [];
  const rawS = (pick(data, 'sleep', 'sleeps', 'Sleep', 'nuits') as Record<string, unknown>[] | undefined) ?? [];
  if (!Array.isArray(rawW) && !Array.isArray(rawS)) throw new Error('Pas de « workouts » ni de « sleep » dans ce fichier.');
  const warnings: string[] = [];

  const workouts: FitSummary[] = [];
  (Array.isArray(rawW) ? rawW : []).forEach((w, i) => {
    const date = isoDate(pick(w, 'date', 'day', 'start'));
    if (!date) return void warnings.push(`Séance n°${i + 1} ignorée : date illisible.`);
    const time = hhmm(pick(w, 'time', 'start_time', 'heure')) ?? hhmm(String(pick(w, 'date', 'start') ?? '').slice(11)) ?? '12:00';
    const rawType = String(pick(w, 'type', 'sport', 'activity') ?? '');
    const sp = mapSport(/trail|run|course|route/i.test(rawType) ? (/(trail)/i.test(rawType) ? 'running' : 'running') : rawType, rawType);
    const zMin = zonesOf(pick(w, 'zones', 'hr_zones', 'zones_min'));
    const totZ = zMin ? zMin.reduce((a, b) => a + b, 0) : 0;
    const min = num(pick(w, 'min', 'minutes', 'duration_min', 'duration')) ?? 0;
    const recup = num(pick(w, 'recovery', 'recup', 'recovery_h', 'recup_h'));
    workouts.push({
      startAt: parisToUtc(date, time),
      date,
      time,
      sport: rawType,
      subSport: sp.label.toLowerCase(),
      type: /rando|hik|walk|marche/i.test(rawType) ? 'Rando' : /v[ée]lo|cycl|bike/i.test(rawType) ? 'Vélo' : /renfo|strength|muscu/i.test(rawType) ? 'Renfo' : 'Running',
      kindLabel: /rando|hik|walk|marche/i.test(rawType) ? 'Rando' : /v[ée]lo|cycl|bike/i.test(rawType) ? 'Vélo' : /trail/i.test(rawType) ? 'Trail' : /route|road|street/i.test(rawType) ? 'Route' : sp.label,
      distanceKm: num(pick(w, 'km', 'distance_km', 'distance')) ?? 0,
      durationMin: min,
      elevationGain: Math.round(num(pick(w, 'dplus', 'd_plus', 'ascent', 'elev_gain')) ?? 0),
      elevationLoss: Math.round(num(pick(w, 'dminus', 'd_minus', 'descent', 'elev_loss')) ?? 0),
      hrAvg: num(pick(w, 'hr', 'hr_avg', 'fc', 'avg_hr')),
      hrMax: num(pick(w, 'hrmax', 'hr_max', 'max_hr')),
      zonesMin: zMin,
      zones: zMin && totZ > 0 ? (zMin.map((m) => Math.round((m / totZ) * 1000) / 1000) as FitSummary['zones']) : undefined,
      vo2max: num(pick(w, 'vo2', 'vo2max')),
      recoveryHours: recup,
      trainingEffect: num(pick(w, 'te', 'training_effect')),
      vamUp: num(pick(w, 'vam_up', 'vam', 'up_vam')),
      vamDown: num(pick(w, 'desc_vam', 'vam_down', 'down_vam')),
      points: [],
    });
  });

  const sleeps: Sleep[] = [];
  (Array.isArray(rawS) ? rawS : []).forEach((s, i) => {
    const night = isoDate(pick(s, 'night', 'date', 'day'));
    if (!night) return void warnings.push(`Nuit n°${i + 1} ignorée : date illisible.`);
    const bed = hhmm(pick(s, 'bed', 'bedtime', 'coucher'));
    const wake = hhmm(pick(s, 'wake', 'waketime', 'lever'));
    // « night » = la nuit du X au X+1 : le réveil est toujours le lendemain (même couché après minuit)
    const date = addDays(night, 1);
    sleeps.push({
      id: date,
      date,
      bed,
      wake,
      hours: num(pick(s, 'h', 'hours', 'duration_h')),
      deepH: num(pick(s, 'deep', 'deep_h')),
      remH: num(pick(s, 'rem', 'rem_h')),
      hrMin: num(pick(s, 'hrmin', 'hr_min')),
      hrv: num(pick(s, 'hrv')),
      quality: num(pick(s, 'q', 'quality', 'score')),
      source: 'suunto-json',
    });
  });

  const dates = [...workouts.map((w) => w.date), ...sleeps.map((s) => s.date)].sort();
  return { workouts, sleeps, warnings, firstDate: dates[0], lastDate: dates[dates.length - 1] };
}

/** Qualité Suunto (1-5, 0-10 ou 0-100) → 1-5 de l'appli. */
function quality15(q?: number): number | undefined {
  if (q === undefined) return undefined;
  const v = q <= 5 ? q : q <= 10 ? q / 2 : q / 20;
  return Math.min(5, Math.max(1, Math.round(v)));
}

export interface ResumeReport {
  added: number;
  enriched: number;
  updated: number;
  nights: number;
  checkInsFilled: number;
}

export async function applySuuntoResume(r: SuuntoResume): Promise<ResumeReport> {
  const rep: ResumeReport = { added: 0, enriched: 0, updated: 0, nights: 0, checkInsFilled: 0 };
  for (const w of r.workouts) {
    const dup = await findDuplicate(w);
    if (dup) {
      // déjà importée (même date et heure) : on met à jour les chiffres, on garde les ressentis
      await saveImported(w, dup.plannedSessionId ?? null, { feelings: dup.feelings, rpe: dup.rpe, pains: dup.pains, note: dup.note }, dup.id, 'suunto-json');
      rep.updated++;
      continue;
    }
    const cands = await candidateSessions(w.date);
    // séance de l'historique Excel du même jour et du même type (sans heure) : on la complète
    const fromExcel = cands.find((c) => c.activity && !c.activity.startTime && !c.activity.skipped && c.session.type === w.type);
    if (fromExcel) {
      const a = fromExcel.activity!;
      await saveImported(w, fromExcel.session.id, { feelings: a.feelings, rpe: a.rpe, pains: a.pains, note: a.note }, a.id, 'suunto-json');
      rep.enriched++;
      continue;
    }
    const free = cands.find((c) => !c.activity && c.session.type === w.type) ?? cands.find((c) => !c.activity);
    await saveImported(w, free ? free.session.id : null, { feelings: {}, pains: [] }, undefined, 'suunto-json');
    rep.added++;
  }

  if (r.sleeps.length) {
    await db.sleeps.bulkPut(r.sleeps);
    rep.nights = r.sleeps.length;
    // Les nuits complètent les check-ins (heures de coucher / lever), sans écraser ce qui a été saisi
    for (const s of r.sleeps) {
      if (!s.bed || !s.wake) continue;
      const ci = await db.checkIns.where('date').equals(s.date).first();
      if (ci) {
        if (!ci.bedTime || !ci.wakeTime) {
          await db.checkIns.update(ci.id, { bedTime: s.bed, wakeTime: s.wake, sleepQuality: ci.sleepQuality ?? quality15(s.quality) });
          rep.checkInsFilled++;
        }
      } else {
        const c: CheckIn = { id: `suunto-checkin-${s.date}`, date: s.date, bedTime: s.bed, wakeTime: s.wake, sleepQuality: quality15(s.quality), pains: [], source: 'suunto-json' };
        await db.checkIns.put(c);
        rep.checkInsFilled++;
      }
    }
  }
  return rep;
}
