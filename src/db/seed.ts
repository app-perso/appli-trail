// Données initiales non personnelles (cahier des charges §1 et §9).
import type { Race, Route } from './types';

const id = () => crypto.randomUUID();

export function seedRaces(): Race[] {
  return [
    { id: id(), name: 'Marathon du Mont-Blanc', shortName: 'Mont-Blanc', date: '2026-06-28', distanceKm: 44, elevationGain: 2540, status: 'done', resultTime: '7:13' },
    { id: id(), name: '5 Collines de Garches', shortName: 'Garches', date: '2026-11-22', distanceKm: 16.2, elevationGain: 275, status: 'planned' },
    { id: id(), name: 'Trail du Soleil Levens', shortName: 'Levens', date: '2026-11-29', distanceKm: 61.7, elevationGain: 3870, status: 'planned' },
    { id: id(), name: 'Chianti by UTMB', shortName: 'Chianti', date: '2027-03-20', distanceKm: 74, elevationGain: 3000, status: 'planned' },
    { id: id(), name: 'Maxi-Race · demi-tour du lac', shortName: 'Maxi-Race', date: '2027-05-30', distanceKm: 56, elevationGain: 3300, status: 'planned' },
    { id: id(), name: "Val d'Aran by UTMB · TDL", shortName: "Val d'Aran", date: '2027-07-07', distanceKm: 75, elevationGain: 5100, status: 'planned', isMain: true },
  ];
}

export function seedRoutes(): Route[] {
  return [
    { id: id(), location: 'Nice', name: 'Boucle Mont Bastide', tag: 'Qualité', distanceKm: 11.5, elevationGain: 810, access: 'TER ou bus Zou 602 Èze' },
    { id: id(), location: 'Nice', name: 'Boucle de Menton', tag: 'WE choc', distanceKm: 19, elevationGain: 1230 },
    { id: id(), location: 'Nice', name: 'Levens ↔ Mont Férion', tag: 'Repérage', distanceKm: 15, elevationGain: 700 },
    { id: id(), location: 'Nice', name: 'Beaulieu → Nice', tag: 'Plaisir', distanceKm: 15, elevationGain: 670 },
    { id: id(), location: 'Nice', name: 'Tourrette-Levens → Èze bord de mer', tag: 'WE choc', distanceKm: 21.3, elevationGain: 1134 },
    { id: id(), location: 'Saint-Cloud', name: 'Côtes du parc', tag: 'Qualité', distanceKm: 18, elevationGain: 800, note: 'Répétitions (~18 km / ~800 m)' },
    { id: id(), location: 'Saint-Cloud', name: 'Butte hamster', tag: 'Qualité', distanceKm: 10, elevationGain: 500, note: '400 à 600 m de D+ selon les tours' },
    { id: id(), location: 'Saint-Cloud', name: 'Parc vallonné', tag: 'Plaisir', distanceKm: 16, elevationGain: 330 },
    { id: id(), location: 'Saint-Cloud', name: 'Bords de Seine', tag: 'Plaisir', distanceKm: 19, elevationGain: 0, note: '18 à 20 km, plat' },
  ];
}
