import { feuDuJour, weekRings, type Light } from '../lib/coach';
import { todayISO } from '../lib/dates';
import { formatNumber } from '../lib/format';
import { href } from '../lib/router';
import { useCoachData } from '../lib/useCoachData';

const LIGHT: Record<Light, { label: string; bg: string; color: string }> = {
  vert: { label: 'Feu vert', bg: 'var(--grad-teal)', color: 'var(--teal)' },
  orange: { label: 'Feu orange', bg: 'linear-gradient(135deg, #FF8A5C, #FFC56B)', color: '#E8862E' },
  rouge: { label: 'Feu rouge', bg: 'var(--grad-coral)', color: 'var(--coral)' },
};

/** Feu du jour, en petite pastille discrète en haut de l'Accueil (toucher → écran Charge). */
export function FeuPill() {
  const d = useCoachData();
  if (!d) return <span />;
  const f = feuDuJour(d, todayISO());
  const l = f.light ? LIGHT[f.light] : null;
  return (
    <a
      className="feu-pill"
      href={f.light ? href('charge') : href('checkin')}
      aria-label={l ? `${l.label} : ${f.reasons.join(', ')}` : 'Feu du jour : fais ton check-in'}
      title={l ? capitalize(f.reasons.join(' · ')) : undefined}
    >
      <span className="feu-dot" aria-hidden="true" style={{ background: l ? l.bg : 'var(--off-fill)', boxShadow: l ? `0 0 0 3px color-mix(in srgb, ${l.color} 22%, transparent)` : 'none' }} />
      <span style={{ color: l?.color ?? 'var(--muted)' }}>{l ? l.label : 'Feu du jour'}</span>
    </a>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « Cette semaine » : 3 anneaux concentriques (km, D+, renfo) réalisé / prévu. */
export function WeekRingsCard() {
  const d = useCoachData();
  if (!d) return null;
  const r = weekRings(d, todayISO());
  const ratio = (x: { done: number; planned: number }) => (x.planned > 0 ? Math.min(1, x.done / x.planned) : x.done > 0 ? 1 : 0);
  const rings = [
    { r: 58, id: 'g1', from: '#FF5F6D', to: '#FFB36B', f: ratio(r.km) },
    { r: 42, id: 'g2', from: '#1FC8A5', to: '#8BE8C3', f: ratio(r.dPlus) },
    { r: 26, id: 'g3', from: '#7A6BFF', to: '#C6A8FF', f: ratio(r.renfo) },
  ];
  const label = `Semaine : ${formatNumber(r.km.done)} km sur ${formatNumber(r.km.planned)}, ${formatNumber(r.dPlus.done, 0)} m de D+ sur ${formatNumber(r.dPlus.planned, 0)}, ${r.renfo.done} renfo sur ${r.renfo.planned}`;
  return (
    <a className="card" href={href('plan')} style={{ flexDirection: 'row', alignItems: 'center', gap: 18, padding: '14px 20px', textDecoration: 'none' }} aria-label={label}>
      <svg aria-hidden="true" width="100" height="100" viewBox="0 0 140 140" style={{ flexShrink: 0 }}>
        <defs>
          {rings.map((g) => (
            <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={g.from} />
              <stop offset="1" stopColor={g.to} />
            </linearGradient>
          ))}
        </defs>
        <g transform="rotate(-90 70 70)" fill="none" strokeWidth="13" strokeLinecap="round">
          {rings.map((g) => {
            const c = 2 * Math.PI * g.r;
            return (
              <g key={g.id}>
                <circle cx="70" cy="70" r={g.r} stroke="var(--track)" />
                {g.f > 0 && <circle cx="70" cy="70" r={g.r} stroke={`url(#${g.id})`} strokeDasharray={`${Math.max(g.f * c, 1)} ${c}`} style={{ transition: 'stroke-dasharray 400ms ease' }} />}
              </g>
            );
          })}
        </g>
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="eyebrow">Cette semaine</span>
        <span style={{ fontSize: 15 }}>
          <b style={{ fontWeight: 600, color: 'var(--coral)' }}>{formatNumber(r.km.done)}</b> <span className="muted">/ {formatNumber(r.km.planned)} km</span>
        </span>
        <span style={{ fontSize: 15 }}>
          <b style={{ fontWeight: 600, color: 'var(--teal)' }}>{formatNumber(r.dPlus.done, 0)}</b> <span className="muted">/ {formatNumber(r.dPlus.planned, 0)} m D+</span>
        </span>
        <span style={{ fontSize: 15 }}>
          <b style={{ fontWeight: 600, color: 'var(--violet)' }}>{r.renfo.done}</b> <span className="muted">/ {r.renfo.planned} renfo</span>
        </span>
      </div>
    </a>
  );
}
