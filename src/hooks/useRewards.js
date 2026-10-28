import { useCallback, useMemo } from 'react';
import { useAppState } from '../context/AppStateContext';
import { useLocalStorage } from './useLocalStorage';
import { toISODate } from '../utils/formatters';
import { BASE_POINTS, CATALOGUE, disbursalMissions, streakDays, tierOf, wallet, qualityBadges, pace } from '../utils/rewards';
import { incentiveRoadmap, incentiveFor, PLAN } from '../utils/incentive';

/**
 * Incentive state shared by the arena, plan, what-to-do, statement and store screens.
 * Rupees come only from the month's disbursement (utils/incentive.js), so progress is read from the
 * loan files, never typed in. The level is the slab reached; the personal target is optional — without one, the goal
 * is the next slab. Missions pay points once — `claimed` = { [missionId]: pts }; points never turn into rupees.
 */
export function useRewards() {
  const { visits, loanFiles } = useAppState();
  const [r, setR] = useLocalStorage('bo_rewards', { target: null, seenTier: 0, redeemed: [], claimed: {}, queries: [] });
  const today = toISODate();

  const target = r.target;
  const base = useMemo(() => incentiveRoadmap(0, loanFiles, today), [loanFiles, today]);
  // No target → aim at the next slab (or, above the top slab, what is already earned).
  const goal = target || (base.nextSlab ? incentiveFor(base.nextSlab.from) : base.earned);
  const roadmap = useMemo(() => incentiveRoadmap(goal, loanFiles, today), [goal, loanFiles, today]);
  const missions = useMemo(() => disbursalMissions(roadmap, loanFiles, today, visits), [roadmap, loanFiles, today, visits]);
  // An older bo_rewards stored `claimed` by date; only the { id: pts } shape counts.
  const claimed = useMemo(() => Object.fromEntries(Object.entries(r.claimed ?? {}).filter(([, v]) => typeof v === 'number')), [r.claimed]);
  const points = BASE_POINTS + Object.values(claimed).reduce((s, v) => s + v, 0) - r.redeemed.reduce((s, x) => s + x.pts, 0);
  const { earned } = roadmap;
  const tier = tierOf(roadmap.done);
  const visitDays = useMemo(() => new Set(visits.filter((v) => v.status === 'completed').map((v) => v.date)), [visits]);
  const streak = streakDays(visitDays, today);
  const purse = useMemo(() => wallet(roadmap, loanFiles, today), [roadmap, loanFiles, today]);
  const badges = qualityBadges(purse, streak);

  const setTarget = useCallback((t) => setR((x) => ({ ...x, target: t })), [setR]);
  const claimFinished = useCallback(() => {
    const fresh = missions.filter((m) => m.complete && !(m.id in claimed));
    if (fresh.length) setR((x) => ({ ...x, claimed: { ...claimed, ...Object.fromEntries(fresh.map((m) => [m.id, m.pts])) } }));
    return fresh;
  }, [missions, claimed, setR]);
  const markTierSeen = useCallback(() => setR((x) => ({ ...x, seenTier: tier.n })), [setR, tier.n]);
  const redeem = useCallback((item) => {
    const code = `${item.id.slice(0, 3).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const rec = { id: item.id, name: item.name, pts: item.pts, img: item.img, at: new Date().toISOString(), code };
    setR((x) => ({ ...x, redeemed: [rec, ...x.redeemed] }));
    return rec;
  }, [setR]);
  // A payout question goes to whoever owns payouts; kept with the month so the answer has its context.
  const raiseQuery = useCallback((text, fileId = null) => setR((x) => ({ ...x, queries: [{ id: crypto.randomUUID(), text, fileId, month: today.slice(0, 7), at: new Date().toISOString(), status: 'open' }, ...(x.queries ?? [])] })), [setR, today]);

  return {
    target, goal, earned, roadmap, missions, claimed, points, tier, purse, badges, pace: pace(roadmap.done, today),
    redeemed: r.redeemed, catalogue: CATALOGUE, queries: r.queries ?? [], slabs: PLAN.slabs,
    streak, visitDays, newTier: tier.n > (r.seenTier ?? 0),
    setTarget, claimFinished, markTierSeen, redeem, raiseQuery,
  };
}
