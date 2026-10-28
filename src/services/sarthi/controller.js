// Decides WHAT to ask by walking pdSchema.json; the model only decides how to phrase it. No model calls here.
import pdSchema from '../../data/sarthi/pdSchema.json';
import { lookupLocation, tradeOf, hasAreaDetail, bankIncome, ventureArea } from './knowledge';
import { getMissingFields, knownFacts, enterSection, gaveUp, conditionMet, isSalaried, PROFESSION_CHECKS, TRADE_CHECKS, OPERATOR_KEYS, FIELD_DEFS as FIELD_DEFS_BY_KEY } from './interviewState';
import { toNumber, toYears } from './claimVerifier';
import { namesMatch } from './idChecks';
import { nextTradeProbe, nextTradeField, tradeProbes, purposeSignals } from './tradeProbes';
import { formatINR } from '../../utils/formatters';
import { planChallenges, challengeCount } from './liveChallenges';
import { priorClash } from './repeatPd';
import { inWords, familyHisaab } from './figureRechecks';

const SECTIONS = pdSchema.sections;

// Walk-ins have no bank credits, so they get extra business questions and income is rebuilt.
export function getInterviewConfig(caseData) {
  const isNewApplicant = !caseData?.brief?.avgMonthlyCredit;
  return {
    isNewApplicant,
    salaried: isSalaried(caseData),
    extraSections: isNewApplicant ? ['business_deep_dive'] : [],
    verificationStrategy: isNewApplicant ? 'internal_consistency' : 'brief_comparison',
    estimatedQuestions: isNewApplicant ? 24 : 18,
    incomeMethod: isNewApplicant ? 'calculated_from_answers' : 'bank_credits',
  };
}

export function activeSections(config) {
  return SECTIONS.filter((s) => {
    if (s.employment && (s.employment === 'salaried') !== config.salaried) return false;
    if (s.condition === 'no_borrower_brief') return config.isNewApplicant;
    return true;
  });
}

// A trade with its own insider questions (trade_depth) has already been tested harder than one knowledge question.
// The area was already tested next to the location answer (areaCheck).
function verificationTasks(memory, section) {
  return section.tasks.filter((t) => !(t.source === 'businessKnowledge' && (tradeProbes(memory).length || isSalaried(memory.caseData)))
    && !(t.source === 'locationKnowledge' && memory.areaChecked));
}

// A named trade with no insider pack: the model writes TRADE_CHECKS insider questions from its own knowledge instead.
const aiTrade = (memory) => !!memory.collected.business_type && !tradeProbes(memory).length;

function sectionComplete(memory, section) {
  const started = memory.sectionStartTurn[section.id] ?? memory.turnCount;
  const servedTime = memory.turnCount >= started + (section.minTurns ?? 1);

  if (section.type === 'fixed') return servedTime;

  if (section.type === 'verification') {
    // A score the model never reported must not hold the call open.
    return verificationTasks(memory, section).every((t) => memory.collected[`${t.key}_score`] != null || gaveUp(memory, `${t.key}_score`));
  }

  if (section.type === 'coaching_check') {
    return memory.income_mentions.length >= 2 || servedTime;
  }

  if (section.type === 'trade_probes') {
    return !nextTradeField(memory) && !nextTradeProbe(memory) && (!aiTrade(memory) || (memory.professionAnswers?.length ?? 0) >= TRADE_CHECKS);
  }

  if (section.type === 'profession_probes') return (memory.professionAnswers?.length ?? 0) >= PROFESSION_CHECKS;

  return getMissingFields(memory, section).length === 0;
}

// A place they name is tested against our area data where we have it, else the model's knowledge of that city, which
// may be dated, so a mismatch is voiced as a doubt, never a verdict.
function locationCross(memory, caseData, key, def, rest, asked, sections) {
  const place = memory.collected[key];
  const area = key === 'venture_location' ? ventureArea(memory.collected, caseData) : lookupLocation(caseData?.areaKey || caseData?.area || place);
  const surveyed = area?.source === 'specific';
  const section = sections.find((s) => s.id === memory.currentSection);
  return {
    action: 'ask_question',
    section: memory.currentSection,
    sectionLabel: section?.label ?? '',
    crossOf: key,
    context: surveyed ? { area: area.areaKey, knownMarkets: area.knownMarkets, landmarks: area.landmarks, nearestMetro: area.nearestMetro } : null,
    directive: `Before moving on, ask ONE cross-question about the place they named (${def.label}: "${place}"). ${def.cross.hint}`
      + (surveyed
        ? ` REFERENCE DATA below lists markets and landmarks of ${area.areaKey} we have surveyed — real, but not a complete list,`
          + ' so a place missing from it is not proof of anything; add your general knowledge of the city.'
        : ` We hold no surveyed data for it, so use your own general knowledge of that city: which markets, main roads and`
          + ' commercial areas it has, and which sectors or colonies are only residential.')
      + ' If what they named does not fit — no market or shops there, a residential-only sector, a place not in that city —'
      + ' say so gently as a doubt and ask them to clarify, e.g. "Mere hisaab se Sector 21 mein zyada market nahi hai — aap'
      + ' kaunsi jagah ki baat kar rahe hain?". Your knowledge can be out of date: never state it as certain, never accuse.'
      + ' If it fits, ask it open — never put the answer in the question, never offer choices. One question only.',
    known: knownFacts(memory),
    // The shop's area is tested in one go: the landmark check follows straight after.
    memory: { ...memory, crossQueue: key === 'business_location' ? [AREA_CHECK, ...rest] : rest, crossAsked: [...asked, key] },
  };
}

const AREA_CHECK = '__area_check';

