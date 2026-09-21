import { BrowserRouter, Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';
import { AppStateProvider } from './context/AppStateContext';
import { ToastProvider } from './components/common/Toast';
import BottomTabBar from './components/navigation/BottomTabBar';
import OfflineBanner from './components/navigation/OfflineBanner';
import PhoneFrame from './components/navigation/PhoneFrame';

// Auth
import LoginScreen from './screens/auth/LoginScreen';
import OTPScreen from './screens/auth/OTPScreen';
import PINScreen, { PINSetupScreen } from './screens/auth/PINScreen';
import OnboardingTutorial from './screens/onboarding/OnboardingTutorial';
// Tabs
import Dashboard from './screens/home/Dashboard';
import DSADirectory from './screens/dsa/DSADirectory';
import RoutePlanner from './screens/route/RoutePlanner';
import VisitHistory from './screens/visits/VisitHistory';
import MoreMenu from './screens/more/MoreMenu';
// Deeper screens
import DSADetail from './screens/dsa/DSADetail';
import DSAComparison from './screens/dsa/DSAComparison';
import AddDSA from './screens/dsa/AddDSA';
import RouteResult from './screens/route/RouteResult';
import PlanDay from './screens/route/PlanDay';
import CustomerPlan, { CustomerDetail } from './screens/route/CustomerPlan';
import BranchPlan from './screens/route/BranchPlan';
import AIHome, { AISession, AIReport } from './screens/ai/SMFGAI';
import VisitLogger from './screens/visits/VisitLogger';
import IncentiveTracker from './screens/incentive/IncentiveTracker';
import DocumentChecklist from './screens/documents/DocumentChecklist';
import LoanFileTracker from './screens/documents/LoanFileTracker';
import Leaderboard from './screens/leaderboard/Leaderboard';
import CalendarView from './screens/calendar/CalendarView';
import ReportGenerator from './screens/reports/ReportGenerator';
import MeetingScheduler from './screens/scheduler/MeetingScheduler';
import NotificationPanel from './screens/notifications/NotificationPanel';
import HelpFAQ from './screens/help/HelpFAQ';
import ProfileSettings from './screens/profile/ProfileSettings';
import MeetingRecorder, { RecordingDetail, RecordingsList, EngagementDetail } from './screens/recorder/MeetingRecorder';

/** Persistent tab bar — on every screen after login (hidden only during auth/onboarding). */
function PersistentTabBar() {
  const { pathname } = useLocation();
  const { isAuthed } = useAuth();
  // Also hidden in SMFG AI handover mode — the customer/DSA holding the phone must not wander into the officer's app.
  if (!isAuthed || pathname.startsWith('/login') || pathname === '/onboarding' || pathname === '/ai/session') return null;
  return <BottomTabBar />;
}

/**
 * Auth gate:
 *  - no session            → /login (OTP)
 *  - session + PIN, locked → /login/pin (quick login)
 *  - authed, not onboarded → /onboarding
 */
function RequireAuth() {
  const { isAuthed, session, hasPin, onboarded } = useAuth();
  const location = useLocation();
  if (!isAuthed) {
    if (session?.otpVerified && hasPin) return <Navigate to="/login/pin" replace />;
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (!onboarded && location.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />;
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

function AnimatedRoutes() {
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
          <Route path="/onboarding" element={<OnboardingTutorial />} />

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
          <Route path="/visits/new" element={<VisitLogger />} />
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

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OfflineProvider>
          <AppStateProvider>
            <BrowserRouter>
              <PhoneFrame>
                {/* ToastProvider sits inside the frame so toasts render within the phone screen */}
                <ToastProvider>
                  <div className="app-shell">
                    <OfflineBanner />
                    <AnimatedRoutes />
                    <PersistentTabBar />
                  </div>
                </ToastProvider>
              </PhoneFrame>
            </BrowserRouter>
          </AppStateProvider>
        </OfflineProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
