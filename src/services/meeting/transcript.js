// Deterministic per-DSA meeting transcript + summary (stands in for STT + LLM).
import { toISODate, formatDate } from '../../utils/formatters';

const COMPETITORS = ['HDFC', 'Bajaj Finserv', 'Tata Capital', 'ICICI', 'Aditya Birla'];
const BORROWERS = ['Sai Enterprises', 'Mehta Textiles', 'Rohan Kale', 'Nandini Traders', 'Om Sai Motors'];

const pick = (arr, seed) => arr[seed % arr.length];
const seedOf = (id = '') => [...id].reduce((s, c) => s + c.charCodeAt(0), 0);

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

/** Transcript lines for a DSA. speaker: 'bo' (officer) | 'dsa'. Timestamps are added later. */
export function buildTranscript(dsa) {
  const s = seedOf(dsa.id);
  const first = dsa.name.split(' ')[0];
  const thisMonth = dsa.monthly?.[dsa.monthly.length - 1] ?? 4;
  const competitor = pick(COMPETITORS, s);
  const borrower = pick(BORROWERS, s + 1);
  const bps = 35 + (s % 4) * 5;
  const target = Math.max(thisMonth + 2, Math.round(thisMonth * 1.3));
  const followup = formatDate(addDays(7), { weekday: 'long', day: 'numeric', month: 'short' });
  const low = dsa.quality === 'low';
  const high = dsa.quality === 'high';

  const approvalLine = high
    ? `Approval rate is holding at ${dsa.approvalRate}%, which is among the best in the branch. Let's keep the documentation quality where it is.`
    : low
      ? `Approval rate has slipped to ${dsa.approvalRate}%. Most rejections are on income proof, so we need to fix that before submission.`
      : `Approval rate is at ${dsa.approvalRate}%. We can push it past 65% if the income documents come in cleaner.`;

  const lines = [
    ['bo', `Good morning ${first}, thanks for making time. I want to go over this month's pipeline and a couple of pending files.`],
    ['dsa', `Sure. We have sent ${thisMonth} files this month. Two more are ready but waiting on borrower KYC.`],
    ['bo', approvalLine],
    ['dsa', `The rejections were mostly self-employed borrowers with thin bank statements. My agents don't always collect the ITR upfront.`],
    ['bo', `Let's make that mandatory. Six months of bank statements and the last two years' ITR before the file is logged. I'll share the updated checklist tonight.`],
    ['dsa', `That works. One more thing — ${competitor} is offering ${bps} bps payout on LAP. A few of my agents are asking about it.`],
    ['bo', `Understood. Our LAP payout is under review; I'll raise it with the regional head and come back to you by ${followup}. Meanwhile the slab bonus still applies on every disbursal.`],
    ['dsa', `Fine. Also the ${borrower} file — the valuation report has been pending from your side for eight days.`],
    ['bo', `I'll chase the valuer today and confirm the status by tomorrow evening.`],
    ['dsa', `Good. For next month we are targeting ${target} files, mostly home loans and two LAPs.`],
    ['bo', `That keeps you on track for the next incentive slab. Let's do a quick review on ${followup} to see where the files stand.`],
    ['dsa', `Done. I'll send the two pending files by Friday.`],
    ['bo', `Perfect. Thanks ${first}, I'll share the minutes on WhatsApp.`],
  ];

  return {
    lines: lines.map(([speaker, text]) => ({ speaker, text })),
    facts: { first, thisMonth, competitor, borrower, bps, target, followup, followupDate: toISODate(addDays(7)) },
  };
}

/** Structured summary derived from the transcript facts. */
export function buildSummary(dsa, facts) {
  const { first, thisMonth, competitor, borrower, bps, target, followup, followupDate } = facts;
  const sentiment = dsa.quality === 'low' ? 'needs follow-up' : dsa.quality === 'high' ? 'positive' : 'neutral';

  return {
    sentiment,
    headline:
      sentiment === 'positive'
        ? `Strong month; ${first} committed to ${target} files next month.`
        : sentiment === 'neutral'
          ? `Steady pipeline; documentation quality is the main lever.`
          : `Pipeline is thin; approval rate and payout concerns need action.`,
    keyPoints: [
      `${thisMonth} files submitted this month; 2 more ready pending borrower KYC.`,
      `Approval rate at ${dsa.approvalRate}% — rejections driven by weak income proof for self-employed borrowers.`,
      `${competitor} offering ${bps} bps payout on LAP; DSA agents are comparing.`,
      `${borrower} valuation report pending from branch for 8 days.`,
      `Next-month target agreed: ${target} files (home loans + 2 LAP).`,
    ],
    actions: [
      { owner: 'You', text: 'Share the updated income-document checklist with the DSA', due: 'Today' },
      { owner: 'You', text: `Chase valuer on ${borrower} file and confirm status`, due: 'Tomorrow' },
      { owner: 'You', text: 'Escalate LAP payout comparison to regional head', due: followup },
      { owner: first, text: 'Submit the 2 pending files with complete KYC', due: 'Friday' },
      { owner: first, text: 'Collect 6-month statements + 2-year ITR before logging files', due: 'Ongoing' },
    ],
    decisions: [
      'ITR + 6-month bank statements mandatory before file submission.',
      `Review meeting fixed for ${followup}.`,
    ],
    nextMeeting: followupDate,
    highlights: [
      { label: 'Files this month', value: String(thisMonth) },
      { label: 'Approval rate', value: `${dsa.approvalRate}%` },
      { label: 'Next-month target', value: `${target} files` },
      { label: 'Competitor payout', value: `${bps} bps` },
    ],
  };
}

