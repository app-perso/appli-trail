// Mode maladie : fièvre → repos complet ; 48 h sans fièvre → reprise progressive sur 7 jours ; courses proches : go / no-go.
// Repères suivis par les coachs et médecins du sport :
//  - « règle du cou » : symptômes uniquement au-dessus du cou (nez, gorge) → footing très facile possible ;
//    fièvre, courbatures, toux profonde, symptômes « sous le cou » → aucun entraînement (risque de myocardite) ;
//  - reprendre seulement après 24-48 h sans fièvre SANS médicament contre la fièvre ;
//  - reprise progressive : quelques jours très faciles, pas d'intensité, au moins autant de jours que de jours malade ;
//  - quelques jours d'arrêt ne font presque rien perdre en endurance : ce qui coûte cher, c'est de reprendre trop tôt.
import type { Illness, Race } from '../db/types';
import { addDays } from './dates';

export const SICK_LABELS = ['Grippe', 'Rhume', 'Covid', 'Gastro', 'Angine', 'Autre'];
/** Jours de reprise progressive après les 48 h sans fièvre */
export const REPRISE_DAYS = 7;
/** Jours sans fièvre conseillés avant une course longue (trail > 40 km) */
export const RACE_FEVER_FREE_LONG = 6;
/** … avant une course courte */
export const RACE_FEVER_FREE_SHORT = 4;

export type Phase = 'malade' | 'leger' | 'attente' | 'reprise' | 'fini';

let list: Illness[] = [];
/** Maladies déclarées (réglages), à mettre à jour avant tout calcul du coach. */
export function setIllnesses(l?: Illness[]) {
  list = l ?? [];
}
export const illnesses = () => list;

const days = (a: string, b: string) => Math.round((new Date(b + 'T12:00').getTime() - new Date(a + 'T12:00').getTime()) / 86_400_000);

/** Premier jour où l'on peut reprendre (48 h après le dernier jour de fièvre). */
export const repriseStart = (i: Illness) => (i.feverFreeSince ? addDays(i.feverFreeSince, 2) : undefined);

/** Phase de la maladie au jour donné. */
export function phaseOf(i: Illness, day: string): Phase {
  if (day < i.start || (i.end && day > i.end)) return 'fini';
  if (!i.severe) return 'leger';
  if (!i.feverFreeSince || day < i.feverFreeSince) return 'malade';
  const r = repriseStart(i)!;
  if (day < r) return 'attente';
  if (day < addDays(r, REPRISE_DAYS)) return 'reprise';
  return 'fini';
}

/** Maladie qui compte encore aujourd'hui (en cours, ou en reprise). */
export function currentIllness(day: string): Illness | undefined {
  return [...list].reverse().find((i) => phaseOf(i, day) !== 'fini');
}

/** Jours à écarter de l'apprentissage (maladie + 7 jours de reprise) : une nuit de fièvre n'apprend rien sur toi. */
export function sickRanges(today: string): { from: string; to: string }[] {
  return list.map((i) => ({ from: i.start, to: addDays(i.feverFreeSince ?? i.end ?? today, 2 + REPRISE_DAYS) }));
}
export const isSickDay = (d: string, today: string) => sickRanges(today).some((r) => d >= r.from && d <= r.to);

export interface RaceVerdict {
  race: Race;
  verdict: 'forfait' | 'a-decider' | 'ok';
  text: string;
}

/** Courses des 15 prochains jours : forfait conseillé, ou conditions pour prendre le départ. */
export function raceVerdicts(i: Illness, races: Race[], today: string): RaceVerdict[] {
  const long = (r: Race) => r.distanceKm >= 40 || r.elevationGain >= 2000;
  // Sans date de fin de fièvre, on suppose au mieux : plus de fièvre dès demain
  const free = i.feverFreeSince ?? addDays(today, 1);
  return races
    .filter((r) => r.status !== 'done' && r.date >= today && r.date <= addDays(today, 15))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((race) => {
      const need = long(race) ? RACE_FEVER_FREE_LONG : RACE_FEVER_FREE_SHORT;
      const gap = days(free, race.date);
      if (!i.severe)
        return { race, verdict: 'ok' as const, text: `Symptômes au-dessus du cou seulement : départ possible si ça va mieux d'ici là. Pars prudemment, sans chercher le chrono.` };
      if (gap < need)
        return {
          race,
          verdict: 'forfait' as const,
          text: `Forfait conseillé : même sans fièvre dès ${i.feverFreeSince ? 'maintenant' : 'demain'}, tu n'aurais que ${Math.max(0, gap)} jour${gap > 1 ? 's' : ''} sans fièvre avant le départ (il en faut au moins ${need} pour ${long(race) ? 'un trail long' : 'une course'}). Courir à peine sorti d'une grippe expose au cœur (myocardite) et à une rechute.`,
        };
      return {
        race,
        verdict: 'a-decider' as const,
        text: `Possible, à décider la veille. Départ seulement si : plus de fièvre depuis au moins ${need} jours (sans médicament), 2-3 sorties de reprise sans rechute, FC au repos revenue à ta normale (+5 bpm max), pas de toux profonde ni d'essoufflement anormal. Sinon, forfait ou distance plus courte. Ta forme ne se perd pas en 10 jours : l'affûtage devient ta reprise.`,
      };
    });
}
