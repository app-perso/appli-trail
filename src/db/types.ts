// Modèle de données (cahier des charges §3).
// Les dates sont stockées en texte « AAAA-MM-JJ » (jour local).

export type PainEntry = { zone: string; score: number };

/** Origine d'une donnée : saisie dans l'appli, ou importée du fichier Excel v18. */
export type Source = 'appli' | 'excel-v18';

/** Ravitaillement (ou point de passage) d'un plan de course. */
export interface AidStation {
  id: string;
  name: string;
  /** Kilomètre depuis le départ */
  km: number;
  /** Barrière horaire « HH:MM » (facultatif) */
  cutoff?: string;
  /** Consignes pour la section qui SE TERMINE à ce ravito */
  notes?: string;
}

export interface Race {
  id: string;
  name: string;
  shortName: string;
  date: string;
  distanceKm: number;
  elevationGain: number;
  elevationLoss?: number;
  status: 'done' | 'planned';
  /** Temps réalisé « h:mm » */
  resultTime?: string;
  /** Temps visé « h:mm » */
  goalTime?: string;
  notes?: string;
  /** Contenu du fichier GPX du parcours */
  gpx?: string;
  isMain?: boolean;
  /** Heure de départ « HH:MM » */
  startTime?: string;
  startName?: string;
  finishName?: string;
  aidStations?: AidStation[];
  /** Consignes de la dernière section (dernier ravito → arrivée) */
  finishNotes?: string;
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
  /** Commentaire importé sans chiffres réalisés (ex. « Bonne séance de renfo à la salle ») */
  note?: string;
  source?: Source;
}

export interface Feelings {
  plaisir: number;
  fatigue: number;
  flemme: number;
  moral: number;
  estomac: number;
}

export interface Activity {
  id: string;
  plannedSessionId?: string;
  date: string;
  type: SessionType;
  durationMin: number;
  distanceKm: number;
  elevationGain: number;
  /** D− inconnu pour l'historique importé (absent du fichier v18) */
  elevationLoss?: number;
  hrAvg?: number;
  hrMax?: number;
  zones?: [number, number, number, number, number];
  elapsedMin?: number;
  screenshots?: Blob[];
  /** Curseurs 0-10. Le débrief renfo (simplifié) ne remplit que « plaisir ». */
  feelings: Partial<Feelings>;
  /** true = séance prévue mais pas faite (débrief renfo « Pas fait ») */
  skipped?: boolean;
  pains: PainEntry[];
  rpe?: number;
  note?: string;
  nutrition?: { carbsG?: number; notes?: string };
  source?: Source;
}

export interface CheckIn {
  id: string;
  date: string;
  /** Heures absentes pour les check-ins importés du fichier v18 */
  bedTime?: string;
  wakeTime?: string;
  /** 1-5 */
  sleepQuality?: number;
  /** 0-10 (import v18 : forme 1-5 × 2) */
  forme?: number;
  moral?: number;
  pains: PainEntry[];
  location?: string;
  availableMin?: number;
  source?: Source;
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
  /** Tracé GPX (facultatif) : dessiné sur la carte */
  gpx?: string;
}

export type ThemeChoice = 'auto' | 'jour' | 'nuit';

export interface Settings {
  id: 'main';
  hrRest: number;
  hrMax: number;
  /** Bornes des zones Z1..Z5 : [min Z1, min Z2, min Z3, min Z4, min Z5, max Z5] */
  zones: number[];
  theme: ThemeChoice;
  /** Garder les images des captures Suunto (true par défaut) */
  keepScreenshots?: boolean;
  lastBackupAt?: string;
}
