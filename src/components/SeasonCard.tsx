import type { Race } from '../db/types';
import { kmEffort } from '../lib/calc';
import { daysUntil } from '../lib/dates';
import { href } from '../lib/router';
import { haptic } from '../lib/theme';
import { mountainProfile } from '../lib/mountainProfile';

const W = 342;
const H = 190;
const BASE = 156;
const X0 = 10;
const X1 = 334;

/**
 * « Ma saison » : chaque course à venir est un sommet, placé selon sa date,
 * de hauteur proportionnelle à son km-effort. Toucher un sommet l'affiche en haut de l'écran.
 */
export function SeasonCard(props: { races: Race[]; selectedId?: string; today: string; onPick: (id: string) => void }) {
  const races = props.races;
  if (!races.length) return null;
  const span = Math.max(30, daysUntil(races[races.length - 1].date, new Date(props.today + 'T12:00')) * 1.03);
  const xOf = (date: string) => X0 + (daysUntil(date, new Date(props.today + 'T12:00')) / span) * (X1 - 6 - X0);
  const kes = races.map((r) => kmEffort(r.distanceKm, r.elevationGain));
  const scale = Math.min(0.95, 118 / Math.max(...kes));
  const peaks = races.map((r, i) => {
    const x = xOf(r.date);
    const near = races.some((o, j) => j !== i && Math.abs(xOf(o.date) - x) < 26);
    return { x, h: Math.max(14, kes[i] * scale), sig: near ? 9 : 14 + kes[i] * 0.09 };
  });
  const { lineD, fillD, elev } = mountainProfile(peaks, X0, X1, BASE);
  const sel = races.findIndex((r) => r.id === props.selectedId);
  const selX = sel >= 0 ? peaks[sel].x : X0;

  // Étiquettes : au-dessus du sommet, décalées si elles se chevauchent
  const pills: { left: number; top: number; w: number }[] = [];
  races.forEach((r, i) => {
    const w = (r.isMain ? 20 : 0) + r.shortName.length * 6.6 + 22;
    const left = Math.min(W - w, Math.max(0, peaks[i].x - w / 2));
    let top = elev(peaks[i].x) - 40;
    for (const p of pills) {
      const overlapX = left < p.left + p.w + 4 && left + w + 4 > p.left;
      if (overlapX && Math.abs(top - p.top) < 30) top = p.top - 30 >= -6 ? p.top - 30 : p.top + 30;
    }
    pills.push({ left, top, w });
  });

  // Repères de mois
  const months: { x: number; label: string }[] = [];
  const end = races[races.length - 1].date;
  for (let d = props.today.slice(0, 8) + '01'; d <= end; d = addMonth(d)) {
    if (d <= props.today) continue;
    const x = xOf(d);
    if (x - (months[months.length - 1]?.x ?? X0) < 34) continue;
    months.push({ x, label: new Date(d + 'T12:00').toLocaleDateString('fr-FR', { month: 'short' }) });
  }

  const desc = `Ma saison : ${races.map((r) => `${r.shortName} dans ${daysUntil(r.date, new Date(props.today + 'T12:00'))} jours, ${Math.round(kmEffort(r.distanceKm, r.elevationGain))} km-effort`).join(' ; ')}`;

  return (
    <section className="card" style={{ padding: '14px 8px 6px', gap: 6 }} aria-label="Ma saison">
      <div className="card-row" style={{ padding: '0 10px 0 12px' }}>
        <span className="eyebrow">Ma saison</span>
        <a className="link-btn" href={href('courses')} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          Toutes mes courses →
        </a>
      </div>
      <div style={{ position: 'relative', width: '100%', aspectRatio: `${W} / ${H}`, marginTop: 6 }}>
        <svg role="img" aria-label={desc} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
          <defs>
            <linearGradient id="sFillOff" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--off-fill)" />
              <stop offset="1" stopColor="var(--off-fill)" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="sFillOn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FF6B6B" stopOpacity=".45" />
              <stop offset="1" stopColor="#FFB36B" stopOpacity=".05" />
            </linearGradient>
            <linearGradient id="sLineOn" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#FFB36B" />
              <stop offset="1" stopColor="#FF5F6D" />
            </linearGradient>
            <clipPath id="sDone">
              <rect x="0" y="-40" width={selX + 2} height="260" />
            </clipPath>
          </defs>
          <line x1={X0} y1="56" x2={X1} y2="56" stroke="var(--track)" />
          <line x1={X0} y1="106" x2={X1} y2="106" stroke="var(--track)" />
          <line x1={X0} y1={BASE} x2={X1} y2={BASE} stroke="var(--line-off)" strokeOpacity=".6" />
          <path d={fillD} fill="url(#sFillOff)" />
          <path d={fillD} fill="url(#sFillOn)" clipPath="url(#sDone)" style={{ transition: 'all 250ms' }} />
          <path d={lineD} fill="none" stroke="var(--line-off)" strokeWidth="2" strokeLinejoin="round" />
          <path d={lineD} fill="none" stroke="url(#sLineOn)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#sDone)" />
          {peaks.map((p, i) => {
            const y = elev(p.x);
            const on = i === sel;
            return (
              <g key={races[i].id}>
                <line x1={p.x} y1={y + 8} x2={p.x} y2={BASE} stroke="var(--line-off)" strokeDasharray="2 3" />
                <circle cx={p.x} cy={y} r={on ? 7 : 5} fill={on ? '#FF5F6D' : 'var(--bg)'} stroke={on ? '#fff' : 'var(--line-off)'} strokeWidth="2.5" />
              </g>
            );
          })}
          <circle cx={X0} cy={elev(X0)} r="5" fill="var(--ink)" />
          <text x="4" y="174" fontSize="10" fontWeight="600" fill="var(--ink)" fontFamily="Inter">
            Auj.
          </text>
          {months.map((m) => (
            <text key={m.x} x={m.x} y="174" fontSize="10" fill="var(--muted)" fontFamily="Inter" textAnchor="middle">
              {m.label}
            </text>
          ))}
        </svg>
        {races.map((r, i) => {
          const on = i === sel;
          const p = pills[i];
          return (
            <button
              key={r.id}
              type="button"
              className="peak-pill"
              aria-pressed={on}
              aria-label={r.name}
              onClick={() => {
                haptic();
                props.onPick(r.id);
              }}
              style={{ left: `${(p.left / W) * 100}%`, top: `${((p.top - 9) / H) * 100}%` }}
            >
              <span className={on ? 'on' : undefined}>
                {r.isMain ? '🏁 ' : ''}
                {r.shortName}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function addMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

