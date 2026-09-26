// Where the interview must dig instead of moving on: trade insider questions and loan-purpose signals.
import { lookupBusiness } from './knowledge';
import { toNumber } from './verifier';
import { readNumbers } from './hindiNumbers';

// "kholna/shuru/start" or "naya kaam" — a new venture, not more stock for the shop they already run.
const NEW_VENTURE = /(kholn|kholu|khol ke|shuru kar|start kar|open kar|naya (kaam|business|dhanda)|nayi dukaan)/i;
const PERSONAL = /(shaadi|shadi|wedding|ghar bana|makaan bana|gaadi|car lena|bike|ilaaj|medical|hospital|padhai|fees|purana loan|loan chuka|karz chuka)/i;

// Two years of total income: past that, the amount needs a worked-out basis, not a round number.
const STRETCH_MONTHS = 24;

export function tradeFor(memory) {
  const c = memory.caseData ?? {};
  return lookupBusiness(memory.collected.business_type || c.businessKey || c.business);
}

export function tradeProbes(memory) {
  return tradeFor(memory)?.depth ?? [];
}

// Words that carry no fact. A one-word reply ("haan", "hmm") is vague too.
const VAGUE = /(pata nahi|nahi pata|yaad nahi|malum nahi|maloom nahi|jitna chahiye|kuch bhi|sab kuch|jo mil jaaye|bhai (dekhta|ko pata)|andaaza nahi|fix nahi|bahut hota|bahut kuch|bahut sara|sab bikta|sab kuch bikta)/i;

/** How an insider answer reads, decided in code: 'redFlag' (matches what a non-owner says), 'vague', or 'clear'. */
export function judgeAnswer(probe, text) {
  const t = String(text ?? '').toLowerCase();
  const red = probe.redFlagMatch && new RegExp(probe.redFlagMatch, 'i').test(t)
    && !(probe.unlessMatch && new RegExp(probe.unlessMatch, 'i').test(t));
  if (red) return 'redFlag';
  if (VAGUE.test(t) || t.trim().split(/\s+/).length <= 1) return 'vague';
  return 'clear';
}

// The trade's arithmetic needs these figures, so they are asked of every applicant, not only walk-ins.
export function nextTradeField(memory) {
  return (tradeFor(memory)?.hisaab?.fields ?? []).find((k) => memory.collected[k] == null) ?? null;
}

/**
 * The next insider question, or one follow-up on the last answer: a red-flag answer gets its onRedFlag
 * question, a vague one its onVague question — once, never a second time.
 */
export function nextTradeProbe(memory) {
  const answers = memory.tradeAnswers ?? [];
  const byKey = new Map(answers.map((a) => [a.key, a]));
  for (const p of tradeProbes(memory)) {
    const a = byKey.get(p.key);
    if (!a) return p;
    const follow = a.status === 'redFlag' ? p.onRedFlag : a.status === 'vague' ? p.onVague : null;
    const key = `${p.key}:followup`;
    if (follow && !byKey.has(key)) {
      return { ...p, ...follow, key, parent: p.key, followUpOf: a.status, redFlagMatch: p.redFlagMatch, unlessMatch: p.unlessMatch };
    }
  }
  return null;
}

/** Per insider question: clear, vague or red flag — a red flag stands, a vague answer is settled by its follow-up. */
export function understanding(memory) {
  const answers = memory.tradeAnswers ?? [];
  const items = tradeProbes(memory).map((p) => {
    const main = answers.find((a) => a.key === p.key);
    const follow = answers.find((a) => a.key === `${p.key}:followup`);
    if (!main) return null;
    const status = main.status === 'redFlag' ? 'redFlag' : main.status === 'vague' ? (follow?.status ?? 'vague') : main.status;
    return { key: p.key, q: p.ask, answer: main.answer, turn: main.turn, followUp: follow ? { q: follow.q, answer: follow.answer, turn: follow.turn } : null, status, expect: p.expect };
  }).filter(Boolean);
  const count = (s) => items.filter((i) => i.status === s).length;
  return { total: items.length, clear: count('clear'), vague: count('vague'), redFlag: count('redFlag'), items };
}

/* ------------------------------------------------------------------ hisaab: does the trade's arithmetic hold? */

const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// "40 packet", "chaalis litre" → { n, unit } from their own words.
function milkPerDay(text) {
  const nums = readNumbers(text).filter((x) => x.value < 5000);
  if (!nums.length) return null;
  const unit = /(litre|liter|ltr)/i.test(text) ? 'litre' : /(packet|pkt|thaili|pouch)/i.test(text) || /doodh|milk/i.test(text) ? 'packet' : null;
  return unit ? { n: nums[0].value, unit } : null;
}

