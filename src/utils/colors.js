// Deterministic avatar color per name so each DSA always gets the same color.
const AVATAR_PALETTE = [
  '#4c1d95', '#7c3aed', '#db2777', '#ea580c', '#16a34a',
  '#0f766e', '#6d28d9', '#c026d3', '#9333ea', '#d97706',
];

export function avatarColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export const STATUS_COLORS = {
  approved: 'success',
  disbursed: 'primary',
  pending: 'warning',
  submitted: 'primary',
  'under review': 'warning',
  rejected: 'danger',
  completed: 'success',
  upcoming: 'primary',
  missed: 'danger',
  positive: 'success',
  neutral: 'neutral',
  'need follow-up': 'warning',
  complete: 'success',
  incomplete: 'danger',
};
