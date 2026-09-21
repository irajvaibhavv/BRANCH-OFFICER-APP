import { createContext, useContext, useCallback, useMemo, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useOffline } from './OfflineContext';
import dsasSeed from '../data/mock/dsas.json';
import visitsSeed from '../data/mock/visits.json';
import loanFilesSeed from '../data/mock/loanFiles.json';
import notificationsSeed from '../data/mock/notifications.json';
import engagementsSeed from '../data/mock/engagements.json';
import customersRaw from '../data/mock/customers.json';
import { toISODate } from '../utils/formatters';
import { buildTranscript, buildSummary } from '../utils/meetingAI';

/*
  The dummy JSON is written around SEED_TODAY. On load we shift every date so that day
  becomes the real today — so "Today's schedule", the calendar and reports always have data.
  Demo data re-seeds automatically when the calendar day changes (user-added records are
  kept only within the same day — fine for a POC; a backend would own this in production).
*/
const SEED_TODAY = new Date('2026-09-17');
const dayDelta = Math.round((new Date(toISODate()) - SEED_TODAY) / 86400000);
const shiftDate = (iso) => {
  if (!iso) return iso;
  const [d, rest] = iso.split('T');
  const x = new Date(d);
  x.setDate(x.getDate() + dayDelta);
  return toISODate(x) + (rest ? `T${rest}` : '');
};
// Today starts empty: the officer plans it themselves. Seeded visits written for "today" become
// yesterday's completed history; the pre-planned "upcoming" ones are dropped.
const SEED_ISO = toISODate(SEED_TODAY);
const seedVisits = visitsSeed
  .filter((v) => !(v.date === SEED_ISO && v.status === 'upcoming'))
  .map((v) => {
    if (v.date !== SEED_ISO) return { ...v, date: shiftDate(v.date) };
    const y = new Date(SEED_TODAY); y.setDate(y.getDate() - 1);
    return { ...v, date: shiftDate(toISODate(y)) };
  });
const seedDsas = dsasSeed.map((d) => ({ ...d, lastVisit: shiftDate(d.lastVisit) }));
const seedFiles = loanFilesSeed.map((f) => ({ ...f, updatedAt: shiftDate(f.updatedAt), timeline: f.timeline.map(([d, s]) => [shiftDate(d), s]) }));
const seedNotifs = notificationsSeed.map((n) => ({ ...n, at: shiftDate(n.at) }));
// Meetings anyone from the company (BO, Branch Head, Regional Head, CEO…) has had with each DSA — read-only reference data
const engagements = engagementsSeed.map((m) => ({ ...m, date: shiftDate(m.date) }));
const seedMeetings = [
  { id: 'm1', dsaId: 'dsa3', date: '2026-09-17', time: '15:00', agenda: 'Review Sai Enterprises LAP file', priority: 'Important' },
  { id: 'm2', dsaId: 'dsa6', date: '2026-09-17', time: '17:00', agenda: 'Q4 volume planning', priority: 'Normal' },
  { id: 'm3', dsaId: 'dsa2', date: '2026-09-19', time: '11:00', agenda: 'Retention discussion - competitor offers', priority: 'Urgent' },
  { id: 'm4', dsaId: 'dsa1', date: '2026-09-22', time: '10:30', agenda: 'Gold slab celebration + new targets', priority: 'Normal' },
].map((m) => ({ ...m, date: shiftDate(m.date) }));

// One past meeting recording so the DSA page / recordings list have demo content on first open.
const seedRecordings = (() => {
  const dsa = seedDsas.find((d) => d.id === 'dsa1');
  const { lines, facts } = buildTranscript(dsa);
  const duration = 14 * 60 + 32;
  return [{
    id: 'rec1', dsaId: 'dsa1', date: shiftDate('2026-09-15'), time: '10:30', durationSecs: duration, visitId: 'v9',
    transcript: lines.map((l, i) => ({ ...l, t: Math.floor((duration * i) / lines.length) })),
    summary: buildSummary(dsa, facts),
  }];
})();

/*
  APP STATE — the prototype's in-memory "database", seeded from the dummy JSON files
  and persisted in localStorage so demo actions (log visit, add DSA, etc.) survive reloads.
  In production each slice maps to an API resource + IndexedDB cache.
*/
const AppStateContext = createContext(null);

const DAILY_TARGET = 5; // fallback for days without a plan (calendar history, before planning)

