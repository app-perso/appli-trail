import { alerts, currentRatio, dayBars, weekTiles, type Tile } from '../lib/coach';
import { formatDayShort, mondayOf, todayISO } from '../lib/dates';
import { formatNumber } from '../lib/format';
import { href } from '../lib/router';
import { useCoachData } from '../lib/useCoachData';
import { AlertCard } from '../components/AlertCard';
import { WellnessCard } from '../components/WellnessCard';

const ZONE_LABEL = { bas: 'Charge basse', équilibré: 'Équilibré', attention: 'Attention', risque: 'Risque' } as const;
const ZONE_COLOR = { bas: 'var(--violet)', équilibré: 'var(--teal)', attention: '#E8862E', risque: 'var(--coral)' } as const;

// Jauge : de 0,6 à 1,8 sur 318 px (repères 0,8 · 1,3 · 1,5 comme sur la maquette)
const G_MIN = 0.6;
const G_MAX = 1.8;
const gx = (r: number) => ((Math.min(G_MAX, Math.max(G_MIN, r)) - G_MIN) / (G_MAX - G_MIN)) * 318;

export function Charge() {
  const d = useCoachData();
  const today = todayISO();
  if (!d) return <main className="screen" />;

  const r = currentRatio(d, today);
  const tiles = weekTiles(d, today);
  const bars = dayBars(d, today);
  const list = alerts(d, today);
  const monday = mondayOf(today);
  const mondayLabel = new Date(monday + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  return (
    <main className="screen">
      <div className="screen-head" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <span className="small muted" style={{ fontWeight: 600 }}>
            Semaine du {mondayLabel}
          </span>
          <h1 className="screen-title" style={{ fontSize: 30 }}>
            Charge
          </h1>
        </div>
        <a className="link-btn" href={href('progression')} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          Progression →
        </a>
      </div>

      {/* Ratio de charge */}
      <section className="card" style={{ gap: 10 }}>
        <div className="card-row" style={{ alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="eyebrow">Ratio de charge</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: r.zone ? ZONE_COLOR[r.zone] : 'var(--muted)' }}>
              {r.zone ? ZONE_LABEL[r.zone] : 'Pas encore calculable'}
            </span>
          </div>
          <span className="display" style={{ fontSize: 48, lineHeight: 0.9 }}>
            {r.ratio !== undefined ? formatNumber(r.ratio, 2) : '—'}
          </span>
        </div>
        <svg role="img" aria-label={r.ratio !== undefined ? `Ratio ${formatNumber(r.ratio, 2)}, zone ${r.zone}` : 'Ratio non calculé'} viewBox="-12 0 342 44" style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
          <defs>
            <linearGradient id="risk" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#C9C0F2" />
              <stop offset=".17" stopColor="#8BE8C3" />
              <stop offset=".5" stopColor="#1FC8A5" />
              <stop offset=".62" stopColor="#FFB36B" />
              <stop offset=".8" stopColor="#FF8A5C" />
              <stop offset="1" stopColor="#FF5F6D" />
            </linearGradient>
          </defs>
          <rect x="0" y="12" width="318" height="10" rx="5" fill="url(#risk)" opacity={r.ratio === undefined ? 0.35 : 1} />
          {r.ratio !== undefined && <circle cx={gx(r.ratio)} cy="17" r="11" fill="#fff" stroke="var(--ink)" strokeWidth="3" />}
          {[0.8, 1.3, 1.5].map((v) => (
            <text key={v} x={gx(v)} y="40" fontSize="10" textAnchor="middle" fill="var(--muted)" fontFamily="Inter">
              {formatNumber(v, 1)}
            </text>
          ))}
          <text x="300" y="40" fontSize="10" textAnchor="middle" fill="var(--coral)" fontWeight="600" fontFamily="Inter">
            risque
          </text>
        </svg>
        <span className="small muted" style={{ fontSize: 12 }}>
          {r.ratio !== undefined
            ? '7 derniers jours comparés à tes 4 dernières semaines'
            : r.stale
              ? `${r.missing} séance${r.missing > 1 ? 's' : ''} des 7 derniers jours sans débrief : fais-les pour calculer ta charge.`
              : 'Il faut 4 semaines de séances enregistrées pour calculer le ratio.'}
        </span>
      </section>

      {/* Tuiles de la semaine */}
      <div className="tiles3">
        <TileView label="km-effort" t={tiles.keff} unit="" />
        <TileView label="D+" t={tiles.dPlus} unit=" m" accent="var(--teal)" />
        <TileView label="D−" t={tiles.dMinus} unit=" m" />
      </div>

      {/* Jour par jour */}
      <section className="card" style={{ gap: 6, padding: '14px 18px 12px' }}>
        <div className="card-row" style={{ alignItems: 'baseline' }}>
          <span className="eyebrow">Jour par jour</span>
          <span className="small muted" style={{ fontSize: 11 }}>
            km-effort
          </span>
        </div>
        <DayChart bars={bars} today={today} />
        <div className="legend">
          <span>
            <i style={{ background: '#1FC8A5' }} />
            fait
          </span>
          <span>
            <i style={{ border: '1.5px dashed #1FC8A5' }} />
            prévu
          </span>
          <span>
            <i style={{ background: '#FF5F6D' }} />
            grosse journée
          </span>
          <span>
            <i style={{ background: '#7A6BFF', borderRadius: '50%' }} />
            renfo
          </span>
        </div>
      </section>

      {/* Alertes */}
      {list.length ? (
        list.map((a) => <AlertCard key={a.id} alert={a} />)
      ) : (
        <AlertCard alert={{ level: 'ok', icon: 'charge', title: 'Tout est sous contrôle', text: 'Pas d’alerte de charge, de descente ou de forme en ce moment.' }} />
      )}

      <WellnessCard checkIns={d.checkIns} today={today} />
    </main>
  );
}

function TileView({ label, t, unit, accent }: { label: string; t: Tile; unit: string; accent?: string }) {
  const sub =
    t.value === null
      ? 'inconnu'
      : t.high && t.diff !== null
        ? `+${formatNumber(t.diff, 0)} %`
        : t.avg !== null
          ? `moy. ${formatNumber(t.avg, 0)}${unit}`
          : 'pas de moyenne';
  return (
    <div className={`tile${t.high ? ' hot' : ''}`}>
      <span className="t-label">{label}</span>
      <span className="display" style={{ fontSize: 24, color: !t.high && accent ? accent : undefined }}>
        {t.value === null ? '—' : formatNumber(t.value, 0)}
      </span>
      <span className="t-sub" style={{ fontWeight: t.high ? 700 : 400 }}>
        {sub}
      </span>
    </div>
  );
}

function DayChart({ bars, today }: { bars: ReturnType<typeof dayBars>; today: string }) {
  const max = Math.max(10, ...bars.map((b) => Math.max(b.done, b.planned)));
  const H = 90;
  const label = bars
    .map((b) => {
      const { dow } = formatDayShort(b.date);
      const parts = [b.done ? `${formatNumber(b.done, 0)} fait` : '', b.planned ? `${formatNumber(b.planned, 0)} prévu` : '', b.renfoDone ? 'renfo' : ''].filter(Boolean);
      return parts.length ? `${dow} ${parts.join(', ')}` : '';
    })
    .filter(Boolean)
    .join(' ; ');
  return (
    <svg role="img" aria-label={label || 'Aucune séance cette semaine'} viewBox="0 0 318 134" style={{ width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="bOk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1FC8A5" />
          <stop offset="1" stopColor="#8BE8C3" />
        </linearGradient>
        <linearGradient id="bHi" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF5F6D" />
          <stop offset="1" stopColor="#FFB36B" />
        </linearGradient>
      </defs>
      <line x1="0" y1="110" x2="318" y2="110" stroke="var(--track)" strokeWidth="1.5" />
      {bars.map((b, i) => {
        const cx = 26 + i * 44.3;
        const hDone = (b.done / max) * H;
        const hPlan = (b.planned / max) * H;
        const isToday = b.date === today;
        return (
          <g key={b.date}>
            {b.planned > 0 && <rect x={cx - 14} y={110 - hPlan} width="28" height={Math.max(hPlan, 6)} rx="10" fill="#1FC8A5" fillOpacity=".18" stroke="#1FC8A5" strokeWidth="1.5" strokeDasharray="4 3" />}
            {b.done > 0 && <rect x={cx - 14} y={110 - hDone} width="28" height={Math.max(hDone, 6)} rx="10" fill={b.high ? 'url(#bHi)' : 'url(#bOk)'} />}
            {(b.done > 0 || b.planned > 0) && (
              <text x={cx} y={110 - Math.max(hDone, hPlan) - 7} fontSize="11" fontWeight="700" textAnchor="middle" fill={b.high ? 'var(--coral)' : b.done ? 'var(--ink)' : 'var(--muted)'} fontFamily="Inter">
                {formatNumber(b.done || b.planned, 0)}
              </text>
            )}
            {(b.renfoDone || b.renfoPlanned) && <circle cx={cx} cy={b.done || b.planned ? 100 : 102} r="5" fill="#7A6BFF" fillOpacity={b.renfoDone ? 1 : 0.35} />}
            <text x={cx} y="128" fontSize="11" textAnchor="middle" fill={isToday ? 'var(--ink)' : 'var(--muted)'} fontWeight={isToday ? 700 : 400} fontFamily="Inter">
              {'LMMJVSD'[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
