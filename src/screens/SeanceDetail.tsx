import { useState } from 'react';
import { db, newId } from '../db/db';
import { toast } from '../lib/toast';
import type { Feelings } from '../db/types';
import { formatLongDate } from '../lib/dates';
import { formatDuration, formatNumber } from '../lib/format';
import { kmEffort } from '../lib/calc';
import { difficulty } from '../lib/prep';
import { go, href } from '../lib/router';
import { useLive } from '../lib/useLive';
import { SessionIcon, SESSION_LOOK } from '../components/SessionIcon';
import { SessionEditSheet } from '../components/SessionEditSheet';
import { ZonesBar } from '../components/ZonesBar';
import { Bolts } from '../components/Bolts';
import { IconBack } from '../components/Icons';

const FEEL: [keyof Feelings, string][] = [
  ['plaisir', 'Plaisir'],
  ['fatigue', 'Fatigue après'],
  ['flemme', 'Flemme avant'],
  ['moral', 'Moral après'],
  ['estomac', 'Estomac'],
];

/** Détail d'une séance : prévu, consignes, réalisé et ressentis. */
export function SeanceDetail({ id }: { id: string }) {
  const data = useLive(async () => {
    const s = await db.plannedSessions.get(id);
    const a = s ? await db.activities.where('plannedSessionId').equals(id).first() : undefined;
    return { s, a };
  }, [id]);
  const [editing, setEditing] = useState(false);
  if (!data) return <main className="screen" />;
  const { s, a } = data;
  if (!s)
    return (
      <main className="screen">
        <div className="screen-head">
          <a className="icon-btn" href={href('semaine')} aria-label="Retour">
            <IconBack />
          </a>
          <h1 className="screen-title">Séance introuvable</h1>
        </div>
      </main>
    );
  const done = a && !a.skipped;
  async function skip() {
    await db.activities.add({ id: newId(), plannedSessionId: s!.id, date: s!.date, type: s!.type, durationMin: 0, distanceKm: 0, elevationGain: 0, feelings: {}, pains: [], skipped: true, source: 'appli' });
    toast('Séance marquée comme sautée');
  }
  async function unskip() {
    await db.activities.delete(a!.id);
    toast('Séance remise à faire');
  }
  const stat = (label: string, value: string) => (
    <div className="plan-stat">
      <span className="small muted">{label}</span>
      <b className="display" style={{ fontSize: 20 }}>
        {value}
      </b>
    </div>
  );

  return (
    <main className="screen">
      <div className="screen-head">
        <a className="icon-btn" href="#/semaine" onClick={(e) => (e.preventDefault(), history.length > 1 ? history.back() : go('semaine'))} aria-label="Retour">
          <IconBack />
        </a>
        <span className="small muted" style={{ fontWeight: 600 }}>
          {capitalize(formatLongDate(s.date))}
          {s.week ? ` · ${s.week}` : ''}
          {s.phase ? ` · ${s.phase}` : ''}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '0 6px' }}>
        <SessionIcon type={s.type} size={60} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="small" style={{ fontWeight: 700, color: done ? 'var(--teal)' : a?.skipped ? 'var(--muted)' : 'var(--coral)' }}>
            {done ? '✓ Faite' : a?.skipped ? 'Pas faite' : 'À faire'} · {SESSION_LOOK[s.type].label}
            {s.isKey ? ' · ⭐ séance clé' : ''}
          </span>
          <h1 className="display" style={{ fontSize: 24, lineHeight: 1.1, margin: 0 }}>
            {s.title}
          </h1>
        </div>
      </div>

      <section className="card">
        <span className="eyebrow">Prévu</span>
        <div className="plan-stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {stat('Durée', s.durationMin ? formatDuration(s.durationMin) : '—')}
          {stat('Distance', s.distanceKm ? `${formatNumber(s.distanceKm)} km` : '—')}
          {stat('D+', s.elevationGain ? `${formatNumber(s.elevationGain, 0)} m` : '—')}
        </div>
        <div className="card-row">
          <span className="small muted">Difficulté{s.intensity ? ` · ${s.intensity}` : ''}</span>
          <Bolts n={difficulty(s)} />
        </div>
      </section>

      {(s.instructions || s.note) && (
        <section className="card" style={{ gap: 8 }}>
          <span className="eyebrow">Consignes</span>
          {s.instructions && <span style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{s.instructions}</span>}
          {s.note && <span className="small muted">Note : {s.note}</span>}
        </section>
      )}

      {done && (
        <section className="card">
          <span className="eyebrow">Réalisé</span>
          <div className="plan-stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {stat('Durée', a.durationMin ? formatDuration(a.durationMin) : '—')}
            {stat('Distance', a.distanceKm ? `${formatNumber(a.distanceKm)} km` : '—')}
            {stat('D+ / D−', `${formatNumber(a.elevationGain, 0)}${a.elevationLoss !== undefined ? ` / ${formatNumber(a.elevationLoss, 0)}` : ''}`)}
            {a.hrAvg !== undefined && stat('FC moy / max', `${a.hrAvg}${a.hrMax ? ` / ${a.hrMax}` : ''}`)}
            {a.distanceKm > 0 && stat('km-effort', formatNumber(kmEffort(a.distanceKm, a.elevationGain), 0))}
            {a.rpe !== undefined && stat('RPE', `${a.rpe}/10`)}
            {a.vamUp !== undefined && stat('Montée', `${formatNumber(a.vamUp, 0)} m/h`)}
            {a.vamDown !== undefined && stat('Descente', `${formatNumber(a.vamDown, 0)} m/h`)}
            {a.vo2max !== undefined && stat('VO2max', formatNumber(a.vo2max, 1))}
            {a.recoveryHours !== undefined && stat('Récup', `${a.recoveryHours} h`)}
            {a.startTime && stat('Départ', a.startTime.replace(':', 'h'))}
          </div>
          {a.zones && <ZonesBar zones={a.zones} />}
          {FEEL.some(([k]) => a.feelings[k] !== undefined) && (
            <div className="pills">
              {FEEL.filter(([k]) => a.feelings[k] !== undefined).map(([k, l]) => (
                <span key={k} className="pill" style={{ background: 'var(--soft)' }}>
                  {l} {a.feelings[k]}/10
                </span>
              ))}
            </div>
          )}
          {a.pains.some((p) => p.score > 0) && <span className="small">Douleurs : {a.pains.filter((p) => p.score > 0).map((p) => `${p.zone} ${p.score}/10`).join(' · ')}</span>}
          {a.note && <span style={{ fontSize: 14, lineHeight: 1.45 }}>« {a.note} »</span>}
        </section>
      )}
      {a?.skipped && a.note && (
        <section className="card">
          <span className="eyebrow">Pas faite</span>
          <span style={{ fontSize: 14 }}>« {a.note} »</span>
        </section>
      )}

      {s.type !== 'Repos' && (
        <>
          <a className="btn btn-primary" href={href('import', s.id)}>
            {a?.startAt ? 'Réimporter le .fit' : "J'ai fait ma séance (.fit)"}
          </a>
          <a className="btn btn-secondary btn-small" href={href('debrief', s.id)}>
            {a ? 'Modifier le débrief' : 'Débrief sans fichier'}
          </a>
        </>
      )}
      <button className="btn btn-secondary" type="button" onClick={() => setEditing(true)}>
        Modifier la séance (déplacer, raccourcir…)
      </button>
      {s.type !== 'Repos' && !a && (
        <button className="btn btn-small" type="button" style={{ background: 'transparent', color: 'var(--muted)' }} onClick={() => void skip()}>
          Je saute cette séance
        </button>
      )}
      {a?.skipped && (
        <button className="btn btn-small" type="button" style={{ background: 'transparent', color: 'var(--muted)' }} onClick={() => void unskip()}>
          Finalement, je ne l'ai pas sautée
        </button>
      )}

      {editing && <SessionEditSheet session={s} hasActivity={!!a} onClose={() => setEditing(false)} />}
    </main>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
