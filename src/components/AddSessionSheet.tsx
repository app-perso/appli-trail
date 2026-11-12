import { useState } from 'react';
import { db, newId } from '../db/db';
import type { SessionType } from '../db/types';
import { parseDecimal } from '../lib/format';
import { go } from '../lib/router';
import { formatDayShort, todayISO } from '../lib/dates';
import { Sheet } from './Controls';
import { Choice, NumField } from './Choice';
import { SESSION_LOOK } from './SessionIcon';

const TYPES: SessionType[] = ['Running', 'Renfo', 'Vélo', 'Rando'];
const DEFAULT_TITLE: Record<string, string> = {
  Running: 'Sortie course à pied',
  Renfo: 'Renfo',
  Vélo: 'Sortie vélo',
  Rando: 'Rando',
};

/** Ajout rapide d'une séance pour aujourd'hui (en attendant le plan complet de l'étape 4). */
export function AddSessionSheet(props: { date: string; onClose: () => void }) {
  const [type, setType] = useState<SessionType>('Running');
  const [title, setTitle] = useState('');
  const [dur, setDur] = useState('');
  const [km, setKm] = useState('');
  const [dPlus, setDPlus] = useState('');

  async function add(thenDebrief: boolean) {
    const id = newId();
    await db.plannedSessions.add({
      id,
      date: props.date,
      week: '',
      phase: '',
      type,
      isKey: false,
      title: title.trim() || DEFAULT_TITLE[type],
      durationMin: parseDecimal(dur),
      distanceKm: type === 'Renfo' ? undefined : parseDecimal(km),
      elevationGain: type === 'Renfo' ? undefined : parseDecimal(dPlus),
      source: 'appli',
    });
    props.onClose();
    if (thenDebrief) go('debrief', id);
  }

  return (
    <Sheet title={props.date === todayISO() ? "Ajouter une séance" : `Ajouter une séance · ${formatDayShort(props.date).dow} ${formatDayShort(props.date).day}`} onClose={props.onClose}>
      <Choice
        label="Type de séance"
        value={type}
        options={TYPES.map((t) => ({ value: t, label: t === 'Running' ? 'Course' : SESSION_LOOK[t].label }))}
        onChange={setType}
      />
      <input
        className="text-input"
        placeholder={DEFAULT_TITLE[type]}
        aria-label="Nom de la séance"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="numgrid" style={{ gridTemplateColumns: type === 'Renfo' ? '1fr' : 'repeat(3, minmax(0, 1fr))' }}>
        <NumField label="Durée prévue" unit="min" value={dur} onChange={setDur} />
        {type !== 'Renfo' && <NumField label="Distance" unit="km" decimal value={km} onChange={setKm} />}
        {type !== 'Renfo' && <NumField label="D+" unit="m" value={dPlus} onChange={setDPlus} />}
      </div>
      <span className="small muted">Tout est facultatif sauf le type.</span>
      <button className="btn btn-primary" type="button" onClick={() => void add(false)}>
        {props.date === todayISO() ? "Ajouter à aujourd'hui" : 'Ajouter au plan'}
      </button>
      {props.date <= todayISO() && (
        <button className="btn btn-secondary" type="button" onClick={() => void add(true)}>
          Déjà faite → débrief
        </button>
      )}
    </Sheet>
  );
}
