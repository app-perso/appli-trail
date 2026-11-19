import { db } from '../db/db';
import { useLive } from '../lib/useLive';
import { daysUntil, todayISO } from '../lib/dates';
import { formatNumber } from '../lib/format';
import { href } from '../lib/router';
import { BackupBanner } from '../components/BackupBanner';
import { IconFlag2, IconGear } from '../components/Icons';
import { TodayCard } from '../components/TodayCard';
import { CheckinPrompt } from '../components/CheckinPrompt';
import { IllnessCard } from '../components/IllnessCard';
import { FeuRow } from '../components/WeekCard';

const longDate = (iso: string) => {
  const s = new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Aujourd'hui : seulement ce qui compte ce matin. */
export function Accueil() {
  const today = todayISO();
  const races = useLive(() => db.races.where('date').aboveOrEqual(today).sortBy('date'), [today]);
  const next = races?.find((r) => r.status !== 'done');
  const d = next ? daysUntil(next.date) : 0;

  return (
    <main className="screen">
      <header className="large-head">
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="head-date">{longDate(today)}</span>
          <h1 className="screen-title">Aujourd’hui</h1>
        </div>
        <a className="icon-btn" href={href('reglages')} aria-label="Réglages">
          <IconGear size={20} />
        </a>
      </header>

      <IllnessCard mode="active" />
      <CheckinPrompt />
      <TodayCard />

      <div className="list">
        <FeuRow />
        {next && (
          <a className="row indent" href={href('course', next.id)}>
            <span className="row-icon flag" aria-hidden="true">
              <IconFlag2 size={16} />
            </span>
            <span className="row-main">
              <span className="row-title">{next.name}</span>
              <span className="row-sub">
                {formatNumber(next.distanceKm)} km · {formatNumber(next.elevationGain, 0)} m D+
              </span>
            </span>
            <span className="row-value">{d === 0 ? 'Aujourd’hui' : d === 1 ? 'Demain' : `J-${d}`}</span>
            <span className="row-chev" aria-hidden="true" />
          </a>
        )}
        <a className="row indent" href={href('courses')}>
          <span className="row-icon muted-icon" aria-hidden="true">
            <IconFlag2 size={16} />
          </span>
          <span className="row-main">
            <span className="row-title">Ma saison</span>
          </span>
          <span className="row-value">{races?.length ?? 0} course{(races?.length ?? 0) > 1 ? 's' : ''}</span>
          <span className="row-chev" aria-hidden="true" />
        </a>
        <IllnessCard mode="entry" />
      </div>

      <BackupBanner />
    </main>
  );
}
