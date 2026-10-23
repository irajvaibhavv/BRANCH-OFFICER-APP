// Friendly rechecks: when a figure just given disagrees with their own earlier figures or the bank statement, Sarthi
// says both numbers openly and asks again, while they are still on the call. Decided in code; the model only phrases it.
import { bankIncome, tradeOf, lookupBusiness, ventureArea } from './knowledge';
import { toNumber, toYears } from './verifier';
import { readNumbers } from './hindiNumbers';
import { FIELD_DEFS } from './memory';

// Every figure that does not add up is challenged, once per field (lead's ask, 2026-10-14) — at 7, the eighth mismatch
// (worst-month EMI cover) went unasked. 20 is a runaway guard, not a budget; MAX_TURNS still bounds the call.
export const MAX_RECHECKS = 20;

// Spoken money: "3.8 lakh", "18 hazaar". The model turns these into Devanagari for the voice.
export function inWords(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return String(n);
  if (Math.abs(v) >= 100000) return `${+(v / 100000).toFixed(1)} lakh`;
  if (Math.abs(v) >= 1000) return `${+(v / 1000).toFixed(1)} hazaar`;
  return String(v);
}

/**
 * Rechecks raised by THIS turn's facts. Each is { field, detail, say }: `field` is the one re-asked, `say` the
 * Hinglish the model is told to put in its own words, `detail` the English line the report shows.
 */
