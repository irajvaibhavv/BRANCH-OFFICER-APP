/** Shimmering placeholders. Use SkeletonCard for list loading states. */
export function Skeleton({ w = '100%', h = 16, r = 8, style }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

export function SkeletonCard({ lines = 2, avatar = false }) {
  return (
    <div
      style={{
        background: 'var(--card)',
        borderRadius: 16,
        padding: 20,
        display: 'flex',
        gap: 12,
        boxShadow: 'var(--card-shadow)',
        border: 'var(--card-border)',
      }}
    >
      {avatar && <Skeleton w={48} h={48} r={24} />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Skeleton w="60%" h={18} />
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} w={i === lines - 1 ? '40%' : '90%'} h={14} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3, ...rest }) {
  return (
    <div className="stack">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} {...rest} />
      ))}
    </div>
  );
}
