import { useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { takeDrafts } from '../services/sarthi/repeat';
import pdHistory from '../data/sarthi/pdHistory.json';

// Seeded PD history (Mahesh Agarwal, three PDs), dated back from today so the trail always looks recent.
const at = (daysAgo, minutesBefore = 0) => new Date(Date.now() - daysAgo * 86400000 - minutesBefore * 60000).toISOString();
const SEED = pdHistory.map(({ daysAgo, minutes, review, ...r }) => ({
  ...r,
  startedAt: at(daysAgo, minutes + 1),
  endedAt: at(daysAgo, 1),
  createdAt: at(daysAgo),
  ...(review ? { review: { ...review, daysAgo: undefined, at: at(review.daysAgo) } } : {}),
}));

export function useSarthiReports() {
  const [reports, setReports] = useLocalStorage('bo_sarthi_reports', SEED);
  // A dropped call's draft becomes an incomplete PD on the first PD screen that opens (repeat.js takeDrafts).
  // The drafts are taken outside the updater: StrictMode runs updaters twice and the second would find none.
  useEffect(() => {
    const found = takeDrafts();
    if (found.length) setReports((prev) => [...found.filter((d) => !prev.some((p) => p.id === d.id)), ...prev]);
  }, [setReports]);
  return [reports, setReports];
}

// A generated report waits here until a BO or CO ticks "reviewed" on it; only then does it join the saved PDs above,
// so history, outcomes and repeat PDs never see an unconfirmed one. Kept in storage so a closed app loses nothing.
export const usePendingPds = () => useLocalStorage('bo_sarthi_pending', []);