function percentOf(text) {
  if (!/(percent|%|pratishat|pratisat)/i.test(text)) return null;
  const nums = readNumbers(text).map((x) => x.value).filter((v) => v > 0 && v <= 100);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

/**
 * Checks a real operator's numbers pass without thinking. Each result says what was compared; a failure
 * also becomes a flag the interviewer follows up gently and the report cites as (Flag: math_<check>).
 */
export function checkTradeMath(memory) {
  const pack = tradeFor(memory);
  const h = pack?.hisaab;
  if (!h) return { results: [], flags: [] };
  const c = memory.collected;
  const sales = toNumber(c.monthly_sales);
  const results = [];
  const add = (check, pass, detail) => results.push({ check, pass, detail });
  const answerOf = (key) => (memory.tradeAnswers ?? []).filter((a) => a.key === key || a.key === `${key}:followup`).map((a) => a.answer).join(' ');

  const purchase = toNumber(c.monthly_purchase);
  if (h.purchaseToSales && purchase && sales) {
    const ratio = purchase / sales;
    const pass = ratio >= h.purchaseToSales.min && ratio <= h.purchaseToSales.max;
    add('purchase_vs_sales', pass, `Buys ${inr(purchase)} a month and sells ${inr(sales)} — purchases are ${Math.round(ratio * 100)}% of sales; for this trade (${pack.label}) it is usually ${h.purchaseToSales.expect}.`);
  }

  const stock = toNumber(c.stock_value);
  if (h.stockDays && stock && sales) {
    const days = stock / (sales / 30);
    const pass = days >= h.stockDays.min && days <= h.stockDays.max;
    add('stock_turnover', pass, `${inr(stock)} of stock against ${inr(sales)} of monthly sales is about ${Math.round(days)} days of selling; normal is ${h.stockDays.expect}.`);
  }

  const udhaar = toNumber(c.credit_given);
  if (h.udhaarPctOfSales && udhaar != null && sales) {
    const pct = (udhaar / sales) * 100;
    add('udhaar_vs_sales', pct <= h.udhaarPctOfSales.max, `Udhaar outstanding ${inr(udhaar)} is ${Math.round(pct)}% of a month's sales${pct > h.udhaarPctOfSales.max ? ' — money that may never come back' : ''}.`);
  }

  const milk = h.milkPricePerPacket ? milkPerDay(answerOf('daily_fast_mover')) : null;
  if (milk && sales) {
    const perMonth = milk.n * (milk.unit === 'litre' ? h.milkPricePerLitre : h.milkPricePerPacket) * 30;
    const pct = (perMonth / sales) * 100;
    add('milk_vs_sales', pct <= h.milkMaxPctOfSales, `${milk.n} ${milk.unit}s of milk a day is about ${inr(perMonth)} a month — ${Math.round(pct)}% of the ${inr(sales)} they say the whole shop sells.`);
  }

  const material = h.materialPct ? percentOf(answerOf('material_share')) : null;
  if (material != null) {
    const pass = material >= h.materialPct.min && material <= h.materialPct.max;
    add('material_share', pass, `Says material is about ${Math.round(material)}% of a project; for wiring work it is usually ${h.materialPct.expect}.`);
  }

  // A rate quoted in an insider answer against the market range: a coil price, a per-point labour rate.
  for (const range of h.answerRanges ?? []) {
    const quoted = readNumbers(answerOf(range.probe)).map((x) => x.value).find((v) => v >= (range.parseMin ?? 1));
    if (quoted == null) continue;
    add(`range_${range.probe}`, quoted >= range.min && quoted <= range.max, `Quoted ${inr(quoted)} for ${range.what}; the market is about ${range.expect}.`);
  }

  const flags = results.filter((r) => !r.pass).map((r) => ({
    type: 'trade_math', field: `math_${r.check}`, severity: 'medium', detail: r.detail,
  }));
  return { results, flags };
}

export function purposeSignals(collected, caseData) {
  const purpose = String(collected.loan_purpose ?? '');
  const current = lookupBusiness(collected.business_type || caseData?.businessKey || caseData?.business);
  const target = purpose ? lookupBusiness(purpose) : null;
  const otherTrade = !!target && target.id !== current?.id;
  const newVenture = !!purpose && (otherTrade || NEW_VENTURE.test(purpose));
  const personal = !!purpose && PERSONAL.test(purpose);

  const amount = toNumber(collected.loan_amount);
  const income = toNumber(collected.monthly_income) ?? (caseData?.declaredIncome || null);
  const months = amount && income ? amount / income : null;

  return {
    purpose,
    current: current?.label ?? null,
    target: otherTrade ? target.label : null,
    newVenture,
    personal,
    amount,
    income,
    months: months != null ? Math.round(months) : null,
    stretch: months != null && months > STRETCH_MONTHS,
  };
}