/** Plain-text version of the summary — used to pre-fill visit notes and for sharing. */
export function summaryToText(summary) {
  const points = summary.keyPoints.map((p) => `• ${p}`).join('\n');
  const actions = summary.actions.map((a) => `• ${a.owner}: ${a.text} (${a.due})`).join('\n');
  return `${summary.headline}\n\nKey points\n${points}\n\nAction items\n${actions}`;
}

export const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/* ---------------------------------------------------------------------------------
   Company engagement meetings (Branch Head / Regional Head / CEO … with the DSA).
   Same idea: a plausible transcript + summary generated locally from the record.
   --------------------------------------------------------------------------------- */
const ROLE_LINES = {
  leadership: (lead, dsa, f) => [
    [lead, `${f.first}, thank you for joining. You're one of our top ${dsa.disbursed >= 9000000 ? 'three' : 'ten'} partners in the region, so I wanted to hear directly what's working and what isn't.`],
    ['dsa', `Thank you. Honestly, the branch team is responsive. Where we lose time is sanction TAT on LAP files — 9 to 12 days versus 6 at ${f.competitor}.`],
    [lead, `That's fair feedback. We are moving LAP sanctions to a regional credit desk from next quarter; target TAT is 5 working days.`],
    ['dsa', `That would be a big deal for us. The other ask is payout parity — ${f.competitor} is at ${f.bps} bps on LAP.`],
    [lead, `We won't chase on payout alone, but for partners at your volume we can look at a volume-linked bonus. Neha's team will bring a proposal.`],
    ['dsa', `Understood. From our side we can commit ${f.target} files a month for the next two quarters if TAT improves.`],
    [lead, `Let's put that in writing as a partnership plan. I'd like a review with you in 90 days.`],
    ['dsa', `Agreed. I'll also introduce two of my senior agents to the branch team so escalations don't come only to me.`],
    [lead, `Perfect. Thank you ${f.first} — this is exactly the kind of partner conversation we want more of.`],
  ],
  branch: (lead, dsa, f) => [
    [lead, `${f.first}, let's do a quick quarter review. You closed ${dsa.filesSubmitted} files with us so far; approval rate is ${dsa.approvalRate}%.`],
    ['dsa', `Yes. The rejections are mostly income-proof issues on self-employed cases. My agents are getting better at it.`],
    [lead, `Rajesh will share the updated checklist. I also want to talk about the incentive slab — you're close to the next one.`],
    ['dsa', `That's motivating. What would help is a faster response on valuation reports — ${f.borrower} has been waiting eight days.`],
    [lead, `Noted, I'll escalate the valuer today. On competition — is ${f.competitor} pulling any of your agents?`],
    ['dsa', `Some noise about ${f.bps} bps on LAP, but service matters more to my team. Keep the TAT tight and we stay.`],
    [lead, `Fair. Let's target ${f.target} files next month and review on ${f.followup}.`],
    ['dsa', `Done. I'll send the pending files by Friday.`],
  ],
  officer: (lead, dsa, f) => buildTranscript(dsa).lines.map((l) => [l.speaker === 'bo' ? lead : 'dsa', l.text]),
};

export function buildEngagementTranscript(dsa, meeting) {
  const { facts } = buildTranscript(dsa);
  const lead = meeting.attendees[0];
  const kind = ['rh', 'ceo', 'ph'].includes(meeting.lead) ? 'leadership' : ['bh', 'cm'].includes(meeting.lead) ? 'branch' : 'officer';
  const raw = ROLE_LINES[kind](lead, dsa, facts);
  const n = raw.length;
  const lines = raw.map(([who, text], i) => ({
    speaker: who === 'dsa' ? 'dsa' : 'bo',
    name: who === 'dsa' ? dsa.name.split(' ')[0] : who.name.split(' ')[0],
    text,
    t: Math.floor((meeting.durationSecs * i) / n),
  }));
  const base = buildSummary(dsa, facts);
  const summary = kind === 'leadership'
    ? {
        ...base,
        sentiment: 'positive',
        headline: `${lead.role.split(' –')[0]} committed to faster LAP TAT; ${facts.first} committed ${facts.target} files/month.`,
        keyPoints: [
          `DSA's main pain point is LAP sanction TAT (9–12 days vs 6 at ${facts.competitor}).`,
          `LAP sanctions moving to a regional credit desk next quarter; target 5 working days.`,
          `Payout parity raised (${facts.competitor} at ${facts.bps} bps); volume-linked bonus to be proposed instead.`,
          `DSA committed ${facts.target} files/month for two quarters if TAT improves.`,
          `DSA to introduce two senior agents to the branch for day-to-day escalations.`,
        ],
        actions: [
          { owner: 'Neha Kulkarni', text: 'Draft volume-linked bonus proposal for the DSA', due: '2 weeks' },
          { owner: 'Sandeep Rao', text: 'Confirm regional credit desk go-live for LAP', due: 'Next quarter' },
          { owner: 'Rajesh Kumar', text: 'Set up intro meeting with DSA\'s two senior agents', due: 'This month' },
          { owner: facts.first, text: `Commit ${facts.target} files/month in written partnership plan`, due: '2 weeks' },
        ],
        decisions: ['Partnership plan to be documented with 90-day review.', 'No standalone payout increase; volume-linked bonus route instead.'],
      }
    : kind === 'branch'
      ? {
          ...base,
          headline: `Quarter review: ${dsa.filesSubmitted} files, ${dsa.approvalRate}% approval; TAT on valuations is the main ask.`,
          actions: [
            { owner: 'Rajesh Kumar', text: 'Share updated income-document checklist', due: 'Today' },
            { owner: 'Neha Kulkarni', text: `Escalate valuer delay on ${facts.borrower} file`, due: 'Today' },
            { owner: facts.first, text: 'Submit pending files with complete KYC', due: 'Friday' },
          ],
        }
      : base;
  return { lines, summary };
}
