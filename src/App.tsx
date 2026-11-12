import { useEffect } from 'react';
import { getSettings } from './db/db';
import { useLive } from './lib/useLive';
import { useRoute } from './lib/router';
import { useApplyTheme } from './lib/theme';
import { NavBar } from './components/NavBar';
import { Accueil } from './screens/Accueil';
import { Reglages } from './screens/Reglages';
import { Bientot } from './screens/Bientot';
import { Checkin } from './screens/Checkin';
import { Debrief } from './screens/Debrief';
import { Plan } from './screens/Plan';
import { Charge } from './screens/Charge';
import { Progression } from './screens/Progression';
import { Courses } from './screens/Courses';
import { CoursePlan } from './screens/CoursePlan';
import { ToastHost } from './lib/toast';
import { useSwipeTabs } from './lib/useSwipeTabs';

export function App() {
  const { name: route, params } = useRoute();
  const settings = useLive(getSettings);
  useApplyTheme(settings?.theme);
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
      {route === 'parcours' && (
        <Bientot title="Parcours" step={7} text="Tes idées de sorties à Nice et à Saint-Cloud, avec carte et étiquettes." />
      )}
      {route !== 'debrief' && <NavBar route={route === 'progression' ? 'charge' : route === 'courses' || route === 'course' ? 'accueil' : route} />}
      <ToastHost />
    </>
  );
}
