import { haptic } from '../lib/theme';

/** Rangée de boutons à choix unique (qualité 1-5, temps dispo, fait / pas fait…). */
export function Choice<T extends string | number>(props: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  variant?: 'dark' | 'violet';
}) {
  return (
    <div className="choice" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          className={props.variant === 'violet' ? 'violet' : undefined}
          onClick={() => {
            haptic();
            props.onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Champ numérique compact (clavier chiffres de l'iPhone). */
export function NumField(props: {
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  decimal?: boolean;
}) {
  return (
    <label className="numfield">
      <span className="numfield-label">{props.label}</span>
      <span className="numfield-box">
        <input
          type="text"
          inputMode={props.decimal ? 'decimal' : 'numeric'}
          aria-label={props.unit ? `${props.label} (${props.unit})` : props.label}
          value={props.value}
          placeholder="–"
          onChange={(e) => props.onChange(e.target.value)}
        />
        {props.unit && <span className="muted small">{props.unit}</span>}
      </span>
    </label>
  );
}
