// Petit message qui s'affiche quelques secondes en bas de l'écran, même après un changement d'écran.
import { useEffect, useState } from 'react';

let listener: ((m: string) => void) | null = null;

export function toast(message: string) {
  listener?.(message);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  useEffect(() => {
    listener = (m) => {
      setMsg(m);
      setKey((k) => k + 1);
    };
    return () => {
      listener = null;
    };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2800);
    return () => clearTimeout(t);
  }, [msg, key]);
  return msg ? (
    <div className="toast" role="status" key={key}>
      {msg}
    </div>
  ) : null;
}
