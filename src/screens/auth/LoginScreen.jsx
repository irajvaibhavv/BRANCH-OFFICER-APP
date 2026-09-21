import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowRight } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import Button from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import styles from './auth.module.css';

export function AuthHeader({ title, subtitle }) {
  return (
    <motion.div className={styles.header} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className={styles.logo}>S</div>
      <div style={{ marginTop: 12, fontSize: 24, fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.02em' }}>SMFG<span style={{ color: 'var(--text-3)', fontWeight: 500, margin: '0 4px' }}>·</span>BO Connect</div>
      <h1 style={{ marginTop: 16 }}>{title}</h1>
      <p>{subtitle}</p>
    </motion.div>
  );
}

export default function LoginScreen() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [phone, setPhone] = useState(session?.phone ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (!/^[6-9]\d{9}$/.test(phone)) return setError('Enter a valid 10-digit mobile number');
    setError('');
    setLoading(true);
    setTimeout(() => navigate('/login/otp', { state: { phone } }), 700);
  };

  return (
    <Page noTab mode="fade" style={{ padding: 0 }}>
      <div className={styles.wrap}>
        <AuthHeader title="Welcome back" subtitle="Enter your mobile number to continue" />
        <form className={styles.form} onSubmit={submit}>
          <Input
            label="Mobile number"
            prefix={<span style={{ fontWeight: 600, color: 'var(--text-1)' }}>+91</span>}
            type="tel"
            inputMode="numeric"
            maxLength={10}
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            error={error}
            autoFocus
            style={{ fontSize: 20, fontWeight: 600, letterSpacing: '0.02em' }}
          />
          <div className={styles.spacer} />
          <Button type="submit" full loading={loading} iconRight={<FiArrowRight size={20} />}>
            Send OTP
          </Button>
        </form>
      </div>
    </Page>
  );
}
