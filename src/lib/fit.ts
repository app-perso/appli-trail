// Lecture d'un fichier .fit (montre Suunto, Garmin…) directement dans le navigateur, sans serveur.
// Librairie : fit-file-parser (MIT), chargée seulement au moment de l'import.
import type { SessionType, Track } from '../db/types';

export interface FitSummary {
  /** Départ exact (ISO UTC) */
  startAt: string;
  /** Date et heure de départ à l'heure de Paris */
  date: string;
  time: string;
  sport: string;
  subSport?: string;
  type: SessionType;
  /** « Trail », « Route », « Rando »… */
  kindLabel: string;
  distanceKm: number;
  /** Durée en mouvement (minutes) */
  durationMin: number;
  /** Durée totale, pauses comprises (minutes) */
  elapsedMin?: number;
  elevationGain: number;
  elevationLoss: number;
  hrAvg?: number;
  hrMax?: number;
  /** Minutes passées dans chaque zone Z1 → Z5 */
  zonesMin?: [number, number, number, number, number];
  /** Fractions 0-1 (même format que le reste de l'appli) */
  zones?: [number, number, number, number, number];
  vo2max?: number;
  recoveryHours?: number;
  trainingEffect?: number;
  /** Vitesse verticale moyenne (m/h) sur les portions qui montent / descendent à plus de 300 m/h */
  vamUp?: number;
  vamDown?: number;
  climbMin?: number;
  descentMin?: number;
  points: Track['points'];
}

type Rec = { t: number; d?: number; ele?: number; hr?: number };

/** « 2026-11-11 » et « 07:30 » à l'heure de Paris. */
export function parisDateTime(d: Date): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function mapSport(sport = '', sub = ''): { type: SessionType; label: string } {
  const s = sport.toLowerCase();
  const u = sub.toLowerCase();
  if (s.includes('run')) {
    if (u.includes('trail') || s.includes('trail')) return { type: 'Running', label: 'Trail' };
    if (u.includes('treadmill')) return { type: 'Running', label: 'Tapis' };
    if (u.includes('track')) return { type: 'Running', label: 'Piste' };
    return { type: 'Running', label: 'Route' };
  }
  if (/hik|walk|mountain/.test(s)) return { type: 'Rando', label: 'Rando' };
  if (/cycl|bik/.test(s)) return { type: 'Vélo', label: 'Vélo' };
  if (/train|fitness|strength/.test(s)) return { type: 'Renfo', label: 'Renfo' };
  return { type: 'Running', label: sport ? sport.replace(/_/g, ' ') : 'Course' };
}

