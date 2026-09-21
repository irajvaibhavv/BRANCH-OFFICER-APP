/*
  MEETING PREP — questions the officer should ask THIS DSA, generated from how the DSA
  is actually doing: approval rate, product mix, pending files, visit gap, trend, slab,
  competitor mentions and open commitments from the last recorded meeting.
  In production an LLM would draft these from the same signals; here the rules are explicit
  so the demo is deterministic and every DSA gets a different, relevant list.
*/
import { productMix, commissionFor } from './commission';
import { buildTranscript } from './meetingAI';

const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : null);

export const TOPICS = {
  pipeline: { label: 'Pipeline', color: '#4c1d95' },
  quality: { label: 'File quality', color: '#dc2626' },
  product: { label: 'Products', color: '#0f766e' },
  payout: { label: 'Payout & competition', color: '#d97706' },
  relationship: { label: 'Relationship', color: '#db2777' },
  followup: { label: 'Follow-ups', color: '#2563eb' },
};

export function buildQuestions(dsa, { loanFiles = [], visits = [], recordings = [], engagements = [], doneTodos = {} } = {}) {
  const q = [];
  const first = dsa.name.split(' ')[0];
  const m = dsa.monthly ?? [];
  const last = m[m.length - 1] ?? 0, prev = m[m.length - 2] ?? 0;
  const mix = productMix(dsa);
  const pay = commissionFor(dsa);
  const { facts } = buildTranscript(dsa);
  const files = loanFiles.filter((f) => f.dsaId === dsa.id);
  const stuck = files.filter((f) => f.docs.some(([, s]) => s !== 'done'));
  const underReview = files.filter((f) => f.status === 'under review' || f.status === 'submitted');
  const rejected = files.filter((f) => f.status === 'rejected');
  const gap = daysSince(dsa.lastVisit);
  const lastRec = recordings.filter((r) => r.dsaId === dsa.id)[0];
  const lastLead = engagements.filter((e) => e.dsaId === dsa.id && e.lead !== 'bo')[0];
  const lastVisit = visits.filter((v) => v.dsaId === dsa.id && v.status === 'completed').sort((a, b) => b.date.localeCompare(a.date))[0];

  // ---- Follow-ups from the last recorded meeting (highest priority: shows we listened) ----
  if (lastRec) {
    const done = doneTodos[lastRec.id] ?? [];
    lastRec.summary.actions.forEach((a, i) => {
      if (a.owner === first && !done.includes(i)) {
        q.push({ id: `todo-${i}`, tag: `Follow up: ${short(a.text)}`, topic: 'followup', priority: 'high', nudge: `Follow up: ${lc(a.text)}`, q: `Last time you said you'd ${lc(a.text)} — where does that stand?`, why: `Open commitment from your meeting on ${fmt(lastRec.date)} (due ${a.due}).` });
      }
    });
  }
  if (lastVisit?.outcome === 'need follow-up') {
    q.push({ id: 'lastvisit', tag: 'Last visit follow-up', topic: 'followup', priority: 'high', nudge: `Follow up on your ${fmt(lastVisit.date)} visit`, q: `We flagged a follow-up on ${fmt(lastVisit.date)} — is that resolved from your side?`, why: `Your last visit note: "${(lastVisit.notes ?? '').slice(0, 80)}${(lastVisit.notes ?? '').length > 80 ? '…' : ''}"` });
  }

  // ---- Pipeline ----
  if (last < prev) q.push({ id: 'trend', topic: 'pipeline', priority: 'high', tag: 'Submissions down', nudge: `Submissions down ${prev} → ${last} this month`, q: `Submissions dropped from ${prev} to ${last} this month — what changed on your side?`, why: 'Month-on-month decline. Find out if it is seasonal, an agent leaving, or a competitor.', followUp: 'Is any of the pipeline sitting with another lender?' });
  else if (last > prev) q.push({ id: 'trend', topic: 'pipeline', priority: 'low', tag: 'Submissions up', nudge: `Submissions up ${prev} → ${last} — find out why`, q: `You went from ${prev} to ${last} files this month — what is driving the growth, and can we support more of it?`, why: 'Positive trend; understand what works so you can replicate it with other DSAs.' });
  q.push({ id: 'target', tag: 'Next-month target', topic: 'pipeline', priority: 'medium', nudge: `Lock next month's target (~${facts.target} files)`, q: `How many files are you targeting next month, and how many are ready to submit this week?`, why: `Lock a number. Suggested target based on run-rate: ${facts.target} files.`, followUp: 'What is blocking the ones that are ready?' });
  if (underReview.length) q.push({ id: 'review', tag: 'Files under review', topic: 'pipeline', priority: 'medium', nudge: `${underReview.length} file${underReview.length > 1 ? 's' : ''} under review — borrower informed?`, q: `${underReview.length} of your file${underReview.length > 1 ? 's are' : ' is'} under review (${underReview.map((f) => f.borrower).slice(0, 2).join(', ')}) — has the borrower been kept informed?`, why: 'Borrower drop-off is highest during the review wait.' });

  // ---- File quality ----
  if (dsa.approvalRate < 50) q.push({ id: 'approval', topic: 'quality', priority: 'high', tag: 'Low approval rate', nudge: `Approval at ${dsa.approvalRate}% — find the missing document`, q: `Approval rate is at ${dsa.approvalRate}% — which document is most often missing when your agents log a file?`, why: 'Well below the 65% branch benchmark. Usually income proof or bank statements.', followUp: 'Can we run a 30-minute checklist session with your agents this week?' });
  else if (dsa.approvalRate < 65) q.push({ id: 'approval', topic: 'quality', priority: 'medium', tag: 'Approval near benchmark', nudge: `Approval at ${dsa.approvalRate}% — just under benchmark`, q: `Approval is ${dsa.approvalRate}% — where do you think the rejected files are going wrong?`, why: 'Just under benchmark; a small documentation fix moves this DSA to high quality.' });
  if (stuck.length) q.push({ id: 'stuck', tag: `${stuck.length} file${stuck.length > 1 ? 's' : ''} stuck on docs`, topic: 'quality', priority: 'high', nudge: `${stuck.length} file${stuck.length > 1 ? 's' : ''} waiting on documents`, q: `${stuck[0].borrower} is waiting on ${stuck[0].docs.filter(([, s]) => s !== 'done').map(([d]) => d).slice(0, 2).join(' and ')} — can you get those this week?`, why: `${stuck.length} file${stuck.length > 1 ? 's' : ''} with pending documents. Each day pending pushes disbursal out.` });
  if (rejected.length) q.push({ id: 'rejected', tag: 'Revive rejected file', topic: 'quality', priority: 'medium', nudge: `Revive ${rejected[0].borrower}'s rejected file?`, q: `${rejected[0].borrower} was rejected — is there a chance to re-submit with a co-applicant or better income proof?`, why: 'Rejected files can often be revived; the borrower has already been sourced.' });

  // ---- Products ----
  const weak = mix.filter((p) => p.files >= 3 && p.approval < 45).sort((a, b) => a.approval - b.approval)[0];
  const strong = [...mix].sort((a, b) => b.disbursed - a.disbursed)[0];
  const thin = mix.filter((p) => p.files <= 2).map((p) => p.product);
  if (weak) q.push({ id: 'weakprod', tag: `${weak.product} approvals`, topic: 'product', priority: 'high', nudge: `${weak.product} approval only ${weak.approval}%`, q: `${weak.product} files are only getting ${weak.approval}% approval — should we tighten who you source for it, or would a product refresher help?`, why: `Weakest product for this DSA (${weak.files} files, ${weak.approved} approved).` });
  if (thin.length) q.push({ id: 'crosssell', tag: `Cross-sell ${thin[0]}`, topic: 'product', priority: 'medium', nudge: `Cross-sell ${thin[0]} to ${strong.product} customers`, q: `You do well on ${strong.product} — have you tried offering ${thin[0]} to the same customers?`, why: `Almost no ${thin.slice(0, 2).join(' / ')} business from this DSA; cross-sell to an existing base is the cheapest growth.` });

  // ---- Payout & competition ----
  q.push({ id: 'competitor', tag: 'Competitor payout', topic: 'payout', priority: dsa.quality === 'high' ? 'high' : 'medium', nudge: `Check if ${facts.competitor} is courting their agents`, q: `Are ${facts.competitor} or anyone else approaching your agents with a better payout right now?`, why: dsa.quality === 'high' ? 'High-value DSA — retention matters most. Get it on the table before they raise it.' : 'Understand what the DSA is comparing us against.', followUp: 'What would it take for you to route the next 10 files to us?' });
  if (dsa.quality !== 'high') q.push({ id: 'slab', tag: 'Path to Gold slab', topic: 'payout', priority: 'medium', nudge: `On ${pay.slab} slab — pitch the path to Gold`, q: `You are on the ${pay.slab} slab — you'd earn ~${Math.round((pay.rates[0].rate + 0.15) * 100) / 100}% on Home Loan at Gold. What would help you get there?`, why: 'Use the slab as motivation; tie it to the next-month target.' });

  // ---- Relationship ----
  if (gap != null && gap > 14) q.push({ id: 'gap', tag: 'Long visit gap', topic: 'relationship', priority: 'high', nudge: `${gap} days since last visit — clear the air`, q: `It's been ${gap} days since we last met — is there anything that went wrong with the branch in between?`, why: 'Long gap for an active partner. Surface any unspoken issue early.' });
  if (dsa.rating <= 2) q.push({ id: 'rating', tag: 'Branch feedback', topic: 'relationship', priority: 'medium', nudge: 'Ask what the branch could do better', q: `Honestly, what is the one thing the branch could do better for you?`, why: 'Low internal rating — but the DSA may also be unhappy with us. Ask openly.' });
  if (lastLead) q.push({ id: 'lead', tag: 'Leadership follow-up', topic: 'relationship', priority: 'medium', nudge: `Close the loop on ${lastLead.attendees[0].name.split(' ')[0]}'s visit`, q: `${lastLead.attendees[0].name.split(' ')[0]} (${lastLead.attendees[0].role.split(' –')[0]}) met you on ${fmt(lastLead.date)} — did the points from that discussion get actioned?`, why: 'Close the loop on leadership commitments so the DSA sees follow-through.' });
  q.push({ id: 'agents', tag: 'New agents', topic: 'relationship', priority: 'low', nudge: 'Any new agents needing a briefing?', q: `How many active agents do you have this month, and is anyone new who should get a product briefing?`, why: 'New agents are where documentation mistakes usually come from.' });

  const rank = { high: 0, medium: 1, low: 2 };
  return q.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
// 2–3 word label: "Submit the 2 pending files with complete KYC" → "pending files"
const short = (s) => { const w = s.replace(/^(submit|collect|share|send|chase|get|the|a|an)\s+/i, '').split(' ').filter((x) => !/^(the|a|an|of|with|for|to|and|\+|before|-|\d+)$/i.test(x)); return w.slice(0, 2).join(' ').replace(/[,.]$/, '').toLowerCase(); };
const fmt = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
