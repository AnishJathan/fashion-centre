import { useEffect, useState } from 'react';
import { emptyHistory, HISTORY_KEY, readHistory, recordVisit } from '../mobile/src/core/browsingHistory';
export function useBrowsingHistory(store?: string, product?: string) {
  const read = () => { try { return readHistory(localStorage.getItem(HISTORY_KEY)); } catch { return emptyHistory(); } };
  const [history, setHistory] = useState(read);
  useEffect(() => {
    const refresh = (event: StorageEvent) => { if (!event.key || event.key === HISTORY_KEY) setHistory(read()); };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);
  useEffect(() => {
    if (!store) return;
    const update = () => {
      try {
        const previous = readHistory(localStorage.getItem(HISTORY_KEY));
        const next = recordVisit(previous, store, product);
        if (next !== previous) localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        setHistory(next);
      } catch { setHistory(previous => recordVisit(previous, store, product)); }
    };
    if (navigator.locks) void navigator.locks.request(HISTORY_KEY, update).catch(update);
    else update();
  }, [store, product]);
  async function clearHistory() {
    const clear = () => {
      localStorage.removeItem(HISTORY_KEY);
      setHistory(emptyHistory());
    };
    if (navigator.locks) await navigator.locks.request(HISTORY_KEY, clear);
    else clear();
  }
  return {history, clearHistory};
}
