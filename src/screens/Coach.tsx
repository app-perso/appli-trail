import { ProfileCard } from '../components/ProfileCard';
import { ClaudeCard } from '../components/ClaudeCard';
import { AdaptationsCard } from '../components/AdaptationsCard';
import { PlanCard } from '../components/PlanCard';
import { CoachJournal } from '../components/CoachJournal';

/** Coach : ce que l'appli a appris, Claude, les changements du plan, le plan importé, la mémoire. */
export function Coach() {
  return (
    <main className="screen">
      <header className="large-head">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="head-date">Ton entraînement s’adapte à toi</span>
          <h1 className="screen-title">Coach</h1>
        </div>
      </header>
      <ProfileCard />
      <ClaudeCard />
      <AdaptationsCard />
      <PlanCard />
      <div className="list">
        <details className="row-details">
          <summary className="row">
            <span className="row-main">
              <span className="row-title">Mémoire du coach</span>
              <span className="row-sub">Décisions et enseignements passés</span>
            </span>
            <span className="row-chev" aria-hidden="true" />
          </summary>
          <div style={{ padding: '0 16px 16px' }}>
            <CoachJournal />
          </div>
        </details>
      </div>
    </main>
  );
}
