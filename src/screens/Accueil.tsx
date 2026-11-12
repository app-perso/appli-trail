import { useState } from 'react';
import { db } from '../db/db';
import { useLive } from '../lib/useLive';
import { daysUntil, formatLongDate, todayISO } from '../lib/dates';
import { formatNumber, km, meters } from '../lib/format';
import { kmEffort } from '../lib/calc';
import { href } from '../lib/router';
import { BackupBanner } from '../components/BackupBanner';
import { IconGear } from '../components/Icons';
import { TodayCard } from '../components/TodayCard';
import { SeasonCard } from '../components/SeasonCard';
import { FeuPill, WeekRingsCard } from '../components/WeekCard';

export function Accueil() {
  const races = useLive(() => db.races.where('date').aboveOrEqual(todayISO()).sortBy('date'));
  const [selId, setSelId] = useState<string | null>(null);

  if (!races) return <main className="screen" />;
  const sel = races.find((r) => r.id === selId) ?? races[0];

  return (
    <main className="screen">
      <div className="card-row" style={{ padding: '0 4px 0 8px' }}>
        <FeuPill />
        <a className="icon-btn" href={href('reglages')} aria-label="Réglages" style={{ width: 40, height: 40 }}>
          <IconGear size={18} />
        </a>
      </div>
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
      </div>

      <BackupBanner />

      <SeasonCard races={races} selectedId={sel?.id} today={todayISO()} onPick={setSelId} />

      <WeekRingsCard />

      <TodayCard />


    </main>
  );
}
