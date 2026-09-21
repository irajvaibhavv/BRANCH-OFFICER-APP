import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiSun, FiMoon, FiGlobe, FiBell, FiLock, FiShield, FiFileText, FiLogOut, FiChevronRight, FiWifiOff, FiRefreshCw, FiLayout, FiType } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import BottomSheet from '../../components/ui/BottomSheet';
import { Toggle } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useOffline } from '../../context/OfflineContext';
import { useAppState } from '../../context/AppStateContext';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useToast } from '../../hooks/useToast';
import styles from './profile.module.css';

export default function ProfileSettings() {
  const navigate = useNavigate();
  const { officer, session, logout, setPin, hasPin } = useAuth();
  const { isDark, toggleTheme, isLargeText, toggleTextSize } = useTheme();
  const { simulateOffline, setSimulateOffline, queue } = useOffline();
  const { resetDemo } = useAppState();
  const { toast } = useToast();
  const [notif, setNotif] = useLocalStorage('bo_notif_prefs', { visit: true, inactivity: true, incentive: true, announcement: false });
  const [lang, setLang] = useState('en');
  const [homeLayout, setHomeLayout] = useLocalStorage('bo_home_layout', 'focused');
  const [pinSheet, setPinSheet] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [logoutSheet, setLogoutSheet] = useState(false);

  const lastLogin = session?.loggedInAt ? new Date(session.loggedInAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

  const doLogout = () => { logout(); };

  return (
    <Page mode="slide">
      <TopBar back title="Profile" />

      <div className={styles.head}>
        <Avatar name={officer.name} size={88} />
        <h1 style={{ fontSize: 24, marginTop: 12 }}>{officer.name}</h1>
        <span className="label">{officer.designation} · {officer.id}</span>
        <span className="hint" style={{ marginTop: 4 }}>Last logged in {lastLogin}</span>
      </div>

      <div className={styles.infoGrid}>
        {[['Branch', officer.branch], ['Branch code', officer.branchCode], ['Phone', officer.phone], ['Email', officer.email]].map(([k, v]) => (
          <Card key={k} padding={14} noChevron><div className="hint">{k}</div><div style={{ fontWeight: 600, fontSize: 15, wordBreak: 'break-all' }}>{v}</div></Card>
        ))}
      </div>

      <div className="section-head"><h2 className="section-title">Settings</h2></div>
      <Card padding="4px 20px">
        <Toggle
          label="Dark mode" description="Easier on the eyes at night" checked={isDark} onChange={toggleTheme}
          icon={
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={isDark ? 'moon' : 'sun'} initial={{ rotate: -90, opacity: 0, scale: 0.6 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} exit={{ rotate: 90, opacity: 0, scale: 0.6 }} transition={{ duration: 0.25 }} style={{ display: 'flex' }}>
                {isDark ? <FiMoon size={18} /> : <FiSun size={18} />}
              </motion.span>
            </AnimatePresence>
          }
        />
        <Toggle label="Larger text" description="Bigger text everywhere — easier to read in sunlight" checked={isLargeText} onChange={toggleTextSize} icon={<FiType size={18} />} />
        <div className={styles.divider} />
        <div className={styles.rowItem}>
          <span className={styles.rowIcon}><FiGlobe size={18} /></span>
          <div className="grow"><div style={{ fontWeight: 500 }}>Language</div><div className="hint">App display language</div></div>
          <div className={styles.seg}>
            {[['en', 'English'], ['hi', 'हिंदी']].map(([k, l]) => (
              <button key={k} className={`${styles.segBtn} ${lang === k ? styles.segOn : ''}`} onClick={() => { if (k === 'hi') return toast('Hindi is coming soon', 'info'); setLang(k); }}>{l}</button>
            ))}
          </div>
        </div>
      </Card>

      <div className="section-head"><h2 className="section-title">Notifications</h2></div>
      <Card padding="4px 20px">
        {[['visit', 'Visit reminders'], ['inactivity', 'DSA inactivity alerts'], ['incentive', 'Incentive milestones'], ['announcement', 'Company announcements']].map(([k, l], i) => (
          <div key={k}>
            {i > 0 && <div className={styles.divider} />}
            <Toggle label={l} checked={notif[k]} onChange={(v) => setNotif((n) => ({ ...n, [k]: v }))} icon={<FiBell size={18} />} />
          </div>
        ))}
      </Card>

      <div className="section-head"><h2 className="section-title">Security & legal</h2></div>
      <Card padding={0}>
        <MenuRow icon={<FiLock size={18} />} label={hasPin ? 'Change PIN' : 'Set up PIN'} onClick={() => setPinSheet(true)} />
        <MenuRow icon={<FiShield size={18} />} label="Privacy policy" onClick={() => toast('Privacy policy placeholder', 'info')} />
        <MenuRow icon={<FiFileText size={18} />} label="Terms of service" onClick={() => toast('Terms of service placeholder', 'info')} last />
      </Card>

      <div className="section-head"><h2 className="section-title">Demo controls</h2></div>
      <Card padding="4px 20px">
        <div className={styles.rowItem}>
          <span className={styles.rowIcon}><FiLayout size={18} /></span>
          <div className="grow"><div style={{ fontWeight: 500 }}>Home layout</div><div className="hint">Focused = 3 priorities · Detailed = full overview</div></div>
          <div className={styles.seg}>
            {[['focused', 'Focused'], ['detailed', 'Detailed']].map(([k, l]) => (
              <button key={k} className={`${styles.segBtn} ${homeLayout === k ? styles.segOn : ''}`} onClick={() => setHomeLayout(k)}>{l}</button>
            ))}
          </div>
        </div>
        <div className={styles.divider} />
        <Toggle label="Simulate offline" description={queue.length ? `${queue.length} actions queued for sync` : 'Shows the offline banner and queues actions'} checked={simulateOffline} onChange={setSimulateOffline} icon={<FiWifiOff size={18} />} />
        <div className={styles.divider} />
        <button className={styles.rowItem} onClick={() => { resetDemo(); toast('Demo data reset', 'success'); }} style={{ width: '100%' }}>
          <span className={styles.rowIcon}><FiRefreshCw size={18} /></span>
          <div className="grow" style={{ textAlign: 'left' }}><div style={{ fontWeight: 500 }}>Reset demo data</div><div className="hint">Restore the original DSAs, visits and files</div></div>
        </button>
      </Card>

      <div style={{ marginTop: 32 }} className="stack">
        <Button variant="danger-outline" full icon={<FiLogOut />} onClick={() => setLogoutSheet(true)}>Log out</Button>
        <button className={styles.link} onClick={() => { toast('Logged out from all devices', 'success'); doLogout(); }}>Log out from all devices</button>
        <p className="hint" style={{ textAlign: 'center', marginTop: 8 }}>BO Connect v1.0.0 (POC build)</p>
      </div>

      <BottomSheet open={pinSheet} onClose={() => setPinSheet(false)} title={hasPin ? 'Change PIN' : 'Set PIN'}>
        <p className="text-2" style={{ marginBottom: 16 }}>Enter a new 4-digit PIN for quick login.</p>
        <input className={styles.pinInput} inputMode="numeric" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" autoFocus />
        <Button full disabled={newPin.length !== 4} onClick={() => { setPin(newPin); setNewPin(''); setPinSheet(false); toast('PIN updated', 'success'); }} style={{ marginTop: 16 }}>Save PIN</Button>
      </BottomSheet>

      <BottomSheet open={logoutSheet} onClose={() => setLogoutSheet(false)} title="Log out?">
        <p className="text-2" style={{ marginBottom: 20 }}>You'll need to sign in with OTP next time. This also resets the demo — plans, visits, recordings and settings go back to a fresh start.</p>
        <div className="stack">
          <Button variant="danger" full onClick={doLogout}>Log out</Button>
          <Button variant="secondary" full onClick={() => setLogoutSheet(false)}>Stay signed in</Button>
        </div>
      </BottomSheet>
    </Page>
  );
}

function MenuRow({ icon, label, onClick, last }) {
  return (
    <button className={styles.menuRow} onClick={onClick} style={last ? { borderBottom: 'none' } : undefined}>
      <span className={styles.rowIcon}>{icon}</span>
      <span className="grow" style={{ textAlign: 'left', fontWeight: 500 }}>{label}</span>
      <FiChevronRight size={20} color="var(--text-3)" />
    </button>
  );
}
