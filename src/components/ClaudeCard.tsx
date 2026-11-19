import { useState } from 'react';
import { db, getSettings } from '../db/db';
import type { PlannedSession } from '../db/types';
import { proposals } from '../lib/adapt';
import { claudeBrief } from '../lib/claudeBrief';
import { applyReply, errorsForClaude, readReply, type Op, type ParsedReply } from '../lib/claudeReply';
import { formatDayShort, todayISO } from '../lib/dates';
import { formatDuration, formatNumber } from '../lib/format';
import { applyPlan, diffPlan, PlanError, type ParsedPlan, type PlanDiff } from '../lib/planFile';
import { learnProfile } from '../lib/profile';
import { setIllnesses } from '../lib/illness';
import { haptic } from '../lib/theme';
import { toast } from '../lib/toast';
import { useLive } from '../lib/useLive';
import { Sheet } from './Controls';
import { PlanPreview } from './PlanCard';

/** Dossier complet pour Claude (historique, profil appris, mémoire), préparé à l'avance pour copier d'un geste. */
function useBrief(): string | undefined {
  const today = todayISO();
  return useLive(async () => {
    const [sessions, activities, checkIns, decisions, races, settings, sleeps, journal] = await Promise.all([
      db.plannedSessions.toArray(),
      db.activities.toArray(),
      db.checkIns.toArray(),
      db.coachDecisions.toArray(),
      db.races.toArray(),
      getSettings(),
      db.sleeps.toArray(),
      db.journal.toArray(),
    ]);
    setIllnesses(settings.illnesses);
    const data = { sessions, activities, checkIns };
    const profile = learnProfile({ activities, checkIns, sleeps, decisions, hrRest: settings.hrRest, hrMax: settings.hrMax }, today);
    const list = proposals(data, decisions, today, races.map((r) => r.date), profile.personal, races);
    return claudeBrief(data, races, list, decisions, today, { rest: settings.hrRest, max: settings.hrMax }, { profile, journal, sleeps });
  }, [today]);
}

const short = (s: PlannedSession) => {
  const { dow, day } = formatDayShort(s.date);
  const facts = [s.durationMin ? formatDuration(s.durationMin) : null, s.distanceKm ? `${formatNumber(s.distanceKm)} km` : null, s.elevationGain ? `${formatNumber(s.elevationGain, 0)} m D+` : null, s.intensity].filter(Boolean);
  return `${dow.toLowerCase()} ${day} · ${s.title}${facts.length ? ` · ${facts.join(' · ')}` : ''}`;
};
const OP_LABEL: Record<Op['kind'], string> = { modifier: 'Modifiée', deplacer: 'Déplacée', supprimer: 'Supprimée', ajouter: 'Ajoutée' };

