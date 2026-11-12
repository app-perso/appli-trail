import { IconBolt } from './Icons';

/** Difficulté en éclairs (0 à 5). */
export function Bolts({ n, size = 18 }: { n: number; size?: number }) {
  return (
    <span className="bolts" role="img" aria-label={`Difficulté ${n} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= n ? (n >= 4 ? 'var(--coral)' : 'var(--ink)') : 'var(--line-off)', opacity: i <= n ? 1 : 0.5 }}>
          <IconBolt size={size} />
        </span>
      ))}
    </span>
  );
}
