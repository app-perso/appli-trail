import { useMemo, useRef, useState } from 'react';
import { db, getSettings } from '../db/db';
import type { PlannedSession } from '../db/types';
import { proposals, describe, type Option, type Proposal } from '../lib/adapt';
import { acceptProposal, refuseProposal, undoDecision } from '../lib/adaptApply';
import { claudeBrief } from '../lib/claudeBrief';
import { currentRatio, feuDuJour } from '../lib/coach';
import { todayISO } from '../lib/dates';
import { formatNumber } from '../lib/format';
import { href } from '../lib/router';
import { haptic } from '../lib/theme';
import { toast } from '../lib/toast';
import { useLive } from '../lib/useLive';
import { IconBack } from '../components/Icons';

type Msg = { from: 'coach' | 'me'; text: string; undoId?: string };

export function Coach() {
  const today = todayISO();
  const data = useLive(async () => {
    const [sessions, activities, checkIns, decisions, races, settings] = await Promise.all([
      db.plannedSessions.toArray(),
      db.activities.toArray(),
      db.checkIns.toArray(),
      db.coachDecisions.toArray(),
      db.races.toArray(),
      getSettings(),
    ]);
    return { sessions, activities, checkIns, decisions, races, settings };
  }, [today]);
  const [thread, setThread] = useState<Msg[]>([]);
  const [later, setLater] = useState<Set<string>>(new Set());
  const [undone, setUndone] = useState<Set<string>>(new Set());
  /** Réponses du coach à « Pourquoi ? » pour la proposition en cours */
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const busy = useRef(false);

  const list = useMemo(() => (data ? proposals(data, data.decisions, today, data.races.map((r) => r.date)) : []), [data, today]);
  if (!data) return <main className="screen" />;
  const pending = list.filter((p) => !later.has(p.id));
  const current = pending[0];

  const feu = feuDuJour(data, today);
  const r = currentRatio(data, today);
  const ci = data.checkIns.find((c) => c.date === today);
  const greeting = [
    ci ? `Check-in fait ce matin (forme ${ci.forme ?? '?'}/10${ci.sleepQuality ? `, sommeil ${ci.sleepQuality}/5` : ''}).` : 'Tu n’as pas encore fait ton check-in : je m’appuie sur tes débriefs et ta charge.',
    r.ratio !== undefined ? `Ratio de charge ${formatNumber(r.ratio, 2)} (${r.zone}).` : null,
    feu.light ? `Feu ${feu.light} aujourd’hui.` : null,
    list.length ? `J’ai ${list.length} proposition${list.length > 1 ? 's' : ''} d’adaptation pour toi.` : 'Rien à adapter pour l’instant : ton plan est cohérent avec tes retours. 👌',
  ]
    .filter(Boolean)
    .join(' ');

  const say = (...m: Msg[]) => setThread((t) => [...t, ...m]);
  /** Une proposition traitée part dans l'historique de la conversation, avec sa question éventuelle. */
  const close = (p: Proposal, ...m: Msg[]) =>
    say({ from: 'coach', text: `${p.title}. ${p.reason}` }, ...(asked.has(p.id) ? [{ from: 'me' as const, text: 'Pourquoi ?' }, { from: 'coach' as const, text: p.why }] : []), ...m);

  async function choose(p: Proposal, o: Option) {
    if (busy.current) return;
    busy.current = true;
    try {
      haptic(15);
      const dec = await acceptProposal(p, o);
      close(p, { from: 'me', text: o.label }, { from: 'coach', text: `C’est fait ✓ ${o.changes.length > 1 ? `${o.changes.length} séances modifiées` : 'Séance modifiée'} dans ton plan. Tu peux annuler si tu changes d’avis.`, undoId: dec.id });
    } finally {
      busy.current = false;
    }
  }
  async function keep(p: Proposal) {
    await refuseProposal(p);
    close(p, { from: 'me', text: 'Je garde ma séance' }, { from: 'coach', text: 'OK, on garde le plan. Écoute bien les sensations, et si la douleur ou la fatigue monte pendant la séance, raccourcis sans hésiter.' });
  }
  function why(p: Proposal) {
    setAsked((s) => new Set(s).add(p.id));
  }
  function postpone(p: Proposal) {
    setLater((s) => new Set(s).add(p.id));
    close(p, { from: 'me', text: 'On en reparle plus tard' }, { from: 'coach', text: 'Pas de souci, je te la reproposerai à ta prochaine visite.' });
  }
  async function undo(id: string) {
    await undoDecision(id);
    setUndone((s) => new Set(s).add(id));
    toast('Adaptation annulée, séances remises comme avant');
  }

  async function copyForClaude() {
    const text = claudeBrief(data!, data!.races, list, data!.decisions, today, { rest: data!.settings.hrRest, max: data!.settings.hrMax });
    try {
      await navigator.clipboard.writeText(text);
      toast('Résumé copié ✓ Colle-le dans Claude');
    } catch {
      // Presse-papiers indisponible : on propose le partage iOS
      try {
        await navigator.share({ title: 'Mon point entraînement', text });
      } catch {
        toast('Impossible de copier le résumé');
      }
    }
  }

  const recent = data.decisions.filter((d) => d.decision === 'accepted' && !d.undone && !undone.has(d.id) && d.decidedAt > new Date(Date.now() - 7 * 86_400_000).toISOString());

  return (
    <main className="screen">
      <div className="screen-head">
        <a className="icon-btn" href={href('accueil')} aria-label="Retour à l'accueil">
          <IconBack />
        </a>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h1 className="screen-title" style={{ fontSize: 26 }}>
            Coach
          </h1>
          <span className="small muted">Adapte ton plan selon tes retours, sans jamais augmenter la charge</span>
        </div>
      </div>

      <div className="chat" aria-live="polite">
        <Bubble from="coach">{greeting}</Bubble>
        {thread.map((m, i) => (
          <Bubble key={i} from={m.from}>
            {m.text}
            {m.undoId && !undone.has(m.undoId) && (
              <button type="button" className="chat-undo" onClick={() => void undo(m.undoId!)}>
                Annuler
              </button>
            )}
            {m.undoId && undone.has(m.undoId) && <span className="small muted"> (annulé)</span>}
          </Bubble>
        ))}

        {current && (
          <>
            <Bubble from="coach">
              <b style={{ display: 'block', marginBottom: 4 }}>{current.title}</b>
              {current.reason}
            </Bubble>
            <ProposalCard p={current} sessions={data.sessions} />
            {asked.has(current.id) && (
              <>
                <Bubble from="me">Pourquoi ?</Bubble>
                <Bubble from="coach">{current.why}</Bubble>
              </>
            )}
            <div className="quick-replies">
              {current.options.map((o, i) => (
                <button key={o.key} type="button" className={`qr${i === 0 ? ' primary' : ''}`} onClick={() => void choose(current, o)}>
                  {o.label}
                </button>
              ))}
              {!asked.has(current.id) && (
                <button type="button" className="qr" onClick={() => why(current)}>
                  Pourquoi ?
                </button>
              )}
              <button type="button" className="qr" onClick={() => void keep(current)}>
                Je garde ma séance
              </button>
              <button type="button" className="qr ghost" onClick={() => postpone(current)}>
                On en reparle plus tard
              </button>
            </div>
          </>
        )}
        {!current && list.length > 0 && thread.length > 0 && <Bubble from="coach">C’est tout pour aujourd’hui. Bon entraînement ! 💪</Bubble>}
      </div>

      {recent.length > 0 && (
        <section className="card" style={{ gap: 6 }}>
          <span className="eyebrow">Adaptations des 7 derniers jours</span>
          {recent.map((d) => (
            <div key={d.id} className="card-row" style={{ minHeight: 40 }}>
              <span className="small" style={{ flex: 1 }}>
                {d.title}
              </span>
              <button type="button" className="link-btn" onClick={() => void undo(d.id)}>
                Annuler
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="card claude-card">
        <span className="eyebrow" style={{ color: 'inherit', opacity: 0.8 }}>
          Discuter avec Claude
        </span>
        <span style={{ fontSize: 14, lineHeight: 1.45 }}>
          Pour une vraie discussion : l’appli prépare un résumé (14 derniers jours, check-ins, débriefs, charge, plan à venir et propositions du coach). Copie-le, puis
          colle-le dans l’app Claude.
        </span>
        <button className="btn btn-primary" type="button" onClick={() => void copyForClaude()}>
          Copier le résumé pour Claude
        </button>
        <a className="btn btn-secondary btn-small" href="https://claude.ai/new" target="_blank" rel="noreferrer">
          Ouvrir Claude
        </a>
        <span className="small" style={{ opacity: 0.75 }}>
          Rien n’est envoyé par l’appli : ton résumé ne quitte le téléphone que si tu le colles toi-même.
        </span>
      </section>
    </main>
  );
}

function Bubble({ from, children }: { from: 'coach' | 'me'; children: React.ReactNode }) {
  return <div className={`bubble ${from}`}>{children}</div>;
}

/** Avant → après pour chaque séance concernée (première option, la recommandée). */
function ProposalCard({ p, sessions }: { p: Proposal; sessions: PlannedSession[] }) {
  const o = p.options[0];
  return (
    <div className={`proposal ${p.level}`}>
      {o.changes.map((c) => {
        const before = sessions.find((s) => s.id === c.id);
        if (!before) return null;
        const after = { ...before, ...c.patch };
        return (
          <div key={c.id} className="prop-row">
            <span className="prop-before">{describe(before)}</span>
            <span className="prop-after">→ {describe(after)}</span>
          </div>
        );
      })}
      <span className="small muted" style={{ fontSize: 11 }}>
        Proposition recommandée · modifiable ensuite dans le plan
      </span>
    </div>
  );
}
