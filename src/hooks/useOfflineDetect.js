import { useEffect, useState } from 'react';

// Listens to the browser's real online/offline events. OfflineContext combines this
// with a manual "simulate offline" toggle for demos.
export function useOfflineDetect() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
