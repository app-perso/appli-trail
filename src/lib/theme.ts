// Thème jour / nuit : automatique selon le réglage de l'iPhone, ou forcé dans Réglages.
import { useEffect } from 'react';
import type { ThemeChoice } from '../db/types';

const BG = { jour: '#F7F4FA', nuit: '#0E0C1F' };

export function useApplyTheme(choice: ThemeChoice | undefined) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const t = choice === 'jour' || choice === 'nuit' ? choice : mq.matches ? 'nuit' : 'jour';
      document.documentElement.dataset.theme = t;
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', BG[t]));
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [choice]);
}

/** Petit retour haptique si le téléphone le permet (sans effet sinon). */
export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* rien */
  }
}
