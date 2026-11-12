// Barre des zones cardiaques (Z1 → Z5), comme sur la maquette du débrief.
const COLORS = ['#C9C0F2', '#1FC8A5', '#FFB36B', '#FF5F6D', 'var(--ink)'];

/** zones = fractions 0-1 (Z1 à Z5) */
export function ZonesBar({ zones }: { zones: number[] }) {
  const pct = zones.map((z) => Math.round(z * 100));
  const label = pct.map((p, i) => `Z${i + 1} ${p} %`).join(', ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div role="img" aria-label={`Zones : ${label}`} style={{ display: 'flex', gap: 3, height: 8 }}>
        {pct.map((p, i) =>
          p > 0 ? <span key={i} style={{ width: `${p}%`, minWidth: 4, borderRadius: 999, background: COLORS[i] }} /> : null,
        )}
      </div>
      <div className="small muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
        {pct.map((p, i) => (
          <span key={i}>
            <b style={{ color: 'var(--ink)', fontWeight: 600 }}>Z{i + 1}</b> {p} %
          </span>
        ))}
      </div>
    </div>
  );
}