// After the place question: what is around it, from our survey where we have one, else the model's knowledge. Replaces
// the verification task (memory.areaChecked).
function areaCheck(memory, caseData, rest, sections) {
  const place = memory.collected.business_location;
  const area = lookupLocation(caseData?.areaKey || caseData?.area || place);
  const surveyed = area?.source === 'specific';
  const city = caseData?.area && !String(place).toLowerCase().includes(String(caseData.area).toLowerCase()) ? `, ${caseData.area}` : '';
  return {
    action: 'ask_question',
    section: memory.currentSection,
    sectionLabel: sections.find((s) => s.id === memory.currentSection)?.label ?? '',
    verificationTask: 'area_knowledge',
    missingFields: ['area_knowledge_score'],
    context: surveyed ? { area: area.areaKey, knownMarkets: area.knownMarkets, landmarks: area.landmarks, nearestMetro: area.nearestMetro } : null,
    directive: `Stay on their area ("${place}${city}") for one more question: ask what is around their shop that anyone who sits there daily`
      + ' knows — the nearest thana, hospital, bank, mandir or masjid, main chowk, bus stand or station, or the big market nearby.'
      + ' Ask it OPEN ("dukaan ke aas-paas koi bada landmark kaunsa hai?"), never name one yourself.'
      + (surveyed ? ` REFERENCE DATA lists what we surveyed in ${area.areaKey} — real but partial; add your own knowledge of the city.`
        : ' We hold no survey for this place: judge with your own general knowledge of that city.')
      + ' Your knowledge can be dated — if what they say does not fit, voice it as a gentle doubt and a question, never a verdict.'
      + ' Score how they answered as area_knowledge_score in the facts fence. One question only.',
    known: knownFacts(memory),
    memory: { ...memory, crossQueue: rest, areaChecked: true, askedHyperLocal: true },
  };
}

// Quick PD (`quickPd` on a file): greeting → each listed question once (re-asked once if empty) → closing. Schema,
// trade depth, cross-questions and file questions are skipped; rechecks still run.
export function quickAction(memory, caseData) {
  const steps = memory.quickPd ?? caseData.quickPd;
  const asked = memory.quickAsked ?? [];
  const greeting = SECTIONS.find((s) => s.id === 'greeting');
  const base = { action: 'ask_question', sectionLabel: 'Quick PD', known: knownFacts(memory) };
  if (!asked.includes('greeting')) {
    return { ...base, section: 'greeting', directive: greeting.action, memory: { ...enterSection(memory, 'greeting'), quickAsked: [...asked, 'greeting'] } };
  }
  // A step's `when` is a schema-style condition ("children_count > 0"), so a "no" skips its follow-ups.
  const due = steps.find((st) => (!st.when || conditionMet({ condition: st.when }, memory)) && (st.field
    ? memory.collected[st.field] == null && !gaveUp(memory, st.field)
    : !asked.includes(st.key)));
  if (due) {
    const id = due.field ?? due.key;
    const def = due.field ? FIELD_DEFS_BY_KEY[due.field] : null;
    const next = enterSection(memory, 'quick');
    return {
      ...base,
      section: 'quick',
      ...(due.field ? { missingFields: [due.field] } : { quickStep: due }),
      directive: `Ask about: ${def?.label ?? due.label}. Plain-words example: "${due.ask}"`
        + ' Ask ONE thing, in your own simple words. This is a short interview — no other topic, no small talk.'
        + (due.scores ? ` Judge how confidently they answer and report ${due.scores} as high, medium or low in the facts block.` : ''),
      memory: {
        ...next,
        quickAsked: asked.includes(id) ? asked : [...asked, id],
        askCount: due.field ? { ...next.askCount, [due.field]: (next.askCount?.[due.field] ?? 0) + 1 } : next.askCount,
      },
    };
  }
  if (!asked.includes('closing')) {
    const closing = SECTIONS.find((s) => s.id === 'closing');
    return { ...base, section: 'closing', directive: closing.action, memory: { ...enterSection(memory, 'closing'), quickAsked: [...asked, 'closing'] } };
  }
  return { action: 'end_interview' };
}

// File questions (hotQuestions.js) belong to a section; anything unplaced is asked with the loan purpose.
const HOT_SECTIONS = new Set(['personal', 'business', 'financial', 'documents', 'loan_purpose']);
export function nextHot(memory, sectionId) {
  const asked = new Set(memory.hotAsked ?? []);
  return (memory.hot ?? []).find((h) => !asked.has(h.id) && (HOT_SECTIONS.has(h.section) ? h.section : 'loan_purpose') === sectionId) ?? null;
}

// A file question that stands in for standard fields is asked where the first of them would have been; the rest wait
// for the end of the section.
function hotDue(memory, section) {
  const asked = new Set(memory.hotAsked ?? []);
  const pending = (memory.hot ?? []).filter((h) => !asked.has(h.id) && (HOT_SECTIONS.has(h.section) ? h.section : 'loan_purpose') === section.id);
  if (!pending.length) return null;
  if (sectionComplete(memory, section)) return pending[0];
  if (!section.fields || section.type) return null;
  const at = (k) => section.fields.findIndex((f) => f.key === k);
  const next = at(getMissingFields(memory, section)[0]?.key);
  return pending.find((h) => h.covers?.length && Math.min(...h.covers.map(at).filter((i) => i >= 0)) < next) ?? null;
}

// The interview ends when the schema is satisfied, not when the model thinks it is done. Cross-questions per interview
// are capped to keep it a conversation; "low" priority fields get at most one, so location, ownership, sales, income,
// loans and end use always get theirs.
const MAX_CROSS = 7;
const MAX_LOW_CROSS = 1;
// A re-check PD (the last one raised flags) tests more answers, low-priority ones too.
const STRICT_CROSS = 12;

// Hard cap so a loop the guards miss never keeps a borrower on the phone. A full kirana PD runs ~75 turns.
const MAX_TURNS = 110;

