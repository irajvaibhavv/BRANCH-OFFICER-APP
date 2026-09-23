/*
  SARTHI — photographs the applicant takes during the interview.

  Sarthi asks for the shop and the home while the phone is still in their hands, so the picture
  is taken there and then rather than sent later from anywhere. The image is shown back on screen
  immediately — they see exactly what the officer will see — and then described by Gemini Vision.

  What the AI returns is an observation, never a verdict. "Shutter and stock visible, consistent
  with a garment shop" is evidence the officer weighs; the file is not passed or failed by a photo.
*/
import { VISION_URL } from './sarthiAgent';

const MAX_EDGE = 900;   // enough for a model to read a signboard
const QUALITY = 0.62;   // keeps a photo near 60–90KB so several fit in localStorage

export const PHOTO_ASKS = {
  shop: {
    label: 'the shop',
    ask: 'Ab apni dukaan ki ek photo bhejiye — andar ka hissa, stock ke saath.',
    speech: 'अब अपनी दुकान की एक फोटो भेजिए। अंदर का हिस्सा, स्टॉक के साथ।',
    hint: 'Dukaan ki photo',
  },
  home: {
    label: 'the home',
    ask: 'Aur ghar ke bahar ki ek photo bhejiye, jahan aap rehte hain.',
    speech: 'और घर के बाहर की एक फोटो भेजिए, जहाँ आप रहते हैं।',
    hint: 'Ghar ki photo',
  },
  // Sent on the applicant's own initiative from the message box, not because Sarthi asked.
  extra: { label: 'an extra photo', ask: '', speech: '', hint: 'Photo' },
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

Rules:
- Report only what is in the image. Never guess at income, wealth or character.
- If the image is too dark, blurred or close-cropped to tell, say exactly that.
- Do not say whether the loan should be approved.`;
}

/**
 * Ask the vision model what it sees. Returns aiChecked:false when no proxy is reachable, so the
 * report can say the photo is on file but was never machine-read — rather than implying it was.
 */
export async function analysePhoto({ dataUrl, kind, caseData }) {
  const at = new Date().toISOString();
  const base = { kind, at, label: PHOTO_ASKS[kind]?.label ?? kind, dataUrl };

  try {
    const res = await fetch(VISION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl.split(',')[1], prompt: prompt(kind, caseData) }),
    });
    if (!res.ok) throw new Error(`vision ${res.status}`);
    const data = await res.json();
    if (!data.observation) throw new Error('no observation');
    return { ...base, aiChecked: true, observation: data.observation.trim() };
  } catch {
    return {
      ...base,
      aiChecked: false,
      observation: null,
      note: 'Photograph is on file but was not machine-read — no vision service was reachable. Officer should look at it.',
    };
  }
}
