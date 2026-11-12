import { useEffect, useRef, useState } from 'react';
import { getSettings } from '../db/db';
import type { Activity, PlannedSession } from '../db/types';
import { readFitFile, type FitSummary } from '../lib/fit';
import { candidateSessions, findDuplicate, saveImported, type Debrief } from '../lib/fitSave';
import { formatLongDate } from '../lib/dates';
import { formatDuration, formatNumber } from '../lib/format';
import { kmEffort } from '../lib/calc';
import { go, href } from '../lib/router';
import { haptic } from '../lib/theme';
import { toast } from '../lib/toast';
import { FeelingsForm } from '../components/FeelingsForm';
import { ZonesBar } from '../components/ZonesBar';
import { IconBack, IconUpload } from '../components/Icons';

// Sur iPhone, accept=".fit" peut griser les fichiers .fit (extension inconnue d'iOS) : on accepte tout et on vérifie après.
const IS_IOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

type Cand = { session: PlannedSession; activity?: Activity };

/** « J'ai fait ma séance » : import du .fit Suunto → résumé → ressentis → enregistrement. */
export function ImportSeance({ sessionId }: { sessionId?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [sum, setSum] = useState<FitSummary | null>(null);
  const [cands, setCands] = useState<Cand[]>([]);
  const [target, setTarget] = useState<string | null>(null); // id de séance prévue, null = non prévue
  const [dup, setDup] = useState<Activity | undefined>();
  const [replaceOk, setReplaceOk] = useState(false);
  const [debrief, setDebrief] = useState<Debrief>({ feelings: {}, pains: [] });

  // Glisser-déposer n'importe où sur l'écran (ordinateur)
  useEffect(() => {
    const over = (e: DragEvent) => {
      e.preventDefault();
      setDrag(true);
    };
    const leave = () => setDrag(false);
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) void onFile(f);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  });

  async function onFile(file?: File) {
    if (!file) return;
    if (!/\.fit$/i.test(file.name)) {
      toast('Choisis un fichier .fit (export FIT de l’appli Suunto)');
      return;
    }
    setBusy(true);
    try {
      const settings = await getSettings();
      const s = await readFitFile(file, settings.zones);
      const c = await candidateSessions(s.date);
      const d = await findDuplicate(s);
      // Séance prévue choisie : celle demandée, sinon celle du doublon, sinon même type pas encore faite, sinon la 1re
      const pick =
        (sessionId && c.find((x) => x.session.id === sessionId)) ||
        (d && c.find((x) => x.session.id === d.plannedSessionId)) ||
        c.find((x) => x.session.type === s.type && !x.activity) ||
        c.find((x) => !x.activity) ||
        c[0];
      const existing = d ?? pick?.activity;
      setCands(c);
      setTarget(pick ? pick.session.id : null);
      setDup(d);
      setReplaceOk(false);
      // ressentis déjà saisis : on les reprend
      setDebrief(existing ? { feelings: existing.feelings, rpe: existing.rpe, pains: existing.pains, note: existing.note } : { feelings: {}, pains: [] });
      setSum(s);
      haptic(15);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function save() {
    if (!sum) return;
    if (dup && !replaceOk) return;
    const existing = dup ?? cands.find((c) => c.session.id === target)?.activity;
    const r = await saveImported(sum, target, debrief, existing?.id);
    haptic(20);
    toast(dup ? 'Séance remplacée ✓' : 'Séance enregistrée ✓');
    go('seance', r.sessionId);
  }

  const targetActivity = cands.find((c) => c.session.id === target)?.activity;

  return (
    <main className="screen">
      <div className="screen-head">
        <a className="icon-btn" href={sessionId ? href('seance', sessionId) : href('accueil')} aria-label="Retour">
          <IconBack />
        </a>
        <h1 className="screen-title" style={{ fontSize: 26 }}>
          J'ai fait ma séance
        </h1>
      </div>

      {/* 1. Import */}
      <label className={`fit-drop${drag ? ' over' : ''}${sum ? ' small' : ''}`}>
        <span className="fit-drop-icon" aria-hidden="true">
          <IconUpload size={sum ? 18 : 26} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <b>{busy ? 'Lecture du fichier…' : sum ? 'Importer un autre fichier' : 'Importer ma séance Suunto (.fit)'}</b>
          {!sum && <span className="small" style={{ opacity: 0.9 }}>Appli Suunto → séance → ⋯ → Exporter → FIT{IS_IOS ? '' : ' · ou glisse le fichier ici'}</span>}
        </span>
        <input ref={input} type="file" accept={IS_IOS ? undefined : '.fit'} hidden disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>

      {sum && (
        <>
          {/* 2. Ce que la montre a enregistré */}
          <section className="card" style={{ gap: 10 }}>
            <div className="card-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="small muted" style={{ fontWeight: 600 }}>
                  {capitalize(formatLongDate(sum.date))} · départ {sum.time.replace(':', 'h')}
                </span>
                <span className="display" style={{ fontSize: 20 }}>
                  {sum.kindLabel} · {formatNumber(sum.distanceKm)} km
                </span>
              </div>
              <span className="status-chip" style={{ background: 'var(--grad-teal)' }}>
                .fit lu ✓
              </span>
            </div>
            <div className="plan-stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <Stat l="Durée" v={formatDuration(sum.durationMin)} sub={sum.elapsedMin && sum.elapsedMin - sum.durationMin >= 2 ? `${formatDuration(sum.elapsedMin)} au total` : undefined} />
              <Stat l="D+ / D−" v={`${formatNumber(sum.elevationGain, 0)} / ${formatNumber(sum.elevationLoss, 0)}`} sub="m" />
              <Stat l="km-effort" v={formatNumber(kmEffort(sum.distanceKm, sum.elevationGain), 0)} />
              <Stat l="FC moy / max" v={sum.hrAvg ? `${sum.hrAvg} / ${sum.hrMax ?? '–'}` : '—'} sub="bpm" />
              <Stat l="Montée" v={sum.vamUp ? `${formatNumber(sum.vamUp, 0)}` : '—'} sub={sum.vamUp ? `m/h · ${sum.climbMin} min` : 'pas de montée'} />
              <Stat l="Descente" v={sum.vamDown ? `${formatNumber(sum.vamDown, 0)}` : '—'} sub={sum.vamDown ? `m/h · ${sum.descentMin} min` : 'pas de descente'} />
              {sum.vo2max !== undefined && <Stat l="VO2max" v={formatNumber(sum.vo2max, 1)} />}
              {sum.recoveryHours !== undefined && <Stat l="Récup" v={`${sum.recoveryHours} h`} />}
              {sum.trainingEffect !== undefined && <Stat l="Effet entraîn." v={formatNumber(sum.trainingEffect, 1)} />}
            </div>
            {sum.zones && <ZonesBar zones={sum.zones} />}
            {sum.zonesMin && (
              <span className="small muted" style={{ fontSize: 11 }}>
                {sum.zonesMin.map((m, i) => `Z${i + 1} ${formatDuration(Math.round(m))}`).join(' · ')} (selon tes zones des Réglages)
              </span>
            )}
          </section>

          {/* Rattachement à la séance prévue */}
          <section className="card" style={{ gap: 8 }}>
            <span className="eyebrow">C'était quelle séance ?</span>
            {cands.map(({ session, activity }) => (
              <button key={session.id} type="button" className={`pick-row${target === session.id ? ' on' : ''}`} aria-pressed={target === session.id} onClick={() => setTarget(session.id)}>
                <span className="pick-dot" aria-hidden="true" />
                <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <b style={{ fontWeight: 600 }}>{session.isKey ? '⭐ ' : ''}{session.title}</b>
                  <br />
                  <span className="small muted">
                    Prévu : {[session.durationMin && formatDuration(session.durationMin), session.distanceKm && `${formatNumber(session.distanceKm)} km`, session.elevationGain && `${formatNumber(session.elevationGain, 0)} m D+`].filter(Boolean).join(' · ') || session.type}
                    {activity && !dup ? ' · débrief déjà fait (chiffres remplacés)' : ''}
                  </span>
                </span>
              </button>
            ))}
            <button type="button" className={`pick-row${target === null ? ' on' : ''}`} aria-pressed={target === null} onClick={() => setTarget(null)}>
              <span className="pick-dot" aria-hidden="true" />
              <span style={{ flex: 1, textAlign: 'left' }}>
                <b style={{ fontWeight: 600 }}>Séance non prévue</b>
                <br />
                <span className="small muted">Elle sera ajoutée à ton plan du {formatDayDate(sum.date)}</span>
              </span>
            </button>
            {sessionId && !cands.some((c) => c.session.id === sessionId) && (
              <span className="small" style={{ color: 'var(--coral)' }}>
                Ce fichier est daté du {formatDayDate(sum.date)}, pas du jour de la séance ouverte.
              </span>
            )}
          </section>

          {/* Doublon */}
          {dup && (
            <div className={`alert-card ${replaceOk ? 'ok' : 'warn'}`} role="alert">
              <span className="alert-icon" aria-hidden="true">
                !
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <b style={{ fontSize: 14 }}>Cette séance est déjà importée</b>
                <span className="small muted">
                  Même date et même heure de départ ({sum.time.replace(':', 'h')}). Tu peux la remplacer : tes ressentis déjà saisis sont repris ci-dessous.
                </span>
                {!replaceOk ? (
                  <button type="button" className="qr primary" style={{ alignSelf: 'flex-start' }} onClick={() => setReplaceOk(true)}>
                    Remplacer la séance existante
                  </button>
                ) : (
                  <b className="small" style={{ color: 'var(--teal)' }}>
                    ✓ Elle sera remplacée à l'enregistrement
                  </b>
                )}
              </div>
            </div>
          )}

          {/* 3. Ensuite seulement : les ressentis */}
          {(!dup || replaceOk) && (
            <>
              <FeelingsForm value={debrief} onChange={setDebrief} />
              <div className="save-bar">
                <button className="btn btn-primary" type="button" onClick={() => void save()}>
                  {dup ? 'Remplacer et enregistrer' : targetActivity ? 'Mettre à jour la séance' : 'Enregistrer la séance'}
                </button>
              </div>
            </>
          )}
        </>
      )}
      {sum && <div style={{ height: 70 }} />}
    </main>
  );
}

function Stat({ l, v, sub }: { l: string; v: string; sub?: string }) {
  return (
    <div className="plan-stat">
      <span className="small muted" style={{ fontSize: 11 }}>
        {l}
      </span>
      <b className="display" style={{ fontSize: 18 }}>
        {v}
      </b>
      {sub && (
        <span className="small muted" style={{ fontSize: 11 }}>
          {sub}
        </span>
      )}
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const formatDayDate = (iso: string) => new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
