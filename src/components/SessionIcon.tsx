import type { SessionType } from '../db/types';
import { IconBike, IconBoot, IconDumbbell, IconFlag, IconMoon, IconMountain } from './Icons';

export const SESSION_LOOK: Record<SessionType, { label: string; bg: string; Icon: (p: { size?: number }) => React.JSX.Element }> = {
  Running: { label: 'Course à pied', bg: 'var(--grad-coral)', Icon: IconMountain },
  Course: { label: 'Course (compétition)', bg: 'var(--grad-coral)', Icon: IconFlag },
  Rando: { label: 'Rando', bg: 'var(--grad-teal)', Icon: IconBoot },
  Vélo: { label: 'Vélo', bg: 'var(--grad-teal)', Icon: IconBike },
  Renfo: { label: 'Renfo', bg: 'var(--grad-violet)', Icon: IconDumbbell },
  Repos: { label: 'Repos', bg: 'var(--off-fill)', Icon: IconMoon },
};

export function SessionIcon({ type, size = 40 }: { type: SessionType; size?: number }) {
  const { bg, Icon } = SESSION_LOOK[type];
  return (
    <span
      aria-hidden="true"
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: size * 0.35,
        background: bg,
        color: type === 'Repos' ? 'var(--ink)' : '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={size / 2} />
    </span>
  );
}
