// Icônes dessinées en SVG (reprises des maquettes).
type P = { size?: number };
const base = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

export const IconMountain = ({ size = 22 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M3 19 L9 9 L13 15 L16 11 L21 19 Z" /></svg>
);
export const IconPulse = ({ size = 22 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M3 12 h4 l2 -5 l4 10 l2 -5 h6" /></svg>
);
export const IconBars = ({ size = 22 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M5 20 V13 M12 20 V6 M19 20 V10" /></svg>
);
export const IconMap = ({ size = 22 }: P) => (
  <svg {...base(size)} strokeWidth={2}><path d="M9 4 L3 6 V20 L9 18 L15 20 L21 18 V4 L15 6 Z M9 4 V18 M15 6 V20" /></svg>
);
export const IconGear = ({ size = 22 }: P) => (
  <svg {...base(size)} strokeWidth={2}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
export const IconBack = ({ size = 20 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M15 5 L8 12 L15 19" /></svg>
);
export const IconDownload = ({ size = 20 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M12 4 V15 M7 10 L12 15 L17 10 M5 20 H19" /></svg>
);
export const IconUpload = ({ size = 20 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M12 15 V4 M7 9 L12 4 L17 9 M5 20 H19" /></svg>
);
export const IconShield = ({ size = 18 }: P) => (
  <svg {...base(size)} strokeWidth={2.2}><path d="M12 3 L20 6 V12 C20 16.5 16.5 19.5 12 21 C7.5 19.5 4 16.5 4 12 V6 Z" /></svg>
);
