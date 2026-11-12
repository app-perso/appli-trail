import { useRef, useState } from 'react';
import type { V18Result } from '../lib/excel/importV18';
import type { ImportDiff } from '../lib/excel/applyV18';
import { formatLongDate } from '../lib/dates';
import { toast } from '../lib/toast';
import { Sheet } from './Controls';
import { IconUpload } from './Icons';

/** Carte « Importer mon historique Excel » des Réglages. */
export function ExcelImportCard() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<V18Result | null>(null);
  const [diff, setDiff] = useState<ImportDiff | null>(null);

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const { readV18File } = await import('../lib/excel/importV18');
      const res = await readV18File(file);
      const { diffV18 } = await import('../lib/excel/applyV18');
      setDiff(await diffV18(res));
      setPreview(res);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    try {
      const { applyV18 } = await import('../lib/excel/applyV18');
      const rep = await applyV18(preview);
      toast(`Historique importé ✓ ${rep.added} nouvelles, ${rep.updated} mises à jour${rep.removed.length ? `, ${rep.removed.length} retirées` : ''}`);
      setPreview(null);
    } catch (e) {
      console.error(e);
      toast("L'import a échoué, rien n'a été modifié");
    } finally {
      setBusy(false);
    }
  }

  const done = preview?.activities.filter((a) => !a.skipped).length ?? 0;
  const skipped = preview?.activities.filter((a) => a.skipped).length ?? 0;

  return (
    <section className="card">
      <span className="eyebrow">Historique Excel</span>
      <span className="small muted">
        Importe ton fichier de préparation (feuille « Plan ») pour récupérer tes séances prévues et réalisées, ta forme
        du matin et ton sommeil. Le fichier reste sur ton téléphone.
      </span>
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => input.current?.click()}>
        <IconUpload /> {busy && !preview ? 'Lecture du fichier…' : 'Importer mon fichier Excel'}
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {preview && (
        <Sheet title="Importer cet historique ?" onClose={() => !busy && setPreview(null)}>
          <div className="verify-list">
            <div className="verify-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>Période</span>
              <b className="small">
                {preview.firstDate && formatLongDate(preview.firstDate)} → {preview.lastDate && formatLongDate(preview.lastDate)}
              </b>
            </div>
            <div className="verify-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>Séances prévues</span>
              <b>{preview.sessions.length}</b>
            </div>
            <div className="verify-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>Séances faites</span>
              <b>{done}</b>
            </div>
            <div className="verify-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>Séances pas faites</span>
              <b>{skipped}</b>
            </div>
            <div className="verify-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>Matins (forme, sommeil)</span>
              <b>{preview.checkIns.length}</b>
            </div>
            {preview.hr && (
              <div className="verify-row" style={{ gridTemplateColumns: '1fr auto' }}>
                <span>FC repos / max</span>
                <b>
                  {preview.hr.hrRest} / {preview.hr.hrMax}
                </b>
              </div>
            )}
          </div>
          {diff && diff.updated > 0 && (
            <div className="verify-list">
              <div className="verify-row" style={{ gridTemplateColumns: '1fr auto' }}>
                <span>Nouvelles séances</span>
                <b>{diff.added}</b>
              </div>
              <div className="verify-row" style={{ gridTemplateColumns: '1fr auto' }}>
                <span>Déjà importées, mises à jour</span>
                <b>{diff.updated}</b>
              </div>
              <div className="verify-row" style={{ gridTemplateColumns: '1fr auto' }}>
                <span>Plus dans le fichier, retirées</span>
                <b>{diff.removed.length}</b>
              </div>
            </div>
          )}
          {diff && diff.removed.length > 0 && (
            <details className="small muted">
              <summary>Voir les séances retirées</summary>
              <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                {diff.removed.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </details>
          )}
          {diff && diff.kept.length > 0 && (
            <span className="small muted">
              Gardées car tu as fait leur débrief dans l'appli : {diff.kept.join(' · ')}
            </span>
          )}
          {preview.warnings.length > 0 && <span className="small" style={{ color: 'var(--coral)' }}>{preview.warnings.join(' ')}</span>}
          <span className="small muted">
            Réimporter met à jour les séances déjà importées, sans doublon, et retire celles qui ne sont plus dans le
            fichier. Un check-in ou un débrief fait dans l'appli n'est jamais remplacé.
          </span>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void confirm()}>
            Importer
          </button>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => {
              setPreview(null);
              setDiff(null);
            }}>
            Annuler
          </button>
        </Sheet>
      )}
    </section>
  );
}
