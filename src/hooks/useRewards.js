import { useCallback, useMemo } from 'react';
import { useAppState } from '../context/AppStateContext';
import { useLocalStorage } from './useLocalStorage';
import { toISODate } from '../utils/formatters';
import { BASE_POINTS, CATALOGUE, crossedCount, disbursalMissions, levelOf, milestones, streakDays } from '../utils/rewards';
import { incentiveRoadmap } from '../utils/incentive';

/**
 * Incentive journey state shared by the target, path, what-to-do and store screens.
 * Rupees come only from the month's disbursement (utils/incentive.js — the lead's rule), so progress is read from the
 * loan files, never typed in. Missions are steps to disbursement (utils/rewards.js); each pays its points once —
 * `claimed` = { [missionId]: pts }.
 */
export function useRewards() {
  const { visits, loanFiles } = useAppState();
  const [r, setR] = useLocalStorage('bo_rewards', { target: null, seenLevel: 1, redeemed: [], claimed: {} });
  const today = toISODate();

  const target = r.target;
  const roadmap = useMemo(() => incentiveRoadmap(target ?? 0, loanFiles, today), [target, loanFiles, today]);
  const missions = useMemo(() => disbursalMissions(roadmap, loanFiles, today), [roadmap, loanFiles, today]);
  // An older bo_rewards stored `claimed` by date; only the { id: pts } shape counts.
  const claimed = useMemo(() => Object.fromEntries(Object.entries(r.claimed ?? {}).filter(([, v]) => typeof v === 'number')), [r.claimed]);
  const points = BASE_POINTS + Object.values(claimed).reduce((s, v) => s + v, 0) - r.redeemed.reduce((s, x) => s + x.pts, 0);
  const { earned } = roadmap;
  const level = target ? levelOf(earned, target) : { n: 1, name: 'Rookie' };
  const visitDays = useMemo(() => new Set(visits.filter((v) => v.status === 'completed').map((v) => v.date)), [visits]);

  // Choosing a target resets what has been "seen", so only milestones crossed from now on celebrate.
  const setTarget = useCallback((t) => setR((x) => ({ ...x, target: t, seenLevel: crossedCount(earned, t) + 1 })), [setR, earned]);
  const claimFinished = useCallback(() => {
    const fresh = missions.filter((m) => m.complete && !(m.id in claimed));
    if (fresh.length) setR((x) => ({ ...x, claimed: { ...claimed, ...Object.fromEntries(fresh.map((m) => [m.id, m.pts])) } }));
    return fresh;
  }, [missions, claimed, setR]);
  const markLevelSeen = useCallback(() => setR((x) => ({ ...x, seenLevel: level.n })), [setR, level.n]);
  const redeem = useCallback((item) => {
    const code = `${item.id.slice(0, 3).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const rec = { id: item.id, name: item.name, pts: item.pts, img: item.img, at: new Date().toISOString(), code };
    setR((x) => ({ ...x, redeemed: [rec, ...x.redeemed] }));
    return rec;
  }, [setR]);

  return {
    target, earned, roadmap, missions, claimed, points, level, redeemed: r.redeemed, catalogue: CATALOGUE,
    milestones: target ? milestones(target) : [],
    streak: streakDays(visitDays, today), visitDays, newLevel: target && level.n > r.seenLevel,
    setTarget, claimFinished, markLevelSeen, redeem,
  };
}
