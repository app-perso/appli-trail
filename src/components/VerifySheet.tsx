import { useState } from 'react';
import type { OcrValues } from '../lib/ocr/parse';
import { parseDecimal } from '../lib/format';
import { Sheet } from './Controls';

type Row = { key: 'distanceKm' | 'elevationGain' | 'elevationLoss' | 'hrAvg' | 'hrMax'; label: string; unit: string; decimal?: boolean };
const ROWS: Row[] = [
  { key: 'distanceKm', label: 'Distance', unit: 'km', decimal: true },
  { key: 'elevationGain', label: 'D+', unit: 'm' },
  { key: 'elevationLoss', label: 'D−', unit: 'm' },
  { key: 'hrAvg', label: 'FC moyenne', unit: 'bpm' },
  { key: 'hrMax', label: 'FC max', unit: 'bpm' },
];

const s = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

function Tag({ found }: { found: boolean }) {
  return <span className={`tag ${found ? 'found' : ''}`}>{found ? 'lu ✓' : 'à saisir'}</span>;
}

/** Écran de vérification : toutes les valeurs lues, modifiables, avant de les utiliser. */
export function VerifySheet(props: { values: OcrValues; texts: string[]; onApply: (v: OcrValues) => void; onClose: () => void }) {
  const v = props.values;
  const [f, setF] = useState<Record<string, string>>(() => ({
    distanceKm: s(v.distanceKm),
    elevationGain: s(v.elevationGain),
    elevationLoss: s(v.elevationLoss),
    hrAvg: s(v.hrAvg),
    hrMax: s(v.hrMax),
    h: v.durationMin !== undefined ? String(Math.floor(Math.round(v.durationMin) / 60)) : '',
    min: v.durationMin !== undefined ? String(Math.round(v.durationMin) % 60) : '',
  }));
  const [z, setZ] = useState<string[]>(() => (v.zones ?? [undefined, undefined, undefined, undefined, undefined]).map((x) => s(x)));
  const nFound = Object.keys(v).length;
  const zSum = z.reduce((a, x) => a + (parseDecimal(x) ?? 0), 0);

  function apply() {
    const out: OcrValues = {};
    for (const r of ROWS) {
      const n = parseDecimal(f[r.key]);
      if (n !== undefined) out[r.key] = n;
    }
    const h = parseDecimal(f.h);
    const m = parseDecimal(f.min);
    if (h !== undefined || m !== undefined) out.durationMin = (h ?? 0) * 60 + (m ?? 0);
    if (z.some((x) => x.trim() !== '')) out.zones = z.map((x) => parseDecimal(x) ?? 0) as OcrValues['zones'];
    props.onApply(out);
  }

  return (
    <Sheet title="Vérifie les valeurs" onClose={props.onClose}>
      <span className="small muted">
        {nFound ? `${nFound} valeur${nFound > 1 ? 's' : ''} trouvée${nFound > 1 ? 's' : ''} sur ${props.texts.length > 1 ? 'tes captures' : 'ta capture'}.` : "Rien n'a pu être lu : complète à la main."}{' '}
        Corrige si besoin.
      </span>
      <div className="verify-list">
        {ROWS.slice(0, 1).map((r) => (
          <VerifyRow key={r.key} row={r} value={f[r.key]} found={v[r.key] !== undefined} onChange={(x) => setF({ ...f, [r.key]: x })} />
        ))}
        <div className="verify-row">
          <span>Durée</span>
          <span className="verify-input">
            <input inputMode="numeric" aria-label="Durée (heures)" value={f.h} placeholder="–" onChange={(e) => setF({ ...f, h: e.target.value })} style={{ width: 40 }} />
            <span className="muted small">h</span>
            <input inputMode="numeric" aria-label="Durée (minutes)" value={f.min} placeholder="–" onChange={(e) => setF({ ...f, min: e.target.value })} style={{ width: 48 }} />
            <span className="muted small">min</span>
          </span>
          <Tag found={v.durationMin !== undefined} />
        </div>
        {ROWS.slice(1).map((r) => (
          <VerifyRow key={r.key} row={r} value={f[r.key]} found={v[r.key] !== undefined} onChange={(x) => setF({ ...f, [r.key]: x })} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="card-row">
          <span style={{ fontSize: 14 }}>Temps en zone (%)</span>
          <Tag found={!!v.zones} />
        </div>
        <div className="zones">
          {z.map((x, i) => (
            <label className="zone" key={i}>
              <b>Z{i + 1}</b>
              <input
                inputMode="decimal"
                aria-label={`Zone ${i + 1} en %`}
                value={x}
                placeholder="–"
                onChange={(e) => setZ(z.map((y, j) => (j === i ? e.target.value : y)))}
                className="zone-input"
              />
            </label>
          ))}
        </div>
        {z.some((x) => x.trim() !== '') && Math.abs(zSum - 100) > 3 && (
          <span className="small" style={{ color: 'var(--coral)' }}>
            Total : {Math.round(zSum)} % (devrait faire environ 100 %)
          </span>
        )}
      </div>
      <button className="btn btn-primary" type="button" onClick={apply}>
        Utiliser ces valeurs
      </button>
      <details className="small muted">
        <summary>Texte lu sur les captures</summary>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 200, overflow: 'auto' }}>{props.texts.join('\n\n———\n\n')}</pre>
      </details>
    </Sheet>
  );
}

function VerifyRow(props: { row: Row; value: string; found: boolean; onChange: (v: string) => void }) {
  return (
    <div className="verify-row">
      <span>{props.row.label}</span>
      <span className="verify-input">
        <input
          inputMode={props.row.decimal ? 'decimal' : 'numeric'}
          aria-label={`${props.row.label} (${props.row.unit})`}
          value={props.value}
          placeholder="–"
          onChange={(e) => props.onChange(e.target.value)}
        />
        <span className="muted small">{props.row.unit}</span>
      </span>
      <Tag found={props.found} />
    </div>
  );
}