export function getNextAction(memory, caseData) {
  if (memory.turnCount >= MAX_TURNS) return { action: 'end_interview' };
  const config = getInterviewConfig(caseData);
  const sections = activeSections(config);
  const here = () => sections.find((s) => s.id === memory.currentSection);

  // Figures that do not add up are raised straight away, while the answer is fresh.
  if (memory.recheckQueue?.length) {
    const [recheck, ...rest] = memory.recheckQueue;
    return {
      action: 'ask_question',
      section: memory.currentSection,
      sectionLabel: here()?.label ?? '',
      recheckOf: recheck.field,
      recheck,
      missingFields: [recheck.field], // lets a corrected figure replace the one they gave
      directive: (recheck.say
        ? `FRIENDLY RECHECK — the numbers they gave do not add up. Tell them both figures, in your own warm words, like a friend who noticed while doing the hisaab: "${recheck.say}"`
        // A flag's detail may name the trade's normal range, which would hand them the answer.
        : `FRIENDLY RECHECK — something in their answers does not add up (officer's note: ${recheck.detail}). Say THEIR OWN figures back in simple Hinglish, like a friend doing the hisaab with them, and ask how the two fit together. Never say what is normal, usual or expected for the trade, and never give a range.`)
        + ' Give them the benefit of the doubt — people forget, round off, or leave out cash. Never say they are wrong or lying,'
        + ' never mention the loan decision, never name a score. Ask only this; no other topic this turn.',
      known: knownFacts(memory),
      memory: { ...memory, recheckQueue: rest, recheckAsked: [...(memory.recheckAsked ?? []), recheck.field] },
    };
  }

  // Quick PD: a fixed list of questions from the file, still rechecked live. A repeat PD in cross-question mode walks
  // the earlier PD's key answers the same way (repeatPd.js).
  if ((memory.quickPd ?? caseData?.quickPd)?.length) return quickAction(memory, caseData);

  // Photos follow where they are: the current place first, then the other one only if they can go there now.
  const c = memory.collected;
  const asked = memory.photosAsked ?? [];
  // A salaried applicant has no shop: only the home is photographed.
  const salaried = isSalaried(caseData);
  const hereKind = c.current_place === 'home' ? 'home' : c.current_place === 'shop' && !salaried ? 'shop' : null;
  const otherKind = salaried || hereKind === 'shop' ? 'home' : 'shop';
  const photoTurn = (kind, lead) => ({
    action: 'ask_question',
    section: memory.currentSection,
    sectionLabel: here()?.label ?? '',
    photo: kind,
    directive: `${lead}Ask them to take one photo of their ${PHOTO_WHAT[kind]} now, for the officer's record. Say the camera will`
      + ` open on their phone and it will guide them. Output the \`\`\`photo ${kind}\`\`\` fence. No other question this turn.`,
    known: knownFacts(memory),
    memory: { ...memory, photosAsked: [...asked, kind] },
  });
  // Photos start after they have talked about themselves and 2-6 answers into the business or job (random per PD), so
  // the moment cannot be briefed.
  const coreAnswered = Object.keys(FIELD_DEFS_BY_KEY).filter((k) => CORE.has(FIELD_DEFS_BY_KEY[k].section) && c[k] != null).length;
  const photoTime = coreAnswered >= 2 + Math.floor((memory.seed ?? 0) * 5);
  if (photoTime) {
    if (hereKind && !asked.includes(hereKind)) return photoTurn(hereKind, '');
    // "Can you go to the other place now?" belongs with the photos.
    if (c.current_place != null && c.other_place_possible == null && !gaveUp(memory, 'other_place_possible')
      && !(salaried && hereKind === 'home')) {
      const def = FIELD_DEFS_BY_KEY.other_place_possible;
      return {
        action: 'ask_question',
        section: memory.currentSection,
        sectionLabel: here()?.label ?? '',
        missingFields: ['other_place_possible'],
        directive: `Ask about: ${def.label}. Plain-words example: "${salaried ? OTHER_PLACE_ASK.shop : OTHER_PLACE_ASK[c.current_place] ?? def.ask}"`
          + ' One question only, in your own simple words.',
        known: knownFacts(memory),
        memory: { ...memory, askCount: { ...memory.askCount, other_place_possible: (memory.askCount?.other_place_possible ?? 0) + 1 } },
      };
    }
    // At home: the main room too, for living conditions.
    if (asked.includes('home') && !asked.includes('home_inside') && (hereKind === 'home' || c.other_place_possible === 'yes')) {
      return photoTurn('home_inside', 'Ask gently and say it is fine to skip — it is their home. ');
    }
    // At the shop, if they keep bills: the bill book opened at today's page.
    if (hereKind === 'shop' && c.billing_method && c.billing_method !== 'none' && !asked.includes('records')) {
      return photoTurn('records', `They said they keep bills (${c.billing_method}). `);
    }
    // Random live challenges, planned once per place after its photos.
    if (hereKind && asked.includes(hereKind) && !memory.challengePlanned
      && (hereKind !== 'shop' || c.billing_method != null || gaveUp(memory, 'billing_method'))) {
      const { count, why } = challengeCount(memory);
      memory = { ...memory, challengePlanned: true, challengeWhy: why, challengeQueue: planChallenges(hereKind, c, Math.random, count) };
    }
    if (memory.challengeQueue?.length) {
      const [step, ...rest] = memory.challengeQueue;
      return {
        action: 'ask_question',
        section: memory.currentSection,
        sectionLabel: here()?.label ?? '',
        challenge: step,
        ...(step.photo ? { photo: step.photo } : {}),
        directive: `LIVE CHECK — ask exactly this, in your own simple words, keeping every detail (which rack, which date, which bill): "${step.ask}"`
          + (step.photo ? ` Say the camera will open on their phone. Output the \`\`\`photo ${step.photo}\`\`\` fence.` : '')
          + ' Ask it as a natural, friendly request. Never say it is a check or why you ask. No other question this turn.',
        known: knownFacts(memory),
        memory: { ...memory, challengeQueue: rest },
      };
    }
    if (c.other_place_possible === 'yes' && !asked.includes(otherKind)) {
      return photoTurn(otherKind, `They said they can go to their ${otherKind === 'shop' ? 'shop' : 'home'} now. Tell them to take their time`
        + ' and open the camera once they reach — you will wait. ');
    }
  }
  let ack = '';
  if (c.other_place_possible === 'no' && !memory.placeNoAck) {
    ack = 'Start with a warm "Koi baat nahi" — they cannot go to the other place now, and that is fine. Then: ';
    memory = { ...memory, placeNoAck: true };
  }

  // A field just answered for the first time may earn one cross-question (schema "cross"), asked now.
  if (memory.crossQueue?.length) {
    const [key, ...rest] = memory.crossQueue;
    if (key === AREA_CHECK) return areaCheck(memory, caseData, rest, sections);
    const def = FIELD_DEFS_BY_KEY[key];
    const asked = memory.crossAsked ?? [];
    const lowUsed = asked.filter((k) => FIELD_DEFS_BY_KEY[k]?.cross?.priority === 'low').length;
    // A field a file question stood in for already had its deeper question.
    const room = def?.cross && !(memory.hot ?? []).some((h) => h.covers?.includes(key)) && asked.length < (memory.strict ? STRICT_CROSS : MAX_CROSS) && (def.cross.priority !== 'low' || lowUsed < (memory.strict ? STRICT_CROSS : MAX_LOW_CROSS));
    if (!room) return getNextAction({ ...memory, crossQueue: rest }, caseData);
    if (def?.cross?.knowledge === 'location') return locationCross(memory, caseData, key, def, rest, asked, sections);
    if (def?.cross) {
      const section = sections.find((s) => s.id === memory.currentSection);
      return {
        action: 'ask_question',
        section: memory.currentSection,
        sectionLabel: section?.label ?? '',
        crossOf: key,
        directive: `Before moving on, ask ONE cross-question about their last answer (${def.label}: "${memory.collected[key]}"). ${def.cross.hint}`
          + ' Ask it OPEN — never put the answer in the question and never offer choices from the reference data'
          + ' ("metro ke kaunse gate ke paas?", not "Blue Line wale side?"). Short and curious, never suspicious, never'
          + ' say why you are asking. Do not start a new topic this turn.',
        known: knownFacts(memory),
        memory: { ...memory, crossQueue: rest, crossAsked: [...asked, key] },
      };
    }
    memory = { ...memory, crossQueue: [] };
  }
  const idx = Math.max(0, sections.findIndex((s) => s.id === memory.currentSection));

  // The adaptive block is walked as one: a loan_purpose pick must not leave business questions behind.
  let cursor = CORE.has(memory.currentSection) ? Math.min(idx, sections.findIndex((s) => CORE.has(s.id))) : idx;
  while (cursor < sections.length && sectionComplete(memory, sections[cursor]) && !nextHot(memory, sections[cursor].id)) cursor += 1;
  if (cursor >= sections.length) return { action: 'end_interview' };

  // Within core topics, the next question is the best one for what is still unverified, not the next in the list.
  const chosen = CORE.has(sections[cursor].id) ? adaptivePick(memory, caseData, sections) : null;
  const section = chosen?.section ?? sections[cursor];
  const instruction = buildInstruction(memory, section, caseData, config, chosen?.pick);
  // A topic change gets a short bridge so an adaptive order still sounds like one conversation.
  if (chosen && CORE.has(memory.currentSection) && memory.currentSection !== section.id) {
    instruction.directive = `New topic (${section.label}) — bridge to it in a few natural words. ${instruction.directive}`;
  }
  // Assisted PD: the phone changes hands once, on the operator's first turn.
  if (section.handover && memory.currentSection !== section.id) {
    instruction.directive = `${section.handover.replace('{applicant}', caseData.name)} Then: ${instruction.directive}`;
    instruction.handover = true;
  }
  // The operator never hears the applicant's answers: only their own answers reach the model.
  if (section.id === 'operator') {
    instruction.known = Object.fromEntries(Object.entries(instruction.known ?? {}).filter(([k]) => OPERATOR_KEYS.has(k)));
    instruction.contradictions = [];
    instruction.riskAlert = null;
    instruction.hyperLocal = null;
    instruction.directive += ' You are now talking to the person who runs the business, not the applicant — never tell them any'
      + ' figure or answer the applicant gave, never ask them to confirm one.';
  }
  // A flag is followed up once, in the turn it is raised.
  const raised = new Set((instruction.contradictions ?? []).map((f) => f.detail));
  const next = enterSection(memory, section.id);
  const flags = raised.size ? next.flags.map((f) => (raised.has(f.detail) ? { ...f, followedUp: true } : f)) : next.flags;
  const hotAsked = instruction.hot ? [...(next.hotAsked ?? []), instruction.hot.id] : next.hotAsked;
  const target = instruction.missingFields?.[0];
  const askCount = target ? { ...next.askCount, [target]: (next.askCount?.[target] ?? 0) + 1 } : next.askCount;
  return { ...instruction, directive: ack + instruction.directive, memory: { ...next, flags, askCount, hotAsked, lastField: target ?? next.lastField } };
}

