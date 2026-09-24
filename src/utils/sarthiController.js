/*
  SARTHI — the conversation controller.

  Plain JavaScript. No model call anywhere in this file.

  The split this file exists to enforce: the CONTROLLER decides what to ask next, the MODEL only
  decides how to phrase it. A model left to run the interview on its own drifts — it forgets to
  ask about existing EMIs, or asks the income question twice in a row, or wanders off the schema
  entirely on a long call. Walking pdSchema.json in code makes coverage a property of the program
  rather than something we hope the model remembers.

  It also produces the flags the model is never allowed to produce: contradictions against the
  Borrower Brief, and — for a walk-in with no brief at all — contradictions of the borrower's own
  numbers against each other.
*/
import pdSchema from '../data/sarthi/pdSchema.json';
import { lookupLocation, lookupBusiness, hasAreaDetail } from './sarthiTools';
import { getMissingFields, knownFacts, enterSection } from './sarthiMemory';
import { toNumber, toYears } from './sarthiVerifier';

const SECTIONS = pdSchema.sections;

/* ============================================================ interview shape */

/**
 * A walk-in has no bank credits to check anything against, so the interview changes shape:
 * it asks the extra business questions that make internal consistency computable, and income is
 * derived from their own numbers rather than read off a statement.
 */
export function getInterviewConfig(caseData) {
  const isNewApplicant = !caseData?.brief?.avgMonthlyCredit;
  return {
    isNewApplicant,
    extraSections: isNewApplicant ? ['business_deep_dive'] : [],
    verificationStrategy: isNewApplicant ? 'internal_consistency' : 'brief_comparison',
    estimatedQuestions: isNewApplicant ? 24 : 18,
    incomeMethod: isNewApplicant ? 'calculated_from_answers' : 'bank_credits',
  };
}

/** The sections that apply to this case, in order. */
export function activeSections(config) {
  return SECTIONS.filter((s) => {
    if (s.condition === 'no_borrower_brief') return config.isNewApplicant;
    return true;
  });
}

/* ============================================================ what to ask next */

function sectionComplete(memory, section) {
  const started = memory.sectionStartTurn[section.id] ?? memory.turnCount;
  const servedTime = memory.turnCount >= started + (section.minTurns ?? 1);

  if (section.type === 'fixed') return servedTime;

  if (section.type === 'verification') {
    return section.tasks.every((t) => memory.collected[`${t.key}_score`] != null);
  }

  if (section.type === 'coaching_check') {
    // Done once income has been stated a second time, or once we have spent the turns trying.
    return memory.income_mentions.length >= 2 || servedTime;
  }

  return getMissingFields(memory, section).length === 0;
}

/**
 * The next instruction for the model. Returns `{ action: 'end_interview' }` when the schema is
 * satisfied — that, not the model's own sense of being finished, is what ends the interview.
 */
export function getNextAction(memory, caseData) {
  const config = getInterviewConfig(caseData);
  const sections = activeSections(config);
  const idx = Math.max(0, sections.findIndex((s) => s.id === memory.currentSection));

  // Walk forward past everything already satisfied.
  let cursor = idx;
  while (cursor < sections.length && sectionComplete(memory, sections[cursor])) cursor += 1;
  if (cursor >= sections.length) return { action: 'end_interview' };

  const section = sections[cursor];
  const instruction = buildInstruction(memory, section, caseData, config);
  return { ...instruction, memory: enterSection(memory, section.id) };
}

