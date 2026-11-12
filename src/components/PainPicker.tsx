import { useState } from 'react';
import type { PainEntry } from '../db/types';
import { PAIN_ZONES, painAdvice, shortZone } from '../lib/pain';
import { haptic } from '../lib/theme';
import { Sheet, Slider } from './Controls';

/** Pastilles de douleurs + « + zone », avec la règle du coach affichée dessous. */
export function PainPicker(props: { value: PainEntry[]; onChange: (v: PainEntry[]) => void; moment: 'matin' | 'seance' }) {
  const [editing, setEditing] = useState<{ zone: string; score: number; isNew: boolean } | null>(null);
  const [custom, setCustom] = useState('');
  const [picking, setPicking] = useState(false);
  const advice = painAdvice(props.value, props.moment);

  function save() {
    if (!editing) return;
    const others = props.value.filter((p) => p.zone !== editing.zone);
    props.onChange([...others, { zone: editing.zone, score: editing.score }]);
    setEditing(null);
  }

  const used = new Set(props.value.map((p) => p.zone));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="pills" style={{ alignItems: 'center' }}>
        <span style={{ fontSize: 14, marginRight: 4 }}>Douleurs</span>
        {props.value.map((p) => (
          <button
            key={p.zone}
            type="button"
            className={`chip${p.score > 0 ? ' on' : ''}`}
            onClick={() => setEditing({ zone: p.zone, score: p.score, isNew: false })}
          >
            {shortZone(p.zone)} · {p.score}
          </button>
        ))}
        <button type="button" className="chip dashed" onClick={() => setPicking(true)}>
          + zone
        </button>
      </div>
      {props.value.length === 0 && <span className="small muted">Aucune douleur : parfait 👌</span>}

      {advice && (
        <div className={`advice ${advice.level}`} role="note">
          <b>{advice.title}</b>
          <span>{advice.text}</span>
        </div>
      )}

      {picking && (
        <Sheet title="Où as-tu mal ?" onClose={() => setPicking(false)}>
          <div className="zone-grid">
            {PAIN_ZONES.filter((z) => !used.has(z)).map((z) => (
              <button
                key={z}
                type="button"
                className="chip"
                onClick={() => {
                  haptic();
                  setPicking(false);
                  setEditing({ zone: z, score: 2, isNew: true });
                }}
              >
                {z}
              </button>
            ))}
          </div>
          <form
            style={{ display: 'flex', gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              const z = custom.trim();
              if (!z) return;
              setCustom('');
              setPicking(false);
              setEditing({ zone: z, score: 2, isNew: true });
            }}
          >
            <input className="text-input" placeholder="Autre zone…" value={custom} onChange={(e) => setCustom(e.target.value)} />
            <button className="btn btn-secondary btn-small" style={{ width: 'auto' }} type="submit">
              OK
            </button>
          </form>
        </Sheet>
      )}

      {editing && (
        <Sheet title={editing.zone} onClose={() => setEditing(null)}>
          <Slider label="Intensité de la douleur" value={editing.score} onChange={(score) => setEditing({ ...editing, score })} color="coral" />
          <span className="small muted">0 = rien · 5 = douleur qui fait boiter · 10 = insupportable</span>
          <button className="btn btn-primary" type="button" onClick={save}>
            {editing.isNew ? 'Ajouter' : 'Valider'}
          </button>
          {!editing.isNew && (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                props.onChange(props.value.filter((p) => p.zone !== editing.zone));
                setEditing(null);
              }}
            >
              Retirer cette zone
            </button>
          )}
        </Sheet>
      )}
    </div>
  );
}
