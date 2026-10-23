// The organisation's retention policy (More → Data retention): how long a PD report stays valid for a credit decision,
// and how long a call's video is kept before it is deleted. One policy per organisation; in production it comes from
// the admin portal, here it is a bo_ key so logout resets it.

export const RETENTION_KEY = 'bo_org_retention';
export const RETENTION_DEFAULTS = { pdValidityDays: 90, videoRetentionDays: 30 };
export const VIDEO_PREFIX = 'bo_sarthi_video_'; // one key per PD id, written by the call recorder: { at, ... }

export function readRetention() {
  try {
    return { ...RETENTION_DEFAULTS, ...JSON.parse(window.localStorage.getItem(RETENTION_KEY)) };
  } catch {
    return RETENTION_DEFAULTS;
  }
}

/** A date `days` after `from`, and whether it has passed. → { until: Date, expired, daysLeft } */
export function expiry(from, days, now = new Date()) {
  const until = new Date(new Date(from).getTime() + days * 86400000);
  return { until, expired: now >= until, daysLeft: Math.ceil((until - now) / 86400000) };
}

/** Deletes every call video older than the policy allows. Returns how many went. */
export function purgeExpiredVideos(days = readRetention().videoRetentionDays, now = new Date()) {
  let gone = 0;
  try {
    const ls = window.localStorage;
    Object.keys(ls).filter((k) => k.startsWith(VIDEO_PREFIX)).forEach((k) => {
      const at = JSON.parse(ls.getItem(k))?.at;
      if (at && expiry(at, days, now).expired) { ls.removeItem(k); gone += 1; }
    });
  } catch { /* storage blocked — nothing to purge */ }
  return gone;
}
