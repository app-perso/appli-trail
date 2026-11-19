import { useState } from 'react';
import { db } from '../db/db';
import type { Activity, PlannedSession } from '../db/types';
import { useLive } from '../lib/useLive';
import { addDays, formatDayShort, todayISO } from '../lib/dates';
import { difficulty } from '../lib/prep';
import { Bolts } from './Bolts';
import { formatDuration, formatNumber } from '../lib/format';
import { href } from '../lib/router';
import { IconCheck, IconPlus } from './Icons';
import { SessionIcon } from './SessionIcon';
import { AddSessionSheet } from './AddSessionSheet';
import { CoachTip } from './CoachTip';
import { useProposals } from '../lib/useProposals';

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

/** Carte « Aujourd'hui » : séances du jour (plusieurs possibles). */
export function TodayCard() {
  const today = todayISO();
  const [adding, setAdding] = useState(false);
  const tips = useProposals();
  const data = useLive(async () => {
    const sessions = await db.plannedSessions.where('date').equals(today).toArray();
    const acts = await db.activities.where('date').equals(today).toArray();
    // Prochaine séance à faire après aujourd'hui (hors repos)
    const later = await db.plannedSessions.where('date').between(addDays(today, 1), addDays(today, 60), true, true).sortBy('date');
    const laterActs = new Set((await db.activities.where('date').between(addDays(today, 1), addDays(today, 60), true, true).toArray()).map((a) => a.plannedSessionId));
    const next = later.find((s) => s.type !== 'Repos' && !laterActs.has(s.id));
    return { sessions, acts, next };
  }, [today]);
  if (!data) return null;

  const { sessions, acts, next } = data;
  const n = sessions.filter((s) => s.type !== 'Repos').length;
  const remaining = sessions.filter((s) => s.type !== 'Repos' && !acts.some((a) => a.plannedSessionId === s.id));
  const doneToday = acts.filter((a) => !a.skipped);

  // Séance(s) du jour faite(s), ou jour de repos : on montre la prochaine séance
  if (!remaining.length && next) {
    const dayLabel = next.date === addDays(today, 1) ? 'demain' : (({ dow, day }) => `${dow.toLowerCase()} ${day}`)(formatDayShort(next.date));
    const facts = [
      next.durationMin ? formatDuration(next.durationMin) : null,
      next.distanceKm ? `${formatNumber(next.distanceKm)} km` : null,
      next.elevationGain ? `${formatNumber(next.elevationGain, 0)} m D+` : null,
    ].filter(Boolean);
    return (
      <section className="card" style={{ gap: 8, padding: '14px 12px' }} aria-label="Prochaine séance">
        <div className="card-row" style={{ paddingLeft: 6 }}>
          <span className="eyebrow">Prochaine séance · {dayLabel}</span>
        </div>
        <a className="next-session" href={href('seance', next.id)} aria-label={`Prochaine séance ${dayLabel} : ${next.title}, voir le détail`}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <SessionIcon type={next.type} />
            <span className="display" style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
              {next.isKey ? '⭐ ' : ''}
              {next.title}
            </span>
          </div>
          {(facts.length > 0 || next.intensity) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span className="small" style={{ fontWeight: 600 }}>
                {facts.join(' · ')}
                {next.intensity ? `${facts.length ? ' · ' : ''}${next.intensity}` : ''}
              </span>
              <Bolts n={difficulty(next)} size={14} />
            </div>
          )}
          {next.instructions && <span className="small muted next-instr">{next.instructions}</span>}
          <span className="small" style={{ fontWeight: 700 }}>Voir le détail →</span>
        </a>
        {tips?.bySession.get(next.id) && <CoachTip p={tips.bySession.get(next.id)!} sessions={tips.sessions} />}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          <a className="link-btn" href={href('import')} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            {doneToday.length ? 'Une autre séance ? (.fit)' : "J'ai fait une séance (.fit)"}
          </a>
          <a className="link-btn" href={href('semaine')} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            Ma semaine →
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="card" style={{ gap: 6, padding: '14px 12px' }} aria-label="Aujourd'hui">
      <div className="card-row" style={{ paddingLeft: 6 }}>
        <span className="eyebrow">Aujourd'hui{n ? ` · ${n} séance${n > 1 ? 's' : ''}` : ''}</span>
        <a className="link-btn" href={href('plan')} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          Mon plan →
        </a>
      </div>


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
          <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <a className="session-row" href={href('debrief', s.id)} aria-label={`${s.title} : ${a ? 'modifier le débrief' : 'faire le débrief'}`}>
              {content}
            </a>
            {!a && tips?.bySession.get(s.id) && <CoachTip p={tips.bySession.get(s.id)!} sessions={tips.sessions} compact />}
          </div>
        );
      })}

      <a className="btn btn-primary btn-small" href={href('import')} style={{ margin: '4px 4px 2px' }}>
        J'ai fait ma séance (.fit)
      </a>
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
