import { useRef } from 'react';
import { downsample, eleAt, type Track } from '../lib/gpx';
import { formatNumber } from '../lib/format';

/**
 * Profil du dénivelé d'un tracé GPX. Glisser le doigt dessus affiche le km et l'altitude
 * (et déplace le point sur la carte via onCursor).
 */
export function ElevationProfile(props: {
  track: Track;
  /** Ravitos / repères (km) */
  markers?: { km: number }[];
  /** Zones à surligner (ex. nuit) */
  bands?: { from: number; to: number; color: string }[];
  /** Numéros de section centrés sous le profil */
  sections?: { from: number; to: number; label: string }[];
  cursorKm?: number | null;
  onCursor?: (km: number | null) => void;
  footer?: React.ReactNode;
}) {
  const t = props.track;
  const W = 350;
  const BASE = 120;
  const svgRef = useRef<SVGSVGElement>(null);
  const pts = downsample(t, 220);
  const span = Math.max(1, t.maxEle - t.minEle);
  const x = (d: number) => (d / t.distanceKm) * W;
  const y = (e: number) => BASE - 6 - ((e - t.minEle) / span) * (BASE - 20);
  const line = 'M' + pts.map((p) => `${x(p.d).toFixed(1)} ${y(p.ele).toFixed(1)}`).join(' L');
  const fill = `${line} L${W} ${BASE} L0 ${BASE} Z`;
  const stepKm = t.distanceKm > 40 ? 10 : t.distanceKm > 15 ? 5 : t.distanceKm > 6 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(t.distanceKm / stepKm) }, (_, i) => (i + 1) * stepKm).filter((k) => t.distanceKm - k > stepKm * 0.4);
  const c = props.cursorKm;

  const kmAt = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(t.distanceKm, ((clientX - r.left) / r.width) * t.distanceKm));
  };

  return (
    <svg
      ref={svgRef}
      data-noswipe
      role="img"
      aria-label={`Profil : ${formatNumber(t.distanceKm)} km, ${formatNumber(t.gain, 0)} m de D+, ${formatNumber(t.loss, 0)} m de D−, de ${formatNumber(t.minEle, 0)} à ${formatNumber(t.maxEle, 0)} m d'altitude`}
      viewBox={`0 -14 ${W} 172`}
      style={{ width: '100%', height: 'auto', overflow: 'visible', touchAction: props.onCursor ? 'none' : undefined }}
      onPointerDown={(e) => {
        if (!props.onCursor) return;
        (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        props.onCursor(kmAt(e.clientX));
      }}
      onPointerMove={(e) => props.onCursor && e.buttons !== 0 && props.onCursor(kmAt(e.clientX))}
      onPointerUp={() => props.onCursor?.(null)}
      onPointerCancel={() => props.onCursor?.(null)}
    >
      <defs>
        <linearGradient id="epFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF6B6B" stopOpacity=".40" />
          <stop offset="1" stopColor="#FFB36B" stopOpacity=".03" />
        </linearGradient>
        <linearGradient id="epLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFB36B" />
          <stop offset="1" stopColor="#FF5F6D" />
        </linearGradient>
      </defs>
      {(props.bands ?? []).map((b, i) => (
        <rect key={i} x={x(b.from)} y="0" width={Math.max(0, x(b.to) - x(b.from))} height={BASE} rx="6" fill={b.color} />
      ))}
      <path d={fill} fill="url(#epFill)" />
      <path d={line} fill="none" stroke="url(#epLine)" strokeWidth="2.5" strokeLinejoin="round" />
      <line x1="0" y1={BASE} x2={W} y2={BASE} stroke="var(--track)" strokeWidth="1.5" />
      <text x="2" y="-3" fontSize="10" fill="var(--muted)" fontFamily="Inter">
        {formatNumber(t.maxEle, 0)} m
      </text>
      {(props.markers ?? []).map((m) => {
        const yy = y(eleAt(t, m.km));
        return (
          <g key={m.km}>
            <line x1={x(m.km)} y1={yy + 6} x2={x(m.km)} y2={BASE} stroke="var(--line-off)" strokeDasharray="2 3" />
            <circle cx={x(m.km)} cy={yy} r="5" fill="var(--bg)" stroke="#FF8A5C" strokeWidth="2.5" />
          </g>
        );
      })}
      {props.sections
        ? props.sections.map((s) => (
            <text key={s.label} x={x((s.from + s.to) / 2)} y="138" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--ink)" fontFamily="Inter">
              {s.label}
            </text>
          ))
        : ticks.map((k) => (
            <text key={k} x={x(k)} y="136" textAnchor="middle" fontSize="10" fill="var(--muted)" fontFamily="Inter">
              {k}
            </text>
          ))}
      {!props.sections && (
        <text x={W} y="136" textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="Inter">
          km
        </text>
      )}
      {c != null && (
        <g>
          <line x1={x(c)} y1="0" x2={x(c)} y2={BASE} stroke="#7A6BFF" strokeWidth="1.5" />
          <circle cx={x(c)} cy={y(eleAt(t, c))} r="5" fill="#7A6BFF" stroke="#fff" strokeWidth="2" />
          <g transform={`translate(${Math.min(W - 92, Math.max(0, x(c) - 46))} -14)`}>
            <rect width="92" height="20" rx="10" fill="var(--nav-on)" />
            <text x="46" y="14" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--nav-on-ink)" fontFamily="Inter">
              km {formatNumber(c, 1)} · {formatNumber(eleAt(t, c), 0)} m
            </text>
          </g>
        </g>
      )}
      {props.footer}
    </svg>
  );
}
