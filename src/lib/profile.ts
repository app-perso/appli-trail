// Profil appris : ce que l'appli déduit de TON historique (charge tolérée, récupération, sommeil, progression).
// Fonctions pures, calculées dans le téléphone. Chaque enseignement dit sur combien de cas il repose.
// Principe de sécurité : un seuil personnel ne peut être que PLUS prudent que la règle générale.
import type { Activity, CheckIn, Sleep } from '../db/types';
import { kmEffort } from './calc';
import { addDays, sleepMinutes } from './dates';
import { dailyKmEffort, loadRatio } from './analysis';
import { formatDuration, formatNumber } from './format';
import { DEFAULT_RULES, type Rules } from './rules';
import { FOOT_TYPES } from './week';

export type Confidence = 'indice' | 'probable' | 'fiable';
export type Topic = 'charge' | 'recup' | 'sommeil' | 'progression';

export interface Insight {
  id: string;
  topic: Topic;
  title: string;
  text: string;
  /** Nombre de cas sur lesquels repose l'enseignement */
  n: number;
  confidence: Confidence;
  /** Ce que ça change dans l'appli (texte) */
  effect?: string;
}

export interface Learning {
  topic: Topic;
  title: string;
  /** Ce qui manque pour apprendre */
  need: string;
  have: number;
  target: number;
}

export interface Profile {
  since?: string;
  counts: { activities: number; checkIns: number; nights: number };
  insights: Insight[];
  learning: Learning[];
  /** Seuils personnels (toujours plus prudents que les règles générales) */
  overrides: Partial<Rules>;
}

export interface ProfileInput {
  activities: Activity[];
  checkIns: CheckIn[];
  sleeps: Sleep[];
  hrRest?: number;
  hrMax?: number;
}