function buildInstruction(memory, section, caseData, config) {
  const area = lookupLocation(caseData.areaKey || caseData.area);
  const biz = lookupBusiness(memory.collected.business_type || caseData.businessKey || caseData.business);

  const instruction = {
    action: 'ask_question',
    section: section.id,
    sectionLabel: section.label,
    isNewApplicant: config.isNewApplicant,
  };

  if (section.type === 'fixed') {
    instruction.directive = section.action;
  } else if (section.type === 'verification') {
    // sectionComplete already skips this section once every task is scored, so `task` is set in
    // practice; the fallback keeps a malformed schema from producing an empty directive.
    const task = section.tasks.find((t) => memory.collected[`${t.key}_score`] == null) ?? section.tasks[0];
    instruction.verificationTask = task.key;

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
  } else if (section.type === 'coaching_check') {
    instruction.directive = section.action;
    instruction.previousMention = memory.income_mentions[0] ?? null;
  } else {
    const missing = getMissingFields(memory, section);
    // One field at a time. Naming the next two lets the model bridge naturally without asking both.
    instruction.missingFields = missing.map((f) => f.key);
    instruction.directive = `Ask about: ${missing.slice(0, 2).map((f) => f.label).join(', then ')}. Ask ONE at a time.`;
    if (section.id === 'documents') {
      instruction.directive += ' These are verbal cross-checks only — never say or imply the document is being verified.';
    }
  }

  // Hyper-local check fires once, as soon as a 2+ year claim gives it something to test.
  const hyperLocal = getHyperLocalInstruction(memory, caseData);
  if (hyperLocal && !memory.askedHyperLocal) instruction.hyperLocal = hyperLocal;

  if (caseData.riskPatternMatch && !memory.askedRisk) {
    instruction.riskAlert = caseData.riskPatternMatch;
  }

  const open = memory.flags.filter((f) => !f.followedUp);
  if (open.length) {
    instruction.contradictions = open;
    instruction.directive += ' Also follow up naturally on the flagged items below. Never confront, never say they contradicted themselves.';
  }

  instruction.known = knownFacts(memory);
  return instruction;
}

/**
 * A 2+ year claim is testable: a real long-term resident answers "which thana" instantly, and
 * someone coached on a script does not. We judge confidence, not correctness — the model may use
 * its own knowledge of the area here because we are testing the customer, not stating a fact in
 * the report.
 */
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

/* ============================================================ flags */

/**
 * Compare what they just said against what the file already says.
 * Only runs where there is something to compare against — a walk-in gets internal consistency
 * instead, below.
 */
