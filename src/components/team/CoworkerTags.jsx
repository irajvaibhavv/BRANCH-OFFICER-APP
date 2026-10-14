import { useState } from 'react';
import { FiAtSign, FiX } from 'react-icons/fi';
import Avatar from '../ui/Avatar';
import { Input } from '../ui/Input';
import { useAppState } from '../../context/AppStateContext';
import { useAuth } from '../../context/AuthContext';
import styles from './CoworkerTags.module.css';

/** Tag branch co-workers by employee code (or name). `value` is a list of employee codes. */
export default function CoworkerTags({ label = 'Tag co-workers (optional)', value = [], onChange }) {
  const { team } = useAppState();
  const { officer } = useAuth();
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const others = team.filter((m) => m.empCode !== officer.id && !value.includes(m.empCode));
  const needle = q.trim().toLowerCase();
  const matches = needle ? others.filter((m) => `${m.empCode} ${m.name} ${m.role}`.toLowerCase().includes(needle)).slice(0, 4) : [];
  const add = (code) => { onChange([...value, code]); setQ(''); setError(''); };
  const submit = () => {
    if (!needle) return;
    const exact = team.find((m) => m.empCode.toLowerCase() === needle);
    if (exact && exact.empCode === officer.id) setError('That is your own code');
    else if (exact && !value.includes(exact.empCode)) add(exact.empCode);
    else if (matches.length === 1) add(matches[0].empCode);
    else setError(`No co-worker with code “${q.trim()}”`);
  };

  return (
    <div className={styles.box}>
      {value.length > 0 && (
        <div className={styles.chips}>
          {value.map((code) => {
            const m = team.find((x) => x.empCode === code);
            return (
              <span key={code} className={styles.chip}>
                <Avatar name={m?.name ?? code} size={22} />{m?.name ?? code} <small>{code}</small>
                <button type="button" onClick={() => onChange(value.filter((x) => x !== code))} aria-label={`Remove ${m?.name ?? code}`}><FiX size={13} /></button>
              </span>
            );
          })}
        </div>
      )}
      <Input label={label} prefix={<FiAtSign size={15} />} placeholder="Employee code or name, e.g. EMP10311" value={q} error={error}
        onChange={(e) => { setQ(e.target.value); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
      {matches.length > 0 && (
        <div className={styles.list}>
          {matches.map((m) => (
            <button key={m.empCode} type="button" className={styles.opt} onClick={() => add(m.empCode)}>
              <Avatar name={m.name} size={28} />
              <span className="grow" style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 14, display: 'block' }}>{m.name}</span>
                <span className="hint">{m.role} · {m.empCode}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
