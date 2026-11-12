// Coach : propositions d'adaptation du plan à partir des check-ins, débriefs et de la charge (règles §4).
// Principe de sécurité : le coach ne propose JAMAIS d'augmenter la charge — seulement alléger, remplacer ou garder.
// Fonctions pures : elles reçoivent les données et la date du jour.
import type { CoachDecision, PlannedSession } from '../db/types';
import { kmEffort } from './calc';
import { addDays, formatDayShort, mondayOf, sleepMinutes } from './dates';
import { formatDuration, formatNumber } from './format';
import { currentRatio, recentSeries, recoveryAdvice, type Data } from './coach';
import { FOOT_TYPES } from './week';

export type Patch = Partial<Pick<PlannedSession, 'type' | 'title' | 'durationMin' | 'distanceKm' | 'elevationGain' | 'intensity' | 'instructions'>>;

export interface Option {
  key: string;
  /** Texte du bouton de réponse */
  label: string;
  changes: { id: string; patch: Patch }[];
}

export interface Proposal {
  /** Clé stable : une même situation n'est proposée qu'une fois */
  id: string;
  level: 'stop' | 'warn' | 'info';
  title: string;
  /** Ce que le coach a vu (chiffres) */
  reason: string;
  /** La règle appliquée (réponse à « Pourquoi ? ») */
  why: string;
  /** Séances concernées, telles qu'elles sont aujourd'hui */
  sessions: PlannedSession[];
  /** La 1re option est la recommandée */
  options: Option[];
}

const r5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const r1 = (n: number) => Math.round(n * 10) / 10;
const isFoot = (s: PlannedSession) => FOOT_TYPES.includes(s.type) && s.type !== 'Course';
const ke = (s: PlannedSession) => kmEffort(s.distanceKm ?? 0, s.elevationGain ?? 0);

