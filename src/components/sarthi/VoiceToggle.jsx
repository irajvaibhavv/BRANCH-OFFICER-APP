import { useEffect, useState } from 'react';
import { getSarthiGender, setSarthiGender, onSarthiGender } from '../../services/sarthi/voice';
import styles from './VoiceToggle.module.css';

const OPTIONS = [
  { id: 'male', emoji: '👨', label: 'Male voice' },
  { id: 'female', emoji: '👩', label: 'Female voice' },
];

// Sarthi's voice: male or female. Takes effect from the next line — the words switch gender with it.
export default function VoiceToggle({ className = '' }) {
  const [gender, setGender] = useState(getSarthiGender);
  useEffect(() => onSarthiGender(setGender), []);

  return (
    <div className={`${styles.toggle} ${className}`} role="radiogroup" aria-label="Sarthi ki awaaz">
      <span className={styles.thumb} style={{ transform: `translateX(${gender === 'female' ? 100 : 0}%)` }} aria-hidden="true" />
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={gender === o.id}
          aria-label={o.label}
          title={o.label}
          className={`${styles.opt} ${gender === o.id ? styles.on : ''}`}
          onClick={() => setSarthiGender(o.id)}
        >
          {o.emoji}
        </button>
      ))}
    </div>
  );
}
