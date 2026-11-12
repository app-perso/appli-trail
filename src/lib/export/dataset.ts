// Jeu de données « pour l'analyse » : une table par type de données, une ligne par élément.
// Chaque colonne est décrite une seule fois ici : Excel, CSV, JSON et l'onglet « Lisez-moi » en découlent.
import type { Activity, CheckIn, PlannedSession, Race, Settings } from '../../db/types';
import { kmEffort } from '../calc';
import { mondayOf, sleepMinutes, todayISO } from '../dates';
import { dailyKmEffort, loadRatio, weeklySeries, CORRIDOR_FACTOR } from '../analysis';
import { FOOT_TYPES } from '../week';

export type Cell = string | number | null;
export interface Column {
  key: string;
  description: string;
}
export interface Table {
  /** Nom de l'onglet / du fichier */
  name: string;
  description: string;
  columns: Column[];
  rows: Record<string, Cell>[];
}
export interface Dataset {
  exportedAt: string;
  appVersion: string;
  tables: Table[];
  readme: { section: string; item: string; description: string }[];
}

const r1 = (n: number | undefined | null, d = 1): number | null =>
  n === undefined || n === null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d;
const pct = (f: number | undefined) => (f === undefined ? null : r1(f * 100, 1));
const yes = (b: boolean | undefined) => (b ? 1 : 0);
const painsText = (p: { zone: string; score: number }[]) => (p.length ? p.map((x) => `${x.zone}:${x.score}`).join('; ') : null);
const painMax = (p: { zone: string; score: number }[]) => (p.length ? Math.max(...p.map((x) => x.score)) : null);
const hmm = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;

