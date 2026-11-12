import { db } from '../db/db';
import type { Activity, PlannedSession } from '../db/types';
import { addDays, formatDayShort, mondayOf, todayISO } from '../lib/dates';
import { formatDuration, formatNumber } from '../lib/format';
import { computePrep, difficulty, phaseGoal, type Prep } from '../lib/prep';
import { go, href } from '../lib/router';
import { useLive } from '../lib/useLive';
import { weekTotals } from '../lib/week';
import { SessionIcon } from '../components/SessionIcon';
import { Bolts } from '../components/Bolts';
import { CoachBanner } from '../components/CoachBanner';
import { sortVersions } from '../lib/planFile';
import { IconCheck, IconFlag } from '../components/Icons';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function weekTitle(monday: string) {
  const a = new Date(monday + 'T12:00');
  const b = new Date(addDays(monday, 6) + 'T12:00');
  const m = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'long' });
  return a.getMonth() === b.getMonth()
    ? `${String(a.getDate()).padStart(2, '0')} - ${b.getDate()} ${capitalize(m(b))} ${b.getFullYear()}`
    : `${a.getDate()} ${capitalize(m(a))} - ${b.getDate()} ${capitalize(m(b))} ${b.getFullYear()}`;
}

/** Onglet « Semaine » : où j'en suis cette semaine et dans la prépa. */
export function Semaine() {
  const today = todayISO();
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);
  const data = useLive(async () => {
    const [sessions, activities, races, versions] = await Promise.all([db.plannedSessions.toArray(), db.activities.toArray(), db.races.toArray(), db.planVersions.toArray()]);
    return { sessions, activities, races, plan: sortVersions(versions).filter((v) => !v.reverted).pop() };
  }, [today]);
  if (!data) return <main className="screen" />;

  const ws = data.sessions.filter((s) => s.date >= monday && s.date <= sunday).sort((a, b) => a.date.localeCompare(b.date));
  const wa = data.activities.filter((a) => a.date >= monday && a.date <= sunday);
  const t = weekTotals(ws, wa);
  const prep = computePrep(data.sessions, data.activities, data.races, today);
  const actFor = (s: PlannedSession): Activity | undefined => wa.find((a) => a.plannedSessionId === s.id);
  const training = ws.filter((s) => s.type !== 'Repos');
  const todays = training.filter((s) => s.date === today);
  const next = todays.length ? [] : training.filter((s) => s.date > today && !actFor(s)).slice(0, 1);
  const focus = todays.length ? todays : next;
  const cw = prep.current >= 0 ? prep.weeks[prep.current] : undefined;
  const phase = cw?.phase ?? ws.find((s) => s.phase)?.phase;
  const planWeek = data.plan?.weekGoals.find((g) => g.monday === monday);
  const goal = planWeek?.note ?? phaseGoal(planWeek?.phase ?? phase);
  const keys = training.filter((s) => s.isKey);
  const ratio = t.plannedMin ? Math.min(1, t.doneMin / t.plannedMin) : 0;
  const R = 56;
  const C = 2 * Math.PI * R;

  return (
    <main className="screen">
      <h1 className="display" style={{ fontSize: 17, textAlign: 'center', margin: '2px 0 0', letterSpacing: '-0.01em' }}>
        {weekTitle(monday)}
      </h1>

      {/* Anneau du temps + séances + stade de la prépa */}
      <div className="week-hero">
        <div className="hero-side">
          <span className="display" style={{ fontSize: 22 }}>
            {t.doneSessions}
            <span className="muted" style={{ fontSize: 13 }}> / {t.plannedSessions}</span>
          </span>
          <span className="small muted" style={{ fontWeight: 600 }}>
            Séances
          </span>
        </div>
        <div className="hero-ring" role="img" aria-label={`${formatDuration(t.doneMin)} d'entraînement sur ${formatDuration(t.plannedMin)} prévues`}>
          <svg viewBox="0 0 136 136" width="100%" height="100%" aria-hidden="true">
            <defs>
              <linearGradient id="heroG" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#1FC8A5" />
                <stop offset="1" stopColor="#8BE8C3" />
              </linearGradient>
            </defs>
            <circle cx="68" cy="68" r={R} fill="none" stroke="var(--track)" strokeWidth="8" />
            {ratio > 0 && <circle cx="68" cy="68" r={R} fill="none" stroke="url(#heroG)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${ratio * C} ${C}`} transform="rotate(-90 68 68)" />}
          </svg>
          <div className="hero-center">
            <span className="display" style={{ fontSize: 26 }}>
              {t.doneMin ? formatDuration(t.doneMin) : '0'}
            </span>
            <span className="small muted" style={{ fontWeight: 600 }}>
              / {formatDuration(t.plannedMin)}
            </span>
          </div>
        </div>
        <div className="hero-side">
          <span className="display" style={{ fontSize: 22 }}>
            {prep.current >= 0 ? prep.current + 1 : '–'}
            <span className="muted" style={{ fontSize: 13 }}> / {prep.weeks.length || '–'}</span>
          </span>
          <span className="small muted" style={{ fontWeight: 600 }}>
            Semaines
          </span>
        </div>
      </div>

      <CoachBanner />

      {/* Séance(s) du jour, ou la prochaine */}
      {focus.map((s) => {
        const a = actFor(s);
        const idx = training.indexOf(s) + 1;
        return (
          <section key={s.id} className="card" style={{ gap: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <SessionIcon type={s.type} size={40} />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span className="small muted" style={{ fontWeight: 600 }}>
                  {todays.length ? `Séance ${idx} sur ${training.length}` : `Prochaine séance · ${formatDayShort(s.date).dow.toLowerCase()} ${formatDayShort(s.date).day}`}
                  {a ? (a.skipped ? ' · pas faite' : ' · ✓ faite') : ''}
                </span>
                <span className="clamp2" style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25 }}>
                  {s.isKey ? '⭐ ' : ''}
                  {s.title}
                </span>
              </div>
            </div>
            <div className="day-stats">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="small muted" style={{ fontWeight: 600 }}>
                  Durée
                </span>
                <span className="display" style={{ fontSize: 17 }}>
                  {s.durationMin ? formatDuration(s.durationMin) : '—'}
                </span>
              </div>
              <span style={{ width: 1, background: 'var(--pill-line)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span className="small muted" style={{ fontWeight: 600 }}>
                  Difficulté
                </span>
                <Bolts n={difficulty(s)} size={14} />
              </div>
              {s.distanceKm ? (
                <>
                  <span style={{ width: 1, background: 'var(--pill-line)' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="small muted" style={{ fontWeight: 600 }}>
                      Distance
                    </span>
                    <span className="display" style={{ fontSize: 17 }}>
                      {formatNumber(s.distanceKm)}
                      <span className="muted" style={{ fontSize: 13 }}> km</span>
                    </span>
                  </div>
                </>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!a && s.date <= today && (
                <a className="link-btn" href={href('import', s.id)} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', background: 'var(--grad-coral)', color: '#fff' }}>
                  J'ai fait ma séance
                </a>
              )}
              <a className="link-btn" href={href('seance', s.id)} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                Voir la séance →
              </a>
            </div>
          </section>
        );
      })}
      {!focus.length && (
        <section className="card">
          <span className="eyebrow">Aujourd'hui</span>
          <span className="muted small">{training.length ? 'Plus de séance prévue cette semaine. Récupère bien !' : 'Aucune séance prévue cette semaine.'}</span>
        </section>
      )}

      {/* Programme en cours */}
      <section className="card" style={{ gap: 12 }}>
        <div className="card-row">
          <span className="eyebrow">
            Programme en cours
          </span>
          {prep.target && (
            <a className="link-btn" href={href('courses', prep.target.id)} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
              {prep.target.shortName} →
            </a>
          )}
        </div>
        {prep.weeks.length > 0 && <PrepPath prep={prep} />}

        <div style={{ borderTop: '1px solid var(--pill-line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>
              {prep.current >= 0 ? `Semaine ${prep.current + 1}` : 'Cette semaine'}
            </span>
            {cw?.label && <span className="small muted">{cw.label} du plan</span>}
            {phase && <span className="phase-chip">{phase.toUpperCase()}</span>}
          </div>
          <div className="week-goal">
            <span className="eyebrow" style={{ fontSize: 11 }}>
              But de la semaine
            </span>
            {goal && <span style={{ fontSize: 13, lineHeight: 1.4 }}>{goal}</span>}
            {planWeek && (planWeek.km || planWeek.dplus) ? (
              <span className="small" style={{ fontWeight: 700, fontSize: 12 }}>
                Objectif du plan : {planWeek.km ? `${formatNumber(planWeek.km, 0)} km` : ''}
                {planWeek.km && planWeek.dplus ? ' · ' : ''}
                {planWeek.dplus ? `${formatNumber(planWeek.dplus, 0)} m D+` : ''}
              </span>
            ) : null}
            <span className="small muted" style={{ fontWeight: 600, fontSize: 12 }}>
              {planWeek ? 'Séances prévues : ' : ''}
              {formatNumber(t.plannedKm, 0)} km à pied · {formatNumber(t.plannedDPlus, 0)} m D+ · {formatDuration(t.plannedMin)}
              {keys.length ? ` · ${keys.length} séance${keys.length > 1 ? 's' : ''} clé${keys.length > 1 ? 's' : ''} ⭐` : ''}
            </span>
          </div>
          <ul className="week-list">
            {ws.map((s) => {
              const a = actFor(s);
              const done = a && !a.skipped;
              const { dow, day } = formatDayShort(s.date);
              return (
                <li key={s.id}>
                  <button type="button" className="week-item" onClick={() => go('seance', s.id)} aria-label={`${s.title}, ${dow} ${day}${done ? ', faite' : a?.skipped ? ', pas faite' : ''}`}>
                    <span className={`wk-dot${done ? ' done' : a?.skipped ? ' skipped' : s.date === today ? ' today' : ''}`} aria-hidden="true">
                      {done && <IconCheck size={11} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                      <span className="wk-title" style={{ color: s.type === 'Repos' ? 'var(--muted)' : undefined, textDecoration: a?.skipped ? 'line-through' : undefined }}>
                        {s.isKey ? '⭐ ' : ''}
                        {s.title}
                      </span>
                      <span className="small muted" style={{ fontSize: 12 }}>
                        {dow} {day}
                      </span>
                    </span>
                    <span className="wk-dur">{done ? formatDuration(a!.durationMin) : s.durationMin ? formatDuration(s.durationMin) : ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a className="link-btn" href={href('plan')} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
              Modifier le plan →
            </a>
            <a className="link-btn" href={href('coach', 'journal')} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
              Journal du coach →
            </a>
          </div>
        </div>
      </section>
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