export function AppStateProvider({ children }) {
  const { isOnline, enqueue } = useOffline();

  const [dsas, setDsas] = useLocalStorage('bo_dsas', seedDsas);
  const [visits, setVisits] = useLocalStorage('bo_visits', seedVisits);
  const [loanFiles, setLoanFiles] = useLocalStorage('bo_loanfiles', seedFiles);
  const [notifications, setNotifications] = useLocalStorage('bo_notifications', seedNotifs);
  const [meetings, setMeetings] = useLocalStorage('bo_meetings', seedMeetings);
  const [recordings, setRecordings] = useLocalStorage('bo_recordings', seedRecordings);
  const [seedDay, setSeedDay] = useLocalStorage('bo_seed_day', null);
  const [dayPlan, setDayPlan] = useLocalStorage('bo_day_plan', null); // { date, mode:'dsa'|'customer'|'branch', criteria, stops:[id] }

  const resetDemo = useCallback(() => {
    setDsas(seedDsas);
    setVisits(seedVisits);
    setLoanFiles(seedFiles);
    setNotifications(seedNotifs);
    setMeetings(seedMeetings);
    setRecordings(seedRecordings);
    setDayPlan(null);
  }, [setDayPlan, setDsas, setVisits, setLoanFiles, setNotifications, setMeetings, setRecordings]);

  // Re-seed when the calendar day changes so "today" always has demo data.
  useEffect(() => {
    const stamp = `${toISODate()}:2`; // bump the suffix whenever the seed shape changes
    if (seedDay !== stamp) {
      resetDemo(); // also migrates any stale, hard-dated data from before this change
      setSeedDay(stamp);
    }
  }, [seedDay, setSeedDay, resetDemo]);

  // Wrap mutations: when offline, also push onto the sync queue so the banner can show it.
  const track = useCallback(
    (type, payload) => {
      if (!isOnline) enqueue({ type, payload });
    },
    [isOnline, enqueue],
  );

  // Customers (new / lead / existing borrowers) the officer can plan visits to. Static demo data.
  const customers = customersRaw;
  const getCustomer = useCallback((id) => customers.find((c) => c.id === id), [customers]);
  // A planned stop can be a DSA or a customer. Customer ids start with "cust"; getDsa resolves them too
  // (shaped like a DSA: name / firm / location / distanceKm) so schedule, route and visit screens need no branching.
  const getDsa = useCallback(
    (id) => {
      const d = dsas.find((x) => x.id === id);
      if (d || !String(id ?? '').startsWith('cust')) return d;
      const c = getCustomer(id);
      return c ? { ...c, firm: c.kind === 'existing' ? 'Existing customer' : c.kind === 'lead' ? 'Lead' : 'New customer', quality: 'average', isCustomer: true } : undefined;
    },
    [dsas, getCustomer],
  );

  const addDsa = useCallback(
    (dsa) => {
      const rec = {
        id: `dsa${Date.now()}`,
        quality: 'average',
        filesSubmitted: 0,
        approvalRate: 0,
        disbursed: 0,
        rating: 3,
        distanceKm: 5,
        monthly: [0, 0, 0, 0, 0, 0],
        lastVisit: null,
        ...dsa,
      };
      setDsas((d) => [rec, ...d]);
      track('ADD_DSA', rec);
      return rec;
    },
    [setDsas, track],
  );

  const rateDsa = useCallback((id, rating) => setDsas((d) => d.map((x) => (x.id === id ? { ...x, rating } : x))), [setDsas]);

  const addVisit = useCallback(
    (visit) => {
      const rec = { id: `v${Date.now()}`, date: toISODate(), status: 'completed', ...visit };
      setVisits((v) => [rec, ...v]);
      setDsas((d) => d.map((x) => (x.id === visit.dsaId ? { ...x, lastVisit: rec.date } : x)));
      track('LOG_VISIT', rec);
      return rec;
    },
    [setVisits, setDsas, track],
  );

  /** Meeting recording → transcript + AI summary (generated locally for the POC). */
  const addRecording = useCallback(
    (r) => {
      const rec = { id: `rec${Date.now()}`, date: toISODate(), time: new Date().toTimeString().slice(0, 5), ...r };
      setRecordings((rs) => [rec, ...rs]);
      track('ADD_RECORDING', { id: rec.id, dsaId: rec.dsaId });
      return rec;
    },
    [setRecordings, track],
  );
  const getRecording = useCallback((id) => recordings.find((r) => r.id === id), [recordings]);
  const linkRecordingToVisit = useCallback(
    (recordingId, visitId) => setRecordings((rs) => rs.map((r) => (r.id === recordingId ? { ...r, visitId } : r))),
    [setRecordings],
  );

  /** "Plan my day": replace today's not-yet-done visits with the chosen stops (completed ones stay). */
  const planDay = useCallback(
    (stops, criteria, mode = 'dsa') => {
      const today = toISODate();
      setVisits((v) => [
        ...v.filter((x) => !(x.date === today && x.status === 'upcoming')),
        ...stops.map((s, i) => ({ id: `plan${Date.now()}${i}`, dsaId: s.dsaId, date: today, time: s.time, status: 'upcoming', type: mode === 'customer' || String(s.dsaId).startsWith('cust') ? 'Customer Meeting' : 'Scheduled Visit', location: s.location, planned: true })),
      ]);
      setDayPlan({ date: today, mode, criteria, stops: stops.map((s) => s.dsaId) });
      track('PLAN_DAY', { mode, criteria, stops: stops.length });
    },
    [setVisits, setDayPlan, track],
  );

  const addMeeting = useCallback(
    (m) => {
      const rec = { id: `m${Date.now()}`, ...m };
      setMeetings((ms) => [...ms, rec]);
      setVisits((v) => [...v, { id: `sv${Date.now()}`, dsaId: m.dsaId, date: m.date, time: m.time, status: 'upcoming', type: 'Scheduled Visit', meetingId: rec.id }]);
      track('ADD_MEETING', rec);
      return rec;
    },
    [setMeetings, setVisits, track],
  );

  const updateMeeting = useCallback(
    (id, patch) => {
      setMeetings((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
      setVisits((v) => v.map((x) => (x.meetingId === id ? { ...x, ...patch } : x)));
    },
    [setMeetings, setVisits],
  );

  const cancelMeeting = useCallback(
    (id) => {
      setMeetings((ms) => ms.filter((m) => m.id !== id));
      setVisits((v) => v.filter((x) => x.meetingId !== id));
    },
    [setMeetings, setVisits],
  );

  const markRead = useCallback((id) => setNotifications((n) => n.map((x) => (x.id === id ? { ...x, read: true } : x))), [setNotifications]);
  const markAllRead = useCallback(() => setNotifications((n) => n.map((x) => ({ ...x, read: true }))), [setNotifications]);

  // Derived numbers used on the dashboard
  const today = toISODate();
  const todayVisits = useMemo(() => visits.filter((v) => v.date === today).sort((a, b) => a.time.localeCompare(b.time)), [visits, today]);
  const todayDone = todayVisits.filter((v) => v.status === 'completed').length;
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Needs attention — live action items (not dismissable; they clear when the underlying work is done).
  // Shown at the top of Notifications and counted in the bell badge.
  const attention = useMemo(() => {
    const pendingDocs = loanFiles.reduce((n, f) => n + f.docs.filter(([, s]) => s !== 'done').length, 0);
    const filesNeedingDocs = loanFiles.filter((f) => f.docs.some(([, s]) => s !== 'done')).length;
    const quietDsa = dsas.find((d) => d.quality === 'low' && d.lastVisit && (Date.now() - new Date(d.lastVisit)) / 86400000 > 14);
    return [
      pendingDocs > 0 && { key: 'docs', text: `${pendingDocs} documents pending across ${filesNeedingDocs} files`, to: '/documents' },
      quietDsa && { key: 'quiet', text: `${quietDsa.name} hasn't submitted in ${Math.floor((Date.now() - new Date(quietDsa.lastVisit)) / 86400000)} days`, to: `/dsas/${quietDsa.id}` },
    ].filter(Boolean);
  }, [loanFiles, dsas]);

  // Today's target = what the officer planned (plus any visits added since), not a fixed number.
  const dailyTarget = dayPlan?.date === today && todayVisits.length > 0 ? todayVisits.length : DAILY_TARGET;

  const stats = useMemo(() => {
    const disbursedTotal = loanFiles.filter((f) => f.status === 'disbursed').reduce((s, f) => s + f.amount, 0);
    return {
      filesSubmitted: loanFiles.length,
      disbursed: disbursedTotal,
      incentiveEarned: 8500,
      quarterDisbursed: 15500000, // ₹1.55Cr — 45K short of Silver in incentive terms
      dailyTarget,
      todayDone,
    };
  }, [loanFiles, todayDone, dailyTarget]);

  const value = {
    dsas, getDsa, addDsa, rateDsa,
    visits, todayVisits, addVisit,
    loanFiles, setLoanFiles,
    meetings, addMeeting, updateMeeting, cancelMeeting,
    recordings, addRecording, getRecording, linkRecordingToVisit,
    engagements,
    dayPlan, planDay,
    customers, getCustomer,
    notifications, unreadCount, markRead, markAllRead, attention,
    stats, resetDemo,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export const useAppState = () => useContext(AppStateContext);
