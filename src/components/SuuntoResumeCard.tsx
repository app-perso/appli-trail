import { useRef, useState } from 'react';
import type { SuuntoResume } from '../lib/suuntoJson';
import { formatLongDate } from '../lib/dates';
import { formatDuration, formatNumber } from '../lib/format';
import { toast } from '../lib/toast';
import { Sheet } from './Controls';
import { IconUpload } from './Icons';

/** Réglages : import unique de l'historique Suunto (suunto_resume.json). */
export function SuuntoResumeCard() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<SuuntoResume | null>(null);

  async function onFile(f?: File) {
    if (!f) return;
    setBusy(true);
    try {
      const { parseSuuntoResume } = await import('../lib/suuntoJson');
      const r = parseSuuntoResume(await f.text());
      if (!r.workouts.length && !r.sleeps.length) throw new Error('Aucune séance ni nuit trouvée dans ce fichier.');
      setPreview(r);
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
      const { applySuuntoResume } = await import('../lib/suuntoJson');
      const r = await applySuuntoResume(preview);
      toast(`✓ ${r.added} séances ajoutées, ${r.enriched} complétées, ${r.updated} mises à jour, ${r.nights} nuits`);
      setPreview(null);
    } catch (e) {
      console.error(e);
      toast("L'import a échoué");
    } finally {
      setBusy(false);
    }
  }

  const w = preview?.workouts[0];
  const s = preview?.sleeps[0];
  return (
    <section className="card">
      <span className="eyebrow">Historique Suunto (.json)</span>
      <span className="small muted">Import unique de ton fichier « suunto_resume.json » (séances et nuits). Il reste sur ton téléphone.</span>
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => input.current?.click()}>
        <IconUpload /> {busy && !preview ? 'Lecture…' : 'Importer suunto_resume.json'}
      </button>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      {preview && (
        <Sheet title="Importer l'historique Suunto ?" onClose={() => !busy && setPreview(null)}>
          <div className="verify-list">
            <div className="verify-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>Période</span>
              <b className="small">
                {preview.firstDate && formatLongDate(preview.firstDate)} → {preview.lastDate && formatLongDate(preview.lastDate)}
              </b>
            </div>
            <div className="verify-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>Séances</span>
              <b>{preview.workouts.length}</b>
            </div>
            <div className="verify-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>Nuits</span>
              <b>{preview.sleeps.length}</b>
            </div>
          </div>
          {w && (
            <span className="small">
              <b>Exemple de séance lue :</b> {formatLongDate(w.date)} {w.time.replace(':', 'h')} · {w.kindLabel} · {formatNumber(w.distanceKm)} km · {formatDuration(w.durationMin)} · +{w.elevationGain}/−{w.elevationLoss} m
              {w.hrAvg ? ` · FC ${w.hrAvg}/${w.hrMax ?? '–'}` : ''}
              {w.zonesMin ? ` · zones ${w.zonesMin.map((m) => Math.round(m)).join('/')} min` : ''}
              {w.vo2max ? ` · VO2max ${w.vo2max}` : ''}
              {w.vamUp ? ` · montée ${w.vamUp} m/h` : ''}
              {w.vamDown ? ` · descente ${w.vamDown} m/h` : ''}
            </span>
          )}
          {s && (
            <span className="small">
              <b>Exemple de nuit lue :</b> réveil le {formatLongDate(s.date)}
              {s.bed ? ` · coucher ${s.bed.replace(':', 'h')}` : ''}
              {s.wake ? ` · lever ${s.wake.replace(':', 'h')}` : ''}
              {s.hours ? ` · ${formatNumber(s.hours, 1)} h` : ''}
              {s.quality !== undefined ? ` · qualité ${s.quality}` : ''}
            </span>
          )}
          {preview.warnings.length > 0 && <span className="small" style={{ color: 'var(--coral)' }}>{preview.warnings.slice(0, 3).join(' ')}</span>}
          <span className="small muted">
            Les séances déjà présentes (même date et heure) sont mises à jour en gardant tes ressentis ; celles de ton historique Excel sont complétées. Les nuits
            remplissent les heures de coucher / lever de tes check-ins sans écraser ce que tu as saisi.
          </span>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Import…' : 'Importer'}
          </button>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setPreview(null)}>
            Annuler
          </button>
        </Sheet>
      )}
    </section>
  );
}
