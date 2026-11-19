import { useState } from 'react';
import type { PlannedSession } from '../db/types';
import type { Option, Patch, Proposal } from '../lib/adapt';
import { acceptProposal, refuseProposal } from '../lib/adaptApply';
import { formatDuration, formatNumber } from '../lib/format';
import { formatDayShort } from '../lib/dates';
import { isWeekTip } from '../lib/useProposals';
import { haptic } from '../lib/theme';
import { toast } from '../lib/toast';

/** « 14 km · 400 m D+ · Z2 » : la séance après adaptation, en court. */
function after(s: PlannedSession | undefined, patch: Patch): string {
  if (!s) return '';
  const a = { ...s, ...patch };
  if (a.type === 'Repos') return a.title;
  const facts = [
    a.durationMin ? formatDuration(a.durationMin) : null,
    a.distanceKm ? `${formatNumber(a.distanceKm)} km` : null,
    a.elevationGain ? `${formatNumber(a.elevationGain, 0)} m D+` : a.type !== 'Renfo' && s.elevationGain ? 'plat' : null,
    a.intensity && a.intensity !== s.intensity ? a.intensity : null,
  ].filter(Boolean);
  const renamed = a.title !== s.title && !a.title.startsWith(s.title) ? a.title : null;
  return [renamed, ...facts].filter(Boolean).join(' · ');
}

/**
 * Conseil du coach, affiché directement sur la séance (ou la semaine) concernée.
 * Appliquer = option recommandée ; ⓘ = pourquoi + autres choix ; Garder = on ne touche à rien.
 */
export function CoachTip({ p, sessions, compact = false }: { p: Proposal; sessions: PlannedSession[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const o = p.options[0];
  const many = o.changes.length > 1;
  const first = sessions.find((s) => s.id === o.changes[0]?.id);

  async function apply(opt: Option) {
    if (busy) return;
    setBusy(true);
    haptic(15);
    await acceptProposal(p, opt);
    toast(opt.changes.length > 1 ? `${opt.changes.length} séances allégées ✓ (annulable dans Mon plan)` : 'Séance adaptée ✓ (annulable sur la séance)');
  }
  async function keep() {
    if (busy) return;
    setBusy(true);
    await refuseProposal(p);
    toast('OK, on garde la séance');
  }

  return (
    <div className={`coach-tip ${p.level}${compact ? ' compact' : ''}`} role="group" aria-label={`Conseil du coach : ${p.title}`}>
      <div className="ct-head">
        <span aria-hidden="true">🧭</span>
        <b>{p.title}</b>
        <button type="button" className="ct-info" aria-expanded={open} aria-label="Pourquoi ?" onClick={() => setOpen(!open)}>
          {open ? '×' : 'i'}
        </button>
      </div>
      {p.note && <span className={`ct-note${p.level === 'info' ? '' : ' strong'}`}>{p.note}</span>}
      {!many && first && isWeekTip(p) && (
        <span className="ct-after" style={{ fontWeight: 500 }}>
          {first.title} ({formatDayShort(first.date).dow.toLowerCase()} {formatDayShort(first.date).day})
        </span>
      )}
      {!many && first && <span className="ct-after">→ {after(first, o.changes[0].patch)}</span>}
      {many && (
        <span className="ct-list">
          {o.changes.slice(0, 8).map((c) => {
            const b = sessions.find((x) => x.id === c.id);
            if (!b) return null;
            const { dow, day } = formatDayShort(b.date);
            const t = c.patch.title ?? b.title;
            return (
              <span key={c.id} className="ct-row">
                <span className="ct-day">
                  {dow.toLowerCase()} {day}
                </span>
                <span className="ct-was">{b.title}</span>
                <span className="ct-now">→ {t}{c.patch.durationMin && c.patch.type !== 'Repos' ? ` · ${formatDuration(c.patch.durationMin)}` : ''}</span>
              </span>
            );
          })}
        </span>
      )}
      {open && (
        <div className="ct-why">
          <span>{p.reason}</span>
          <span className="muted">{p.why}</span>
          {p.options.slice(1).map((x) => (
            <button key={x.key} type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={() => void apply(x)}>
              Plutôt : {x.label}
            </button>
          ))}
        </div>
      )}
      <div className="ct-actions">
        <button type="button" className="ct-btn primary" disabled={busy} onClick={() => void apply(o)}>
          Appliquer
        </button>
        <button type="button" className="ct-btn" disabled={busy} onClick={() => void keep()}>
          Garder
        </button>
      </div>
    </div>
  );
}