// The topics between "who are you" and the documents: asked in whatever order the evidence calls for.
const CORE = new Set(['employment', 'profession_depth', 'business', 'trade_depth', 'business_deep_dive', 'financial', 'loan_purpose']);

// 0..1.2, fixed for this PD and this topic: breaks ties differently in every PD, never the same order twice.
function jitter(seed, key) {
  let h = Math.floor((seed ?? 0) * 2147483647);
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % 1000) / 1000 * 1.2;
}

// The next core question (anti-coaching). Coverage never changes, the order does: each open topic scores its schema
// weight, +3 if the last answer links to it, +4 if an open flag sits on it, +1 for staying in the same section, plus
// per-PD jitter. The anchor (business type / employer and role) always comes first.
export function adaptivePick(memory, caseData, sections) {
  const core = sections.filter((s) => CORE.has(s.id));
  const c = memory.collected;
  for (const s of core) {
    const anchor = (s.fields ?? []).length ? getMissingFields(memory, s).find((f) => f.anchor) : null;
    if (anchor) return { section: s, pick: { field: anchor.key } };
  }
  const near = new Set(FIELD_DEFS_BY_KEY[memory.lastField]?.links ?? []);
  const gap = new Set();
  memory.flags.filter((f) => !f.followedUp).forEach((f) => {
    gap.add(f.field);
    (FIELD_DEFS_BY_KEY[f.field]?.links ?? []).forEach((k) => gap.add(k));
  });
  const options = [];
  for (const s of core) {
    if (s.type === 'trade_probes') {
      if (c.business_type && !sectionComplete(memory, s)) options.push({ section: s, pick: { trade: true }, weight: 3 });
      continue;
    }
    if (s.type === 'profession_probes') {
      if ((c.designation || caseData?.designation) && !sectionComplete(memory, s)) options.push({ section: s, pick: { profession: true }, weight: 3.5 });
      continue;
    }
    const hot = nextHot(memory, s.id);
    if (hot) options.push({ section: s, pick: { hot: hot.id }, weight: 3.5, key: hot.covers?.[0] });
    for (const f of getMissingFields(memory, s)) options.push({ section: s, pick: { field: f.key }, weight: f.weight ?? 2, key: f.key });
  }
  if (!options.length) return null;
  const score = (o) => o.weight + (o.key && near.has(o.key) ? 3 : 0) + (o.key && gap.has(o.key) ? 4 : 0)
    + (o.section.id === memory.currentSection ? 1 : 0) + jitter(memory.seed, o.key ?? o.section.id);
  return options.reduce((best, o) => (score(o) > score(best) ? o : best));
}

