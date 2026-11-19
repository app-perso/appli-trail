import { useState } from 'react';
import { db } from '../db/db';
import type { Activity, PlannedSession } from '../db/types';
import { addDays, formatDayShort, mondayOf, todayISO, weekDays } from '../lib/dates';
import { formatDuration, formatNumber } from '../lib/format';
import { computePrep, phaseGoal, type Prep } from '../lib/prep';
import { href } from '../lib/router';
import { useLive } from '../lib/useLive';
import { weekTotals } from '../lib/week';
import { sortVersions } from '../lib/planFile';
import { useProposals } from '../lib/useProposals';
import { CoachTip } from '../components/CoachTip';
import { AddSessionSheet } from '../components/AddSessionSheet';
import { IconBack, IconCheck, IconFlag, IconPlus } from '../components/Icons';

const range = (monday: string) => {
  const a = new Date(monday + 'T12:00');
  const b = new Date(addDays(monday, 6) + 'T12:00');
  const m = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
  return a.getMonth() === b.getMonth() ? `${a.getDate()} – ${b.getDate()} ${m(b)}` : `${a.getDate()} ${m(a)} – ${b.getDate()} ${m(b)}`;
};
const facts = (s: { durationMin?: number; distanceKm?: number; elevationGain?: number }) =>
  [s.durationMin ? formatDuration(s.durationMin) : null, s.distanceKm ? `${formatNumber(s.distanceKm)} km` : null, s.elevationGain ? `${formatNumber(s.elevationGain, 0)} m D+` : null].filter(Boolean).join(' · ');

/** Plan : la semaine (navigable), son bilan, ses séances jour par jour, la prépa. */
export function Semaine({ weekParam }: { weekParam?: string }) {
  const today = todayISO();
  const current = mondayOf(today);
  const monday = mondayOf(weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : today);
  const sunday = addDays(monday, 6);
  const [adding, setAdding] = useState(false);
  const tips = useProposals();
  const data = useLive(async () => {
    const [sessions, activities, races, versions] = await Promise.all([db.plannedSessions.toArray(), db.activities.toArray(), db.races.toArray(), db.planVersions.toArray()]);
    return { sessions, activities, races, plan: sortVersions(versions).filter((v) => !v.reverted).pop() };
  }, [today]);
  if (!data) return <main className="screen" />;

  const ws = data.sessions.filter((s) => s.date >= monday && s.date <= sunday).sort((a, b) => a.date.localeCompare(b.date));
  const wa = data.activities.filter((a) => a.date >= monday && a.date <= sunday);
  const actFor = (s: PlannedSession): Activity | undefined => wa.find((a) => a.plannedSessionId === s.id);
  const t = weekTotals(ws, wa);
  const prep = computePrep(data.sessions, data.activities, data.races, today);
  const idx = prep.weeks.findIndex((w) => w.monday === monday);
  const pw = idx >= 0 ? prep.weeks[idx] : undefined;
  const phase = pw?.phase ?? ws.find((s) => s.phase)?.phase;
  const planWeek = data.plan?.weekGoals.find((g) => g.monday === monday);
  const goal = planWeek?.note ?? phaseGoal(planWeek?.phase ?? phase);
  const weekTips = monday >= current ? (tips?.week ?? []) : [];

  const stat = (name: string, done: string, planned: string, r: number) => (
    <div className="wk-stat">
      <span className="wk-stat-name">{name}</span>
      <span className="wk-stat-val">
        {done}
        <span className="muted"> / {planned}</span>
      </span>
      <span className="plan-bar">
        <span style={{ width: `${Math.min(100, r * 100)}%`, background: 'var(--accent)' }} />
      </span>
    </div>
  );

  return (
    <main className="screen">
      <header className="large-head">
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="head-date">{[idx >= 0 ? `Semaine ${idx + 1} sur ${prep.weeks.length}` : null, phase].filter(Boolean).join(' · ') || 'Entraînement'}</span>
          <h1 className="screen-title">Plan</h1>
        </div>
        <button type="button" className="icon-btn" aria-label="Ajouter une séance" onClick={() => setAdding(true)}>
          <IconPlus size={18} />
        </button>
      </header>

      <div className="week-nav">
        <a className="icon-btn" href={href('semaine', addDays(monday, -7))} aria-label="Semaine précédente">
          <IconBack size={16} />
        </a>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <b style={{ fontSize: 17 }}>{range(monday)}</b>
          {monday !== current && (
            <a className="link-btn" href={href('semaine')} style={{ display: 'block', minHeight: 0, textDecoration: 'none' }}>
              Revenir à cette semaine
            </a>
          )}
        </div>
        <a className="icon-btn" href={href('semaine', addDays(monday, 7))} aria-label="Semaine suivante" style={{ transform: 'scaleX(-1)' }}>
          <IconBack size={16} />
        </a>
      </div>

      {weekTips.map((p) => (
        <CoachTip key={p.id} p={p} sessions={tips!.sessions} />
      ))}

      <section className="card" style={{ gap: 14 }}>
        <div className="wk-stats">
          {stat('Temps', formatDuration(t.doneMin), formatDuration(t.plannedMin), t.plannedMin ? t.doneMin / t.plannedMin : 0)}
          {stat('Km à pied', formatNumber(t.doneKm, 0), formatNumber(t.plannedKm, 0), t.plannedKm ? t.doneKm / t.plannedKm : 0)}
          {stat('D+', formatNumber(t.doneDPlus, 0), `${formatNumber(t.plannedDPlus, 0)} m`, t.plannedDPlus ? t.doneDPlus / t.plannedDPlus : 0)}
        </div>
        {goal && <span className="small muted" style={{ lineHeight: 1.45 }}>{goal}</span>}
      </section>

      <div className="list">
        {weekDays(monday).map((d) => {
          const list = ws.filter((s) => s.date === d);
          const { dow, day } = formatDayShort(d);
          const isToday = d === today;
          const dayCol = (
            <span className={`day-col${isToday ? ' today' : ''}`}>
              <span>{dow}</span>
              <b>{day}</b>
            </span>
          );
          if (!list.length)
            return (
              <div key={d} className="row">
                {dayCol}
                <span className="row-main">
                  <span className="row-sub">Rien de prévu</span>
                </span>
              </div>
            );
          return list.map((s, i) => {
            const a = actFor(s);
            const done = a && !a.skipped;
            const rest = s.type === 'Repos';
            return (
              <a key={s.id} className="row" href={href('seance', s.id)}>
                {i === 0 ? dayCol : <span className="day-col" />}
                <span className="row-main">
                  <span className="row-title" style={{ color: rest ? 'var(--muted)' : undefined, textDecoration: a?.skipped ? 'line-through' : undefined }}>
                    {s.isKey && !rest ? '★ ' : ''}
                    {s.title}
                  </span>
                  {!rest && <span className="row-sub">{done ? `Fait · ${facts(a!)}` : a?.skipped ? 'Pas faite' : facts(s) || s.intensity}</span>}
                </span>
                {!a && tips?.bySession.has(s.id) && <span className="wk-tipdot" aria-label="conseil du coach" />}
                {!rest && (
                  <span className={`check${a ? (a.skipped ? ' skipped' : ' done') : ''}`} aria-hidden="true">
                    {done && <IconCheck />}
                  </span>
                )}
              </a>
            );
          });
        })}
      </div>

      {prep.weeks.length > 0 && (
        <a className="card" href={prep.target ? href('course', prep.target.id) : href('courses')} style={{ textDecoration: 'none', gap: 10 }}>
          <div className="card-row">
            <span className="eyebrow">Préparation{prep.target ? ` · ${prep.target.shortName || prep.target.name}` : ''}</span>
            <span className="row-chev" aria-hidden="true" />
          </div>
          <PrepPath prep={prep} />
        </a>
      )}

      {adding && <AddSessionSheet date={monday === current ? today : monday} onClose={() => setAdding(false)} />}
    </main>
  );
}

