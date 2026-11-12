import { useState } from 'react';
import { db } from '../db/db';
import type { Activity, PlannedSession } from '../db/types';
import { useLive } from '../lib/useLive';
import { sleepMinutes, todayISO } from '../lib/dates';
import { formatDuration, formatNumber } from '../lib/format';
import { href } from '../lib/router';
import { IconCheck, IconPlus, IconPulse } from './Icons';
import { SessionIcon } from './SessionIcon';
import { AddSessionSheet } from './AddSessionSheet';

function summary(s: PlannedSession, a?: Activity): string {
  if (a?.skipped) return 'Pas faite';
  const src = a
    ? { dur: a.durationMin, km: a.distanceKm, dp: a.elevationGain }
    : { dur: s.durationMin, km: s.distanceKm, dp: s.elevationGain };
  const parts = [
    src.dur ? formatDuration(src.dur) : null,
    src.km ? `${formatNumber(src.km)} km` : null,
    src.dp ? `${formatNumber(src.dp, 0)} m D+` : null,
  ].filter(Boolean);
  if (!parts.length) return s.instructions ?? (a ? 'Faite' : 'À faire');
  return parts.join(' · ');
}

/** Carte « Aujourd'hui » : check-in du matin + séances du jour (plusieurs possibles). */
export function TodayCard() {
  const today = todayISO();
  const [adding, setAdding] = useState(false);
  const data = useLive(async () => {
    const sessions = await db.plannedSessions.where('date').equals(today).toArray();
    const acts = await db.activities.where('date').equals(today).toArray();
    const checkIn = await db.checkIns.where('date').equals(today).first();
    return { sessions, acts, checkIn };
  }, [today]);
  if (!data) return null;

  const { sessions, acts, checkIn } = data;
  const n = sessions.filter((s) => s.type !== 'Repos').length;

  return (
    <section className="card" style={{ gap: 6, padding: '14px 12px' }} aria-label="Aujourd'hui">
      <div className="card-row" style={{ paddingLeft: 6 }}>
        <span className="eyebrow">Aujourd'hui{n ? ` · ${n} séance${n > 1 ? 's' : ''}` : ''}</span>
        <a className="link-btn" href={href('plan')} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          Mon plan →
        </a>
      </div>

      <a className="session-row" href={href('checkin')}>
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 40,
            height: 40,
            borderRadius: 14,
            background: checkIn ? 'var(--soft)' : 'var(--grad-violet)',
            color: checkIn ? 'var(--violet)' : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconPulse size={20} />
        </span>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <span className="display" style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
            Check-in du matin
          </span>
          <span className="small muted">
            {checkIn
              ? [
                  checkIn.bedTime && checkIn.wakeTime
                    ? `Sommeil ${formatDuration(sleepMinutes(checkIn.bedTime, checkIn.wakeTime))}`
                    : checkIn.sleepQuality !== undefined
                      ? `Sommeil ${checkIn.sleepQuality}/5`
                      : null,
                  checkIn.forme !== undefined ? `forme ${checkIn.forme}` : null,
                  checkIn.moral !== undefined ? `moral ${checkIn.moral}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : '20 secondes : sommeil, forme, douleurs'}
          </span>
        </span>
        <span className={`check${checkIn ? ' done' : ''}`}>{checkIn && <IconCheck />}</span>
      </a>

      {sessions.map((s) => {
        const a = acts.find((x) => x.plannedSessionId === s.id);
        const rest = s.type === 'Repos';
        const content = (
          <>
            <SessionIcon type={s.type} />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span className="display" style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
                {s.isKey ? '⭐ ' : ''}
                {s.title}
              </span>
              <span className="small muted">{summary(s, a)}</span>
            </span>
            {!rest && <span className={`check${a ? (a.skipped ? ' skipped' : ' done') : ''}`}>{a && !a.skipped && <IconCheck />}{a?.skipped && '–'}</span>}
          </>
        );
        return rest ? (
          <div key={s.id} className="session-row">
            {content}
          </div>
        ) : (
          <a key={s.id} className="session-row" href={href('debrief', s.id)} aria-label={`${s.title} : ${a ? 'modifier le débrief' : 'faire le débrief'}`}>
            {content}
          </a>
        );
      })}

      <button
        type="button"
        className="session-row"
        onClick={() => setAdding(true)}
        style={{ border: 0, background: 'transparent', color: 'var(--muted)', fontSize: 14, fontWeight: 600, textAlign: 'left' }}
      >
        <span
          aria-hidden="true"
          style={{ width: 40, height: 40, borderRadius: 14, border: '1.5px dashed var(--line-off)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <IconPlus />
        </span>
        Ajouter une séance
      </button>

      {adding && <AddSessionSheet date={today} onClose={() => setAdding(false)} />}
    </section>
  );
}