const PHOTO_WHAT = {
  shop: 'shop from where the customer stands — counter, stock and the board in view',
  home: 'home from outside — the door and the front of the house, the house number if there is one',
  home_inside: 'main room inside the home, from the doorway — the room and whatever is in it, no faces needed',
  records: 'bill book or register, opened at the page for today (or the latest one) — dates, bill numbers and amounts readable',
};

// Asked once they have said where they are: the OTHER place, in words.
const OTHER_PLACE_ASK = {
  home: 'Kya aap abhi dukaan ja sakte hain? Dukaan ki ek photo leni hai.',
  shop: 'Aur kya aap abhi ghar ja kar ghar ki ek photo le sakte hain? Abhi mumkin na ho toh koi baat nahi.',
  other: 'Kya aap abhi dukaan ja sakte hain? Dukaan ki ek photo leni hai.',
};

function buildInstruction(memory, section, caseData, config, pick = null) {
  const area = lookupLocation(caseData.areaKey || caseData.area);
  const biz = tradeOf(memory.collected, caseData);

  const instruction = {
    action: 'ask_question',
    section: section.id,
    sectionLabel: section.label,
    isNewApplicant: config.isNewApplicant,
  };

  // The section's schema is done; this file's prepared questions for it come next, in
  // adaptive or section order (hotDue).
  const hot = pick ? (pick.hot ? (memory.hot ?? []).find((h) => h.id === pick.hot) : null) : hotDue(memory, section);
  if (hot) {
    instruction.hot = hot;
    const open = (hot.covers ?? []).filter((k) => memory.collected[k] == null);
    // Its answer may fill the standard fields it stands in for.
    if (open.length) instruction.missingFields = open;
    instruction.directive = `This question was prepared from their loan file before the call. Ask it in your own simple words: "${hot.q}"`
      + (open.length ? ` It replaces the standard questions on ${open.map((k) => FIELD_DEFS_BY_KEY[k]?.label ?? k).join(', ')} — make sure the answer gives those.` : '')
      + ` (Why the officer wants it — never say this to them: ${hot.why}.) Never say it comes from a file or a list.`;
  } else if (section.type === 'fixed') {
    instruction.directive = section.action;
  } else if (section.type === 'verification') {
    const tasks = verificationTasks(memory, section);
    const task = tasks.find((t) => memory.collected[`${t.key}_score`] == null && !gaveUp(memory, `${t.key}_score`)) ?? tasks[0];
    instruction.verificationTask = task.key;
    instruction.missingFields = [`${task.key}_score`]; // counted like a field, so it is also given up after MAX_ASKS

    if (task.source === 'locationKnowledge') {
      instruction.directive = hasAreaDetail(caseData.areaKey || caseData.area)
        ? 'Ask one casual question about their area to check they really work there. Use only the AREA KNOWLEDGE data for the answer you expect.'
        : 'Ask one casual question about their area that any real resident would answer instantly — nearest thana, bijli company, nearest station, local market. We hold no data for this area, so judge their confidence, not the exact answer.';
      instruction.context = area;
    } else {
      instruction.directive = biz
        ? 'Ask one trade question only a real owner of this business would know. Use only the BUSINESS KNOWLEDGE questions listed.'
        : 'We hold no trade data for this business. Skip the trade question and move on.';
      instruction.context = biz?.knowledgeQuestions ?? null;
    }
  } else if (section.type === 'trade_probes') {
    const field = nextTradeField(memory);
    const probe = field ? null : nextTradeProbe(memory);
    if (field) {
      // The trade's arithmetic needs this figure — asked like any field, so extraction fills it.
      const def = section.fields?.find((f) => f.key === field) ?? { key: field, ...FIELD_DEFS_BY_KEY[field] };
      instruction.missingFields = [field];
      instruction.directive = `Ask about: ${def.label}. Plain-words example: "${def.ask}"`
        + ' Ask ONE thing at a time, in your own words, as simply as the example.'
      // The example is a template; their answers are the truth.
      + ' Fit it to what they have already told you — never assume more people, things or money than they said.';
    } else if (!probe) {
      instruction.professionCheck = (memory.professionAnswers?.length ?? 0) + 1;
      instruction.directive = professionDirective(memory, caseData);
    } else if (probe.parent) {
      instruction.tradeProbe = probe.key;
      instruction.tradeProbeDef = probe;
      instruction.directive = `Their last answer needs one more question. Ask exactly this, in your own simple words: "${probe.ask}"`
        + ' Sound curious, not suspicious. Never say why you are asking, never hint at the right answer, never correct them.';
    } else {
      instruction.tradeProbe = probe.key;
      instruction.tradeProbeDef = probe;
      instruction.directive = `Ask this insider trade question — a real ${biz?.label ?? 'owner'} answers it without thinking: "${probe.ask}"`
        + ' Say it in your own simple words, one question only. Never hint at the answer, never praise or correct it —'
        + ' just note it and move on. If they say "pata nahi", accept it.';
    }
  } else if (section.type === 'profession_probes') {
    instruction.professionCheck = (memory.professionAnswers?.length ?? 0) + 1;
    instruction.directive = professionDirective(memory, caseData);
  } else if (section.type === 'coaching_check') {
    instruction.directive = section.action;
    instruction.previousMention = memory.income_mentions[0] ?? null;
  } else {
    const missing = getMissingFields(memory, section);
    if (pick?.field) missing.sort((a, b) => (b.key === pick.field) - (a.key === pick.field));
    instruction.missingFields = missing.map((f) => f.key);
    const [first] = missing;
    const ask = first.key === 'other_place_possible'
      ? (config.salaried ? OTHER_PLACE_ASK.shop : OTHER_PLACE_ASK[memory.collected.current_place] ?? first.ask)
      : ((config.salaried && first.askSalaried) || first.ask).replace('{applicant}', caseData.name);
    instruction.directive = `Ask about: ${first.label}. Plain-words example: "${ask}"`
      // Name only one topic, or the model skips ahead.
      + ` This turn's question is about ${first.label} only — no other topic.`
      + ' Ask ONE thing at a time, in your own words, as simply as the example.'
      // The example is a template; their answers are the truth.
      + ' Fit it to what they have already told you — never assume more people, things or money than they said.';
    if (section.id === 'documents') {
      instruction.directive += ' These are verbal cross-checks only — never say or imply the document is being verified.';
    }
  }

  const hyperLocal = getHyperLocalInstruction(memory, caseData);
  if (hyperLocal && !memory.askedHyperLocal) instruction.hyperLocal = hyperLocal;

  if (caseData.riskPatternMatch && !memory.askedRisk) {
    instruction.riskAlert = caseData.riskPatternMatch;
  }

  // One gentle follow-up per turn, most serious first; stacking them turns a question into an audit.
  const RANK = { high: 0, medium: 1, low: 2 };
  const open = memory.flags.filter((f) => !f.followedUp).sort((a, b) => (RANK[a.severity] ?? 3) - (RANK[b.severity] ?? 3)).slice(0, 1);
  if (open.length) {
    instruction.contradictions = open;
    instruction.directive += ' Also follow up naturally on the flagged items below. Never confront, never say they contradicted themselves.';
  }

  instruction.known = knownFacts(memory);
  return instruction;
}