export function findRechecks(memory, caseData, facts = {}) {
  const c = memory.collected;
  const got = (k) => facts[k] != null && facts[k] !== '';
  const bank = bankIncome(caseData);
  const biz = tradeOf(c, caseData);
  const trade = biz?.label?.split(' / ')[0].toLowerCase() ?? 'is kaam';
  const income = toNumber(c.monthly_income);
  const sales = toNumber(c.monthly_sales);
  const customers = toNumber(c.customers_per_day);
  const bill = toNumber(c.avg_bill_value);
  const out = [];

  // Income against their own hisaab: what they say is left on 100 rupees × their sales. Their own numbers, so it goes
  // first — the gentlest way to show a gap.
  const margin = memory.statedMarginPct;
  if ((got('monthly_income') || got('monthly_sales')) && income && sales && margin) {
    const fromMargin = Math.round((sales * margin) / 100);
    if (income > fromMargin * 1.4) {
      out.push({
        field: 'monthly_income',
        detail: `Said ${margin} is left on every 100 of sales; on ${inWords(sales)} of sales that is about ${inWords(fromMargin)}, but income was given as ${inWords(income)}`,
        say: `Aapne bataya sau rupaye ki bikri pe ${margin} rupaye bachte hain, aur mahine ki bikri ${inWords(sales)} hai — toh mahine mein lagbhag ${inWords(fromMargin)} bachne chahiye. Lekin aapne ${inWords(income)} bataya${bank?.marginPct != null ? `, aur bank mein bhi mahine ka lagbhag ${inWords(bank.credits)} hi aata hai` : ''}. Yeh farak kahan se aata hai — koi aur kamai bhi hai?`,
      });
    }
  }

  // Income against the bank: people under-say it as often as they over-say it (profit after home expenses, one
  // partner's share), so both directions are asked — a low figure also sinks their own eligibility.
  if (got('monthly_income') && income && bank) {
    const diff = (income - bank.income) / bank.income;
    if (Math.abs(diff) > 0.4) {
      const seen = bank.marginPct != null
        ? `bank statement mein mahine ka lagbhag ${inWords(bank.credits)} ka len-den dikhta hai${customers ? `, aur aap roz ${customers} grahak bata rahe hain` : ''} — is hisaab se ${trade} mein kamai lagbhag ${inWords(bank.income)} ke aas-paas banti hai`
        : `bank statement mein mahine ka lagbhag ${inWords(bank.credits)} aata dikhta hai`;
      out.push({
        field: 'monthly_income',
        detail: `Said income ${inWords(income)}; the bank supports about ${inWords(bank.income)} (${bank.basis})`,
        say: `Aapne mahine ki kamai ${inWords(income)} batayi. Lekin ${seen}. ${diff < 0
          ? 'Kahin kuch chhoot toh nahi gaya — ghar ka kharcha nikaal ke toh nahi bataya? Ek baar phir se soch ke bataiye.'
          : 'Toh baaki kamai kahan se aati hai — koi aur kaam ya cash jo bank mein nahi aata?'}`,
      });
    }
  }

  // Sales against the bank. Above it is usually cash that never reaches the account — worth hearing them say so.
  if (got('monthly_sales') && sales && bank?.marginPct != null) {
    const ratio = sales / bank.credits;
    if (ratio > 1.6 || ratio < 0.6) {
      out.push({
        field: 'monthly_sales',
        detail: `Said sales ${inWords(sales)} a month; bank credits are about ${inWords(bank.credits)}`,
        say: `Aapne mahine ki bikri ${inWords(sales)} batayi, aur bank mein mahine ka lagbhag ${inWords(bank.credits)} aata hai. ${ratio > 1
          ? 'Toh baaki bikri cash mein rehti hai kya, jo bank mein jama nahi hoti?'
          : 'Bank mein toh isse zyada aata dikh raha hai — kya account mein koi aur paisa bhi aata hai, ya bikri thodi zyada hai?'}`,
      });
    }
  }

  // Their own footfall × bill against their own monthly sales (mostly walk-ins, who are asked the bill).
  if ((got('monthly_sales') || got('avg_bill_value') || got('customers_per_day')) && customers && bill && sales) {
    const est = customers * bill * 30;
    if (Math.abs(sales - est) / est > 0.5) {
      out.push({
        field: 'monthly_sales',
        detail: `${customers} customers × ${bill} average bill × 30 days is about ${inWords(est)}, but sales were given as ${inWords(sales)}`,
        say: `Roz ${customers} grahak aur har bill lagbhag ${bill} rupaye — toh mahine ki bikri lagbhag ${inWords(est)} banti hai, aur aapne ${inWords(sales)} batayi. Ek baar dobara hisaab laga ke bataiye?`,
      });
    }
  }

  // Footfall against the bank: the bill it implies should look like the trade's.
  if (got('customers_per_day') && customers && !bill && bank?.marginPct != null && biz?.avgBillValue) {
    const implied = Math.round(bank.credits / (customers * 30));
    if (implied < biz.avgBillValue.min * 0.5 || implied > biz.avgBillValue.max * 2) {
      out.push({
        field: 'customers_per_day',
        detail: `${customers} customers a day against ${inWords(bank.credits)} of monthly bank credits implies a ${implied}-rupee average bill; the trade runs ${biz.avgBillValue.min}-${biz.avgBillValue.max}`,
        say: `Roz ${customers} grahak, aur bank mein mahine ka lagbhag ${inWords(bank.credits)} — matlab har grahak ka bill lagbhag ${implied} rupaye banta hai. Kya yeh sahi lag raha hai, ya grahak thode kam-zyada aate hain?`,
      });
    }
  }

  // Income against their own sales: a take-home above the trade's net margin usually means a cost was forgotten.
  if ((got('monthly_income') || got('monthly_sales')) && income && sales && biz?.hisaab?.netMarginMaxPct) {
    const pct = Math.round((income / sales) * 100);
    if (pct > biz.hisaab.netMarginMaxPct * 1.3) {
      out.push({
        field: 'monthly_income',
        detail: `Take-home ${inWords(income)} is ${pct}% of the ${inWords(sales)} of sales they gave; the trade nets up to ${biz.hisaab.netMarginMaxPct}%`,
        say: `Mahine ki bikri ${inWords(sales)} aur kamai ${inWords(income)} — yaani har 100 rupaye ki bikri pe ${pct} rupaye bachte hain. Kya yeh kiraya, maal aur baaki kharcha nikaal ke hai?`,
      });
    }
  }

  // Running EMIs below the bureau: a forgotten loan is common, so name the one on record.
  const brief = caseData?.brief ?? {};
  const emi = toNumber(c.existing_emi);
  if (got('existing_emi') && emi != null && brief.existingEMIs && emi < brief.existingEMIs * 0.8) {
    const loans = (brief.runningLoans ?? []).map((l) => `${l.type} ki kisht ${inWords(l.emi)}`).join(', ');
    out.push({
      field: 'existing_emi',
      detail: `Said running EMIs are ${inWords(emi)}; the bureau shows ${inWords(brief.existingEMIs)}`,
      say: `Aapne kisht ${emi ? inWords(emi) : 'koi nahi'} batayi, lekin record mein ${loans || `mahine ki kisht ${inWords(brief.existingEMIs)}`} dikh rahi hai. Shayad yaad nahi raha — ek baar bata dijiye kaunsi kishten chal rahi hain?`,
    });
  }

  // Denies other applications while the bureau shows enquiries — maybe a form filled at a shop or by an agent.
  const enquiries = brief.bureau?.enquiries6m;
  if (got('recent_loan_applications') && enquiries >= 2 && /^\s*(no|none|nahi|nahin|nhi|na|koi nahi|kahin nahi|kuch nahi|never)\b/i.test(String(c.recent_loan_applications))) {
    out.push({
      field: 'recent_loan_applications',
      detail: `Said no other loan applications; the bureau shows ${enquiries} enquiries in 6 months`,
      say: `Record mein pichhle 6 mahine mein ${enquiries} jagah se loan ki poochh-taachh dikh rahi hai. Shayad kisi dukaan pe EMI pe saamaan ya kisi agent ke through form bhara ho — yaad hai kuch?`,
    });
  }

  // A new shop: the hisaab a branch officer does on a site visit, on the call — rent against the area, the rent against
  // what the shop can earn, and the setup cost against the loan.
  const vRent = toNumber(c.venture_rent);
  if (got('venture_rent') && vRent) {
    const va = ventureArea(c, caseData);
    const r = va?.avgShopRent;
    const cheap = r && vRent < r.min * 0.5;
    const dear = r && vRent > r.max * 1.5;
    if (cheap || dear) {
      // Surveyed areas are quoted; tier ranges are indicative, so only the direction is said.
      const norm = va.source === 'specific'
        ? `Hamare hisaab se ${va.areaKey} mein dukaan ka kiraya aam taur pe ${inWords(r.min)} se ${inWords(r.max)} ke beech hota hai.`
        : `Aise shehar mein dukaan ka kiraya aam taur pe isse kaafi ${cheap ? 'zyada' : 'kam'} hota hai.`;
      out.push({
        field: 'venture_rent',
        detail: `New shop rent given as ${inWords(vRent)} at "${c.venture_location}"; ${va.source === 'specific' ? va.areaKey : `${va.label ?? 'tier'} (indicative)`} shop rents run ${inWords(r.min)}-${inWords(r.max)}`,
        say: `Aapne ${c.venture_location} mein kiraya ${inWords(vRent)} bataya. ${norm} ${cheap ? 'Itne kam mein jagah kaise mil rahi hai — kya baat pakki ho gayi hai?' : 'Itna kiraya dekar dukaan mein kitna bachega?'}`,
      });
    }
  }

  const est = toNumber(c.venture_sales_estimate);
  if ((got('venture_sales_estimate') || got('venture_rent')) && est && vRent) {
    const target = lookupBusiness(c.loan_purpose) ?? biz;
    const pct = target?.typicalMarginPct ? Math.round((target.typicalMarginPct.min + target.typicalMarginPct.max) / 2) : 15;
    const profit = Math.round((est * pct) / 100);
    if (vRent > profit * 0.5) {
      const left = profit - vRent;
      out.push({
        field: 'venture_sales_estimate',
        detail: `Expected sales ${inWords(est)} at about ${pct}% margin${target ? ` (${target.label})` : ''} leaves about ${inWords(profit)}; rent ${inWords(vRent)} takes ${Math.round((vRent / Math.max(profit, 1)) * 100)}% of it`,
        say: `Andaza hai mahine ki bikri ${inWords(est)}. ${target ? `${target.label.split(' / ')[0]} mein` : 'Aise kaam mein'} aam taur pe sau rupaye pe lagbhag ${pct} rupaye bachte hain — yaani mahine ke lagbhag ${inWords(profit)}. ${inWords(vRent)} kiraya dene ke baad ${left > 0 ? `sirf ${inWords(left)} bachenge` : 'kuch nahi bachega'}. Toh kisht aur ghar ka kharcha kaise niklega?`,
      });
    }
  }

  const setup = toNumber(c.venture_setup_cost);
  const amount = toNumber(c.loan_amount) ?? (caseData?.loanAmountRequested || null);
  if (got('venture_setup_cost') && setup && amount) {
    if (amount > setup * 1.3) {
      out.push({
        field: 'venture_setup_cost',
        detail: `Setup cost given as ${inWords(setup)} but the loan asked is ${inWords(amount)}`,
        say: `Aapne nayi dukaan ka kul kharcha ${inWords(setup)} bataya, lekin loan ${inWords(amount)} ka chahiye. Baaki ${inWords(amount - setup)} kahan lagenge?`,
      });
    } else if (setup > amount * 2) {
      out.push({
        field: 'venture_setup_cost',
        detail: `Setup cost ${inWords(setup)} is over twice the ${inWords(amount)} loan`,
        say: `Kul kharcha ${inWords(setup)} aur loan ${inWords(amount)} — baaki ${inWords(setup - amount)} ka intezaam kahan se hoga?`,
      });
    }
  }

  // What is left after the supplier and the running costs. An indicative residual, never profit: unsold stock, udhaar,
  // tax and household withdrawals all move it — so it is shown to them and asked about, not concluded.
  const purchase = toNumber(c.monthly_purchase);
  const costs = toNumber(c.monthly_expenses);
  if ((got('monthly_purchase') || got('monthly_expenses') || got('monthly_sales') || got('monthly_income')) && sales && purchase != null && costs != null) {
    const residual = sales - purchase - costs;
    if (residual <= 0 || (income && income > residual * 1.3 + 3000)) {
      out.push({
        field: 'hisaab_residual',
        detail: `Sales ${inWords(sales)} − purchases ${inWords(purchase)} − running costs ${inWords(costs)} leaves about ${inWords(residual)} a month (indicative, not verified profit)${income ? `; income was given as ${inWords(income)}` : ''}`,
        say: `Aapne bataya mahine ki bikri ${inWords(sales)}, maal ${inWords(purchase)} ka aata hai, aur baaki kharcha ${inWords(costs)}. ${residual <= 0
          ? 'Is hisaab se toh kuch bachta hi nahi dikh raha.'
          : `Is hisaab se lagbhag ${inWords(residual)} bachta hai${income ? `, aur aapne kamai ${inWords(income)} batayi` : ''}.`} Supplier aur kharcha dene ke baad aam taur par aapke paas kitna bachta hai? Aur dukaan mein pada maal aur grahakon ka udhaar aap kaise ginte hain?`,
      });
    }
  }

  // A real day and a real week against the month they gave. Yesterday may have been unusual — asked, never assumed.
  const yesterday = toNumber(c.sales_yesterday);
  if ((got('sales_yesterday') || got('monthly_sales')) && sales && yesterday) {
    const ratio = (yesterday * 26) / sales;
    if (ratio > 1.8 || ratio < 0.45) {
      out.push({
        field: 'sales_yesterday',
        detail: `Yesterday's sales ${inWords(yesterday)} × 26 days ≈ ${inWords(yesterday * 26)}, against monthly sales of ${inWords(sales)}`,
        say: `Kal ki bikri ${inWords(yesterday)} batayi — is hisaab se mahine ki lagbhag ${inWords(yesterday * 26)} banti hai, aur aapne mahine ki ${inWords(sales)} batayi. Kal aam din tha, ya kuch alag tha?`,
      });
    }
  }
  const week = toNumber(c.sales_last_week);
  if ((got('sales_last_week') || got('monthly_sales')) && sales && week) {
    const ratio = (week * 4.3) / sales;
    if (ratio > 1.7 || ratio < 0.55) {
      out.push({
        field: 'sales_last_week',
        detail: `Last week's sales ${inWords(week)} × 4.3 ≈ ${inWords(week * 4.3)} a month, against ${inWords(sales)} given for the month`,
        say: `Pichhle hafte ki bikri ${inWords(week)} batayi — is hisaab se mahine ki lagbhag ${inWords(week * 4.3)} banti hai, aur aapne ${inWords(sales)} batayi. Woh hafta aam tha, ya kuch alag tha?`,
      });
    }
  }

  // Salaried: a year of in-hand pay is usually 60-90% of the CTC (PF, tax, variable pay). Above the CTC is impossible;
  // far below it means the package or the in-hand figure is off.
  const ctc = toNumber(c.annual_ctc);
  if ((got('annual_ctc') || got('monthly_income')) && ctc && income) {
    const share = (income * 12) / ctc;
    if (share > 1.05 || share < 0.45) {
      out.push({
        field: 'monthly_income',
        detail: `In-hand salary ${inWords(income)} a month is ${Math.round(share * 100)}% of the ${inWords(ctc)} CTC over a year (usually 60-90%)`,
        say: `Aapne saal ka package ${inWords(ctc)} bataya, aur haath mein mahine ki ${inWords(income)} — yaani saal ka ${inWords(income * 12)}. ${share > 1
          ? 'Yeh toh package se zyada ho gaya — kya haath ki salary mein kuch aur bhi judta hai?'
          : 'Package ke hisaab se haath mein thoda kam lag raha hai — kya kuch katta hai, ya package ka figure alag hai?'}`,
      });
    }
  }
  const inJob = toYears(c.job_years);
  const career = toYears(c.total_experience);
  if ((got('job_years') || got('total_experience')) && inJob != null && career != null && inJob > career + 0.5) {
    out.push({
      field: 'total_experience',
      detail: `${inJob} years in the current job but ${career} years of experience in all`,
      say: `Aapne bataya is company mein ${inJob} saal se hain, lekin kul experience ${career} saal ka. Yeh thoda samajh nahi aaya — ek baar phir bataiye?`,
    });
  }

  // School fees and the elder's medicine are fixed outgoings: they must fit inside the house kharcha they gave, and in
  // what comes in. Said back with their own numbers.
  const fam = familyHisaab(c);
  const house = toNumber(c.household_expenses);
  if (['school_fees', 'medicine_monthly', 'household_expenses'].some(got) && fam.fixed && house && fam.fixed > house) {
    out.push({
      field: 'household_expenses',
      detail: `School fees and medicine alone (${inWords(fam.fixed)}) are more than the household expenses given (${inWords(house)})`,
      say: `Aapne ghar ka mahine ka kharcha ${inWords(house)} bataya, lekin ${[fam.fees && `school ki fees ${inWords(fam.fees)}`, fam.medicine && `dawai ${inWords(fam.medicine)}`].filter(Boolean).join(' aur ')} milakar hi ${inWords(fam.fixed)} ho jaata hai. Toh ghar ka poora kharcha kitna banta hai?`,
    });
  } else if (['school_fees', 'medicine_monthly', 'monthly_income'].some(got) && fam.fixed && fam.inflow && fam.fixed > fam.inflow * 0.3) {
    out.push({
      field: fam.fees ? 'school_fees' : 'medicine_monthly',
      detail: `School fees and medicine (${inWords(fam.fixed)}) are ${Math.round((fam.fixed / fam.inflow) * 100)}% of the household income given (${inWords(fam.inflow)})`,
      say: `Fees aur dawai milakar mahine ka ${inWords(fam.fixed)} jaata hai, aur ghar ki kamai ${inWords(fam.inflow)} bataayi — yeh kaafi bada hissa hai. Isko kaise manage karte hain, koi aur madad karta hai?`,
    });
  }

  return out;
}

