import { db, getSettings } from '../db/db';
import { proposals } from '../lib/adapt';
import { learnProfile } from '../lib/profile';
import { claudeBrief } from '../lib/claudeBrief';
import { todayISO } from '../lib/dates';
import { toast } from '../lib/toast';

/** Copier un résumé de l'entraînement pour en discuter avec Claude (rien n'est envoyé par l'appli). */
export function ClaudeCard() {
  async function copy() {
    const today = todayISO();
    const [sessions, activities, checkIns, decisions, races, settings, sleeps] = await Promise.all([
      db.plannedSessions.toArray(),
      db.activities.toArray(),
      db.checkIns.toArray(),
      db.coachDecisions.toArray(),
      db.races.toArray(),
      getSettings(),
      db.sleeps.toArray(),
    ]);
    const data = { sessions, activities, checkIns };
    const me = learnProfile({ activities, checkIns, sleeps, decisions, hrRest: settings.hrRest, hrMax: settings.hrMax }, today);
    const list = proposals(data, decisions, today, races.map((r) => r.date), me.personal);
    const text = claudeBrief(data, races, list, decisions, today, { rest: settings.hrRest, max: settings.hrMax });
    try {
      await navigator.clipboard.writeText(text);
      toast('Résumé copié ✓ Colle-le dans Claude');
    } catch {
      try {
        await navigator.share({ title: 'Mon point entraînement', text });
      } catch {
        toast('Impossible de copier le résumé');
      }
    }
  }
  return (
    <section className="card" style={{ gap: 10 }}>
      <span className="eyebrow">Discuter avec Claude</span>
      <span className="small" style={{ lineHeight: 1.45 }}>
        Copie un résumé (14 derniers jours, check-ins, débriefs, charge, plan à venir), colle-le dans Claude. Pour changer le plan, demande-lui un fichier plan et importe-le ci-dessus.
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-small" type="button" style={{ flex: 1 }} onClick={() => void copy()}>
          Copier le résumé
        </button>
        <a className="btn btn-secondary btn-small" style={{ flex: 1 }} href="https://claude.ai/new" target="_blank" rel="noreferrer">
          Ouvrir Claude ↗
        </a>
      </div>
    </section>
  );
}