// ---------- Colonnes ----------
const SESSION_COLS: Column[] = [
  { key: 'date', description: 'Date de la séance (AAAA-MM-JJ).' },
  { key: 'semaine_debut', description: 'Lundi de la semaine de la séance (AAAA-MM-JJ). Semaines du lundi au dimanche.' },
  { key: 'semaine_plan', description: 'Numéro de semaine du plan (S0, S1…), si connu.' },
  { key: 'phase', description: 'Phase du plan (Reprise, Construction, Affûtage…), si connue.' },
  { key: 'type', description: 'Running (course à pied), Rando, Vélo, Renfo, Repos, Course (compétition).' },
  { key: 'seance_cle', description: '1 = séance clé (⭐), 0 sinon.' },
  { key: 'titre', description: 'Intitulé de la séance.' },
  { key: 'intensite_prevue', description: 'Intensité prévue, texte libre (ex. Z2, Z1-Z2).' },
  { key: 'consignes', description: 'Consignes prévues, texte libre.' },
  { key: 'duree_prevue_min', description: 'Durée prévue, en minutes.' },
  { key: 'distance_prevue_km', description: 'Distance prévue, en km.' },
  { key: 'd_plus_prevu_m', description: 'Dénivelé positif prévu, en mètres.' },
  { key: 'statut', description: 'faite · pas_faite (prévue mais non réalisée) · a_venir (date future) · non_renseignee (date passée sans débrief) · repos.' },
  { key: 'duree_realisee_min', description: 'Durée réalisée en minutes (durée en mouvement).' },
  { key: 'distance_realisee_km', description: 'Distance réalisée, en km.' },
  { key: 'd_plus_realise_m', description: 'Dénivelé positif réalisé, en mètres.' },
  { key: 'd_moins_realise_m', description: 'Dénivelé négatif réalisé, en mètres. Vide si inconnu (historique importé du fichier Excel v18, qui ne le contenait pas).' },
  { key: 'km_effort', description: 'km-effort réalisé = km + D+ / 100 (séances à pied uniquement).' },
  { key: 'fc_moy_bpm', description: 'Fréquence cardiaque moyenne, en battements par minute.' },
  { key: 'fc_max_bpm', description: 'Fréquence cardiaque maximale, en battements par minute.' },
  { key: 'zone1_pct', description: '% du temps en zone cardiaque 1 (0-100). Bornes des zones : onglet Réglages.' },
  { key: 'zone2_pct', description: '% du temps en zone 2 (0-100).' },
  { key: 'zone3_pct', description: '% du temps en zone 3 (0-100).' },
  { key: 'zone4_pct', description: '% du temps en zone 4 (0-100).' },
  { key: 'zone5_pct', description: '% du temps en zone 5 (0-100).' },
  { key: 'rpe_1_10', description: 'Effort ressenti (RPE), de 1 (très facile) à 10 (maximal). Pour le renfo : difficulté ressentie.' },
  { key: 'plaisir_0_10', description: 'Plaisir pendant la séance, 0 à 10 (10 = maximal).' },
  { key: 'fatigue_apres_0_10', description: 'Fatigue après la séance, 0 à 10 (10 = épuisé).' },
  { key: 'flemme_avant_0_10', description: 'Flemme avant de partir, 0 à 10 (10 = énorme flemme).' },
  { key: 'moral_apres_0_10', description: 'Moral après la séance, 0 à 10 (10 = excellent).' },
  { key: 'estomac_0_10', description: 'Confort digestif, 0 à 10 (10 = parfait, ≤ 3 = nausées).' },
  { key: 'douleurs', description: 'Douleurs pendant / après la séance : « zone:score » séparés par « ; » (score 0-10). Import v18 : zone « Genou » (côté inconnu).' },
  { key: 'douleur_max_0_10', description: 'Score de douleur le plus élevé de la séance (0-10).' },
  { key: 'heure_depart', description: 'Heure de départ HH:MM (heure de Paris), si la séance vient de la montre (.fit ou historique Suunto).' },
  { key: 'vo2max', description: 'VO2max estimée par la montre (ml/kg/min), si fournie.' },
  { key: 'recup_h', description: 'Temps de récupération estimé par la montre, en heures.' },
  { key: 'effet_entrainement', description: 'Effet d’entraînement (Training Effect) donné par la montre.' },
  { key: 'vam_montee_m_h', description: 'Vitesse verticale moyenne en montée, en m/h (portions qui montent à plus de 300 m/h, fenêtres d’environ 60 s).' },
  { key: 'vam_descente_m_h', description: 'Vitesse verticale moyenne en descente, en m/h (portions qui descendent à plus de 300 m/h).' },
  { key: 'note', description: 'Commentaire libre sur la séance réalisée.' },
  { key: 'commentaire_plan', description: 'Commentaire sans chiffres réalisés, rattaché à la séance prévue (import v18).' },
  { key: 'source', description: "appli = saisi dans l'appli · excel-v18 = importé du fichier Excel de préparation · fit = importé d'un fichier .fit de la montre · suunto-json = historique Suunto importé." },
];

const CHECKIN_COLS: Column[] = [
  { key: 'date', description: 'Date du matin (AAAA-MM-JJ).' },
  { key: 'coucher', description: 'Heure de coucher (HH:MM), la veille au soir. Vide pour l’historique importé.' },
  { key: 'lever', description: 'Heure de lever (HH:MM).' },
  { key: 'sommeil_h', description: 'Durée de sommeil en heures décimales (lever − coucher, passage de minuit géré).' },
  { key: 'qualite_sommeil_1_5', description: 'Qualité ressentie du sommeil, 1 (très mauvaise) à 5 (excellente).' },
  { key: 'forme_0_10', description: 'Forme physique au réveil, 0 à 10. Import v18 : note d’origine sur 5 multipliée par 2.' },
  { key: 'moral_0_10', description: 'Moral au réveil, 0 à 10. Vide pour l’historique importé.' },
  { key: 'douleurs', description: 'Douleurs au réveil : « zone:score » séparés par « ; » (score 0-10).' },
  { key: 'douleur_max_0_10', description: 'Score de douleur le plus élevé au réveil (0-10).' },
  { key: 'lieu', description: 'Lieu du jour (Nice, Saint-Cloud…).' },
  { key: 'temps_dispo_min', description: 'Temps disponible pour s’entraîner ce jour-là, en minutes (180 = 3 h ou plus).' },
  { key: 'source', description: 'appli ou excel-v18.' },
];

