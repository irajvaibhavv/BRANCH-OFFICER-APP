import { createContext, useContext, useCallback, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

// Dummy officer profile — in production this comes from the auth API after OTP verify.
export const OFFICER = {
  id: 'EMP10234',
  name: 'Rajesh Kumar',
  designation: 'Branch Officer',
  branch: 'Pune – Shivajinagar',
  branchCode: 'PN-014',
  phone: '+91 98765 43210',
  email: 'rajesh.kumar@smfg.example',
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // session: { phone, role, loggedInAt, otpVerified }
  const [session, setSession] = useLocalStorage('bo_session', null);
  const [pin, setPin] = useLocalStorage('bo_pin', null);
  const [onboarded, setOnboarded] = useLocalStorage('bo_onboarded', false);

  // Like UPI apps: every fresh app open with a PIN set starts locked → PIN screen.
  useEffect(() => {
    if (pin && session?.authed) setSession((s) => ({ ...s, authed: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginWithOTP = useCallback((phone) => {
    setSession({ phone, role: null, loggedInAt: Date.now(), otpVerified: true, authed: false });
  }, [setSession]);

  const selectRole = useCallback((role) => {
    setSession((s) => ({ ...s, role, authed: role === 'bo', loggedInAt: Date.now() }));
  }, [setSession]);

  const quickLogin = useCallback(() => {
    setSession((s) => ({ ...s, authed: true, loggedInAt: Date.now() }));
  }, [setSession]);

  const lock = useCallback(() => setSession((s) => (s ? { ...s, authed: false } : s)), [setSession]);

  // Drop the session but keep the PIN (used by "Login with OTP instead")
  const clearSession = useCallback(() => setSession(null), [setSession]);

  // Logout = fresh demo: wipe every persisted "bo_*" key (session, PIN, onboarding, visits,
  // plans, recordings, toggles…) and reload so all state re-seeds from the dummy data.
  const logout = useCallback(() => {
    setSession(null);
    setPin(null);
    try {
      Object.keys(window.localStorage).filter((k) => k.startsWith('bo_')).forEach((k) => window.localStorage.removeItem(k));
    } catch { /* ignore */ }
    window.location.replace('/login');
  }, [setSession, setPin]);

  const value = {
    session,
    officer: OFFICER,
    isAuthed: !!session?.authed,
    hasPin: !!pin,
    pin,
    setPin,
    onboarded,
    setOnboarded,
    loginWithOTP,
    selectRole,
    quickLogin,
    lock,
    clearSession,
    logout,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
