import { useState } from 'react';
import { db, getSettings } from '../db/db';
import { todayISO } from '../lib/dates';
import { learnProfile, type Confidence, type Insight, type Topic } from '../lib/profile';
import { useLive } from '../lib/useLive';
import { setIllnesses } from '../lib/illness';
import { Sheet } from './Controls';

const COLOR: Record<Topic, string> = { charge: '#ff9f0a', recup: '#34c759', sommeil: '#5e5ce6', progression: '#0a84ff', conseils: '#ff375f' };
const LETTER: Record<Topic, string> = { charge: 'C', recup: 'R', sommeil: 'S', progression: 'P', conseils: '✓' };
const CONF: Record<Confidence, string> = { indice: 'Indice', probable: 'Probable', fiable: 'Fiable' };

/** « Ce que j'ai appris sur toi » : une ligne par enseignement, le détail au toucher. */
export function ProfileCard() {
  const today = todayISO();
  const [open, setOpen] = useState<Insight | null>(null);
  const p = useLive(async () => {
    const [activities, checkIns, sleeps, settings, decisions] = await Promise.all([db.activities.toArray(), db.checkIns.toArray(), db.sleeps.toArray(), getSettings(), db.coachDecisions.toArray()]);
    setIllnesses(settings.illnesses);
    return learnProfile({ activities, checkIns, sleeps, decisions, hrRest: settings.hrRest, hrMax: settings.hrMax }, today);
  }, [today]);
  if (!p) return null;
  return (
    <>
      <h2 className="list-title">Ce que j’ai appris sur toi</h2>
      <div className="list">
        {p.insights.map((i) => (
          <button key={i.id} type="button" className="row indent" onClick={() => setOpen(i)}>
            <span className="row-icon" style={{ background: COLOR[i.topic] }} aria-hidden="true">
              <b style={{ fontSize: 13 }}>{LETTER[i.topic]}</b>
            </span>
            <span className="row-main">
              <span className="row-title" style={{ whiteSpace: 'normal' }}>
                {i.title}
              </span>
              <span className="row-sub">
                {CONF[i.confidence]} · {i.n} cas{i.effect && i.confidence !== 'indice' ? ' · appliqué au coach' : ''}
              </span>
            </span>
            <span className="row-chev" aria-hidden="true" />
          </button>
        ))}
        {p.learning.map((l) => (
          <div key={l.topic} className="row indent">
            <span className="row-icon" style={{ background: 'var(--line-off)' }} aria-hidden="true">
              <b style={{ fontSize: 13 }}>{LETTER[l.topic]}</b>
            </span>
            <span className="row-main">
              <span className="row-title" style={{ color: 'var(--muted)' }}>
                {l.title}
              </span>
              <span className="row-sub" style={{ whiteSpace: 'normal' }}>
                {l.need}
              </span>
            </span>
            <span className="row-value">
              {Math.min(l.have, l.target)}/{l.target}
            </span>
          </div>
        ))}
      </div>
      <p className="list-foot">
        {p.since
          ? `D’après ${p.counts.activities} séances et ${p.counts.checkIns} check-ins${p.counts.nights ? `, ${p.counts.nights} nuits` : ''}. Mis à jour à chaque séance.`
          : 'Importe ton historique ou fais tes premiers débriefs.'}
      </p>
      {open && (
        <Sheet title={open.title} onClose={() => setOpen(null)}>
          <span style={{ fontSize: 15, lineHeight: 1.5 }}>{open.text}</span>
          {open.effect && (
            <span style={{ fontSize: 15, lineHeight: 1.5, fontWeight: 600 }}>
              {open.effect}
            </span>
          )}
          <span className="small muted">
            {CONF[open.confidence]} · repose sur {open.n} cas. Un simple indice ne change jamais le coach ; un seuil personnel n’est appliqué que s’il est plus prudent.
          </span>
          <button className="btn btn-secondary" type="button" onClick={() => setOpen(null)}>
            Fermer
          </button>
        </Sheet>
      )}
    </>
  );
}