const RACE_COLS: Column[] = [
  { key: 'date', description: 'Date de la course (AAAA-MM-JJ).' },
  { key: 'nom', description: 'Nom complet de la course.' },
  { key: 'statut', description: 'faite ou a_venir.' },
  { key: 'objectif_principal', description: '1 = objectif principal de la saison, 0 sinon.' },
  { key: 'distance_km', description: 'Distance, en km.' },
  { key: 'd_plus_m', description: 'Dénivelé positif, en mètres.' },
  { key: 'd_moins_m', description: 'Dénivelé négatif, en mètres (si connu).' },
  { key: 'km_effort', description: 'km-effort de la course = km + D+ / 100.' },
  { key: 'temps_realise_min', description: 'Temps réalisé, en minutes (courses faites).' },
  { key: 'temps_realise_hmm', description: 'Temps réalisé au format h:mm (lisible).' },
  { key: 'km_effort_par_h', description: 'Vitesse en km-effort par heure (courses faites).' },
  { key: 'objectif_temps', description: 'Temps visé, texte libre.' },
  { key: 'notes', description: 'Notes libres.' },
];

const WEEK_COLS: Column[] = [
  { key: 'semaine_debut', description: 'Lundi de la semaine (AAAA-MM-JJ).' },
  { key: 'semaine_fin', description: 'Dimanche de la semaine (AAAA-MM-JJ).' },
  { key: 'semaine_plan', description: 'Numéro de semaine du plan (S0, S1…), si connu.' },
  { key: 'phase', description: 'Phase du plan, si connue.' },
  { key: 'km_pied_prevu', description: 'km à pied prévus (course à pied + rando + compétition), en km.' },
  { key: 'km_pied_realise', description: 'km à pied réalisés, en km. Vide si la semaine est terminée sans aucun débrief (réalisé inconnu, pas zéro).' },
  { key: 'd_plus_prevu_m', description: 'D+ à pied prévu, en mètres.' },
  { key: 'd_plus_realise_m', description: 'D+ à pied réalisé, en mètres.' },
  { key: 'd_moins_realise_m', description: 'D− à pied réalisé, en mètres. Vide si aucune D− connue cette semaine (historique v18).' },
  { key: 'temps_prevu_min', description: 'Temps d’entraînement prévu (tous types sauf repos), en minutes.' },
  { key: 'temps_realise_min', description: 'Temps d’entraînement réalisé (tous types), en minutes.' },
  { key: 'km_effort_realise', description: 'km-effort à pied réalisé (somme de km + D+/100).' },
  { key: 'seances_prevues', description: 'Nombre de séances prévues (hors repos).' },
  { key: 'seances_faites', description: 'Nombre de séances réalisées.' },
  { key: 'seances_pas_faites', description: 'Nombre de séances prévues explicitement marquées « pas faites ».' },
  { key: 'renfo_prevus', description: 'Nombre de séances de renfo prévues.' },
  { key: 'renfo_faits', description: 'Nombre de séances de renfo réalisées.' },
  { key: 'plafond_couloir_km', description: `Plafond du couloir de sécurité = moyenne des km à pied réalisés des 3 semaines précédentes × ${String(CORRIDOR_FACTOR).replace('.', ',')}. Vide pour la 1re semaine.` },
  { key: 'dans_couloir', description: '1 = km réalisés ≤ plafond, 0 = au-dessus (alerte), vide si pas de plafond.' },
  { key: 'variation_km_vs_s_1_pct', description: 'Évolution des km à pied réalisés par rapport à la semaine précédente, en %.' },
  { key: 'ratio_charge_fin_semaine', description: 'Ratio de charge le dimanche = km-effort des 7 derniers jours ÷ (km-effort des 28 derniers jours / 4). Vide si moins de 28 jours d’historique.' },
  { key: 'sommeil_moyen_h', description: 'Durée de sommeil moyenne (check-ins avec heures), en heures.' },
  { key: 'qualite_sommeil_moy_1_5', description: 'Qualité de sommeil moyenne (1-5).' },
  { key: 'forme_moy_0_10', description: 'Forme du matin moyenne (0-10).' },
  { key: 'douleur_max_0_10', description: 'Douleur la plus forte de la semaine (check-ins et séances, 0-10).' },
];

