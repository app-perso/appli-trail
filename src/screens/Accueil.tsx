import { useState } from 'react';
import { db } from '../db/db';
import { useLive } from '../lib/useLive';
import { daysUntil, formatLongDate, todayISO } from '../lib/dates';
import { formatNumber, km, meters } from '../lib/format';
import { kmEffort } from '../lib/calc';
import { href } from '../lib/router';
import { haptic } from '../lib/theme';
import { BackupBanner } from '../components/BackupBanner';
import { IconGear } from '../components/Icons';

export function Accueil() {
  const races = useLive(() => db.races.where('date').aboveOrEqual(todayISO()).sortBy('date'));
  const [selId, setSelId] = useState<string | null>(null);

  if (!races) return <main className="screen" />;
  const sel = races.find((r) => r.id === selId) ?? races[0];

  return (
    <main className="screen">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '0 8px 12px' }}>
        {sel ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <span className="small muted" style={{ fontWeight: 600, marginBottom: 2 }}>
              {formatLongDate(sel.date)}
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="display" style={{ fontSize: 70 }}>
                {daysUntil(sel.date)}
              </span>
              <span className="display muted" style={{ fontSize: 18, fontWeight: 600, letterSpacing: 0 }}>
                {daysUntil(sel.date) > 1 ? 'jours' : 'jour'}
              </span>
            </div>
            <span className="display" style={{ marginTop: 8, fontSize: 23, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
              {sel.name}
            </span>
            <div className="pills" style={{ marginTop: 12 }}>
              <span className="pill">{km(sel.distanceKm)}</span>
              <span className="pill">{meters(sel.elevationGain)} D+</span>
              <span className="pill coral">{formatNumber(kmEffort(sel.distanceKm, sel.elevationGain), 0)} km-effort</span>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1 }}>
            <h1 className="screen-title">Aucune course à venir</h1>
          </div>
        )}
        <a className="icon-btn" href={href('reglages')} aria-label="Réglages">
          <IconGear size={20} />
        </a>
      </div>

      <BackupBanner />

      <section className="card" aria-label="Courses à venir">
        <span className="eyebrow">Mes prochaines courses</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {races.map((r) => {
            const on = r.id === sel?.id;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  haptic();
                  setSelId(r.id);
                }}
                style={{
                  minHeight: 48,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '6px 10px',
                  border: 0,
                  borderRadius: 16,
                  textAlign: 'left',
                  background: on ? 'var(--soft)' : 'transparent',
                  transition: 'background-color 180ms ease',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: on ? 'var(--grad-coral)' : 'var(--off-fill)',
                    border: on ? '0' : '2px solid var(--line-off)',
                  }}
                />
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600 }}>
                    {r.isMain ? '🏁 ' : ''}
                    {r.shortName}
                  </span>
                  <span className="small muted">
                    {km(r.distanceKm)} · {meters(r.elevationGain)} D+
                  </span>
                </span>
                <span className="small" style={{ fontWeight: 700, color: on ? 'var(--coral)' : 'var(--muted)' }}>
                  J-{daysUntil(r.date)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card">
        <span className="eyebrow">Aujourd'hui</span>
        <span className="muted small">
          Tes séances du jour, le check-in et le débrief arrivent à l'étape 2. Le profil de la saison et les anneaux de la
          semaine suivront.
        </span>
      </section>
    </main>
  );
}
