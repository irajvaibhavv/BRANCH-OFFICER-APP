import { createContext, useContext, useCallback, useMemo, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useOffline } from './OfflineContext';
import dsasSeed from '../data/mock/dsas.json';
import visitsSeed from '../data/mock/visits.json';
import marketingSeed from '../data/mock/marketing.json';
import payoutsSeed from '../data/mock/payouts.json';
import teamSeed from '../data/mock/team.json';
import { AREA_COORDS } from '../utils/areas';
import { START, km } from '../utils/routePlanning';
import loanFilesSeed from '../data/mock/loanFiles.json';
import notificationsSeed from '../data/mock/notifications.json';
import engagementsSeed from '../data/mock/engagements.json';
import customersRaw from '../data/mock/customers.json';
import { toISODate } from '../utils/formatters';
import { buildTranscript, buildSummary } from '../services/meeting/transcript';

// Seed JSON is dated around SEED_TODAY and shifted so that day becomes today. Re-seeds daily.
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
const seedDsas = dsasSeed.map((d) => ({ ...d, lastVisit: shiftDate(d.lastVisit), empanelled: shiftDate(d.empanelled), npa: d.npa?.map((n) => ({ ...n, npaSince: shiftDate(n.npaSince) })) }));
const seedFiles = loanFilesSeed.map((f) => ({ ...f, updatedAt: shiftDate(f.updatedAt), timeline: f.timeline.map(([d, s]) => [shiftDate(d), s]), opsReceived: f.opsReceived && Object.fromEntries(Object.entries(f.opsReceived).map(([k, d]) => [k, shiftDate(d)])), payoutPaid: f.payoutPaid && { ...f.payoutPaid, on: shiftDate(f.payoutPaid.on) } }));
const seedPayouts = payoutsSeed.map((p) => ({ ...p, disbursedOn: shiftDate(p.disbursedOn), paidOn: shiftDate(p.paidOn) })); // paid history, read-only
const seedMarketing = marketingSeed.map((m) => ({ ...m, date: shiftDate(m.date) }));
const seedNotifs = notificationsSeed.map((n) => ({ ...n, at: shiftDate(n.at) }));
// Meetings anyone from the company (BO, Branch Head, Regional Head, CEO…) has had with each
// DSA — read-only reference data
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

// The prototype's "database": seeded slices persisted in localStorage.
const AppStateContext = createContext(null);

const DAILY_TARGET = 5; // fallback for days without a plan (calendar history, before planning)
const VISIT_MINS = 45; // a stop's slot when the day is re-timed around a stop added mid-route

