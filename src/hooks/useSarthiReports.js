import { useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { readDrafts } from '../services/sarthi/repeat';
import { purgeExpiredVideos } from '../services/retention';
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
  useEffect(() => { purgeExpiredVideos(); }, []); // the org's video retention runs whenever a PD screen opens
  return [reports, setReports];
}

// A generated report (and a dropped call's draft) waits here until a BO or CO ticks "reviewed" on it; only then does it
// join the saved PDs above, so history, outcomes and repeat PDs never see an unconfirmed one. Drafts are read in place
// (repeat.js readDrafts) and removed on confirm, so a closed app loses nothing.
export function usePendingPds() {
  const [pending, setPending] = useLocalStorage('bo_sarthi_pending', []);
  const drafts = readDrafts().filter((d) => !pending.some((p) => p.id === d.id));
  return [[...pending, ...drafts], setPending];
}
