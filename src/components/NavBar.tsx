import { href, type RouteName } from '../lib/router';
import { haptic } from '../lib/theme';
import { IconBars, IconCalendar, IconMap, IconMountain } from './Icons';

const ITEMS: { route: RouteName; label: string; Icon: (p: { size?: number }) => React.JSX.Element }[] = [
  { route: 'accueil', label: 'Objectif', Icon: IconMountain },
  { route: 'charge', label: 'Charge', Icon: IconBars },
  { route: 'semaine', label: 'Semaine', Icon: IconCalendar },
  { route: 'parcours', label: 'Parcours', Icon: IconMap },
];

export function NavBar({ route }: { route: RouteName }) {
  return (
    <nav className="nav" aria-label="Navigation principale">
      {ITEMS.map(({ route: r, label, Icon }) => (
        <a key={r} href={href(r)} aria-label={label} aria-current={r === route ? 'page' : undefined} onClick={() => haptic()}>
          <Icon />
        </a>
      ))}
    </nav>
  );
}
