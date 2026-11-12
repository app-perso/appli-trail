// Préparation des images : compression pour le stockage, et nettoyage avant lecture.

async function load(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

/** Réduit la capture (JPEG, 1 600 px de haut max) pour économiser la place sur le téléphone. */
export async function compressForStorage(file: Blob): Promise<Blob> {
  const img = await load(file);
  const scale = Math.min(1, 1600 / img.height);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  img.close();
  return new Promise((resolve) => c.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85));
}

/**
 * Nettoyage avant lecture : niveaux de gris, inversion si fond sombre (thème noir de Suunto),
 * puis contraste renforcé. Le texte ressort en noir sur blanc, ce que Tesseract lit le mieux.
 */
export async function preprocessForOcr(blob: Blob): Promise<HTMLCanvasElement> {
  const img = await load(blob);
  // Les petites images sont agrandies (Tesseract préfère des lettres d'au moins ~20 px)
  const scale = img.width < 900 ? 2 : 1;
  const c = document.createElement('canvas');
  c.width = img.width * scale;
  c.height = img.height * scale;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  img.close();

  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  let sum = 0;
  const gray = new Uint8ClampedArray(px.length / 4);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    // Le max des canaux garde lisibles les textes colorés (orange, vert…) sur fond noir
    const g = Math.max(px[i], px[i + 1], px[i + 2]) * 0.6 + (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) * 0.4;
    gray[j] = g;
    sum += g;
  }
  const dark = sum / gray.length < 128;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    let g = dark ? 255 - gray[j] : gray[j];
    g = (g - 128) * 1.6 + 128; // contraste
    px[i] = px[i + 1] = px[i + 2] = g;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}
