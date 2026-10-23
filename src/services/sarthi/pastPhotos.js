// Past photos of a shop / home pin: Esri Wayback satellite (free, no key), Mapillary street photos (free token) and
// Google Street View (VITE_GOOGLE_MAPS_KEY). Google's APIs carry only the latest Street View, so its older dates are
// a deep link to the Maps app. Evidence for the officer to judge, never proof of vintage on its own.

const WAYBACK_CONFIG = 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json';
const env = import.meta.env ?? {}; // undefined under node (npm run check:pastphotos)
const GOOGLE_KEY = env.VITE_GOOGLE_MAPS_KEY;
const MAPILLARY_TOKEN = env.VITE_MAPILLARY_TOKEN;
export const SAT_ZOOM = 18;

export const hasGoogle = Boolean(GOOGLE_KEY);
export const hasMapillary = Boolean(MAPILLARY_TOKEN);

const monthYear = (d) => d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

/** Metadata layer for a zoom, as Esri's wayback-core picks it (one layer per resolution, 23 = finest). */
const metaLayer = (zoom) => 23 - Math.max(10, Math.min(23, zoom));

/** When the satellite photo in one Wayback release was actually taken here — a release can carry years-old imagery. */
async function capturedAt(metadataLayerUrl, p) {
  const q = new URLSearchParams({
    f: 'json', where: '1=1', outFields: 'SRC_DATE2', returnGeometry: 'false',
    geometry: JSON.stringify({ x: p.lng, y: p.lat, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint', spatialRel: 'esriSpatialRelIntersects',
  });
  try {
    const r = await fetch(`${metadataLayerUrl}/${metaLayer(SAT_ZOOM)}/query?${q}`);
    const ms = (await r.json())?.features?.[0]?.attributes?.SRC_DATE2;
    return ms ? new Date(ms) : null;
  } catch { return null; }
}

/**
 * One Wayback release per year (the latest of each), oldest first, with the capture date where Esri's metadata has it.
 * Releases that turn out to hold the same photo are dropped. → [{ id, url, label, taken: Date|null, year }]
 */
export async function satelliteTimeline(p) {
  const config = await (await fetch(WAYBACK_CONFIG)).json();
  const byYear = new Map();
  for (const [id, r] of Object.entries(config)) {
    const released = new Date(r.itemTitle.match(/\d{4}-\d{2}-\d{2}/)?.[0]);
    if (Number.isNaN(+released)) continue;
    const y = released.getFullYear();
    if (!byYear.has(y) || byYear.get(y).released < released) byYear.set(y, { id, released, r });
  }
  const picks = [...byYear.values()].sort((a, b) => a.released - b.released);
  const taken = await Promise.all(picks.map(({ r }) => capturedAt(r.metadataLayerUrl, p)));
  const out = [];
  picks.forEach(({ id, released, r }, i) => {
    const t = taken[i];
    if (t && out.at(-1)?.taken && +out.at(-1).taken === +t) return; // same photo as the previous release
    out.push({
      id,
      url: r.itemURL.replace('{level}', '{z}').replace('{row}', '{y}').replace('{col}', '{x}'),
      taken: t,
      year: (t ?? released).getFullYear(),
      label: t ? `Taken ${monthYear(t)}` : `Esri set of ${monthYear(released)} · photo may be older`,
    });
  });
  return out;
}

/** Mapillary photos within ~60 m, one per year, oldest first. → [{ id, url, taken: Date, year }] */
export async function streetPhotos(p) {
  if (!hasMapillary) return [];
  const d = 0.0006;
  const q = new URLSearchParams({
    access_token: MAPILLARY_TOKEN, fields: 'id,captured_at,thumb_1024_url', limit: '200',
    bbox: [p.lng - d, p.lat - d, p.lng + d, p.lat + d].join(','),
  });
  const { data = [] } = await (await fetch(`https://graph.mapillary.com/images?${q}`)).json();
  const byYear = new Map();
  for (const img of data) {
    const taken = new Date(img.captured_at);
    const y = taken.getFullYear();
    if (!byYear.has(y)) byYear.set(y, { id: img.id, url: img.thumb_1024_url, taken, year: y });
  }
  return [...byYear.values()].sort((a, b) => a.taken - b.taken);
}

/** Latest Google Street View date here ("2023-03"), or null when there is no coverage / the call fails. */
export async function streetViewDate(p) {
  if (!hasGoogle) return null;
  try {
    const r = await (await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${p.lat},${p.lng}&key=${GOOGLE_KEY}`)).json();
    return r.status === 'OK' ? r.date : null;
  } catch { return null; }
}

export const streetViewImage = (p) =>
  `https://maps.googleapis.com/maps/api/streetview?size=640x320&location=${p.lat},${p.lng}&fov=80&return_error_code=true&key=${GOOGLE_KEY}`;

/** Opens Street View in the Maps app, where "See more dates" shows the older captures the API does not give us. */
export const streetViewLink = (p) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lng}`;

/** "14 years" → 14; "8 months" → 0; anything else → null. */
export function vintageYears(text) {
  const s = String(text ?? '');
  const y = s.match(/(\d+)\s*(year|yr|saal)/i);
  if (y) return +y[1];
  return /\d+\s*month/i.test(s) ? 0 : null;
}

export const SLACK_YEARS = 1; // photos are sparse: a shop opened late in a year can miss that year's only capture

/**
 * The officer's "first visible in" year against the claimed vintage.
 * seen: a year, 'never' (in no photo) or null. oldest: the oldest photo year on offer.
 * → { tone: clear | watch | flag, text } or null when there is nothing to compare.
 */
export function vintageCheck(seen, claimed, oldest, now = new Date()) {
  const years = vintageYears(claimed);
  if (seen == null || years == null) return null;
  const since = now.getFullYear() - years;
  if (seen === 'never') return { tone: 'flag', text: `Not seen in any photo — the form says trading since ${since}` };
  if (seen <= since + SLACK_YEARS) return { tone: 'clear', text: `Seen from ${seen} — fits trading since ${since}` };
  if (seen === oldest) return { tone: 'watch', text: `Already there in the oldest photo (${seen}); nothing older to check trading since ${since}` };
  return { tone: 'flag', text: `First seen in ${seen}, but the form says trading since ${since} — ask what was there before` };
}
