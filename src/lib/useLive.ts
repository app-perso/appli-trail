// Petit crochet React : relit la base automatiquement quand elle change (liveQuery de Dexie).
import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';

export function useLive<T>(query: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
