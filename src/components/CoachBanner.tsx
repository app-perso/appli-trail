import { db } from '../db/db';
import { proposals } from '../lib/adapt';
import { todayISO } from '../lib/dates';
import { href } from '../lib/router';
import { useLive } from '../lib/useLive';

/** « Le coach te propose N adaptations » — caché s'il n'y a rien (sauf quiet = lien discret). */
export function CoachBanner({ quiet = false }: { quiet?: boolean }) {
  const today = todayISO();
  const n = useLive(async () => {
    const [sessions, activities, checkIns, decisions, races] = await Promise.all([db.plannedSessions.toArray(), db.activities.toArray(), db.checkIns.toArray(), db.coachDecisions.toArray(), db.races.toArray()]);
    return proposals({ sessions, activities, checkIns }, decisions, today, races.map((r) => r.date));
  }, [today]);
  if (!n) return null;
  if (!n.length)
    return quiet ? (
      <a className="link-btn" href={href('coach')} style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
        Parler au coach →
      </a>
    ) : null;
  const top = n[0];
  return (
    <a className={`coach-banner ${top.level}`} href={href('coach')}>
      <span className="cb-avatar" aria-hidden="true">
        🧭
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontWeight: 700, fontSize: 14 }}>
          Le coach te propose {n.length} adaptation{n.length > 1 ? 's' : ''}
        </b>
        <br />
        <span className="small muted clamp1">{top.title}</span>
      </span>
      <span aria-hidden="true">→</span>
    </a>
  );
}
