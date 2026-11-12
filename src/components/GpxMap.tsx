import { useEffect, useRef, useState } from 'react';
import type { Track } from '../lib/gpx';

// Carte du tracé sur fond OpenStreetMap (gratuit, sans compte, sans librairie).
// Le téléphone télécharge seulement les « tuiles » (images) de la zone du tracé ; le GPX ne quitte jamais l'appareil.
// Sans connexion, le tracé reste dessiné sur un fond uni.

const TILE = 256;
const MAX_ZOOM = 17;

/** Projection Web Mercator : position en pixels « monde » au zoom 0. */
function project(lat: number, lon: number): [number, number] {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return [((lon + 180) / 360) * TILE, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE];
}

export interface MapMarker {
  km: number;
  label?: string;
}

export function GpxMap(props: { track: Track; markers?: MapMarker[]; cursorKm?: number | null; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(358);
  const H = props.height ?? 220;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 358));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = props.track.points;
  const world = pts.map((p) => project(p.lat, p.lon));
  const xs = world.map((w) => w[0]);
  const ys = world.map((w) => w[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // Zoom (fractionnaire) pour que le tracé remplisse la carte, avec une marge
  const fit = Math.min((width - 40) / Math.max(1e-9, maxX - minX), (H - 40) / Math.max(1e-9, maxY - minY));
  const zf = Math.max(1, Math.min(MAX_ZOOM, Math.log2(fit)));
  const scale = 2 ** zf;
  const cx = ((minX + maxX) / 2) * scale;
  const cy = ((minY + maxY) / 2) * scale;
  const ox = cx - width / 2;
  const oy = cy - H / 2;
  const P = (i: number): [number, number] => [world[i][0] * scale - ox, world[i][1] * scale - oy];

  // Tuiles au zoom entier juste au-dessus (plus nettes, surtout sur écran Retina), affichées un peu réduites
  const hd = typeof window !== 'undefined' && window.devicePixelRatio >= 2;
  const tz = Math.min(MAX_ZOOM + 1, Math.ceil(zf) + (hd ? 1 : 0));
  const ts = TILE * 2 ** (zf - tz); // taille affichée d'une tuile (px)
  const tiles: { x: number; y: number; left: number; top: number }[] = [];
  const n = 2 ** tz;
  for (let ty = Math.floor(oy / ts); ty <= Math.floor((oy + H) / ts); ty++) {
    for (let tx = Math.floor(ox / ts); tx <= Math.floor((ox + width) / ts); tx++) {
      if (ty < 0 || ty >= n) continue;
      tiles.push({ x: ((tx % n) + n) % n, y: ty, left: tx * ts - ox, top: ty * ts - oy });
    }
  }

  const every = Math.max(1, Math.floor(pts.length / 600));
  let d = '';
  for (let i = 0; i < pts.length; i += every) {
    const [x, y] = P(i);
    d += `${d ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  const [ex, ey] = P(pts.length - 1);
  d += `L${ex.toFixed(1)} ${ey.toFixed(1)}`;
  const at = (km: number) => {
    const i = pts.findIndex((p) => p.d >= km);
    return P(i < 0 ? pts.length - 1 : i);
  };
  const [sx, sy] = P(0);
  const loop = Math.hypot(ex - sx, ey - sy) < 14;
  const cursor = props.cursorKm != null ? at(props.cursorKm) : null;

  return (
    <div ref={box} className="gpx-map" style={{ height: H }}>
      {tiles.map((t) => (
        <img
          key={`${tz}-${t.x}-${t.y}-${t.left}`}
          className="gpx-tile"
          src={`https://tile.openstreetmap.org/${tz}/${t.x}/${t.y}.png`}
          alt=""
          draggable={false}
          loading="lazy"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
          style={{ left: t.left, top: t.top, width: ts, height: ts }}
        />
      ))}
      <svg className="gpx-overlay" viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Carte du tracé GPX">
        <defs>
          <linearGradient id="gpxLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FFB36B" />
            <stop offset="1" stopColor="#FF5F6D" />
          </linearGradient>
        </defs>
        <path d={d} fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <path d={d} fill="none" stroke="url(#gpxLine)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        {(props.markers ?? []).map((m) => {
          const [x, y] = at(m.km);
          return <circle key={m.km} cx={x} cy={y} r="5" fill="#fff" stroke="#FF8A5C" strokeWidth="2.5" />;
        })}
        {!loop && <circle cx={ex} cy={ey} r="6" fill="#FF5F6D" stroke="#fff" strokeWidth="2.5" />}
        <circle cx={sx} cy={sy} r="8" fill="#fff" />
        <circle cx={sx} cy={sy} r="4.5" fill="#1E1B2E" />
        {cursor && (
          <g>
            <circle cx={cursor[0]} cy={cursor[1]} r="12" fill="#7A6BFF" opacity="0.25" />
            <circle cx={cursor[0]} cy={cursor[1]} r="6" fill="#7A6BFF" stroke="#fff" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      <a className="gpx-attrib" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        © OpenStreetMap
      </a>
    </div>
  );
}
