import { useEffect, useState } from 'react';
import { db, newId } from '../db/db';
import type { CheckIn } from '../db/types';
import { formatWeekday, sleepMinutes, todayISO } from '../lib/dates';
import { formatDuration } from '../lib/format';
import { go } from '../lib/router';
import { toast } from '../lib/toast';
import { haptic } from '../lib/theme';
import { Segmented, Slider } from '../components/Controls';
import { Choice } from '../components/Choice';
import { PainPicker } from '../components/PainPicker';

const TARGET_BED = '23:00';
const QUALITY_WORDS = ['', 'Très mauvaise', 'Mauvaise', 'Moyenne', 'Bonne', 'Excellente'];

type Draft = Omit<CheckIn, 'id' | 'date'> & { id?: string };

export function Checkin() {
  const today = todayISO();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [existing, setExisting] = useState(false);

  // Charge le check-in du jour s'il existe, sinon reprend les habitudes du dernier
  useEffect(() => {
    void (async () => {
      const mine = await db.checkIns.where('date').equals(today).first();
      if (mine) {
        setExisting(true);
        setDraft(mine);
        return;
      }
      const last = await db.checkIns.orderBy('date').last();
      setDraft({
        bedTime: last?.bedTime ?? TARGET_BED,
        wakeTime: last?.wakeTime ?? '07:00',
        sleepQuality: 3,
        forme: 5,
        moral: 5,
        // Les douleurs d'hier sont reproposées pour les réévaluer
        pains: last?.pains.filter((p) => p.score > 0) ?? [],
        location: last?.location ?? 'Nice',
        availableMin: undefined,
      });
    })();
  }, [today]);

  if (!draft) return <main className="screen" />;
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  async function save() {
    if (!draft) return;
    const record: CheckIn = { ...draft, id: draft.id ?? newId(), date: today };
    await db.checkIns.put(record);
    haptic(20);
    toast(existing ? 'Check-in modifié ✓' : 'Check-in enregistré ✓');
    go('accueil');
  }

  return (
    <main className="screen">
      <div className="screen-head">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h1 className="screen-title">Check-in</h1>
          <span className="small muted">
            Ce matin · {formatWeekday(today)}
            {existing && ' · déjà rempli'}
          </span>
        </div>
      </div>

      <section className="card" aria-label="Sommeil">
        <SleepCard
          bedTime={draft.bedTime}
          wakeTime={draft.wakeTime}
          onChange={(bedTime, wakeTime) => set({ bedTime, wakeTime })}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="card-row">
            <span style={{ fontSize: 14 }}>Qualité ressentie</span>
            <span className="small muted">{QUALITY_WORDS[draft.sleepQuality]}</span>
          </div>
          <Choice
            label="Qualité du sommeil"
            variant="violet"
            value={draft.sleepQuality}
            options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
            onChange={(sleepQuality) => set({ sleepQuality })}
          />
        </div>
      </section>

      <section className="card" aria-label="Forme et douleurs">
        <Slider label="Forme physique" value={draft.forme} onChange={(forme) => set({ forme })} color="teal" suffix="/ 10" />
        <Slider label="Moral" value={draft.moral} onChange={(moral) => set({ moral })} color="violet" suffix="/ 10" />
        <PainPicker value={draft.pains} onChange={(pains) => set({ pains })} moment="matin" />
      </section>

      <section className="card" aria-label="Lieu et temps disponible">
        <Segmented
          label="Où es-tu aujourd'hui ?"
          value={draft.location}
          options={[
            { value: 'Nice', label: 'Nice' },
            { value: 'Saint-Cloud', label: 'Saint-Cloud' },
          ]}
          onChange={(location) => set({ location })}
        />
        <span style={{ fontSize: 14 }}>Temps dispo pour courir</span>
        <Choice
          label="Temps disponible"
          value={draft.availableMin}
          options={[
            { value: 45, label: "45'" },
            { value: 60, label: '1h' },
            { value: 120, label: '2h' },
            { value: 180, label: '3h +' },
          ]}
          onChange={(availableMin) => set({ availableMin })}
        />
      </section>

      <button className="btn btn-primary" type="button" onClick={() => void save()} style={{ marginTop: 4 }}>
        {existing ? 'Mettre à jour mon check-in' : 'Valider mon check-in'}
      </button>
    </main>
  );
}

// ---------- Frise de la nuit : de 20h à 10h, avec la cible de coucher à 23h ----------
const START = 20 * 60; // 20h
const SPAN = 14 * 60; // jusqu'à 10h
const W = 318;

function toX(t: string) {
  const [h, m] = t.split(':').map(Number);
  let min = h * 60 + m - START;
  if (min < 0) min += 24 * 60;
  return Math.max(0, Math.min(W, (min / SPAN) * W));
}

function SleepCard(props: { bedTime: string; wakeTime: string; onChange: (bed: string, wake: string) => void }) {
  const dur = sleepMinutes(props.bedTime, props.wakeTime);
  const x1 = toX(props.bedTime);
  const x2 = Math.max(x1 + 10, toX(props.wakeTime));
  const xt = toX(TARGET_BED);
  const late = sleepMinutes(TARGET_BED, props.bedTime);
  const lateMin = late < 12 * 60 && late !== 24 * 60 ? late : 0;
  const ticks: [string, string][] = [
    ['20h', '20:00'],
    ['23h', '23:00'],
    ['3h', '03:00'],
    ['7h', '07:00'],
    ['10h', '10:00'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="card-row" style={{ alignItems: 'baseline' }}>
        <span className="eyebrow">Sommeil</span>
        <span className="display" style={{ fontSize: 28 }}>
          {formatDuration(dur)}
        </span>
      </div>
      <svg
        role="img"
        aria-label={`Nuit de ${props.bedTime} à ${props.wakeTime}`}
        viewBox={`-6 0 ${W + 12} 42`}
        style={{ width: '100%', height: 'auto', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="nuit" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7A6BFF" />
            <stop offset="1" stopColor="#C6A8FF" />
          </linearGradient>
        </defs>
        <rect x="0" y="12" width={W} height="10" rx="5" fill="var(--track)" />
        <rect x={x1} y="12" width={x2 - x1} height="10" rx="5" fill="url(#nuit)" />
        <line x1={xt} y1="5" x2={xt} y2="29" stroke="#1FC8A5" strokeWidth="2" strokeLinecap="round" />
        <circle cx={x1} cy="17" r="9" fill="#fff" stroke="rgba(30,27,46,.10)" />
        <circle cx={x2} cy="17" r="9" fill="#fff" stroke="rgba(30,27,46,.10)" />
        {ticks.map(([label, t]) => (
          <text
            key={label}
            x={toX(t)}
            y="40"
            fontSize="10"
            textAnchor="middle"
            fill={t === TARGET_BED ? 'var(--teal)' : 'var(--muted)'}
            fontWeight={t === TARGET_BED ? 600 : 400}
            fontFamily="Inter"
          >
            {label}
          </text>
        ))}
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
        <label className="time-box">
          <span className="small muted">Coucher</span>
          <input type="time" value={props.bedTime} onChange={(e) => e.target.value && props.onChange(e.target.value, props.wakeTime)} />
        </label>
        <label className="time-box">
          <span className="small muted">Lever</span>
          <input type="time" value={props.wakeTime} onChange={(e) => e.target.value && props.onChange(props.bedTime, e.target.value)} />
        </label>
      </div>
      {lateMin > 0 && (
        <span className="small muted">
          Couché {formatDuration(lateMin)} après la cible de 23h.
        </span>
      )}
    </div>
  );
}
