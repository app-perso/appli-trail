import { useState } from 'react';
import { db } from '../db/db';
import type { Race } from '../db/types';
import { kmEffort } from '../lib/calc';
import { daysUntil, formatLongDate, todayISO } from '../lib/dates';
import { formatNumber, km, meters } from '../lib/format';
import { go, href } from '../lib/router';
import { useLive } from '../lib/useLive';
import { haptic } from '../lib/theme';
import { mountainProfile } from '../lib/mountainProfile';
import { hmToMin, formatHM } from '../lib/racePlan';
import { RaceEditSheet } from '../components/RaceEditSheet';
import { IconBack, IconPlus } from '../components/Icons';

const isDone = (r: Race, today: string) => r.status === 'done' || r.date < today;
const ke = (r: Race) => kmEffort(r.distanceKm, r.elevationGain);
const shortDate = (iso: string) => new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const monthYear = (iso: string) => new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }).replace(' ', ' ');

export function Courses({ initialId }: { initialId?: string }) {
  const today = todayISO();
  const races = useLive(() => db.races.orderBy('date').toArray());
  const [selId, setSelId] = useState<string | undefined>(initialId);
  const [editing, setEditing] = useState<Race | 'new' | null>(null);
  if (!races) return <main className="screen" />;

  const done = races.filter((r) => isDone(r, today));
  const next = races.find((r) => !isDone(r, today));
  const biggest = done.reduce<Race | undefined>((b, r) => (!b || ke(r) > ke(b) ? r : b), undefined);
  const sel = races.find((r) => r.id === selId) ?? next ?? races[races.length - 1];
  const step = next && biggest ? ke(next) / ke(biggest) : undefined;

  return (
    <main className="screen">
      <div className="screen-head">
        <a className="icon-btn" href={href('accueil')} aria-label="Retour à l'accueil">
          <IconBack />
        </a>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <span className="small muted">{races.length ? `${capitalize(monthYear(races[0].date))} → ${monthYear(races[races.length - 1].date)}` : 'Aucune course'}</span>
          <h1 className="screen-title" style={{ fontSize: 26 }}>
            Mes courses
          </h1>
        </div>
        <button className="icon-btn" type="button" aria-label="Ajouter une course" onClick={() => setEditing('new')}>
          <IconPlus />
        </button>
      </div>

      <div className="tiles3">
        <div className="tile">
          <span className="t-label">Courses finies</span>
          <span className="display" style={{ fontSize: 24 }}>
            {done.length}
          </span>
          <span className="t-sub">{done.length ? `${formatNumber(done.reduce((t, r) => t + r.distanceKm, 0), 0)} km au total` : '—'}</span>
        </div>
        <div className="tile">
          <span className="t-label">Plus longue</span>
          <span className="display" style={{ fontSize: 24 }}>
            {biggest ? formatNumber(ke(biggest), 0) : '—'}
          </span>
          <span className="t-sub">{biggest ? `km-effort · ${biggest.shortName}` : ''}</span>
        </div>
        <div className="tile" style={{ background: 'linear-gradient(135deg, #14B894, #6FDDB3)', color: '#fff', borderColor: 'transparent' }}>
          <span className="t-label" style={{ color: '#fff', opacity: 0.92 }}>
            Prochaine marche
          </span>
          <span className="display" style={{ fontSize: 24 }}>
            {step ? `×${formatNumber(step, 1)}` : '—'}
          </span>
          <span className="t-sub" style={{ color: '#fff', opacity: 0.92 }}>
            {step && next ? `${next.shortName} vs ta plus grosse` : ''}
          </span>
        </div>
      </div>

      {races.length > 0 && (
        <section className="card" style={{ padding: '16px 8px 8px' }}>
          <div className="card-row" style={{ padding: '0 12px' }}>
            <span className="eyebrow">Ma progression</span>
            <span className="small muted" style={{ fontSize: 11 }}>
              touche un sommet
            </span>
          </div>
          <ProgressProfile races={races} today={today} selId={sel?.id} onPick={setSelId} />
          {sel && <RaceFiche race={sel} today={today} onEdit={() => setEditing(sel)} />}
        </section>
      )}

      <h2 className="display" style={{ fontSize: 20, margin: '8px 8px 0', letterSpacing: '-0.03em' }}>
        Toutes les courses
      </h2>
      <section className="card" style={{ padding: '6px 16px', gap: 0 }}>
        {races.map((r, i) => {
          const d = isDone(r, today);
          return (
            <button
              key={r.id}
              type="button"
              className="race-row"
              style={{ borderBottom: i < races.length - 1 ? '1px solid var(--pill-line)' : 'none' }}
              onClick={() => {
                haptic();
                setSelId(r.id);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <span className="race-dot" style={{ background: r.id === sel?.id ? '#FF5F6D' : d ? '#1FC8A5' : 'var(--line-off)' }} />
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left' }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>
                  {r.isMain ? '🏁 ' : ''}
                  {r.name}
                </span>
                <span className="small muted" style={{ fontSize: 12 }}>
                  {shortDate(r.date)} {r.date.slice(0, 4)} · {km(r.distanceKm)} · {meters(r.elevationGain)} D+
                </span>
              </span>
              <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: d ? 'var(--teal)' : 'var(--muted)' }}>{d ? r.resultTime ?? 'Fini' : `J-${daysUntil(r.date)}`}</span>
            </button>
          );
        })}
        {!races.length && <span className="small muted" style={{ padding: 12 }}>Ajoute ta première course avec le bouton +.</span>}
      </section>

      {editing && <RaceEditSheet race={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={setSelId} />}
    </main>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Fiche de la course sélectionnée. */
function RaceFiche({ race, today, onEdit }: { race: Race; today: string; onEdit: () => void }) {
  const d = isDone(race, today);
  const min = hmToMin(race.resultTime);
  const keh = min ? ke(race) / (min / 60) : undefined;
  return (
    <div className="race-fiche" style={{ background: d ? 'rgba(31,200,165,0.10)' : 'rgba(255,95,109,0.08)' }}>
      <div className="card-row" style={{ alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="small muted" style={{ fontWeight: 600, fontSize: 12 }}>
            {formatLongDate(race.date)}
          </span>
          <span className="display" style={{ fontSize: 20, lineHeight: 1.1 }}>
            {race.name}
          </span>
        </div>
        <span className="status-chip" style={{ background: d ? 'var(--grad-teal)' : 'var(--grad-coral)' }}>
          {d ? `Fini${race.resultTime ? ` · ${race.resultTime}` : ''}` : `J-${daysUntil(race.date)}`}
        </span>
      </div>
      <div className="pills">
        <span className="pill" style={{ background: 'var(--card)' }}>
          {km(race.distanceKm)}
        </span>
        <span className="pill" style={{ background: 'var(--card)' }}>
          {meters(race.elevationGain)} D+
        </span>
        <span className="pill" style={{ background: 'var(--card)' }}>
          {formatNumber(ke(race), 0)} km-effort
        </span>
        {keh && (
          <span className="pill teal" title="Vitesse en km-effort par heure">
            {formatNumber(keh, 1)} km-effort/h
          </span>
        )}
      </div>
      {race.notes && <span style={{ fontSize: 13, lineHeight: 1.4 }}>{race.notes}</span>}
      {race.goalTime && !d && <span className="small muted">Objectif : {formatHM(hmToMin(race.goalTime)!)}</span>}
      <div style={{ display: 'grid', gridTemplateColumns: d ? '1fr' : '1fr 1fr', gap: 8 }}>
        <button className="btn btn-secondary btn-small" type="button" onClick={onEdit}>
          Modifier
        </button>
        {!d && (
          <button className="btn btn-primary btn-small" type="button" onClick={() => go('course', race.id)}>
            {race.gpx ? 'Plan de course →' : 'Plan & tracé GPX →'}
          </button>
        )}
      </div>
    </div>
  );
}

/** Toutes les courses en sommets régulièrement espacés : passées en vert, à venir en lavande, sélectionnée en corail. */
function ProgressProfile({ races, today, selId, onPick }: { races: Race[]; today: string; selId?: string; onPick: (id: string) => void }) {
  const W = 342;
  const BASE = 150;
  const n = races.length;
  const slot = (W - 16) / n;
  const xs = races.map((_, i) => 8 + slot * (i + 0.5));
  const scale = Math.min(0.95, 120 / Math.max(...races.map(ke)));
  const { lineD, fillD, elev } = mountainProfile(
    races.map((r, i) => ({ x: xs[i], h: Math.max(14, ke(r) * scale), sig: Math.min(20, slot * 0.32) })),
    8,
    W - 8,
    BASE,
  );
  const lastDone = races.map((r) => isDone(r, today)).lastIndexOf(true);
  const todayX = lastDone < 0 ? 8 : lastDone === n - 1 ? W - 8 : (xs[lastDone] + xs[lastDone + 1]) / 2;
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: `${W} / 196`, marginTop: 10 }}>
      <svg
        role="img"
        aria-label={`${n} courses en sommets : ${races.map((r) => `${r.shortName} ${isDone(r, today) ? 'finie' : 'à venir'}`).join(', ')}`}
        viewBox={`0 0 ${W} 196`}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <defs>
          <linearGradient id="cOff" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--off-fill)" />
            <stop offset="1" stopColor="var(--off-fill)" stopOpacity=".05" />
          </linearGradient>
          <linearGradient id="cDone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1FC8A5" stopOpacity=".40" />
            <stop offset="1" stopColor="#8BE8C3" stopOpacity=".04" />
          </linearGradient>
          <clipPath id="cPast">
            <rect x="0" y="-20" width={todayX} height="240" />
          </clipPath>
        </defs>
        <line x1="8" y1={BASE} x2={W - 8} y2={BASE} stroke="var(--line-off)" strokeOpacity=".6" />
        <path d={fillD} fill="url(#cOff)" />
        <path d={fillD} fill="url(#cDone)" clipPath="url(#cPast)" />
        <path d={lineD} fill="none" stroke="var(--line-off)" strokeWidth="2" strokeLinejoin="round" />
        <path d={lineD} fill="none" stroke="#14B894" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#cPast)" />
        <line x1={todayX} y1="20" x2={todayX} y2={BASE} stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="3 3" />
        <text x={todayX} y="14" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink)" fontFamily="Inter">
          Auj.
        </text>
        {races.map((r, i) => {
          const on = r.id === selId;
          const d = isDone(r, today);
          return (
            <g key={r.id}>
              <circle cx={xs[i]} cy={elev(xs[i])} r={on ? 7 : 5} fill={on ? '#FF5F6D' : d ? '#1FC8A5' : 'var(--bg)'} stroke={on || d ? '#fff' : 'var(--line-off)'} strokeWidth="2.5" />
              <text x={xs[i]} y="168" textAnchor="middle" fontSize="10" fontWeight={on ? 700 : 500} fill={on ? 'var(--coral)' : 'var(--ink)'} fontFamily="Inter">
                {r.shortName.length > 10 ? r.shortName.slice(0, 9) + '…' : r.shortName}
              </text>
              <text x={xs[i]} y="182" textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="Inter">
                {i === 0 || i === n - 1 || races[i - 1].date.slice(0, 4) !== r.date.slice(0, 4) ? monthYear(r.date) : shortDate(r.date)}
              </text>
            </g>
          );
        })}
      </svg>
      {races.map((r, i) => (
        <button
          key={r.id}
          type="button"
          aria-label={r.name}
          aria-pressed={r.id === selId}
          onClick={() => {
            haptic();
            onPick(r.id);
          }}
          style={{ position: 'absolute', top: 0, bottom: 0, left: `${((xs[i] - slot / 2) / W) * 100}%`, width: `${(slot / W) * 100}%`, border: 0, background: 'transparent' }}
        />
      ))}
    </div>
  );
}
