/** Tiny inline metric used inside list cards: value on top, label below. */
export function MiniMetric({ value, label, tone }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span style={{ fontWeight: 700, fontSize: 15, color: tone ? `var(--${tone})` : 'var(--text-1)', letterSpacing: '-0.01em' }}>{value}</span>
      <span className="hint">{label}</span>
    </div>
  );
}

/** Row of MiniMetrics with thin vertical dividers between them. */
export function MiniMetricRow({ items }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {items.map((it, i) => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {i > 0 && <div style={{ width: 1, height: 28, background: 'var(--border)' }} />}
          <MiniMetric {...it} />
        </div>
      ))}
    </div>
  );
}

/** Thin horizontal progress bar. */
export function ProgressBar({ value = 0, height = 8, color = 'var(--primary)', track = 'var(--border)', animate = true }) {
  return (
    <div style={{ width: '100%', height, background: track, borderRadius: 999, overflow: 'hidden' }}>
      <div
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          height: '100%',
          background: color,
          borderRadius: 999,
          transition: animate ? 'width 1s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        }}
      />
    </div>
  );
}
