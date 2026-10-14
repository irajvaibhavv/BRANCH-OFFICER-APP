// Sarthi's DSA review call. Same split as the PD: code picks the topic and does the hisaab against the DSA's own
// numbers, Claude only phrases the question. Numbers are read in code (hindiNumbers), so there is no extraction call.
import { askAgent } from './agent';
import { genderRule, SPOKEN_STYLE } from './voice';
import { readNumber, readNumbers } from './hindiNumbers';
import { commissionFor, productMix } from '../../utils/commission';

const FENCE = '```';

/** What the branch already knows about this DSA — the "bank statement" of a DSA review. */
export function dsaFile(dsa, { loanFiles = [], engagements = [] } = {}) {
  const monthly = dsa.monthly ?? [];
  const avg = monthly.length ? +(monthly.reduce((a, b) => a + b, 0) / monthly.length).toFixed(1) : null;
  const mix = productMix(dsa);
  const pay = commissionFor(dsa);
  const files = loanFiles.filter((f) => f.dsaId === dsa.id).map((f) => ({
    borrower: f.borrower, product: f.product, amount: f.amount, status: f.status,
    pendingDocs: (f.docs ?? []).filter(([, s]) => s !== 'done').map(([d]) => d),
  }));
  return {
    name: dsa.name, firm: dsa.firm, location: dsa.location, quality: dsa.quality,
    filesSubmitted: dsa.filesSubmitted, approvalRate: dsa.approvalRate, disbursed: dsa.disbursed,
    filesPerMonthLast6: monthly, avgFilesPerMonth: avg, bestMonth: monthly.length ? Math.max(...monthly) : null,
    topProduct: [...mix].sort((a, b) => b.files - a.files)[0]?.product,
    productMix: mix.map((m) => `${m.product} ${m.files} files`),
    commission: { paidThisYear: pay.paidFY, thisMonth: pay.thisMonth, pending: pay.pending, slab: pay.slab },
    files,
    stuck: files.filter((f) => f.pendingDocs.length && !['disbursed', 'rejected'].includes(f.status)),
    rejected: files.filter((f) => f.status === 'rejected').map((f) => f.borrower),
    meetings: engagements.filter((e) => e.dsaId === dsa.id).length,
    lastVisit: dsa.lastVisit,
  };
}

