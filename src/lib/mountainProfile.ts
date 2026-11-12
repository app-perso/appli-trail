// Dessin d'un profil « façon trail » où chaque course est un sommet (repris de la maquette P_Accueil).

export interface Peak {
  x: number;
  /** hauteur du sommet au-dessus de la ligne de base (px) */
  h: number;
  /** largeur du sommet */
  sig?: number;
}

export function mountainProfile(peaks: Peak[], x0: number, x1: number, base: number) {
  // Relief de fond légèrement ondulé
  const raw = (x: number) => base - 6 - (x - x0) * 0.02 - (5 * Math.sin(x * 0.21) + 3 * Math.sin(x * 0.57 + 1) + 1.6 * Math.sin(x * 1.7));
  const amp = peaks.map(() => 0);
  const elevNoClamp = (x: number) => {
    let y = raw(x);
    peaks.forEach((p, i) => {
      y -= amp[i] * Math.exp(-(((x - p.x) / (p.sig ?? 22)) ** 2));
    });
    return y;
  };
  // Ajuste l'amplitude de chaque sommet pour qu'il atteigne exactement sa hauteur
  for (let it = 0; it < 6; it++) peaks.forEach((p, i) => (amp[i] += elevNoClamp(p.x) - (base - p.h)));
  const elev = (x: number) => Math.min(base - 4, elevNoClamp(x));
  const pts: string[] = [];
  for (let x = x0; x <= x1; x += 3) pts.push(`${x} ${elev(x).toFixed(1)}`);
  pts.push(`${x1} ${elev(x1).toFixed(1)}`);
  const lineD = 'M' + pts.join(' L');
  return { lineD, fillD: `${lineD} L${x1} ${base} L${x0} ${base} Z`, elev };
}
