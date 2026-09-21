import { useEffect, useState } from 'react';
import { IoCellular, IoWifi, IoBatteryFull } from 'react-icons/io5';
import { useTheme } from '../../context/ThemeContext';
import styles from './PhoneFrame.module.css';

/**
 * On desktop (>= 560px) the whole app renders inside a phone bezel so the demo reads
 * as a real handset. On an actual phone the frame collapses and the app is full-screen.
 *
 * `position: fixed` children (tab bar, FAB, sheets, toasts) stay inside the screen because
 * `.screenArea` has a transform, which makes it their containing block.
 */
const SCREEN_W = 390; // 6.1" phone at 1:1 CSS pixels — text stays full size
const BEZEL = 12;
// Desktop stage is rendered at 67% so the phone reads at a natural size on a laptop at 100% browser zoom.
const SCALE = 0.67;

export default function PhoneFrame({ children }) {
  const { isDark } = useTheme();
  const [time, setTime] = useState(() => clock());
  const [h, setH] = useState(844);
  useEffect(() => {
    const t = setInterval(() => setTime(clock()), 30_000);
    return () => clearInterval(t);
  }, []);

  // No scaling: the phone keeps 1:1 pixels so nothing looks tiny. Only its height adapts
  // to the browser window (between a short 6" phone and a tall 6.7" one).
  useEffect(() => {
    const fit = () => setH(Math.max(640, Math.min(900, window.innerHeight / SCALE - 24)));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div className={styles.stage}>
      <aside className={styles.aside}>
        <div className={styles.brand}>Branch Officer App</div>
        <p className={styles.tagline}>Branch Officer field app · prototype</p>
        <ul className={styles.hints}>
          <li>Demo OTP is <b>1234</b></li>
          <li>Dark mode & offline toggles live in Profile</li>
          <li>Best viewed at phone width — this is the phone</li>
        </ul>
      </aside>

      <div className={styles.device} style={{ width: SCREEN_W + BEZEL * 2, height: h + BEZEL * 2 }}>
        <div className={styles.buttonMute} />
        <div className={styles.buttonVolUp} />
        <div className={styles.buttonVolDown} />
        <div className={styles.buttonPower} />
        <div className={`${styles.screenArea} ${isDark ? styles.dark : ''}`} id="phone-screen">
          <div className={styles.statusBar}>
            <span className={styles.time}>{time}</span>
            <div className={styles.island} />
            <span className={styles.statusIcons}>
              <IoCellular size={15} />
              <IoWifi size={15} />
              <IoBatteryFull size={20} />
            </span>
          </div>
          <div className={styles.content}>{children}</div>
          <div className={styles.homeIndicator} />
        </div>
      </div>
    </div>
  );
}

function clock() {
  return new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: false });
}