// `num` topics are read as a number in code and rechecked; `noProbe` topics accept a plain yes/no.
export const DSA_TOPICS = [
  { id: 'name', section: 'Identity', noProbe: true, goal: 'Who is speaking: their own name and their firm name. Ask openly — never "aap Priya ji hain na?"', ask: 'Aapka poora naam aur firm ka naam bataiye?' , speech: 'आपका पूरा नाम और फ़र्म का नाम बताइए?' },
  { id: 'office', section: 'Identity', goal: 'Where their office is, and how many years they have done loan work', ask: 'Aapka office kahan hai, aur ye kaam kitne saal se kar rahe hain?' , speech: 'आपका ऑफ़िस कहाँ है, और ये काम कितने साल से कर रहे हैं?' },
  { id: 'team', section: 'Identity', goal: 'How many people work with them, and whether sub-agents or freelancers bring them files', ask: 'Aapke saath kitne log kaam karte hain? Koi sub-agent bhi hain?' , speech: 'आपके साथ कितने लोग काम करते हैं? कोई सब-एजेंट भी हैं?' },
  { id: 'lenders', section: 'Identity', goal: 'Which other banks or NBFCs they also send files to', ask: 'Humare alawa aur kin banks ya NBFC ke saath kaam karte hain?' , speech: 'हमारे अलावा और किन बैंक या एन बी एफ सी के साथ काम करते हैं?' },
  { id: 'sourcing', section: 'Where customers come from', goal: 'How customers reach them: walk-in, references, builders, CAs, online leads, sub-agents', ask: 'Customer aapke paas zyada kaise aate hain?' , speech: 'कस्टमर आपके पास ज़्यादा कैसे आते हैं?' },
  { id: 'recent', section: 'Where customers come from', goal: 'Names and the business of two or three customers they brought last month — do they know their own customers?', ask: 'Pichhle mahine ke do-teen customers ke naam aur unka kaam bataiye?' , speech: 'पिछले महीने के दो-तीन कस्टमर के नाम और उनका काम बताइए?' },
  { id: 'charges', section: 'Where customers come from', noProbe: true, goal: 'Whether they take any fee or charge from customers. Ask casually, as a routine question.', ask: 'Customer se aap koi fees ya charge lete hain?' , speech: 'कस्टमर से आप कोई फ़ीस या चार्ज लेते हैं?' },
  { id: 'docs', section: 'File quality', goal: 'Who collects documents, and who prepares bank statements, ITR or financials for the customer', ask: 'Customer ke documents kaun ikattha karta hai — aap ya customer khud?' , speech: 'कस्टमर के डॉक्यूमेंट कौन इकट्ठा करता है, आप या कस्टमर ख़ुद?' },
  { id: 'files_total', section: 'Numbers', num: true, goal: 'How many files they log in a month in total, across all lenders', ask: 'Sab lenders mila ke mahine mein kitni files login karte hain?' , speech: 'सब लेंडर मिला के महीने में कितनी फ़ाइलें लॉगिन करते हैं?' },
  { id: 'files_us', section: 'Numbers', num: true, goal: 'How many of those files come to us each month', ask: 'Unmein se humein mahine mein kitni files dete hain?' , speech: 'उनमें से हमें महीने में कितनी फ़ाइलें देते हैं?' },
  { id: 'approval', section: 'Numbers', num: true, goal: 'What approval rate they think they get with us, out of 100', ask: 'Aapke hisaab se humare yahan sau mein se kitni files approve hoti hain?' , speech: 'आपके हिसाब से हमारे यहाँ सौ में से कितनी फ़ाइलें अप्रूव होती हैं?' },
  { id: 'rejections', section: 'File quality', stuck: true, goal: 'The main reason their files get stuck or rejected with us', ask: 'Aapki files zyada kis wajah se atakti ya reject hoti hain?' , speech: 'आपकी फ़ाइलें ज़्यादा किस वजह से अटकती या रिजेक्ट होती हैं?' },
  { id: 'product', section: 'Numbers', goal: 'Which loan most of their business with us is: home loan, LAP, business loan or MSME', ask: 'Humare saath sabse zyada kaunsa loan karte hain?' , speech: 'हमारे साथ सबसे ज़्यादा कौन सा लोन करते हैं?' },
  { id: 'commission', section: 'Numbers', num: true, goal: 'How much commission from us is pending right now, in rupees', ask: 'Abhi humari taraf se aapka kitna commission baaki hai?' , speech: 'अभी हमारी तरफ़ से आपका कितना कमीशन बाक़ी है?' },
  { id: 'service', section: 'Working with us', goal: 'The biggest problem working with us: turnaround time, officer response, rejections, payouts', ask: 'Humare saath kaam mein sabse badi dikkat kya aati hai?' , speech: 'हमारे साथ काम में सबसे बड़ी दिक़्क़त क्या आती है?' },
  { id: 'competition', section: 'Working with us', goal: 'What other lenders give them that we do not: payout, speed, policy', ask: 'Doosre lender aisa kya dete hain jo hum nahi dete?' , speech: 'दूसरे लेंडर ऐसा क्या देते हैं जो हम नहीं देते?' },
  { id: 'forecast', section: 'Plan ahead', num: true, goal: 'How many files they can give us in the next three months', ask: 'Agle teen mahine mein humein kitni files de sakte hain?' , speech: 'अगले तीन महीने में हमें कितनी फ़ाइलें दे सकते हैं?' },
  { id: 'growth', section: 'Plan ahead', goal: 'Any new area, segment or loan type they want to start — and how they will get customers there', ask: 'Koi naya area ya naya kaam shuru karne ka plan hai?' , speech: 'कोई नया एरिया या नया काम शुरू करने का प्लान है?' },
  { id: 'support', section: 'Plan ahead', goal: 'What support they need from us: training, faster sanction, marketing material, payouts', ask: 'Humse kis cheez mein madad chahiye?' , speech: 'हमसे किस चीज़ में मदद चाहिए?' },
  { id: 'conduct', section: 'Compliance', noProbe: true, goal: 'Whether any lender ever suspended or closed their DSA code, and why. Gently, as a routine record question.', ask: 'Kabhi kisi lender ne aapka code band kiya tha? Bas record ke liye pooch rahe hain.' , speech: 'कभी किसी लेंडर ने आपका कोड बंद किया था? बस रिकॉर्ड के लिए पूछ रहे हैं।' },
];

