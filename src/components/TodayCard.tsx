import { db } from '../db/db';
import type { PlannedSession } from '../db/types';
import { useLive } from '../lib/useLive';
import { addDays, formatDayShort, todayISO } from '../lib/dates';
import { formatDuration, formatNumber } from '../lib/format';
import { href } from '../lib/router';
import { useProposals } from '../lib/useProposals';
import { SessionIcon } from './SessionIcon';
import { CoachTip } from './CoachTip';

const facts = (s: PlannedSession) =>
  [s.durationMin ? formatDuration(s.durationMin) : null, s.distanceKm ? `${formatNumber(s.distanceKm)} km` : null, s.elevationGain ? `${formatNumber(s.elevationGain, 0)} m D+` : null, s.intensity]
    .filter(Boolean)
    .join(' · ');

/** La séance du jour (ou, une fois faite, la prochaine) : une carte, une action. */
export function TodayCard() {
  const today = todayISO();
  const tips = useProposals();
  const data = useLive(async () => {
    const sessions = await db.plannedSessions.where('date').between(today, addDays(today, 60), true, true).sortBy('date');
    const acts = new Set((await db.activities.where('date').between(today, addDays(today, 60), true, true).toArray()).map((a) => a.plannedSessionId));
    const todo = sessions.filter((s) => s.date === today && s.type !== 'Repos' && !acts.has(s.id));
    const next = sessions.find((s) => s.date > today && s.type !== 'Repos' && !acts.has(s.id));
    return { todo, next };
  }, [today]);
  if (!data) return null;
  const { todo, next } = data;

  const card = (s: PlannedSession, label: string, isToday: boolean) => {
    const tip = tips?.bySession.get(s.id);
    return (
      <section key={s.id} className="card today-card" aria-label={label}>
        <span className="today-label">{label}</span>
        <a className="today-main" href={href('seance', s.id)}>
          <SessionIcon type={s.type} size={44} />
          <span className="row-main">
            <span className="today-title">
              {s.isKey && <span className="key-star">★ </span>}
              {s.title}
            </span>
            <span className="row-sub" style={{ whiteSpace: 'normal' }}>
              {facts(s)}
            </span>
          </span>
          <span className="row-chev" aria-hidden="true" />
        </a>
        {tip && tips && <CoachTip p={tip} sessions={tips.sessions} compact />}
        {isToday && (
          <a className="btn btn-primary" href={href('import', s.id)}>
            J’ai fait ma séance
          </a>
        )}
      </section>
    );
  };

  if (todo.length) return <>{todo.map((s, i) => card(s, todo.length > 1 ? `Séance ${i + 1} sur ${todo.length}` : 'Séance du jour', true))}</>;
  if (next) {
    const { dow, day } = formatDayShort(next.date);
    return card(next, `Prochaine séance · ${next.date === addDays(today, 1) ? 'demain' : `${dow.toLowerCase()} ${day}`}`, false);
  }
  return (
    <section className="card today-card">
      <span className="today-label">Aujourd’hui</span>
      <span className="today-title">Rien de prévu</span>
    </section>
  );
}
