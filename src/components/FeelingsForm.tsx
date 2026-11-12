import type { Debrief } from '../lib/fitSave';
import type { Feelings } from '../db/types';
import { Slider } from './Controls';
import { PainPicker } from './PainPicker';

const estomacWord = (v: number) => (v <= 3 ? 'nausées' : v <= 5 ? 'gêné' : v <= 7 ? 'correct' : 'nickel');

/** Curseurs de ressentis + douleurs + note (fin du débrief). */
export function FeelingsForm({ value, onChange }: { value: Debrief; onChange: (v: Debrief) => void }) {
  const f = value.feelings;
  const setF = (k: keyof Feelings) => (n: number) => onChange({ ...value, feelings: { ...f, [k]: n } });
  return (
    <>
      <section className="card">
        <span className="eyebrow">Comment c'était ?</span>
        <Slider label="Plaisir" value={f.plaisir ?? 5} onChange={setF('plaisir')} color="teal" suffix="" />
        <Slider label="Fatigue après" value={f.fatigue ?? 5} onChange={setF('fatigue')} color="coral" suffix="" />
        <Slider label="Flemme avant de partir" value={f.flemme ?? 5} onChange={setF('flemme')} color="violet" suffix="" />
        <Slider label="Moral après" value={f.moral ?? 5} onChange={setF('moral')} color="teal" suffix="" />
        <Slider label="Estomac" value={f.estomac ?? 7} onChange={setF('estomac')} color="coral" suffix={`· ${estomacWord(f.estomac ?? 7)}`} />
        <Slider label="Effort ressenti (RPE)" value={value.rpe ?? 5} min={1} onChange={(rpe) => onChange({ ...value, rpe })} color="coral" suffix="/ 10" />
        <PainPicker value={value.pains} onChange={(pains) => onChange({ ...value, pains })} moment="seance" />
      </section>
      <section className="card">
        <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="eyebrow">Note (facultatif)</span>
          <textarea className="textarea" value={value.note ?? ''} onChange={(e) => onChange({ ...value, note: e.target.value })} placeholder="Un mot sur la séance…" />
        </label>
      </section>
    </>
  );
}
