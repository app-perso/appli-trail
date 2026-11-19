import { href, type RouteName } from '../lib/router';
import { haptic } from '../lib/theme';
import { IconBars, IconCalendar, IconSpark, IconSun } from './Icons';

const ITEMS: { route: RouteName; label: string; Icon: (p: { size?: number }) => React.JSX.Element }[] = [
  { route: 'accueil', label: 'Aujourd’hui', Icon: IconSun },
  { route: 'semaine', label: 'Plan', Icon: IconCalendar },
  { route: 'charge', label: 'Progrès', Icon: IconBars },
  { route: 'coach', label: 'Coach', Icon: IconSpark },
];

export function NavBar({ route }: { route: RouteName }) {
  return (
    <nav className="nav" aria-label="Navigation principale">
      {ITEMS.map(({ route: r, label, Icon }) => (
        <a key={r} href={href(r)} aria-label={label} aria-current={r === route ? 'page' : undefined} onClick={() => haptic()}>
          <Icon />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}