export function checkContradictions(memory, facts, caseData) {
  const flags = [];
  const brief = caseData?.brief ?? {};

  const income = toNumber(facts.monthly_income);
  if (income != null && brief.avgMonthlyCredit) {
    const diff = ((income - brief.avgMonthlyCredit) / brief.avgMonthlyCredit) * 100;
    if (diff > 40) {
      flags.push({
        type: 'contradiction', field: 'monthly_income',
        declared: income, known: brief.avgMonthlyCredit, diff: Math.round(diff),
        severity: diff > 80 ? 'high' : 'medium',
        detail: `Declared income ${income} is ${Math.round(diff)}% above bank credits ${brief.avgMonthlyCredit}`,
        turn: memory.turnCount,
      });
    }
  }

  const rent = toNumber(facts.monthly_rent);
  if (rent != null) {
    const area = lookupLocation(caseData?.areaKey || caseData?.area);
    if (area?.avgShopRent && rent < area.avgShopRent.min * 0.5) {
      flags.push({
        type: 'contradiction', field: 'monthly_rent',
        declared: rent, known: area.avgShopRent.min,
        severity: area.source === 'specific' ? 'medium' : 'low',
        detail: `Declared rent ${rent} is below the ${area.source === 'specific' ? 'area' : 'tier'} minimum ${area.avgShopRent.min}`,
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

  // The coaching tell: the same figure, asked in different words, comes back different.
  if (income != null && memory.income_mentions.length) {
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

/**
 * Internal consistency — the primary weapon when there is no bank statement to check against.
 * Every check here compares the borrower's own numbers with each other, or with the margin
 * ranges in businessKnowledge.json. Nothing external is needed, so it works for a total walk-in.
 */
export function checkInternalConsistency(memory, caseData) {
  const flags = [];
  const c = memory.collected;
  const biz = lookupBusiness(c.business_type || caseData?.businessKey || caseData?.business);

  const customers = toNumber(c.customers_per_day);
  const bill = toNumber(c.avg_bill_value);
  const sales = toNumber(c.monthly_sales);
  const income = toNumber(c.monthly_income);
  const estimatedSales = customers != null && bill != null ? customers * bill * 30 : null;

  // 1. Their own footfall arithmetic against their own declared turnover.
  if (estimatedSales && sales != null && estimatedSales > 0) {
    const drift = Math.abs(sales - estimatedSales) / estimatedSales;
    if (drift > 0.5) {
      flags.push({
        type: 'internal_consistency', field: 'monthly_sales', severity: 'medium',
        detail: `Declared sales ${sales}, but ${customers} customers × ${bill} average × 30 days works out to about ${Math.round(estimatedSales)}`,
      });
    }
  }

  // 2. Declared income against the best margin their own trade actually earns.
  if (estimatedSales && income != null && biz?.typicalMarginPct) {
    const ceiling = estimatedSales * (biz.typicalMarginPct.max / 100);
    if (income > ceiling * 1.5) {
      flags.push({
        type: 'internal_consistency', field: 'monthly_income', severity: 'high',
        detail: `Income ${income} is not supported by their own numbers: at ${biz.typicalMarginPct.max}% margin on about ${Math.round(estimatedSales)} of sales, the most it could be is roughly ${Math.round(ceiling)}`,
      });
    }
  }

  // 3. Can they actually live on what is left?
  if (income != null) {
    const outgo = (toNumber(c.household_expenses) ?? 0) + (toNumber(c.monthly_rent) ?? 0) + (toNumber(c.existing_emi) ?? 0);
    if (outgo > 0 && outgo > income * 0.95) {
      flags.push({
        type: 'internal_consistency', field: 'expenses_vs_income', severity: 'medium',
        detail: `Stated outgoings (${outgo}) take up nearly all of the stated income (${income}). Ask how the household is managing.`,
      });
    }
  }

  // 4. Turnover with nobody to serve it — unless it is a trade one person genuinely runs alone.
  const employees = toNumber(c.employees);
  if (sales != null && sales > 500000 && employees === 0 && biz && !biz.soloOk) {
    flags.push({
      type: 'internal_consistency', field: 'employees_vs_sales', severity: 'low',
      detail: `${sales} of monthly sales claimed with no helper at all, which is unusual for ${biz.label}`,
    });
  }

  // 5. Rent eating the income.
  const rent = toNumber(c.monthly_rent);
  if (rent != null && income) {
    const pct = (rent / income) * 100;
    if (pct > 40) {
      flags.push({
        type: 'internal_consistency', field: 'rent_vs_income', severity: 'medium',
        detail: `Rent ${rent} is ${Math.round(pct)}% of income ${income}. Above 40% is unusual and squeezes any EMI.`,
      });
    }
  }

  return flags;
}

/**
 * What income should eligibility actually be computed on.
 *
 * With a bank statement, the statement wins — a declaration is not evidence. Without one, we
 * rebuild income from the borrower's own footfall and their trade's real margin, and take the
 * LOWER of that and what they declared. Conservative on purpose: lending against an unverified
 * number is the mistake this whole product exists to prevent.
 */
export function assessIncome(memory, caseData) {
  const brief = caseData?.brief ?? {};
  if (brief.avgMonthlyCredit) {
    return { income: brief.avgMonthlyCredit, method: 'bank_credits', source: 'Brief: avgMonthlyCredit', assessable: true };
  }

  const c = memory?.collected ?? {};
  const customers = toNumber(c.customers_per_day);
  const bill = toNumber(c.avg_bill_value);
  const declared = toNumber(c.monthly_income) ?? toNumber(caseData?.declaredIncome);

  if (customers != null && bill != null) {
    const biz = lookupBusiness(c.business_type || caseData?.businessKey || caseData?.business);
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

  // Not enough of their own numbers to rebuild anything. Say so rather than trust a declaration.
  return {
    income: null,
    declared,
    method: 'none',
    source: 'No bank statement, and not enough business detail to rebuild income from answers',
    assessable: false,
  };
}

/* ============================================================ prompt rendering */

/**
 * Turn an instruction into the block injected into Agent 1's prompt for this one turn.
 * Kept here so what the controller decided and what the model is told can never drift apart.
 */
export function directiveText(instruction) {
  if (!instruction || instruction.action === 'end_interview') {
    return 'THIS TURN: every topic is covered. Thank them warmly, tell them the officer will follow up, and end the interview with [INTERVIEW_COMPLETE].';
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
