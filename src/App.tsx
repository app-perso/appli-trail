import { useEffect } from 'react';
import { getSettings } from './db/db';
import { useLive } from './lib/useLive';
import { useRoute } from './lib/router';
import { useApplyTheme } from './lib/theme';
import { NavBar } from './components/NavBar';
import { Accueil } from './screens/Accueil';
import { Reglages } from './screens/Reglages';
import { Bientot } from './screens/Bientot';

export function App() {
  const route = useRoute();
  const settings = useLive(getSettings);
  useApplyTheme(settings?.theme);

  useEffect(() => {
    // Demande à l'iPhone de ne pas effacer les données de l'appli pour libérer de la place
    void navigator.storage?.persist?.();
  }, []);

  return (
    <>
      <div className="halos" aria-hidden="true" />
      {route === 'accueil' && <Accueil />}
      {route === 'reglages' && <Reglages />}
      {route === 'checkin' && (
        <Bientot title="Check-in du matin" step={2} text="Sommeil, forme, moral, douleurs, lieu et temps dispo : en 20 secondes chaque matin." />
      )}
      {route === 'charge' && (
        <Bientot title="Charge & alertes" step={5} text="Ratio de charge, km-effort, D+ et D− de la semaine, et alertes pour éviter la blessure." />
      )}
      {route === 'parcours' && (
        <Bientot title="Parcours" step={7} text="Tes idées de sorties à Nice et à Saint-Cloud, avec carte et étiquettes." />
      )}
      <NavBar route={route} />
    </>
  );
}
