import { useState } from 'react';
import { db, getSettings, newId, updateSettings } from '../db/db';
import type { Illness } from '../db/types';
import { addDays, formatDayShort, todayISO } from '../lib/dates';
import { currentIllness, phaseOf, raceVerdicts, repriseStart, REPRISE_DAYS, setIllnesses, SICK_LABELS } from '../lib/illness';
import { haptic } from '../lib/theme';
import { toast } from '../lib/toast';
import { useLive } from '../lib/useLive';
import { useProposals } from '../lib/useProposals';
import { Sheet } from './Controls';
import { CoachTip } from './CoachTip';
import { IconThermo } from './Icons';

const dn = (d: string) => {
  const t = todayISO();
  if (d === t) return "aujourd'hui";
  if (d === addDays(t, -1)) return 'hier';
  if (d === addDays(t, 1)) return 'demain';
  const { dow, day } = formatDayShort(d);
  return `${dow.toLowerCase()} ${day}`;
};

async function saveIllness(i: Illness) {
  const s = await getSettings();
  const list = [...(s.illnesses ?? []).filter((x) => x.id !== i.id), i].sort((a, b) => a.start.localeCompare(b.start));
  setIllnesses(list);
  await updateSettings({ illnesses: list });
}

/**
 * Mode maladie. mode="entry" : petit lien « Je suis malade » (rien si une maladie est en cours).
 * mode="active" : carte de suivi (phase, conseil du coach, courses proches, « plus de fièvre »).
 */
export function IllnessCard({ mode }: { mode: 'entry' | 'active' }) {
  const today = todayISO();
  const data = useLive(async () => {
    const [settings, races] = await Promise.all([getSettings(), db.races.toArray()]);
    setIllnesses(settings.illnesses);
    return { ill: currentIllness(today), races };
  }, [today]);
  const tips = useProposals();
  const [declaring, setDeclaring] = useState(false);
  const [fever, setFever] = useState(false);
  const [stopping, setStopping] = useState(false);
  if (!data) return null;
  const { ill, races } = data;

  if (mode === 'entry')
    return ill ? null : (
      <>
        <button type="button" className="row indent" onClick={() => setDeclaring(true)}>
          <span className="row-icon" style={{ background: '#5ac8fa' }} aria-hidden="true">
            <IconThermo size={16} />
          </span>
          <span className="row-main">
            <span className="row-title">Je suis malade</span>
          </span>
          <span className="row-chev" aria-hidden="true" />
        </button>
        {declaring && <DeclareSheet onClose={() => setDeclaring(false)} />}
      </>
    );
  if (!ill) return null;

  const ph = phaseOf(ill, today);
  const r = repriseStart(ill);
  const status =
    ph === 'malade'
      ? 'Pas de sport tant qu’il y a de la fièvre.'
      : ph === 'attente'
        ? `Sans fièvre depuis ${dn(ill.feverFreeSince!)} : repos jusqu’à ${dn(addDays(r!, -1))}, puis reprise.`
        : ph === 'reprise'
          ? `Reprise très facile jusqu’à ${dn(addDays(r!, REPRISE_DAYS - 1))}.`
          : 'Footing très facile au plus.';
  const verdicts = raceVerdicts(ill, races, today);
  const illTips = tips?.all.filter((p) => p.id.startsWith('maladie-')) ?? [];
  const name = ill.label === 'Autre' ? 'Malade' : ill.label;

  return (
    <section className="card illness-card" aria-label="Mode maladie">
      <div className="card-row">
        <span className="eyebrow">
          {name} · depuis {dn(ill.start)}
        </span>
        <button type="button" className="link-btn" onClick={() => setStopping(true)}>
          Terminer
        </button>
      </div>
      <b className="ill-status">{status}</b>

      {illTips.map((p) => (
        <CoachTip key={p.id} p={p} sessions={tips!.sessions} />
      ))}

      {verdicts.length > 0 && (
        <div className="ill-races">
          {verdicts.map((v) => (
            <details key={v.race.id} className="ill-race">
              <summary>
                <span className="ill-race-name">
                  {v.race.shortName || v.race.name} <span className="muted">· {dn(v.race.date)}</span>
                </span>
                <span className={`ill-chip ${v.verdict}`}>{v.verdict === 'forfait' ? 'Forfait' : v.verdict === 'a-decider' ? 'À décider la veille' : 'Possible'}</span>
              </summary>
              <span className="small ill-race-why">{v.text}</span>
              {v.criteria && (
                <ul className="small ill-criteria">
                  {v.criteria.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </details>
          ))}
        </div>
      )}

      {ill.severe && !ill.feverFreeSince && (
        <button className="btn btn-secondary btn-small" type="button" onClick={() => setFever(true)}>
          Je n’ai plus de fièvre
        </button>
      )}
      {!ill.severe && (
        <button
          className="btn btn-secondary btn-small"
          type="button"
          onClick={() => void saveIllness({ ...ill, severe: true }).then(() => toast('Noté : repos complet tant qu’il y a de la fièvre'))}
        >
          J’ai de la fièvre ou des courbatures
        </button>
      )}
      <span className="small muted" style={{ fontSize: 11.5, textAlign: 'center' }}>
        Fièvre &gt; 3 jours, douleur thoracique ou palpitations : médecin.
      </span>

      {fever && (
        <Sheet title="Plus de fièvre depuis…" onClose={() => setFever(false)}>
          <span className="small muted">Premier jour sans fièvre, sans médicament contre la fièvre (paracétamol, ibuprofène…).</span>
          {[today, addDays(today, -1), addDays(today, -2)].filter((d) => d >= ill.start).map((d) => (
            <button
              key={d}
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                haptic(15);
                void saveIllness({ ...ill, feverFreeSince: d }).then(() => {
                  toast('Noté ✓ Le plan passe en reprise progressive');
                  setFever(false);
                });
              }}
            >
              Depuis {dn(d)}
            </button>
          ))}
        </Sheet>
      )}
      {stopping && (
        <Sheet title="Terminer le mode maladie ?" onClose={() => setStopping(false)}>
          <span className="small muted">
            {ill.severe && ph !== 'reprise'
              ? 'Tu sautes la reprise progressive conseillée. Fais-le seulement si tu t’es trompé (pas vraiment malade).'
              : 'Le plan reprend normalement. Les séances déjà adaptées restent comme elles sont (tu peux les modifier).'}
          </span>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void saveIllness({ ...ill, end: addDays(today, -1) }).then(() => (toast('Mode maladie terminé'), setStopping(false)))}
          >
            Terminer
          </button>
          <button
            className="btn btn-secondary btn-small"
            type="button"
            onClick={() => void getSettings().then(async (s) => {
              const list = (s.illnesses ?? []).filter((x) => x.id !== ill.id);
              setIllnesses(list);
              await updateSettings({ illnesses: list });
              toast('Maladie effacée');
              setStopping(false);
            })}
          >
            Effacer (déclarée par erreur)
          </button>
        </Sheet>
      )}
    </section>
  );
}

