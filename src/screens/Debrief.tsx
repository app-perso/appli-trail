import { useEffect, useState } from 'react';
import { db, getSettings, newId } from '../db/db';
import type { Activity, Feelings, PainEntry, PlannedSession } from '../db/types';
import { formatWeekday } from '../lib/dates';
import { formatDuration, parseDecimal } from '../lib/format';
import { go, href } from '../lib/router';
import { toast } from '../lib/toast';
import { haptic } from '../lib/theme';
import { Sheet, Slider } from '../components/Controls';
import { Choice, NumField } from '../components/Choice';
import { PainPicker } from '../components/PainPicker';
import { SessionIcon, SESSION_LOOK } from '../components/SessionIcon';
import { IconBack, IconUpload } from '../components/Icons';
import { OcrProgress, ScreenshotStrip } from '../components/Screenshots';
import { VerifySheet } from '../components/VerifySheet';
import { ZonesBar } from '../components/ZonesBar';
import { compressForStorage } from '../lib/ocr/image';
import type { OcrValues } from '../lib/ocr/parse';

const DEFAULT_FEELINGS: Feelings = { plaisir: 5, fatigue: 5, flemme: 5, moral: 5, estomac: 7 };

/** Les champs chiffrés sont gardés en texte pendant la saisie (« 11,2 »). */
type Nums = { km: string; h: string; min: string; dPlus: string; dMinus: string; hrAvg: string; hrMax: string };

const str = (n: number | undefined) => (n === undefined || n === null ? '' : String(n).replace('.', ','));

function estomacWord(v: number) {
  if (v <= 3) return 'nausées';
  if (v <= 5) return 'gêné';
  if (v <= 7) return 'correct';
  return 'nickel';
}

