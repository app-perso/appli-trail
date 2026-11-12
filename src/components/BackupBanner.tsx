import { db, getSettings } from '../db/db';
import { useLive } from '../lib/useLive';
import { href } from '../lib/router';
import { IconShield } from './Icons';

const WEEK = 7 * 86_400_000;

/** Bannière discrète si la dernière sauvegarde date de plus de 7 jours. */
export function BackupBanner() {
  const state = useLive(async () => {
    const s = await getSettings();
    const hasData = (await db.activities.count()) + (await db.checkIns.count()) + (await db.plannedSessions.count()) > 0;
    const last = s.lastBackupAt ? new Date(s.lastBackupAt).getTime() : null;
    const days = last ? Math.floor((Date.now() - last) / 86_400_000) : null;
    // Pas de bannière tant qu'il n'y a encore rien de personnel à sauvegarder
    const show = last ? Date.now() - last > WEEK : hasData;
    return { show, days };
  });
  if (!state?.show) return null;
  return (
    <a className="banner" href={href('reglages')}>
      <span className="dot">
        <IconShield />
      </span>
      <span style={{ flex: 1 }}>
        <b style={{ fontWeight: 600 }}>Pense à faire une sauvegarde</b>
        <br />
        <span className="muted small">
          {state.days === null ? 'Aucune sauvegarde pour le moment' : `Dernière il y a ${state.days} jours`}
        </span>
      </span>
      <span className="muted" aria-hidden="true">→</span>
    </a>
  );
}
