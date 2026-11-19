import { db, getSettings } from '../db/db';
import { todayISO } from '../lib/dates';
import { learnProfile, type Confidence, type Topic } from '../lib/profile';
import { useLive } from '../lib/useLive';
import { setIllnesses } from '../lib/illness';

const ICON: Record<Topic, string> = { charge: '🦵', recup: '🔋', sommeil: '🌙', progression: '📈', conseils: '🎯' };
const CONF: Record<Confidence, string> = { indice: 'Indice', probable: 'Probable', fiable: 'Fiable' };

/** « Ce que l'appli a appris sur toi » : enseignements tirés de tout l'historique, avec leur niveau de confiance. */
export function ProfileCard() {
  const today = todayISO();
  const p = useLive(async () => {
    const [activities, checkIns, sleeps, settings, decisions] = await Promise.all([db.activities.toArray(), db.checkIns.toArray(), db.sleeps.toArray(), getSettings(), db.coachDecisions.toArray()]);
    setIllnesses(settings.illnesses);
    return learnProfile({ activities, checkIns, sleeps, decisions, hrRest: settings.hrRest, hrMax: settings.hrMax }, today);
  }, [today]);
  if (!p) return null;
  return (
    <section className="card" style={{ gap: 10 }}>
      <span className="eyebrow">Ce que l'appli a appris sur toi</span>
      <span className="small muted">
        {p.since
          ? `D'après ${p.counts.activities} séances, ${p.counts.checkIns} check-ins${p.counts.nights ? ` et ${p.counts.nights} nuits` : ''} depuis le ${new Date(p.since + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}. Mis à jour à chaque séance et check-in.`
          : 'Pas encore de données : importe ton historique ou fais tes premiers débriefs.'}
      </span>
      {p.insights.map((i) => (
        <div key={i.id} className="insight">
          <div className="ins-head">
            <span aria-hidden="true">{ICON[i.topic]}</span>
            <b>{i.title}</b>
          </div>
          <span className="ins-text">{i.text}</span>
          {i.effect && <span className="ins-effect">→ {i.effect}</span>}
          <span className={`ins-conf ${i.confidence}`}>
            {CONF[i.confidence]} · {i.n} cas
          </span>
        </div>
      ))}
      {p.learning.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
          <span className="small" style={{ fontWeight: 700 }}>
            En cours d'apprentissage
          </span>
          {p.learning.map((l) => (
            <div key={l.topic} className="ins-learn">
              <span aria-hidden="true">{ICON[l.topic]}</span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="small" style={{ fontWeight: 600 }}>
                  {l.title}
                </span>
                <span className="small muted">{l.need}</span>
                <span className="ins-bar" aria-label={`${l.have} sur ${l.target}`}>
                  <span style={{ width: `${Math.min(100, (l.have / l.target) * 100)}%` }} />
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