const SETTINGS_COLS: Column[] = [
  { key: 'parametre', description: 'Nom du réglage.' },
  { key: 'valeur', description: 'Valeur.' },
  { key: 'unite', description: 'Unité.' },
  { key: 'description', description: 'Explication.' },
];

// ---------- Construction ----------
export function buildDataset(input: {
  sessions: PlannedSession[];
  activities: Activity[];
  checkIns: CheckIn[];
  races: Race[];
  settings: Settings;
  appVersion: string;
  today?: string;
}): Dataset {
  const today = input.today ?? todayISO();
  const sessions = [...input.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const activities = [...input.activities].sort((a, b) => a.date.localeCompare(b.date));
  const checkIns = [...input.checkIns].sort((a, b) => a.date.localeCompare(b.date));
  const actByPlan = new Map(activities.filter((a) => a.plannedSessionId).map((a) => [a.plannedSessionId!, a]));
  const planIds = new Set(sessions.map((s) => s.id));

  // --- Séances : une ligne par séance prévue, + les séances faites sans séance prévue
  const sessionRow = (s: PlannedSession | undefined, a: Activity | undefined): Record<string, Cell> => {
    const date = (s?.date ?? a?.date)!;
    const type = (s?.type ?? a?.type)!;
    const statut = a ? (a.skipped ? 'pas_faite' : 'faite') : type === 'Repos' ? 'repos' : date > today ? 'a_venir' : 'non_renseignee';
    const done = a && !a.skipped ? a : undefined;
    return {
      date,
      semaine_debut: mondayOf(date),
      semaine_plan: s?.week || null,
      phase: s?.phase || null,
      type,
      seance_cle: yes(s?.isKey),
      titre: s?.title ?? null,
      intensite_prevue: s?.intensity ?? null,
      consignes: s?.instructions ?? null,
      duree_prevue_min: r1(s?.durationMin),
      distance_prevue_km: r1(s?.distanceKm, 2),
      d_plus_prevu_m: r1(s?.elevationGain, 0),
      statut,
      duree_realisee_min: done ? r1(done.durationMin) : null,
      distance_realisee_km: done ? r1(done.distanceKm, 2) : null,
      d_plus_realise_m: done ? r1(done.elevationGain, 0) : null,
      d_moins_realise_m: done ? r1(done.elevationLoss, 0) : null,
      km_effort: done && FOOT_TYPES.includes(done.type) ? r1(kmEffort(done.distanceKm, done.elevationGain), 1) : null,
      fc_moy_bpm: done?.hrAvg ?? null,
      fc_max_bpm: done?.hrMax ?? null,
      zone1_pct: pct(done?.zones?.[0]),
      zone2_pct: pct(done?.zones?.[1]),
      zone3_pct: pct(done?.zones?.[2]),
      zone4_pct: pct(done?.zones?.[3]),
      zone5_pct: pct(done?.zones?.[4]),
      rpe_1_10: done?.rpe ?? null,
      plaisir_0_10: done?.feelings.plaisir ?? null,
      fatigue_apres_0_10: done?.feelings.fatigue ?? null,
      flemme_avant_0_10: done?.feelings.flemme ?? null,
      moral_apres_0_10: done?.feelings.moral ?? null,
      estomac_0_10: done?.feelings.estomac ?? null,
      douleurs: a ? painsText(a.pains) : null,
      douleur_max_0_10: a ? painMax(a.pains) : null,
      heure_depart: a?.startTime ?? null,
      vo2max: done?.vo2max ?? null,
      recup_h: done?.recoveryHours ?? null,
      effet_entrainement: done?.trainingEffect ?? null,
      vam_montee_m_h: done?.vamUp ?? null,
      vam_descente_m_h: done?.vamDown ?? null,
      note: a?.note ?? null,
      commentaire_plan: s?.note ?? null,
      source: (a?.source ?? s?.source) || 'appli',
    };
  };
  const sessionRows = [
    ...sessions.map((s) => sessionRow(s, actByPlan.get(s.id))),
    ...activities.filter((a) => !a.plannedSessionId || !planIds.has(a.plannedSessionId)).map((a) => sessionRow(undefined, a)),
  ].sort((x, y) => String(x.date).localeCompare(String(y.date)));

  // --- Check-ins
  const checkInRows = checkIns.map((c) => ({
    date: c.date,
    coucher: c.bedTime ?? null,
    lever: c.wakeTime ?? null,
    sommeil_h: c.bedTime && c.wakeTime ? r1(sleepMinutes(c.bedTime, c.wakeTime) / 60, 2) : null,
    qualite_sommeil_1_5: c.sleepQuality ?? null,
    forme_0_10: c.forme ?? null,
    moral_0_10: c.moral ?? null,
    douleurs: painsText(c.pains),
    douleur_max_0_10: painMax(c.pains),
    lieu: c.location || null,
    temps_dispo_min: c.availableMin ?? null,
    source: c.source || 'appli',
  }));

  // --- Courses
  const raceRows = [...input.races]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      const min = r.resultTime ? parseHmm(r.resultTime) : undefined;
      const ke = kmEffort(r.distanceKm, r.elevationGain);
      return {
        date: r.date,
        nom: r.name,
        statut: r.status === 'done' || r.date < today ? 'faite' : 'a_venir',
        objectif_principal: yes(r.isMain),
        distance_km: r1(r.distanceKm, 2),
        d_plus_m: r.elevationGain,
        d_moins_m: r.elevationLoss ?? null,
        km_effort: r1(ke, 1),
        temps_realise_min: min ?? null,
        temps_realise_hmm: min !== undefined ? hmm(min) : null,
        km_effort_par_h: min ? r1(ke / (min / 60), 2) : null,
        objectif_temps: r.goalTime ?? null,
        notes: r.notes ?? null,
      };
    });

  // --- Semaines
  const allDates = [...sessions.map((s) => s.date), ...activities.map((a) => a.date), ...checkIns.map((c) => c.date)].sort();
  const weekRows: Record<string, Cell>[] = [];
  if (allDates.length) {
    const daily = dailyKmEffort(activities);
    const doneFoot = activities.filter((a) => !a.skipped && FOOT_TYPES.includes(a.type)).map((a) => a.date).sort();
    const historyStart = doneFoot[0];
    const last = allDates[allDates.length - 1] > today ? allDates[allDates.length - 1] : today;
    const series = weeklySeries(sessions, activities, today, allDates[0], last);
    let prevKm: number | undefined;
    for (const w of series) {
      const { monday: mon, sunday: sun, totals: t } = w;
      const wc = checkIns.filter((x) => x.date >= mon && x.date <= sun);
      const wa = activities.filter((x) => x.date >= mon && x.date <= sun);
      const ceiling = w.ceiling.km;
      const sleeps = wc.filter((c) => c.bedTime && c.wakeTime).map((c) => sleepMinutes(c.bedTime!, c.wakeTime!) / 60);
      const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
      const pains = [...wc.flatMap((c) => c.pains), ...wa.flatMap((a) => a.pains)].map((p) => p.score);
      const isPast = mon <= today;
      weekRows.push({
        semaine_debut: mon,
        semaine_fin: sun,
        semaine_plan: w.label ?? null,
        phase: w.phase ?? null,
        km_pied_prevu: r1(t.plannedKm, 2),
        km_pied_realise: w.unknown ? null : r1(t.doneKm, 2),
        d_plus_prevu_m: r1(t.plannedDPlus, 0),
        d_plus_realise_m: w.unknown ? null : r1(t.doneDPlus, 0),
        d_moins_realise_m: w.unknown || t.doneDMinus === null ? null : r1(t.doneDMinus, 0),
        temps_prevu_min: r1(t.plannedMin, 0),
        temps_realise_min: w.unknown ? null : r1(t.doneMin, 0),
        km_effort_realise: w.unknown ? null : r1(t.doneKmEffort, 1),
        seances_prevues: t.plannedSessions,
        seances_faites: t.doneSessions,
        seances_pas_faites: t.skippedSessions,
        renfo_prevus: t.renfoPlanned,
        renfo_faits: t.renfoDone,
        plafond_couloir_km: r1(ceiling, 1),
        dans_couloir: ceiling === undefined || !isPast || w.unknown ? null : t.doneKm <= ceiling ? 1 : 0,
        variation_km_vs_s_1_pct: prevKm && !w.unknown ? r1(((t.doneKm - prevKm) / prevKm) * 100, 0) : null,
        ratio_charge_fin_semaine: isPast ? r1(loadRatio(daily, sun < today ? sun : today, historyStart), 2) : null,
        sommeil_moyen_h: r1(avg(sleeps), 2),
        qualite_sommeil_moy_1_5: r1(avg(wc.flatMap((c) => (c.sleepQuality !== undefined ? [c.sleepQuality] : []))), 1),
        forme_moy_0_10: r1(avg(wc.flatMap((c) => (c.forme !== undefined ? [c.forme] : []))), 1),
        douleur_max_0_10: pains.length ? Math.max(...pains) : null,
      });
      if ((w.complete || w.current) && !w.unknown) prevKm = t.doneKm;
      else if (w.unknown) prevKm = undefined;
    }
  }

  // --- Réglages
  const s = input.settings;
  const z = s.zones;
  const settingsRows: Record<string, Cell>[] = [
    { parametre: 'fc_repos', valeur: s.hrRest, unite: 'bpm', description: 'Fréquence cardiaque au repos.' },
    { parametre: 'fc_max', valeur: s.hrMax, unite: 'bpm', description: 'Fréquence cardiaque maximale.' },
    ...[0, 1, 2, 3, 4].map((i) => ({
      parametre: `zone${i + 1}`,
      valeur: `${z[i]}-${z[i + 1]}`,
      unite: 'bpm',
      description: `Zone ${i + 1} (Karvonen) : de ${50 + i * 10} % à ${60 + i * 10} % de la FC de réserve, ajoutés à la FC repos.`,
    })),
    { parametre: 'coucher_cible', valeur: '23:00', unite: 'HH:MM', description: 'Heure de coucher visée.' },
    { parametre: 'glucides_cible', valeur: '60-80', unite: 'g/h', description: 'Apport en glucides visé pendant l’effort long.' },
    { parametre: 'date_export', valeur: today, unite: 'AAAA-MM-JJ', description: 'Date de création de cet export.' },
    { parametre: 'version_appli', valeur: input.appVersion, unite: '', description: 'Version de l’Appli Trail.' },
  ];

  const tables: Table[] = [
    { name: 'Seances', description: 'Une ligne par séance (prévue et/ou réalisée), avec les ressentis du débrief.', columns: SESSION_COLS, rows: sessionRows },
    { name: 'Checkins', description: 'Une ligne par matin : sommeil, forme, moral, douleurs.', columns: CHECKIN_COLS, rows: checkInRows },
    { name: 'Courses', description: 'Une ligne par course (passées et à venir).', columns: RACE_COLS, rows: raceRows },
    { name: 'Semaines', description: 'Bilan calculé par semaine (lundi → dimanche).', columns: WEEK_COLS, rows: weekRows },
    { name: 'Reglages', description: 'Réglages et repères (FC, zones, cibles).', columns: SETTINGS_COLS, rows: settingsRows },
  ];

  return { exportedAt: new Date().toISOString(), appVersion: input.appVersion, tables, readme: buildReadme(tables) };
}

