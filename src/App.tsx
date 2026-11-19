import { useEffect } from 'react';
import { db, getSettings } from './db/db';
import { useLive } from './lib/useLive';
import { useRoute, type RouteName } from './lib/router';
import { useApplyTheme } from './lib/theme';
import { setActiveRules, setLearnedRules } from './lib/rules';
import { setIllnesses } from './lib/illness';

import { learnProfile } from './lib/profile';
import { todayISO } from './lib/dates';
import { NavBar } from './components/NavBar';
import { Accueil } from './screens/Accueil';
import { Reglages } from './screens/Reglages';
import { Parcours } from './screens/Parcours';
import { Semaine } from './screens/Semaine';
import { SeanceDetail } from './screens/SeanceDetail';
import { ImportSeance } from './screens/ImportSeance';
import { Checkin } from './screens/Checkin';
import { Debrief } from './screens/Debrief';
import { Coach } from './screens/Coach';
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
  parcours: 'accueil',
  reglages: 'accueil',
  plan: 'semaine',
  seance: 'semaine',
  import: 'accueil',
};

export function App() {
  const { name: route, params } = useRoute();
  const settings = useLive(getSettings);
  useApplyTheme(settings?.theme);
  // Règles d'alerte du plan en vigueur (avant le rendu des écrans qui les utilisent)
  setActiveRules(settings?.rules);
  setIllnesses(settings?.illnesses);
  // Seuils appris de ton historique (appliqués seulement s'ils sont plus prudents)
  const learned = useLive(async () => {
    const [activities, checkIns, sleeps, s] = await Promise.all([db.activities.toArray(), db.checkIns.toArray(), db.sleeps.toArray(), getSettings()]);
    setIllnesses(s.illnesses);
    return learnProfile({ activities, checkIns, sleeps, hrRest: s.hrRest, hrMax: s.hrMax }, todayISO()).overrides;
  });
  if (learned) setLearnedRules(learned);
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
      {route === 'plan' && (params[0] === 'suivi' ? <Coach /> : <Semaine key={params[0] ?? 'c'} weekParam={params[0]} />)}
      {route === 'debrief' && <Debrief key={params[0]} sessionId={params[0] ?? ''} />}
      {route === 'charge' && <Charge />}
      {route === 'progression' && <Progression />}
      {route === 'courses' && <Courses key={params[0]} initialId={params[0]} />}
      {route === 'course' && <CoursePlan key={params[0]} raceId={params[0] ?? ''} />}
      {route === 'parcours' && <Parcours />}
      {route === 'semaine' && <Semaine key={params[0] ?? 'c'} weekParam={params[0]} />}
      {route === 'coach' && <Coach />}
      {route === 'import' && <ImportSeance key={params[0] ?? 'nouvelle'} sessionId={params[0]} />}
      {route === 'seance' && <SeanceDetail key={params[0]} id={params[0] ?? ''} />}
      {route !== 'debrief' && route !== 'import' && <NavBar route={NAV_OF[route] ?? route} />}
      <ToastHost />
    </>
  );
}
