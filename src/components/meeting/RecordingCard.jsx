import { useNavigate } from 'react-router-dom';
import { FiMic, FiClock } from 'react-icons/fi';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { formatDate, fmtTime, capitalize } from '../../utils/formatters';
import { fmtClock } from '../../services/meeting/transcript';
import styles from './RecordingCard.module.css';

export const SENTIMENT_TONE = { positive: 'success', neutral: 'neutral', 'needs follow-up': 'warning' };

export default function RecordingCard({ rec, dsa, showDsa = false }) {
  const navigate = useNavigate();
  return (
    <Card padding={16} onClick={() => navigate(`/recordings/${rec.id}`)}>
      <div className={styles.row}>
        <div className={styles.icon}><FiMic size={20} /></div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }} className="truncate">{showDsa ? dsa?.name : rec.summary.headline}</div>
          <div className="hint row" style={{ gap: 6 }}>
            <FiClock size={12} /> {formatDate(rec.date, { day: 'numeric', month: 'short' })} · {fmtTime(rec.time)} · {fmtClock(rec.durationSecs)}
          </div>
        </div>
        <Badge tone={SENTIMENT_TONE[rec.summary.sentiment]} soft>{capitalize(rec.summary.sentiment)}</Badge>
      </div>
    </Card>
  );
}
