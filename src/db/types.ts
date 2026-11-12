// Modèle de données (cahier des charges §3).
// Les dates sont stockées en texte « AAAA-MM-JJ » (jour local).

export type PainEntry = { zone: string; score: number };

/** Origine d'une donnée : saisie dans l'appli, ou importée du fichier Excel v18. */
export type Source = 'appli' | 'excel-v18' | 'fit' | 'suunto-json' | 'plan';

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
  /** Version du fichier plan qui a créé cette séance */
  planVersion?: string;
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
  // --- Données montre (import .fit ou historique Suunto) ---
  /** Départ exact (ISO, UTC) — sert à repérer les doublons */
  startAt?: string;
  /** Heure de départ « HH:MM » (heure de Paris) */
  startTime?: string;
  /** trail, route, rando… */
  subSport?: string;
  vo2max?: number;
  /** Temps de récupération estimé par la montre, en heures */
  recoveryHours?: number;
  /** Effet d'entraînement (Training Effect) */
  trainingEffect?: number;
  /** Vitesse verticale moyenne en montée / en descente (m/h), portions > 300 m/h */
  vamUp?: number;
  vamDown?: number;
}

/** Trace d'une séance, sous-échantillonnée (~10 s) : [secondes depuis le départ, distance m, altitude m, FC]. */
export interface Track {
  /** = id de la séance réalisée */
  id: string;
  points: [number, number, number | null, number | null][];
}

/** Nuit de sommeil (historique Suunto). */
export interface Sleep {
  /** = date du réveil AAAA-MM-JJ */
  id: string;
  date: string;
  bed?: string;
  wake?: string;
  hours?: number;
  deepH?: number;
  remH?: number;
  hrMin?: number;
  hrv?: number;
  /** Qualité telle que fournie par Suunto */
  quality?: number;
  source: Source;
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
  /** Règles d'alerte en vigueur (venues du dernier plan importé) */
  rules?: Partial<import('../lib/rules').Rules>;
}

/** Décision prise sur une proposition du coach (pour ne pas la reproposer, et pouvoir annuler). */
export interface CoachDecision {
  /** Clé stable de la proposition (règle + séance + jour) */
  id: string;
  decidedAt: string;
  decision: 'accepted' | 'refused';
  /** Option choisie (ex. « plat », « vélo », « alléger ») */
  option?: string;
  title: string;
  /** Séances telles qu'elles étaient AVANT l'adaptation (pour annuler) */
  before?: PlannedSession[];
  undone?: boolean;
}

/** Version de plan importée (historique, pour revenir en arrière). */
export interface PlanVersion {
  /** identifiant interne */
  id: string;
  version: string;
  date: string;
  resume: string;
  importedAt: string;
  /** Période remplacée [du, au] */
  from: string;
  to: string;
  /** Séances prévues retirées par cet import (pour les remettre en cas de retour arrière) */
  removed: PlannedSession[];
  /** Ids des séances créées par cet import */
  added: string[];
  /** Règles en vigueur AVANT l'import, et celles du plan */
  rulesBefore?: Record<string, number>;
  rules?: Record<string, number>;
  /** Objectifs par semaine (lundi → km / D+) */
  weekGoals: { monday: string; km?: number; dplus?: number; phase?: string; note?: string }[];
  /** Annulé (retour à la version précédente) */
  reverted?: boolean;
  /** Numéro d'ordre d'import (1, 2, 3…) */
  seq?: number;
}

/** Entrée du journal du coach (enseignements et décisions datés). */
export interface JournalEntry {
  id: string;
  date: string;
  texte: string;
  categorie?: string;
  /** Version du plan qui a apporté cette décision */
  planVersion?: string;
}
