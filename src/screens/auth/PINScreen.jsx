import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiDelete } from 'react-icons/fi';
import { IoFingerPrint } from 'react-icons/io5';
import Page from '../../components/layout/Page';
import Avatar from '../../components/ui/Avatar';
import { SuccessCheck } from '../../components/ui/SuccessCheck';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/useToast';
import styles from './auth.module.css';

/** Shared UPI-style number pad + dots. */
function PinPad({ value, onChange, error, extra }) {
  const press = (k) => {
    if (k === 'del') return onChange(value.slice(0, -1));
    if (value.length >= 4) return;
    onChange(value + k);
  };
  return (
    <>
      <motion.div className={styles.dots} animate={error ? { x: [0, -10, 10, -8, 8, 0] } : {}} transition={{ duration: 0.4 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${styles.dot} ${value.length > i ? styles.dotOn : ''} ${error ? styles.dotErr : ''}`} />
        ))}
      </motion.div>
      <div className={styles.pad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
          <motion.button key={k} whileTap={{ scale: 0.92 }} className={styles.key} onClick={() => press(k)}>{k}</motion.button>
        ))}
        <div className={`${styles.key} ${styles.keyGhost}`}>{extra}</div>
        <motion.button whileTap={{ scale: 0.92 }} className={styles.key} onClick={() => press('0')}>0</motion.button>
        <motion.button whileTap={{ scale: 0.92 }} className={`${styles.key} ${styles.keyGhost}`} onClick={() => press('del')} aria-label="Delete">
          <FiDelete size={24} />
        </motion.button>
      </div>
    </>
  );
}

/** Step 1 (after first OTP login): set a 4-digit PIN, then confirm it. */
export function PINSetupScreen() {
  const navigate = useNavigate();
  const { setPin, onboarded, session } = useAuth();
  const { toast } = useToast();
  const [stage, setStage] = useState('set'); // set | confirm
  const [first, setFirst] = useState('');
  const [val, setVal] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!session?.otpVerified) navigate('/login', { replace: true });
  }, [session, navigate]);

  useEffect(() => {
    if (val.length !== 4) return;
    if (stage === 'set') {
      setFirst(val);
      setTimeout(() => { setStage('confirm'); setVal(''); }, 200);
    } else if (val === first) {
      setPin(val);
      toast('PIN set. Use it for quick login next time.', 'success');
      navigate(onboarded ? '/' : '/onboarding', { replace: true });
    } else {
      setError(true);
      setTimeout(() => { setVal(''); setError(false); setStage('set'); setFirst(''); }, 600);
    }
  }, [val]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page noTab mode="slide" style={{ padding: 0 }}>
      <div className={styles.wrap}>
        <div className={styles.header}>
          <div className={styles.logo}>🔒</div>
          <AnimatePresence mode="wait">
            <motion.div key={stage} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h1 style={{ marginTop: 16 }}>{stage === 'set' ? 'Set a quick PIN' : 'Confirm your PIN'}</h1>
              <p style={{ marginTop: 8 }}>{stage === 'set' ? 'Log in faster next time, no OTP needed' : 'Enter the same 4 digits again'}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <PinPad value={val} onChange={setVal} error={error} />
        {error && <p style={{ color: 'var(--danger)', textAlign: 'center', marginTop: 16, fontWeight: 500 }}>PINs don't match. Start again.</p>}
        <div className={styles.spacer} />
        <button className={styles.link} style={{ alignSelf: 'center' }} onClick={() => navigate(onboarded ? '/' : '/onboarding', { replace: true })}>
          Skip for now
        </button>
      </div>
    </Page>
  );
}

/** Returning user: PIN entry with biometric placeholder and OTP fallback. */
export default function PINScreen() {
  const navigate = useNavigate();
  const { pin, quickLogin, officer, session, clearSession } = useAuth();
  const { toast } = useToast();
  const [val, setVal] = useState('');
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);

  const succeed = () => {
    setSuccess(true);
    setTimeout(() => { quickLogin(); navigate('/', { replace: true }); }, 900);
  };

  useEffect(() => {
    if (val.length !== 4) return;
    if (val === pin) succeed();
    else {
      setError(true);
      setTimeout(() => { setVal(''); setError(false); }, 600);
    }
  }, [val]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Page noTab mode="fade" style={{ padding: 0 }}>
      <div className={styles.wrap}>
        <div className={styles.header} style={{ marginBottom: 24 }}>
          <Avatar name={officer.name} size={72} />
          <h1 style={{ marginTop: 12 }}>Hi, {officer.name.split(' ')[0]}</h1>
          <p>Enter your PIN to continue</p>
        </div>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <SuccessCheck size={96} />
            </motion.div>
          ) : (
            <motion.div key="pad" exit={{ opacity: 0, scale: 0.95 }}>
              <PinPad value={val} onChange={setVal} error={error} />
              {error && <p style={{ color: 'var(--danger)', textAlign: 'center', marginTop: 16, fontWeight: 500 }}>Wrong PIN. Try again.</p>}
              <motion.button
                className={styles.bioBtn}
                whileTap={{ scale: 0.9 }}
                onClick={() => { toast('Fingerprint verified', 'success', 1500); succeed(); }}
                aria-label="Login with fingerprint"
              >
                <IoFingerPrint size={40} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={styles.spacer} />
        <div className={styles.footer}>
          <button className={styles.link} onClick={() => { clearSession(); navigate('/login', { replace: true }); }}>
            Login with OTP instead
          </button>
          <span className="hint">+91 {session?.phone}</span>
        </div>
      </div>
    </Page>
  );
}