function DeclareSheet({ onClose }: { onClose: () => void }) {
  const today = todayISO();
  const [label, setLabel] = useState('Grippe');
  const [start, setStart] = useState(today);
  const [severe, setSevere] = useState<boolean | null>(null);
  async function save() {
    if (severe === null) return;
    await saveIllness({ id: newId(), start, label, severe });
    haptic(20);
    toast(severe ? 'Repos complet : le coach adapte ton plan' : 'Noté : très facile seulement');
    onClose();
  }
  return (
    <Sheet title="Je suis malade" onClose={onClose}>
      <div className="pills">
        {SICK_LABELS.map((l) => (
          <button key={l} type="button" className={`chip${label === l ? ' on' : ''}`} aria-pressed={label === l} onClick={() => setLabel(l)}>
            {l}
          </button>
        ))}
      </div>
      <span className="small" style={{ fontWeight: 700 }}>
        Depuis quand ?
      </span>
      <div className="pills">
        {[today, addDays(today, -1), addDays(today, -2), addDays(today, -3)].map((d) => (
          <button key={d} type="button" className={`chip${start === d ? ' on' : ''}`} aria-pressed={start === d} onClick={() => setStart(d)}>
            {dn(d)}
          </button>
        ))}
      </div>
      <span className="small" style={{ fontWeight: 700 }}>
        Tes symptômes ?
      </span>
      <button type="button" className={`pick-row${severe === true ? ' on' : ''}`} aria-pressed={severe === true} onClick={() => setSevere(true)}>
        <span className="pick-dot" aria-hidden="true" />
        <span style={{ flex: 1, textAlign: 'left' }}>
          <b style={{ fontWeight: 600 }}>Fièvre, courbatures ou toux profonde</b>
          <br />
          <span className="small muted">Repos complet, puis reprise progressive</span>
        </span>
      </button>
      <button type="button" className={`pick-row${severe === false ? ' on' : ''}`} aria-pressed={severe === false} onClick={() => setSevere(false)}>
        <span className="pick-dot" aria-hidden="true" />
        <span style={{ flex: 1, textAlign: 'left' }}>
          <b style={{ fontWeight: 600 }}>Juste le nez ou la gorge, sans fièvre</b>
          <br />
          <span className="small muted">Footing très facile possible</span>
        </span>
      </button>
      <button className="btn btn-primary" type="button" disabled={severe === null} onClick={() => void save()}>
        Adapter mon plan
      </button>
    </Sheet>
  );
}
