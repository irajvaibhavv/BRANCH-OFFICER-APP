import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useOfflineDetect } from '../hooks/useOfflineDetect';
import { useLocalStorage } from '../hooks/useLocalStorage';

/*
  OFFLINE MODE (prototype)
  ------------------------
  - `isOnline` = browser online status AND NOT the demo "simulate offline" toggle.
  - Any action performed while offline is pushed onto `queue` (persisted in localStorage).
  - When we go back online we show "Syncing…" for ~1.5s, then "All data synced" for 3s.

  PRODUCTION NOTES
  ----------------
  - Replace localStorage queue with IndexedDB (Dexie/idb) — photos as Blobs, not base64.
  - Register a Service Worker (Workbox) with:
      • precache of the app shell so it opens offline
      • NetworkFirst for API GETs with a cache fallback
      • Background Sync (`sync` event) that drains the IndexedDB queue and POSTs to the API
  - Conflict resolution: each queued mutation carries a client UUID + timestamp; server
    dedupes on UUID so retries are idempotent.
*/
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
