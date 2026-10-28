// DSA quality is derived from approval rate + volume. Kept simple for the prototype.
export const QUALITY = {
  high: { label: 'High Quality', tone: 'success' },
  average: { label: 'Average', tone: 'warning' },
  low: { label: 'Low Quality', tone: 'danger' },
};

export function qualityFromStats({ approvalRate = 0, filesSubmitted = 0 }) {
  if (approvalRate >= 65 && filesSubmitted >= 20) return 'high';
  if (approvalRate >= 45) return 'average';
  return 'low';
}
