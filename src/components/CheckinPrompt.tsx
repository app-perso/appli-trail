import { db } from '../db/db';
import { todayISO } from '../lib/dates';
import { href } from '../lib/router';
import { useLive } from '../lib/useLive';
import { IconPulse } from './Icons';

/** Le matin : « Check-in du matin · à compléter ». Disparaît une fois le check-in fait, jusqu'au lendemain. */
export function CheckinPrompt() {
  const today = todayISO();
  const state = useLive(async () => ((await db.checkIns.where('date').equals(today).count()) > 0 ? 'done' : 'todo'), [today]);
  if (state !== 'todo') return null;
  return (
    <a className="checkin-prompt" href={href('checkin')}>
      <span className="cp-icon" aria-hidden="true">
        <IconPulse size={22} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontWeight: 700, fontSize: 15 }}>Check-in du matin</b>
        <br />
        <span className="small" style={{ opacity: 0.9 }}>
          À compléter · 20 s : sommeil, forme, douleurs
        </span>
      </span>
      <span aria-hidden="true" style={{ fontSize: 20 }}>
        →
      </span>
    </a>
  );
}