// The one place the model writes the question itself: no JSON can cover every job or trade. Answers are kept verbatim
// and judged in the report.
function professionDirective(memory, caseData) {
  const c = memory.collected;
  const done = memory.professionAnswers ?? [];
  const already = done.length ? ` Already asked — cover something DIFFERENT: ${done.map((d) => `"${d.q}"`).join('; ')}.` : '';
  if (!isSalaried(caseData)) {
    return `TRADE CHECK ${done.length + 1} of ${TRADE_CHECKS}. They say they run "${c.business_type}"`
      + `${c.products_services ? ` (${c.products_services})` : ''}${c.business_age != null ? ` for ${c.business_age} years` : ''}.`
      + ' Ask ONE question that anyone who really runs this trade in India answers without thinking, and someone who only'
      + ' sits in the shop for the day cannot. Use your own knowledge of the trade: where the goods come from (which mandi,'
      + ' distributor, company or manufacturer), credit days with suppliers, the margin on the main lines, the busy and slow'
      + ' season, the licence or registration it needs, its typical problems (breakdowns, returns, wastage, spoilage) and its'
      + ' jargon. E.g. a machinery or equipment dealer: which brands, how warranty and service work, how buyers pay for a'
      + ' machine; a cafe or restaurant: food cost out of a 100-rupee bill, covers a day, the FSSAI licence, what gets wasted.'
      + `${already} Ask it open and curious like a fellow trader, never as a quiz; never hint at, correct or praise the answer,`
      + ' never state a margin or price yourself. If they say "pata nahi", accept it and move on. One question only.';
  }
  const role = c.designation || caseData?.designation || 'their job';
  const employer = c.employer_name || caseData?.employer || '';
  const years = c.total_experience ?? c.job_years ?? caseData?.businessVintage ?? null;
  return `PROFESSION CHECK ${done.length + 1} of ${PROFESSION_CHECKS}. They say they work as "${role}"${employer ? ` at "${employer}"` : ''}`
    + `${years ? ` with ${years} years of experience` : ''}. Ask ONE question that anyone who really does this job answers without`
    + ' thinking, and someone who only knows the title cannot. Use your own knowledge of this profession: its daily work, tools,'
    + ' software, terms, processes and typical problems — at the level their experience implies. E.g. a software engineer (SDE):'
    + ' which language and framework, what an API or a database index is, how their code reaches production, a bug they fixed'
    + ' recently; an accountant: which software, what TDS or a GST return is; a nurse or teacher, a driver, a sales executive:'
    + ' their shift, their targets, the terms of their work. English technical words are fine when the job uses them.'
    + already
    + ' Ask it open and curious like a friendly colleague, never as a quiz, never hint at the answer, never correct or praise'
    + ' it. If they say "pata nahi", accept it and move on. One question only.';
}

// A 2+ year residence claim is testable. Judges confidence, not correctness, so model knowledge is fine here.
export function getHyperLocalInstruction(memory, caseData) {
  const c = memory.collected;
  const area = c.business_location || caseData?.area;
  const years = Math.max(toYears(c.residence_duration) ?? 0, toYears(c.business_age) ?? 0);
  if (!area || years < 2) return null;

  return {
    area,
    years,
    directive: `They say ${years} years in ${area}. Weave in ONE casual question a real resident would answer instantly — nearest thana, government hospital, bijli company, water timing, nearest school, metro or station, local market name. Pick whatever follows naturally from what you were just discussing; it must not feel like a quiz. Judge whether they answered confidently and specifically, or hesitated. Exact correctness does not matter.`,
  };
}

const DENIAL = /^\s*(no|none|false|nahi|nahin|nhi|na|nope|koi nahi|kahin nahi|kuch nahi|never)\b/i;

