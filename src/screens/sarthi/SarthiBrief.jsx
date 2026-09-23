import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowRight } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import EmptyState from '../../components/ui/EmptyState';
import { formatINR } from '../../utils/formatters';
import { getCase, lookupRiskPattern } from '../../utils/sarthiTools';
import { computeEligibility } from '../../utils/sarthiVerifier';
import styles from './SarthiBrief.module.css';

/*
  What the officer reads before handing the phone over.

  The screen opens on the disagreement in the file — declared income against money the bank has
  actually seen — because that single gap decides how the interview should be run. Everything
  after it is supporting evidence, kept deliberately quiet so the gap stays loud.
*/
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
  const gap = Math.round(((c.declaredIncome - b.avgMonthlyCredit) / b.avgMonthlyCredit) * 100);
  const short = c.loanAmountRequested - elig.maxEligible;

  return (
    <Page mode="slide" className={`sarthi ${styles.page}`}>
      <TopBar back title={c.name} subtitle={`${c.business}, ${c.area.split(',')[0]}`} hideBell />

      {/* The disagreement, before anything else */}
      <section className={styles.gap}>
        <div className={styles.gapPair}>
          <div>
            <div className={styles.gapLabel}>He declares</div>
            <div className={styles.gapSaid}>{formatINR(c.declaredIncome, { compact: false })}</div>
          </div>
          <div className={styles.gapArrow} aria-hidden="true" />
          <div>
            <div className={styles.gapLabel}>Bank has seen</div>
            <div className={styles.gapReal}>{formatINR(b.avgMonthlyCredit, { compact: false })}</div>
          </div>
        </div>
        <p className={styles.gapLine}>
          {gap > 0
            ? <>Declared income runs <b>{gap}% above</b> {b.bankStatementMonths} months of bank credits. Press on where the difference comes from.</>
            : <>Declared income sits within reach of {b.bankStatementMonths} months of bank credits.</>}
        </p>
      </section>

      {/* Supporting record — quiet rows, not tiles */}
      <section>
        <h2 className={styles.head}>On record</h2>
        <dl className={styles.record}>
          <Row term="Bureau score" value={b.bureauScore} note={b.bureauScore >= 750 ? 'strong' : b.bureauScore >= 700 ? 'acceptable' : 'below comfort'} tone={b.bureauScore >= 750 ? 'clear' : b.bureauScore >= 700 ? 'watch' : 'stamp'} />
          <Row term="Running EMIs" value={formatINR(b.existingEMIs, { compact: false })} note={b.runningLoans.length ? b.runningLoans.map((l) => l.type).join(', ') : 'nothing outstanding'} />
          <Row term="Filed as income" value={`${formatINR(b.itrIncome, { compact: false })} in the ITR`} note={b.gstRegistered ? `GST registered ${b.gstVintage}` : 'not GST registered'} />
          <Row term="Trading for" value={c.businessVintage} note={`${c.employment.toLowerCase()}, ${c.businessName}`} />
          <Row term="Area default rate" value={`${Math.round(b.areaDefaultRate * 100)}%`} note="of lending in this locality" tone={b.areaDefaultRate > 0.15 ? 'stamp' : undefined} />
        </dl>

        {(b.largeDeposits.length > 0 || b.missingDocs.length > 0) && (
          <ul className={styles.loose}>
            {b.largeDeposits.map((d, i) => (
              <li key={i}>{formatINR(d.amount)} landed in {d.month} with no source on file</li>
            ))}
            {b.missingDocs.map((d) => <li key={d}>{d} never arrived</li>)}
          </ul>
        )}
      </section>

      {/* What the lender can actually support */}
      <section className={styles.money}>
        <div className={styles.moneyRow}>
          <span>Asking</span>
          <span className={styles.moneyFig}>{formatINR(c.loanAmountRequested, { compact: false })}</span>
        </div>
        <div className={styles.moneyRow}>
          <span>Supported by verified income</span>
          <span className={styles.moneyFig}>{formatINR(elig.maxEligible, { compact: false })}</span>
        </div>
        <p className={styles.moneyNote}>
          {short > 0
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
