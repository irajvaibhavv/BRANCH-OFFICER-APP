import styles from './AiAvatar.module.css';

// state: idle | speaking | listening | thinking
// Read by the applicant holding the phone, so these are in the language being spoken.
const STATE_TEXT = {
  idle: 'taiyaar',
  speaking: 'bol rahe hain',
  listening: 'sun rahe hain',
  thinking: 'soch rahe hain',
};

export default function AiAvatar({ state = 'idle', size = 132, label = true }) {
  return (
    <div className={styles.wrap} style={{ '--size': `${size}px` }}>
      <div className={`${styles.orbWrap} ${styles[state]}`}>
        {state === 'speaking' && (
          <>
            <span className={styles.ring} style={{ animationDelay: '0s' }} />
            <span className={styles.ring} style={{ animationDelay: '0.6s' }} />
            <span className={styles.ring} style={{ animationDelay: '1.2s' }} />
          </>
        )}
        <div className={styles.orb}>
          {state === 'thinking' ? (
            <span className={styles.dots}><i /><i /><i /></span>
          ) : (
            <span className={styles.letter}>S</span>
          )}
        </div>
      </div>
      {label && (
        <div className={styles.labels}>
          <div className={styles.name}>Sarthi AI</div>
          <div className={styles.state}>{STATE_TEXT[state] ?? STATE_TEXT.idle}</div>
        </div>
      )}
    </div>
  );
}
