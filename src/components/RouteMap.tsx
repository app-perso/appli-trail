import { useMemo } from 'react';
import type { Route } from '../db/types';
import { parseGpx } from '../lib/gpx';

const W = 358;
const H = 160;

/** Petit générateur pseudo-aléatoire stable (même parcours → même dessin). */
function seeded(text: string) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];
const smooth = (pts: Pt[], closed: boolean) => {
  // Courbe lissée (Catmull-Rom → Bézier)
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${p[1][0].toFixed(1)} ${p[1][1].toFixed(1)}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return closed ? d + ' Z' : d;
};

/** Tracé stylisé selon le type de parcours (boucle, aller simple, aller-retour, répétitions, plat). */
function stylized(r: Route): { d: string; start: Pt; end?: Pt } {
  const rnd = seeded(r.id + r.name);
  const n = r.name.toLowerCase();
  if (/côte|cote|butte|répét|repet|hamster/.test(n + (r.note ?? '').toLowerCase())) {
    const reps = 4 + Math.floor(rnd() * 3);
    const x0 = 80;
    const step = (W - 150) / reps;
    let d = `M${x0} 120`;
    for (let i = 0; i < reps; i++) d += ` L${x0 + step * (i + 0.5)} ${48 + rnd() * 16} L${x0 + step * (i + 1)} 120`;
    return { d, start: [x0, 120] };
  }
  if (r.name.includes('→')) {
    const pts: Pt[] = Array.from({ length: 6 }, (_, i) => [60 + i * 48, 58 + rnd() * 48 - (i === 5 ? 0 : 0)]);
    return { d: smooth(pts, false), start: pts[0], end: pts[pts.length - 1] };
  }
  if (r.name.includes('↔')) {
    const pts: Pt[] = Array.from({ length: 5 }, (_, i) => [80 + i * 52, 104 - i * 14 - rnd() * 18]);
    return { d: smooth(pts, false), start: pts[0], end: pts[pts.length - 1] };
  }
  if (/seine|bord|plat/.test(n) || r.elevationGain < 60) {
    const pts: Pt[] = Array.from({ length: 6 }, (_, i) => [50 + i * 52, 112 - Math.sin(i * 0.9) * 22 - rnd() * 8]);
    return { d: smooth(pts, false), start: pts[0], end: pts[pts.length - 1] };
  }
  // Boucle
  const cx = 179;
  const cy = 78;
  const pts: Pt[] = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    const rr = 0.7 + rnd() * 0.45;
    return [cx + Math.cos(a) * 92 * rr, cy + Math.sin(a) * 40 * rr];
  });
  return { d: smooth(pts, true), start: pts[2] };
}

/** Projette un tracé GPX dans la carte (en gardant les proportions). */
function fromGpx(gpx: string): { d: string; start: Pt; end?: Pt } | null {
  try {
    const t = parseGpx(gpx);
    const lat0 = t.points[0].lat;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const xs = t.points.map((p) => p.lon * k);
    const ys = t.points.map((p) => -p.lat);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const scale = Math.min((W - 60) / Math.max(1e-9, maxX - minX), (H - 40) / Math.max(1e-9, maxY - minY));
    const ox = (W - (maxX - minX) * scale) / 2;
    const oy = (H - (maxY - minY) * scale) / 2;
    const P = (i: number): Pt => [ox + (xs[i] - minX) * scale, oy + (ys[i] - minY) * scale];
    const every = Math.max(1, Math.floor(t.points.length / 300));
    const pts: Pt[] = [];
    for (let i = 0; i < t.points.length; i += every) pts.push(P(i));
    pts.push(P(t.points.length - 1));
    const start = pts[0];
    const end = pts[pts.length - 1];
    const loop = Math.hypot(end[0] - start[0], end[1] - start[1]) < 12;
    return { d: 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L'), start, end: loop ? undefined : end };
  } catch {
    return null;
  }
}

/** Carte stylisée d'un parcours (pas de fond de carte en ligne : tout est dessiné, hors ligne). */
export function RouteMap({ route, location }: { route?: Route; location: string }) {
  const shape = useMemo(() => (route ? (route.gpx && fromGpx(route.gpx)) || stylized(route) : null), [route]);
  const nice = location === 'Nice';
  const stCloud = location === 'Saint-Cloud';
  const water = nice ? 'M0 124 C 90 110, 170 134, 250 118 S 340 106, 358 110 L358 160 L0 160 Z' : stCloud ? 'M-10 138 C 50 126, 100 150, 140 160 L-10 160 Z' : '';
  const green = nice ? 'M200 0 C 260 20, 330 10, 358 30 L358 0 Z' : stCloud ? 'M40 20 C 120 0, 300 10, 340 50 S 320 140, 220 140 S 40 130, 40 80 Z' : 'M250 0 C 290 30, 340 20, 358 40 L358 0 Z';
  return (
    <svg role="img" aria-label={route ? `Tracé ${route.gpx ? '' : 'stylisé '}du parcours ${route.name}` : 'Aucun parcours'} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
      <defs>
        <linearGradient id="rt" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFB36B" />
          <stop offset="1" stopColor="#FF5F6D" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="var(--map-bg)" />
      <path d={green} fill="var(--map-green)" />
      {water && <path d={water} fill="var(--map-water)" />}
      <path d="M-10 52 C 70 30, 150 70, 240 42 S 340 22, 370 34" fill="none" stroke="var(--map-road)" strokeWidth="3" />
      {shape && (
        <>
          <path d={shape.d} fill="none" stroke="var(--map-road)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <path d={shape.d} fill="none" stroke="url(#rt)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {shape.end && <circle cx={shape.end[0]} cy={shape.end[1]} r="5" fill="#FF5F6D" stroke="#fff" strokeWidth="2" />}
          <circle cx={shape.start[0]} cy={shape.start[1]} r="8" fill="#fff" />
          <circle cx={shape.start[0]} cy={shape.start[1]} r="4.5" fill="#1E1B2E" />
        </>
      )}
    </svg>
  );
}