/** The household's month in their own words: in, fixed outgoings, and what is left — the closest the PD gets to savings. */
export function familyHisaab(c) {
  const fees = toNumber(c.school_fees) ?? 0;
  const medicine = toNumber(c.medicine_monthly) ?? 0;
  const income = toNumber(c.monthly_income);
  const inflow = income == null ? null : income + (toNumber(c.other_household_income) ?? 0);
  // The house kharcha they gave may or may not include fees and medicine, so take the larger, never the sum.
  const house = Math.max(toNumber(c.household_expenses) ?? 0, fees + medicine);
  const out = house + (toNumber(c.monthly_rent) ?? 0) + (toNumber(c.existing_emi) ?? 0);
  return { fees, medicine, fixed: fees + medicine, inflow, outgo: out, left: inflow == null || !out ? null : inflow - out };
}

// Counts added up from several people, and yes/no-ish numbers: a different figure there is not a changed story.
const NO_DRIFT = new Set(['family_size', 'dependents', 'earning_members', 'children_count', 'elderly_count', 'children_in_school', 'aadhaar_number', 'pan_number']);

/**
 * Their own earlier figure, said differently in a later answer ("pehle 2 lakh bikri, ab 3 lakh"). acceptedFacts keeps
 * the old value because the new one did not answer that question, so without this the clash vanished silently. The new
 * figure must be one they actually said (or it in thousands/lakhs) — never the extractor's reading alone — and within 4×
 * of the old one: 180 litres filed under monthly purchase of 1.5 lakh is a different quantity, not a changed story.
 */
