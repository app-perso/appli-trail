import { useState } from 'react';
import { db } from '../db/db';
import { doneValue, plannedValue, type Metric, type WeekStat } from '../lib/analysis';
import { recentSeries, recoveryAdvice } from '../lib/coach';
import { addDays, mondayOf, todayISO } from '../lib/dates';
import { formatDuration, formatNumber } from '../lib/format';
import { href } from '../lib/router';
import { useCoachData } from '../lib/useCoachData';
import { useLive } from '../lib/useLive';
import { Segmented } from '../components/Controls';
import { AlertCard } from '../components/AlertCard';
import { IconBack } from '../components/Icons';

const METRICS: { value: Metric; label: string; title: string }[] = [
  { value: 'km', label: 'km', title: 'km à pied par semaine' },
  { value: 'dPlus', label: 'D+', title: 'D+ par semaine (m)' },
  { value: 'dMinus', label: 'D−', title: 'D− par semaine (m)' },
  { value: 'min', label: 'Temps', title: 'Temps d’entraînement par semaine' },
];

const fmt = (m: Metric, v: number) => (m === 'min' ? formatDuration(v) : formatNumber(v, 0));
const MAX_WEEKS = 8;

export function Progression() {
  const d = useCoachData();
  const nextRace = useLive(() => db.races.where('date').aboveOrEqual(todayISO()).first());
  const [metric, setMetric] = useState<Metric>('km');
  const today = todayISO();
  if (!d) return <main className="screen" />;

  // Semaines affichées : jusqu'à la semaine prochaine, les 8 dernières au plus
  const all = recentSeries(d, today, 16).filter((w) => w.monday <= addDays(mondayOf(today), 7));
  const firstUseful = all.findIndex((w) => w.totals.plannedSessions > 0 || w.totals.doneSessions > 0);
  const weeks = all.slice(Math.max(firstUseful, 0)).slice(-MAX_WEEKS);
  const info = METRICS.find((m) => m.value === metric)!;
  const alert = corridorMessage(weeks, metric);
  const rec = recoveryAdvice(all);

  return (
    <main className="screen">
      <div className="screen-head">
        <a className="icon-btn" href={href('charge')} aria-label="Retour à la charge">
          <IconBack />
        </a>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="small muted">
            {nextRace ? `Prépa ${nextRace.shortName} · ` : ''}
            {weeks.length} semaine{weeks.length > 1 ? 's' : ''}
          </span>
          <h1 className="screen-title" style={{ fontSize: 26 }}>
            Progression
          </h1>
        </div>
      </div>

      <Segmented label="Indicateur" value={metric} options={METRICS.map(({ value, label }) => ({ value, label }))} onChange={setMetric} />

      <section className="card" style={{ gap: 8, padding: '16px 18px 12px' }}>
        <div className="card-row" style={{ alignItems: 'baseline' }}>
          <span className="eyebrow">{info.title}</span>
          <span className="small muted" style={{ fontSize: 12 }}>
            couloir +15 %
          </span>
        </div>
        {weeks.length ? <WeekChart weeks={weeks} metric={metric} /> : <span className="small muted">Pas encore de semaines enregistrées.</span>}
        <div className="legend">
          <span>
            <i style={{ background: '#1FC8A5' }} />
            dans le couloir
          </span>
          <span>
            <i style={{ background: '#FF5F6D' }} />
            au-dessus
          </span>
          <span>
            <i style={{ border: '1.5px dashed var(--muted)' }} />
            prévu
          </span>
          <span>
            <i style={{ background: 'var(--off-fill)' }} />
            sans débrief
          </span>
        </div>
      </section>

      {alert && <AlertCard alert={alert} />}
      {rec && <AlertCard alert={rec} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="tile">
          <span className="t-label">Montée max</span>
          <span className="display" style={{ fontSize: 20 }}>
            +10 à 15 %
          </span>
          <span className="t-sub">par semaine</span>
        </div>
        <div className="tile">
          <span className="t-label">Récupération</span>
          <span className="display" style={{ fontSize: 20 }}>
            1 sur 4
          </span>
          <span className="t-sub">semaine allégée</span>
        </div>
      </div>
    </main>
  );
}

/** Message du couloir pour la semaine en cours / prochaine (ou la dernière terminée). */
function corridorMessage(weeks: WeekStat[], m: Metric) {
  const name = (w: WeekStat) => w.label ?? `Sem. du ${Number(w.monday.slice(8))}/${Number(w.monday.slice(5, 7))}`;
  const unit = m === 'km' ? ' km' : m === 'min' ? '' : ' m';
  for (const w of weeks.filter((x) => x.current || x.future)) {
    const p = plannedValue(w.totals, m);
    const c = w.ceiling[m];
    if (p !== null && c !== undefined && p > c * 1.02)
      return { level: 'warn' as const, icon: 'couloir' as const, title: `${name(w)} : ${fmt(m, p)}${unit} prévus, plafond ${fmt(m, c)}${unit}`, text: 'Au-dessus du couloir de sécurité (+15 % sur la moyenne des 3 semaines précédentes). Raccourcis une sortie ou garde-la très facile.' };
  }
  const last = [...weeks].reverse().find((w) => w.complete && !w.unknown);
  if (last) {
    const v = doneValue(last.totals, m);
    const c = last.ceiling[m];
    if (v !== null && c !== undefined && v > c)
      return { level: 'info' as const, icon: 'couloir' as const, title: `${name(last)} : ${fmt(m, v)}${unit}, plafond ${fmt(m, c)}${unit}`, text: 'Semaine au-dessus du couloir. La suivante doit rester stable ou baisser.' };
    if (v !== null && c !== undefined)
      return { level: 'ok' as const, icon: 'couloir' as const, title: 'Progression dans le couloir', text: `${name(last)} : ${fmt(m, v)}${unit} pour un plafond de ${fmt(m, c)}${unit}. Continue comme ça.` };
  }
  return null;
}

function WeekChart({ weeks, metric }: { weeks: WeekStat[]; metric: Metric }) {
  const W = 322;
  const base = 210;
  const top = 30;
  const n = weeks.length;
  const slot = W / n;
  const bw = Math.min(34, slot * 0.64);
  const values = weeks.map((w) => ({
    done: w.unknown ? null : doneValue(w.totals, metric),
    planned: w.complete ? null : plannedValue(w.totals, metric),
    ceiling: w.ceiling[metric],
  }));
  const max = Math.max(1, ...values.flatMap((v) => [v.done ?? 0, v.planned ?? 0, v.ceiling ?? 0])) * 1.08;
  const y = (v: number) => base - (v / max) * (base - top);

  // Bande du couloir : marches à la hauteur du plafond de chaque semaine
  let band = '';
  let line = '';
  values.forEach((v, i) => {
    if (v.ceiling === undefined) return;
    const x0 = i * slot;
    const x1 = (i + 1) * slot;
    const yc = y(v.ceiling).toFixed(1);
    const start = !line || values[i - 1]?.ceiling === undefined;
    line += `${start ? 'M' : 'L'}${x0.toFixed(1)} ${yc} L${x1.toFixed(1)} ${yc} `;
    band += `M${x0.toFixed(1)} ${base} L${x0.toFixed(1)} ${yc} L${x1.toFixed(1)} ${yc} L${x1.toFixed(1)} ${base} Z `;
  });

  const desc = weeks
    .map((w, i) => {
      const v = values[i];
      const lab = w.label ?? w.monday.slice(5);
      if (!w.complete) return `${lab} ${v.done ? fmt(metric, v.done) + ' faits' : ''}${v.planned ? ` ${fmt(metric, v.planned)} prévus` : ''}`.trim();
      if (v.done === null) return `${lab} sans débrief`;
      return `${lab} ${fmt(metric, v.done)}${v.ceiling !== undefined && v.done > v.ceiling ? ' au-dessus du couloir' : ''}`;
    })
    .join(', ');

  return (
    <svg role="img" aria-label={desc} viewBox={`0 0 ${W} 240`} style={{ width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="pOk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1FC8A5" />
          <stop offset="1" stopColor="#8BE8C3" />
        </linearGradient>
        <linearGradient id="pHi" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF5F6D" />
          <stop offset="1" stopColor="#FFB36B" />
        </linearGradient>
        <linearGradient id="pBand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1FC8A5" stopOpacity=".22" />
          <stop offset="1" stopColor="#1FC8A5" stopOpacity=".02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={W} y1={base - f * (base - top)} y2={base - f * (base - top)} stroke="var(--track)" />
      ))}
      <line x1="0" y1={base} x2={W} y2={base} stroke="var(--track)" strokeWidth="1.5" />
      {band && <path d={band} fill="url(#pBand)" />}
      {line && <path d={line} fill="none" stroke="#1FC8A5" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />}
      {weeks.map((w, i) => {
        const v = values[i];
        const cx = slot * i + slot / 2;
        const x = cx - bw / 2;
        const over = (val: number | null) => val !== null && v.ceiling !== undefined && val > v.ceiling * (w.complete ? 1 : 1.02);
        const label = w.label ?? `${Number(w.monday.slice(8))}/${Number(w.monday.slice(5, 7))}`;
        const showPlanned = v.planned !== null && v.planned > (v.done ?? 0);
        const topVal = Math.max(v.done ?? 0, showPlanned ? v.planned! : 0);
        return (
          <g key={w.monday}>
            {showPlanned && (
              <rect x={x} y={y(v.planned!)} width={bw} height={Math.max(base - y(v.planned!), 4)} rx="12" fill={over(v.planned) ? 'rgba(255,95,109,0.10)' : 'rgba(31,200,165,0.10)'} stroke={over(v.planned) ? '#FF5F6D' : '#1FC8A5'} strokeWidth="2" strokeDasharray="5 4" />
            )}
            {v.done !== null && v.done > 0 && <rect x={x} y={y(v.done)} width={bw} height={Math.max(base - y(v.done), 4)} rx="12" fill={over(v.done) ? 'url(#pHi)' : 'url(#pOk)'} />}
            {w.unknown && <rect x={x} y={base - 40} width={bw} height="40" rx="12" fill="var(--off-fill)" stroke="var(--line-off)" strokeDasharray="3 3" />}
            <text x={cx} y={w.unknown ? base - 48 : y(topVal) - 8} textAnchor="middle" fontSize="12" fontWeight="700" fontFamily="Inter" fill={over(v.done) || (showPlanned && over(v.planned)) ? 'var(--coral)' : w.unknown ? 'var(--muted)' : 'var(--ink)'}>
              {w.unknown ? '?' : topVal > 0 ? fmt(metric, topVal) : v.done === null && metric === 'dMinus' ? '?' : ''}
            </text>
            <text x={cx} y="230" textAnchor="middle" fontSize="11" fontFamily="Inter" fontWeight={w.current ? 700 : 400} fill={w.current ? 'var(--ink)' : 'var(--muted)'}>
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
