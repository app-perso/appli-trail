import { useRef, useState } from 'react';
import type { V18Result } from '../lib/excel/importV18';
import { formatLongDate } from '../lib/dates';
import { toast } from '../lib/toast';
import { Sheet } from './Controls';
import { IconUpload } from './Icons';

/** Carte « Importer mon historique Excel » des Réglages. */
export function ExcelImportCard() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<V18Result | null>(null);

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const { readV18File } = await import('../lib/excel/importV18');
      setPreview(await readV18File(file));
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
      toast(`Historique importé ✓ ${rep.sessions} séances`);
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
          {preview.warnings.length > 0 && <span className="small" style={{ color: 'var(--coral)' }}>{preview.warnings.join(' ')}</span>}
          <span className="small muted">
            Tu peux réimporter le fichier plus tard : les séances déjà importées sont mises à jour, sans doublon. Un
            check-in déjà saisi dans l'appli n'est jamais remplacé.
          </span>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void confirm()}>
            Importer
          </button>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setPreview(null)}>
            Annuler
          </button>
        </Sheet>
      )}
    </section>
  );
}
