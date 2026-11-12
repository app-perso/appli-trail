import { useState } from 'react';
import { db, newId } from '../db/db';
import type { Race } from '../db/types';
import { parseDecimal } from '../lib/format';
import { hmToMin } from '../lib/racePlan';
import { todayISO } from '../lib/dates';
import { toast } from '../lib/toast';
import { Sheet } from './Controls';
import { NumField } from './Choice';

const str = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

/** Ajouter ou modifier une course (temps réalisé, objectif, objectif principal…). */
export function RaceEditSheet(props: { race?: Race; onClose: () => void; onSaved?: (id: string) => void }) {
  const r = props.race;
  const [f, setF] = useState({
    name: r?.name ?? '',
    shortName: r?.shortName ?? '',
    date: r?.date ?? todayISO(),
    km: str(r?.distanceKm),
    dPlus: str(r?.elevationGain),
    dMinus: str(r?.elevationLoss),
    result: r?.resultTime ?? '',
    goal: r?.goalTime ?? '',
    isMain: r?.isMain ?? false,
    notes: r?.notes ?? '',
  });
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const km = parseDecimal(f.km);
    const dPlus = parseDecimal(f.dPlus);
    if (!f.name.trim()) return setError('Donne un nom à la course.');
    if (!km || dPlus === undefined) return setError('Distance et D+ sont nécessaires (pour le km-effort).');
    if (f.result.trim() && hmToMin(f.result) === undefined) return setError('Temps réalisé au format h:mm, ex. 7:13.');
    if (f.goal.trim() && hmToMin(f.goal) === undefined) return setError('Objectif au format h:mm, ex. 9:30.');
    const id = r?.id ?? newId();
    const data: Race = {
      ...(r ?? {}),
      id,
      name: f.name.trim(),
      shortName: f.shortName.trim() || f.name.trim().split(/\s+/).slice(0, 2).join(' '),
      date: f.date,
      distanceKm: km,
      elevationGain: dPlus,
      elevationLoss: parseDecimal(f.dMinus),
      resultTime: f.result.trim() || undefined,
      goalTime: f.goal.trim() || undefined,
      status: f.result.trim() || f.date < todayISO() ? 'done' : 'planned',
      isMain: f.isMain || undefined,
      notes: f.notes.trim() || undefined,
    };
    await db.transaction('rw', db.races, async () => {
      // Un seul objectif principal
      if (data.isMain) await db.races.filter((x) => !!x.isMain && x.id !== id).modify({ isMain: undefined });
      await db.races.put(data);
    });
    toast(r ? 'Course modifiée ✓' : 'Course ajoutée ✓');
    props.onSaved?.(id);
    props.onClose();
  }

  if (confirm && r)
    return (
      <Sheet title="Supprimer cette course ?" onClose={() => setConfirm(false)}>
        <span className="small muted">« {r.name} », son plan de course et son GPX seront effacés.</span>
        <button
          className="btn btn-primary"
          type="button"
          onClick={async () => {
            await db.races.delete(r.id);
            toast('Course supprimée');
            props.onClose();
          }}
        >
          Supprimer
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => setConfirm(false)}>
          Annuler
        </button>
      </Sheet>
    );

  return (
    <Sheet title={r ? 'Modifier la course' : 'Nouvelle course'} onClose={props.onClose}>
      <input className="text-input" placeholder="Nom (ex. Chianti by UTMB)" aria-label="Nom de la course" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input className="text-input" placeholder="Nom court (ex. Chianti)" aria-label="Nom court" value={f.shortName} onChange={(e) => setF({ ...f, shortName: e.target.value })} />
      <label className="time-box">
        <span className="small muted">Date</span>
        <input type="date" className="date-input" value={f.date} onChange={(e) => e.target.value && setF({ ...f, date: e.target.value })} />
      </label>
      <div className="numgrid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <NumField label="Distance" unit="km" decimal value={f.km} onChange={(km) => setF({ ...f, km })} />
        <NumField label="D+" unit="m" value={f.dPlus} onChange={(dPlus) => setF({ ...f, dPlus })} />
        <NumField label="D−" unit="m" value={f.dMinus} onChange={(dMinus) => setF({ ...f, dMinus })} />
      </div>
      <div className="numgrid">
        <label className="numfield">
          <span className="numfield-label">Objectif (h:mm)</span>
          <input inputMode="text" aria-label="Objectif de temps" placeholder="–" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} />
        </label>
        <label className="numfield">
          <span className="numfield-label">Temps réalisé (h:mm)</span>
          <input inputMode="text" aria-label="Temps réalisé" placeholder="–" value={f.result} onChange={(e) => setF({ ...f, result: e.target.value })} />
        </label>
      </div>
      <button type="button" className={`chip${f.isMain ? ' on' : ''}`} aria-pressed={f.isMain} onClick={() => setF({ ...f, isMain: !f.isMain })} style={{ alignSelf: 'flex-start' }}>
        🏁 Objectif principal de la saison
      </button>
      <textarea className="textarea" placeholder="Notes (ressenti, conditions…)" aria-label="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      {error && (
        <span className="small" style={{ color: 'var(--coral)' }} role="alert">
          {error}
        </span>
      )}
      <button className="btn btn-primary" type="button" onClick={() => void save()}>
        Enregistrer
      </button>
      {r && (
        <button className="btn btn-small" type="button" style={{ background: 'transparent', color: 'var(--muted)' }} onClick={() => setConfirm(true)}>
          Supprimer cette course
        </button>
      )}
    </Sheet>
  );
}
