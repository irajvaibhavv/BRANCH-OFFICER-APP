import { useState } from 'react';
import { OFFICER } from '../../context/AuthContext';
import styles from './ConfirmPd.module.css';

const ROLES = ['Branch Officer', 'Credit Officer'];

/** Human in the loop: a PD is saved only once a BO or CO ticks that they reviewed it. → onConfirm({ name, role, at }) */
export default function ConfirmPd({ onConfirm, what = 'the red flags, what Sarthi checked and what is left to check' }) {
  const [role, setRole] = useState(ROLES[0]);
  const [name, setName] = useState(OFFICER.name);
  const [checked, setChecked] = useState(false);
  const pick = (x) => { setRole(x); setName(x === OFFICER.designation ? OFFICER.name : ''); };
  return (
    <section className={styles.box}>
      <h2 className={styles.head}>Confirm and save</h2>
      <div className={styles.roles}>
        {ROLES.map((x) => <button type="button" key={x} className={role === x ? styles.roleOn : styles.role} onClick={() => pick(x)}>{x}</button>)}
      </div>
      <label className={styles.field}>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></label>
      <label className={styles.check}>
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        I have reviewed this PD — {what}.
      </label>
      <button type="button" className={styles.save} disabled={!checked || !name.trim()} onClick={() => onConfirm({ name: name.trim(), role, at: new Date().toISOString() })}>
        Save PD
      </button>
    </section>
  );
}
