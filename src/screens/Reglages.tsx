import { useRef, useState } from 'react';
import { getSettings, updateSettings } from '../db/db';
import type { ThemeChoice } from '../db/types';
import { useLive } from '../lib/useLive';
import { karvonenZones } from '../lib/calc';
import { formatDateTime } from '../lib/dates';
import { exportBackup, readBackupFile, restoreBackup, summarize, type BackupFile } from '../lib/backup';
import { href } from '../lib/router';
import { Segmented, Sheet, useToast } from '../components/Controls';
import { IconBack, IconDownload, IconUpload } from '../components/Icons';

const VERSION = '0.1.0 · étape 1';

export function Reglages() {
  const settings = useLive(getSettings);
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [busy, setBusy] = useState(false);

  if (!settings) return <main className="screen" />;

  async function onExport() {
    setBusy(true);
    try {
      const r = await exportBackup();
      if (r !== 'cancelled') toast.show('Sauvegarde créée ✓');
    } catch (e) {
      toast.show("La sauvegarde n'a pas pu être créée");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      setPending(await readBackupFile(file));
    } catch (e) {
      toast.show((e as Error).message);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function onRestore(mode: 'replace' | 'merge') {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending, mode);
      toast.show(mode === 'replace' ? 'Données remplacées ✓' : 'Données fusionnées ✓');
      setPending(null);
    } catch (e) {
      toast.show("L'import a échoué, rien n'a été modifié");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  function setHr(key: 'hrRest' | 'hrMax', raw: string) {
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 30 || v > 240) return;
    const next = { ...settings!, [key]: v };
    if (next.hrRest >= next.hrMax) return;
    void updateSettings({ [key]: v, zones: karvonenZones(next.hrRest, next.hrMax) });
  }

  const z = settings.zones;
  const summary = pending ? summarize(pending) : null;

  return (
    <main className="screen">
      <div className="screen-head">
        <a className="icon-btn" href={href('accueil')} aria-label="Retour à l'accueil">
          <IconBack />
        </a>
        <h1 className="screen-title">Réglages</h1>
      </div>

      <section className="card">
        <span className="eyebrow">Sauvegarde</span>
        <span className="small muted">
          Tes données restent uniquement sur ce téléphone. Fais une sauvegarde régulièrement et range-la dans Fichiers
          (iCloud Drive) pour ne rien perdre.
        </span>
        <span className="small">
          Dernière sauvegarde :{' '}
          <b style={{ fontWeight: 600 }}>{settings.lastBackupAt ? formatDateTime(settings.lastBackupAt) : 'jamais'}</b>
        </span>
        <button className="btn btn-primary" type="button" onClick={onExport} disabled={busy}>
          <IconDownload /> Exporter une sauvegarde
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
          <IconUpload /> Importer une sauvegarde
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </section>

      <section className="card">
        <span className="eyebrow">Apparence</span>
        <Segmented<ThemeChoice>
          label="Thème"
          value={settings.theme}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'jour', label: 'Jour' },
            { value: 'nuit', label: 'Nuit' },
          ]}
          onChange={(theme) => void updateSettings({ theme })}
        />
        <span className="small muted">« Auto » suit le mode clair / sombre de l'iPhone.</span>
      </section>

      <section className="card">
        <span className="eyebrow">Fréquence cardiaque</span>
        <label className="field">
          <span>FC au repos</span>
          <input
            type="number"
            inputMode="numeric"
            defaultValue={settings.hrRest}
            key={`rest-${settings.hrRest}`}
            onBlur={(e) => setHr('hrRest', e.target.value)}
          />
        </label>
        <label className="field">
          <span>FC max</span>
          <input
            type="number"
            inputMode="numeric"
            defaultValue={settings.hrMax}
            key={`max-${settings.hrMax}`}
            onBlur={(e) => setHr('hrMax', e.target.value)}
          />
        </label>
        <div className="zones" aria-label="Zones cardiaques (méthode Karvonen)">
          {[0, 1, 2, 3, 4].map((i) => (
            <div className="zone" key={i}>
              <b>Z{i + 1}</b>
              <span className="muted">
                {z[i]}-{z[i + 1]}
              </span>
            </div>
          ))}
        </div>
        <span className="small muted">Zones calculées automatiquement (méthode Karvonen).</span>
      </section>

      <section className="card">
        <span className="eyebrow">Import Excel</span>
        <span className="small muted">
          L'import de ton fichier de préparation (.xlsx) arrive à l'étape 4.
        </span>
      </section>

      <section className="card">
        <span className="eyebrow">À propos</span>
        <span className="small">
          Appli Trail · version {VERSION}
          <br />
          <span className="muted">100 % gratuite, sans compte, fonctionne hors ligne.</span>
        </span>
      </section>

      {pending && summary && (
        <Sheet title="Importer cette sauvegarde ?" onClose={() => !busy && setPending(null)}>
          <span className="small muted">
            Sauvegarde du {formatDateTime(pending.exportedAt)} : {summary.races} courses, {summary.sessions} séances
            prévues, {summary.activities} séances faites, {summary.checkIns} check-ins, {summary.routes} parcours.
          </span>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void onRestore('merge')}>
            Fusionner avec mes données
          </button>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void onRestore('replace')}>
            Tout remplacer
          </button>
          <span className="small muted" style={{ textAlign: 'center' }}>
            « Tout remplacer » efface d'abord ce qui est sur le téléphone.
          </span>
          <button className="btn btn-small" type="button" style={{ background: 'transparent' }} disabled={busy} onClick={() => setPending(null)}>
            Annuler
          </button>
        </Sheet>
      )}
      {toast.node}
    </main>
  );
}
