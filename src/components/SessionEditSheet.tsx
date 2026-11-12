import { useState } from 'react';
import { db } from '../db/db';
import type { PlannedSession, SessionType } from '../db/types';
import { formatDayShort, mondayOf, weekDays } from '../lib/dates';
import { parseDecimal } from '../lib/format';
import { go } from '../lib/router';
import { toast } from '../lib/toast';
import { Sheet } from './Controls';
import { Choice, NumField } from './Choice';

const TYPES: { value: SessionType; label: string }[] = [
  { value: 'Running', label: 'Course' },
  { value: 'Rando', label: 'Rando' },
  { value: 'Vélo', label: 'Vélo' },
  { value: 'Renfo', label: 'Renfo' },
  { value: 'Repos', label: 'Repos' },
  { value: 'Course', label: 'Compét.' },
];

const str = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

/** Modifier une séance du plan : tout est modifiable, y compris le jour. */
export function SessionEditSheet(props: { session: PlannedSession; hasActivity: boolean; onClose: () => void }) {
  const s = props.session;
  const [f, setF] = useState({
    title: s.title,
    type: s.type,
    isKey: s.isKey,
    date: s.date,
    dur: str(s.durationMin),
    km: str(s.distanceKm),
    dPlus: str(s.elevationGain),
    intensity: s.intensity ?? '',
    instructions: s.instructions ?? '',
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const days = weekDays(mondayOf(f.date));

  async function save() {
    await db.plannedSessions.update(s.id, {
      title: f.title.trim() || s.title,
      type: f.type,
      isKey: f.isKey,
      date: f.date,
      durationMin: parseDecimal(f.dur),
      distanceKm: parseDecimal(f.km),
      elevationGain: parseDecimal(f.dPlus),
      intensity: f.intensity.trim() || undefined,
      instructions: f.instructions.trim() || undefined,
    });
    // Le débrief suit la séance si elle change de jour
    if (f.date !== s.date) await db.activities.where('plannedSessionId').equals(s.id).modify({ date: f.date });
    toast('Séance modifiée ✓');
    props.onClose();
  }

  async function remove() {
    await db.transaction('rw', db.plannedSessions, db.activities, async () => {
      await db.activities.where('plannedSessionId').equals(s.id).delete();
      await db.plannedSessions.delete(s.id);
    });
    toast('Séance supprimée');
    props.onClose();
  }

  if (confirmDelete)
    return (
      <Sheet title="Supprimer cette séance ?" onClose={() => setConfirmDelete(false)}>
        <span className="small muted">
          « {s.title} »{props.hasActivity ? ' et son débrief seront effacés.' : ' sera effacée.'}
        </span>
        <button className="btn btn-primary" type="button" onClick={() => void remove()}>
          Supprimer
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => setConfirmDelete(false)}>
          Annuler
        </button>
      </Sheet>
    );

  return (
    <Sheet title="Modifier la séance" onClose={props.onClose}>
      <input className="text-input" aria-label="Nom de la séance" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <div className="choice-wrap">
        <Choice label="Type de séance" value={f.type} options={TYPES} onChange={(type) => setF({ ...f, type })} />
      </div>
      <button
        type="button"
        className={`chip${f.isKey ? ' on' : ''}`}
        aria-pressed={f.isKey}
        onClick={() => setF({ ...f, isKey: !f.isKey })}
        style={{ alignSelf: 'flex-start' }}
      >
        ⭐ Séance clé
      </button>

      <span className="small muted">Jour</span>
      <div className="choice">
        {days.map((d) => {
          const { dow, day } = formatDayShort(d);
          return (
            <button key={d} type="button" role="radio" aria-checked={d === f.date} aria-label={`${dow} ${day}`} onClick={() => setF({ ...f, date: d })} style={{ padding: 0, fontSize: 12, lineHeight: 1.1 }}>
              {dow}
              <br />
              <b>{day}</b>
            </button>
          );
        })}
      </div>
      <label className="time-box">
        <span className="small muted">Autre date</span>
        <input type="date" value={f.date} onChange={(e) => e.target.value && setF({ ...f, date: e.target.value })} className="date-input" />
      </label>

      {f.type !== 'Repos' && (
        <div className="numgrid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <NumField label="Durée" unit="min" value={f.dur} onChange={(dur) => setF({ ...f, dur })} />
          <NumField label="Distance" unit="km" decimal value={f.km} onChange={(km) => setF({ ...f, km })} />
          <NumField label="D+" unit="m" value={f.dPlus} onChange={(dPlus) => setF({ ...f, dPlus })} />
        </div>
      )}
      <input className="text-input" placeholder="Intensité (ex. Z2, Z1-Z2…)" aria-label="Intensité" value={f.intensity} onChange={(e) => setF({ ...f, intensity: e.target.value })} />
      <textarea className="textarea" placeholder="Consignes" aria-label="Consignes" value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} />
      {s.note && <span className="small muted">Note : {s.note}</span>}

      <button className="btn btn-primary" type="button" onClick={() => void save()}>
        Enregistrer
      </button>
      {f.type !== 'Repos' && (
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => {
            props.onClose();
            go('debrief', s.id);
          }}
        >
          {props.hasActivity ? 'Voir le débrief' : 'Faire le débrief'}
        </button>
      )}
      <button className="btn btn-small" type="button" style={{ background: 'transparent', color: 'var(--muted)' }} onClick={() => setConfirmDelete(true)}>
        Supprimer cette séance
      </button>
    </Sheet>
  );
}
