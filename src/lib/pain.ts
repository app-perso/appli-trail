// Douleurs : zones proposées et règles genou / cheville (cahier des charges §4).
import type { PainEntry } from '../db/types';

export const PAIN_ZONES = [
  'Genou droit',
  'Genou gauche',
  'Cheville droite',
  'Cheville gauche',
  'Mollet droit',
  'Mollet gauche',
  "Tendon d'Achille",
  'Pied',
  'Hanche',
  'Ischios',
  'Quadriceps',
  'Dos',
];

/** « Genou droit » → « Genou D » */
export function shortZone(zone: string): string {
  return zone.replace(/ droite?$/, ' D').replace(/ gauche$/, ' G');
}

export type Advice = { level: 'ok' | 'warn' | 'stop'; title: string; text: string };

/**
 * Conseil à afficher selon la douleur la plus forte.
 * moment = 'matin' : une douleur encore présente au réveil compte comme « encore là au réveil ».
 */
export function painAdvice(pains: PainEntry[], moment: 'matin' | 'seance'): Advice | null {
  const max = Math.max(0, ...pains.map((p) => p.score));
  if (max === 0) return null;
  if (max >= 5)
    return {
      level: 'stop',
      title: 'Stop course à pied',
      text: 'Douleur ≥ 5, gonflement ou boiterie : arrêt de la course et avis kiné / médecin.',
    };
  if (max >= 3 || moment === 'matin')
    return {
      level: 'warn',
      title: 'On lève le pied',
      text:
        (moment === 'matin' ? 'Douleur encore là au réveil' : 'Douleur de 3-4') +
        ' : prochaine séance sans dénivelé (ou vélo), et pas de hausse de volume.',
    };
  return {
    level: 'ok',
    title: 'On suit le plan',
    text: "Douleur légère (0-2) : si elle a disparu demain matin, on suit le plan. Si elle est encore là au réveil ou gêne en descente : séance sans dénivelé ou vélo.",
  };
}
