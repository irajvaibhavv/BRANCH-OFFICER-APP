import { motion } from 'framer-motion';

/**
 * Simple animated bar chart. data: [{ label, value }]. Highlighted bar = full opacity.
 * Bars grow from 0 on mount with a stagger.
 */
export default function BarChart({ data = [], height = 140, highlightIndex = data.length - 1, formatValue = (v) => v, color = 'var(--primary)' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: height + 40, width: '100%' }}>
      {data.map((d, i) => {
        const h = Math.max(6, (d.value / max) * height);
        const active = i === highlightIndex;
        return (
          <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span className="hint" style={{ fontWeight: 600, color: active ? 'var(--text-1)' : 'var(--text-3)' }}>{formatValue(d.value)}</span>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: h }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.06 }}
              style={{ width: '100%', maxWidth: 36, background: color, opacity: active ? 1 : 0.6, borderRadius: '8px 8px 4px 4px' }}
            />
            <span className="hint" style={{ fontWeight: active ? 600 : 500 }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Two-series grouped bars (e.g. submitted vs approved). data: [{ label, a, b }].
 * Series A is drawn in a soft tint, series B solid, so "how much of A became B" reads at a glance.
 */
export function GroupedBarChart({ data = [], height = 130, labels = ['Submitted', 'Approved'], color = 'var(--primary)', successColor = 'var(--success)' }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.a, d.b)));
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
        <span className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: color, opacity: 0.35, display: 'inline-block' }} /> {labels[0]}</span>
        <span className="hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: successColor, display: 'inline-block' }} /> {labels[1]}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: height + 40, width: '100%' }}>
        {data.map((d, i) => {
          const ha = Math.max(4, (d.a / max) * height), hb = Math.max(4, (d.b / max) * height);
          const last = i === data.length - 1;
          return (
            <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span className="hint" style={{ fontWeight: 600, color: last ? 'var(--text-1)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>{d.b}/{d.a}</span>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, width: '100%', justifyContent: 'center' }}>
                <motion.div initial={{ height: 0 }} animate={{ height: ha }} transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.05 }} style={{ width: 14, background: color, opacity: last ? 0.45 : 0.28, borderRadius: '6px 6px 3px 3px' }} />
                <motion.div initial={{ height: 0 }} animate={{ height: hb }} transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.05 + 0.1 }} style={{ width: 14, background: successColor, opacity: last ? 1 : 0.75, borderRadius: '6px 6px 3px 3px' }} />
              </div>
              <span className="hint" style={{ fontWeight: last ? 600 : 500 }}>{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