// "sau mein se assi" and "teen mahine mein sau files" carry a frame number first; readNumber takes the first one.
// "ek baar", "ek minute" are not figures; a range "70-80 hazaar" is its lower figure with the scale.
const FRAME = /\b(sau|100|hundred)\s+(mein|me|main|men)\s+se\b|\b(ek|do|teen|chaar|char|chhe|chhah|\d{1,2})\s+(mahine|mahino|mahina|months?)\b|\bek\s+(baar|minute|min|second|din|cheez|baat)\b/gi;
/** The figure that answers a `num` topic. */
export const readFigure = (text) => readNumber(String(text).replace(FRAME, ' ').replace(/(\d+)\s*(?:-|se|to)\s*\d+/gi, '$1'));

/**
 * The figure that answers a `num` topic, from a long spoken answer ("ek-do NBFC… 25 files" — the parser alone takes 1).
 * Haiku picks which number answers the question; code accepts it only if it is one the DSA actually said
 * (or that figure in thousands/lakhs), so a model misread can never become a recheck. No model → `readFigure`.
 */
export async function figureFrom(topic, text) {
  const said = readNumbers(String(text).replace(/(\d+)\s*(?:-|se|to)\s*\d+/gi, '$1')).map((n) => n.value);
  if (!said.length) return null;
  if (said.length === 1) return said[0]; // nothing to choose between — no model call, no wait
    const raw = await askAgent({
  try {
      systemPrompt: 'A loan agent answered a question on a call. Reply with ONLY the number that answers the question, as digits (rupees in full, e.g. 50000; a range → its lower end), or "none" if their answer gives no such number.',
      messages: [{ role: 'user', content: `Question: ${topic.goal}\nAnswer: ${text}` }],
      maxTokens: 12, temperature: 0, retries: 0,
    });
    const v = Number(raw.replace(/[^\d.]/g, ''));
    if (/none/i.test(raw) || !v) return null;
    return said.some((n) => n === v || n * 1000 === v || n * 100000 === v) ? v : null;
  } catch {
    return said.length === 1 ? said[0] : readFigure(text);
  }
}

const VAGUE = /^(haan|ha|nahi|no|yes|ok|theek|thik|normal|pata nahi|yaad nahi|sab|kuch|chalta hai|dekhte hain|dekhenge)\b/i;
/** One follow-up per topic when the answer gives nothing to hold on to. */
export function needsProbe(topic, text, figure) {
  if (topic.noProbe) return false;
  // Any number said counts as an answer — a follow-up asking "rough number?" after one is just irritating.
  if (topic.num) return figure == null && readFigure(text) == null;
  const words = text.trim().split(/\s+/).length;
  // "Haan haan, Hadapsar mein office hai…" is an answer; only a short one that opens vague is not.
  return words < 4 || (words < 8 && VAGUE.test(text.trim()));
}

