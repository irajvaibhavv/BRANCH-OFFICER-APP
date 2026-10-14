import { useState } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { toISODate } from '../../utils/formatters';
import styles from './MonthGrid.module.css';

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Monday-first month picker. `dots(iso)` returns up to 3 colours to mark that day. */
export default function MonthGrid({ selected, onSelect, dots = () => [] }) {
  const today = toISODate();
  const [cursor, setCursor] = useState(() => new Date(`${selected.slice(0, 7)}-01T00:00:00`));
  const y = cursor.getFullYear(), mo = cursor.getMonth();
  const pad = (new Date(y, mo, 1).getDay() + 6) % 7;
  const cells = [...Array(pad).fill(null), ...Array.from({ length: new Date(y, mo + 1, 0).getDate() }, (_, i) => toISODate(new Date(y, mo, i + 1)))];
  return (
    <>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <button className={styles.nav} onClick={() => setCursor(new Date(y, mo - 1, 1))} aria-label="Previous month"><FiChevronLeft size={22} /></button>
        <h3>{cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h3>
        <button className={styles.nav} onClick={() => setCursor(new Date(y, mo + 1, 1))} aria-label="Next month"><FiChevronRight size={22} /></button>
      </div>
      <div className={styles.grid}>
        {DOW.map((d, i) => <span key={i} className={styles.dow}>{d}</span>)}
        {cells.map((iso, i) => iso ? (
          <button key={iso} className={`${styles.cell} ${iso === selected ? styles.sel : ''} ${iso === today ? styles.today : ''}`} onClick={() => onSelect(iso)}>
            <span>{Number(iso.slice(-2))}</span>
            <span className={styles.dots}>{dots(iso).slice(0, 3).map((c, j) => <i key={j} className={styles.dot} style={{ background: c }} />)}</span>
          </button>
        ) : <span key={`p${i}`} />)}
      </div>
    </>
  );
}
