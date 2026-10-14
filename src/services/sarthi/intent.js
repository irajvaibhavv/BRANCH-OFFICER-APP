// What a spoken answer MEANS — answered, vague, refused, wants to stop, asked something back… — read by the model each
// turn, so any wording in Hindi, Hinglish or English is understood without a pattern per phrase. The code then decides
// what to do with it (the controller rule: the model reads, the program decides). The patterns below are only the
// fallback for when the model cannot be reached in time.
import { askAgent } from './agent';
import { speakerIsSomeoneElse } from './idChecks';

export const INTENTS = ['answered', 'vague', 'refused', 'stop', 'question', 'upset', 'someone_else'];

const SYSTEM = `You classify ONE reply on a phone call. A loan company's AI assistant asked a question; the person answered.
Reply with ONLY a JSON object: {"intent": "...", "gist": "..."}
intent — exactly one of:
- "answered": they gave an answer, even short, rough, a range, "pata nahi" or "yaad nahi" (not knowing IS an answer)
- "vague": they replied but said nothing usable ("haan", "theek hai", "sab normal", "dekhte hain")
- "refused": they will not answer THIS question ("nahi bataunga", "kyun bataun", "private hai", "skip karo") but are still on the call
- "stop": they do not want the call at all, or want to end or postpone it ("baat nahi karni", "busy hoon", "baad mein", "band karo")
- "question": they asked something back instead of answering ("aap kaun?", "kyun pooch rahe ho?", "kitna time lagega?")
- "upset": they are annoyed, complaining or pushing ("officer ko bulao", "payment kab aayega", "faltu sawal") without answering
- "someone_else": the speaker says they are not the person being called (a relative, staff), or that person is not there
gist — under 12 words, in English: what they said or asked, for the next line to respond to.
Judge the meaning, not keywords: "nahi, koi sub-agent nahi hai" is "answered"; "baad mein bataunga" is "refused".`;

// ---- fallback patterns, used only when the model call fails or is late ----
// "Nahi bataunga", "kyun bataun", "private hai" — a refusal of this question.
const REFUSE = /nahi\s+(bataunga|bataungi|batayenge|batana|bata\s*(sakta|sakti|sakte|paunga|paungi))|nahi\s+batana|kyu[nm]?\s+bata(u|un|oon|en|yen)|aapko\s+kya|aap\s+kyu[nm]?\s+pooch|private|personal\s+(hai|baat)|not\s+(telling|going\s+to\s+tell)|won'?t\s+tell|no\s+comment|skip|chhod\s*(o|do|iye|dijiye)|next\s+(question|sawal|pucho)|नहीं\s*बता|क्यों\s*बता|प्राइवेट/i;
// "Mujhe baat nahi karni", "abhi nahi", "busy hoon" — no call at all.
const STOP = /baat\s+nah(i|in)\s+kar(ni|na|enge|unga|ungi)|nah(i|in)\s+karni\s+baat|mujhe\s+nah(i|in)\s+karn[ai]|band\s+kar(o|do|iye)|mat\s+kar(o|iye)|disturb|pareshan|time\s+nah(i|in)|busy\s+(hoon|hu|hun|hai)|abhi\s+nah(i|in)|baad\s+mein\s+(baat|call|karo|karna)|बात\s*नहीं\s*करनी|अभी\s*नहीं/i;
const ASKED = /\?\s*$|^(aap|tum)\s+kaun|kyu[nm]?\s+(pooch|puch)|kitna\s+(time|samay)|kis\s+(bank|company)/i;
const UPSET = /officer\s+ko\s+bulao|faltu|bakwas|payment\s+kab|kab\s+milega|jaldi\s+karo/i;
const VAGUE = /^(haan|ha|haanji|ji|ok|okay|theek|thik|normal|sab\s+theek|dekhte|dekhenge|chalta\s+hai)\b[\s.!]*$/i;

/** The fallback: a best guess from the words alone. */
export function guessIntent(text, name = '') {
  const t = String(text).trim();
  if (STOP.test(t)) return 'stop';
  if (REFUSE.test(t)) return 'refused';
  if (name && speakerIsSomeoneElse(t, name)) return 'someone_else';
  if (UPSET.test(t)) return 'upset';
  if (ASKED.test(t)) return 'question';
  if (VAGUE.test(t)) return 'vague';
  return 'answered';
}

// Knob: the longest an answer waits on the reading before the code goes on with the fallback guess.
const BUDGET_MS = Number(import.meta.env.VITE_SARTHI_INTENT_MS) || 2500;

/** { intent, gist, source: 'model' | 'guess' } for one reply to `question`. Never throws. */
export async function readIntent({ question, answer, name = '' }) {
  const guess = { intent: guessIntent(answer, name), gist: String(answer).slice(0, 80), source: 'guess' };
  try {
    const raw = await Promise.race([
      askAgent({
        systemPrompt: SYSTEM,
        messages: [{ role: 'user', content: `Person being called: ${name || 'the applicant'}\nQuestion asked: "${question}"\nTheir reply: "${answer}"` }],
        maxTokens: 60, temperature: 0, retries: 0,
      }),
      new Promise((_, fail) => { setTimeout(() => fail(new Error(`over ${BUDGET_MS}ms`)), BUDGET_MS); }),
    ]);
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    if (!INTENTS.includes(j.intent)) throw new Error(`unknown intent ${j.intent}`);
    return { intent: j.intent, gist: String(j.gist ?? '').slice(0, 120), source: 'model' };
  } catch (e) {
    console.warn(`[sarthi] intent read failed (${e?.message}) — guessed "${guess.intent}"`);
    return guess;
  }
}

/**
 * The line put in front of THIS TURN's directive when the last reply was not an answer, so the next question first
 * responds to them like a person. `n` = which refusal this is for the field (1 = ask softer, 2 = accept and move on).
 */
export function replyPrefix({ intent, text, gist, n = 1 }) {
  if (intent === 'refused' && n > 1) {
    return `They declined that again ("${text}") — accept it warmly in a few words ("koi baat nahi", vary it) and move on. Then: `;
  }
  if (intent === 'refused') {
    return `They did not want to answer that ("${text}"). Acknowledge it without pressure, say in ONE line why the branch asks`
      + ' (so the loan is judged fairly — never a threat), and offer an easier way: a rough figure, a range, or haan/nahi. Then: ';
  }
  return `They did not answer — they ${intent === 'question' ? 'asked you something' : 'pushed back'}: "${text}" (${gist}). Respond to`
    + ' that first, like a person on a phone call, in one or two short lines — using only what you know: you are Sarthi from the'
    + ' branch, doing their loan discussion (PD), about 15-20 minutes, and the officer follows up on anything they raise. Never'
    + ' invent a fact, a rate, a policy or a date. Then: ';
}
