// Écriture du jeu de données en Excel (.xlsx), CSV (un fichier par table) et JSON (un seul fichier).
import { db, getSettings } from '../../db/db';
import { todayISO } from '../dates';
import { buildDataset, type Cell, type Dataset, type Table } from './dataset';

export const APP_VERSION = '0.6.0';

export async function collectDataset(): Promise<Dataset> {
  const [sessions, activities, checkIns, races, settings] = await Promise.all([
    db.plannedSessions.toArray(),
    db.activities.toArray(),
    db.checkIns.toArray(),
    db.races.toArray(),
    getSettings(),
  ]);
  return buildDataset({ sessions, activities, checkIns, races, settings, appVersion: APP_VERSION });
}

const base = () => `historique-trail-${todayISO()}`;

// ---------- Excel : un onglet par table + « Lisez-moi », valeurs brutes, aucune formule ni fusion ----------
export async function toXlsx(ds: Dataset): Promise<File> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Appli Trail';
  wb.created = new Date(ds.exportedAt);

  const readme = wb.addWorksheet('Lisez-moi');
  readme.addRow(['section', 'element', 'description']);
  for (const r of ds.readme) readme.addRow([r.section, r.item, r.description]);
  readme.columns = [{ width: 18 }, { width: 28 }, { width: 120 }];

  for (const t of ds.tables) {
    const ws = wb.addWorksheet(t.name);
    ws.addRow(t.columns.map((c) => c.key));
    for (const row of t.rows) ws.addRow(t.columns.map((c) => row[c.key] ?? null));
    ws.columns = t.columns.map((c) => ({ width: Math.min(40, Math.max(10, c.key.length + 2)) }));
    ws.views = [{ state: 'frozen', ySplit: 1 }]; // en-têtes toujours visibles (pas de mise en forme)
  }
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf], `${base()}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------- CSV : UTF-8 (avec BOM pour Excel), virgule, point décimal ----------
function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tableToCsv(t: Pick<Table, 'columns' | 'rows'>): string {
  const lines = [t.columns.map((c) => c.key).join(','), ...t.rows.map((r) => t.columns.map((c) => csvCell(r[c.key] ?? null)).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function toCsvFiles(ds: Dataset): File[] {
  const readme: Pick<Table, 'columns' | 'rows'> = {
    columns: [
      { key: 'section', description: '' },
      { key: 'element', description: '' },
      { key: 'description', description: '' },
    ],
    rows: ds.readme.map((r) => ({ section: r.section, element: r.item, description: r.description })),
  };
  return [
    new File([tableToCsv(readme)], `${base()}-lisez-moi.csv`, { type: 'text/csv' }),
    ...ds.tables.map((t) => new File([tableToCsv(t)], `${base()}-${t.name.toLowerCase()}.csv`, { type: 'text/csv' })),
  ];
}

// ---------- JSON : un seul fichier, mêmes noms de colonnes ----------
export function toJson(ds: Dataset): File {
  const out = {
    app: 'appli-trail',
    format: 'export-analyse',
    exportedAt: ds.exportedAt,
    appVersion: ds.appVersion,
    lisezMoi: ds.readme,
    colonnes: Object.fromEntries(ds.tables.map((t) => [t.name, Object.fromEntries(t.columns.map((c) => [c.key, c.description]))])),
    tables: Object.fromEntries(ds.tables.map((t) => [t.name, t.rows])),
  };
  return new File([JSON.stringify(out, null, 2)], `${base()}.json`, { type: 'application/json' });
}
