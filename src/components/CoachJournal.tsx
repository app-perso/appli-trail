import { db } from '../db/db';
import { formatLongDate } from '../lib/dates';
import { useLive } from '../lib/useLive';
import { href } from '../lib/router';

type Item = { date: string; kind: 'decision' | 'plan'; title?: string; text: string; tag?: string; dim?: boolean };

/** Journal du coach : décisions et enseignements datés + résumé de chaque version du plan. */
export function CoachJournal() {
  const items = useLive(async () => {
    const [journal, versions] = await Promise.all([db.journal.toArray(), db.planVersions.toArray()]);
    const list: Item[] = [
      ...journal.map((j) => ({ date: j.date, kind: 'decision' as const, text: j.texte, tag: j.categorie })),
      ...versions.map((v) => ({ date: v.date, kind: 'plan' as const, title: `Plan « ${v.version} »${v.reverted ? ' (annulé)' : ''}`, text: v.resume, dim: v.reverted })),
    ];
    return list.sort((a, b) => b.date.localeCompare(a.date) || (a.kind === 'plan' ? -1 : 1));
  });
  if (!items) return null;
  if (!items.length)
    return (
      <section className="card">
        <span className="small muted">
          Le journal est vide. Il se remplit avec les « decisions » des fichiers plan que tu importes (Réglages → Plan d'entraînement).
        </span>
        <a className="link-btn" href={href('reglages')} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          Importer un plan →
        </a>
      </section>
    );
  let lastDate = '';
  return (
    <div className="journal">
      {items.map((it, i) => {
        const showDate = it.date !== lastDate;
        lastDate = it.date;
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: it.dim ? 0.55 : 1 }}>
            {showDate && <span className="eyebrow" style={{ marginTop: i ? 8 : 0 }}>{formatLongDate(it.date)}</span>}
            <div className={`journal-item ${it.kind}`}>
              {it.title && <b style={{ fontSize: 14 }}>{it.title}</b>}
              <span style={{ fontSize: 14, lineHeight: 1.45 }}>{it.text}</span>
              {it.tag && <span className="phase-chip" style={{ alignSelf: 'flex-start' }}>{it.tag.toUpperCase()}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