export function driftRechecks(memory, facts = {}, text = '') {
  const heard = readNumbers(text).map((n) => n.value);
  const said = (v) => heard.some((h) => h === v || h * 1000 === v || h * 100000 === v);
  return Object.entries(facts).flatMap(([k, v]) => {
    const was = toNumber(memory.collected[k]);
    const now = toNumber(v);
    if (!was || !now || NO_DRIFT.has(k) || !said(now)) return [];
    const ratio = now / was;
    if ((ratio > 0.75 && ratio < 1.33) || ratio < 0.25 || ratio > 4) return [];
    const label = (FIELD_DEFS[k]?.label ?? k.replace(/_/g, ' ')).toLowerCase();
    return [{
      field: k,
      detail: `Gave ${label} as ${inWords(was)}, later said ${inWords(now)}`,
      say: `Pehle aapne ${label} ${inWords(was)} bataya tha, abhi ${inWords(now)} keh rahe hain. Sahi kitna hai — thoda samjha dijiye?`,
    }];
  });
}

// Flags from the contradiction, hisaab and consistency checks, asked on the call instead of only landing in the report.
// No `say`: their details are English and some name the trade's normal range, which must never be told to them.
const ASK_FLAGS = new Set(['contradiction', 'coaching_detected', 'trade_math', 'internal_consistency', 'repeat_pd']);
export const flagRechecks = (flags = []) => flags
  .filter((f) => ASK_FLAGS.has(f.type) && f.severity !== 'low')
  .map((f) => ({ field: f.field, detail: f.detail, say: f.say ?? null })); // only repeat_pd carries one: both figures are theirs

