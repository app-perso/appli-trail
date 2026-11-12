// Règles d'alerte et d'adaptation : seuils paramétrables par le fichier plan (« regles »).
// Valeurs par défaut = cahier des charges §4. Le plan importé peut en remplacer certaines.

export interface Rules {
  /** Couloir : nombre de semaines de référence (moyenne) */
  couloir_semaines: number;
  /** Couloir : hausse max (%) par rapport à la moyenne des semaines de référence */
  couloir_hausse_pct: number;
  /** Hausse max (%) du volume d'une semaine par rapport à la précédente (0 = pas de contrôle) */
  hausse_max_semaine_pct: number;
  /** Tolérance (%) avant de signaler qu'un plan dépasse un plafond */
  tolerance_pct: number;
  /** Ratio de charge (7 j / 28 j) : sous ce seuil = charge basse */
  ratio_bas: number;
  /** Ratio de charge : au-dessus = attention */
  ratio_attention: number;
  /** Ratio de charge : au-dessus = risque */
  ratio_risque: number;
  /** D− cumulé max sur 2 jours (m) */
  dmoins_2j_max_m: number;
  /** D− d'une semaine max par rapport à la moyenne des 4 précédentes (facteur) */
  dmoins_semaine_facteur: number;
  /** Forme du matin (0-10) : à ce niveau ou moins deux matins de suite → alléger */
  forme_min: number;
  /** Forme du matin (0-10) : à ce niveau ou moins → feu orange */
  forme_orange: number;
  /** Qualité de sommeil (1-5) : à ce niveau ou moins = nuit difficile */
  qualite_sommeil_min: number;
  /** Nombre de nuits difficiles sur 7 qui déclenche l'allègement */
  nuits_difficiles_max: number;
  /** Durée de sommeil (h) sous laquelle on allège la séance du jour (lendemain de la nuit courte) */
  sommeil_min_h: number;
  /** Fatigue ressentie après une séance (0-10) : à ce niveau ou plus → alerte et séance suivante allégée */
  fatigue_alerte: number;
  /** Douleur au réveil (0-10) : à partir de ce niveau → prochaine sortie sans D+ (ou vélo) */
  douleur_adapter: number;
  /** Douleur (0-10) : à partir de ce niveau → arrêt de la course, avis kiné */
  douleur_stop: number;
  /** Une semaine allégée toutes les N semaines */
  semaine_allegee_toutes_les: number;
  /** Allègement (%) d'une semaine ou d'une séance allégée */
  allegement_pct: number;
}

export const DEFAULT_RULES: Rules = {
  couloir_semaines: 3,
  couloir_hausse_pct: 15,
  hausse_max_semaine_pct: 0,
  tolerance_pct: 2,
  ratio_bas: 0.8,
  ratio_attention: 1.3,
  ratio_risque: 1.5,
  dmoins_2j_max_m: 2000,
  dmoins_semaine_facteur: 1.3,
  forme_min: 2,
  forme_orange: 3,
  qualite_sommeil_min: 2,
  nuits_difficiles_max: 3,
  sommeil_min_h: 6,
  fatigue_alerte: 9,
  douleur_adapter: 1,
  douleur_stop: 5,
  semaine_allegee_toutes_les: 4,
  allegement_pct: 30,
};

/** Bornes acceptées pour chaque règle (validation du fichier plan). */
export const RULE_LIMITS: Record<keyof Rules, [number, number]> = {
  couloir_semaines: [1, 8],
  couloir_hausse_pct: [0, 50],
  hausse_max_semaine_pct: [0, 100],
  tolerance_pct: [0, 20],
  ratio_bas: [0.3, 1.2],
  ratio_attention: [1, 2],
  ratio_risque: [1.1, 3],
  dmoins_2j_max_m: [300, 10000],
  dmoins_semaine_facteur: [1, 3],
  forme_min: [0, 10],
  forme_orange: [0, 10],
  qualite_sommeil_min: [1, 5],
  nuits_difficiles_max: [1, 7],
  sommeil_min_h: [3, 10],
  fatigue_alerte: [1, 10],
  douleur_adapter: [1, 10],
  douleur_stop: [1, 10],
  semaine_allegee_toutes_les: [2, 12],
  allegement_pct: [5, 60],
};

export const RULE_LABELS: Record<keyof Rules, string> = {
  couloir_semaines: 'Couloir : semaines de référence',
  couloir_hausse_pct: 'Couloir : hausse max vs moyenne (%)',
  hausse_max_semaine_pct: 'Hausse max vs semaine précédente (%)',
  tolerance_pct: 'Tolérance avant alerte (%)',
  ratio_bas: 'Ratio de charge : bas sous',
  ratio_attention: 'Ratio de charge : attention au-dessus de',
  ratio_risque: 'Ratio de charge : risque au-dessus de',
  dmoins_2j_max_m: 'D− max sur 2 jours (m)',
  dmoins_semaine_facteur: 'D− semaine max (× moyenne)',
  forme_min: 'Forme (0-10) qui allège, 2 matins de suite',
  forme_orange: 'Forme (0-10) en feu orange',
  qualite_sommeil_min: 'Qualité de sommeil (1-5) = nuit difficile',
  nuits_difficiles_max: 'Nuits difficiles sur 7 avant allègement',
  sommeil_min_h: 'Sommeil minimum (h) avant allègement',
  fatigue_alerte: 'Fatigue ressentie (0-10) qui alerte',
  douleur_adapter: 'Douleur au réveil qui adapte (0-10)',
  douleur_stop: 'Douleur qui arrête la course (0-10)',
  semaine_allegee_toutes_les: 'Semaine allégée toutes les (semaines)',
  allegement_pct: 'Allègement (%)',
};

// Règles actives : fixées par l'appli au démarrage (réglages) et à chaque import de plan.
let active: Rules = DEFAULT_RULES;
export function setActiveRules(r?: Partial<Rules>) {
  active = { ...DEFAULT_RULES, ...(r ?? {}) };
}
/** Règles en vigueur. */
export function R(): Rules {
  return active;
}
/** Facteur du couloir (1,15 pour +15 %). */
export const corridorFactor = () => 1 + R().couloir_hausse_pct / 100;
export const tolerance = () => 1 + R().tolerance_pct / 100;
