import type { CheckIn } from '../db/types';
import { addDays, formatDayShort, sleepMinutes } from '../lib/dates';
import { formatDuration, formatNumber } from '../lib/format';
import { href } from '../lib/router';

const DAYS = 14;
const qColor = (q?: number) => (q === undefined ? 'var(--line-off)' : q <= 2 ? '#FF5F6D' : q === 3 ? '#FFB36B' : '#7A6BFF');

/** Évolution des check-ins (14 derniers jours) : sommeil, qualité, forme, moral, douleurs. */
export function WellnessCard({ checkIns, today }: { checkIns: CheckIn[]; today: string }) {
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i - DAYS + 1));
  const byDate = new Map(checkIns.map((c) => [c.date, c]));
  const list = days.map((d) => byDate.get(d)).filter((c): c is CheckIn => !!c);
  const avg = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => x !== undefined);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
  };
  const sleepH = (c?: CheckIn) => (c?.bedTime && c.wakeTime ? sleepMinutes(c.bedTime, c.wakeTime) / 60 : undefined);
  const aSleep = avg(list.map(sleepH));
  const aQ = avg(list.map((c) => c.sleepQuality));
  const aF = avg(list.map((c) => c.forme));
  const aM = avg(list.map((c) => c.moral));
  const pains = list
    .flatMap((c) => c.pains.filter((p) => p.score > 0).map((p) => ({ ...p, date: c.date })))
    .slice(-4)
    .reverse();
  const todayDone = byDate.has(today);

  // Graphique : barre = durée de sommeil (4 h → 10 h), couleur = qualité ; point = forme du matin
  const W = 322;
  const H = 120;
  const slot = W / DAYS;
  const yH = (h: number) => H - 14 - ((Math.min(10, Math.max(4, h)) - 4) / 6) * (H - 30);
  const yF = (f: number) => H - 14 - (f / 10) * (H - 30);
  const formePts = days.map((d, i) => ({ i, f: byDate.get(d)?.forme })).filter((p): p is { i: number; f: number } => p.f !== undefined);

  const tile = (label: string, v: string, sub?: string) => (
    <div className="plan-stat">
      <span className="small muted" style={{ fontSize: 11 }}>
        {label}
      </span>
      <b className="display" style={{ fontSize: 19 }}>
        {v}
      </b>
      {sub && <span className="small muted" style={{ fontSize: 11 }}>{sub}</span>}
    </div>
  );

  return (
    <section className="card" style={{ gap: 12 }}>
      <div className="card-row" style={{ alignItems: 'baseline' }}>
        <span className="eyebrow">Forme & sommeil</span>
        <span className="small muted" style={{ fontSize: 11 }}>
          14 derniers jours · {list.length} check-in{list.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="plan-stats" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {tile('Sommeil', aSleep !== undefined ? formatDuration(aSleep * 60) : '—', 'moyen')}
        {tile('Qualité', aQ !== undefined ? formatNumber(aQ, 1) : '—', '/ 5')}
        {tile('Forme', aF !== undefined ? formatNumber(aF, 1) : '—', '/ 10')}
        {tile('Moral', aM !== undefined ? formatNumber(aM, 1) : '—', '/ 10')}
      </div>
      <svg
        role="img"
        aria-label={`Sommeil et forme sur 14 jours : ${list.map((c) => `${formatDayShort(c.date).dow} ${formatDayShort(c.date).day}, ${sleepH(c) !== undefined ? formatDuration(sleepH(c)! * 60) + ' de sommeil, ' : ''}qualité ${c.sleepQuality ?? '?'} sur 5, forme ${c.forme ?? '?'} sur 10`).join(' ; ') || 'aucun check-in'}`}
        viewBox={`0 0 ${W} ${H + 14}`}
        style={{ width: '100%', height: 'auto' }}
      >
        <line x1="0" x2={W} y1={yH(8)} y2={yH(8)} stroke="var(--track)" strokeDasharray="3 3" />
        <text x={W} y={yH(8) - 3} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="Inter">
          8 h
        </text>
        {days.map((d, i) => {
          const c = byDate.get(d);
          const h = sleepH(c) ?? (c?.sleepQuality !== undefined ? 4 + c.sleepQuality : undefined);
          const x = i * slot + slot * 0.2;
          return (
            <g key={d}>
              {h !== undefined && <rect x={x} y={yH(h)} width={slot * 0.6} height={H - 14 - yH(h)} rx="5" fill={qColor(c?.sleepQuality)} opacity={sleepH(c) === undefined ? 0.45 : 0.85} />}
              <text x={i * slot + slot / 2} y={H + 10} textAnchor="middle" fontSize="9" fill={d === today ? 'var(--ink)' : 'var(--muted)'} fontWeight={d === today ? 700 : 400} fontFamily="Inter">
                {formatDayShort(d).dow.charAt(0)}
              </text>
            </g>
          );
        })}
        {/* La courbe ne relie que des matins qui se suivent (pas de fausse tendance quand il manque des check-ins) */}
        {formePts.slice(1).map((p, k) =>
          p.i - formePts[k].i === 1 ? <line key={p.i} x1={formePts[k].i * slot + slot / 2} y1={yF(formePts[k].f)} x2={p.i * slot + slot / 2} y2={yF(p.f)} stroke="#1FC8A5" strokeWidth="2" strokeLinecap="round" /> : null,
        )}
        {formePts.map((p) => (
          <circle key={p.i} cx={p.i * slot + slot / 2} cy={yF(p.f)} r="3.5" fill="#1FC8A5" stroke="var(--bg)" strokeWidth="1.5" />
        ))}
      </svg>
      <div className="legend">
        <span>
          <i style={{ background: '#7A6BFF' }} />
          bonne nuit
        </span>
        <span>
          <i style={{ background: '#FFB36B' }} />
          moyenne
        </span>
        <span>
          <i style={{ background: '#FF5F6D' }} />
          mauvaise
        </span>
        <span>
          <i style={{ background: '#1FC8A5', borderRadius: '50%' }} />
          forme
        </span>
      </div>
      {pains.length > 0 && (
        <span className="small">
          <b style={{ fontWeight: 600 }}>Douleurs au réveil :</b>{' '}
          {pains.map((p) => `${p.zone} ${p.score}/10 (${formatDayShort(p.date).dow.toLowerCase()} ${formatDayShort(p.date).day})`).join(' · ')}
        </span>
      )}
      <a className="link-btn" href={href('checkin')} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
        {todayDone ? 'Modifier le check-in du jour' : 'Faire le check-in du jour'} →
      </a>
    </section>
  );
}