/** Coach Claude : 1. copier le dossier et ouvrir Claude, 2. coller sa réponse → aperçu → appliquer. */
export function ClaudeCard() {
  const brief = useBrief();
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');
  const [reply, setReply] = useState<ParsedReply | null>(null);
  const [plan, setPlan] = useState<{ plan: ParsedPlan; diff: PlanDiff } | null>(null);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  function copyAndOpen() {
    if (!brief) return;
    // Tout se passe dans le geste (sinon iPhone bloque le presse-papiers ou l'ouverture)
    void navigator.clipboard
      .writeText(brief)
      .then(() => toast('Dossier copié ✓ Colle-le dans Claude'))
      .catch(() => toast('Copie impossible : utilise « Partager »'));
    window.open('https://claude.ai/new', '_blank', 'noopener');
  }
  async function share() {
    if (!brief) return;
    try {
      await navigator.share({ title: 'Mon dossier entraînement', text: brief });
    } catch {
      /* annulé */
    }
  }
  async function openPaste() {
    let t = '';
    try {
      t = await navigator.clipboard.readText();
    } catch {
      /* lecture refusée : on colle à la main */
    }
    setText(t);
    setPasting(true);
  }
  async function analyse() {
    try {
      const [sessions, activities] = await Promise.all([db.plannedSessions.toArray(), db.activities.toArray()]);
      const r = readReply(text, sessions, activities);
      if (r.kind === 'plan') setPlan({ plan: r.plan, diff: await diffPlan(r.plan) });
      else setReply(r.reply);
      setPasting(false);
    } catch (e) {
      setErrors(e instanceof PlanError ? e.errors : [(e as Error).message]);
    }
  }
  async function confirm() {
    if (!reply || busy) return;
    setBusy(true);
    try {
      await applyReply(reply);
      haptic(20);
      toast(reply.ops.length ? `${reply.ops.length} séance${reply.ops.length > 1 ? 's' : ''} mise${reply.ops.length > 1 ? 's' : ''} à jour ✓ (annulable ci-dessous)` : 'Enseignements ajoutés à la mémoire ✓');
      setReply(null);
      setText('');
    } finally {
      setBusy(false);
    }
  }
  async function confirmPlan() {
    if (!plan || busy) return;
    setBusy(true);
    try {
      const v = await applyPlan(plan.plan, plan.diff);
      toast(`Plan « ${v.version} » importé ✓`);
      setPlan(null);
      setText('');
    } catch (e) {
      toast(`L'import du plan a échoué, rien n'a été modifié (${(e as Error)?.message ?? e})`);
    } finally {
      setBusy(false);
    }
  }
  async function copyErrors(errs: string[]) {
    try {
      await navigator.clipboard.writeText(errorsForClaude(errs));
      toast('Copié ✓ Colle-le à Claude');
    } catch {
      toast('Copie impossible');
    }
  }

  return (
    <section className="card" style={{ gap: 10 }}>
      <span className="eyebrow">Coach Claude</span>
      <span className="small" style={{ lineHeight: 1.45 }}>
        Claude reçoit ton dossier complet : tout ton historique, ce que l'appli a appris sur toi et la mémoire de vos décisions. Discutez, puis colle sa réponse ici : l'appli applique ce que vous avez décidé et retient ses enseignements.
      </span>
      <button className="btn btn-primary btn-small" type="button" disabled={!brief} onClick={copyAndOpen}>
        1 · Copier mon dossier et ouvrir Claude
      </button>
      <button className="btn btn-secondary btn-small" type="button" onClick={() => void openPaste()}>
        2 · Coller la réponse de Claude
      </button>
      <button type="button" className="link-btn" style={{ alignSelf: 'center' }} disabled={!brief} onClick={() => void share()}>
        Partager le dossier autrement…
      </button>
      <span className="small muted" style={{ fontSize: 12 }}>
        Rien ne part sans toi : le dossier ne quitte le téléphone que quand tu le colles dans Claude.
      </span>

      {pasting && (
        <Sheet title="Réponse de Claude" onClose={() => setPasting(false)}>
          <span className="small muted">Colle ici la réponse de Claude (au moins son bloc final « ```json »). Dans Claude : appui long sur sa réponse → Copier.</span>
          <textarea className="textarea" rows={8} placeholder="Colle la réponse de Claude ici" value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
          <button className="btn btn-primary" type="button" disabled={!text.trim()} onClick={() => void analyse()}>
            Voir ce qui va changer
          </button>
          <button className="btn btn-secondary btn-small" type="button" onClick={() => setPasting(false)}>
            Annuler
          </button>
        </Sheet>
      )}

      {errors && (
        <Sheet title="Je n'arrive pas à lire cette réponse" onClose={() => setErrors(null)}>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <button className="btn btn-primary" type="button" onClick={() => void copyErrors(errors)}>
            Copier pour Claude
          </button>
          <button className="btn btn-secondary btn-small" type="button" onClick={() => setErrors(null)}>
            Fermer
          </button>
        </Sheet>
      )}

      {reply && (
        <Sheet title="Décidé avec Claude" onClose={() => !busy && setReply(null)}>
          <span style={{ fontSize: 14, lineHeight: 1.45 }}>{reply.resume}</span>
          {reply.ops.map((o, i) => (
            <div key={i} className="diff-week" style={{ gap: 2 }}>
              <span className="small" style={{ fontWeight: 700 }}>
                {OP_LABEL[o.kind]}
              </span>
              {o.before && <span className={`small ${o.kind === 'supprimer' ? 'diff-old' : 'muted'}`}>{o.kind === 'supprimer' ? short(o.before) : `Avant : ${short(o.before)}`}</span>}
              {o.after && <span className="small diff-new">{o.before ? 'Après : ' : ''}{short(o.after)}</span>}
            </div>
          ))}
          {reply.lessons.length > 0 && (
            <div className="diff-week" style={{ gap: 4 }}>
              <span className="small" style={{ fontWeight: 700 }}>
                🧠 Ajouté à la mémoire du coach
              </span>
              {reply.lessons.map((l) => (
                <span key={l.texte} className="small">
                  {l.texte}
                </span>
              ))}
            </div>
          )}
          {reply.errors.length > 0 && (
            <div className="alert-card warn" role="alert" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <span className="small" style={{ fontWeight: 700 }}>
                {reply.errors.length} point{reply.errors.length > 1 ? 's' : ''} ignoré{reply.errors.length > 1 ? 's' : ''} :
              </span>
              {reply.errors.map((e) => (
                <span key={e} className="small">
                  {e}
                </span>
              ))}
              <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => void copyErrors(reply.errors)}>
                Copier pour Claude
              </button>
            </div>
          )}
          {(reply.ops.length > 0 || reply.lessons.length > 0) && (
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void confirm()}>
              Appliquer
            </button>
          )}
          <button className="btn btn-secondary btn-small" type="button" disabled={busy} onClick={() => setReply(null)}>
            Annuler
          </button>
        </Sheet>
      )}

      {plan && <PlanPreview plan={plan.plan} diff={plan.diff} busy={busy} onConfirm={() => void confirmPlan()} onClose={() => setPlan(null)} />}
    </section>
  );
}
