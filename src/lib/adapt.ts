// Coach : propositions d'adaptation du plan à partir des check-ins, débriefs et de la charge (règles §4).
// Principe de sécurité : le coach ne propose JAMAIS d'augmenter la charge — seulement alléger, remplacer ou garder.
// Fonctions pures : elles reçoivent les données et la date du jour.
import type { CoachDecision, PlannedSession } from '../db/types';
import { kmEffort } from './calc';
import { addDays, formatDayShort, mondayOf, sleepMinutes } from './dates';
import { formatDuration, formatNumber } from './format';
import { currentRatio, recentSeries, recoveryAdvice, type Data } from './coach';
import { FOOT_TYPES } from './week';
import { R, corridorFactor, isPersonal, tolerance } from './rules';
import { ruleKind, type Personal } from './profile';
import { difficulty } from './prep';
import { currentIllness, phaseOf, raceVerdicts, repriseStart, REPRISE_DAYS } from './illness';
import type { Race } from '../db/types';

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
  /** Ce que ton historique dit de ce type de conseil (affiché directement) */
  note?: string;
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
export function proposals(d: Data, decisions: CoachDecision[], today: string, raceDates: string[] = [], me: Personal = {}, races: Race[] = []): Proposal[] {
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

  // 0. Maladie : passe avant tout le reste
  const ill = currentIllness(today);
  if (ill) {
    const ph = phaseOf(ill, today);
    const label = ill.label === 'Autre' ? 'maladie' : ill.label.toLowerCase();
    const pending = (from: string, to: string) =>
      d.sessions.filter((s) => s.date >= from && s.date <= to && s.type !== 'Repos' && !done.has(s.id) && !used.has(s.id)).sort((a, b) => a.date.localeCompare(b.date));
    const verdicts = raceVerdicts(ill, races, today);
    const forfaitDay = new Set(verdicts.filter((v) => v.verdict === 'forfait').map((v) => v.race.date));
    const isRace = (s: PlannedSession) => s.type === 'Course' || raceDay.has(s.date);
    const forfait = (s: PlannedSession, why: string) => rest(s, why, `Forfait — ${s.title.replace(/ \(.*\)$/, '').replace(/ — .*$/, '')}`);
    const dn = (x: string) => {
      const { dow, day } = formatDayShort(x);
      return `${dow.toLowerCase()} ${day}`;
    };
    const RULE_WHY =
      'Règle du cou : fièvre, courbatures, toux profonde ou symptômes « sous le cou » → aucun entraînement (le virus peut toucher le cœur : myocardite). On reprend seulement après 48 h sans fièvre sans médicament, très progressivement. Quelques jours d’arrêt ne font presque rien perdre en endurance ; reprendre trop tôt, si.';
    if (ph === 'malade') {
      const targets = pending(today, addDays(today, 2));
      const why = `${label} avec fièvre`;
      push({
        id: `maladie-${ill.id}-${today}`,
        level: 'stop',
        title: 'Repos jusqu’à la fin de la fièvre',
        reason: `Malade depuis ${dn(ill.start)}. Tes séances des 3 prochains jours passent en repos. Dès que tu n’as plus de fièvre, dis-le dans l’appli : le plan se recale en reprise progressive.`,
        why: RULE_WHY,
        sessions: targets,
        options: [
          { key: 'repos', label: 'D’accord : repos', changes: targets.map((s) => ({ id: s.id, patch: isRace(s) ? forfait(s, why) : rest(s, why, 'Repos (malade)') })) },
          {
            key: 'marche',
            label: 'Marche douce seulement',
            changes: targets.map((s) => ({
              id: s.id,
              patch: isRace(s) ? forfait(s, why) : { type: 'Rando', title: 'Marche douce 20-30 min (seulement si l’envie)', durationMin: 25, distanceKm: undefined, elevationGain: 0, intensity: 'Z1', instructions: note(s, why) },
            })),
          },
        ],
      });
      return out;
    }
    if (ph === 'attente' || ph === 'reprise') {
      const r = repriseStart(ill)!;
      const targets = pending(today, addDays(r, REPRISE_DAYS - 1)).filter((s) => !isRace(s) || forfaitDay.has(s.date));
      const why = `reprise après ${label}`;
      const patchFor = (s: PlannedSession): Patch => {
        if (isRace(s)) return forfait(s, why);
        const k = Math.round((new Date(s.date + 'T12:00').getTime() - new Date(r + 'T12:00').getTime()) / 86_400_000);
        if (k < 0) return rest(s, `${why} : 48 h sans fièvre avant de reprendre`, 'Repos — 48 h sans fièvre');
        if (s.type === 'Renfo') return { title: `${s.title} (léger)`, intensity: 'Z1', instructions: note(s, `${why} : renfo léger, sans charge lourde`) };
        if (k <= 1)
          return s.type === 'Vélo'
            ? { title: 'Reprise — vélo très facile', durationMin: r5(Math.min(40, s.durationMin ?? 40)), elevationGain: 0, intensity: 'Z1', instructions: note(s, why) }
            : { type: 'Running', title: 'Reprise — footing très facile', durationMin: 25, distanceKm: s.distanceKm ? r1(Math.min(4, s.distanceKm)) : 4, elevationGain: 0, intensity: 'Z1', instructions: note(s, `${why} : 20-30 min très facile, en aisance respiratoire. Stop si FC anormalement haute, vertige, toux ou fatigue qui revient`) };
        // Ensuite : durée plafonnée (sans raccourcir les séances déjà courtes), aucune intensité
        const cap = k <= 3 ? 40 : 60;
        const intense = /z[345]|seuil|fraction|vma|tempo|côte|cote|allure/i.test(`${s.title} ${s.intensity ?? ''}`);
        const dur = s.durationMin ? Math.min(s.durationMin, cap) : undefined;
        const f = s.durationMin && dur ? dur / s.durationMin : 1;
        return {
          type: s.type === 'Course' ? 'Running' : s.type,
          title: intense ? `Footing facile (reprise, à la place de : ${s.title})` : `${s.title} (reprise)`,
          durationMin: dur,
          distanceKm: s.distanceKm ? r1(s.distanceKm * f) : undefined,
          elevationGain: Math.min(s.elevationGain ?? 0, k <= 3 ? 150 : 400),
          intensity: 'Z1-Z2',
          instructions: note(s, `${why} : facile, en aisance respiratoire${k >= 3 ? ', 4 lignes droites souples possibles si tout va bien' : ''}`),
        };
      };
      const raceChanges = targets.filter(isRace);
      push({
        id: `maladie-reprise-${ill.id}-${ill.feverFreeSince}`,
        level: 'warn',
        title: 'Reprise progressive',
        reason: `Plus de fièvre depuis ${dn(ill.feverFreeSince!)}. Repos jusqu’à ${dn(addDays(r, -1))} inclus (48 h sans fièvre), puis ${REPRISE_DAYS} jours de reprise : footings très faciles, puis volume réduit, sans intensité.${raceChanges.length ? ` Forfait conseillé : ${raceChanges.map((s) => s.title).join(', ')}.` : ''}`,
        why: RULE_WHY,
        sessions: targets,
        options: [
          { key: 'reprise', label: 'D’accord : reprise progressive', changes: targets.map((s) => ({ id: s.id, patch: patchFor(s) })) },
          ...(raceChanges.length ? [{ key: 'garder-course', label: 'Reprise, mais je garde la course', changes: targets.filter((s) => !isRace(s)).map((s) => ({ id: s.id, patch: patchFor(s) })) }] : []),
        ],
      });
      if (ph === 'attente') return out;
    }
    if (ph === 'leger') {
      const targets = pending(today, addDays(today, 2)).filter((s) => !isRace(s) && s.type !== 'Renfo');
      const why = `${label} sans fièvre (symptômes au-dessus du cou)`;
      push({
        id: `maladie-leger-${ill.id}-${today}`,
        level: 'warn',
        title: 'Seulement du très facile',
        reason: `Symptômes au-dessus du cou seulement : footing très facile possible si tu te sens bien, sans intensité ni gros D+. Si la fièvre ou des courbatures arrivent, déclare-les : repos complet.`,
        why: RULE_WHY,
        sessions: targets,
        options: [
          { key: 'facile', label: 'D’accord : très facile', changes: targets.map((s) => ({ id: s.id, patch: { ...lighten(s, 0.6, why, ' (très facile)'), elevationGain: Math.min(s.elevationGain ?? 0, 150), intensity: 'Z1' } })) },
          { key: 'repos', label: 'Plutôt repos', changes: targets.map((s) => ({ id: s.id, patch: rest(s, why, 'Repos (malade)') })) },
        ],
      });
    }
  }

  const ci = d.checkIns.find((c) => c.date === today);
  const worst = ci?.pains.reduce<{ zone: string; score: number } | undefined>((w, p) => (!w || p.score > w.score ? p : w), undefined);

  // 1. Douleur ≥ 5 au réveil → arrêt de la course
  if (worst && worst.score >= R().douleur_stop) {
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
  else if (worst && worst.score >= R().douleur_adapter) {
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
  const lowForm = ci?.forme !== undefined && ci.forme <= R().forme_min && y?.forme !== undefined && y.forme <= R().forme_min;
  const badNights = [0, 1, 2, 3, 4, 5, 6].map((i) => cOf(addDays(today, -i))).filter((c) => c?.sleepQuality !== undefined && c.sleepQuality <= R().qualite_sommeil_min).length;
  const hSleep = ci?.bedTime && ci.wakeTime ? sleepMinutes(ci.bedTime, ci.wakeTime) / 60 : undefined;
  const shortNight = hSleep !== undefined && hSleep < R().sommeil_min_h;
  if (lowForm || badNights >= R().nuits_difficiles_max || shortNight) {
    const t = upcoming(1)[0] ?? upcoming(1, addDays(today, 1))[0];
    const why = lowForm ? `forme ≤ ${R().forme_min}/10 deux matins de suite` : shortNight ? `nuit de ${formatNumber(hSleep!, 1)} h (seuil ${formatNumber(R().sommeil_min_h, 1)} h)` : `sommeil difficile ${badNights} nuits sur 7`;
    if (t)
      push({
        id: `forme-${today}`,
        level: 'warn',
        title: lowForm ? 'Forme basse deux matins de suite' : shortNight ? `Nuit courte : ${formatNumber(hSleep!, 1)} h` : `Sommeil difficile ${badNights} nuits sur 7`,
        reason: lowForm
          ? `Forme à ${y!.forme}/10 hier et ${ci!.forme}/10 ce matin.`
          : shortNight ? `Tu as dormi ${formatDuration(hSleep! * 60)}, sous ton seuil de ${formatNumber(R().sommeil_min_h, 1)} h${isPersonal('sommeil_min_h') ? ' (appris de ton historique)' : ''}.` : `${badNights} nuits notées ${R().qualite_sommeil_min} ou moins sur 5 cette semaine${ci?.bedTime && ci.wakeTime ? ` (cette nuit : ${formatDuration(sleepMinutes(ci.bedTime, ci.wakeTime))})` : ''}.`,
        why: `Règle forme et sommeil : forme ≤ ${R().forme_min}/10 deux matins de suite, ${R().nuits_difficiles_max} nuits difficiles sur 7, ou une nuit de moins de ${formatNumber(R().sommeil_min_h, 1)} h → alléger la séance du jour.` + ' La fatigue accumulée est un des premiers facteurs de blessure ; une séance allégée ne fait rien perdre.',
        sessions: [t],
        options: [
          { key: 'alleger', label: `D’accord : −${R().allegement_pct} %`, changes: [{ id: t.id, patch: lighten(t, 1 - R().allegement_pct / 100, why) }] },
          { key: 'repos', label: 'Plutôt repos', changes: [{ id: t.id, patch: rest(t, why) }] },
        ],
      });
  }

  // 3 bis. Fatigue ressentie élevée après une séance récente → séance suivante allégée
  const tired = d.activities
    .filter((a) => !a.skipped && a.date >= addDays(today, -2) && a.date <= today && (a.feelings.fatigue ?? 0) >= R().fatigue_alerte)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (tired) {
    const t = upcoming(3, tired.date === today ? addDays(today, 1) : today)[0];
    const why = `fatigue ${tired.feelings.fatigue}/10 après la séance du ${formatDayShort(tired.date).dow.toLowerCase()} ${formatDayShort(tired.date).day}`;
    if (t)
      push({
        id: `fatigue-${tired.id}`,
        level: 'warn',
        title: `Fatigue ${tired.feelings.fatigue}/10 après ta dernière séance`,
        reason: `Tu as noté une fatigue de ${tired.feelings.fatigue}/10. Ta prochaine séance : ${describe(t)}.`,
        why: `Règle fatigue : une fatigue ressentie de ${R().fatigue_alerte}/10 ou plus après une séance → la suivante doit être allégée. Enchaîner fatigué augmente le risque de blessure sans gain d’entraînement.`,
        sessions: [t],
        options: [
          { key: 'alleger', label: 'D’accord : −20 %', changes: [{ id: t.id, patch: lighten(t, 0.8, why) }] },
          { key: 'plat', label: 'Garder la durée, sans D+', changes: [{ id: t.id, patch: flat(t, why) }] },
        ],
      });
  }

  // 4. Descente : D− cumulé sur 2 jours > 2 000 m → prochaine séance courte et plate
  const dMinus = (date: string) => d.activities.filter((a) => a.date === date && !a.skipped).reduce((t, a) => t + (a.elevationLoss ?? 0), 0);
  const two = dMinus(today) + dMinus(addDays(today, -1));
  const twoY = dMinus(addDays(today, -1)) + dMinus(addDays(today, -2));
  if (two > R().dmoins_2j_max_m || twoY > R().dmoins_2j_max_m) {
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
        why: `Ratio de charge = km-effort des 7 derniers jours ÷ moyenne hebdo des 28 derniers jours. ${formatNumber(R().ratio_bas, 1)}-${formatNumber(R().ratio_attention, 2)} = équilibré, ${formatNumber(R().ratio_attention, 2)}-${formatNumber(R().ratio_risque, 2)} = attention, > ${formatNumber(R().ratio_risque, 2)} = risque.${isPersonal('ratio_attention') ? ` Ton seuil « attention » est abaissé à ${formatNumber(R().ratio_attention, 2)} : tes douleurs passées sont venues à ce niveau de charge (appris de ton historique).` : ''} Au-dessus, le risque de blessure augmente nettement : on évite d'ajouter une grosse séance par-dessus.`,
        sessions: [big],
        options: [
          { key: 'alleger', label: `D’accord : −${Math.round((1 - f) * 100)} %`, changes: [{ id: big.id, patch: lighten(big, f, why) }] },
          { key: 'plat', label: 'Garder la durée, sans D+', changes: [{ id: big.id, patch: flat(big, why) }] },
        ],
      });
  }

  // 5 bis. Ta récupération (apprise) : pas de grosse séance tant que tu n'as pas récupéré de la dernière
  if (me.recoveryDays && me.bigKe) {
    const lastBig = d.activities
      .filter((a) => !a.skipped && FOOT_TYPES.includes(a.type) && a.date <= today && a.date > addDays(today, -Math.ceil(me.recoveryDays!)) && kmEffort(a.distanceKm, a.elevationGain) >= me.bigKe!)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (lastBig) {
      const until = addDays(lastBig.date, Math.ceil(me.recoveryDays) - 1);
      const t = upcoming(7)
        .filter((s) => s.date > lastBig.date && s.date <= until && (difficulty(s) >= 3 || ke(s) >= me.bigKe! * 0.8))
        .slice(0, 1)[0];
      if (t) {
        const why = `récupération : ${formatNumber(me.recoveryDays, 1)} jours après une grosse sortie (appris de ton historique)`;
        const { dow, day } = formatDayShort(lastBig.date);
        push({
          id: `recup-perso-${t.id}`,
          level: 'warn',
          title: 'Tu n’auras pas encore récupéré',
          reason: `Grosse sortie ${dow.toLowerCase()} ${day} (${formatNumber(kmEffort(lastBig.distanceKm, lastBig.elevationGain), 0)} km-effort). D’après ton historique, ta forme revient en ${formatNumber(me.recoveryDays, 1)} jours : ${t.title} arrive trop tôt.`,
          why: `Appris de toi : après tes sorties de plus de ${me.bigKe} km-effort, ta forme du matin met en moyenne ${formatNumber(me.recoveryDays, 1)} jours à revenir à ton niveau habituel. Enchaîner une séance dure avant, c’est empiler la fatigue.`,
          sessions: [t],
          options: [
            { key: 'facile', label: 'D’accord : version facile', changes: [{ id: t.id, patch: { ...lighten(t, 1 - R().allegement_pct / 100, why), intensity: 'Z1-Z2' } }] },
            { key: 'plat', label: 'Garder la durée, sans D+', changes: [{ id: t.id, patch: flat(t, why) }] },
          ],
        });
      }
    }
  }

  // 5 ter. Efficacité en baisse (apprise) : signe de fatigue de fond → alléger la plus grosse séance de la semaine
  if (me.efficiencyDropPct) {
    const big = upcoming(7).sort((a, b) => ke(b) - ke(a))[0];
    if (big && ke(big) > 8) {
      const why = `efficacité en baisse de ${me.efficiencyDropPct} % (fatigue de fond probable)`;
      push({
        id: `efficacite-${mondayOf(today)}`,
        level: 'info',
        title: `Tu vas ${me.efficiencyDropPct} % moins vite à FC égale`,
        reason: `Sur tes sorties récentes, ta vitesse à effort cardiaque égal baisse. Souvent un signe de fatigue accumulée : on allège la plus grosse séance des 7 prochains jours (${big.title}).`,
        why: 'Appris de toi : on compare ta vitesse (km-effort/h) ramenée à ta FC sur tes sorties récentes et sur celles d’avant. Une baisse nette sans raison (chaleur, maladie) indique que le corps n’assimile plus la charge.',
        sessions: [big],
        options: [{ key: 'alleger', label: `D’accord : −${R().allegement_pct} %`, changes: [{ id: big.id, patch: lighten(big, 1 - R().allegement_pct / 100, why) }] }],
      });
    }
  }

  // 6. Couloir de sécurité (km à pied) : cette semaine, puis la semaine prochaine
  const series = recentSeries(d, today);
  for (const w of series.filter((x) => x.current || x.monday === addDays(mondayOf(today), 7))) {
    let ceiling = w.ceiling.km;
    if (!w.current) {
      const cur = series.find((x) => x.current);
      const ref = series.filter((x) => x.complete && !x.unknown).slice(-2).map((x) => x.totals.doneKm);
      if (cur) ref.push(Math.max(cur.totals.doneKm, cur.totals.plannedKm));
      ceiling = ref.length ? (ref.reduce((a, b) => a + b, 0) / ref.length) * corridorFactor() : undefined;
    }
    const planned = w.totals.plannedKm;
    if (ceiling === undefined || planned <= ceiling * tolerance()) continue;
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
      options: [{ key: 'alleger', label: `D’accord : −${R().allegement_pct} % sur la semaine`, changes: targets.map((s) => ({ id: s.id, patch: lighten(s, 1 - R().allegement_pct / 100, why) })) }],
    });
  }

  // Ce qui marche pour toi : on insiste (ou on se fait discret) selon ce qui s'est passé les fois précédentes
  for (const p of out) {
    const t = me.trust?.[ruleKind(p.id)];
    if (!t?.mode) continue;
    if (t.mode === 'insist') {
      if (p.level === 'info') p.level = 'warn';
      p.note = `Les ${t.kept} fois où tu as gardé ta séance dans ce cas, ${t.keptBad === t.kept ? 'toutes' : `${t.keptBad}`} ont fini en douleur, grosse fatigue ou forme basse dans les 3 jours.`;
    } else if (p.level !== 'stop') {
      p.level = 'info';
      p.note = `Chez toi, garder ta séance dans ce cas s’est bien passé ${t.kept} fois sur ${t.kept} : à toi de voir.`;
    }
  }
  return out;
}
