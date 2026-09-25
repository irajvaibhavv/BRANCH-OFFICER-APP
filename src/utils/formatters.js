// Indian number formatting: Rs 1.2Cr, Rs 45L, Rs 8,500
export function formatINR(amount, { compact = true } = {}) {
  if (amount == null) return '—';
  const abs = Math.abs(amount);
  if (compact) {
    if (abs >= 1e7) return `₹${(amount / 1e7).toFixed(abs % 1e7 === 0 ? 0 : 1)}Cr`;
    if (abs >= 1e5) return `₹${(amount / 1e5).toFixed(abs % 1e5 === 0 ? 0 : 1)}L`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatDate(d, opts = { day: 'numeric', month: 'short' }) {
  return new Date(d).toLocaleDateString('en-IN', opts);
}

export function formatDateLong(d) {
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatTime(d) {
  return new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function timeAgo(d) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'yesterday';
  return `${Math.floor(diff / 86400)}d ago`;
}

export function toISODate(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function pct(part, total) {
  if (!total) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}

// "14:30" → "2:30 PM"
export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export const capitalize = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);
