import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import BottomTabBar from '../components/layout/BottomTabBar';

/*
  Route table + auth guards. Add a screen here and it is reachable; the bottom tab bar
  lives in components/layout and maps paths to tabs.
*/

// Auth
import LoginScreen from '../screens/auth/LoginScreen';
import OTPScreen from '../screens/auth/OTPScreen';
import PINScreen, { PINSetupScreen } from '../screens/auth/PINScreen';
// Tabs
import Dashboard from '../screens/home/Dashboard';
import DSADirectory from '../screens/dsa/DSADirectory';
import RoutePlanner from '../screens/planning/RoutePlanner';
import VisitHistory from '../screens/visits/VisitHistory';
import MoreMenu from '../screens/more/MoreMenu';
// Deeper screens
import DSADetail from '../screens/dsa/DSADetail';
import DSAComparison from '../screens/dsa/DSAComparison';
import AddDSA from '../screens/dsa/AddDSA';
import RouteResult from '../screens/planning/RouteResult';
import PlanDay from '../screens/planning/PlanDay';
import CustomerPlan, { CustomerDetail } from '../screens/planning/CustomerPlan';
import BranchPlan from '../screens/planning/BranchPlan';
import AIHome, { AISession, AIReport } from '../screens/ai/SMFGAI';
import VisitLogger from '../screens/visits/VisitLogger';
import IncentiveTracker from '../screens/incentive/IncentiveTracker';
import DocumentChecklist from '../screens/documents/DocumentChecklist';
import LoanFileTracker from '../screens/documents/LoanFileTracker';
import Leaderboard from '../screens/leaderboard/Leaderboard';
import CalendarView from '../screens/calendar/CalendarView';
import ReportGenerator from '../screens/reports/ReportGenerator';
import MeetingScheduler from '../screens/scheduler/MeetingScheduler';
import NotificationPanel from '../screens/notifications/NotificationPanel';
import HelpFAQ from '../screens/help/HelpFAQ';
import ProfileSettings from '../screens/profile/ProfileSettings';
import Prompter from '../screens/prompter/Prompter';
import MeetingRecorder, { RecordingDetail, RecordingsList, EngagementDetail } from '../screens/recorder/MeetingRecorder';
import { SarthiHome, SarthiNewCase, SarthiBrief, SarthiInterview, SarthiReport } from '../screens/sarthi';

/** Persistent tab bar — on every screen after login (hidden only during auth). */
export function PersistentTabBar() {
  const { pathname } = useLocation();
  const { isAuthed } = useAuth();
  // Also hidden in SAARTHI AI handover mode and in a Sarthi AI interview (the customer/DSA holding
  // the phone must not wander into the officer's app), and in the teleprompter, a full-screen stage.
  if (!isAuthed || pathname.startsWith('/login') || pathname === '/ai/session' || pathname === '/prompter' || pathname.startsWith('/sarthi/interview')) return null;
  return <BottomTabBar />;
}

/**
 * Auth gate:
 *  - no session            → /login (OTP)
 *  - session + PIN, locked → /login/pin (quick login)
 */
function RequireAuth() {
  const { isAuthed, session, hasPin } = useAuth();
  const location = useLocation();
  if (!isAuthed) {
    if (session?.otpVerified && hasPin) return <Navigate to="/login/pin" replace />;
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

/** Keeps signed-in users out of the login screens. */
function GuestOnly() {
  const { isAuthed } = useAuth();
  if (isAuthed) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** /login entry: returning users with a PIN go straight to the PIN pad. */
function LoginEntry() {
  const { session, hasPin } = useAuth();
  if (session?.otpVerified && hasPin) return <Navigate to="/login/pin" replace />;
  return <LoginScreen />;
}

export function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<LoginEntry />} />
          <Route path="/login/otp" element={<OTPScreen />} />
          <Route path="/login/pin" element={<PINScreen />} />
        </Route>
        {/* PIN setup happens after role select, before the app is usable → allowed while authed */}
        <Route path="/login/pin-setup" element={<PINSetupScreen />} />

        <Route element={<RequireAuth />}>

          <Route path="/" element={<Dashboard />} />
          <Route path="/dsas" element={<DSADirectory />} />
          <Route path="/route" element={<RoutePlanner />} />
          <Route path="/activity" element={<VisitHistory />} />
          <Route path="/more" element={<MoreMenu />} />

          <Route path="/dsas/compare" element={<DSAComparison />} />
          <Route path="/dsas/new" element={<AddDSA />} />
          <Route path="/dsas/:id" element={<DSADetail />} />
          <Route path="/route/result" element={<RouteResult />} />
          <Route path="/plan" element={<PlanDay />} />
          <Route path="/plan/customers" element={<CustomerPlan />} />
          <Route path="/plan/branch" element={<BranchPlan />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/ai" element={<AIHome />} />
          <Route path="/ai/session" element={<AISession />} />
          <Route path="/ai/reports/:id" element={<AIReport />} />
          <Route path="/sarthi" element={<SarthiHome />} />
          <Route path="/sarthi/new" element={<SarthiNewCase />} />
          <Route path="/sarthi/brief/:id" element={<SarthiBrief />} />
          <Route path="/sarthi/interview/:id" element={<SarthiInterview />} />
          <Route path="/sarthi/report/:id" element={<SarthiReport />} />
          <Route path="/visits/new" element={<VisitLogger />} />
          <Route path="/prompter" element={<Prompter />} />
          <Route path="/record" element={<MeetingRecorder />} />
          <Route path="/recordings" element={<RecordingsList />} />
          <Route path="/recordings/:id" element={<RecordingDetail />} />
          <Route path="/engagements/:id" element={<EngagementDetail />} />
          <Route path="/incentive" element={<IncentiveTracker />} />
          <Route path="/documents" element={<DocumentChecklist />} />
          <Route path="/files" element={<LoanFileTracker />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/calendar" element={<CalendarView />} />
          <Route path="/reports" element={<ReportGenerator />} />
          <Route path="/scheduler" element={<MeetingScheduler />} />
          <Route path="/notifications" element={<NotificationPanel />} />
          <Route path="/help" element={<HelpFAQ />} />
          <Route path="/profile" element={<ProfileSettings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}