/** « sam 14 · Hamster côtes · 1h20 · 12 km · 500 m D+ » */
export function describe(s: Pick<PlannedSession, 'date' | 'title' | 'type' | 'durationMin' | 'distanceKm' | 'elevationGain'>): string {
  const { dow, day } = formatDayShort(s.date);
  return [
    `${dow.toLowerCase()} ${day}`,
    s.title,
    s.durationMin ? formatDuration(s.durationMin) : null,
    s.distanceKm ? `${formatNumber(s.distanceKm)} km` : null,
    s.elevationGain ? `${formatNumber(s.elevationGain, 0)} m D+` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const note = (s: PlannedSession, why: string) => `Adapté par le coach : ${why}${s.instructions ? `\n\nConsignes d'origine : ${s.instructions}` : ''}`;

/** Allège une séance d'un facteur (0,7 = −30 %). */
const lighten = (s: PlannedSession, f: number, why: string, suffix = ' (allégée)'): Patch => ({
  title: s.title.endsWith(suffix) ? s.title : s.title + suffix,
  durationMin: s.durationMin ? r5(s.durationMin * f) : undefined,
  distanceKm: s.distanceKm ? r1(s.distanceKm * f) : undefined,
  elevationGain: s.elevationGain ? Math.round((s.elevationGain * f) / 10) * 10 : s.elevationGain,
  intensity: 'Z1-Z2',
  instructions: note(s, why),
});
const flat = (s: PlannedSession, why: string): Patch => ({
  title: `${s.title} — version plate`,
  elevationGain: 0,
  intensity: 'Z1-Z2',
  instructions: note(s, why),
});
const bike = (s: PlannedSession, why: string, maxMin = 90): Patch => ({
  type: 'Vélo',
  title: 'Vélo facile (à la place de la course)',
  durationMin: r5(Math.min(maxMin, s.durationMin ?? 60)),
  distanceKm: undefined,
  elevationGain: 0,
  intensity: 'Z1-Z2',
  instructions: note(s, why),
});
const rest = (s: PlannedSession, why: string, title = 'Repos'): Patch => ({
  type: 'Repos',
  title,
  durationMin: undefined,
  distanceKm: undefined,
  elevationGain: undefined,
  intensity: undefined,
  instructions: note(s, why),
});

/** raceDates : jours de course — le coach ne touche jamais une séance prévue un jour de course. */
export function proposals(d: Data, decisions: CoachDecision[], today: string, raceDates: string[] = []): Proposal[] {
  const raceDay = new Set(raceDates);
  const decided = new Set(decisions.map((x) => x.id));
  const done = new Set(d.activities.map((a) => a.plannedSessionId).filter(Boolean));
  const used = new Set<string>(); // une séance n'est visée que par une proposition à la fois
  const upcoming = (days: number, from = today) =>
    d.sessions
      .filter((s) => s.date >= from && s.date <= addDays(from, days - 1) && isFoot(s) && !raceDay.has(s.date) && !done.has(s.id) && !used.has(s.id))
      .sort((a, b) => a.date.localeCompare(b.date));
  const out: Proposal[] = [];
  const push = (p: Proposal) => {
    if (decided.has(p.id) || !p.sessions.length) return;
    p.sessions.forEach((s) => used.add(s.id));
    out.push(p);
  };

  const ci = d.checkIns.find((c) => c.date === today);
  const worst = ci?.pains.reduce<{ zone: string; score: number } | undefined>((w, p) => (!w || p.score > w.score ? p : w), undefined);

  // 1. Douleur ≥ 5 au réveil → arrêt de la course
  if (worst && worst.score >= 5) {
    const why = `douleur ${worst.zone} ${worst.score}/10 au réveil`;
    const targets = upcoming(3);
    push({
      id: `douleur5-${today}`,
      level: 'stop',
      title: `Douleur ${worst.zone} à ${worst.score}/10 : on arrête la course`,
      reason: `Ce matin tu as noté ${worst.zone} à ${worst.score}/10. ${targets.length} séance${targets.length > 1 ? 's' : ''} de course prévue${targets.length > 1 ? 's' : ''} dans les 3 jours.`,
      why: 'Règle douleur : à 5/10 ou plus (ou gonflement, boiterie), arrêt de la course à pied et avis kiné / médecin. Courir dessus transforme souvent une gêne de quelques jours en blessure de plusieurs semaines.',
      sessions: targets,
      options: [
        { key: 'repos', label: 'D’accord : repos + kiné', changes: targets.map((s) => ({ id: s.id, patch: rest(s, why, 'Repos — douleur, avis kiné') })) },
        { key: 'velo', label: 'Vélo très facile si indolore', changes: targets.map((s) => ({ id: s.id, patch: bike(s, `${why} (vélo seulement si aucune douleur en pédalant)`, 45) })) },
      ],
    });
  }
  // 2. Douleur encore là au réveil (1-4) → séance suivante sans dénivelé, pas de hausse de volume
  else if (worst && worst.score >= 1) {
    const why = `douleur ${worst.zone} ${worst.score}/10 encore là au réveil`;
    // « séance suivante » : la prochaine sortie dans les 4 jours, si elle a du D+ ou de l'intensité
    const targets = upcoming(4)
      .slice(0, 1)
      .filter((s) => (s.elevationGain ?? 0) > 100 || /z[345]/i.test(s.intensity ?? ''));
    push({
      id: `douleur-${today}`,
      level: 'warn',
      title: `${worst.zone} encore à ${worst.score}/10 ce matin`,
      reason: `La douleur est toujours là au réveil, et ta prochaine sortie (${targets[0] ? describe(targets[0]) : ''}) a du dénivelé ou de l'intensité.`,
      why: 'Règle genou / cheville : douleur de 3-4, ou encore là au réveil, ou gêne en descente → séance suivante sans dénivelé (ou vélo), et pas de hausse de volume. Le dénivelé, surtout en descente, est ce qui charge le plus genoux et chevilles.',
      sessions: targets,
      options: [
        { key: 'plat', label: 'D’accord : version plate', changes: targets.map((s) => ({ id: s.id, patch: flat(s, why) })) },
        { key: 'velo', label: 'Plutôt du vélo', changes: targets.map((s) => ({ id: s.id, patch: bike(s, why) })) },
      ],
    });
  }

  // 3. Forme basse 2 matins de suite, ou sommeil difficile 3 nuits sur 7 → alléger la séance du jour
  const cOf = (date: string) => d.checkIns.find((c) => c.date === date);
  const y = cOf(addDays(today, -1));
  const lowForm = ci?.forme !== undefined && ci.forme <= 2 && y?.forme !== undefined && y.forme <= 2;
  const badNights = [0, 1, 2, 3, 4, 5, 6].map((i) => cOf(addDays(today, -i))).filter((c) => c?.sleepQuality !== undefined && c.sleepQuality <= 2).length;
  if (lowForm || badNights >= 3) {
    const t = upcoming(1)[0] ?? upcoming(1, addDays(today, 1))[0];
    const why = lowForm ? 'forme ≤ 2/10 deux matins de suite' : `sommeil difficile ${badNights} nuits sur 7`;
    if (t)
      push({
        id: `forme-${today}`,
        level: 'warn',
        title: lowForm ? 'Forme basse deux matins de suite' : `Sommeil difficile ${badNights} nuits sur 7`,
        reason: lowForm
          ? `Forme à ${y!.forme}/10 hier et ${ci!.forme}/10 ce matin.`
          : `${badNights} nuits notées 1 ou 2/5 cette semaine${ci?.bedTime && ci.wakeTime ? ` (cette nuit : ${formatDuration(sleepMinutes(ci.bedTime, ci.wakeTime))})` : ''}.`,
        why: 'Règle forme : forme ≤ 2/10 deux matins de suite, ou sommeil ≤ 2/5 trois nuits sur 7 → alléger la séance du jour. La fatigue accumulée est un des premiers facteurs de blessure ; une séance allégée ne fait rien perdre.',
        sessions: [t],
        options: [
          { key: 'alleger', label: 'D’accord : −30 %', changes: [{ id: t.id, patch: lighten(t, 0.7, why) }] },
          { key: 'repos', label: 'Plutôt repos', changes: [{ id: t.id, patch: rest(t, why) }] },
        ],
      });
  }

  // 4. Descente : D− cumulé sur 2 jours > 2 000 m → prochaine séance courte et plate
  const dMinus = (date: string) => d.activities.filter((a) => a.date === date && !a.skipped).reduce((t, a) => t + (a.elevationLoss ?? 0), 0);
  const two = dMinus(today) + dMinus(addDays(today, -1));
  const twoY = dMinus(addDays(today, -1)) + dMinus(addDays(today, -2));
  if (two > 2000 || twoY > 2000) {
    const t = upcoming(2).find((s) => (s.elevationGain ?? 0) > 100 || (s.durationMin ?? 0) > 50);
    const why = `${formatNumber(Math.max(two, twoY), 0)} m de D− en 2 jours`;
    if (t)
      push({
        id: `descente-${today}`,
        level: 'warn',
        title: 'Beaucoup de descente en 2 jours',
        reason: `${formatNumber(Math.max(two, twoY), 0)} m de D− sur 2 jours : quadriceps et genoux ont besoin de récupérer.`,
        why: 'Règle descente : D− cumulé sur 2 jours > 2 000 m → la séance suivante doit être très facile (courte, plate) ou remplacée par du repos. Les courbatures de descente cachent des micro-lésions musculaires.',
        sessions: [t],
        options: [
          { key: 'plat', label: 'D’accord : 40′ plat facile', changes: [{ id: t.id, patch: { ...flat(t, why), title: 'Footing très facile (plat)', durationMin: Math.min(40, t.durationMin ?? 40), distanceKm: t.distanceKm ? r1(Math.min(t.distanceKm, 7)) : undefined } }] },
          { key: 'repos', label: 'Plutôt repos', changes: [{ id: t.id, patch: rest(t, why) }] },
        ],
      });
  }

  // 5. Ratio de charge
  const r = currentRatio(d, today);
  if (r.ratio !== undefined && (r.zone === 'risque' || r.zone === 'attention')) {
    const big = upcoming(3).sort((a, b) => ke(b) - ke(a))[0];
    const f = r.zone === 'risque' ? 0.7 : 0.8;
    const why = `ratio de charge ${formatNumber(r.ratio, 2)} (${r.zone})`;
    if (big && ke(big) > 8)
      push({
        id: `ratio-${today}`,
        level: r.zone === 'risque' ? 'warn' : 'info',
        title: `Charge en hausse rapide (ratio ${formatNumber(r.ratio, 2)})`,
        reason: `Tes 7 derniers jours pèsent ${formatNumber(r.ratio, 2)} fois ta moyenne des 4 dernières semaines. La plus grosse séance des 3 prochains jours : ${big.title}.`,
        why: `Ratio de charge = km-effort des 7 derniers jours ÷ moyenne hebdo des 28 derniers jours. 0,8-1,3 = équilibré, 1,3-1,5 = attention, > 1,5 = risque. Au-dessus de 1,3, le risque de blessure augmente nettement : on évite d'ajouter une grosse séance par-dessus.`,
        sessions: [big],
        options: [
          { key: 'alleger', label: `D’accord : −${Math.round((1 - f) * 100)} %`, changes: [{ id: big.id, patch: lighten(big, f, why) }] },
          { key: 'plat', label: 'Garder la durée, sans D+', changes: [{ id: big.id, patch: flat(big, why) }] },
        ],
      });
  }

  // 6. Couloir de sécurité (km à pied) : cette semaine, puis la semaine prochaine
  const series = recentSeries(d, today);
  for (const w of series.filter((x) => x.current || x.monday === addDays(mondayOf(today), 7))) {
    let ceiling = w.ceiling.km;
    if (!w.current) {
      const cur = series.find((x) => x.current);
      const ref = series.filter((x) => x.complete && !x.unknown).slice(-2).map((x) => x.totals.doneKm);
      if (cur) ref.push(Math.max(cur.totals.doneKm, cur.totals.plannedKm));
      ceiling = ref.length ? (ref.reduce((a, b) => a + b, 0) / ref.length) * 1.15 : undefined;
    }
    const planned = w.totals.plannedKm;
    if (ceiling === undefined || planned <= ceiling * 1.02) continue;
    const excess = planned - ceiling;
    const pool = upcoming(7, w.current ? today : w.monday).filter((s) => s.date <= w.sunday && (s.distanceKm ?? 0) > 0);
    const big = pool.sort((a, b) => (b.distanceKm ?? 0) - (a.distanceKm ?? 0))[0];
    if (!big) continue;
    const f = Math.max(0.6, 1 - excess / (big.distanceKm ?? 1));
    const why = `${formatNumber(planned, 0)} km prévus pour un plafond de ${formatNumber(ceiling, 0)} km`;
    push({
      id: `couloir-${w.monday}`,
      level: 'info',
      title: `${w.current ? 'Cette semaine' : 'Semaine prochaine'} : ${formatNumber(planned, 0)} km prévus, plafond ${formatNumber(ceiling, 0)} km`,
      reason: `Le plan dépasse le couloir de sécurité de ${formatNumber(excess, 0)} km. Le plus simple : raccourcir la plus longue sortie (${big.title}).`,
      why: 'Couloir de sécurité : le volume d’une semaine ne doit pas dépasser la moyenne des 3 semaines précédentes + 15 %. Les tendons et les os s’adaptent plus lentement que le cœur et les muscles : monter trop vite est la cause n°1 des blessures de surcharge.',
      sessions: [big],
      options: [{ key: 'raccourcir', label: `D’accord : −${Math.round((1 - f) * 100)} % sur cette sortie`, changes: [{ id: big.id, patch: lighten(big, f, why, ' (raccourcie)') }] }],
    });
  }

  // 7. Semaine allégée après 3 semaines de construction
  const rec = recoveryAdvice(series);
  if (rec) {
    const w = series.find((x) => x.current);
    const targets = w ? upcoming(7).filter((s) => s.date <= w.sunday) : [];
    const why = '3 semaines de construction d’affilée';
    push({
      id: `recup-${mondayOf(today)}`,
      level: 'info',
      title: 'Semaine allégée conseillée',
      reason: rec.text,
      why: 'Règle de récupération : 1 semaine allégée (−25 à −35 %) toutes les 4 semaines. C’est pendant ces semaines que le corps assimile le travail et se renforce.',
      sessions: targets,
      options: [{ key: 'alleger', label: 'D’accord : −30 % sur la semaine', changes: targets.map((s) => ({ id: s.id, patch: lighten(s, 0.7, why) })) }],
    });
  }

  return out;
}
