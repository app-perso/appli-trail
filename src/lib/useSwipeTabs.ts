// Balayer l'écran à gauche / à droite pour passer d'un onglet à l'autre :
// Objectif ↔ Charge ↔ Semaine ↔ Parcours (même ordre que la barre du bas).
import { useEffect } from 'react';
import { go, type RouteName } from './router';
import { haptic } from './theme';

export const TABS: RouteName[] = ['accueil', 'charge', 'semaine', 'parcours'];

// Éléments où le doigt doit garder son rôle habituel (curseurs, champs, fenêtres, cartes à glisser…)
const IGNORE = 'input, textarea, select, [data-noswipe], .sheet-backdrop, .plan-session, .shot-thumb';
const EDGE = 18; // bords réservés aux gestes de l'iPhone
const DISTANCE = 70; // px pour valider le changement
const LOCK = 10; // px avant de décider : défilement vertical ou balayage

export function useSwipeTabs(route: RouteName) {
  useEffect(() => {
    const idx = TABS.indexOf(route);
    if (idx < 0) return;
    let s: { x: number; y: number; t: number; mode: 'undecided' | 'swipe' | 'scroll'; el: HTMLElement | null } | null = null;

    const reset = (el: HTMLElement | null, animate: boolean) => {
      if (!el) return;
      el.style.transition = animate ? 'transform 200ms ease, opacity 200ms ease' : '';
      el.style.transform = '';
      el.style.opacity = '';
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length > 1 || t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return;
      if ((e.target as Element).closest?.(IGNORE)) return;
      s = { x: t.clientX, y: t.clientY, t: Date.now(), mode: 'undecided', el: document.querySelector('main.screen') };
    };
    const onMove = (e: TouchEvent) => {
      if (!s) return;
      const t = e.touches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (s.mode === 'undecided') {
        if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
        s.mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'swipe' : 'scroll';
      }
      if (s.mode !== 'swipe') return;
      e.preventDefault();
      const hasNext = dx < 0 ? idx < TABS.length - 1 : idx > 0;
      const shift = hasNext ? dx * 0.6 : dx * 0.15; // résistance s'il n'y a pas d'onglet de ce côté
      if (s.el) {
        s.el.style.transition = 'none';
        s.el.style.transform = `translateX(${shift}px)`;
        s.el.style.opacity = String(1 - Math.min(0.4, Math.abs(shift) / 600));
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (!s) return;
      const cur = s;
      s = null;
      if (cur.mode !== 'swipe') return;
      const dx = (e.changedTouches[0]?.clientX ?? cur.x) - cur.x;
      const fast = Math.abs(dx) / Math.max(1, Date.now() - cur.t) > 0.45 && Math.abs(dx) > 30;
      const target = dx < 0 ? TABS[idx + 1] : TABS[idx - 1];
      if (target && (Math.abs(dx) > DISTANCE || fast)) {
        haptic(8);
        document.documentElement.dataset.swipe = dx < 0 ? 'next' : 'prev';
        setTimeout(() => delete document.documentElement.dataset.swipe, 400);
        go(target);
      } else reset(cur.el, true);
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [route]);
}
