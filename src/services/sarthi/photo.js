// Photos the applicant takes mid-interview. Vision returns observations, never verdicts.
import { VISION_URL } from './agent';
import { visionFlag } from './photoCheck';

export const MAX_EDGE = 900;   // enough for a model to read a signboard
export const QUALITY = 0.62;   // keeps a photo near 60–90KB so several fit in localStorage

export const PHOTO_ASKS = {
  shop: {
    label: 'the shop',
    ask: 'Ab apni dukaan ki ek photo bhejiye — andar ka hissa, stock ke saath.',
    speech: 'अब अपनी दुकान की एक फोटो भेजिए। अंदर का हिस्सा, स्टॉक के साथ।',
    hint: 'Dukaan ki photo',
    frame: 'Dukaan ka andar ka hissa, stock ke saath',
  },
  home: {
    label: 'the home',
    ask: 'Aur ghar ke bahar ki ek photo bhejiye, jahan aap rehte hain.',
    speech: 'और घर के बाहर की एक फोटो भेजिए, जहाँ आप रहते हैं।',
    hint: 'Ghar ki photo',
    frame: 'Ghar ka bahar ka hissa, jahan aap rehte hain',
  },
  // Sent on the applicant's own initiative from the message box, not because Sarthi asked.
  extra: { label: 'an extra photo', ask: '', speech: '', hint: 'Photo', frame: 'Jo dikhana hai, uski photo lijiye' },
};

/** Shrink and re-encode in the browser, so a 4MB camera shot does not blow the storage quota. */
export function downscale(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', QUALITY));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

function prompt(kind, caseData) {
  const what = kind === 'shop'
    ? `a photograph the applicant submitted as their business premises. They say they run: ${caseData.business} (${caseData.businessName}) in ${caseData.area}.`
    : kind === 'home'
      ? `a photograph the applicant submitted as the outside of their home in ${caseData.area}.`
      : `a photograph the applicant chose to send during their loan interview. They say they run: ${caseData.business || 'a business'} in ${caseData.area || 'an area not yet stated'}.`;

  return `You are shown ${what}

Describe ONLY what is visible, in 1-2 sentences:
- What kind of place is this (shop, workshop, office, home, street, bare room, outdoors)?
- Any goods, stock, equipment, signage or shutter visible?
- Is anyone else present?
- Does what you see fit, or not fit, what they said they do?
- If it looks like a photo of a screen or a print, a screenshot, a stock photo or a computer-generated image, say so plainly.

Rules:
- Report only what is in the image. Never guess at income, wealth or character.
- If the image is too dark, blurred or close-cropped to tell, say exactly that.
- Do not say whether the loan should be approved.`;
}

// aiChecked: false when no proxy, so the report never implies the photo was read.
export async function analysePhoto({ dataUrl, kind, caseData, provenance = null }) {
  const at = new Date().toISOString();
  const base = { kind, at, label: PHOTO_ASKS[kind]?.label ?? kind, dataUrl, provenance };

  try {
    const res = await fetch(VISION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl.split(',')[1], prompt: prompt(kind, caseData) }),
    });
    if (!res.ok) throw new Error(`vision ${res.status}`);
    const data = await res.json();
    if (!data.observation) throw new Error('no observation');
    const observation = data.observation.trim();
    const flag = visionFlag(observation);
    const withFlag = flag && provenance ? { ...provenance, flags: [...provenance.flags, flag] } : provenance;
    return { ...base, provenance: withFlag, aiChecked: true, observation };
  } catch {
    return {
      ...base,
      aiChecked: false,
      observation: null,
      note: 'Photograph is on file but was not machine-read — no vision service was reachable. Officer should look at it.',
    };
  }
}
