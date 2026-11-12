import { useMemo, useRef, useState } from 'react';
import { db, newId } from '../db/db';
import type { Route, RouteTag } from '../db/types';
import { kmEffort } from '../lib/calc';
import { todayISO } from '../lib/dates';
import { formatDuration, formatNumber, parseDecimal } from '../lib/format';
import { parseGpx } from '../lib/gpx';
import { toast } from '../lib/toast';
import { useLive } from '../lib/useLive';
import { haptic } from '../lib/theme';
import { FOOT_TYPES } from '../lib/week';
import { Segmented, Sheet } from '../components/Controls';
import { Choice, NumField } from '../components/Choice';
import { RouteMap } from '../components/RouteMap';
import { IconPlus } from '../components/Icons';

export const TAG_BG: Record<RouteTag, string> = {
  'WE choc': 'linear-gradient(135deg, #FF5F6D, #FFB36B)',
  Plaisir: 'linear-gradient(135deg, #14B894, #6FDDB3)',
  Repérage: 'linear-gradient(135deg, #7A6BFF, #B39BFF)',
  Qualité: 'linear-gradient(135deg, #7A6BFF, #B39BFF)',
};
const TAGS: RouteTag[] = ['WE choc', 'Plaisir', 'Repérage', 'Qualité'];
const BASE_LOCATIONS = ['Nice', 'Saint-Cloud'];

