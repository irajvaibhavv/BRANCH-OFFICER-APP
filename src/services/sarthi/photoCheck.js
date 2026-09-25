// Where a photo came from. Live-camera shots are trusted as taken now; uploads are checked in code
// (file date, EXIF camera data, editing software) and every doubt becomes a flag — never a rejection.

const GRACE_MS = 2 * 60 * 1000;
const EDITORS = /photoshop|lightroom|gimp|canva|picsart|snapseed|midjourney|dall|stable diffusion|firefly|imagen|generat/i;
const SCREEN_OR_GENERATED = /photo of a (screen|monitor|laptop|phone|tv|television|print)|screenshot|computer[- ]generated|ai[- ]generated|digitally (generated|rendered)|\brender(ing|ed)?\b|stock (photo|image)|watermark/i;

const when = (d) => d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Minimal JPEG EXIF reader: camera make/model, software, capture time, GPS presence.
async function readExif(file) {
  const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 10 <= v.byteLength) {
    const marker = v.getUint16(off);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null;
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
    off += 2 + v.getUint16(off + 2);
  }
  return null;
}

function parseTiff(v, start) {
  const little = v.getUint16(start) === 0x4949;
  const u16 = (o) => v.getUint16(o, little);
  const u32 = (o) => v.getUint32(o, little);
  const tags = {};
  const readIfd = (ifdOffset, wanted) => {
    const base = start + ifdOffset;
    if (base + 2 > v.byteLength) return;
    const count = u16(base);
    for (let i = 0; i < count; i += 1) {
      const e = base + 2 + i * 12;
      if (e + 12 > v.byteLength) break;
      const name = wanted[u16(e)];
      if (!name) continue;
      const type = u16(e + 2);
      const n = u32(e + 4);
      if (type === 2) {
        const at = n > 4 ? start + u32(e + 8) : e + 8;
        let s = '';
        for (let k = 0; k < n - 1 && at + k < v.byteLength; k += 1) s += String.fromCharCode(v.getUint8(at + k));
        tags[name] = s.replace(/\0/g, '').trim();
      } else if (type === 4) {
        tags[name] = u32(e + 8);
      }
    }
  };
  readIfd(u32(start + 4), { 0x010f: 'make', 0x0110: 'model', 0x0131: 'software', 0x0132: 'dateTime', 0x8769: 'exifIfd', 0x8825: 'gpsIfd' });
  if (tags.exifIfd) readIfd(tags.exifIfd, { 0x9003: 'dateTimeOriginal' });
  return tags;
}

// "2026:09:25 14:03:11" (device local time) → Date
function exifDate(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s ?? '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

export function liveProvenance(facing) {
  return {
    source: 'live_camera',
    facing,
    checks: [{ label: 'Source', pass: true, detail: 'Taken with the live camera during the interview' }],
    flags: [],
  };
}

export async function checkUpload(file, { startedAt } = {}) {
  const type = (file.type || '').toLowerCase();
  const isJpeg = /jpe?g/.test(type);
  const exif = isJpeg ? await readExif(file).catch(() => null) : null;
  const camera = [exif?.make, exif?.model].filter(Boolean).join(' ') || null;
  const takenAt = exifDate(exif?.dateTimeOriginal || exif?.dateTime);
  const modifiedAt = file.lastModified ? new Date(file.lastModified) : null;
  const beforeStart = (d) => !!(d && startedAt && d.getTime() < startedAt - GRACE_MS);

  const checks = [{ label: 'Source', pass: false, detail: 'Uploaded from a file, not the live camera' }];
  const flags = [{ severity: 'low', detail: 'Sent as a file, not taken with the live camera' }];

  if (/png|webp|gif/.test(type)) {
    flags.push({ severity: 'medium', detail: `Is a ${type.split('/')[1].toUpperCase()} file — phone cameras save JPEG or HEIC; screenshots, downloads and generated images usually do not` });
  }

  if (beforeStart(takenAt)) {
    flags.push({ severity: 'high', detail: `Camera data says it was taken on ${when(takenAt)}, before the interview started` });
  } else if (!takenAt && beforeStart(modifiedAt)) {
    flags.push({ severity: 'medium', detail: `The file is dated ${when(modifiedAt)}, before the interview started` });
  } else if (takenAt || modifiedAt) {
    checks.push({ label: 'Date', pass: true, detail: 'Dated during the interview' });
  }

  if (isJpeg && !camera) {
    flags.push({ severity: 'medium', detail: 'No camera make or model in the file — typical of screenshots, downloads, forwards and generated images' });
  } else if (camera) {
    checks.push({ label: 'Camera', pass: true, detail: `Taken on ${camera}` });
  }

  if (exif?.software && EDITORS.test(exif.software)) {
    flags.push({ severity: 'high', detail: `File metadata names "${exif.software}" — edited or generated` });
  }

  return {
    source: 'upload',
    checks,
    flags,
    camera,
    takenAt: takenAt?.toISOString() ?? null,
    fileDate: modifiedAt?.toISOString() ?? null,
    hasGps: !!exif?.gpsIfd,
  };
}

// A soft signal from the vision description; the officer still has to look.
export function visionFlag(observation) {
  if (!observation || !SCREEN_OR_GENERATED.test(observation)) return null;
  return { severity: 'medium', detail: 'The image reading suggests a photographed screen or print, or a generated image — look at it yourself' };
}
