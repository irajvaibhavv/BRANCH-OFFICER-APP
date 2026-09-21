import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/useToast';
import { AuthHeader } from './LoginScreen';
import styles from './auth.module.css';

const DEMO_OTP = '1234';

export default function OTPScreen() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { loginWithOTP, selectRole, hasPin } = useAuth();
  const { toast } = useToast();
  const phone = state?.phone ?? '9876543210';

  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(30);
  const refs = [useRef(), useRef(), useRef(), useRef()];

  useEffect(() => {
    refs[0].current?.focus();
    toast(`OTP sent to +91 ${phone}. Use 1234 for demo.`, 'info', 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const verify = (code) => {
    setLoading(true);
    setTimeout(() => {
      if (code === DEMO_OTP) {
        loginWithOTP(phone);
        selectRole('bo'); // app is Branch-Officer only
        navigate(hasPin ? '/' : '/login/pin-setup', { replace: true });
      } else {
        setError(true);
        setLoading(false);
        setDigits(['', '', '', '']);
        refs[0].current?.focus();
      }
    }, 600);
  };

  const onChange = (i, v) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = d;
    setDigits(next);
    setError(false);
    if (d && i < 3) refs[i + 1].current?.focus();
    if (next.every(Boolean)) verify(next.join(''));
  };

  const onKey = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs[i - 1].current?.focus();
  };

  const onPaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (text.length === 4) {
      setDigits(text.split(''));
      verify(text);
    }
  };

  return (
    <Page noTab mode="slide" style={{ padding: 0 }}>
      <div className={styles.wrap} style={{ paddingTop: 8 }}>
        <TopBar back title="" hideBell transparent />
        <AuthHeader title="Verify OTP" subtitle={`We sent a 4-digit code to +91 ${phone.slice(0, 5)} ${phone.slice(5)}`} />

        <motion.div className={styles.otpRow} animate={error ? { x: [0, -10, 10, -8, 8, 0] } : {}} transition={{ duration: 0.4 }} onPaste={onPaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={refs[i]}
              className={`${styles.otpBox} ${d ? styles.filled : ''} ${error ? styles.error : ''}`}
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => onChange(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              aria-label={`Digit ${i + 1}`}
            />
          ))}
        </motion.div>
        {error && (
          <p style={{ color: 'var(--danger)', textAlign: 'center', fontSize: 14, fontWeight: 500, marginTop: 12 }}>
            Incorrect OTP. Try 1234 for the demo.
          </p>
        )}

        <div className={styles.spacer} />
        <div className={styles.footer}>
          <Button full loading={loading} disabled={!digits.every(Boolean)} onClick={() => verify(digits.join(''))}>
            Verify & continue
          </Button>
          {resendIn > 0 ? (
            <span className="hint">Resend OTP in {resendIn}s</span>
          ) : (
            <button className={styles.link} onClick={() => { setResendIn(30); toast('OTP resent. Use 1234.', 'success'); }}>
              Resend OTP
            </button>
          )}
        </div>
      </div>
    </Page>
  );
}