export function Parcours() {
  const today = todayISO();
  const data = useLive(async () => {
    const [routes, checkIn, acts] = await Promise.all([db.routes.toArray(), db.checkIns.where('date').equals(today).first(), db.activities.toArray()]);
    return { routes, checkIn, acts };
  }, [today]);
  const [loc, setLoc] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Route | 'new' | null>(null);

  // Ta vitesse habituelle à l'entraînement, en km-effort/h (médiane de tes sorties à pied)
  const keh = useMemo(() => {
    const v = (data?.acts ?? [])
      .filter((a) => !a.skipped && FOOT_TYPES.includes(a.type) && a.durationMin > 20 && a.distanceKm > 0)
      .map((a) => kmEffort(a.distanceKm, a.elevationGain) / (a.durationMin / 60))
      .sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : 7.5;
  }, [data?.acts]);

  if (!data) return <main className="screen" />;
  const locations = [...new Set([...BASE_LOCATIONS, ...data.routes.map((r) => r.location)])];
  const current = loc ?? (data.checkIn?.location && locations.includes(data.checkIn.location) ? data.checkIn.location : 'Nice');
  const routes = data.routes.filter((r) => r.location === current).sort((a, b) => a.distanceKm - b.distanceKm);
  const sel = routes.find((r) => r.id === selId) ?? routes[0];
  const avail = data.checkIn?.availableMin;
  const est = (r: Route) => (kmEffort(r.distanceKm, r.elevationGain) / keh) * 60;
  const fits = avail ? routes.filter((r) => est(r) <= avail + 5).length : 0;

  async function planToday(r: Route) {
    await db.plannedSessions.add({
      id: newId(),
      date: today,
      week: '',
      phase: '',
      type: 'Running',
      isKey: false,
      title: r.name,
      durationMin: Math.round(est(r) / 5) * 5,
      distanceKm: r.distanceKm,
      elevationGain: r.elevationGain,
      instructions: [r.access, r.note].filter(Boolean).join(' · ') || undefined,
      source: 'appli',
    });
    haptic(20);
    toast("Ajouté au plan d'aujourd'hui ✓");
  }

  return (
    <main className="screen">
      <div className="screen-head" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <span className="small muted" style={{ fontWeight: 600 }}>
            Où courir aujourd'hui
          </span>
          <h1 className="screen-title" style={{ fontSize: 30 }}>
            Parcours
          </h1>
        </div>
        <button className="icon-btn" type="button" aria-label="Ajouter un parcours" onClick={() => setEditing('new')}>
          <IconPlus />
        </button>
      </div>

      <Segmented label="Où es-tu ?" value={current} options={locations.map((l) => ({ value: l, label: l }))} onChange={(l) => (setLoc(l), setSelId(null))} />

      <div className="map-card">
        <RouteMap route={sel} location={current} />
        {sel && (
          <span className="map-title">
            {sel.name} · {formatNumber(sel.distanceKm)} km
          </span>
        )}
      </div>
      {sel && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button className="btn btn-secondary btn-small" type="button" onClick={() => setEditing(sel)}>
            Modifier
          </button>
          <button className="btn btn-primary btn-small" type="button" onClick={() => void planToday(sel)}>
            Prévoir aujourd'hui
          </button>
        </div>
      )}

      {avail && routes.length > 0 && (
        <span className="small muted" style={{ textAlign: 'center' }}>
          {formatDuration(avail)}
          {avail >= 180 ? ' et plus' : ''} de dispo aujourd'hui : {fits} sortie{fits > 1 ? 's' : ''} sur {routes.length} tiennent dedans.
        </span>
      )}

      {routes.map((r) => {
        const t = est(r);
        const ok = avail ? t <= avail + 5 : undefined;
        return (
          <button
            key={r.id}
            type="button"
            className="route-card"
            aria-pressed={r.id === sel?.id}
            onClick={() => {
              haptic();
              setSelId(r.id);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <span className="card-row">
              <span style={{ fontSize: 15, fontWeight: 700 }}>{r.name}</span>
              <span className="route-tag" style={{ background: TAG_BG[r.tag] }}>
                {r.tag}
              </span>
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.85 }}>
              {formatNumber(r.distanceKm)} km · {r.elevationGain ? `${formatNumber(r.elevationGain, 0)} m D+` : 'plat'} · ≈{formatDuration(Math.round(t / 5) * 5)}
              {r.access ? ` · ${r.access}` : ''}
            </span>
            {r.note && <span className="small muted" style={{ fontSize: 12 }}>{r.note}</span>}
            {ok !== undefined && (
              <span className="small" style={{ fontSize: 12, fontWeight: 600, color: ok ? 'var(--teal)' : 'var(--muted)' }}>
                {ok ? '✓ tient dans ton temps dispo' : 'trop long pour aujourd’hui'}
              </span>
            )}
          </button>
        );
      })}
      {!routes.length && <span className="small muted" style={{ textAlign: 'center' }}>Pas encore de parcours ici : ajoute le tien avec le bouton +.</span>}
      <span className="small muted" style={{ textAlign: 'center', fontSize: 12 }}>
        Durées estimées avec ta vitesse habituelle à l'entraînement ({formatNumber(keh, 1)} km-effort/h).
      </span>

      {editing && <RouteEditSheet route={editing === 'new' ? undefined : editing} defaultLocation={current} onClose={() => setEditing(null)} onSaved={(id, l) => (setLoc(l), setSelId(id))} />}
    </main>
  );
}

const str = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

