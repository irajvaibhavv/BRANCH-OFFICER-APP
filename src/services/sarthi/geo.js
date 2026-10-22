// Where a shop / home photo was taken, against the location on the file. Real GPS only — never the demo's Pune
// fallback in useGeolocation, which would make every photo "match" a made-up point.

export const NEAR_M = 200; // lead's call (2026-10-22): beyond this the place on the photo is not the one on file

/** The phone's position now: { lat, lng, accuracy } or { error }. Never rejects. */
export function getFix(timeout = 8000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ error: 'unsupported' });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), accuracy: Math.round(p.coords.accuracy) }),
      (e) => resolve({ error: e.code === 1 ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout, maximumAge: 30000 },
    );
  });
}

/** "28.65, 77.19" or a Google Maps link (…@28.65,77.19… / ?q=28.65,77.19) → { lat, lng }, else null. */
export function parseLatLng(text) {
  const m = String(text ?? '').match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

export function distanceM(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

export const mapLink = (p) => `https://www.google.com/maps?q=${p.lat},${p.lng}`;

export const inDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

/**
 * fix vs the file's point → { status: near | far | not_on_file | no_fix, distance }. A fix whose own error circle
 * reaches within NEAR_M is not called far: indoor GPS drifts, and a false "not their shop" is worse than a soft one.
 */
export function checkPlace(fix, onFile) {
  if (!fix || fix.error) return { status: 'no_fix' };
  if (!onFile) return { status: 'not_on_file' };
  const distance = distanceM(fix, onFile);
  return { status: distance - (fix.accuracy ?? 0) > NEAR_M ? 'far' : 'near', distance };
}
