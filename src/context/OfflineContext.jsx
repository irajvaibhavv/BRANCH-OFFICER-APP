import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useOfflineDetect } from '../hooks/useOfflineDetect';
import { useLocalStorage } from '../hooks/useLocalStorage';

// isOnline = browser online && !simulated offline. Offline actions queue in localStorage and "sync" on reconnect.
// Production: IndexedDB queue + service worker Background Sync, with client UUIDs for idempotent retries.
const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const browserOnline = useOfflineDetect();
  const [simulateOffline, setSimulateOffline] = useLocalStorage('bo_sim_offline', false);
  const [queue, setQueue] = useLocalStorage('bo_sync_queue', []);
  const [syncState, setSyncState] = useState('idle'); // idle | syncing | synced

  const isOnline = browserOnline && !simulateOffline;

  // Drain queue when we come back online
  useEffect(() => {
    if (!isOnline) return;
    if (queue.length === 0 && syncState === 'idle') return;
    setSyncState('syncing');
    const t1 = setTimeout(() => {
      setQueue([]); // <- would be: POST each queued item, remove on 2xx
      setSyncState('synced');
    }, 1500);
    const t2 = setTimeout(() => setSyncState('idle'), 4500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const enqueue = useCallback(
    (action) => setQueue((q) => [...q, { id: crypto.randomUUID(), at: Date.now(), ...action }]),
    [setQueue],
  );

  return (
    <OfflineContext.Provider value={{ isOnline, simulateOffline, setSimulateOffline, queue, enqueue, syncState }}>
      {children}
    </OfflineContext.Provider>
  );
}

export const useOffline = () => useContext(OfflineContext);