/** Cherche une valeur dans un message (champ standard ou champ « développeur » de la montre). */
function findNumber(objs: unknown[], re: RegExp): number | undefined {
  for (const o of objs) {
    if (!o || typeof o !== 'object') continue;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (re.test(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
    }
  }
  return undefined;
}

/**
 * Calculs à partir de l'objet renvoyé par fit-file-parser.
 * zoneBounds : bornes FC de l'appli [min Z1, min Z2, min Z3, min Z4, min Z5, max].
 */
export function summarizeFit(data: Record<string, any>, zoneBounds: number[]): FitSummary {
  const session = (data.sessions ?? [])[0] ?? {};
  const rawRecs: Record<string, any>[] = data.records ?? [];
  const start = new Date(session.start_time ?? rawRecs[0]?.timestamp ?? data.activity?.timestamp);
  if (!Number.isFinite(start.getTime())) throw new Error("Ce fichier .fit ne contient pas d'heure de départ : est-ce bien une séance ?");
  const t0 = start.getTime();

  const recs: Rec[] = rawRecs
    .map((r) => ({
      t: (new Date(r.timestamp).getTime() - t0) / 1000,
      d: typeof r.distance === 'number' ? r.distance : undefined,
      ele: typeof r.enhanced_altitude === 'number' ? r.enhanced_altitude : typeof r.altitude === 'number' ? r.altitude : undefined,
      hr: typeof r.heart_rate === 'number' && r.heart_rate > 25 ? r.heart_rate : undefined,
    }))
    .filter((r) => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t);

  // --- Durées, distance, dénivelé (la session d'abord, sinon calculé sur les points)
  const timerS = session.total_timer_time ?? session.total_elapsed_time ?? (recs.length ? recs[recs.length - 1].t : 0);
  const distM = session.total_distance ?? recs.filter((r) => r.d !== undefined).pop()?.d ?? 0;
  let gain = session.total_ascent;
  let loss = session.total_descent;
  if (gain === undefined || loss === undefined) {
    let g = 0;
    let l = 0;
    let ref: number | undefined;
    for (const r of recs) {
      if (r.ele === undefined) continue;
      if (ref === undefined) ref = r.ele;
      else if (r.ele - ref >= 3) (g += r.ele - ref), (ref = r.ele);
      else if (ref - r.ele >= 3) (l += ref - r.ele), (ref = r.ele);
    }
    gain ??= g;
    loss ??= l;
  }

  // --- FC et temps par zone (selon les zones de l'appli), pauses > 30 s ignorées
  const hrs = recs.filter((r) => r.hr !== undefined);
  let zonesMin: FitSummary['zonesMin'];
  if (hrs.length > 10) {
    const z = [0, 0, 0, 0, 0];
    for (let i = 1; i < hrs.length; i++) {
      const dt = hrs[i].t - hrs[i - 1].t;
      if (dt <= 0 || dt > 30) continue;
      const hr = hrs[i].hr!;
      const k = hr >= zoneBounds[4] ? 4 : hr >= zoneBounds[3] ? 3 : hr >= zoneBounds[2] ? 2 : hr >= zoneBounds[1] ? 1 : 0;
      z[k] += dt / 60;
    }
    zonesMin = z.map((m) => Math.round(m * 10) / 10) as FitSummary['zonesMin'];
  } else if (Array.isArray(session.time_in_hr_zone)) {
    const t = (session.time_in_hr_zone as number[]).slice(-5);
    if (t.length === 5) zonesMin = t.map((s) => Math.round((s / 60) * 10) / 10) as FitSummary['zonesMin'];
  }
  const totZ = zonesMin ? zonesMin.reduce((a, b) => a + b, 0) : 0;
  const hrAvg = session.avg_heart_rate ?? (hrs.length ? Math.round(hrs.reduce((t, r) => t + r.hr!, 0) / hrs.length) : undefined);
  const hrMax = session.max_heart_rate ?? (hrs.length ? Math.max(...hrs.map((r) => r.hr!)) : undefined);

  // --- Vitesse verticale : fenêtres d'environ 60 s, portions > 300 m/h en montée ou en descente
  const eles = recs.filter((r) => r.ele !== undefined);
  // lissage léger de l'altitude (moyenne sur 5 points) pour ne pas compter le bruit
  const sm = eles.map((r, i) => {
    const w = eles.slice(Math.max(0, i - 2), i + 3);
    return { t: r.t, ele: w.reduce((a, b) => a + b.ele!, 0) / w.length };
  });
  let upGain = 0;
  let upTime = 0;
  let downLoss = 0;
  let downTime = 0;
  for (let i = 0, j = 0; i < sm.length; i = j) {
    j = i + 1;
    while (j < sm.length && sm[j].t - sm[i].t < 60) j++;
    if (j >= sm.length) break;
    const dt = sm[j].t - sm[i].t;
    if (dt > 120) continue; // trou (pause, perte de signal)
    const de = sm[j].ele - sm[i].ele;
    const rate = (de / dt) * 3600;
    if (rate > 300) (upGain += de), (upTime += dt);
    else if (rate < -300) (downLoss -= de), (downTime += dt);
  }

  // --- Trace sous-échantillonnée (~10 s)
  const points: Track['points'] = [];
  let last = -Infinity;
  recs.forEach((r, i) => {
    if (r.t - last >= 10 || i === recs.length - 1) {
      points.push([Math.round(r.t), r.d !== undefined ? Math.round(r.d) : 0, r.ele !== undefined ? Math.round(r.ele * 10) / 10 : null, r.hr ?? null]);
      last = r.t;
    }
  });

  const { date, time } = parisDateTime(start);
  const sp = mapSport(session.sport ?? data.sports?.[0]?.sport, session.sub_sport ?? data.sports?.[0]?.sub_sport);
  const all = [session, ...(data.user_profile ? [data.user_profile] : []), ...((data.events as unknown[]) ?? [])];
  const recovery = findNumber(all, /recovery/i);
  return {
    startAt: start.toISOString(),
    date,
    time,
    sport: session.sport ?? '',
    subSport: session.sub_sport,
    type: sp.type,
    kindLabel: sp.label,
    distanceKm: Math.round((distM / 1000) * 100) / 100,
    durationMin: Math.round((timerS / 60) * 10) / 10,
    elapsedMin: session.total_elapsed_time ? Math.round((session.total_elapsed_time / 60) * 10) / 10 : undefined,
    elevationGain: Math.round(gain ?? 0),
    elevationLoss: Math.round(loss ?? 0),
    hrAvg,
    hrMax,
    zonesMin,
    zones: zonesMin && totZ > 0 ? (zonesMin.map((m) => Math.round((m / totZ) * 1000) / 1000) as FitSummary['zones']) : undefined,
    vo2max: findNumber(all, /vo2/i),
    // la récupération est parfois en minutes : au-delà de 200, on convertit en heures
    recoveryHours: recovery === undefined ? undefined : recovery > 200 ? Math.round(recovery / 60) : Math.round(recovery),
    trainingEffect: session.total_training_effect,
    vamUp: upTime > 60 ? Math.round((upGain / upTime) * 3600) : undefined,
    vamDown: downTime > 60 ? Math.round((downLoss / downTime) * 3600) : undefined,
    climbMin: Math.round(upTime / 60),
    descentMin: Math.round(downTime / 60),
    points,
  };
}

/** Lit le fichier (navigateur) et renvoie le résumé. */
export async function readFitFile(file: Blob, zoneBounds: number[]): Promise<FitSummary> {
  const { default: FitParser } = await import('fit-file-parser');
  const buf = await file.arrayBuffer();
  let data: Record<string, any>;
  try {
    data = (await new FitParser({ force: true, speedUnit: 'm/s', lengthUnit: 'm', mode: 'list' }).parseAsync(buf)) as Record<string, any>;
  } catch {
    throw new Error("Ce fichier n'est pas un .fit lisible. Exporte la séance au format FIT depuis l'appli Suunto.");
  }
  return summarizeFit(data, zoneBounds);
}