const LATIN = /[a-z]/i;
export const DEVANAGARI = /[ऀ-ॿ]/;
// "AD Capital Advisors" minus the person's own name and filler — the words that say the firm, not the DSA.
const firmOnlyWords = (file) => {
  const own = file.name.toLowerCase().split(/\s+/);
  return String(file.firm ?? '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 2 && !own.includes(w) && !['and', 'the', 'co', 'pvt', 'ltd'].includes(w));
};
/** The name answer with the firm's words taken out, so "Anita, AD Capital" is not read as "Anita AD" (a clash). */
export const nameOnly = (text, file) => firmOnlyWords(file).reduce((t, w) => t.replace(new RegExp(`\\b${w}\\w*`, 'gi'), ' '), String(text));

const PRODUCT_WORDS = { 'Home Loan': /home|ghar|housing|होम/i, LAP: /lap|property|prop|प्रॉपर्टी/i, 'Business Loan': /business|bl\b|बिज़नेस/i, 'MSME WC': /msme|working|wc\b|capital/i };

const fmt = (n) => (n >= 100000 ? `${+(n / 100000).toFixed(1)} lakh` : n >= 1000 ? `${Math.round(n / 1000)} hazaar` : String(n));
/** The hisaab done on the call: a stated figure against the branch's record. Returns detail lines for the directive. */
export function rechecksFor(topic, text, file, nums) {
  const v = nums[topic.id];
  const out = [];
  // Words only: speech recognition's Devanagari cannot be compared with the record's Latin names.
  const said = LATIN.test(text) ? text.toLowerCase() : null;
  const firmWords = firmOnlyWords(file);
  if (topic.id === 'name' && said && firmWords.length && !firmWords.some((w) => said.includes(w.slice(0, 5)))) {
    out.push(`Our record has their firm as "${file.firm}". They did not name it — ask kindly whether they still work under ${file.firm}, or under another name now.`);
  }
  const locality = file.location?.split(',')[0].trim();
  if (topic.id === 'office' && said && locality && !said.includes(locality.toLowerCase().slice(0, 5))) {
    out.push(`They placed their office as "${text.slice(0, 60)}"; our record has it in ${file.location}. Ask kindly whether they moved, or have a second office.`);
  }
  if (topic.id === 'files_us' && v != null && file.avgFilesPerMonth) {
      out.push(`They said ${v} files a month come to us; our record shows about ${Math.round(file.avgFilesPerMonth)} files a month from them (their 6-month average; best month ${file.bestMonth}). Ask where the difference is.`);
    if (v > file.avgFilesPerMonth * 1.5 || v < file.avgFilesPerMonth * 0.6) {
    }
    if (nums.files_total && v / nums.files_total < 0.3) {
      out.push(`They log ${nums.files_total} files a month but give us only ${v}. Ask kindly why most go to other lenders.`);
    }
  }
  if (topic.id === 'approval' && v != null && Math.abs(v - file.approvalRate) > 15) {
    out.push(`They think ${v} of 100 files get approved with us; our record says ${file.approvalRate}%. Ask what they are counting.`);
  }
  // Only when they named some other product — "haan" is not a mismatch.
  const named = Object.values(PRODUCT_WORDS).some((re) => re.test(text));
  if (topic.id === 'product' && file.topProduct && named && !PRODUCT_WORDS[file.topProduct]?.test(text)) {
    out.push(`They said most of their business with us is "${text.slice(0, 60)}"; our record says ${file.topProduct} (${file.productMix.join(', ')}). Ask about it.`);
  }
  if (topic.id === 'commission' && v != null && file.commission.pending && Math.abs(v - file.commission.pending) > Math.max(5000, file.commission.pending * 0.4)) {
    out.push(`They say Rs ${fmt(v)} commission is pending; our record shows about Rs ${fmt(file.commission.pending)} pending. Ask which payouts they are counting — the officer will reconcile.`);
  }
  if (topic.id === 'forecast' && v != null && file.avgFilesPerMonth && v > file.avgFilesPerMonth * 3 * 1.6) {
    out.push(`They promise ${v} files in 3 months; our record shows about ${Math.round(file.avgFilesPerMonth)} a month from them, so about ${Math.round(file.avgFilesPerMonth * 3)} in three months (best month ${file.bestMonth}). Ask what will bring the jump.`);
  }
  if (topic.id === 'recent' && file.files.length) {
    const said = text.toLowerCase();
    const known = file.files.filter((f) => f.borrower.toLowerCase().split(/\s+/).some((w) => w.length > 3 && said.includes(w)));
    if (!known.length) out.push(`None of the names they gave is in their files with us. Our files from them include ${file.files.slice(0, 2).map((f) => f.borrower).join(' and ')}. Ask about one of these: what the customer does and how they came to them.`);
  }
  return out;
}

export function interviewerPrompt(file, directive) {
  return `You are Sarthi, an AI from the branch, on a video call reviewing the work of a DSA (a loan agent who brings loan files to the branch).
${genderRule()} You sound like a warm relationship manager who knows their numbers — respectful, curious, never an auditor.

## Rules
- Hinglish, everyday words. One short question at a time, ideally under 18 words.
- Start with a few words reacting to their last answer when it is natural ("Achha, 8 saal ka kaam hai"), then ask. Vary how you begin.
- Never accuse, never say an answer is wrong. The only place you mention a mismatch is a FRIENDLY RECHECK from THIS TURN:
  say both figures plainly and kindly, assume they rounded or forgot, and let them explain.
- Never promise payouts, approvals or policy changes — "officer aapse baat karenge".
- Never name any bank, NBFC or brand as the one you work for; you are "branch se". Lenders they name may be repeated back.
- **Ask ONLY what THIS TURN asks.** A program decides every question and every follow-up; do not chase anything else they said,
  do not add a second question, do not jump ahead. If they already answered THIS TURN's topic in passing, confirm it briefly in the question.
- You know nothing about their files or numbers beyond what THIS TURN gives you. Never invent a figure.
- "Pata nahi" is a valid answer — thank them and move on.
- Never say "aakhri" (sawal, baat, cheez) or "last question" — you do not know how many are left.
- If they push ("officer ko bulao", "status batao", "jaldi karo"), say in a few words that the officer will call them, then ask THIS TURN's
  question anyway. Never ask for their phone number (the branch has it), never say goodbye — the program ends the call.

## Output — exactly this order, nothing else
1. A speech fence FIRST (${FENCE}speech, the line, ${FENCE} — see the example): the same message fully in Devanagari, never Latin script. A Hindi voice reads it; Latin words come out in an English accent. — English words and names too (file → फ़ाइल, commission → कमीशन, LAP → एल ए पी). Digits may stay.
2. Then the same message in Hinglish (Latin script), on its own.
${SPOKEN_STYLE}

${FENCE}speech
अच्छा, आठ साल का काम है। आपके साथ कितने लोग काम करते हैं?
${FENCE}
Achha, 8 saal ka kaam hai. Aapke saath kitne log kaam karte hain?

You are speaking with ${file.name}${file.firm ? ` of ${file.firm}` : ''}.

## THIS TURN
${directive}`;
}

/** History for Claude with THIS TURN repeated at the end of the DSA's last message — from the system prompt alone, a pushy DSA
 * pulled Haiku off the topic (it started asking for their phone number and said goodbye mid-review). */
export function turnMessages(history, directive) {
  const last = history.at(-1);
  if (last?.role !== 'user') return history;
  return [...history.slice(0, -1), { role: 'user', content: `${last.content}\n\n[Program → Sarthi, THIS TURN: ${directive.replace(/\n/g, ' ')}]` }];
}

/** The goodbye is fixed text: asked to close, the model kept adding one more question. */
export function closingLine(file) {
  const first = file.name.split(' ')[0];
  return {
    text: `Bahut shukriya ${first} ji, aapke time ke liye. Jo baatein aapne batayi, officer aapse unpar jaldi baat karenge. Namaste!`,
    speech: 'बहुत शुक्रिया, आपके समय के लिए। जो बातें आपने बताईं, ऑफ़िसर आपसे उन पर जल्दी बात करेंगे। नमस्ते!',
  };
}

/**
 * The model left out the Devanagari speech fence: one small call turns the caption into Devanagari, because the Hindi
 * voice reads romanized Hindi in an English accent. null when that fails too — the caller then says the topic's own line.
 */
export async function toDevanagari(text) {
  try {
    const raw = await askAgent({
      systemPrompt: 'Rewrite the Hinglish line in Devanagari script, English words and names too (file → फ़ाइल). Same words, same meaning. Reply with ONLY the Devanagari line.',
      messages: [{ role: 'user', content: text }], maxTokens: 300, temperature: 0, retries: 0,
    });
    const line = raw.replace(/```\w*/g, '').trim();
    return DEVANAGARI.test(line) ? line : null;
  } catch {
    return null;
  }
}

/** Fixed lines for when someone other than the DSA on file answers — decided in code, like the PD's presence check. */
/** "Priya ji bahar gayi hain" — the DSA, named in the third person, is not there. "Main Priya, bahar hoon" is her talking. */
export function dsaAway(text, name) {
  const s = String(text).toLowerCase();
  const first = name.split(' ')[0].toLowerCase();
  if (/\b(main|mai|mera naam|i am|i'm)\b/.test(s)) return false; // not "mein": that is "in" as often as "I"
  return new RegExp(`\\b${first}\\b(\\s+\\S+){0,3}?\\s+(bahar|baahar|nahi|nahin|gayi|gaye|gai|busy|out|not)\\b`).test(s);
}

export function presenceLines(file) {
  const first = file.name.split(' ')[0];
  const full = file.name;
  return {
    confirm: { text: `Achha. Yeh review ${full} ji ke saath hai. Kya aap ${full} ji hi hain?`, speech: `अच्छा। यह रिव्यू ${full} जी के साथ है। क्या आप ${full} जी ही हैं?` },
    confirmAgain: { text: `Maaf kijiye, samajh nahi paaya. Kya aap khud ${full} ji hain — haan ya nahi?`, speech: `माफ़ कीजिए, समझ नहीं पाया। क्या आप ख़ुद ${full} जी हैं? हाँ या नहीं?` },
    relation: { text: `Yeh review ${full} ji ke kaam ka hai. Aap unke kya lagte hain, aur ${first} ji abhi kahan hain?`, speech: `यह रिव्यू ${full} जी के काम का है। आप उनके क्या लगते हैं, और ${first} जी अभी कहाँ हैं?` },
    call: { text: `Achha, dhanyawaad. Review ${first} ji se hi karna hai. Kya aap unhe abhi bula sakte hain?`, speech: `अच्छा, धन्यवाद। रिव्यू ${first} जी से ही करना है। क्या आप उन्हें अभी बुला सकते हैं?` },
    handover: { text: `Bahut achha. Phone ${first} ji ko de dijiye. ${first} ji, namaste! Apna poora naam aur firm ka naam bataiye?`, speech: `बहुत अच्छा। फ़ोन ${first} जी को दे दीजिए। ${first} जी, नमस्ते! अपना पूरा नाम और फ़र्म का नाम बताइए?` },
    later: { text: `Koi baat nahi! Jab ${first} ji free hon, tab hum unse aaram se baat kar lenge. Aapka bahut shukriya — unhe hamari taraf se namaste kahiyega!`, speech: `कोई बात नहीं! जब ${first} जी फ़्री हों, तब हम उनसे आराम से बात कर लेंगे। आपका बहुत शुक्रिया। उन्हें हमारी तरफ़ से नमस्ते कहिएगा!` },
  };
}

// Fixed, like the closing: said the moment the call opens, with no model call to wait on.
  return {
export function openingLine() {
    text: 'Namaste! Main Sarthi, branch se — aapke kaam ka chhota sa review hai, 10-15 minute lagenge. Pehle aapka poora naam aur firm ka naam bataiye?',
    speech: 'नमस्ते! मैं सारथी, ब्रांच से। आपके काम का छोटा सा रिव्यू है, दस-पंद्रह मिनट लगेंगे। पहले आपका पूरा नाम और फ़र्म का नाम बताइए?',
  };
}

/** THIS TURN for an action: { kind: topic | probe | recheck, topic, detail, text }. */
export function directiveFor(action, file) {
  if (action.kind === 'recheck') return `FRIENDLY RECHECK. ${action.detail}\nSay both figures kindly, like doing the hisaab together, and ask them to explain. One question. These two figures are the only numbers you may say.`;
  if (action.kind === 'probe') return `FOLLOW UP on "${action.topic.goal}". Their answer was: "${action.text}". It gave nothing concrete — ask ONE specific follow-up on this same topic to get a name, a number or an example.${action.topic.num ? ' They must give a number; ask for a rough one.' : ''}`;
  const t = action.topic;
  const stuck = t.stuck && file.stuck.length
    ? `\nOur record: ${file.stuck.map((f) => `${f.borrower} (${f.stage}, pending: ${f.pendingDocs.join(', ')})`).join('; ')}${file.rejected.length ? `; rejected: ${file.rejected.join(', ')}` : ''}. Name one of these files and ask what is holding it.`
    : '';
  return `Ask about exactly this, and nothing else: ${t.goal}\nPlain example: "${t.ask}"${stuck}`;
}

// ---- report ----

const REPORT_SYSTEM = `You write a DSA review report for a branch officer from a call Sarthi (an AI) had with the DSA.
You get the DSA's record from the branch, the question-by-question answers, and the rechecks where their figures did not match the record.
Judge: is this partner bringing genuine files, how loyal are they to us, and what should the officer do next.
Red flags to look for: sub-agents they cannot name, not knowing their own customers, charging customers, someone else preparing
statements/ITR, a code blocked by another lender, figures far from the record, most files going to other lenders.
Use only what is in the input — never invent a figure. Quote their words when it matters.

Reply with ONLY a JSON object:
{"score": 0-100, "sentiment": "strong" | "positive" | "moderate" | "weak", "headline": "one line",
 "escalate": true | false,
 "flags": [{"tone": "danger" | "warning" | "info", "text": "..."}],
 "sections": [{"title": "...", "items": ["..."]}],
 "todos": [{"owner": "BO" | "DSA" | "Credit", "text": "..."}]}
Sections, in order: "Who they are", "Where their customers come from", "File quality", "Their numbers vs our record", "Working with us", "Pipeline and plan".
Keep it tight — the officer reads it on a phone: at most 6 flags, 3 items per section, 5 todos, each under 30 words.`;

export async function writeDsaReport({ file, qa, rechecks }) {
  const input = `## Branch record\n${JSON.stringify(file, null, 1)}\n\n## Answers\n${qa.map((x) => `[${x.section}] ${x.q}\n→ ${x.a}`).join('\n\n')}\n\n## Rechecks on the call\n${rechecks.length ? rechecks.map((r) => `- ${r.detail}\n  Their answer: ${r.answer ?? '(none)'}`).join('\n') : 'None'}`;
  const raw = await askAgent({ systemPrompt: REPORT_SYSTEM, messages: [{ role: 'user', content: input }], temperature: 0.2, maxTokens: 6000, thinkingBudget: 2000 });
  const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  if (!Array.isArray(json.sections) || typeof json.score !== 'number') throw new Error('DSA report: bad shape');
  return { flags: [], todos: [], ...json };
}

/** No model reachable: the same report shape, built from the answers and rechecks alone. */
export function fallbackDsaReport({ file, qa, rechecks }) {
  const sections = [];
  qa.forEach((x) => {
    let s = sections.find((y) => y.title === x.section);
    if (!s) { s = { title: x.section, items: [] }; sections.push(s); }
    s.items.push(`${x.q} — "${x.a}"`);
  });
  const score = Math.round(file.approvalRate * 0.8 + (file.quality === 'high' ? 20 : file.quality === 'average' ? 10 : 0) - rechecks.length * 5);
  return {
    score: Math.max(0, Math.min(100, score)),
    sentiment: score >= 75 ? 'strong' : score >= 60 ? 'positive' : score >= 45 ? 'moderate' : 'weak',
    headline: `${file.name}: ${rechecks.length ? `${rechecks.length} figure${rechecks.length > 1 ? 's' : ''} did not match our record` : 'answers in line with our record'}`,
    escalate: false,
    flags: rechecks.map((r) => ({ tone: 'warning', text: `${r.detail} Their answer: "${r.answer ?? '—'}"` })),
    sections,
    todos: [
      ...file.stuck.map((f) => ({ owner: 'BO', text: `Clear pending docs on ${f.borrower}: ${f.pendingDocs.join(', ')}` })),
      { owner: 'BO', text: 'Review the answers above; the AI was not reachable to write the assessment.' },
    ],
  };
}
