import { useState, useEffect, useCallback } from 'react';

// Persist a piece of state in localStorage. All prototype "backend" state lives here.
// In production this layer would be replaced by IndexedDB (via idb/Dexie) for larger
// payloads like photos and a sync queue consumed by a service worker.
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota exceeded or private mode — ignore in prototype */
    }
  }, [key, value]);

  const remove = useCallback(() => {
    window.localStorage.removeItem(key);
    setValue(initialValue);
  }, [key, initialValue]);

  return [value, setValue, remove];
}
