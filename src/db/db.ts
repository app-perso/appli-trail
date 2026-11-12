// Base de données locale (IndexedDB via Dexie). Rien ne quitte le téléphone.
import Dexie, { type EntityTable } from 'dexie';
import type { Activity, CheckIn, PlannedSession, Race, Route, Settings } from './types';
import { seedRaces, seedRoutes } from './seed';
import { karvonenZones } from '../lib/calc';

export const db = new Dexie('appli-trail') as Dexie & {
  races: EntityTable<Race, 'id'>;
  plannedSessions: EntityTable<PlannedSession, 'id'>;
  activities: EntityTable<Activity, 'id'>;
  checkIns: EntityTable<CheckIn, 'id'>;
  routes: EntityTable<Route, 'id'>;
  settings: EntityTable<Settings, 'id'>;
};

db.version(1).stores({
  races: 'id, date, status',
  plannedSessions: 'id, date, week, type',
  activities: 'id, date, plannedSessionId, type',
  checkIns: 'id, &date',
  routes: 'id, location',
  settings: 'id',
});

export const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  hrRest: 65,
  hrMax: 198,
  zones: karvonenZones(65, 198),
  theme: 'auto',
};

// Au tout premier lancement : on remplit les courses, les parcours et les réglages par défaut.
db.on('populate', async (tx) => {
  await tx.table('races').bulkAdd(seedRaces());
  await tx.table('routes').bulkAdd(seedRoutes());
  await tx.table('settings').add(DEFAULT_SETTINGS);
});

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('main')) ?? DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: 'main' });
}

export const newId = () => crypto.randomUUID();
