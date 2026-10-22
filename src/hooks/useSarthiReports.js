import { useLocalStorage } from './useLocalStorage';
import pdHistory from '../data/sarthi/pdHistory.json';

// Seeded PD history (Mahesh Agarwal, three PDs), dated back from today so the trail always looks recent.
const at = (daysAgo, minutesBefore = 0) => new Date(Date.now() - daysAgo * 86400000 - minutesBefore * 60000).toISOString();
const SEED = pdHistory.map(({ daysAgo, minutes, ...r }) => ({
  ...r,
  startedAt: at(daysAgo, minutes + 1),
  endedAt: at(daysAgo, 1),
  createdAt: at(daysAgo),
}));

export const useSarthiReports = () => useLocalStorage('bo_sarthi_reports', SEED);
