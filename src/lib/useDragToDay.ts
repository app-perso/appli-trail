// Glisser une séance vers un autre jour du plan.
// Sur iPhone : appui long (~0,35 s) sur la carte, puis glisser. Un mouvement rapide fait défiler la page normalement.
// À la souris : cliquer-glisser.
// Les jours sont repérés par l'attribut data-day="AAAA-MM-JJ" de leur bloc.
import { useCallback, useEffect, useRef, useState } from 'react';
import { haptic } from './theme';

export interface DragState {
  id: string;
  dx: number;
  dy: number;
  over?: string;
}

const LONG_PRESS_MS = 350;
const MOVE_TOLERANCE = 8;

export function useDragToDay(onDrop: (id: string, day: string) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const ref = useRef<{
    id: string;
    x: number;
    y: number;
    scrollY: number;
    active: boolean;
    timer?: number;
    over?: string;
  } | null>(null);
  const suppressClick = useRef(false);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  const dayAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest('[data-day]') as HTMLElement | null)?.dataset.day;

  const move = useCallback((x: number, y: number) => {
    const s = ref.current;
    if (!s?.active) return;
    // Défilement automatique près des bords de l'écran
    if (y < 90) window.scrollBy(0, -12);
    else if (y > window.innerHeight - 120) window.scrollBy(0, 12);
    s.over = dayAt(x, y);
    setDrag({ id: s.id, dx: x - s.x, dy: y - s.y + (window.scrollY - s.scrollY), over: s.over });
  }, []);

  const end = useCallback(() => {
    const s = ref.current;
    if (!s) return;
    window.clearTimeout(s.timer);
    if (s.active) {
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 50);
      if (s.over) dropRef.current(s.id, s.over);
    }
    ref.current = null;
    setDrag(null);
  }, []);

  // Écouteurs globaux pendant un appui (touchmove non « passif » pour pouvoir bloquer le défilement)
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      const s = ref.current;
      if (!s) return;
      const t = e.touches[0];
      if (!s.active) {
        if (Math.hypot(t.clientX - s.x, t.clientY - s.y) > MOVE_TOLERANCE) {
          window.clearTimeout(s.timer);
          ref.current = null; // c'était un défilement
        }
        return;
      }
      e.preventDefault();
      move(t.clientX, t.clientY);
    };
    const onMouseMove = (e: MouseEvent) => {
      const s = ref.current;
      if (!s) return;
      if (!s.active && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE) {
        s.active = true;
        setDrag({ id: s.id, dx: 0, dy: 0 });
      }
      move(e.clientX, e.clientY);
    };
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', end);
    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', end);
    };
  }, [move, end]);

  /** À mettre sur chaque carte déplaçable. */
  const handlers = (id: string) => ({
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      const s = { id, x: t.clientX, y: t.clientY, scrollY: window.scrollY, active: false, timer: 0 };
      s.timer = window.setTimeout(() => {
        s.active = true;
        haptic(15);
        setDrag({ id, dx: 0, dy: 0, over: dayAt(s.x, s.y) });
      }, LONG_PRESS_MS);
      ref.current = s;
    },
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      ref.current = { id, x: e.clientX, y: e.clientY, scrollY: window.scrollY, active: false };
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return { drag, handlers, shouldIgnoreClick: () => suppressClick.current };
}
