import { useEffect, useMemo, useState } from 'react';
import { Sheet } from './Controls';
import { IconPlus } from './Icons';

/** Miniatures des captures + case « + Captures » (ouvre la photothèque de l'iPhone). */
export function ScreenshotStrip(props: {
  shots: Blob[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  const urls = useMemo(() => props.shots.map((b) => URL.createObjectURL(b)), [props.shots]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {urls.map((u, i) => (
          <button
            key={u}
            type="button"
            className="shot-thumb"
            aria-label={`Voir la capture ${i + 1}`}
            onClick={() => setOpen(i)}
            style={{ backgroundImage: `url(${u})` }}
          />
        ))}
        <label className={`shot-add${props.disabled ? ' disabled' : ''}`}>
          <IconPlus size={20} />
          {props.shots.length ? 'Ajouter' : 'Captures Suunto'}
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={props.disabled}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) props.onAdd(files);
            }}
          />
        </label>
      </div>
      {open !== null && urls[open] && (
        <Sheet title={`Capture ${open + 1}`} onClose={() => setOpen(null)}>
          <img src={urls[open]} alt={`Capture ${open + 1}`} style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 16 }} />
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              props.onRemove(open);
              setOpen(null);
            }}
          >
            Retirer cette capture
          </button>
        </Sheet>
      )}
    </>
  );
}

/** Barre de progression de la lecture. */
export function OcrProgress({ fraction, label }: { fraction: number; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} role="status" aria-live="polite">
      <div className="card-row small">
        <span>{label}</span>
        <b>{Math.round(fraction * 100)} %</b>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--track)', overflow: 'hidden' }}>
        <div style={{ width: `${fraction * 100}%`, height: '100%', background: 'var(--grad-coral)', transition: 'width 200ms ease' }} />
      </div>
    </div>
  );
}
