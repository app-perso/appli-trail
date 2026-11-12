// Routage par « # » dans l'adresse (compatible GitHub Pages) : #/checkin, #/debrief/<id>…
import { useEffect, useState } from 'react';

export type RouteName = 'accueil' | 'checkin' | 'charge' | 'parcours' | 'reglages' | 'debrief' | 'plan' | 'progression';
const ROUTES: RouteName[] = ['accueil', 'checkin', 'charge', 'parcours', 'reglages', 'debrief', 'plan', 'progression'];

export interface Route {
  name: RouteName;
  params: string[];
}

function current(): Route {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const name = parts[0] ?? '';
  if ((ROUTES as string[]).includes(name)) return { name: name as RouteName, params: parts.slice(1) };
  return { name: 'accueil', params: [] };
}

export function useRoute(): Route {
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

export const href = (r: RouteName, ...params: string[]) =>
  r === 'accueil' ? '#/' : `#/${[r, ...params].map(encodeURIComponent).join('/')}`;

export function go(r: RouteName, ...params: string[]) {
  window.location.hash = href(r, ...params);
}
