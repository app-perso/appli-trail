// Sauvegarde complète en fichier .json, et restauration (cahier des charges §3).
import { db, getSettings, updateSettings } from '../db/db';
import { todayISO } from './dates';

const APP = 'appli-trail';
const FORMAT_VERSION = 1;
const TABLES = ['races', 'plannedSessions', 'activities', 'checkIns', 'routes', 'settings'] as const;
type TableName = (typeof TABLES)[number];

export interface BackupFile {
  app: typeof APP;
  formatVersion: number;
  exportedAt: string;
  tables: Record<TableName, unknown[]>;
}

// --- Les captures (images) sont converties en texte pour tenir dans le JSON ---
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',');
  const type = head.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function encode(value: unknown): Promise<unknown> {
  if (value instanceof Blob) return { __blob: await blobToDataUrl(value) };
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await encode(v);
    return out;
  }
  return value;
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.__blob === 'string') return dataUrlToBlob(obj.__blob);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = decode(v);
    return out;
  }
  return value;
}

// --- Export ---
export async function buildBackup(): Promise<{ file: File; exportedAt: string }> {
  const exportedAt = new Date().toISOString();
  const tables = {} as Record<TableName, unknown[]>;
  for (const t of TABLES) tables[t] = (await encode(await db.table(t).toArray())) as unknown[];
  // On enregistre la date de sauvegarde dans la sauvegarde elle-même
  tables.settings = (tables.settings as Record<string, unknown>[]).map((s) => ({ ...s, lastBackupAt: exportedAt }));
  const data: BackupFile = { app: APP, formatVersion: FORMAT_VERSION, exportedAt, tables };
  const name = `sauvegarde-trail-${todayISO()}.json`;
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  return { file, exportedAt };
}

/** Ouvre le menu de partage iOS (Enregistrer dans Fichiers, AirDrop…) ou télécharge le fichier. */
export async function exportBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const { file, exportedAt } = await buildBackup();
  let result: 'shared' | 'downloaded' | 'cancelled';
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Sauvegarde Appli Trail' });
      result = 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      throw e;
    }
  } else {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    result = 'downloaded';
  }
  await updateSettings({ lastBackupAt: exportedAt });
  return result;
}

// --- Import ---
export async function readBackupFile(file: File): Promise<BackupFile> {
  let data: BackupFile;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("Ce fichier n'est pas lisible (ce n'est pas un fichier .json valide).");
  }
  if (data?.app !== APP || typeof data.tables !== 'object') {
    throw new Error("Ce fichier n'est pas une sauvegarde de l'Appli Trail.");
  }
  if (data.formatVersion > FORMAT_VERSION) {
    throw new Error("Cette sauvegarde vient d'une version plus récente de l'appli. Recharge l'appli puis réessaie.");
  }
  return data;
}

export function summarize(data: BackupFile) {
  const n = (t: TableName) => data.tables[t]?.length ?? 0;
  return { races: n('races'), sessions: n('plannedSessions'), activities: n('activities'), checkIns: n('checkIns'), routes: n('routes') };
}

/**
 * « replace » : efface tout puis remet le contenu de la sauvegarde.
 * « merge »   : ajoute le contenu de la sauvegarde ; un élément identique (même identifiant) est remplacé
 *               par la version de la sauvegarde. Les réglages actuels sont conservés.
 */
export async function restoreBackup(data: BackupFile, mode: 'replace' | 'merge'): Promise<void> {
  const keepSettings = await getSettings();
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      const rows = (decode(data.tables[t] ?? []) as unknown[]) ?? [];
      if (t === 'settings') {
        if (mode === 'replace' && rows.length) await db.table(t).bulkPut(rows);
        else await db.table(t).put(keepSettings);
        continue;
      }
      if (mode === 'replace') await db.table(t).clear();
      await db.table(t).bulkPut(rows);
    }
  });
}
