import type { Alert } from '../lib/coach';

const ICONS: Record<Alert['icon'], React.JSX.Element> = {
  descente: <path d="M4 6 L10 12 L14 9 L20 17 M14 17 H20 V11" />,
  charge: <path d="M5 20 V13 M12 20 V6 M19 20 V10" />,
  forme: <path d="M3 12 h4 l2 -5 l4 10 l2 -5 h6" />,
  douleur: <path d="M12 4 V14 M12 19 V19.5" />,
  couloir: <path d="M4 18 L9 12 L13 15 L20 6 M15 6 H20 V11" />,
  recup: <path d="M20 14.5 A8 8 0 1 1 9.5 4 A6.5 6.5 0 0 0 20 14.5 Z" />,
};

/** Carte d'alerte du coach (couleur selon la gravité). */
export function AlertCard({ alert }: { alert: Pick<Alert, 'level' | 'icon' | 'title' | 'text'> }) {
  return (
    <div className={`alert-card ${alert.level}`} role={alert.level === 'stop' ? 'alert' : 'note'}>
      <span className="alert-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          {ICONS[alert.icon]}
        </svg>
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{alert.title}</span>
        <span className="small muted" style={{ lineHeight: 1.35 }}>
          {alert.text}
        </span>
      </div>
    </div>
  );
}
