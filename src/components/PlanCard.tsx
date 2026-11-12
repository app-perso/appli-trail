import { useRef, useState } from 'react';
import { db } from '../db/db';
import type { PlannedSession } from '../db/types';
import { applyPlan, diffPlan, parsePlan, PlanError, revertLastPlan, sortVersions, type ParsedPlan, type PlanDiff, type PlanSession } from '../lib/planFile';
import { RULE_LABELS } from '../lib/rules';
import { formatDayShort, formatLongDate, formatWeekRange } from '../lib/dates';
import { formatNumber } from '../lib/format';
import { href } from '../lib/router';
import { toast } from '../lib/toast';
import { useLive } from '../lib/useLive';
import { Sheet } from './Controls';
import { IconUpload } from './Icons';

const FORMAT_URL = 'https://github.com/app-perso/appli-trail/blob/main/PLAN_FORMAT.md';

/** Réglages : plan d'entraînement piloté par fichier (import, aperçu, versions, retour arrière). */
export function PlanCard() {
  const input = useRef<HTMLInputElement>(null);
  const versions = useLive(async () => sortVersions(await db.planVersions.toArray()).reverse());
  const [preview, setPreview] = useState<{ plan: ParsedPlan; diff: PlanDiff } | null>(null);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = versions?.find((v) => !v.reverted);

  async function onFile(f?: File) {
    if (!f) return;
    try {
      const plan = parsePlan(await f.text());
      setPreview({ plan, diff: await diffPlan(plan) });
    } catch (e) {
      if (e instanceof PlanError) setErrors(e.errors);
      else setErrors([(e as Error).message]);
    } finally {
      if (input.current) input.current.value = '';
    }
  }
  async function confirm() {
    if (!preview) return;
    setBusy(true);
    try {
      const v = await applyPlan(preview.plan, preview.diff);
      toast(`Plan « ${v.version} » importé ✓`);
      setPreview(null);
    } catch (e) {
      console.error('Import du plan :', (e as Error)?.name, (e as Error)?.message);
      toast(`L'import du plan a échoué, rien n'a été modifié (${(e as Error)?.message ?? e})`);
    } finally {
      setBusy(false);
    }
  }
  async function revert() {
    const v = await revertLastPlan();
    setConfirmRevert(false);
    toast(v ? `Plan « ${v.version} » annulé ✓` : 'Aucun plan à annuler');
  }

  return (
    <section className="card">
      <span className="eyebrow">Plan d'entraînement</span>
      {active ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontWeight: 700 }}>
            Version « {active.version} » <span className="small muted">du {formatLongDate(active.date)}</span>
          </span>
          <span className="small" style={{ lineHeight: 1.45 }}>
            {active.resume}
          </span>
          <span className="small muted">
            Semaines du {formatLongDate(active.from)} au {formatLongDate(active.to)} · importé le {formatLongDate(active.importedAt.slice(0, 10))}
          </span>
        </div>
      ) : (
        <span className="small muted">Aucun plan importé : ton plan vient de ton historique Excel et de tes saisies. Importe un fichier plan généré avec Claude (format décrit dans PLAN_FORMAT.md).</span>
      )}
      <button className="btn btn-primary" type="button" onClick={() => input.current?.click()}>
        <IconUpload /> Importer un nouveau plan
      </button>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      {active && (
        <button className="btn btn-secondary btn-small" type="button" onClick={() => setConfirmRevert(true)}>
          Revenir à la version précédente
        </button>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a className="link-btn" href={href('coach', 'journal')} style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          Journal du coach →
        </a>
        <a className="link-btn" href={FORMAT_URL} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          Format du fichier ↗
        </a>
      </div>
      {versions && versions.length > 0 && (
        <details className="small">
          <summary>Historique des versions ({versions.length})</summary>
          <ul style={{ margin: '4px 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {versions.map((v) => (
              <li key={v.id} style={{ opacity: v.reverted ? 0.55 : 1 }}>
                <b>{v.version}</b> · {formatLongDate(v.date)} · {v.added.length} séances
                {v.reverted ? ' · annulée' : v.id === active?.id ? ' · en vigueur' : ''}
              </li>
            ))}
          </ul>
        </details>
      )}

      {errors && (
        <Sheet title="Fichier plan invalide" onClose={() => setErrors(null)}>
          <span className="small muted">Rien n'a été importé. Corrige ces points (ou donne-les à Claude pour qu'il régénère le fichier) :</span>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <button className="btn btn-secondary" type="button" onClick={() => setErrors(null)}>
            Fermer
          </button>
        </Sheet>
      )}

      {preview && <PlanPreview plan={preview.plan} diff={preview.diff} busy={busy} onConfirm={() => void confirm()} onClose={() => setPreview(null)} />}

      {confirmRevert && active && (
        <Sheet title="Revenir à la version précédente ?" onClose={() => setConfirmRevert(false)}>
          <span className="small muted">
            Le plan « {active.version} » sera annulé : ses {active.added.length} séances à venir sont retirées (celles déjà faites restent), les{' '}
            {active.removed.length} séances qu'il avait remplacées reviennent, les règles d'alerte d'avant sont rétablies et ses décisions sortent du journal.
          </span>
          <button className="btn btn-primary" type="button" onClick={() => void revert()}>
            Revenir en arrière
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => setConfirmRevert(false)}>
            Annuler
          </button>
        </Sheet>
      )}
    </section>
  );
}

