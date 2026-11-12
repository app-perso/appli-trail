// Lecture d'un fichier GPX avec le lecteur XML du navigateur (DOMParser), sans serveur ni librairie.

export interface TrackPoint {
  /** distance cumulée depuis le départ, en km */
  d: number;
  /** altitude lissée, en m */
  ele: number;
  lat: number;
  lon: number;
}

export interface Track {
  points: TrackPoint[];
  distanceKm: number;
  gain: number;
  loss: number;
  minEle: number;
  maxEle: number;
  name?: string;
}

const R = 6371.0088; // rayon moyen de la Terre (km)
function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Lit le GPX (traces <trkpt>, sinon itinéraires <rtept>).
 * L'altitude est lissée et le dénivelé compté avec un seuil (hystérésis de 4 m) pour ne pas additionner le « bruit » du GPS.
 */
export function parseGpx(xml: string): Track {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error("Ce fichier n'est pas un GPX lisible.");
  let nodes = Array.from(doc.getElementsByTagName('trkpt'));
  if (!nodes.length) nodes = Array.from(doc.getElementsByTagName('rtept'));
  const raw = nodes
    .map((n) => ({
      lat: parseFloat(n.getAttribute('lat') ?? ''),
      lon: parseFloat(n.getAttribute('lon') ?? ''),
      ele: parseFloat(n.getElementsByTagName('ele')[0]?.textContent ?? 'NaN'),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (raw.length < 2) throw new Error('Aucune trace trouvée dans ce GPX.');
  if (!raw.some((p) => Number.isFinite(p.ele))) throw new Error("Ce GPX n'a pas d'altitudes : impossible de calculer le dénivelé.");

  // Altitudes manquantes : on reprend la précédente connue
  let last = raw.find((p) => Number.isFinite(p.ele))!.ele;
  for (const p of raw) {
    if (Number.isFinite(p.ele)) last = p.ele;
    else p.ele = last;
  }
  // Lissage léger (moyenne glissante sur 5 points)
  const smooth = raw.map((_, i) => {
    const w = raw.slice(Math.max(0, i - 2), i + 3);
    return w.reduce((t, p) => t + p.ele, 0) / w.length;
  });

  const points: TrackPoint[] = [];
  let d = 0;
  let gain = 0;
  let loss = 0;
  let ref = smooth[0];
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) d += haversine(raw[i - 1], raw[i]);
    const e = smooth[i];
    if (e - ref >= 4) {
      gain += e - ref;
      ref = e;
    } else if (ref - e >= 4) {
      loss += ref - e;
      ref = e;
    }
    points.push({ d, ele: e, lat: raw[i].lat, lon: raw[i].lon });
  }
  const eles = points.map((p) => p.ele);
  return {
    points,
    distanceKm: d,
    gain,
    loss,
    minEle: Math.min(...eles),
    maxEle: Math.max(...eles),
    name: doc.querySelector('trk > name, metadata > name, rte > name')?.textContent?.trim() || undefined,
  };
}

/** D+ / D− et distance entre deux kilomètres de la trace. */
export function segmentStats(track: Track, fromKm: number, toKm: number): { km: number; gain: number; loss: number } {
  const pts = track.points.filter((p) => p.d >= fromKm && p.d <= toKm);
  let gain = 0;
  let loss = 0;
  if (pts.length > 1) {
    let ref = pts[0].ele;
    for (const p of pts) {
      if (p.ele - ref >= 4) {
        gain += p.ele - ref;
        ref = p.ele;
      } else if (ref - p.ele >= 4) {
        loss += ref - p.ele;
        ref = p.ele;
      }
    }
  }
  return { km: toKm - fromKm, gain, loss };
}

/** Altitude à un kilomètre donné (interpolée). */
export function eleAt(track: Track, km: number): number {
  const pts = track.points;
  const i = pts.findIndex((p) => p.d >= km);
  if (i <= 0) return pts[i === 0 ? 0 : pts.length - 1].ele;
  const a = pts[i - 1];
  const b = pts[i];
  const f = b.d === a.d ? 0 : (km - a.d) / (b.d - a.d);
  return a.ele + (b.ele - a.ele) * f;
}

/** Profil simplifié (~n points) pour le dessin. */
export function downsample(track: Track, n = 240): { d: number; ele: number }[] {
  const out: { d: number; ele: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const km = (track.distanceKm * i) / n;
    out.push({ d: km, ele: eleAt(track, km) });
  }
  return out;
}
