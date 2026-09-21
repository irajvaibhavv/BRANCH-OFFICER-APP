import styles from './Badge.module.css';
import { QUALITY } from '../../utils/qualityTags';
import { STATUS_COLORS } from '../../utils/colors';

/** Pill badge. tone: success | warning | danger | primary | neutral */
export default function Badge({ children, tone = 'neutral', soft = false, size = 'sm', className = '' }) {
  return (
    <span className={[styles.badge, styles[tone], soft ? styles.soft : '', styles[size], className].join(' ')}>{children}</span>
  );
}

export function QualityBadge({ quality, ...rest }) {
  const q = QUALITY[quality] ?? QUALITY.average;
  return <Badge tone={q.tone} {...rest}>{q.label}</Badge>;
}

export function StatusBadge({ status, ...rest }) {
  const tone = STATUS_COLORS[status?.toLowerCase()] ?? 'neutral';
  const label = status.replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge tone={tone} {...rest}>{label}</Badge>;
}