function parseHmm(t: string): number | undefined {
  const m = t.match(/^(\d{1,2})[:h](\d{2})(?:[:'](\d{2}))?$/);
  return m ? +m[1] * 60 + +m[2] + (m[3] ? +m[3] / 60 : 0) : undefined;
}

function buildReadme(tables: Table[]) {
  const g = (item: string, description: string) => ({ section: 'Général', item, description });
  const rule = (item: string, description: string) => ({ section: 'Règles de calcul', item, description });
  return [
    g('Contenu', 'Historique complet d’entraînement trail exporté de l’Appli Trail, pensé pour l’analyse (par une personne ou une IA).'),
    g('Format', 'Une ligne par élément. Dates au format AAAA-MM-JJ, heures HH:MM. Unités indiquées dans le nom des colonnes (_km, _m, _min, _bpm, _pct, _h). Aucune cellule fusionnée, aucune formule.'),
    g('Valeurs vides', 'Une cellule vide signifie « inconnu » ou « non renseigné », jamais zéro.'),
    g('Échelles', 'Suffixe _0_10 : note de 0 à 10. Suffixe _1_5 : note de 1 à 5. Suffixe _1_10 : note de 1 à 10. Booléens : 1 = oui, 0 = non.'),
    g('CSV', 'Encodage UTF-8, séparateur virgule, point décimal, une table par fichier.'),
    g('Origine des données', 'Colonne source : « appli » (saisi dans l’appli) ou « excel-v18 » (importé du fichier Excel de préparation : pas de D−, pas d’heures de sommeil, forme notée sur 5 et convertie sur 10, douleur genou seulement).'),
    rule('km-effort', 'km-effort = km + D+ / 100. Mesure la charge d’une sortie en tenant compte du dénivelé (100 m de D+ ≈ 1 km).'),
    rule('Km à pied', 'Course à pied (Running) + rando + compétition. Le vélo et le renfo comptent dans le temps, pas dans les km.'),
    rule('Couloir de sécurité', `Plafond de la semaine N = moyenne des km à pied réalisés des 3 semaines précédentes × ${String(CORRIDOR_FACTOR).replace('.', ',')} (moins de 3 semaines : celles disponibles). Au-dessus = semaine trop chargée (alerte). Progression visée : +10 à 15 % par semaine, 1 semaine allégée (−25 à −35 %) toutes les 4 semaines.`),
    rule('Ratio de charge', 'Ratio = km-effort des 7 derniers jours ÷ (km-effort des 28 derniers jours / 4). < 0,8 bas · 0,8-1,3 équilibré · 1,3-1,5 attention · > 1,5 risque de blessure. Non calculé avant 28 jours d’historique.'),
    rule('Zones cardiaques', 'Méthode Karvonen : FC cible = FC repos + % × (FC max − FC repos). Z1 50-60 %, Z2 60-70 %, Z3 70-80 %, Z4 80-90 %, Z5 90-100 %.'),
    rule('Sommeil', 'Durée = lever − coucher (passage de minuit géré). Coucher visé : 23h.'),
    rule('Règles douleur genou / cheville', '0-2 et disparue le lendemain → on suit le plan. 3-4, encore là au réveil ou gêne en descente → séance suivante sans dénivelé ou vélo, pas de hausse de volume. ≥ 5, gonflement ou boiterie → arrêt de la course, avis kiné / médecin.'),
    rule('Alertes', 'Descente : D− cumulé sur 2 jours > 2 000 m, ou D− de la semaine > 1,3 × moyenne des 4 semaines précédentes. Forme : forme ≤ 2/10 deux matins de suite, ou qualité de sommeil ≤ 2/5 trois nuits sur 7.'),
    rule('Nutrition', 'Cible 60-80 g de glucides par heure. Produits validés : iso 34 g/dose, compote Decathlon 22-28 g, gel coca caféiné 24 g. À éviter : barre Overstims citron-gingembre.'),
    ...tables.flatMap((t) => [
      { section: t.name, item: '(onglet)', description: t.description },
      ...t.columns.map((c) => ({ section: t.name, item: c.key, description: c.description })),
    ]),
  ];
}
