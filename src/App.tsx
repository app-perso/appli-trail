import { useEffect } from 'react';
import { getSettings } from './db/db';
import { useLive } from './lib/useLive';
import { useRoute, type RouteName } from './lib/router';
import { useApplyTheme } from './lib/theme';
import { setActiveRules } from './lib/rules';
import { NavBar } from './components/NavBar';
import { Accueil } from './screens/Accueil';
import { Reglages } from './screens/Reglages';
import { Parcours } from './screens/Parcours';
import { Semaine } from './screens/Semaine';
import { SeanceDetail } from './screens/SeanceDetail';
import { Coach } from './screens/Coach';
import { ImportSeance } from './screens/ImportSeance';
import { Checkin } from './screens/Checkin';
import { Debrief } from './screens/Debrief';
import { Plan } from './screens/Plan';
import { Charge } from './screens/Charge';
import { Progression } from './screens/Progression';
import { Courses } from './screens/Courses';
import { CoursePlan } from './screens/CoursePlan';
import { ToastHost } from './lib/toast';
import { useSwipeTabs } from './lib/useSwipeTabs';

// Onglet surligné pour les écrans qui ne sont pas des onglets
const NAV_OF: Partial<Record<RouteName, RouteName>> = {
  progression: 'charge',
  checkin: 'accueil',
  courses: 'accueil',
  course: 'accueil',
  reglages: 'accueil',
  plan: 'semaine',
  seance: 'semaine',
  coach: 'accueil',
  import: 'accueil',
};

export function App() {
  const { name: route, params } = useRoute();
  const settings = useLive(getSettings);
  useApplyTheme(settings?.theme);
  // Règles d'alerte du plan en vigueur (avant le rendu des écrans qui les utilisent)
  setActiveRules(settings?.rules);
  useSwipeTabs(route);

  useEffect(() => {
    // Demande à l'iPhone de ne pas effacer les données de l'appli pour libérer de la place
    void navigator.storage?.persist?.();
  }, []);

  return (
    <>
      <div className="halos" aria-hidden="true" />
      {route === 'accueil' && <Accueil />}
      {route === 'reglages' && <Reglages />}
      {route === 'checkin' && <Checkin />}
      {route === 'plan' && <Plan weekParam={params[0]} />}
      {route === 'debrief' && <Debrief key={params[0]} sessionId={params[0] ?? ''} />}
      {route === 'charge' && <Charge />}
      {route === 'progression' && <Progression />}
      {route === 'courses' && <Courses key={params[0]} initialId={params[0]} />}
      {route === 'course' && <CoursePlan key={params[0]} raceId={params[0] ?? ''} />}
      {route === 'parcours' && <Parcours />}
      {route === 'semaine' && <Semaine />}
      {route === 'coach' && <Coach key={params[0] ?? 'p'} tab={params[0]} />}
      {route === 'import' && <ImportSeance key={params[0] ?? 'nouvelle'} sessionId={params[0]} />}
      {route === 'seance' && <SeanceDetail key={params[0]} id={params[0] ?? ''} />}
      {route !== 'debrief' && route !== 'import' && <NavBar route={NAV_OF[route] ?? route} />}
      <ToastHost />
    </>
  );
}