function RouteEditSheet(props: { route?: Route; defaultLocation: string; onClose: () => void; onSaved: (id: string, location: string) => void }) {
  const r = props.route;
  const [f, setF] = useState({
    name: r?.name ?? '',
    location: r?.location ?? props.defaultLocation,
    tag: r?.tag ?? ('Plaisir' as RouteTag),
    km: str(r?.distanceKm),
    dPlus: str(r?.elevationGain),
    access: r?.access ?? '',
    note: r?.note ?? '',
    gpx: r?.gpx,
  });
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const other = !BASE_LOCATIONS.includes(f.location);

  async function onGpx(file?: File) {
    if (!file) return;
    try {
      const text = await file.text();
      const t = parseGpx(text);
      setF((x) => ({ ...x, gpx: text, km: x.km || str(Math.round(t.distanceKm * 10) / 10), dPlus: x.dPlus || str(Math.round(t.gain)), name: x.name || t.name || '' }));
      toast(`GPX lu ✓ ${formatNumber(t.distanceKm)} km · ${formatNumber(t.gain, 0)} m D+`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function save() {
    const km = parseDecimal(f.km);
    if (!f.name.trim()) return setErr('Donne un nom au parcours.');
    if (!km) return setErr('Indique la distance.');
    if (!f.location.trim()) return setErr('Indique le lieu.');
    const id = r?.id ?? newId();
    await db.routes.put({
      id,
      name: f.name.trim(),
      location: f.location.trim(),
      tag: f.tag,
      distanceKm: km,
      elevationGain: parseDecimal(f.dPlus) ?? 0,
      access: f.access.trim() || undefined,
      note: f.note.trim() || undefined,
      gpx: f.gpx,
    });
    toast(r ? 'Parcours modifié ✓' : 'Parcours ajouté ✓');
    props.onSaved(id, f.location.trim());
    props.onClose();
  }

  if (confirm && r)
    return (
      <Sheet title="Supprimer ce parcours ?" onClose={() => setConfirm(false)}>
        <span className="small muted">« {r.name} » sera effacé.</span>
        <button
          className="btn btn-primary"
          type="button"
          onClick={async () => {
            await db.routes.delete(r.id);
            toast('Parcours supprimé');
            props.onClose();
          }}
        >
          Supprimer
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => setConfirm(false)}>
          Annuler
        </button>
      </Sheet>
    );

  return (
    <Sheet title={r ? 'Modifier le parcours' : 'Nouveau parcours'} onClose={props.onClose}>
      <input className="text-input" placeholder="Nom (ex. Boucle de Menton)" aria-label="Nom du parcours" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <Choice
        label="Lieu"
        value={other ? 'Autre' : f.location}
        options={[...BASE_LOCATIONS, 'Autre'].map((l) => ({ value: l, label: l }))}
        onChange={(l) => setF({ ...f, location: l === 'Autre' ? '' : l })}
      />
      {other && <input className="text-input" placeholder="Lieu (ex. Lausanne)" aria-label="Autre lieu" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />}
      <div className="choice-wrap choice-tags">
        <Choice label="Étiquette" value={f.tag} options={TAGS.map((t) => ({ value: t, label: t }))} onChange={(tag) => setF({ ...f, tag })} />
      </div>
      <div className="numgrid">
        <NumField label="Distance" unit="km" decimal value={f.km} onChange={(km) => setF({ ...f, km })} />
        <NumField label="D+" unit="m" value={f.dPlus} onChange={(dPlus) => setF({ ...f, dPlus })} />
      </div>
      <input className="text-input" placeholder="Accès (ex. TER Èze, bus 602)" aria-label="Accès" value={f.access} onChange={(e) => setF({ ...f, access: e.target.value })} />
      <textarea className="textarea" placeholder="Note (ex. Ta boucle étalon, record 1h44)" aria-label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      <button className="btn btn-secondary btn-small" type="button" onClick={() => fileRef.current?.click()}>
        {f.gpx ? 'Remplacer le tracé GPX' : 'Ajouter un tracé GPX (facultatif)'}
      </button>
      {f.gpx && (
        <button className="btn btn-small" type="button" style={{ background: 'transparent', color: 'var(--muted)' }} onClick={() => setF({ ...f, gpx: undefined })}>
          Retirer le tracé GPX
        </button>
      )}
      <input ref={fileRef} type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden onChange={(e) => void onGpx(e.target.files?.[0])} />
      {err && (
        <span className="small" style={{ color: 'var(--coral)' }} role="alert">
          {err}
        </span>
      )}
      <button className="btn btn-primary" type="button" onClick={() => void save()}>
        Enregistrer
      </button>
      {r && (
        <button className="btn btn-small" type="button" style={{ background: 'transparent', color: 'var(--muted)' }} onClick={() => setConfirm(true)}>
          Supprimer ce parcours
        </button>
      )}
    </Sheet>
  );
}
