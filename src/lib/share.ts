// Partage de fichiers : menu de partage iOS (Enregistrer dans Fichiers, AirDrop…) ou téléchargement.
export async function shareOrDownload(files: File[], title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files, title });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
      // Certains navigateurs refusent le partage de plusieurs fichiers : on télécharge
    }
  }
  for (const file of files) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return 'downloaded';
}
