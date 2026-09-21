/*
  DSA commission (payout) — derived deterministically from the DSA record for the POC.
  Payout is a % of disbursed loan amount, differs by product and by the DSA's slab.
  In production this comes from the payout master / finance API.
*/
const TIER_ADJ = { high: 0.15, average: 0, low: -0.1 }; // percentage points added to base payout
const PRODUCTS = [
  { product: 'Home Loan', base: 0.5 },
  { product: 'LAP', base: 0.9 },
  { product: 'Business Loan', base: 1.25 },
  { product: 'MSME WC', base: 1.1 },
];
const SLAB = { high: 'Gold', average: 'Silver', low: 'Bronze' };

export function commissionFor(dsa) {
  const adj = TIER_ADJ[dsa.quality] ?? 0;
  const rates = PRODUCTS.map((p) => ({ ...p, rate: +(p.base + adj).toFixed(2) }));
  const blended = +(rates.reduce((s, r) => s + r.rate, 0) / rates.length).toFixed(2); // % of disbursal
  const paidFY = Math.round((dsa.disbursed * blended) / 100);
  const monthlyTotal = (dsa.monthly ?? []).reduce((s, n) => s + n, 0) || 1;
  const thisMonthShare = (dsa.monthly?.[dsa.monthly.length - 1] ?? 0) / monthlyTotal;
  const thisMonth = Math.round(paidFY * thisMonthShare);
  const pending = Math.round(thisMonth * 0.45);
  return { rates, blended, paidFY, thisMonth, pending, slab: SLAB[dsa.quality] ?? 'Bronze' };
}

/** Approved files per month, derived from submissions × approval rate with a little variation. */
export function approvedMonthly(dsa) {
  return (dsa.monthly ?? []).map((n, i) => {
    const wobble = (((i * 7 + dsa.id.length) % 5) - 2) / 100; // ±2 pts, stable per DSA
    return Math.min(n, Math.max(0, Math.round(n * (dsa.approvalRate / 100 + wobble))));
  });
}

/*
  Product mix — how the DSA's files and disbursals split across products, with approval per product.
  Weights depend on the DSA (stable), so each DSA has a distinct profile. Sums match the DSA totals.
*/
const PRODUCT_META = [
  { product: 'Home Loan', short: 'HL', color: '#2563eb', ticket: 3200000 },
  { product: 'LAP', short: 'LAP', color: '#7c3aed', ticket: 4500000 },
  { product: 'Business Loan', short: 'BL', color: '#0891b2', ticket: 1500000 },
  { product: 'MSME WC', short: 'MSME', color: '#f59e0b', ticket: 2200000 },
];
export function productMix(dsa) {
  const seed = [...dsa.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const w = PRODUCT_META.map((_, i) => 1 + ((seed * (i + 3)) % 7)); // 1..7 weights
  const wSum = w.reduce((a, b) => a + b, 0);
  let filesLeft = dsa.filesSubmitted;
  const rows = PRODUCT_META.map((m, i) => {
    const files = i === PRODUCT_META.length - 1 ? filesLeft : Math.round((dsa.filesSubmitted * w[i]) / wSum);
    filesLeft -= files;
    const approval = Math.max(20, Math.min(95, dsa.approvalRate + (((seed * (i + 1)) % 21) - 10)));
    return { ...m, files, approval, approved: Math.round((files * approval) / 100) };
  });
  // Disbursed split by approved files × ticket size, scaled to the DSA total
  const raw = rows.map((r) => r.approved * r.ticket);
  const rawSum = raw.reduce((a, b) => a + b, 0) || 1;
  return rows.map((r, i) => ({ ...r, disbursed: Math.round((dsa.disbursed * raw[i]) / rawSum), share: Math.round((100 * raw[i]) / rawSum) }));
}
