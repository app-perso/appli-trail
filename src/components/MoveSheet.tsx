import { useState } from 'react';
import { db } from '../db/db';
import type { PlannedSession } from '../db/types';
import { addDays, formatDayShort, mondayOf, todayISO, weekDays } from '../lib/dates';
import { moveSession } from '../lib/moveSession';
import { haptic } from '../lib/theme';
import { toast } from '../lib/toast';
import { useLive } from '../lib/useLive';
import { Sheet } from './Controls';

const dayLabel = (d: string) => {
  const t = todayISO();
  if (d === t) return "aujourd'hui";
  if (d === addDays(t, 1)) return 'demain';
  if (d === addDays(t, -1)) return 'hier';
  const { dow, day } = formatDayShort(d);
  return `${dow.toLowerCase()} ${day}`;
};

/** Décaler une séance : choisir le jour, et échanger avec la séance prévue ce jour-là. */
export function MoveSheet({ session, onClose }: { session: PlannedSession; onClose: () => void }) {
  const [monday, setMonday] = useState(mondayOf(session.date));
  const [to, setTo] = useState<string | null>(null);
  const days = weekDays(monday);
  const data = useLive(async () => {
    const [sessions, acts] = await Promise.all([
      db.plannedSessions.where('date').between(addDays(monday, -7), addDays(monday, 14), true, true).toArray(),
      db.activities.where('date').between(addDays(monday, -7), addDays(monday, 14), true, true).toArray(),
    ]);
    const done = new Set(acts.map((a) => a.plannedSessionId));
    return { sessions, done };
  }, [monday]);
  if (!data) return null;
  const on = (d: string) => data.sessions.filter((s) => s.date === d && s.id !== session.id);
  const free = (d: string) => on(d).filter((s) => !data.done.has(s.id));

  async function apply(swap: boolean) {
    if (!to) return;
    const r = await moveSession(session.id, to, swap);
    haptic(15);
    toast(
      r.swapped.length
        ? `Séances échangées ✓ (${dayLabel(to)} ⇄ ${dayLabel(session.date)})`
        : `Séance décalée à ${dayLabel(to)} ✓`,
    );
    onClose();
  }

  const target = to ? free(to) : [];
  const hasTraining = target.some((s) => s.type !== 'Repos');

  return (
    <Sheet title="Décaler la séance" onClose={onClose}>
      <span className="small muted">
        {session.title}, prévue {dayLabel(session.date)}. À quel jour la fais-tu ?
      </span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button type="button" className="link-btn" onClick={() => (setMonday(addDays(monday, -7)), setTo(null))} aria-label="Semaine précédente">
          ‹ Sem. préc.
        </button>
        <button type="button" className="link-btn" onClick={() => (setMonday(addDays(monday, 7)), setTo(null))} aria-label="Semaine suivante">
          Sem. suiv. ›
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {days.map((d) => {
          const { dow, day } = formatDayShort(d);
          const here = on(d);
          const current = d === session.date;
          return (
            <button
              key={d}
              type="button"
              className={`pick-row${to === d ? ' on' : ''}`}
              aria-pressed={to === d}
              disabled={current}
              onClick={() => setTo(d)}
              style={{ minHeight: 46, opacity: current ? 0.5 : 1 }}
            >
              <span className="pick-dot" aria-hidden="true" />
              <span style={{ width: 66, flexShrink: 0, textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {dow} {day}
              </span>
              <span className="small muted" style={{ flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {current ? 'jour actuel' : here.length ? here.map((s) => `${data.done.has(s.id) ? '✓ ' : ''}${s.title}`).join(' · ') : 'rien de prévu'}
              </span>
            </button>
          );
        })}
      </div>

      {to && (
        <>
          {target.length > 0 ? (
            <>
              <button className="btn btn-primary" type="button" onClick={() => void apply(true)}>
                Échanger les deux séances
              </button>
              <span className="small muted" style={{ textAlign: 'center' }}>
                {target.map((s) => s.title).join(', ')} passera {dayLabel(session.date)}.
              </span>
              <button className="btn btn-secondary btn-small" type="button" onClick={() => void apply(false)}>
                {hasTraining ? 'Les deux le même jour' : 'Déplacer sans échanger'}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" type="button" onClick={() => void apply(false)}>
              Décaler à {dayLabel(to)}
            </button>
          )}
        </>
      )}
      <button className="btn btn-secondary btn-small" type="button" onClick={onClose}>
        Annuler
      </button>
    </Sheet>
  );
}
