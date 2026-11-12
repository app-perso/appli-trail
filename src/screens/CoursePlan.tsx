import { useMemo, useRef, useState } from 'react';
import { db, newId } from '../db/db';
import type { AidStation, Race } from '../db/types';
import { kmEffort } from '../lib/calc';
import { formatNumber, km, meters, parseDecimal } from '../lib/format';
import { downsample, parseGpx, type Track } from '../lib/gpx';
import { buildPlan, formatClock, formatHM, hmToMin, type RacePlan, type Section } from '../lib/racePlan';
import { href } from '../lib/router';
import { toast } from '../lib/toast';
import { useLive } from '../lib/useLive';
import { Sheet } from '../components/Controls';
import { IconBack, IconPlus, IconUpload } from '../components/Icons';

const longDay = (iso: string) => {
  const s = new Date(iso + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function CoursePlan({ raceId }: { raceId: string }) {
  const race = useLive(() => db.races.get(raceId), [raceId]);
  const history = useLive(() => db.races.toArray());
  const fileInput = useRef<HTMLInputElement>(null);
  const [aidEdit, setAidEdit] = useState<AidStation | 'new' | 'finish' | null>(null);

  const track = useMemo<Track | null>(() => {
    if (!race?.gpx) return null;
    try {
      return parseGpx(race.gpx);
    } catch {
      return null;
    }
  }, [race?.gpx]);

  // Ta vitesse habituelle en km-effort/h (courses finies avec un temps)
  const keh = useMemo(() => {
    const done = (history ?? []).filter((r) => r.resultTime && hmToMin(r.resultTime));
    if (!done.length) return undefined;
    return done.reduce((t, r) => t + kmEffort(r.distanceKm, r.elevationGain) / (hmToMin(r.resultTime)! / 60), 0) / done.length;
  }, [history]);

  if (race === undefined) return <main className="screen" />;
  if (!race)
    return (
      <main className="screen">
        <div className="screen-head">
          <a className="icon-btn" href={href('courses')} aria-label="Retour">
            <IconBack />
          </a>
          <h1 className="screen-title">Course introuvable</h1>
        </div>
      </main>
    );

  const plan = buildPlan(race, track, keh);
  const update = (patch: Partial<Race>) => db.races.update(race.id, patch);

  async function onGpx(file?: File) {
    if (!file) return;
    try {
      const text = await file.text();
      const t = parseGpx(text);
      await update({ gpx: text, elevationLoss: race!.elevationLoss ?? Math.round(t.loss) });
      toast(`GPX importé ✓ ${formatNumber(t.distanceKm)} km · ${formatNumber(t.gain, 0)} m D+`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const differs = track && (Math.abs(track.distanceKm - race.distanceKm) / race.distanceKm > 0.02 || Math.abs(track.gain - race.elevationGain) / Math.max(1, race.elevationGain) > 0.03);
  const m = plan.minMargin;

  return (
    <main className="screen">
      <div className="screen-head">
        <a className="icon-btn" href={href('courses', race.id)} aria-label="Retour à mes courses">
          <IconBack />
        </a>
        <span className="small muted">Plan de course{track ? ' · GPX importé' : ''}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', padding: '0 8px' }}>
        <span className="small muted" style={{ fontWeight: 600 }}>
          {longDay(race.date)} · départ {formatClock(plan.startClock)}
        </span>
        <h1 className="display" style={{ fontSize: 28, lineHeight: 1.05, margin: 0 }}>
          {race.name}
        </h1>
        <div className="pills" style={{ marginTop: 10 }}>
          <span className="pill">{km(race.distanceKm)}</span>
          <span className="pill">{meters(race.elevationGain)} D+</span>
          <span className="pill coral">{formatNumber(kmEffort(race.distanceKm, race.elevationGain), 0)} km-effort</span>
        </div>
      </div>

      <div className="tiles3">
        <div className="tile">
          <span className="t-label">Objectif{plan.goalEstimated ? ' (estimé)' : ''}</span>
          <span className="display" style={{ fontSize: 20 }}>
            {formatHM(plan.goalMin)}
          </span>
          <span className="t-sub">{formatNumber(plan.totalEffort / (plan.goalMin / 60), 1)} km-effort/h</span>
        </div>
        <div className="tile">
          <span className="t-label">Arrivée</span>
          <span className="display" style={{ fontSize: 20 }}>
            {formatClock(plan.arrivalClock)}
          </span>
          <span className="t-sub">{plan.sun ? `nuit à ${formatClock(plan.sun.set)}` : ''}</span>
        </div>
        <div className={`tile${m !== undefined && m < 0 ? ' hot' : ''}`} style={m !== undefined && m >= 0 ? { background: 'var(--grad-teal)', color: '#fff', borderColor: 'transparent' } : undefined}>
          <span className="t-label" style={m !== undefined ? { color: '#fff', opacity: 0.92 } : undefined}>
            Marge barrière
          </span>
          <span className="display" style={{ fontSize: 20 }}>
            {m === undefined ? '—' : `${m < 0 ? '−' : '+'}${formatHM(Math.abs(m))}`}
          </span>
          <span className="t-sub" style={m !== undefined ? { color: '#fff', opacity: 0.92 } : undefined}>
            {m === undefined ? 'aucune barrière saisie' : m < 0 ? 'hors délai !' : 'la plus serrée'}
          </span>
        </div>
      </div>

      <section className="card" style={{ gap: 10 }}>
        <span className="eyebrow">Réglages de course</span>
        <div className="numgrid">
          <label className="time-box">
            <span className="small muted">Départ</span>
            <input type="time" value={race.startTime ?? '07:00'} onChange={(e) => e.target.value && void update({ startTime: e.target.value })} />
          </label>
          <label className="numfield">
            <span className="numfield-label">Objectif (h:mm)</span>
            <input
              inputMode="text"
              aria-label="Objectif de temps"
              placeholder={formatHM(plan.goalMin).replace('h', ':')}
              defaultValue={race.goalTime ?? ''}
              key={race.goalTime ?? ''}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v) return void update({ goalTime: undefined });
                if (hmToMin(v) === undefined) return toast('Objectif au format h:mm, ex. 9:30');
                void update({ goalTime: v.replace('h', ':') });
              }}
            />
          </label>
        </div>
        {plan.goalEstimated && (
          <span className="small muted">
            Sans objectif, le temps est estimé avec ta vitesse habituelle ({formatNumber(keh ?? 8, 1)} km-effort/h).
          </span>
        )}
      </section>

      {track ? (
        <section className="card" style={{ padding: '14px 12px 10px' }}>
          <Profile track={track} plan={plan} />
          {differs && (
            <button
              type="button"
              className="link-btn"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => void update({ distanceKm: Math.round(track.distanceKm * 10) / 10, elevationGain: Math.round(track.gain), elevationLoss: Math.round(track.loss) })}
            >
              Utiliser les chiffres du GPX : {formatNumber(track.distanceKm)} km · {formatNumber(track.gain, 0)} m D+ · {formatNumber(track.loss, 0)} m D−
            </button>
          )}
          <button className="btn btn-secondary btn-small" type="button" onClick={() => fileInput.current?.click()}>
            Remplacer le GPX
          </button>
        </section>
      ) : (
        <section className="card">
          <span className="eyebrow">Parcours</span>
          <span className="small muted">
            Importe le fichier GPX de la course (site de l'organisation, Suunto, Strava…) pour avoir le profil et le dénivelé
            de chaque section. Sans GPX, le plan répartit le dénivelé au prorata des km.
          </span>
          <button className="btn btn-primary" type="button" onClick={() => fileInput.current?.click()}>
            <IconUpload /> Importer le GPX
          </button>
        </section>
      )}
      <input ref={fileInput} type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden onChange={(e) => void onGpx(e.target.files?.[0])} />

      <section className="card" style={{ gap: 4 }}>
        <div className="card-row">
          <span className="eyebrow">Ravitos</span>
          <button type="button" className="link-btn" onClick={() => setAidEdit('new')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconPlus size={14} /> Ajouter
          </button>
        </div>
        {(race.aidStations ?? []).length === 0 && <span className="small muted">Ajoute les ravitos (nom, km, barrière horaire) pour découper la course en sections.</span>}
        {[...(race.aidStations ?? [])]
          .sort((a, b) => a.km - b.km)
          .map((a) => (
            <button key={a.id} type="button" className="race-row" onClick={() => setAidEdit(a)}>
              <span className="race-dot" style={{ background: 'var(--bg)', border: '2.5px solid #FF8A5C' }} />
              <span style={{ flex: 1, textAlign: 'left', fontWeight: 600, fontSize: 14 }}>{a.name}</span>
              <span className="small muted">
                km {formatNumber(a.km)}
                {a.cutoff ? ` · barrière ${a.cutoff.replace(':', 'h')}` : ''}
              </span>
            </button>
          ))}
      </section>

      <h2 className="display" style={{ fontSize: 20, margin: '8px 8px 0', letterSpacing: '-0.03em' }}>
        Road book
      </h2>
      {plan.sections.map((s) => (
        <SectionCard key={s.index} s={s} last={s.index === plan.sections.length} onEdit={() => setAidEdit(s.aidId ? race.aidStations!.find((a) => a.id === s.aidId)! : 'finish')} />
      ))}

      <div className="card" style={{ background: 'var(--nav-on)', color: 'var(--nav-on-ink)', gap: 4 }}>
        <span className="eyebrow" style={{ color: '#C6A8FF' }}>
          Ravito testé
        </span>
        <span style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.9 }}>
          Iso 34 g / dose · compote Decathlon 22-28 g · gel coca caféiné 24 g. Toutes les 20-30 min, 60-80 g/h. À éviter : barre Overstims
          citron-gingembre. Nausée : eau plate et ralentir 10 min.
        </span>
      </div>

      {aidEdit && <AidSheet race={race} aid={aidEdit} onClose={() => setAidEdit(null)} />}
    </main>
  );
}

function SectionCard({ s, last, onEdit }: { s: Section; last: boolean; onEdit: () => void }) {
  const bg = s.night ? 'var(--grad-violet)' : s.hardest ? 'linear-gradient(135deg, #FF5F6D, #FF8A5C)' : last ? 'linear-gradient(135deg, #14B894, #6FDDB3)' : 'linear-gradient(135deg, #FFB36B, #FF8A5C)';
  return (
    <button type="button" className="sec" onClick={onEdit} aria-label={`Section ${s.index}, ${s.from} vers ${s.to}, passage ${formatClock(s.clock)}. Toucher pour modifier les consignes.`}>
      <span className="num" style={{ background: bg }}>
        {s.index}
      </span>
      <span className="card-row" style={{ alignItems: 'baseline' }}>
        <span style={{ fontSize: 15, fontWeight: 700, textAlign: 'left' }}>
          {s.from} → {s.to}
        </span>
        <span className="display" style={{ fontSize: 17, color: last ? 'var(--teal)' : undefined, whiteSpace: 'nowrap' }}>
          {formatClock(s.clock)}
        </span>
      </span>
      <span className="small muted" style={{ fontSize: 12 }}>
        {formatNumber(s.km)} km · +{formatNumber(s.gain, 0)} / −{formatNumber(s.loss, 0)} m · {formatHM(s.durationMin)}
        {s.hardest ? ' · la plus dure' : ''}
        {s.night ? ' · nuit, frontale' : ''}
      </span>
      {s.cutoff && (
        <span className="small" style={{ fontWeight: 600, color: (s.marginMin ?? 0) < 0 ? 'var(--coral)' : 'var(--teal)' }}>
          Barrière {s.cutoff.replace(':', 'h')} · marge {(s.marginMin ?? 0) < 0 ? '−' : '+'}
          {formatHM(Math.abs(s.marginMin ?? 0))}
        </span>
      )}
      <span style={{ fontSize: 13, lineHeight: 1.4, textAlign: 'left', color: s.notes ? 'var(--ink)' : 'var(--muted)' }}>{s.notes || 'Touche pour ajouter tes consignes…'}</span>
      <span className="g">{s.carbsG} g de glucides</span>
    </button>
  );
}

function Profile({ track, plan }: { track: Track; plan: RacePlan }) {
  const W = 350;
  const BASE = 120;
  const pts = downsample(track, 200);
  const span = Math.max(1, track.maxEle - track.minEle);
  const x = (d: number) => (d / track.distanceKm) * W;
  const y = (e: number) => BASE - 8 - ((e - track.minEle) / span) * (BASE - 18);
  const line = 'M' + pts.map((p) => `${x(p.d).toFixed(1)} ${y(p.ele).toFixed(1)}`).join(' L');
  const fill = `${line} L${W} ${BASE} L0 ${BASE} Z`;
  // Portions de nuit : sections commencées ou terminées de nuit
  const nights = plan.sections.filter((s) => s.night);
  return (
    <svg
      role="img"
      aria-label={`Profil du parcours : ${formatNumber(track.distanceKm)} km, de ${formatNumber(track.minEle, 0)} à ${formatNumber(track.maxEle, 0)} m d'altitude, ${plan.sections.length} sections`}
      viewBox={`0 0 ${W} 160`}
      style={{ width: '100%', height: 'auto', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="pf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF6B6B" stopOpacity=".40" />
          <stop offset="1" stopColor="#FFB36B" stopOpacity=".03" />
        </linearGradient>
        <linearGradient id="pl" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFB36B" />
          <stop offset="1" stopColor="#FF5F6D" />
        </linearGradient>
      </defs>
      {nights.map((s) => (
        <rect key={s.index} x={x(s.fromKm)} y="0" width={x(s.toKm) - x(s.fromKm)} height={BASE} rx="6" fill="rgba(122,107,255,0.12)" />
      ))}
      <path d={fill} fill="url(#pf)" />
      <path d={line} fill="none" stroke="url(#pl)" strokeWidth="2.5" strokeLinejoin="round" />
      <line x1="0" y1={BASE} x2={W} y2={BASE} stroke="var(--track)" strokeWidth="1.5" />
      {plan.sections.slice(0, -1).map((s) => {
        const xx = x(s.toKm);
        const yy = y(pts.reduce((best, p) => (Math.abs(p.d - s.toKm) < Math.abs(best.d - s.toKm) ? p : best)).ele);
        return (
          <g key={s.index}>
            <line x1={xx} y1={yy + 6} x2={xx} y2={BASE} stroke="var(--line-off)" strokeDasharray="2 3" />
            <circle cx={xx} cy={yy} r="5" fill="var(--bg)" stroke="#FF8A5C" strokeWidth="2.5" />
          </g>
        );
      })}
      {plan.sections.map((s) => (
        <text key={s.index} x={x((s.fromKm + s.toKm) / 2)} y="138" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--ink)" fontFamily="Inter">
          {s.index}
        </text>
      ))}
      {nights.length > 0 && (
        <text x="0" y="156" fontSize="10" fill="#7A6BFF" fontFamily="Inter">
          nuit · frontale
        </text>
      )}
      <text x={W} y="156" textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="Inter">
        ○ ravito · {formatNumber(track.maxEle, 0)} m max
      </text>
    </svg>
  );
}

/** Ajouter / modifier un ravito, ou les consignes de la dernière section. */
function AidSheet({ race, aid, onClose }: { race: Race; aid: AidStation | 'new' | 'finish'; onClose: () => void }) {
  const isFinish = aid === 'finish';
  const a = aid === 'new' || aid === 'finish' ? undefined : aid;
  const [name, setName] = useState(a?.name ?? '');
  const [kmStr, setKm] = useState(a ? String(a.km).replace('.', ',') : '');
  const [cutoff, setCutoff] = useState(a?.cutoff ?? '');
  const [notes, setNotes] = useState(isFinish ? race.finishNotes ?? '' : a?.notes ?? '');
  const [err, setErr] = useState('');

  async function save() {
    if (isFinish) {
      await db.races.update(race.id, { finishNotes: notes.trim() || undefined });
      return onClose();
    }
    const k = parseDecimal(kmStr);
    if (!name.trim()) return setErr('Donne un nom au ravito.');
    if (!k || k <= 0 || k >= race.distanceKm) return setErr(`Le km doit être entre 0 et ${formatNumber(race.distanceKm)}.`);
    const item: AidStation = { id: a?.id ?? newId(), name: name.trim(), km: k, cutoff: cutoff || undefined, notes: notes.trim() || undefined };
    const list = (race.aidStations ?? []).filter((x) => x.id !== item.id).concat(item);
    await db.races.update(race.id, { aidStations: list });
    onClose();
  }

  return (
    <Sheet title={isFinish ? `Consignes · → ${race.finishName || 'Arrivée'}` : a ? 'Modifier le ravito' : 'Nouveau ravito'} onClose={onClose}>
      {!isFinish && (
        <>
          <input className="text-input" placeholder="Nom (ex. Madone d'Utelle)" aria-label="Nom du ravito" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="numgrid">
            <label className="numfield">
              <span className="numfield-label">Kilomètre</span>
              <input inputMode="decimal" aria-label="Kilomètre du ravito" placeholder="–" value={kmStr} onChange={(e) => setKm(e.target.value)} />
            </label>
            <label className="time-box">
              <span className="small muted">Barrière (facultatif)</span>
              <input type="time" aria-label="Barrière horaire" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
            </label>
          </div>
        </>
      )}
      <textarea
        className="textarea"
        aria-label="Consignes de la section"
        placeholder={isFinish ? 'Consignes pour la dernière section…' : 'Consignes pour la section qui arrive à ce ravito (rythme, FC, nutrition…)'}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {err && (
        <span className="small" style={{ color: 'var(--coral)' }} role="alert">
          {err}
        </span>
      )}
      <button className="btn btn-primary" type="button" onClick={() => void save()}>
        Enregistrer
      </button>
      {a && (
        <button
          className="btn btn-small"
          type="button"
          style={{ background: 'transparent', color: 'var(--muted)' }}
          onClick={async () => {
            await db.races.update(race.id, { aidStations: (race.aidStations ?? []).filter((x) => x.id !== a.id) });
            onClose();
          }}
        >
          Supprimer ce ravito
        </button>
      )}
    </Sheet>
  );
}
