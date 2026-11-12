import { useEffect, useRef, useState } from 'react';
import { db, newId } from '../db/db';
import type { CheckIn } from '../db/types';
import { formatWeekday, sleepMinutes, todayISO } from '../lib/dates';
import { formatDuration } from '../lib/format';
import { go, href } from '../lib/router';
import { IconBack } from '../components/Icons';
import { toast } from '../lib/toast';
import { haptic } from '../lib/theme';
import { Segmented, Slider } from '../components/Controls';
import { Choice } from '../components/Choice';
import { PainPicker } from '../components/PainPicker';

const TARGET_BED = '23:00';
const QUALITY_WORDS = ['', 'Très mauvaise', 'Mauvaise', 'Moyenne', 'Bonne', 'Excellente'];

/** À l'écran, tous les champs sont remplis (valeurs par défaut si besoin). */
type Draft = Omit<CheckIn, 'id' | 'date' | 'bedTime' | 'wakeTime' | 'moral' | 'location' | 'sleepQuality' | 'forme'> & {
  sleepQuality: number;
  forme: number;
  id?: string;
  bedTime: string;
  wakeTime: string;
  moral: number;
  location: string;
};

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
        setDraft({
          ...mine,
          bedTime: mine.bedTime ?? TARGET_BED,
          wakeTime: mine.wakeTime ?? '07:00',
          moral: mine.moral ?? 5,
          sleepQuality: mine.sleepQuality ?? 3,
          forme: mine.forme ?? 5,
          location: mine.location || 'Nice',
        });
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
        location: last?.location || 'Nice',
        availableMin: undefined,
      });
    })();
  }, [today]);

  if (!draft) return <main className="screen" />;
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  async function save() {
    if (!draft) return;
    const record: CheckIn = { ...draft, id: draft.id ?? newId(), date: today, source: 'appli' };
    await db.checkIns.put(record);
    haptic(20);
    toast(existing ? 'Check-in modifié ✓' : 'Check-in enregistré ✓');
    go('accueil');
  }

  return (
    <main className="screen">
      <div className="screen-head">
        <a className="icon-btn" href={href('accueil')} aria-label="Retour à l'accueil">
          <IconBack />
        </a>
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
// Les deux poignées (coucher, lever) se font glisser au doigt, par pas de 5 minutes.
const START = 20 * 60; // 20h
const SPAN = 14 * 60; // jusqu'à 10h
const W = 318;
const STEP = 5;
const MIN_SLEEP = 30;

/** « 23:40 » → minutes depuis 20h (bornées à la frise) */
function offsetOf(t: string): number {
  const [h, m] = t.split(':').map(Number);
  let min = h * 60 + m - START;
  if (min < 0) min += 24 * 60;
  return Math.max(0, Math.min(SPAN, min));
}
const xOf = (offset: number) => (offset / SPAN) * W;
function timeOf(offset: number): string {
  const t = (START + offset) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function SleepCard(props: { bedTime: string; wakeTime: string; onChange: (bed: string, wake: string) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<'bed' | 'wake' | null>(null);
  const dur = sleepMinutes(props.bedTime, props.wakeTime);
  const bed = offsetOf(props.bedTime);
  const wake = Math.max(bed + STEP, offsetOf(props.wakeTime));
  const xt = xOf(offsetOf(TARGET_BED));
  const late = sleepMinutes(TARGET_BED, props.bedTime);
  const lateMin = late < 12 * 60 && late !== 24 * 60 ? late : 0;
  const ticks: [string, string][] = [
    ['20h', '20:00'],
    ['23h', '23:00'],
    ['3h', '03:00'],
    ['7h', '07:00'],
    ['10h', '10:00'],
  ];

  /** Déplace une poignée à « offset » minutes après 20h (sans croiser l'autre). */
  const set = (which: 'bed' | 'wake', offset: number) => {
    const o = Math.round(Math.max(0, Math.min(SPAN, offset)) / STEP) * STEP;
    if (which === 'bed') {
      const b = Math.min(o, wake - MIN_SLEEP);
      if (timeOf(b) !== props.bedTime) props.onChange(timeOf(b), props.wakeTime);
    } else {
      const w = Math.max(o, bed + MIN_SLEEP);
      if (timeOf(w) !== props.wakeTime) props.onChange(props.bedTime, timeOf(w));
    }
  };
  const offsetAt = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const vbX = -14 + ((clientX - r.left) / r.width) * (W + 28);
    return (vbX / W) * SPAN;
  };

  const handle = (which: 'bed' | 'wake', offset: number, label: string) => (
    <g
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={SPAN}
      aria-valuenow={offset}
      aria-valuetext={timeOf(offset)}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
        if (!d) return;
        e.preventDefault();
        set(which, offset + d * (e.shiftKey ? 30 : STEP));
      }}
      className="sleep-handle"
    >
      <circle cx={xOf(offset)} cy="27" r="24" fill="transparent" />
      <circle cx={xOf(offset)} cy="27" r={drag === which ? 13 : 11} fill="#fff" stroke={drag === which ? '#7A6BFF' : 'rgba(30,27,46,.14)'} strokeWidth={drag === which ? 3 : 1.5} style={{ transition: 'r 120ms' }} />
      {drag === which && (
        <g>
          <rect x={xOf(offset) - 22} y="-8" width="44" height="18" rx="9" fill="var(--nav-on)" />
          <text x={xOf(offset)} y="5" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--nav-on-ink)" fontFamily="Inter">
            {timeOf(offset)}
          </text>
        </g>
      )}
    </g>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="card-row" style={{ alignItems: 'baseline' }}>
        <span className="eyebrow">Sommeil</span>
        <span className="display" style={{ fontSize: 28 }}>
          {formatDuration(dur)}
        </span>
      </div>
      <svg
        ref={svgRef}
        data-noswipe
        aria-label={`Nuit de ${props.bedTime} à ${props.wakeTime}. Fais glisser les poignées pour régler le coucher et le lever.`}
        viewBox={`-14 -10 ${W + 28} 62`}
        style={{ width: '100%', height: 'auto', overflow: 'visible', touchAction: 'none', cursor: drag ? 'grabbing' : 'pointer' }}
        onPointerDown={(e) => {
          const o = offsetAt(e.clientX);
          const which = Math.abs(o - bed) <= Math.abs(o - wake) ? 'bed' : 'wake';
          (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          setDrag(which);
          set(which, o);
        }}
        onPointerMove={(e) => drag && set(drag, offsetAt(e.clientX))}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      >
        <defs>
          <linearGradient id="nuit" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7A6BFF" />
            <stop offset="1" stopColor="#C6A8FF" />
          </linearGradient>
        </defs>
        <rect x="0" y="22" width={W} height="10" rx="5" fill="var(--track)" />
        <rect x={xOf(bed)} y="22" width={xOf(wake) - xOf(bed)} height="10" rx="5" fill="url(#nuit)" />
        <line x1={xt} y1="14" x2={xt} y2="40" stroke="#1FC8A5" strokeWidth="2" strokeLinecap="round" />
        {ticks.map(([label, t]) => (
          <text
            key={label}
            x={xOf(offsetOf(t))}
            y="51"
            fontSize="10"
            textAnchor="middle"
            fill={t === TARGET_BED ? 'var(--teal)' : 'var(--muted)'}
            fontWeight={t === TARGET_BED ? 600 : 400}
            fontFamily="Inter"
          >
            {label}
          </text>
        ))}
        {handle('bed', bed, 'Heure de coucher')}
        {handle('wake', wake, 'Heure de lever')}
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
      {lateMin > 0 && <span className="small muted">Couché {formatDuration(lateMin)} après la cible de 23h.</span>}
    </div>
  );
}
