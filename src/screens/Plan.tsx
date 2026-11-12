import { useState } from 'react';
import { db } from '../db/db';
import type { Activity, PlannedSession } from '../db/types';
import { addDays, formatDayShort, formatWeekRange, mondayOf, todayISO, weekDays } from '../lib/dates';
import { formatDuration, formatNumber } from '../lib/format';
import { go, href } from '../lib/router';
import { useLive } from '../lib/useLive';
import { useDragToDay } from '../lib/useDragToDay';
import { weekTotals } from '../lib/week';
import { toast } from '../lib/toast';
import { haptic } from '../lib/theme';
import { SessionIcon } from '../components/SessionIcon';
import { SessionEditSheet } from '../components/SessionEditSheet';
import { AddSessionSheet } from '../components/AddSessionSheet';
import { IconBack, IconCheck, IconPlus } from '../components/Icons';

function plannedSummary(s: PlannedSession): string {
  return [
    s.durationMin ? formatDuration(s.durationMin) : null,
    s.distanceKm ? `${formatNumber(s.distanceKm)} km` : null,
    s.elevationGain ? `${formatNumber(s.elevationGain, 0)} m D+` : null,
    s.intensity ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Lundi → dimanche, avec les séances prévues, les totaux prévu / fait, et le déplacement par glisser. */
export function Plan({ weekParam }: { weekParam?: string }) {
  const today = todayISO();
  const monday = mondayOf(weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : today);
  const days = weekDays(monday);
  const sunday = days[6];
  const [editing, setEditing] = useState<string | null>(null);
  const [addingOn, setAddingOn] = useState<string | null>(null);

  const data = useLive(async () => {
    const sessions = await db.plannedSessions.where('date').between(monday, sunday, true, true).sortBy('date');
    const activities = await db.activities.where('date').between(monday, sunday, true, true).toArray();
    return { sessions, activities };
  }, [monday]);

  const { drag, handlers, shouldIgnoreClick } = useDragToDay((id, day) => {
    const s = data?.sessions.find((x) => x.id === id);
    if (!s || s.date === day) return;
    void (async () => {
      await db.plannedSessions.update(id, { date: day });
      await db.activities.where('plannedSessionId').equals(id).modify({ date: day });
      haptic(20);
      const { dow, day: n } = formatDayShort(day);
      toast(`Déplacée au ${dow.toLowerCase()} ${n} ✓`);
    })();
  });

  if (!data) return <main className="screen" />;
  const { sessions, activities } = data;
  const actFor = (s: PlannedSession): Activity | undefined => activities.find((a) => a.plannedSessionId === s.id);
  const t = weekTotals(sessions, activities);
  const label = sessions.find((s) => s.week)?.week;
  const phase = sessions.find((s) => s.phase)?.phase;
  const editingSession = sessions.find((s) => s.id === editing);

  const stat = (name: string, done: string, planned: string, ratio: number, color: string) => (
    <div className="plan-stat">
      <span className="small muted">{name}</span>
      <span>
        <b className="display" style={{ fontSize: 20 }}>
          {done}
        </b>
        <span className="small muted"> / {planned}</span>
      </span>
      <span className="plan-bar">
        <span style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }} />
      </span>
    </div>
  );

  return (
    <main className="screen">
      <div className="screen-head">
        <a className="icon-btn" href={href('accueil')} aria-label="Retour à l'accueil">
          <IconBack />
        </a>
        <h1 className="screen-title">Plan</h1>
        {monday !== mondayOf(today) && (
          <a className="link-btn" href={href('plan')} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            Cette semaine
          </a>
        )}
      </div>

      <section className="card" style={{ gap: 14 }}>
        <div className="card-row">
          <a className="icon-btn" href={href('plan', addDays(monday, -7))} aria-label="Semaine précédente" style={{ width: 40, height: 40, boxShadow: 'none' }}>
            <IconBack size={18} />
          </a>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <div className="display" style={{ fontSize: 20, letterSpacing: '-0.02em' }}>
              {label ? `${label} · ` : ''}
              {formatWeekRange(monday)}
            </div>
            {phase && <div className="small muted">{phase}</div>}
          </div>
          <a className="icon-btn" href={href('plan', addDays(monday, 7))} aria-label="Semaine suivante" style={{ width: 40, height: 40, boxShadow: 'none', transform: 'scaleX(-1)' }}>
            <IconBack size={18} />
          </a>
        </div>
        <div className="plan-stats">
          {stat('Km à pied', formatNumber(t.doneKm), `${formatNumber(t.plannedKm)} km`, t.plannedKm ? t.doneKm / t.plannedKm : 0, 'var(--grad-coral)')}
          {stat('D+', formatNumber(t.doneDPlus, 0), `${formatNumber(t.plannedDPlus, 0)} m`, t.plannedDPlus ? t.doneDPlus / t.plannedDPlus : 0, 'var(--grad-teal)')}
          {stat('Temps', formatDuration(t.doneMin), formatDuration(t.plannedMin), t.plannedMin ? t.doneMin / t.plannedMin : 0, 'var(--grad-violet)')}
          {stat('Séances', String(t.doneSessions), String(t.plannedSessions), t.plannedSessions ? t.doneSessions / t.plannedSessions : 0, 'var(--ink)')}
        </div>
      </section>

      {sessions.length > 0 && <span className="small muted" style={{ textAlign: 'center' }}>Appui long sur une séance pour la glisser vers un autre jour.</span>}

      {days.map((d) => {
        const { dow, day } = formatDayShort(d);
        const list = sessions.filter((s) => s.date === d);
        const isToday = d === today;
        return (
          <section key={d} data-day={d} className={`plan-day${drag?.over === d ? ' drop' : ''}`} aria-label={`${dow} ${day}`}>
            <div className="plan-day-head">
              <span className={`plan-date${isToday ? ' today' : ''}`}>
                <span>{dow}</span>
                <b>{day}</b>
              </span>
              <button type="button" className="plan-add" aria-label={`Ajouter une séance le ${dow} ${day}`} onClick={() => setAddingOn(d)}>
                <IconPlus size={16} />
              </button>
            </div>
            {list.length === 0 && <span className="small muted plan-empty">—</span>}
            {list.map((s) => {
              const a = actFor(s);
              const dragging = drag?.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`plan-session${dragging ? ' dragging' : ''}${s.type === 'Repos' ? ' rest' : ''}`}
                  style={dragging ? { transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.03)` } : undefined}
                  {...handlers(s.id)}
                  onClick={() => {
                    if (shouldIgnoreClick()) return;
                    setEditing(s.id);
                  }}
                >
                  <SessionIcon type={s.type} size={36} />
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                    <span className="plan-title">
                      {s.isKey ? '⭐ ' : ''}
                      {s.title}
                    </span>
                    <span className="small muted plan-sub">
                      {a && !a.skipped
                        ? `Fait : ${[a.durationMin ? formatDuration(a.durationMin) : null, a.distanceKm ? `${formatNumber(a.distanceKm)} km` : null, a.elevationGain ? `${formatNumber(a.elevationGain, 0)} m D+` : null].filter(Boolean).join(' · ') || '✓'}`
                        : a?.skipped
                          ? 'Pas faite'
                          : plannedSummary(s) || (s.type === 'Repos' ? 'Repos' : '')}
                    </span>
                  </span>
                  {s.type !== 'Repos' && (
                    <span className={`check${a ? (a.skipped ? ' skipped' : ' done') : ''}`} aria-hidden="true">
                      {a && !a.skipped && <IconCheck />}
                      {a?.skipped && '–'}
                    </span>
                  )}
                </button>
              );
            })}
          </section>
        );
      })}

      <button className="btn btn-secondary" type="button" onClick={() => go('reglages')} style={{ marginTop: 8 }}>
        Importer / exporter (Réglages)
      </button>

      {editingSession && <SessionEditSheet session={editingSession} hasActivity={!!actFor(editingSession)} onClose={() => setEditing(null)} />}
      {addingOn && <AddSessionSheet date={addingOn} onClose={() => setAddingOn(null)} />}
    </main>
  );
}
