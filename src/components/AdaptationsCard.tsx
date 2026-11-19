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
    <section className="card" style={{ gap: 4 }}>
      <span className="eyebrow">Changements du plan · 14 derniers jours</span>
      {list.map((d) => (
        <div key={d.id} className="card-row" style={{ minHeight: 44, gap: 10 }}>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span className="small" style={{ fontWeight: 600 }}>
              {d.title}
            </span>
            <span className="small muted" style={{ fontSize: 12 }}>
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
    </section>
  );
}
