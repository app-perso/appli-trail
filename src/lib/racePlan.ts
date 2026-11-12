// Plan de course : sections entre ravitos, heures de passage, glucides, marge sur les barrières, nuit.
import type { Race } from '../db/types';
import { kmEffort } from './calc';
import { segmentStats, type Track } from './gpx';

export const CARBS_PER_HOUR = 70; // milieu de la cible 60-80 g/h (§4)
export const DEFAULT_KE_PER_HOUR = 8;

export interface Section {
  index: number;
  from: string;
  to: string;
  fromKm: number;
  toKm: number;
  km: number;
  gain: number;
  loss: number;
  effort: number;
  durationMin: number;
  /** minutes depuis le départ à la fin de la section */
  endMin: number;
  /** heure d'arrivée à la fin de la section (minutes depuis minuit le jour J, peut dépasser 24 h) */
  clock: number;
  cutoff?: string;
  /** marge sur la barrière (minutes, négatif = hors délai) */
  marginMin?: number;
  carbsG: number;
  night: boolean;
  hardest: boolean;
  notes?: string;
  aidId?: string;
}

export interface RacePlan {
  sections: Section[];
  goalMin: number;
  goalEstimated: boolean;
  startClock: number;
  arrivalClock: number;
  minMargin?: number;
  sun?: { rise: number; set: number };
  totalEffort: number;
}

export const hmToMin = (t: string | undefined): number | undefined => {
  const m = t?.trim().match(/^(\d{1,3})\s*[:h]\s*(\d{1,2})$/);
  return m ? +m[1] * 60 + +m[2] : undefined;
};

/** 930 → « 15h30 », 1570 → « J+1 2h10 » */
export function formatClock(min: number): string {
  const day = Math.floor(min / 1440);
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const s = `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  return day > 0 ? `J+${day} ${s}` : s;
}
/** 562 → « 9h22 » (durée) */
export const formatHM = (min: number) => `${Math.floor(Math.round(min) / 60)}h${String(Math.round(min) % 60).padStart(2, '0')}`;

/** Lever / coucher du soleil (minutes, heure locale du téléphone) — formule NOAA simplifiée. */
export function sunTimes(dateISO: string, lat: number, lon: number): { rise: number; set: number } | undefined {
  const date = new Date(dateISO + 'T12:00:00');
  const start = new Date(date.getFullYear(), 0, 1);
  const n = Math.round((date.getTime() - start.getTime()) / 86_400_000) + 1;
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const latR = (lat * Math.PI) / 180;
  const cosHa = Math.cos((90.833 * Math.PI) / 180) / (Math.cos(latR) * Math.cos(decl)) - Math.tan(latR) * Math.tan(decl);
  if (cosHa < -1 || cosHa > 1) return undefined; // jour ou nuit polaire
  const ha = (Math.acos(cosHa) * 180) / Math.PI;
  const tz = -date.getTimezoneOffset();
  return { rise: 720 - 4 * (lon + ha) - eq + tz, set: 720 - 4 * (lon - ha) - eq + tz };
}

/**
 * Découpe la course aux ravitos et répartit le temps visé au prorata du km-effort (km + D+/100) de chaque section.
 * Sans temps visé : estimation à partir de ta vitesse en km-effort/h sur tes courses finies (sinon 8 km-effort/h).
 */
export function buildPlan(race: Race, track: Track | null, keffPerHourHistory?: number): RacePlan {
  const total = track?.distanceKm ?? race.distanceKm;
  const totalGain = track?.gain ?? race.elevationGain;
  const aids = [...(race.aidStations ?? [])].filter((a) => a.km > 0 && a.km < total).sort((a, b) => a.km - b.km);
  const stops = [
    { name: race.startName || 'Départ', km: 0 },
    ...aids.map((a) => ({ name: a.name, km: a.km, aid: a })),
    { name: race.finishName || 'Arrivée', km: total },
  ];
  const raw = stops.slice(1).map((to, i) => {
    const from = stops[i];
    const st = track ? segmentStats(track, from.km, to.km) : { km: to.km - from.km, gain: totalGain * ((to.km - from.km) / total), loss: (race.elevationLoss ?? totalGain) * ((to.km - from.km) / total) };
    return { from, to, ...st, effort: kmEffort(st.km, st.gain) };
  });
  const totalEffort = raw.reduce((t, s) => t + s.effort, 0) || 1;
  const goal = hmToMin(race.goalTime);
  const kePerH = keffPerHourHistory && keffPerHourHistory > 2 ? keffPerHourHistory : DEFAULT_KE_PER_HOUR;
  const goalMin = goal ?? (kmEffort(total, totalGain) / kePerH) * 60;
  const startClock = hmToMin(race.startTime) ?? 7 * 60;
  const first = track?.points[0];
  const sun = sunTimes(race.date, first?.lat ?? 43.7, first?.lon ?? 7.26);
  const isNight = (clock: number) => {
    if (!sun) return false;
    const m = ((clock % 1440) + 1440) % 1440;
    return m < sun.rise || m > sun.set;
  };

  let elapsed = 0;
  const hardestIdx = raw.reduce((best, s, i) => (s.effort / Math.max(s.km, 0.1) > raw[best].effort / Math.max(raw[best].km, 0.1) ? i : best), 0);
  const sections: Section[] = raw.map((s, i) => {
    const durationMin = (goalMin * s.effort) / totalEffort;
    const startAt = startClock + elapsed;
    elapsed += durationMin;
    const clock = startClock + elapsed;
    const aid = 'aid' in s.to ? s.to.aid : undefined;
    const cutoff = aid?.cutoff;
    let marginMin: number | undefined;
    const c = hmToMin(cutoff);
    if (c !== undefined) {
      // barrière exprimée en heure du jour ; si elle est avant le départ, c'est le lendemain
      const cutClock = c < startClock ? c + 1440 : c;
      marginMin = cutClock - clock;
    }
    return {
      index: i + 1,
      from: s.from.name,
      to: s.to.name,
      fromKm: s.from.km,
      toKm: s.to.km,
      km: s.km,
      gain: s.gain,
      loss: s.loss,
      effort: s.effort,
      durationMin,
      endMin: elapsed,
      clock,
      cutoff,
      marginMin,
      carbsG: Math.round(((durationMin / 60) * CARBS_PER_HOUR) / 5) * 5,
      night: isNight(startAt) || isNight(clock),
      hardest: raw.length > 2 && i === hardestIdx,
      notes: aid ? aid.notes : race.finishNotes,
      aidId: aid?.id,
    };
  });
  const margins = sections.map((s) => s.marginMin).filter((m): m is number => m !== undefined);
  return {
    sections,
    goalMin,
    goalEstimated: goal === undefined,
    startClock,
    arrivalClock: startClock + goalMin,
    minMargin: margins.length ? Math.min(...margins) : undefined,
    sun,
    totalEffort,
  };
}
