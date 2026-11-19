import { db } from '../db/db';
import { undoDecision } from '../lib/adaptApply';
import { formatLongDate } from '../lib/dates';
import { toast } from '../lib/toast';
import { useLive } from '../lib/useLive';

/** Adaptations du coach des 14 derniers jours, chacune annulable. */
export function AdaptationsCard() {
  const list = useLive(async () => {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    return (await db.coachDecisions.toArray()).filter((d) => d.decidedAt >= since).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
  });
  if (!list?.length) return null;
  return (
    <>
      <h2 className="list-title">Changements récents</h2>
      <div className="list">
      {list.map((d) => (
        <div key={d.id} className="row">
          <span className="row-main">
            <span className="row-title" style={{ whiteSpace: 'normal' }}>
              {d.title}
            </span>
            <span className="row-sub">
              {formatLongDate(d.decidedAt.slice(0, 10))} · {d.undone ? 'annulé' : d.decision === 'accepted' ? 'appliqué' : 'séance gardée'}
            </span>
          </span>
          {d.decision === 'accepted' && !d.undone && (
            <button type="button" className="link-btn" onClick={() => void undoDecision(d.id).then(() => toast('Séances remises comme avant'))}>
              Annuler
            </button>
          )}
        </div>
      ))}
      </div>
    </>
  );
}
