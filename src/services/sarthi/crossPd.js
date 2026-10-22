// Same place, different applicant: a BO staging PDs in one friend's shop leaves the same spot behind every time, even
// though each live photo is new. Found in three steps — GPS within a few metres, the same name / GSTIN / UPI read off the
// photos, then the vision model shown both photos side by side. On this device every earlier PD is this BO's; in
// production the same comparison runs server-side per BO and against peers in the same area.
import { distanceM, inDistance } from './geo.js'; // extension so check:crosspd runs in plain node

export const SAME_PLACE_M = 40; // neighbouring shops in a market can be this close: a candidate, never a verdict alone
const MAX_ACCURACY_M = 60; // a rougher fix cannot tell two shops apart
const MAX_COMPARES = 3; // vision calls per PD
// Printed on every QR or bill book — sharing these means nothing.
const GENERIC = new Set(['paytm', 'phonepe', 'gpay', 'googlepay', 'bhim', 'upi', 'bharatpe', 'invoice', 'taxinvoice', 'cashmemo', 'estimate', 'bill', 'original', 'duplicate']);

const norm = (n) => String(n).toLowerCase().replace(/[^a-z0-9@]/g, '');

export function sharedNames(a = [], b = []) {
  const theirs = new Set(b.map(norm));
  return [...new Set(a.filter((n) => {
    const k = norm(n);
    return k.length >= 4 && !GENERIC.has(k) && theirs.has(k);
  }))];
}

const usable = (loc) => loc?.lat != null && (loc.accuracy ?? 0) <= MAX_ACCURACY_M;

/**
 * Earlier PDs whose photos were taken at this PD's spot or carry the same names. One entry per earlier PD, with the
 * closest pair (same kind preferred) for the vision comparison. `reports` are report records (photo metadata only).
 */
export function findLinks(photos, caseId, reports) {
  const byCase = new Map();
  for (const r of reports) {
    if (r.caseId === caseId) continue;
    for (const theirs of r.photos ?? []) {
      for (const mine of photos) {
        if (mine.skipped || theirs.skipped) continue;
        const d = usable(mine.location) && usable(theirs.location) ? distanceM(mine.location, theirs.location) : null;
        const near = d != null && d <= SAME_PLACE_M;
        const names = sharedNames(mine.names, theirs.names);
        if (!near && !names.length) continue;
        const link = byCase.get(r.caseId) ?? { otherCase: r.caseId, otherName: r.name, distance: null, names: [], pair: null };
        if (near && (link.distance == null || d < link.distance)) link.distance = d;
        link.names = [...new Set([...link.names, ...names])];
        const score = (mine.kind === theirs.kind ? 2 : 0) + (names.length ? 1 : 0);
        if (!link.pair || score > link.pair.score) link.pair = { score, mine, theirs, report: r.id };
        byCase.set(r.caseId, link);
      }
    }
  }
  return [...byCase.values()];
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

// The vision endpoint takes one image, so the two photos go side by side in one.
async function sideBySide(a, b, height = 420) {
  const [ia, ib] = await Promise.all([loadImage(a), loadImage(b)]);
  const wa = Math.round((ia.width / ia.height) * height);
  const wb = Math.round((ib.width / ib.height) * height);
  const canvas = document.createElement('canvas');
  canvas.width = wa + wb + 12;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, height);
  ctx.drawImage(ia, 0, 0, wa, height);
  ctx.drawImage(ib, wa + 12, 0, wb, height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

/** Two images side by side, one SAME / DIFFERENT / UNSURE question → { verdict, reason }; null when vision is down. */
export async function visionCompare(dataUrlA, dataUrlB, prompt, words = ['SAME', 'DIFFERENT', 'UNSURE']) {
  try {
    const { VISION_URL } = await import('./agent'); // lazy, so the pure matching runs in node (check:crosspd)
    const image = await sideBySide(dataUrlA, dataUrlB);
    const res = await fetch(VISION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: image.split(',')[1], prompt: `${prompt} Reply with exactly one word first: ${words.join(', ')}. Then one short sentence naming what matches or differs.` }),
    });
    if (!res.ok) return null;
    const text = String((await res.json()).observation ?? '').trim();
    const alt = words.join('|');
    const word = text.match(new RegExp(`\\b(${alt})\\b`, 'i'))?.[1]?.toLowerCase();
    return word ? { verdict: word, reason: text.replace(new RegExp(`^\\W*(${alt})\\W*`, 'i'), '').trim() } : null;
  } catch {
    return null;
  }
}

export const samePlace = (a, b) => visionCompare(a, b, 'The LEFT and RIGHT halves are two separate photographs sent by two DIFFERENT loan applicants.'
  + ' Are they of the same physical place — the same shop, counter, racks, wall, floor, door or house — even if the angle,'
  + ' light or stock differs? Judge the place only, never the people.');

