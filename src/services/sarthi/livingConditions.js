// Living conditions, as an officer would write them after a home visit: the facts the home photos show, then a few
// sentences on whether they fit the income. No scores or bands.
import { bankIncome } from './knowledge';
import { askAgent } from './agent';

export const LABELS = {
  kachha: 'Kachha', semi_pucca: 'Semi-pucca', pucca: 'Pucca', car: 'Car', tractor: 'Tractor', two_wheeler: 'Two-wheeler',
  auto_rickshaw: 'Auto-rickshaw', bicycle: 'Bicycle', ac: 'AC', fridge: 'Fridge', washing_machine: 'Washing machine', tv: 'TV',
  sofa: 'Sofa', computer: 'Computer', dining_table: 'Dining table', cooler: 'Cooler', almirah: 'Almirah', bed: 'Bed',
};

const inr = (n) => `Rs ${Math.round(n).toLocaleString('en-IN')}`;

/** What the home photos show, next to what the file and the call say. Null when no home photo was read. */
export function livingFacts(photos = [], caseData = {}, collected = {}) {
  const seen = photos.filter((p) => p.living && !p.skipped);
  if (!seen.length) return null;
  const bank = bankIncome(caseData);
  return {
    house: seen.map((p) => p.living.house).find((h) => h && h !== 'unclear') ?? null,
    floors: seen.map((p) => p.living.floors).find((f) => Number.isFinite(f)) ?? null,
    vehicles: [...new Set(seen.flatMap((p) => p.living.vehicles ?? []))].filter((v) => LABELS[v]),
    items: [...new Set(seen.flatMap((p) => p.living.items ?? []))].filter((i) => LABELS[i]),
    insideSeen: seen.some((p) => p.kind === 'home_inside'),
    observations: seen.map((p) => p.observation).filter(Boolean),
    bankIncome: bank?.income ?? null,
    declaredIncome: Number(collected.monthly_income) || caseData.declaredIncome || null,
    residence: collected.residence_type ?? null,
    assetsSaid: collected.assets ?? null,
    loansSaid: collected.existing_loans ?? null,
    bureauLoans: (caseData.brief?.runningLoans ?? []).map((l) => l.type),
  };
}

/** The facts as plain lines — shown on the report, and the only thing the analysis may use. */
export function factLines(f) {
  return [
    `House: ${f.house ? LABELS[f.house] : 'type not clear from the photo'}${f.floors ? `, ${f.floors} floor${f.floors > 1 ? 's' : ''}` : ''}${f.residence ? ` (they said ${f.residence})` : ''}`,
    f.vehicles.length ? `Vehicles seen: ${f.vehicles.map((k) => LABELS[k]).join(', ')}` : 'No vehicle seen',
    f.insideSeen ? (f.items.length ? `Inside the home: ${f.items.map((k) => LABELS[k]).join(', ')}` : 'Inside the home: no appliances or furniture of note') : 'No photo from inside the home',
    `Income: ${f.bankIncome ? `bank supports about ${inr(f.bankIncome)} a month` : 'no bank statement'}${f.declaredIncome ? `; they claim ${inr(f.declaredIncome)}` : ''}`,
    `Assets they mentioned: ${f.assetsSaid || 'none'} · loans on the bureau: ${f.bureauLoans.length ? f.bureauLoans.join(', ') : 'none'}`,
  ];
}

const SYSTEM = `You help a loan officer in India write up a home visit. You get FACTS read from the applicant's home photos and
from the file. Write 3-4 short, plain sentences: what the home shows, whether that fits the income the bank supports and the
income they claim, anything that does not fit (a vehicle or appliance they did not mention, a home far above or below the
income), and what the officer could ask. Use only the facts given. No scores, ratings or bands. Never conclude fraud — a joint
family, an inherited home, gifts or a second earner can explain a gap, so say what to ask, not what is true. Never comment
on caste, religion, people or taste. Plain text only, no headings or bullets.`;

/** The officer-style analysis: written by the model from the facts; without one, the facts stand on their own. */
export async function analyseLiving(facts) {
  if (!facts) return null;
  try {
    const text = await askAgent({
      systemPrompt: SYSTEM,
      messages: [{ role: 'user', content: `FACTS:\n${factLines(facts).join('\n')}${facts.observations.length ? `\nPhoto descriptions:\n${facts.observations.join('\n')}` : ''}` }],
      temperature: 0.2, maxTokens: 400, provider: 'llm', retries: 1,
    });
    return text.trim() || null;
  } catch (e) {
    console.warn(`[sarthi] living analysis failed (${e?.message}) — facts only`);
    return null;
  }
}