export function Debrief({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<PlannedSession | null | undefined>(undefined);
  const [activity, setActivity] = useState<Activity | undefined>();
  const [nums, setNums] = useState<Nums>({ km: '', h: '', min: '', dPlus: '', dMinus: '', hrAvg: '', hrMax: '' });
  const [feelings, setFeelings] = useState<Feelings>(DEFAULT_FEELINGS);
  const [rpe, setRpe] = useState(5);
  const [pains, setPains] = useState<PainEntry[]>([]);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shots, setShots] = useState<Blob[]>([]);
  const [zones, setZones] = useState<Activity['zones']>();
  const [ocr, setOcr] = useState<{ fraction: number; label: string } | null>(null);
  const [showShots, setShowShots] = useState(false);
  const [verify, setVerify] = useState<{ values: OcrValues; texts: string[] } | null>(null);

  useEffect(() => {
    void (async () => {
      const s = await db.plannedSessions.get(sessionId);
      setSession(s ?? null);
      if (!s) return;
      const a = await db.activities.where('plannedSessionId').equals(sessionId).first();
      setActivity(a);
      setShots(a?.screenshots ?? []);
      setZones(a?.zones);
      if (a) {
        const d = Math.round(a.durationMin);
        const renfo = s.type === 'Renfo';
        setNums({
          km: str(a.distanceKm || undefined),
          h: d && !renfo ? String(Math.floor(d / 60)) : '',
          min: d ? String(renfo ? d : d % 60) : '',
          dPlus: str(a.elevationGain || undefined),
          dMinus: str(a.elevationLoss || undefined),
          hrAvg: str(a.hrAvg),
          hrMax: str(a.hrMax),
        });
        setFeelings({ ...DEFAULT_FEELINGS, ...a.feelings });
        setRpe(a.rpe ?? 5);
        setPains(a.pains);
        setNote(a.note ?? '');
        setDone(!a.skipped);
      } else {
        // Pré-rempli avec ce qui était prévu
        const d = s.durationMin ?? 0;
        const renfo = s.type === 'Renfo';
        setNums({
          km: str(s.distanceKm),
          h: d && !renfo ? String(Math.floor(d / 60)) : '',
          min: d ? String(renfo ? d : d % 60) : '',
          dPlus: str(s.elevationGain),
          dMinus: '',
          hrAvg: '',
          hrMax: '',
        });
        // Les douleurs du check-in du jour sont reprises
        const ci = await db.checkIns.where('date').equals(s.date).first();
        setPains(ci?.pains.filter((p) => p.score > 0) ?? []);
      }
    })();
  }, [sessionId]);

  if (session === undefined) return <main className="screen" />;
  if (session === null)
    return (
      <main className="screen">
        <div className="screen-head">
          <a className="icon-btn" href={href('accueil')} aria-label="Retour">
            <IconBack />
          </a>
          <h1 className="screen-title">Séance introuvable</h1>
        </div>
      </main>
    );

  const isRenfo = session.type === 'Renfo';
  const setN = (k: keyof Nums) => (v: string) => setNums({ ...nums, [k]: v });
  const setF = (k: keyof Feelings) => (v: number) => setFeelings({ ...feelings, [k]: v });

  async function save() {
    const s = session!;
    const durationMin = (parseDecimal(nums.h) ?? 0) * 60 + (parseDecimal(nums.min) ?? 0);
    const base = {
      id: activity?.id ?? newId(),
      plannedSessionId: s.id,
      date: s.date,
      type: s.type,

      pains,
      note: note.trim() || undefined,
      source: 'appli' as const,
    };
    const record: Activity = isRenfo
      ? {
          ...base,
          durationMin: done ? durationMin : 0,
          distanceKm: 0,
          elevationGain: 0,
          elevationLoss: 0,
          feelings: done ? { plaisir: feelings.plaisir } : {},
          rpe: done ? rpe : undefined,
          skipped: done ? undefined : true,
        }
      : {
          ...base,
          durationMin,
          distanceKm: parseDecimal(nums.km) ?? 0,
          elevationGain: parseDecimal(nums.dPlus) ?? 0,
          elevationLoss: parseDecimal(nums.dMinus) ?? 0,
          hrAvg: parseDecimal(nums.hrAvg),
          hrMax: parseDecimal(nums.hrMax),
          zones,
          elapsedMin: activity?.elapsedMin,
          feelings,
          rpe,
        };
    const keep = (await getSettings()).keepScreenshots !== false;
    if (keep && shots.length) record.screenshots = shots;
    await db.activities.put(record);
    haptic(20);
    toast(activity ? 'Débrief modifié ✓' : 'Séance enregistrée ✓');
    go('accueil');
  }

  async function addShots(files: File[]) {
    const compressed = await Promise.all(files.map(compressForStorage));
    setShots((prev) => [...prev, ...compressed]);
    await read(files); // lecture sur les images d'origine (plus nettes)
  }

  async function read(images: Blob[]) {
    try {
      const { readScreenshots } = await import('../lib/ocr/ocr');
      const res = await readScreenshots(images, (fraction, label) => setOcr({ fraction, label }));
      setVerify(res);
    } catch (e) {
      console.error(e);
      toast('La lecture a échoué. Vérifie ta connexion la 1re fois, puis réessaie.');
    } finally {
      setOcr(null);
    }
  }

  function applyOcr(v: OcrValues) {
    const t = (n: number | undefined, prev: string) => (n === undefined ? prev : String(n).replace('.', ','));
    const d = v.durationMin !== undefined ? Math.round(v.durationMin) : undefined;
    setNums((n) => ({
      km: t(v.distanceKm, n.km),
      h: d !== undefined ? String(Math.floor(d / 60)) : n.h,
      min: d !== undefined ? String(d % 60) : n.min,
      dPlus: t(v.elevationGain, n.dPlus),
      dMinus: t(v.elevationLoss, n.dMinus),
      hrAvg: t(v.hrAvg, n.hrAvg),
      hrMax: t(v.hrMax, n.hrMax),
    }));
    if (v.zones) {
      const sum = v.zones.reduce((a, b) => a + b, 0) || 1;
      setZones(v.zones.map((z) => Math.round((z / sum) * 1000) / 1000) as Activity['zones']);
    }
    setVerify(null);
    toast('Valeurs reprises ✓');
  }

  async function remove() {
    await db.transaction('rw', db.plannedSessions, db.activities, async () => {
      await db.activities.where('plannedSessionId').equals(sessionId).delete();
      await db.plannedSessions.delete(sessionId);
    });
    toast('Séance supprimée');
    go('accueil');
  }

  return (
    <main className="screen" style={{ paddingBottom: 'calc(var(--safe-bottom) + 120px)' }}>
      <div className="screen-head">
        <a className="icon-btn" href={href('accueil')} aria-label="Retour">
          <IconBack />
        </a>
        <SessionIcon type={session.type} size={44} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="small" style={{ fontWeight: 600, color: activity ? 'var(--teal)' : 'var(--muted)' }}>
            {activity ? (activity.skipped ? 'Pas faite' : '✓ Séance faite') : `Débrief · ${formatWeekday(session.date)}`}
          </span>
          <span className="display" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
            {session.title}
          </span>
        </div>
      </div>

      {isRenfo ? (
        <section className="card">
          <span className="eyebrow">Renfo</span>
          <Choice
            label="Séance faite ?"
            value={done ? 'oui' : 'non'}
            options={[
              { value: 'oui', label: 'Fait 💪' },
              { value: 'non', label: 'Pas fait' },
            ]}
            onChange={(v) => setDone(v === 'oui')}
          />
          {done && (
            <>
              <div className="numgrid">
                <NumField label="Durée" unit="min" value={nums.min} onChange={(v) => setNums({ ...nums, h: '', min: v })} />
              </div>
              <Slider label="Difficulté" value={rpe} min={1} onChange={setRpe} color="violet" suffix="/ 10" />
              <Slider label="Plaisir" value={feelings.plaisir} onChange={setF('plaisir')} color="teal" />
            </>
          )}
          <PainPicker value={pains} onChange={setPains} moment="seance" />
        </section>
      ) : (
        <>
          <a className="fit-drop" href={href('import', session.id)}>
            <span className="fit-drop-icon" aria-hidden="true">
              <IconUpload size={24} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <b>Importer ma séance Suunto (.fit)</b>
              <span className="small" style={{ opacity: 0.9 }}>
                Tout se remplit automatiquement
              </span>
            </span>
          </a>
          {!showShots && shots.length === 0 ? (
            <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={() => setShowShots(true)}>
              Pas de .fit ? Lire des captures d'écran
            </button>
          ) : (
            <section className="card">
            <div className="card-row">
              <span className="eyebrow">Captures Suunto</span>
              {shots.length > 0 && !ocr && (
                <button type="button" className="link-btn" onClick={() => void read(shots)}>
                  Relire
                </button>
              )}
            </div>
            <ScreenshotStrip
              shots={shots}
              disabled={!!ocr}
              onAdd={(files) => void addShots(files)}
              onRemove={(i) => setShots(shots.filter((_, j) => j !== i))}
            />
            {ocr ? (
              <OcrProgress fraction={ocr.fraction} label={ocr.label} />
            ) : (
              shots.length === 0 && (
                <span className="small muted">
                  Ajoute tes captures de l'appli Suunto (écran « Stats ») : distance, durée, dénivelé et FC seront lus
                  automatiquement.
                </span>
              )
            )}
            </section>
          )}

          <section className="card">
            <div className="card-row">
              <span className="eyebrow">Chiffres de la séance</span>
              {session.durationMin || session.distanceKm ? (
                <span className="small muted">
                  Prévu : {[session.durationMin && formatDuration(session.durationMin), session.distanceKm && `${str(session.distanceKm)} km`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              ) : null}
            </div>
            <div className="numgrid">
              <NumField label="Distance" unit="km" decimal value={nums.km} onChange={setN('km')} />
              <div className="numfield">
                <span className="numfield-label">Durée</span>
                <span className="numfield-box">
                  <input type="text" inputMode="numeric" aria-label="Heures" placeholder="–" value={nums.h} onChange={(e) => setN('h')(e.target.value)} style={{ width: 28, flex: 'none' }} />
                  <span className="muted small">h</span>
                  <input type="text" inputMode="numeric" aria-label="Minutes" placeholder="–" value={nums.min} onChange={(e) => setN('min')(e.target.value)} style={{ width: 34, flex: 'none' }} />
                  <span className="muted small">min</span>
                </span>
              </div>
              <NumField label="D+" unit="m" value={nums.dPlus} onChange={setN('dPlus')} />
              <NumField label="D−" unit="m" value={nums.dMinus} onChange={setN('dMinus')} />
              <NumField label="FC moyenne" unit="bpm" value={nums.hrAvg} onChange={setN('hrAvg')} />
              <NumField label="FC max" unit="bpm" value={nums.hrMax} onChange={setN('hrMax')} />
            </div>
            {zones && <ZonesBar zones={zones} />}
          </section>

          <section className="card">
            <span className="eyebrow">Comment c'était ?</span>
            <Slider label="Plaisir" value={feelings.plaisir} onChange={setF('plaisir')} color="teal" suffix="" />
            <Slider label="Fatigue après" value={feelings.fatigue} onChange={setF('fatigue')} color="coral" suffix="" />
            <Slider label="Flemme avant de partir" value={feelings.flemme} onChange={setF('flemme')} color="violet" suffix="" />
            <Slider label="Moral après" value={feelings.moral} onChange={setF('moral')} color="teal" suffix="" />
            <Slider
              label="Estomac"
              value={feelings.estomac}
              onChange={setF('estomac')}
              color="coral"
              suffix={`· ${estomacWord(feelings.estomac)}`}
            />
            <Slider label="Effort ressenti (RPE)" value={rpe} min={1} onChange={setRpe} color="coral" suffix="/ 10" />
            <PainPicker value={pains} onChange={setPains} moment="seance" />
          </section>
        </>
      )}

      <section className="card">
        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="eyebrow">Note (facultatif)</span>
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Un mot sur la séance…" />
        </label>
      </section>

      <button className="btn btn-small" type="button" style={{ background: 'transparent', color: 'var(--muted)' }} onClick={() => setConfirmDelete(true)}>
        Supprimer cette séance
      </button>

      <div className="save-bar">
        <button className="btn btn-primary" type="button" onClick={() => void save()}>
          Enregistrer
        </button>
      </div>

      {verify && <VerifySheet values={verify.values} texts={verify.texts} onApply={applyOcr} onClose={() => setVerify(null)} />}

      {confirmDelete && (
        <Sheet title="Supprimer cette séance ?" onClose={() => setConfirmDelete(false)}>
          <span className="small muted">
            « {session.title} » ({SESSION_LOOK[session.type].label}) et son débrief seront effacés.
          </span>
          <button className="btn btn-primary" type="button" onClick={() => void remove()}>
            Supprimer
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => setConfirmDelete(false)}>
            Annuler
          </button>
        </Sheet>
      )}
    </main>
  );
}
