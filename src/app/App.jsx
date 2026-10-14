import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../context/AuthContext';
import { OfflineProvider } from '../context/OfflineContext';
import { AppStateProvider } from '../context/AppStateContext';
import { ToastProvider } from '../components/ui/Toast';
import OfflineBanner from '../components/layout/OfflineBanner';
import PhoneFrame from '../components/layout/PhoneFrame';
import { AnimatedRoutes, PersistentTabBar } from './router';

// Opened as a file (npm run build:file), there is no server to rewrite paths — routes live in the hash.
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

/** App root: global providers → phone frame → routed screens. Routes live in ./router.jsx. */
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OfflineProvider>
          <AppStateProvider>
            <Router>
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
            </Router>
          </AppStateProvider>
        </OfflineProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
