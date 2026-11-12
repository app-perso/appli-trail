// Règles de calcul (cahier des charges §4).

/** km-effort = km + D+ / 100 */
export function kmEffort(km: number, elevationGain: number): number {
  return km + elevationGain / 100;
}

/** Zones FC par la méthode de Karvonen (50/60/70/80/90/100 % de la FC de réserve). */
export function karvonenZones(hrRest: number, hrMax: number): number[] {
  const reserve = hrMax - hrRest;
  return [0.5, 0.6, 0.7, 0.8, 0.9, 1].map((p) => Math.round(hrRest + reserve * p));
}
