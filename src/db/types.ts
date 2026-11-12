// Modèle de données (cahier des charges §3).
// Les dates sont stockées en texte « AAAA-MM-JJ » (jour local).

export type PainEntry = { zone: string; score: number };

export interface Race {
  id: string;
  name: string;
  shortName: string;
  date: string;
  distanceKm: number;
  elevationGain: number;
  elevationLoss?: number;
  status: 'done' | 'planned';
  resultTime?: string;
  goalTime?: string;
  notes?: string;
  gpx?: string;
  isMain?: boolean;
}

export type SessionType = 'Running' | 'Renfo' | 'Vélo' | 'Rando' | 'Repos' | 'Course';

export interface PlannedSession {
  id: string;
  date: string;
  week: string;
  phase: string;
  type: SessionType;
  isKey: boolean;
  title: string;
  durationMin?: number;
  distanceKm?: number;
  elevationGain?: number;
  intensity?: string;
  instructions?: string;
}

export interface Activity {
  id: string;
  plannedSessionId?: string;
  date: string;
  type: SessionType;
  durationMin: number;
  distanceKm: number;
  elevationGain: number;
  elevationLoss: number;
  hrAvg?: number;
  hrMax?: number;
  zones?: [number, number, number, number, number];
  elapsedMin?: number;
  screenshots?: Blob[];
  feelings: { plaisir: number; fatigue: number; flemme: number; moral: number; estomac: number };
  pains: PainEntry[];
  rpe?: number;
  note?: string;
  nutrition?: { carbsG?: number; notes?: string };
}

export interface CheckIn {
  id: string;
  date: string;
  bedTime: string;
  wakeTime: string;
  sleepQuality: number;
  forme: number;
  moral: number;
  pains: PainEntry[];
  location: string;
  availableMin?: number;
}

export type RouteTag = 'WE choc' | 'Plaisir' | 'Repérage' | 'Qualité';

export interface Route {
  id: string;
  location: string;
  name: string;
  tag: RouteTag;
  distanceKm: number;
  elevationGain: number;
  access?: string;
  note?: string;
}

export type ThemeChoice = 'auto' | 'jour' | 'nuit';

export interface Settings {
  id: 'main';
  hrRest: number;
  hrMax: number;
  /** Bornes des zones Z1..Z5 : [min Z1, min Z2, min Z3, min Z4, min Z5, max Z5] */
  zones: number[];
  theme: ThemeChoice;
  lastBackupAt?: string;
}