const PAIN = 3; // douleur notée ≥ 3/10 = épisode à prendre au sérieux
const conf = (n: number, solid: number): Confidence => (n >= solid ? 'fiable' : n >= Math.ceil(solid / 2) ? 'probable' : 'indice');
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmtDate = (d: string) => new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export function learnProfile(inp: ProfileInput, today: string): Profile {
  const acts = inp.activities.filter((a) => !a.skipped && a.date <= today);
  const foot = acts.filter((a) => FOOT_TYPES.includes(a.type));
  const cis = inp.checkIns.filter((c) => c.date <= today);
  const insights: Insight[] = [];
  const learning: Learning[] = [];
  const overrides: Partial<Rules> = {};
  const since = [...acts.map((a) => a.date), ...cis.map((c) => c.date)].sort()[0];

  // Heures de sommeil par date de réveil (check-in, sinon nuit Suunto)
  const sleepH = new Map<string, number>();
  for (const s of inp.sleeps) if (s.hours) sleepH.set(s.date, s.hours);
  for (const c of cis) if (c.bedTime && c.wakeTime) sleepH.set(c.date, sleepMinutes(c.bedTime, c.wakeTime) / 60);

  // ---------- 1. Charge tolérée : ce qui a précédé tes douleurs ----------
  const daily = dailyKmEffort(foot);
  const first = foot.map((a) => a.date).sort()[0];
  const painDays = new Map<string, { zone: string; score: number }>();
  const addPain = (date: string, p: { zone: string; score: number }) => {
    const cur = painDays.get(date);
    if (p.score >= PAIN && (!cur || p.score > cur.score)) painDays.set(date, p);
  };
  for (const a of acts) for (const p of a.pains) addPain(a.date, p);
  for (const c of cis) for (const p of c.pains) addPain(c.date, p);
  // Un épisode = première douleur ≥ 3 après au moins 10 jours sans
  const episodes: { date: string; zone: string; score: number }[] = [];
  for (const d of [...painDays.keys()].sort()) {
    const last = episodes[episodes.length - 1];
    if (!last || d > addDays(last.date, 10)) episodes.push({ date: d, ...painDays.get(d)! });
  }
  const sum = (from: string, days: number) => {
    let t = 0;
    for (let i = 0; i < days; i++) t += daily.get(addDays(from, -i)) ?? 0;
    return t;
  };
  const dMinus = (to: string, days: number) => {
    const xs = foot.filter((a) => a.date > addDays(to, -days) && a.date <= to);
    return xs.every((a) => a.elevationLoss !== undefined) && xs.length ? xs.reduce((t, a) => t + (a.elevationLoss ?? 0), 0) : undefined;
  };
  // Ratio de référence : médiane de tous tes jours
  const allRatios: number[] = [];
  if (first) for (let d = addDays(first, 27); d <= today; d = addDays(d, 1)) {
    const r = loadRatio(daily, d, first);
    if (r !== undefined) allRatios.push(r);
  }
  const epi = episodes.map((e) => {
    // charge mesurée la veille de la douleur (la séance du jour compte aussi)
    const r = loadRatio(daily, e.date, first);
    return { ...e, ratio: r, week: sum(e.date, 7), dm2: dMinus(e.date, 2) };
  });
  if (epi.length) {
    const withRatio = epi.filter((e) => e.ratio !== undefined);
    const zones = [...new Set(epi.map((e) => e.zone.toLowerCase()))];
    const lines = epi.map(
      (e) =>
        `${fmtDate(e.date)} : ${e.zone.toLowerCase()} ${e.score}/10 après ${formatNumber(e.week, 0)} km-effort sur 7 jours${e.ratio !== undefined ? `, ratio ${formatNumber(e.ratio, 2)}` : ''}${e.dm2 !== undefined ? `, ${formatNumber(e.dm2, 0)} m de D− en 2 jours` : ''}`,
    );
    const typical = allRatios.length ? median(allRatios) : undefined;
    let effect: string | undefined;
    if (withRatio.length >= 2) {
      const lim = Math.max(1.05, Math.min(DEFAULT_RULES.ratio_attention, Math.min(...withRatio.map((e) => e.ratio!)) - 0.05));
      if (lim < DEFAULT_RULES.ratio_attention) {
        overrides.ratio_attention = Math.round(lim * 100) / 100;
        effect = `Alerte « attention » dès un ratio de ${formatNumber(overrides.ratio_attention, 2)} au lieu de ${formatNumber(DEFAULT_RULES.ratio_attention, 2)}.`;
      }
    }
    const dms = epi.map((e) => e.dm2).filter((x): x is number => x !== undefined);
    if (dms.length >= 2) {
      const lim = Math.min(DEFAULT_RULES.dmoins_2j_max_m, Math.round((Math.min(...dms) * 0.9) / 50) * 50);
      if (lim < DEFAULT_RULES.dmoins_2j_max_m) {
        overrides.dmoins_2j_max_m = lim;
        effect = `${effect ? effect + ' ' : ''}Alerte descente dès ${formatNumber(lim, 0)} m de D− en 2 jours.`;
      }
    }
    insights.push({
      id: 'douleurs',
      topic: 'charge',
      title: epi.length > 1 ? `Ce qui a précédé tes ${epi.length} épisodes de douleur` : 'Ce qui a précédé ta douleur',
      text:
        lines.join(' · ') +
        (typical !== undefined && withRatio.length ? `. Ton ratio habituel est de ${formatNumber(typical, 2)}.` : '.') +
        (zones.length === 1 && epi.length > 1 ? ` Toujours au même endroit (${zones[0]}) : point faible à surveiller.` : ''),
      n: epi.length,
      confidence: conf(epi.length, 4),
      effect: effect ?? (epi.length < 2 ? 'Un seul cas : on observe, sans encore changer tes seuils.' : undefined),
    });
  }
  // Plus grosse semaine encaissée sans douleur
  if (first) {
    let best = { v: 0, end: '' };
    for (let d = addDays(first, 6); d <= today; d = addDays(d, 7)) {
      const v = sum(d, 7);
      const painFree = ![...painDays.keys()].some((p) => p > addDays(d, -7) && p <= addDays(d, 7));
      if (painFree && v > best.v) best = { v, end: d };
    }
    const weeks = Math.floor((new Date(today).getTime() - new Date(first).getTime()) / (7 * 86_400_000));
    if (best.v > 0 && weeks >= 3)
      insights.push({
        id: 'semaine-max',
        topic: 'charge',
        title: `Ta plus grosse semaine sans douleur : ${formatNumber(best.v, 0)} km-effort`,
        text: `Semaine terminée le ${fmtDate(best.end)}, sans douleur ≥ ${PAIN}/10 ni pendant ni dans les 7 jours suivants. C'est ton repère de charge « encaissée ».`,
        n: weeks,
        confidence: conf(weeks, 8),
      });
  }
  if (!epi.length)
    learning.push({ topic: 'charge', title: 'Charge que tu tolères', need: 'Aucune douleur ≥ 3/10 notée : tant mieux ! Continue de noter tes douleurs aux débriefs et check-ins.', have: 0, target: 2 });

  // ---------- 2. Récupération : jours pour retrouver ta forme après une grosse séance ----------
  const forme = new Map(cis.filter((c) => c.forme !== undefined).map((c) => [c.date, c.forme!]));
  if (forme.size >= 10) {
    const base = median([...forme.values()]);
    const efforts = foot.map((a) => ({ a, ke: kmEffort(a.distanceKm, a.elevationGain) }));
    const cut = efforts.length >= 4 ? median(efforts.map((e) => e.ke)) * 1.5 : Infinity;
    const big = efforts.filter((e) => e.ke >= Math.max(cut, 15));
    const recov: number[] = [];
    for (const { a } of big) {
      let k: number | undefined;
      let seen = false;
      for (let i = 1; i <= 4; i++) {
        const f = forme.get(addDays(a.date, i));
        if (f === undefined) continue;
        seen = true;
        if (f >= base) {
          k = i;
          break;
        }
      }
      if (seen) recov.push(k ?? 4); // pas revenue en 4 jours : compté 4
    }
    if (recov.length >= 2) {
      const avg = mean(recov);
      const dip = big
        .map(({ a }) => forme.get(addDays(a.date, 1)))
        .filter((x): x is number => x !== undefined);
      insights.push({
        id: 'recup',
        topic: 'recup',
        title: `Après une grosse sortie, ${avg <= 1.2 ? 'tu récupères dès le lendemain' : `il te faut environ ${formatNumber(avg, 1)} jours`}`,
        text: `Sur tes ${recov.length} sorties de plus de ${formatNumber(Math.max(cut, 15), 0)} km-effort, ta forme du matin revient à ton niveau habituel (${formatNumber(base, 0)}/10) en ${formatNumber(avg, 1)} jour${avg >= 2 ? 's' : ''} en moyenne${dip.length && mean(dip) < base ? ` (le lendemain : ${formatNumber(mean(dip), 1)}/10)` : ''}.`,
        n: recov.length,
        confidence: conf(recov.length, 6),
        effect: avg >= 2 ? `Le coach évitera de placer une séance intense moins de ${Math.ceil(avg)} jours après une grosse sortie.` : undefined,
      });
    } else learning.push({ topic: 'recup', title: 'Ta vitesse de récupération', need: 'Il faut des check-ins (forme du matin) dans les jours qui suivent tes grosses sorties.', have: recov.length, target: 2 });
  } else learning.push({ topic: 'recup', title: 'Ta vitesse de récupération', need: 'Fais le check-in du matin (forme) régulièrement.', have: forme.size, target: 10 });

  // ---------- 3. Sommeil : ce qu'il change à tes séances ----------
  const sessionsAfter = foot
    .map((a) => ({ a, h: sleepH.get(a.date), q: cis.find((c) => c.date === a.date)?.sleepQuality }))
    .filter((x) => x.a.rpe !== undefined || x.a.feelings.plaisir !== undefined);
  const withH = sessionsAfter.filter((x) => x.h !== undefined && x.a.rpe !== undefined);
  let sleepDone = false;
  if (withH.length >= 8) {
    // seuil où la différence de RPE est la plus nette (au moins 3 séances de chaque côté)
    let best: { t: number; diff: number; lo: number[]; hi: number[] } | undefined;
    for (let t = 5.5; t <= 7.5; t += 0.25) {
      const lo = withH.filter((x) => x.h! < t).map((x) => x.a.rpe!);
      const hi = withH.filter((x) => x.h! >= t).map((x) => x.a.rpe!);
      if (lo.length < 3 || hi.length < 3) continue;
      const diff = mean(lo) - mean(hi);
      if (!best || diff > best.diff) best = { t, diff, lo, hi };
    }
    if (best && best.diff >= 0.7) {
      sleepDone = true;
      const t = Math.max(DEFAULT_RULES.sommeil_min_h, best.t);
      if (t > DEFAULT_RULES.sommeil_min_h) overrides.sommeil_min_h = t;
      insights.push({
        id: 'sommeil-h',
        topic: 'sommeil',
        title: `Sous ${formatDuration(best.t * 60)} de sommeil, tes séances te paraissent plus dures`,
        text: `RPE moyen ${formatNumber(mean(best.lo), 1)}/10 après une nuit courte (${best.lo.length} séances) contre ${formatNumber(mean(best.hi), 1)}/10 sinon (${best.hi.length} séances).`,
        n: withH.length,
        confidence: conf(withH.length, 20),
        effect: t > DEFAULT_RULES.sommeil_min_h ? `Seuil « nuit courte » relevé à ${formatDuration(t * 60)} (au lieu de ${formatDuration(DEFAULT_RULES.sommeil_min_h * 60)}).` : undefined,
      });
    }
  }
  // Qualité du sommeil (1-5) → forme du matin
  const pairs = cis.filter((c) => c.sleepQuality !== undefined && c.forme !== undefined);
  const bad = pairs.filter((c) => c.sleepQuality! <= 2).map((c) => c.forme!);
  const good = pairs.filter((c) => c.sleepQuality! >= 4).map((c) => c.forme!);
  if (bad.length >= 3 && good.length >= 3) {
    const diff = mean(good) - mean(bad);
    sleepDone = true;
    insights.push({
      id: 'sommeil-q',
      topic: 'sommeil',
      title: diff >= 1 ? 'Une mauvaise nuit te coûte nettement en forme' : 'Une mauvaise nuit te coûte peu en forme',
      text: `Forme du matin ${formatNumber(mean(bad), 1)}/10 après une nuit notée 1-2/5 (${bad.length} fois) contre ${formatNumber(mean(good), 1)}/10 après une nuit à 4-5/5 (${good.length} fois).`,
      n: bad.length + good.length,
      confidence: conf(Math.min(bad.length, good.length), 8),
    });
  }
  // Qualité de la nuit → séance du jour (plaisir / RPE)
  const qs = sessionsAfter.filter((x) => x.q !== undefined && x.a.rpe !== undefined);
  const qLo = qs.filter((x) => x.q! <= 2).map((x) => x.a.rpe!);
  const qHi = qs.filter((x) => x.q! >= 4).map((x) => x.a.rpe!);
  if (qLo.length >= 2 && qHi.length >= 3 && mean(qLo) - mean(qHi) >= 0.7) {
    sleepDone = true;
    insights.push({
      id: 'sommeil-rpe',
      topic: 'sommeil',
      title: 'Après une mauvaise nuit, tes séances te paraissent plus dures',
      text: `RPE moyen ${formatNumber(mean(qLo), 1)}/10 après une nuit notée 1-2/5 (${qLo.length} séances) contre ${formatNumber(mean(qHi), 1)}/10 après une bonne nuit (${qHi.length}).`,
      n: qLo.length + qHi.length,
      confidence: conf(Math.min(qLo.length, qHi.length), 6),
    });
  }
  if (!sleepDone)
    learning.push({
      topic: 'sommeil',
      title: 'Ton seuil de sommeil',
      need: sleepH.size ? 'Il faut plus de séances avec RPE noté après des nuits courtes et longues.' : 'Note tes heures de coucher et de lever (check-in) ou importe tes nuits Suunto.',
      have: Math.max(withH.length, pairs.length),
      target: 8,
    });

  // ---------- 4. Progression : vitesse à effort cardiaque égal, vitesse en montée ----------
  const rest = inp.hrRest ?? 60;
  const max = inp.hrMax ?? 190;
  const eff = foot
    .filter((a) => a.type === 'Running' && a.hrAvg && a.durationMin >= 25 && a.distanceKm > 0 && a.hrAvg > rest + 10)
    .map((a) => ({ date: a.date, v: kmEffort(a.distanceKm, a.elevationGain) / (a.durationMin / 60) / ((a.hrAvg! - rest) / (max - rest)) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (eff.length >= 8) {
    const cutDate = addDays(today, -28);
    let recent = eff.filter((e) => e.date > cutDate);
    let older = eff.filter((e) => e.date <= cutDate);
    if (recent.length < 4 || older.length < 4) {
      const h = eff.length >> 1;
      older = eff.slice(0, h);
      recent = eff.slice(h);
    }
    const pct = (median(recent.map((e) => e.v)) / median(older.map((e) => e.v)) - 1) * 100;
    insights.push({
      id: 'efficacite',
      topic: 'progression',
      title:
        Math.abs(pct) < 2
          ? 'Ton efficacité est stable'
          : pct > 0
            ? `Tu vas ${formatNumber(pct, 0)} % plus vite à effort cardiaque égal`
            : `Tu vas ${formatNumber(-pct, 0)} % moins vite à effort cardiaque égal`,
      text: `Vitesse en km-effort/h ramenée à ta FC (réserve cardiaque), sur tes sorties course : ${recent.length} récentes depuis le ${fmtDate(recent[0].date)} comparées aux ${older.length} d'avant.${pct <= -4 ? ' Une baisse peut signaler de la fatigue accumulée.' : ''}`,
      n: eff.length,
      confidence: conf(Math.min(recent.length, older.length), 8),
      effect: pct <= -4 ? 'Le coach surveille de près la fatigue (semaine allégée proposée plus tôt si ça continue).' : undefined,
    });
  } else learning.push({ topic: 'progression', title: 'Ta progression', need: 'Il faut des sorties avec la FC moyenne (import .fit ou historique Suunto).', have: eff.length, target: 8 });
  const vam = foot.filter((a) => a.vamUp).sort((a, b) => a.date.localeCompare(b.date));
  if (vam.length >= 6) {
    const h = vam.length >> 1;
    const o = median(vam.slice(0, h).map((a) => a.vamUp!));
    const r = median(vam.slice(h).map((a) => a.vamUp!));
    insights.push({
      id: 'vam',
      topic: 'progression',
      title: `Vitesse en montée : ${formatNumber(o, 0)} → ${formatNumber(r, 0)} m/h`,
      text: `Médiane de tes ${vam.length - h} dernières sorties contre les ${h} précédentes (portions > 300 m/h).`,
      n: vam.length,
      confidence: conf(h, 6),
    });
  }

  // Un simple indice (trop peu de cas) n'agit jamais sur le coach
  for (const i of insights) if (i.confidence === 'indice' && i.id !== 'douleurs') i.effect = i.effect ? 'Encore trop peu de cas pour changer le coach : à confirmer.' : undefined;
  return {
    since,
    counts: { activities: acts.length, checkIns: cis.length, nights: sleepH.size },
    insights,
    learning,
    overrides,
  };
}
