import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiSun, FiMoon, FiGlobe, FiBell, FiLock, FiShield, FiFileText, FiLogOut, FiChevronRight, FiWifiOff, FiRefreshCw, FiType, FiRadio } from 'react-icons/fi';
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
import { useSarthiReports } from '../../hooks/useSarthiReports';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useToast } from '../../hooks/useToast';
import { templateById } from '../../utils/pdTemplates';
import styles from './profile.module.css';

export default function ProfileSettings() {
  const { officer, session, logout, setPin, hasPin } = useAuth();
  const { isDark, toggleTheme, isLargeText, toggleTextSize } = useTheme();
  const { simulateOffline, setSimulateOffline, queue } = useOffline();
  const { resetDemo, remotePds, setRemotePds, addNotification, getCustomer } = useAppState();
  const [, setReports] = useSarthiReports();
  const { toast } = useToast();
  const [notif, setNotif] = useLocalStorage('bo_notif_prefs', { visit: true, inactivity: true, incentive: true, announcement: false });
  const [lang, setLang] = useState('en');
  const [pinSheet, setPinSheet] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [logoutSheet, setLogoutSheet] = useState(false);
  const [respondSheet, setRespondSheet] = useState(false);

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
        <Toggle label="Simulate offline" description={queue.length ? `${queue.length} actions queued for sync` : 'Shows the offline banner and queues actions'} checked={simulateOffline} onChange={setSimulateOffline} icon={<FiWifiOff size={18} />} />
        <div className={styles.divider} />
        <button className={styles.rowItem} onClick={() => setRespondSheet(true)} style={{ width: '100%' }}>
          <span className={styles.rowIcon}><FiRadio size={18} /></span>
          <div className="grow" style={{ textAlign: 'left' }}><div style={{ fontWeight: 500 }}>Simulate borrower response</div><div className="hint">Fake a reply to a pending remote-PD invite — the real borrower app would send this.</div></div>
        </button>
        <div className={styles.divider} />
        <button className={styles.rowItem} onClick={() => { resetDemo(); toast('Demo data reset', 'success'); }} style={{ width: '100%' }}>
          <span className={styles.rowIcon}><FiRefreshCw size={18} /></span>
          <div className="grow" style={{ textAlign: 'left' }}><div style={{ fontWeight: 500 }}>Reset demo data</div><div className="hint">Restore the original DSAs, visits and files</div></div>
        </button>
      </Card>

      <BorrowerResponseSheet
        open={respondSheet}
        onClose={() => setRespondSheet(false)}
        remotePds={remotePds}
        getCustomer={getCustomer}
        onRespond={(remotePd, outcome, reason) => {
          const customer = getCustomer(remotePd.customerId);
          if (!customer) return;
          const now = new Date().toISOString();
          const base = { ...remotePd, status: outcome, respondedAt: now };
          if (outcome === 'completed') {
            const report = synthRemoteReport(remotePd, customer, officer);
            setReports((prev) => [report, ...prev]);
            setRemotePds((prev) => prev.map((x) => (x.id === remotePd.id ? { ...base, resultReportId: report.id } : x)));
            addNotification({ type: 'visit', title: 'Surprise PD completed', message: `${customer.name} finished a ${templateById(remotePd.templateId)?.label ?? 'surprise PD'} on the borrower app.`, link: `/sarthi/report/${report.caseId}?pd=${report.id}` });
          } else if (outcome === 'refused') {
            setRemotePds((prev) => prev.map((x) => (x.id === remotePd.id ? { ...base, refusalReason: reason || 'Declined on the borrower app' } : x)));
            addNotification({ type: 'inactivity', title: 'Surprise PD refused', message: `${customer.name} declined the ${templateById(remotePd.templateId)?.label ?? 'surprise PD'} invite.`, link: `/customers/${customer.id}` });
          } else {
            setRemotePds((prev) => prev.map((x) => (x.id === remotePd.id ? base : x)));
            addNotification({ type: 'inactivity', title: 'Surprise PD missed', message: `${customer.name} did not respond to the ${templateById(remotePd.templateId)?.label ?? 'surprise PD'} invite.`, link: `/customers/${customer.id}` });
          }
        }}
      />

      <div style={{ marginTop: 32 }} className="stack">
        <Button variant="danger-outline" full icon={<FiLogOut />} onClick={() => setLogoutSheet(true)}>Log out</Button>
        <button className={styles.link} onClick={() => { toast('Logged out from all devices', 'success'); doLogout(); }}>Log out from all devices</button>
        <p className="hint" style={{ textAlign: 'center', marginTop: 8 }}>Branch Officer App v1.0.0 (POC build)</p>
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

// ponytail: demo seam, replaced by borrower-app webhook in production.
function BorrowerResponseSheet({ open, onClose, remotePds, getCustomer, onRespond }) {
  const pending = (remotePds ?? []).filter((x) => x.status === 'pending');
  const [reasonFor, setReasonFor] = useState(null); // id of the refusal flow in progress
  const [reason, setReason] = useState('');
  return (
    <BottomSheet open={open} onClose={onClose} title="Simulate borrower response">
      {pending.length === 0 ? (
        <p className="hint" style={{ padding: 8 }}>No surprise PDs are awaiting a response. Trigger one from a customer profile first.</p>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {pending.map((p) => {
            const c = getCustomer(p.customerId);
            const t = templateById(p.templateId);
            const refusing = reasonFor === p.id;
            return (
              <div key={p.id} style={{ padding: 12, borderRadius: 12, background: 'var(--bg)' }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c?.name ?? p.customerId}</div>
                <div className="hint" style={{ marginBottom: 10 }}>{t?.label ?? p.templateId}</div>
                {refusing ? (
                  <>
                    <input className={styles.pinInput} style={{ letterSpacing: 0, textAlign: 'left', fontSize: 14, height: 40, padding: '0 12px' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason the customer gave" />
                    <div className="row" style={{ gap: 6, marginTop: 8 }}>
                      <Button variant="secondary" style={{ flex: 1 }} onClick={() => { setReasonFor(null); setReason(''); }}>Back</Button>
                      <Button variant="danger" style={{ flex: 1 }} onClick={() => { onRespond(p, 'refused', reason); setReasonFor(null); setReason(''); onClose(); }}>Send refused</Button>
                    </div>
                  </>
                ) : (
                  <div className="row" style={{ gap: 6 }}>
                    <Button variant="primary" style={{ flex: 1 }} onClick={() => { onRespond(p, 'completed'); onClose(); }}>Completed</Button>
                    <Button variant="secondary" style={{ flex: 1 }} onClick={() => setReasonFor(p.id)}>Refused</Button>
                    <Button variant="secondary" style={{ flex: 1 }} onClick={() => { onRespond(p, 'missed'); onClose(); }}>Missed</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}

// Minimal "satisfactory" PD report for the remote demo seam. In production the borrower app writes this.
function synthRemoteReport(remotePd, customer, officer) {
  const now = new Date();
  const caseId = customer.sarthiCase ?? customer.id;
  const t = templateById(remotePd.templateId);
  return {
    id: `remote_pd_${now.getTime()}`,
    caseId,
    name: customer.name,
    pdNo: 1,
    mode: 'full',
    createdAt: now.toISOString(),
    startedAt: new Date(now.getTime() - 6 * 60000).toISOString(),
    endedAt: now.toISOString(),
    minutes: t?.minutes ?? 6,
    complete: true,
    coverage: 95,
    cameraOn: true,
    demoMode: false,
    turns: 22,
    recommendation: 'green',
    collected: {
      stated_name: customer.name,
      current_place: 'shop',
      monthly_income: customer.income,
      existing_emi: customer.existingEmi,
    },
    state: { hotAsked: [], crossAsked: [], tradeAnswers: [], professionAnswers: [], challengePlanned: false },
    evidence: [],
    flags: [],
    rechecks: [],
    photos: [],
    report: `# PD report — ${customer.name} (Surprise PD — ${t?.label ?? 'Surprise'})\n\n### 1. RED FLAGS\n- None in this surprise PD.\n\n### 2. WHAT SARTHI CHECKED\n- ✓ The customer answered on their own borrower app, with a live camera and location fix.\n- ✓ Face matched the KYC photo on file.\n\n### 3. WHAT THE BO / CO MUST CHECK\n- Nothing specific — this was a ${t?.label?.toLowerCase() ?? 'surprise PD'}. A field visit still stands for the usual sampling.\n\n### 5. RECOMMENDATION\nGREEN: Satisfactory — nothing in the interview contradicts the file.`,
    confirmedBy: { id: officer?.id ?? 'EMP10234', name: officer?.name ?? 'Branch Officer', role: officer?.designation ?? 'Branch Officer' },
    by: { id: officer?.id ?? 'EMP10234', name: 'Sarthi AI (borrower app)', role: 'Self-serve' },
    validation: { isClean: true, checked: { citations: 0 }, issues: [] },
    remote: { templateId: remotePd.templateId, triggeredAt: remotePd.triggeredAt, respondedAt: now.toISOString() },
  };
}
