// Préparation des images : compression pour le stockage, et nettoyage avant lecture.

async function load(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

/** Convertit la capture en JPEG (2 600 px de haut max) pour économiser la place, en restant lisible pour « Relire ». */
export async function compressForStorage(file: Blob): Promise<Blob> {
  const img = await load(file);
  const scale = Math.min(1, 2600 / img.height);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  img.close();
  return new Promise((resolve) => c.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.8));
}

/**
 * Nettoyage avant lecture : niveaux de gris et inversion si fond sombre (thème noir de Suunto).
 * Le texte ressort en noir sur blanc, ce que Tesseract lit le mieux.
 */
export async function preprocessForOcr(blob: Blob): Promise<HTMLCanvasElement> {
  const img = await load(blob);
  // Agrandissement : les chiffres fins (« 1211 ») sont mieux reconnus en grand.
  // On vise ~1 800 px de large (une capture d'iPhone fait 1 170 à 1 320 px).
  const scale = Math.min(2.5, Math.max(1, 1700 / img.width));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  img.close();

  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const dark = sum / (px.length / 4) < 128;
  for (let i = 0; i < px.length; i += 4) {
    // Niveaux de gris simples : un contraste trop fort « mange » les chiffres fins (1211 lu 121)
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    px[i] = px[i + 1] = px[i + 2] = dark ? 255 - g : g;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}
