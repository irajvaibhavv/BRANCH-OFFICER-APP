import { avatarColor, initials } from '../../utils/colors';

/** Gradient circle with initials. Color is stable per name. */
export default function Avatar({ name, size = 48, className = '', style, ring = false }) {
  const bg = avatarColor(name);
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `linear-gradient(145deg, color-mix(in srgb, ${bg} 78%, #fff) 0%, ${bg} 60%, color-mix(in srgb, ${bg} 82%, #000) 100%)`,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.36,
        letterSpacing: '-0.02em',
        flexShrink: 0,
        boxShadow: ring
          ? `0 0 0 3px var(--card), 0 0 0 5px ${bg}, 0 6px 16px color-mix(in srgb, ${bg} 35%, transparent)`
          : `inset 0 1px 0 rgba(255,255,255,0.28), 0 2px 8px color-mix(in srgb, ${bg} 30%, transparent)`,
        textShadow: '0 1px 1px rgba(0,0,0,0.12)',
        ...style,
      }}
      aria-label={name}
    >
      {initials(name)}
    </div>
  );
}