/** Chemin de la prépa : un trait par semaine (espacé à chaque changement de phase), la semaine en cours se remplit, drapeau au bout. */
function PrepPath({ prep }: { prep: Prep }) {
  const cur = prep.current;
  const left = cur >= 0 ? prep.weeks.length - cur - 1 : prep.weeks.length;
  const desc = `Prépa de ${prep.weeks.length} semaines${prep.target ? ` jusqu'à ${prep.target.name}` : ''}${cur >= 0 ? `, semaine ${cur + 1} en cours` : ''}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="prep-path" role="img" aria-label={desc}>
        {prep.weeks.map((w, i) => {
          const newPhase = i > 0 && w.phase !== prep.weeks[i - 1].phase;
          const fill = w.status === 'current' && w.planned ? Math.round((w.done / w.planned) * 100) : 0;
          return (
            <span
              key={w.monday}
              className={`pp-seg ${w.status}`}
              title={`${w.label ?? ''} ${w.phase ?? ''}`.trim()}
              style={{
                marginLeft: newPhase ? 6 : 0,
                background: w.status === 'current' ? `linear-gradient(90deg, #1FC8A5 ${fill}%, var(--line-off) ${fill}%)` : undefined,
              }}
            />
          );
        })}
        <span className="pp-flag" aria-hidden="true">
          <IconFlag size={11} />
        </span>
      </div>
      {cur >= 0 && (
        <span className="small muted" style={{ fontSize: 12 }}>
          Semaine {cur + 1} sur {prep.weeks.length}
          {prep.weeks[cur].phase ? ` · ${prep.weeks[cur].phase}` : ''}
          {prep.target ? ` · ${left === 0 ? 'semaine de course' : `encore ${left} semaine${left > 1 ? 's' : ''} avant ${prep.target.shortName}`}` : ''}
        </span>
      )}
    </div>
  );
}