export function AppStateProvider({ children }) {
  const { isOnline, enqueue } = useOffline();

  const [dsas, setDsas] = useLocalStorage('bo_dsas', seedDsas);
  const [visits, setVisits] = useLocalStorage('bo_visits', seedVisits);
  const [loanFiles, setLoanFiles] = useLocalStorage('bo_loanfiles', seedFiles);
  const [notifications, setNotifications] = useLocalStorage('bo_notifications', seedNotifs);
  const [meetings, setMeetings] = useLocalStorage('bo_meetings', seedMeetings);
  const [recordings, setRecordings] = useLocalStorage('bo_recordings', seedRecordings);
  const [seedDay, setSeedDay] = useLocalStorage('bo_seed_day', null);
  const [marketing, setMarketing] = useLocalStorage('bo_marketing', seedMarketing);
  const [dayPlan, setDayPlan] = useLocalStorage('bo_day_plan', null); // { date, mode:'dsa'|'customer'|'branch', criteria, stops:[id] }

  const resetDemo = useCallback(() => {
    setDsas(seedDsas);
    setVisits(seedVisits);
    setLoanFiles(seedFiles);
    setNotifications(seedNotifs);
    setMeetings(seedMeetings);
    setRecordings(seedRecordings);
    setMarketing(seedMarketing);
    setDayPlan(null);
  }, [setMarketing, setDayPlan, setDsas, setVisits, setLoanFiles, setNotifications, setMeetings, setRecordings]);

  // Re-seed when the calendar day changes so "today" always has demo data.
  useEffect(() => {
    const stamp = `${toISODate()}:14`; // bump the suffix whenever the seed shape changes
    if (seedDay !== stamp) {
      resetDemo(); // also migrates stale, hard-dated data
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
      if (!d && String(id ?? '').startsWith('mk')) {
        // A marketing activity planned as a stop: shaped like a DSA, pinned to its area's centre.
        const m = marketing.find((x) => x.id === id);
        if (!m) return undefined;
        const [lat, lng] = AREA_COORDS[m.area] ?? [START.lat, START.lng];
        return { ...m, name: m.title, firm: 'Marketing activity', location: [m.spot, m.area].filter(Boolean).join(', '), lat, lng, distanceKm: +km(START, { lat, lng }).toFixed(1), quality: 'average', rating: 3, isMarketing: true };
      }
      if (d || !String(id ?? '').startsWith('cust')) return d;
      const c = getCustomer(id);
      return c ? { ...c, firm: c.kind === 'existing' ? 'Existing customer' : c.kind === 'lead' ? 'Lead' : 'New customer', quality: 'average', isCustomer: true } : undefined;
    },
    [dsas, marketing, getCustomer],
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
        stage: 'lead', // added by the BO, not yet empanelled — see partnerStage()
        ...dsa,
      };
      setDsas((d) => [rec, ...d]);
      track('ADD_DSA', rec);
      return rec;
    },
    [setDsas, track],
  );

  const rateDsa = useCallback((id, rating) => setDsas((d) => d.map((x) => (x.id === id ? { ...x, rating } : x))), [setDsas]);

  /** Marketing activities: add a new one, or patch an existing one by id. */
  const saveMarketing = useCallback((m) => {
    const rec = m.id ? m : { ...m, id: `mk${Date.now()}`, status: 'planned' };
    setMarketing((all) => (m.id ? all.map((x) => (x.id === m.id ? { ...x, ...m } : x)) : [...all, rec]));
    track(m.id ? 'UPDATE_MARKETING' : 'ADD_MARKETING', rec);
    return rec;
  }, [setMarketing, track]);
  const removeMarketing = useCallback((id) => setMarketing((all) => all.filter((x) => x.id !== id)), [setMarketing]);

  // Logging a visit closes that stop if it was lined up today; otherwise it is a new visit "on the go".
  const addVisit = useCallback(
    (visit) => {
      const date = toISODate();
      const stop = visits.find((x) => x.date === date && x.dsaId === visit.dsaId && x.status === 'upcoming');
      const rec = stop
        ? { ...stop, ...visit, status: 'completed', plannedTime: stop.time }
        : { id: `v${Date.now()}`, date, status: 'completed', onTheGo: true, ...visit };
      setVisits((v) => (stop ? v.map((x) => (x.id === stop.id ? rec : x)) : [rec, ...v]));
      setDsas((d) => d.map((x) => (x.id === visit.dsaId ? { ...x, lastVisit: rec.date } : x)));
      track('LOG_VISIT', rec);
      return rec;
    },
    [visits, setVisits, setDsas, track],
  );

  /** Plan on the go: line up one more stop today — right after the current one (`next`) or at the end of the day. */
  // `location` is passed for a record created this instant (a new DSA added mid-route), which getDsa cannot see yet.
  const addStopNow = useCallback((dsaId, { next = false, urgent = false, location } = {}) => {
    const date = toISODate();
    const now = new Date();
    const upcoming = visits.filter((v) => v.date === date && v.status === 'upcoming').sort((a, b) => a.time.localeCompare(b.time));
    const slot = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const at = (n) => { const d = new Date(now); d.setHours(0, n, 0, 0); return slot(d); };
    let time;
    if (next || !upcoming.length) { const d = new Date(now.getTime() + 20 * 60000); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5); time = slot(d); }
    else { const [h, m] = upcoming.at(-1).time.split(':').map(Number); const d = new Date(now); d.setHours(h, m + 45, 0, 0); time = slot(d); }
    const d = getDsa(dsaId);
    const type = String(dsaId).startsWith('mk') ? 'Marketing Activity' : String(dsaId).startsWith('cust') ? 'Customer Meeting' : 'Scheduled Visit';
    const rec = { id: `og${now.getTime()}`, dsaId, date, time: String(dsaId).startsWith('mk') ? d?.start ?? time : time, status: 'upcoming', type, location: location ?? d?.location, planned: true, onTheGo: true, ...(urgent && { urgent: true }) };
    // A stop slipped in first pushes the rest of the day back, a visit's length at a time, until a gap absorbs it —
    // otherwise it overlaps the next appointment. Marketing activities keep their fixed hours.
    const shifted = {};
    if (next) {
      let cursor = mins(rec.time) + VISIT_MINS;
      for (const v of upcoming) {
        if (String(v.dsaId).startsWith('mk')) continue;
        if (mins(v.time) >= cursor) break;
        shifted[v.id] = at(cursor);
        cursor += VISIT_MINS;
      }
    }
    setVisits((v) => [...v.map((x) => (shifted[x.id] ? { ...x, time: shifted[x.id], shiftedFrom: x.time } : x)), rec]);
    setDayPlan((p) => (p?.date === date ? { ...p, stops: [...p.stops, dsaId] } : { date, mode: 'dsa', criteria: [], stops: [dsaId] }));
    track('ADD_STOP', { dsaId, next, urgent });
    return { ...rec, shifted: Object.keys(shifted).length };
  }, [visits, getDsa, setVisits, setDayPlan, track]);

  /** Drop a stop from today (with a reason), or push it to tomorrow at the same time. */
  const skipStop = useCallback((id, reason) => setVisits((v) => v.map((x) => (x.id === id ? { ...x, status: 'skipped', skipReason: reason } : x))), [setVisits]);
  const moveStopToTomorrow = useCallback((id) => {
    const t = new Date(); t.setDate(t.getDate() + 1);
    setVisits((v) => v.map((x) => (x.id === id ? { ...x, date: toISODate(t), movedFrom: x.date } : x)));
  }, [setVisits]);

  /** Meeting recording → transcript + AI summary (generated locally). */
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
        ...stops.map((s, i) => ({ id: `plan${Date.now()}${i}`, dsaId: s.dsaId, date: today, time: s.time, status: 'upcoming', type: String(s.dsaId).startsWith('mk') ? 'Marketing Activity' : mode === 'customer' || String(s.dsaId).startsWith('cust') ? 'Customer Meeting' : 'Scheduled Visit', location: s.location, planned: true })),
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
  const lined = todayVisits.filter((v) => v.status !== 'skipped').length; // a skipped stop no longer counts
  const dailyTarget = dayPlan?.date === today && lined > 0 ? lined : DAILY_TARGET;

  const stats = useMemo(() => {
    const disbursedTotal = loanFiles.filter((f) => f.status === 'disbursed').reduce((s, f) => s + f.amount, 0);
    return {
      filesSubmitted: loanFiles.length,
      disbursed: disbursedTotal,
      quarterDisbursed: 15500000, // ₹1.55Cr, 45K short of Silver
      dailyTarget,
      todayDone,
    };
  }, [loanFiles, todayDone, dailyTarget]);

  const value = {
    dsas, getDsa, addDsa, rateDsa,
    marketing, saveMarketing, removeMarketing, team: teamSeed, payoutHistory: seedPayouts,
    visits, todayVisits, addVisit, addStopNow, skipStop, moveStopToTomorrow,
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