/**
 * Queue this turn's rechecks, one per field for the whole interview, and settle any open flag on the same field.
 * Order: drift (their own words clash), then this module's checks, then flags from the other checks.
 */
export function queueRechecks(memory, caseData, facts, { drift = [], flags: raised = [] } = {}) {
  const done = new Set([...(memory.recheckAsked ?? []), ...(memory.recheckQueue ?? []).map((r) => r.field)]);
  const room = MAX_RECHECKS - done.size;
  const fresh = [...drift, ...findRechecks(memory, caseData, facts), ...flagRechecks(raised)]
    .filter((r, i, all) => !done.has(r.field) && all.findIndex((o) => o.field === r.field) === i)
    .slice(0, Math.max(0, room));
  if (!fresh.length) return memory;
  const fields = new Set(fresh.map((r) => r.field));
  // The recheck IS the follow-up; the gentle "OPEN FLAGS" nudge would ask the same thing a second time.
  const flags = memory.flags.map((f) => (fields.has(f.field) ? { ...f, followedUp: true } : f));
  return { ...memory, flags, recheckQueue: [...(memory.recheckQueue ?? []), ...fresh.map((r) => ({ ...r, before: memory.collected[r.field], turn: memory.turnCount }))] };
}

/** What they said when shown the gap, and whether the figure moved. */
export function recordRecheckAnswer(memory, recheck, question, text, turn) {
  const after = memory.collected[recheck.field];
  const entry = { field: recheck.field, detail: recheck.detail, before: recheck.before, after, changed: String(after) !== String(recheck.before), asked: question, answer: text, turn };
  // A corrected income is not coaching: the later re-ask is compared with the corrected figure, not the forgotten one.
  const incomeMentions = recheck.field === 'monthly_income' && entry.changed ? memory.income_mentions.slice(-1) : memory.income_mentions;
  return { ...memory, income_mentions: incomeMentions, rechecks: [...(memory.rechecks ?? []), entry] };
}