// Compares new facts with the brief. Pass memory as it was BEFORE this turn's facts were merged.
/** { age, source } from the KYC date of birth, else the file's age; null when the file has neither. */
export function ageOnFile(caseData, today = new Date()) {
  const dob = caseData?.brief?.kyc?.dob ?? caseData?.dob;
  if (dob) {
    const d = new Date(dob);
    if (!Number.isNaN(d.getTime())) {
      const age = today.getFullYear() - d.getFullYear() - (today < new Date(today.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
      return { age, source: 'KYC date of birth' };
    }
  }
  return caseData?.age ? { age: caseData.age, source: 'application' } : null;
}

export function checkContradictions(memory, facts, caseData, { recheck = null } = {}) {
  const flags = [];
  const brief = caseData?.brief ?? {};

  // Same person, earlier PD: a changed answer is shown to them now, like any recheck.
  for (const [k, v] of Object.entries(facts)) {
    const p = memory.prior?.[k];
    if (!p || v == null || v === '' || !priorClash(k, p.value, v)) continue;
    const def = FIELD_DEFS_BY_KEY[k];
    const said = (x) => (def?.type === 'number' ? inWords(toNumber(x)) : String(x));
    const when = new Date(p.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    flags.push({
      type: 'repeat_pd', field: k, severity: 'high', turn: memory.turnCount,
      detail: `${def?.label ?? k}: said ${said(p.value)} in PD ${p.pdNo} (${when}), now ${said(v)}`,
      say: `Pichhli baat-cheet mein (${when} ko) aapne ${def?.label?.toLowerCase() ?? k} ke baare mein ${said(p.value)} bataya tha, aur aaj ${said(v)} bata rahe hain. Kya beech mein kuch badla hai, ya us din kuch aur keh diya tha?`,
    });
  }

  // The loan is judged against the business it must be repaid from; a new venture or stretch amount is probed.
  if (facts.loan_purpose || facts.loan_amount) {
    const p = purposeSignals({ ...memory.collected, ...facts }, caseData);
    // Raised once, on the purpose answer; an unrelated trade is high, expanding the same one medium.
    if (facts.loan_purpose && p.newVenture && p.current) {
      flags.push({
        type: 'loan_purpose', field: 'loan_purpose', severity: p.target ? 'high' : 'medium',
        detail: `Runs a ${p.current} but wants the loan for "${p.purpose}"${p.target ? ` (${p.target}) — a new venture outside the business being assessed` : ' — a new shop, separate from the one being assessed'}`,
        turn: memory.turnCount,
      });
    }
    if (facts.loan_purpose && p.personal) {
      flags.push({
        type: 'loan_purpose', field: 'loan_purpose', severity: 'medium',
        detail: `Stated purpose "${p.purpose}" is personal, not for the business`,
        turn: memory.turnCount,
      });
    }
    if (facts.loan_amount && p.stretch) {
      flags.push({
        type: 'loan_purpose', field: 'loan_amount', severity: p.months > 60 ? 'high' : 'medium',
        detail: `Asked for ${formatINR(p.amount, { compact: false })} — about ${p.months} months of their stated monthly income of ${formatINR(p.income, { compact: false })}`,
        turn: memory.turnCount,
      });
    }
  }

  // A PD is only a PD if the applicant is the one answering.
  const statedName = facts.stated_name ?? facts.applicant_name;
  if (statedName && !caseData?.isNew && namesMatch(statedName, caseData?.name) === false) {
    flags.push({
      type: 'identity_mismatch', field: 'stated_name', severity: 'high',
      declared: statedName, known: caseData.name,
      detail: `Application is in the name of ${caseData.name}, but the person on the call gave their name as "${statedName}"`,
      turn: memory.turnCount,
    });
  }

  // Age vs the KYC date of birth (else the file's age); ±2 years is rounding.
  const ageSaid = toNumber(facts.age);
  const fileAge = ageOnFile(caseData);
  if (ageSaid && fileAge && Math.abs(ageSaid - fileAge.age) > 2) {
    flags.push({
      type: 'contradiction', field: 'age', declared: ageSaid, known: fileAge.age,
      severity: Math.abs(ageSaid - fileAge.age) > 5 ? 'high' : 'medium',
      detail: `Said age ${ageSaid}, but the ${fileAge.source} puts them at ${fileAge.age}`,
      turn: memory.turnCount,
    });
  }

  const income = toNumber(facts.monthly_income);
  const bank = bankIncome(caseData);
  if (income != null && bank) {
    const diff = ((income - bank.income) / bank.income) * 100;
    if (diff > 40) {
      flags.push({
        type: 'contradiction', field: 'monthly_income',
        declared: income, known: bank.income, diff: Math.round(diff),
        severity: diff > 80 ? 'high' : 'medium',
        detail: `Declared income ${income} is ${Math.round(diff)}% above the ${bank.income} the bank statement supports (${bank.basis})`,
        turn: memory.turnCount,
      });
    }
  }

  // Shop rent only (house rent is not compared); 0 means an owned shop.
  const rent = toNumber(facts.shop_rent);
  if (rent) {
    const area = lookupLocation(caseData?.areaKey || caseData?.area);
    if (area?.avgShopRent && rent < area.avgShopRent.min * 0.5) {
      flags.push({
        type: 'contradiction', field: 'shop_rent',
        declared: rent, known: area.avgShopRent.min,
        severity: area.source === 'specific' ? 'medium' : 'low',
        detail: `Declared shop rent ${rent} is below the ${area.source === 'specific' ? 'area' : 'tier'} minimum ${area.avgShopRent.min}`,
        turn: memory.turnCount,
      });
    }
  }

  const emiStated = toNumber(facts.existing_emi);
  if (emiStated != null && brief.existingEMIs) {
    if (emiStated < brief.existingEMIs * 0.8) {
      flags.push({
        type: 'contradiction', field: 'existing_emi',
        declared: emiStated, known: brief.existingEMIs,
        severity: 'high',
        detail: `Declared EMI ${emiStated} is below the bureau EMI ${brief.existingEMIs}`,
        turn: memory.turnCount,
      });
    }
  }

  // Loan shopping: denies other applications while the bureau shows fresh enquiries. Walk-ins keep
  // the answer for a later pull.
  const enquiries = brief.bureau?.enquiries6m;
  if (facts.recent_loan_applications != null && enquiries >= 2 && DENIAL.test(String(facts.recent_loan_applications))) {
    flags.push({
      type: 'contradiction', field: 'recent_loan_applications', severity: enquiries >= 4 ? 'high' : 'medium',
      declared: facts.recent_loan_applications, known: enquiries,
      detail: `Says no loan was applied for elsewhere, but the bureau shows ${enquiries} enquiries in the last 6 months`,
      turn: memory.turnCount,
    });
  }

  // Coaching tell: the same figure, asked differently, comes back different. A figure corrected after seeing the bank's
  // is a correction, not drift.
  if (income != null && memory.income_mentions.length && recheck !== 'monthly_income') {
    const first = toNumber(memory.income_mentions[0].value);
    if (first) {
      const drift = Math.abs(((income - first) / first) * 100);
      if (drift > 20) {
        flags.push({
          type: 'coaching_detected', field: 'monthly_income',
          first: { turn: memory.income_mentions[0].turn, value: first },
          second: { turn: memory.turnCount, value: income },
          severity: 'high',
          detail: `Income given as ${first} on turn ${memory.income_mentions[0].turn}, then ${income} on turn ${memory.turnCount} — ${Math.round(drift)}% apart`,
          turn: memory.turnCount,
        });
      }
    }
  }

  return flags;
}

// For walk-ins: their own numbers against each other and their trade's margin range.
export function checkInternalConsistency(memory, caseData) {
  const flags = [];
  const c = memory.collected;
  const biz = tradeOf(c, caseData);

  const customers = toNumber(c.customers_per_day);
  const bill = toNumber(c.avg_bill_value);
  const sales = toNumber(c.monthly_sales);
  const income = toNumber(c.monthly_income);
  const estimatedSales = customers != null && bill != null ? customers * bill * 30 : null;

  if (estimatedSales && sales != null && estimatedSales > 0) {
    const drift = Math.abs(sales - estimatedSales) / estimatedSales;
    if (drift > 0.5) {
      flags.push({
        type: 'internal_consistency', field: 'monthly_sales', severity: 'medium',
        detail: `Declared sales ${sales}, but ${customers} customers × ${bill} average × 30 days works out to about ${Math.round(estimatedSales)}`,
      });
    }
  }

  if (estimatedSales && income != null && biz?.typicalMarginPct) {
    const ceiling = estimatedSales * (biz.typicalMarginPct.max / 100);
    if (income > ceiling * 1.5) {
      flags.push({
        type: 'internal_consistency', field: 'monthly_income', severity: 'high',
        detail: `Income ${income} is not supported by their own numbers: at ${biz.typicalMarginPct.max}% margin on about ${Math.round(estimatedSales)} of sales, the most it could be is roughly ${Math.round(ceiling)}`,
      });
    }
  }

  if (income != null) {
    // Other earners' money feeds the same household.
    const household = income + (toNumber(c.other_household_income) ?? 0);
    const outgo = familyHisaab(c).outgo;
    if (outgo > 0 && outgo > household * 0.95) {
      flags.push({
        type: 'internal_consistency', field: 'expenses_vs_income', severity: 'medium',
        detail: `Stated outgoings (${outgo}) take up nearly all of the stated household income (${household}). Ask how the household is managing.`,
      });
    }
  }

  const employees = toNumber(c.employees);
  if (sales != null && sales > 500000 && employees === 0 && biz && !biz.soloOk) {
    flags.push({
      type: 'internal_consistency', field: 'employees_vs_sales', severity: 'low',
      detail: `${sales} of monthly sales claimed with no helper at all, which is unusual for ${biz.label}`,
    });
  }

  const rent = toNumber(c.monthly_rent);
  if (rent != null && income) {
    const pct = (rent / income) * 100;
    if (pct > 40) {
      flags.push({
        type: 'internal_consistency', field: 'rent_vs_income', severity: 'medium',
        detail: `House rent ${rent} is ${Math.round(pct)}% of income ${income}. Above 40% is unusual and squeezes any EMI.`,
      });
    }
  }

  return flags;
}

// Bank credits win. Otherwise rebuild from footfall × bill × margin and take the LOWER of that and the declaration.
export function assessIncome(memory, caseData) {
  const brief = caseData?.brief ?? {};
  const bank = bankIncome(caseData);
  if (bank) return { income: bank.income, method: 'bank_credits', source: bank.source, assessable: true };

  const c = memory?.collected ?? {};
  const customers = toNumber(c.customers_per_day);
  const bill = toNumber(c.avg_bill_value);
  const declared = toNumber(c.monthly_income) ?? toNumber(caseData?.declaredIncome);

  if (customers != null && bill != null) {
    const biz = tradeOf(c, caseData);
    const sales = customers * bill * 30;
    const margin = biz?.typicalMarginPct
      ? (biz.typicalMarginPct.min + biz.typicalMarginPct.max) / 2 / 100
      : 0.15;
    const calculated = Math.round(sales * margin);
    const income = declared != null ? Math.min(declared, calculated) : calculated;
    return {
      income,
      calculated,
      declared,
      method: 'calculated_from_answers',
      source: `${customers} customers × ${bill} average × 30 days × ${Math.round(margin * 100)}% margin${biz ? ` (${biz.label})` : ''}`,
      assessable: true,
      note: declared != null && calculated < declared
        ? `Declared ${declared}; their own footfall supports about ${calculated}. The lower figure is used.`
        : undefined,
    };
  }

  // A declaration alone is never enough.
  return {
    income: null,
    declared,
    method: 'none',
    source: 'No bank statement, and not enough business detail to rebuild income from answers',
    assessable: false,
  };
}

// The "THIS TURN" block injected into Agent 1's prompt.
export function directiveText(instruction) {
  if (!instruction || instruction.action === 'end_interview') {
    return 'THIS TURN: every topic is covered. Thank them warmly (never say an officer will call, contact or follow up), and end the interview with [INTERVIEW_COMPLETE].';
  }

  const lines = [`THIS TURN — section "${instruction.sectionLabel}": ${instruction.directive}`];

  if (instruction.hyperLocal) lines.push(`ALSO WEAVE IN: ${instruction.hyperLocal.directive}`);
  if (instruction.riskAlert) {
    lines.push(`RISK PATTERN (ask around it naturally, never mention it): ${JSON.stringify(instruction.riskAlert)}`);
  }
  if (instruction.contradictions?.length) {
    lines.push(`OPEN FLAGS (follow up gently, never confront): ${JSON.stringify(instruction.contradictions.map((f) => f.detail))}`);
  }
  if (instruction.context) {
    lines.push(`REFERENCE DATA for this turn — use ONLY this, never your own knowledge of rents or margins:\n${JSON.stringify(instruction.context, null, 2)}`);
  }
  if (instruction.known && Object.keys(instruction.known).length) {
    lines.push(`ALREADY ANSWERED (do not ask again): ${JSON.stringify(instruction.known)}`);
  }

  return lines.join('\n\n');
}