const sOld = (s: PlannedSession) => `${formatDayShort(s.date).dow} ${formatDayShort(s.date).day} · ${s.title}${s.distanceKm ? ` · ${formatNumber(s.distanceKm)} km` : ''}${s.elevationGain ? ` · ${formatNumber(s.elevationGain, 0)} m` : ''}`;
const sNew = (s: PlanSession) => `${formatDayShort(s.date).dow} ${formatDayShort(s.date).day} · ${s.key ? '⭐ ' : ''}${s.title}${s.km ? ` · ${formatNumber(s.km)} km` : ''}${s.dplus ? ` · ${formatNumber(s.dplus, 0)} m` : ''}${s.intensity ? ` · ${s.intensity}` : ''}`;

/** Aperçu ancien vs nouveau, semaine par semaine, avant de confirmer. */
function PlanPreview({ plan, diff, busy, onConfirm, onClose }: { plan: ParsedPlan; diff: PlanDiff; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet title={`Nouveau plan « ${plan.version} »`} onClose={() => !busy && onClose()}>
      <span style={{ fontSize: 14, lineHeight: 1.45 }}>{plan.resume}</span>
      <span className="small muted">
        Remplace les séances à venir du {formatLongDate(diff.from)} au {formatLongDate(diff.to)} : {diff.removed.length} retirée{diff.removed.length > 1 ? 's' : ''}, {diff.toAdd.length} ajoutée
        {diff.toAdd.length > 1 ? 's' : ''}. {diff.kept.length ? `${diff.kept.length} séance${diff.kept.length > 1 ? 's' : ''} déjà faite${diff.kept.length > 1 ? 's' : ''} gardée${diff.kept.length > 1 ? 's' : ''} telle${diff.kept.length > 1 ? 's' : ''} quelle${diff.kept.length > 1 ? 's' : ''}.` : ''}
        {diff.skippedPast ? ` ${diff.skippedPast} séance${diff.skippedPast > 1 ? 's' : ''} du fichier déjà passée${diff.skippedPast > 1 ? 's' : ''}, ignorée${diff.skippedPast > 1 ? 's' : ''}.` : ''}
      </span>
      {diff.weeks.map((w) => (
        <div key={w.monday} className="diff-week">
          <div className="card-row" style={{ alignItems: 'baseline' }}>
            <b style={{ fontSize: 14 }}>
              {w.name ? `${w.name} · ` : ''}
              {formatWeekRange(w.monday)}
              {w.phase ? ` · ${w.phase}` : ''}
            </b>
            <span className="small" style={{ whiteSpace: 'nowrap' }}>
              <span className="muted" style={{ textDecoration: 'line-through' }}>
                {formatNumber(w.oldKm, 0)} km
              </span>{' '}
              → <b>{formatNumber(w.newKm, 0)} km</b>
            </span>
          </div>
          {(w.goal?.km || w.goal?.dplus) && (
            <span className="small muted">
              Objectif : {w.goal.km ? `${formatNumber(w.goal.km, 0)} km` : ''}
              {w.goal.km && w.goal.dplus ? ' · ' : ''}
              {w.goal.dplus ? `${formatNumber(w.goal.dplus, 0)} m D+` : ''} (D+ : {formatNumber(w.oldDplus, 0)} → {formatNumber(w.newDplus, 0)} m)
            </span>
          )}
          {w.oldSessions.map((s) => (
            <span key={s.id} className="diff-old">
              − {sOld(s)}
            </span>
          ))}
          {w.newSessions.map((s, i) => (
            <span key={i} className="diff-new">
              + {sNew(s)}
            </span>
          ))}
          {w.kept.map((s) => (
            <span key={s.id} className="diff-kept">
              ✓ {sOld(s)} (faite, gardée)
            </span>
          ))}
        </div>
      ))}
      {diff.rulesChanged.length > 0 && (
        <div className="diff-week">
          <b style={{ fontSize: 14 }}>Règles d'alerte modifiées</b>
          {diff.rulesChanged.map((r) => (
            <span key={r.key} className="small">
              {RULE_LABELS[r.key]} : <span className="muted" style={{ textDecoration: 'line-through' }}>{formatNumber(r.before, 2)}</span> → <b>{formatNumber(r.after, 2)}</b>
            </span>
          ))}
        </div>
      )}
      {diff.newDecisions.length > 0 && (
        <div className="diff-week">
          <b style={{ fontSize: 14 }}>Ajouté au journal du coach ({diff.newDecisions.length})</b>
          {diff.newDecisions.map((d) => (
            <span key={d.date + d.texte} className="small">
              {formatDayShort(d.date).day}/{d.date.slice(5, 7)} · {d.texte}
            </span>
          ))}
        </div>
      )}
      {plan.warnings.length > 0 && <span className="small" style={{ color: '#E8862E' }}>⚠ {plan.warnings.join(' · ')}</span>}
      <button className="btn btn-primary" type="button" disabled={busy} onClick={onConfirm}>
        {busy ? 'Import…' : 'Importer ce plan'}
      </button>
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>
        Annuler
      </button>
    </Sheet>
  );
}
