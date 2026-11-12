import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../lib/theme';

/** Contrôle segmenté en pilule (ex. Auto / Jour / Nuit). */
export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === props.value}
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

const FILLS = {
  coral: 'linear-gradient(90deg, #FF5F6D, #FFB36B)',
  teal: 'linear-gradient(90deg, #1FC8A5, #8BE8C3)',
  violet: 'linear-gradient(90deg, #7A6BFF, #C6A8FF)',
};

/** Curseur 0-10 (ou autre plage) avec la valeur affichée à droite du libellé. */
export function Slider(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  color?: keyof typeof FILLS;
  suffix?: string;
}) {
  const { min = 0, max = 10, color = 'coral', suffix = `/${max}` } = props;
  const pct = ((props.value - min) / (max - min)) * 100;
  return (
    <label className="slider">
      <span className="slider-label">
        <span>{props.label}</span>
        <b>
          {props.value}
          <span className="muted" style={{ fontWeight: 500 }}> {suffix}</span>
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={props.value}
        style={{ ['--pct' as string]: `${pct}%`, ['--fill' as string]: FILLS[color] }}
        onChange={(e) => {
          haptic(5);
          props.onChange(Number(e.target.value));
        }}
      />
    </label>
  );
}

/**
 * Fenêtre qui monte du bas de l'écran.
 * Affichée directement dans <body> : sinon, placée dans une carte (qui a un effet de flou),
 * elle resterait coincée dans la carte au lieu de couvrir l'écran.
 */
export function Sheet(props: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="sheet-backdrop" onClick={props.onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <h2>{props.title}</h2>
        {props.children}
      </div>
    </div>,
    document.body,
  );
}
