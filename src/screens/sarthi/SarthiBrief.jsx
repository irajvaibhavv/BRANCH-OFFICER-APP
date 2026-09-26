import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowRight } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import EmptyState from '../../components/ui/EmptyState';
import { formatINR } from '../../utils/formatters';
import { getCase, lookupRiskPattern, bankIncome } from '../../services/sarthi/knowledge';
import { computeEligibility } from '../../services/sarthi/verifier';
import { validatePan, maskPan } from '../../services/sarthi/idChecks';
import styles from './SarthiBrief.module.css';

export default function SarthiBrief() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = getCase(id);

  if (!c) {
    return (
      <Page mode="slide" className="sarthi">
        <TopBar back title="Case not found" hideBell />
        <EmptyState emoji="🔍" title="That case is not in the list" subtitle="Go back and pick a borrower." />
      </Page>
    );
  }

  const b = c.brief;
  const pattern = c.riskPatternMatch ? lookupRiskPattern(c.riskPatternMatch.patternId) : null;
  const elig = computeEligibility(c);
  // A walk-in has no bank credits, bureau record or ITR — show that, never a figure derived from null.
  const bank = bankIncome(c);
  const noBank = !bank;
  const gap = noBank ? null : Math.round(((c.declaredIncome - bank.income) / bank.income) * 100);
  const short = elig.assessable ? c.loanAmountRequested - elig.maxEligible : null;
  // Checked here, in code, so a PAN that is not theirs shows before the interview starts.
  const pan = b.kyc?.pan ? validatePan(b.kyc.pan, c.name) : null;

  return (
    <Page mode="slide" className={`sarthi ${styles.page}`}>
      <TopBar back title={c.name} subtitle={`${c.business}, ${c.area.split(',')[0]}`} hideBell />

      {/* The disagreement, before anything else */}
      <section className={styles.gap}>
        <div className={styles.gapPair}>
          <div>
            <div className={styles.gapLabel}>Declared</div>
            <div className={styles.gapSaid}>{c.declaredIncome ? formatINR(c.declaredIncome, { compact: false }) : '—'}</div>
          </div>
          <div className={styles.gapArrow} aria-hidden="true" />
          <div>
            <div className={styles.gapLabel}>Bank has seen</div>
            <div className={styles.gapReal}>{noBank ? 'Nothing on file' : formatINR(bank.income, { compact: false })}</div>
          </div>
        </div>
        <p className={styles.gapLine}>
          {noBank
            ? <>No bank statement on file. Sarthi will rebuild income from their own answers — footfall, bill size and their trade&apos;s margin — and report it as unverified.</>
            : gap > 0
              ? <>Declared income runs <b>{gap}% above</b> what {b.bankStatementMonths} months of bank statements support. Press on where the difference comes from.</>
              : <>Declared income sits within reach of {b.bankStatementMonths} months of bank statements.</>}
          {bank?.marginPct != null && <> The account shows {formatINR(bank.credits, { compact: false })} a month of sales; at the trade&apos;s typical {bank.marginPct}% margin that is about {formatINR(bank.income, { compact: false })} of income.</>}
        </p>
      </section>

      {/* Supporting record — quiet rows, not tiles */}
      <section>
        <h2 className={styles.head}>On record</h2>
        <dl className={styles.record}>
          {b.bureauScore == null
            ? <Row term="Bureau score" value="no record" note="new to credit — nothing to check against" />
            : <Row term="Bureau score" value={b.bureauScore} note={b.bureauScore >= 750 ? 'strong' : b.bureauScore >= 700 ? 'acceptable' : 'below comfort'} tone={b.bureauScore >= 750 ? 'clear' : b.bureauScore >= 700 ? 'watch' : 'stamp'} />}
          <Row term="Running EMIs" value={b.existingEMIs == null ? 'not on file' : formatINR(b.existingEMIs, { compact: false })} note={b.runningLoans.length ? b.runningLoans.map((l) => l.type).join(', ') : b.existingEMIs == null ? 'no bureau record' : 'nothing outstanding'} />
          <Row term="Filed as income" value={b.itrIncome == null ? 'no ITR on file' : `${formatINR(b.itrIncome, { compact: false })} in the ITR`} note={b.gstRegistered ? `GST registered ${b.gstVintage}` : 'not GST registered'} />
          <Row term="Trading for" value={c.businessVintage} note={`${c.employment.toLowerCase()}, ${c.businessName}`} />
          {/* A walk-in has no locality history on file — say so rather than render NaN%. */}
          <Row
            term="Area default rate"
            value={b.areaDefaultRate != null ? `${Math.round(b.areaDefaultRate * 100)}%` : 'not on file'}
            note={b.areaDefaultRate != null ? 'of lending in this locality' : 'no lending history for this locality'}
            tone={b.areaDefaultRate > 0.15 ? 'stamp' : undefined}
          />
        </dl>

        {/* With a documents list, missing papers are shown there instead. */}
        {(b.largeDeposits.length > 0 || (!b.docsSubmitted && b.missingDocs.length > 0)) && (
          <ul className={styles.loose}>
            {b.largeDeposits.map((d, i) => (
              <li key={i}>{formatINR(d.amount)} landed in {d.month} with no source on file</li>
            ))}
            {!b.docsSubmitted && b.missingDocs.map((d) => <li key={d}>{d} never arrived</li>)}
          </ul>
        )}
      </section>

      {/* Documents and KYC — what was pulled, how, and what is still missing */}
      {(b.kyc || b.bank || b.bureau) && (
        <section>
          <h2 className={styles.head}>Documents and KYC</h2>
          <dl className={styles.record}>
            {b.kyc && <Row term="Aadhaar" value={`XXXX XXXX ${b.kyc.aadhaarLast4}`} note={b.kyc.aadhaarCheck} tone={/eKYC|XML/.test(b.kyc.aadhaarCheck) ? 'clear' : 'watch'} />}
            {pan && <Row term="PAN" value={maskPan(pan.value)} note={pan.ok ? 'format and surname initial check out' : pan.checks.filter((x) => !x.pass).map((x) => x.detail).join('; ')} tone={pan.ok ? 'clear' : 'stamp'} />}
            {b.bank && <Row term="Bank" value={`${b.bank.name}, ${b.bank.type}`} note={b.bank.source} />}
            {b.bank && <Row term="Account behaviour" value={`${b.bank.bounces} bounce${b.bank.bounces === 1 ? '' : 's'}`} note={`avg balance ${formatINR(b.bank.avgBalance, { compact: false })} · ${b.bank.cashCreditPct}% cash, ${b.bank.upiCreditPct}% UPI credits`} tone={b.bank.bounces ? 'watch' : 'clear'} />}
            {b.bureau && <Row term="Bureau detail" value={`${b.bureau.enquiries6m} enquir${b.bureau.enquiries6m === 1 ? 'y' : 'ies'} in 6 months`} note={`${b.bureau.bureau} ${b.bureau.pulledOn} · ${b.bureau.worstDpd}`} tone={b.bureau.enquiries6m >= 3 || /late/.test(b.bureau.worstDpd) ? 'watch' : undefined} />}
          </dl>
          {b.docsSubmitted?.length > 0 && (
            <ul className={styles.docs}>
              {b.docsSubmitted.map((d) => <li key={d} className={styles.docIn}>✓ {d}</li>)}
              {b.missingDocs.map((d) => <li key={d} className={styles.docOut}>✕ {d} — not submitted</li>)}
            </ul>
          )}
        </section>
      )}

      {/* What the lender can actually support */}
      <section className={styles.money}>
        <div className={styles.moneyRow}>
          <span>Asking</span>
          <span className={styles.moneyFig}>{formatINR(c.loanAmountRequested, { compact: false })}</span>
        </div>
        <div className={styles.moneyRow}>
          <span>Supported by verified income</span>
          <span className={styles.moneyFig}>{elig.assessable ? formatINR(elig.maxEligible, { compact: false }) : 'Not assessable'}</span>
        </div>
        <p className={styles.moneyNote}>
          {!elig.assessable
            ? <>No verified income yet, so no eligible amount. The interview can rebuild an indicative figure; a bank statement or ITR settles it.</>
            : short > 0
            ? <><b>{formatINR(short, { compact: false })} more than the file supports.</b> Calculated from bank credits at {elig.foirPct}% FOIR, less existing EMIs.</>
            : <>Within what the file supports, on bank credits at {elig.foirPct}% FOIR, less existing EMIs.</>}
        </p>
      </section>

      {/* Institutional memory */}
      {pattern && (
        <section className={styles.memory}>
          <h2 className={styles.headOnDark}>What happened last time</h2>
          <p className={styles.memoryLead}>{pattern.whatWentWrong}</p>
          <div className={styles.failBar}>
            <div className={styles.failFill} style={{ width: `${pattern.failureRate * 100}%` }} />
          </div>
          <p className={styles.memoryStat}>
            {Math.round(pattern.failureRate * 100)}% of {pattern.businessType.toLowerCase()} files in {pattern.area} went the same way — {pattern.patternId}
          </p>
          <h3 className={styles.memorySub}>Sarthi will press on</h3>
          <ul className={styles.asks}>
            {pattern.questionsToAsk.slice(0, 4).map((q) => <li key={q}>{q}</li>)}
          </ul>
        </section>
      )}

      {/* The officer's own list */}
      <section>
        <h2 className={styles.head}>Worth digging into</h2>
        <ul className={styles.dig}>
          {b.digInto.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      </section>

      <div className={styles.handover}>
        <p className={styles.handoverNote}>
          Once you start, the phone belongs to {c.name.split(' ')[0]}. Nothing else in the app is reachable
          until the interview ends.
        </p>
        <motion.button className={styles.start} whileTap={{ scale: 0.98 }} onClick={() => navigate(`/sarthi/interview/${c.id}`)}>
          Start the interview <FiArrowRight size={18} />
        </motion.button>
      </div>
    </Page>
  );
}

function Row({ term, value, note, tone }) {
  return (
    <div className={styles.row}>
      <dt className={styles.term}>{term}</dt>
      <dd className={styles.val}>
        <span className={tone ? styles[`tone_${tone}`] : undefined}>{value}</span>
        {note && <span className={styles.note}>{note}</span>}
      </dd>
    </div>
  );
}