const readJson = (key, fallback) => {
  try { return JSON.parse(window.localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

/** Runs the whole check for a finished PD: links, then at most MAX_COMPARES vision comparisons. */
export async function checkAgainstEarlierPds(photos, caseId) {
  const links = findLinks(photos, caseId, readJson('bo_sarthi_reports', []));
  await Promise.all(links.slice(0, MAX_COMPARES).map(async (link) => {
    const { mine, theirs } = link.pair;
    // Photos are kept per PD; reports from before repeat PDs kept them per case.
    const stored = [...readJson(`bo_sarthi_photos_${link.pair.report}`, []), ...readJson(`bo_sarthi_photos_${link.otherCase}`, [])].find((p) => p.at === theirs.at && p.kind === theirs.kind);
    if (mine.dataUrl && stored?.dataUrl) link.vision = await samePlace(mine.dataUrl, stored.dataUrl);
  }));
  return links.map(({ pair, ...l }) => ({ ...l, otherReport: pair.report, kind: pair.mine.kind, label: pair.mine.label, otherLabel: pair.theirs.label, otherAt: pair.theirs.at }));
}

/** Report flags: the same place or name on two applicants is high; GPS alone with the model saying "different" is low. */
export function crossPdFlags(links) {
  return links.map((l) => {
    const same = l.vision?.verdict === 'same';
    const different = l.vision?.verdict === 'different';
    const severity = same || l.names.length ? 'high' : different ? 'low' : 'medium';
    const where = l.distance != null ? `taken ${inDistance(l.distance)} from` : 'matches';
    const seen = [
      l.names.length ? `the same name on both: ${l.names.join(', ')}` : null,
      l.vision ? `AI comparing both photos: ${l.vision.verdict}${l.vision.reason ? ` — ${l.vision.reason}` : ''}` : null,
    ].filter(Boolean).join('; ');
    return {
      type: 'cross_pd',
      field: `photo_${l.kind}`,
      severity,
      detail: `Photo of ${l.label} ${where} ${l.otherName}'s ${l.otherLabel} (another applicant's PD)${seen ? ` — ${seen}` : ''}`
        + (different ? '. Likely a neighbouring place; check if they are related.' : '. The same place may have been shown for two applicants.'),
    };
  });
}

// ---- Names on THIS applicant's photos against their own file: a friend's shop carries the friend's name on the board,
// the QR, the bill book and the shop's papers. Words on every board that say nothing about whose it is are skipped.
const TRADE_WORDS = new Set(['store', 'stores', 'shop', 'general', 'kirana', 'traders', 'trading', 'enterprises', 'enterprise',
  'electricals', 'electrical', 'electronics', 'mart', 'centre', 'center', 'and', 'sons', 'company', 'pvt', 'ltd', 'the', 'new',
  'shri', 'sri', 'mobile', 'mobiles', 'garments', 'cafe', 'restaurant', 'hardware', 'medical', 'bhandar', 'agency', 'agencies']);
const nameWords = (s) => String(s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !TRADE_WORDS.has(w) && !GENERIC.has(w));
const GSTIN = /\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]/;
// Photos whose names should be the applicant's. A supplier's bill carries the supplier, so it is not one of them.
const OWN_KINDS = new Set(['shop', 'home', 'qr', 'records', 'records_back', 'shop_document', 'utility_bill']);

/** One entry per own-kind photo that had names read off it: which matched the file, which GSTIN, and the verdict. */
export function fileNameCheck(photos, caseData) {
  const own = new Set([caseData?.name, caseData?.businessName, caseData?.brief?.kyc?.nameOnPan].flatMap(nameWords));
  const fileGstin = caseData?.brief?.gstin ?? null;
  const pan = caseData?.brief?.kyc?.pan ?? null;
  return photos.filter((p) => !p.skipped && p.names?.length && OWN_KINDS.has(p.kind)).map((p) => {
    const gstins = p.names.map((n) => n.toUpperCase().replace(/\s/g, '').match(GSTIN)?.[0]).filter(Boolean);
    const read = p.names.filter((n) => !GSTIN.test(n.toUpperCase().replace(/\s/g, '')) && nameWords(n).length);
    const matched = read.filter((n) => nameWords(n).some((w) => own.has(w)));
    // A proprietor's GSTIN carries their PAN (characters 3-12); a firm's carries the firm's.
    const gstin = !gstins.length ? null
      : fileGstin ? (gstins.includes(fileGstin) ? 'match' : 'mismatch')
        : pan ? (gstins.some((g) => g.slice(2, 12) === pan) ? 'match' : 'not_on_file') : 'not_on_file';
    return { kind: p.kind, label: p.label, at: p.at, read, matched, gstins, gstin, verdict: read.length ? (matched.length ? 'match' : 'none') : null };
  });
}

/** Report flags from fileNameCheck. A bare shop photo may show only a brand board, so its miss is low. */
export function nameFlags(checks, caseData) {
  const onFile = [caseData?.businessName, caseData?.name].filter(Boolean).join(' / ');
  return checks.flatMap((ch) => [
    ch.gstin === 'mismatch' && { type: 'name_match', field: `photo_${ch.kind}`, severity: 'high', detail: `GSTIN read on ${ch.label} (${ch.gstins.join(', ')}) is not the GSTIN on file (${caseData.brief.gstin})` },
    ch.gstin === 'not_on_file' && { type: 'name_match', field: `photo_${ch.kind}`, severity: 'low', detail: `GSTIN ${ch.gstins.join(', ')} read on ${ch.label}; none on file to match — check it on the GST portal` },
    ch.verdict === 'none' && {
      type: 'name_match', field: `photo_${ch.kind}`, severity: ch.kind === 'shop' || ch.kind === 'home' ? 'low' : 'medium',
      detail: `Photo of ${ch.label} shows "${ch.read.join('", "')}" — not the applicant's name or business name on file (${onFile}). Ask whose it is; it may be a relative's or a friend's`,
    },
  ].filter(Boolean));
}

/** The line Sarthi says on the call when a photo carries someone else's name. */
export function nameRecheck(ch) {
  const whose = ch.kind === 'home' || ch.kind === 'utility_bill' ? 'Yeh ghar kiske naam pe hai?' : 'Dukaan kiske naam pe hai — aapke ya kisi aur ke?';
  return `Photo mein "${ch.read[0]}" likha dikh raha hai — yeh naam kiska hai? ${whose}`;
}
