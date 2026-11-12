// Routage par « # » dans l'adresse (compatible GitHub Pages) : #/checkin, #/reglages…
import { useEffect, useState } from 'react';

export type RouteName = 'accueil' | 'checkin' | 'charge' | 'parcours' | 'reglages';
const ROUTES: RouteName[] = ['accueil', 'checkin', 'charge', 'parcours', 'reglages'];

function current(): RouteName {
  const name = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return (ROUTES as string[]).includes(name) ? (name as RouteName) : 'accueil';
}

export function useRoute(): RouteName {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const on = () => {
      setRoute(current());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const href = (r: RouteName) => (r === 'accueil' ? '#/' : `#/${r}`);
