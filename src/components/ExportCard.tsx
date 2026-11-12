import { useState } from 'react';
import { shareOrDownload } from '../lib/share';
import { toast } from '../lib/toast';
import { IconDownload } from './Icons';

type Format = 'xlsx' | 'csv' | 'json';

/** Export « pour l'analyse » : tout l'historique, lisible par une IA ou un tableur. */
export function ExportCard() {
  const [busy, setBusy] = useState<Format | null>(null);

  async function run(fmt: Format) {
    setBusy(fmt);
    try {
      const w = await import('../lib/export/writers');
      const ds = await w.collectDataset();
      const files = fmt === 'xlsx' ? [await w.toXlsx(ds)] : fmt === 'csv' ? w.toCsvFiles(ds) : [w.toJson(ds)];
      const r = await shareOrDownload(files, 'Historique Appli Trail');
      if (r !== 'cancelled') toast(fmt === 'csv' ? `${files.length} fichiers CSV créés ✓` : 'Export créé ✓');
    } catch (e) {
      console.error(e);
      toast("L'export a échoué");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card">
      <span className="eyebrow">Export pour l'analyse</span>
      <span className="small muted">
        Tout ton historique (séances, check-ins, courses, bilan par semaine, réglages) dans un format simple à donner à
        une IA ou à ouvrir dans un tableur. Un onglet « Lisez-moi » explique chaque colonne.
      </span>
      <button className="btn btn-secondary" type="button" disabled={!!busy} onClick={() => void run('xlsx')}>
        <IconDownload /> {busy === 'xlsx' ? 'Création…' : 'Excel (.xlsx)'}
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button className="btn btn-secondary btn-small" type="button" disabled={!!busy} onClick={() => void run('csv')}>
          {busy === 'csv' ? 'Création…' : 'CSV'}
        </button>
        <button className="btn btn-secondary btn-small" type="button" disabled={!!busy} onClick={() => void run('json')}>
          {busy === 'json' ? 'Création…' : 'JSON'}
        </button>
      </div>
    </section>
  );
}
