import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FiAlertTriangle, FiArrowRight, FiBriefcase, FiCalendar, FiCheck, FiClock, FiCpu, FiCreditCard, FiFileText,
  FiHelpCircle, FiMapPin, FiRefreshCw, FiRepeat, FiSearch, FiShield, FiTrendingDown, FiUser, FiX, FiZap,
} from 'react-icons/fi';
import BottomSheet from '../../components/ui/BottomSheet';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import EmptyState from '../../components/ui/EmptyState';
import { formatINR } from '../../utils/formatters';
import { getCase, lookupRiskPattern, bankIncome } from '../../services/sarthi/knowledge';
import { computeEligibility } from '../../services/sarthi/verifier';
import { validatePan, maskPan } from '../../services/sarthi/idChecks';
import { loadHot, prepareHotQuestions } from '../../services/sarthi/prep';
import styles from './SarthiBrief.module.css';

const RISK = { low: 'Low risk', medium: 'Medium risk', high: 'High risk' };
const SECTION = {
  personal: { label: 'Personal', icon: FiUser },
  business: { label: 'Business', icon: FiBriefcase },
  financial: { label: 'Money', icon: FiCreditCard },
  documents: { label: 'Documents', icon: FiFileText },
  loan_purpose: { label: 'Loan', icon: FiZap },
};
const inr = (n) => formatINR(n, { compact: false });
const initials = (name) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export default function SarthiBrief() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = getCase(id);
  const [hot, setHot] = useState(() => loadHot(id));
  const [preparing, setPreparing] = useState(false);
  const [choose, setChoose] = useState(false);
  const [filter, setFilter] = useState('all');
  const [openWhy, setOpenWhy] = useState(null);
  const isNew = !!c?.isNew;

  // Drafted once per case when the brief opens, so they are ready before the officer presses start.
  const prepare = (fresh = false) => {
    const subject = getCase(id);
    if (!subject || subject.isNew) return () => {};
    let live = true;
    setPreparing(true);
    prepareHotQuestions(subject, { fresh }).then((r) => { if (live) { setHot(r); setPreparing(false); } });
    return () => { live = false; };
  };
  useEffect(() => {
    if (hot?.questions?.length || isNew) return undefined;
    return prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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

  const top = Math.max(c.declaredIncome || 0, bank?.income || 0, 1);
  const gapTone = gap == null ? 'watch' : gap > 40 ? 'stamp' : gap > 10 ? 'watch' : 'clear';
  const cover = elig.assessable && c.loanAmountRequested ? Math.min(100, Math.round((elig.maxEligible / c.loanAmountRequested) * 100)) : 0;

  const questions = hot?.questions ?? [];
  const counts = questions.reduce((acc, h) => ({ ...acc, [h.section]: (acc[h.section] ?? 0) + 1 }), {});
  const shown = filter === 'all' ? questions : questions.filter((h) => h.section === filter);

  const tiles = [
    b.bureauScore == null
      ? { icon: FiShield, term: 'Bureau score', value: 'No record', note: 'New to credit', tone: 'watch' }
      : { icon: FiShield, term: 'Bureau score', value: b.bureauScore, note: b.bureauScore >= 750 ? 'Strong' : b.bureauScore >= 700 ? 'Acceptable' : 'Below comfort', tone: b.bureauScore >= 750 ? 'clear' : b.bureauScore >= 700 ? 'watch' : 'stamp', meter: Math.max(0, Math.min(100, ((b.bureauScore - 300) / 600) * 100)) },
    { icon: FiRepeat, term: 'Running EMIs', value: b.existingEMIs == null ? 'Not on file' : inr(b.existingEMIs), note: b.runningLoans.length ? b.runningLoans.map((l) => l.type).join(', ') : b.existingEMIs == null ? 'No bureau record' : 'Nothing outstanding' },
    { icon: FiFileText, term: 'Filed as income', value: b.itrIncome == null ? 'No ITR' : `${inr(b.itrIncome)}/yr`, note: b.gstRegistered ? `GST since ${b.gstVintage}` : 'Not GST registered', tone: b.itrIncome == null ? 'watch' : undefined },
    { icon: FiCalendar, term: 'Trading for', value: c.businessVintage || '—', note: c.businessName },
    { icon: FiMapPin, term: 'Area default', value: b.areaDefaultRate != null ? `${Math.round(b.areaDefaultRate * 100)}%` : '—', note: b.areaDefaultRate != null ? 'of loans in this locality' : 'No lending history', tone: b.areaDefaultRate > 0.15 ? 'stamp' : b.areaDefaultRate > 0.1 ? 'watch' : undefined },
    ...(b.bank ? [{ icon: FiTrendingDown, term: 'Bounces', value: b.bank.bounces, note: `${b.bank.cashCreditPct}% cash · ${b.bank.upiCreditPct}% UPI`, tone: b.bank.bounces ? 'stamp' : 'clear' }] : []),
  ];

  return (
    <Page mode="slide" className={`sarthi ${styles.page}`}>
      <TopBar back title={c.name} subtitle={`${c.business}, ${c.area.split(',')[0]}`} hideBell />

      {/* Who, what they ask, and the one disagreement that matters */}
      <motion.section className={styles.hero} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className={styles.heroTop}>
          <div className={styles.avatar}>{initials(c.name)}</div>
          <div className={styles.heroWho}>
            <h1 className={styles.heroName}>{c.name}</h1>
            <p className={styles.heroSub}><FiMapPin size={12} /> {c.area}</p>
          </div>
          {c.riskLevel && <span className={`${styles.risk} ${styles[`risk_${c.riskLevel}`]}`}>{RISK[c.riskLevel]}</span>}
        </div>
        <div className={styles.chips}>
          <span className={styles.chip}>Asking <b>{formatINR(c.loanAmountRequested)}</b></span>
          {c.businessVintage && <span className={styles.chip}><FiClock size={11} /> {c.businessVintage}</span>}
          {c.loanPurpose && <span className={styles.chip}>{c.loanPurpose}</span>}
        </div>

        <div className={styles.compare}>
          <div className={styles.barRow}>
            <span className={styles.barLabel}>Declared</span>
            <span className={styles.barTrack}><motion.span className={styles.barSaid} initial={{ width: 0 }} animate={{ width: `${((c.declaredIncome || 0) / top) * 100}%` }} transition={{ duration: 0.7, delay: 0.1 }} /></span>
            <span className={styles.barFig}>{c.declaredIncome ? formatINR(c.declaredIncome) : '—'}</span>
          </div>
          <div className={styles.barRow}>
            <span className={styles.barLabel}>Bank shows</span>
            <span className={styles.barTrack}><motion.span className={styles.barReal} initial={{ width: 0 }} animate={{ width: `${noBank ? 0 : (bank.income / top) * 100}%` }} transition={{ duration: 0.7, delay: 0.25 }} /></span>
            <span className={styles.barFig}>{noBank ? 'none' : formatINR(bank.income)}</span>
          </div>
          {gap != null && (
            <span className={`${styles.gapPill} ${styles[`pill_${gapTone}`]}`}>
              {gap > 0 ? <><FiAlertTriangle size={12} /> {gap}% above what the bank supports</> : <><FiCheck size={12} /> Within reach of the bank</>}
            </span>
          )}
        </div>
        <p className={styles.heroNote}>
          {noBank
            ? <>No bank statement on file. Sarthi will rebuild income from their answers (footfall, bill size and the trade&apos;s margin) and mark it unverified.</>
            : <>{b.bankStatementMonths} months of statements: {inr(bank.credits)} a month of credits{bank.marginPct != null ? <>, about {inr(bank.income)} of income at the trade&apos;s {bank.marginPct}% margin</> : null}.</>}
        </p>
      </motion.section>

      {/* What the lender can support */}
      <section className={styles.card}>
        <div className={styles.moneyHead}>
          <div>
            <span className={styles.kicker}>Supported by verified income</span>
            <div className={styles.moneyBig}>{elig.assessable ? inr(elig.maxEligible) : 'Not assessable'}</div>
          </div>
          <div className={styles.moneyAsk}>
            <span className={styles.kicker}>Asking</span>
            <div className={styles.moneyAskFig}>{inr(c.loanAmountRequested)}</div>
          </div>
        </div>
        {elig.assessable && (
          <div className={styles.meter}>
            <motion.span className={`${styles.meterFill} ${cover < 100 ? styles.meterShort : ''}`} initial={{ width: 0 }} animate={{ width: `${cover}%` }} transition={{ duration: 0.8 }} />
          </div>
        )}
        <p className={styles.moneyNote}>
          {!elig.assessable
            ? 'No verified income yet. The interview can rebuild an indicative figure; a bank statement or ITR settles it.'
            : short > 0
              ? <><b>{inr(short)} more than the file supports</b> · bank credits at {elig.foirPct}% FOIR, less existing EMIs.</>
              : <>Within what the file supports · {elig.foirPct}% FOIR, less existing EMIs.</>}
        </p>
      </section>

      {/* On record */}
      <h2 className={styles.head}>On record</h2>
      <motion.div className={styles.tiles} variants={listContainer} initial="initial" animate="animate">
        {tiles.map((t) => (
          <motion.div key={t.term} variants={listItem} className={`${styles.tile} ${t.tone ? styles[`tile_${t.tone}`] : ''}`}>
            <span className={styles.tileIcon}><t.icon size={14} /></span>
            <span className={styles.tileTerm}>{t.term}</span>
            <span className={styles.tileVal}>{t.value}</span>
            {t.meter != null && <span className={styles.tileMeter}><span style={{ width: `${t.meter}%` }} /></span>}
            <span className={styles.tileNote}>{t.note}</span>
          </motion.div>
        ))}
      </motion.div>

      {(b.largeDeposits.length > 0 || (!b.docsSubmitted && b.missingDocs.length > 0)) && (
        <div className={styles.alerts}>
          {b.largeDeposits.map((d, i) => (
            <div key={i} className={styles.alert}><FiAlertTriangle size={15} /> <span><b>{formatINR(d.amount)}</b> landed in {d.month} with no source on file{d.note ? ` — ${d.note.toLowerCase()}` : ''}</span></div>
          ))}
          {!b.docsSubmitted && b.missingDocs.map((d) => <div key={d} className={styles.alert}><FiX size={15} /> <span>{d} never arrived</span></div>)}
        </div>
      )}

      {/* Documents and KYC */}
      {(b.kyc || b.bank || b.bureau) && (
        <>
          <h2 className={styles.head}>Documents and KYC</h2>
          <section className={styles.card}>
            <div className={styles.kyc}>
              {b.kyc && <KycRow term="Aadhaar" value={`XXXX XXXX ${b.kyc.aadhaarLast4}`} note={b.kyc.aadhaarCheck} ok={/eKYC|XML/.test(b.kyc.aadhaarCheck)} />}
              {pan && <KycRow term="PAN" value={maskPan(pan.value)} note={pan.ok ? 'Format and surname initial check out' : pan.checks.filter((x) => !x.pass).map((x) => x.detail).join('; ')} ok={pan.ok} bad={!pan.ok} />}
              {b.bank && <KycRow term="Bank" value={`${b.bank.name}, ${b.bank.type}`} note={`${b.bank.source} · avg balance ${inr(b.bank.avgBalance)}`} ok />}
              {b.bureau && <KycRow term="Bureau" value={`${b.bureau.enquiries6m} enquir${b.bureau.enquiries6m === 1 ? 'y' : 'ies'} in 6 months`} note={`${b.bureau.bureau} ${b.bureau.pulledOn} · ${b.bureau.worstDpd}`} ok={b.bureau.enquiries6m < 3 && !/late/.test(b.bureau.worstDpd)} />}
            </div>
            {b.docsSubmitted?.length > 0 && (
              <div className={styles.docChips}>
                {b.docsSubmitted.map((d) => <span key={d} className={styles.docIn}><FiCheck size={11} /> {d}</span>)}
                {b.missingDocs.map((d) => <span key={d} className={styles.docOut}><FiX size={11} /> {d}</span>)}
              </div>
            )}
          </section>
        </>
      )}

      {/* Institutional memory */}
      {pattern && (
        <section className={styles.memory}>
          <span className={styles.memoryKicker}><FiClock size={12} /> What happened last time · {pattern.patternId}</span>
          <p className={styles.memoryLead}>{pattern.whatWentWrong}</p>
          <div className={styles.failRow}>
            <div className={styles.failBar}><motion.div className={styles.failFill} initial={{ width: 0 }} animate={{ width: `${pattern.failureRate * 100}%` }} transition={{ duration: 0.8 }} /></div>
            <b>{Math.round(pattern.failureRate * 100)}%</b>
          </div>
          <p className={styles.memoryStat}>of {pattern.businessType.toLowerCase()} files in {pattern.area} went the same way</p>
        </section>
      )}

      {/* The officer's own list */}
      {b.digInto.length > 0 && (
        <>
          <h2 className={styles.head}>Worth digging into</h2>
          <div className={styles.digs}>
            {b.digInto.map((d, i) => (
              <div key={i} className={styles.dig}><span className={styles.digIcon}><FiSearch size={13} /></span><span>{d}</span></div>
            ))}
          </div>
        </>
      )}

      {/* Sarthi's suggested questions for the officer */}
      {!isNew && (
        <section className={styles.suggest}>
          <div className={styles.suggestHead}>
            <span className={styles.sparkle}><FiCpu size={16} /></span>
            <div className={styles.suggestTitleWrap}>
              <h2 className={styles.suggestTitle}>Sarthi suggests you ask</h2>
              <p className={styles.suggestSub}>
                {hot?.source === 'file'
                  ? 'The AI was not reachable, so these come straight from the figures in the file.'
                  : 'Read from the file to help your PD. Hand the interview to Sarthi and it asks them itself.'}
              </p>
            </div>
            <button className={styles.redo} onClick={() => prepare(true)} disabled={preparing} aria-label="Prepare the questions again">
              <FiRefreshCw size={13} className={preparing ? styles.spin : undefined} />
            </button>
          </div>

          {questions.length > 0 && (
            <div className={styles.filters}>
              <button className={filter === 'all' ? styles.filterOn : styles.filter} onClick={() => setFilter('all')}>All <em>{questions.length}</em></button>
              {Object.entries(SECTION).filter(([k]) => counts[k]).map(([k, s]) => (
                <button key={k} className={filter === k ? styles.filterOn : styles.filter} onClick={() => setFilter(k)}>{s.label} <em>{counts[k]}</em></button>
              ))}
            </div>
          )}

          {!questions.length
            ? (
              <div className={styles.skeletons}>
                {[0, 1, 2].map((i) => <div key={i} className={styles.skeleton} />)}
                <p className={styles.suggestSub}>Sarthi is reading the file…</p>
              </div>
            )
            : (
              <motion.ol className={styles.qs} variants={listContainer} initial="initial" animate="animate" key={filter}>
                {shown.map((h) => {
                  const s = SECTION[h.section] ?? SECTION.loan_purpose;
                  const n = questions.indexOf(h) + 1;
                  const open = openWhy === h.id;
                  return (
                    <motion.li key={h.id} variants={listItem} className={`${styles.q} ${styles[`sec_${h.section}`] ?? ''}`}>
                      <div className={styles.qTop}>
                        <span className={styles.qNum}>{String(n).padStart(2, '0')}</span>
                        <span className={styles.qTag}><s.icon size={11} /> {s.label}</span>
                        {h.covers?.length > 0 && <span className={styles.qCovers}>covers {h.covers.length} basic</span>}
                      </div>
                      <p className={styles.qText}>{h.q}</p>
                      {h.why && (
                        <button className={styles.whyBtn} onClick={() => setOpenWhy(open ? null : h.id)} aria-expanded={open}>
                          <FiHelpCircle size={12} /> Why ask this
                        </button>
                      )}
                      <AnimatePresence>
                        {open && (
                          <motion.p className={styles.why} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                            {h.why}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </motion.li>
                  );
                })}
              </motion.ol>
            )}
        </section>
      )}

      <div className={styles.footer}>
        <motion.button className={styles.start} whileTap={{ scale: 0.98 }} onClick={() => (isNew ? navigate(`/sarthi/interview/${c.id}`) : setChoose(true))}>
          Start the interview <FiArrowRight size={18} />
        </motion.button>
      </div>

      <BottomSheet open={choose} onClose={() => setChoose(false)} title="Who will take this PD?">
        <div className={styles.choices}>
          <button className={styles.choice} onClick={() => navigate(`/sarthi/interview/${c.id}`)}>
            <span className={styles.choiceIcon}><FiCpu size={20} /></span>
            <span>
              <b>Sarthi AI</b>
              <small>
                {c.quickPd
                  ? <>Hand the phone to {c.name.split(' ')[0]}. Sarthi runs a short {c.quickPd.length + 1}-question PD — identity, location, business and income — and checks every figure live.</>
                  : <>Hand the phone to {c.name.split(' ')[0]}. Sarthi runs the full PD and also asks the
                    {questions.length ? ` ${questions.length}` : ''} questions it suggested.</>}
                {' '}Nothing else in the app is reachable until it ends.
              </small>
            </span>
            <FiArrowRight className={styles.choiceGo} size={16} />
          </button>
          <button className={styles.choice} onClick={() => navigate(`/sarthi/officer/${c.id}`)}>
            <span className={`${styles.choiceIcon} ${styles.choiceIconBo}`}><FiUser size={20} /></span>
            <span>
              <b>Branch Officer (you)</b>
              <small>Take it yourself, with Sarthi&apos;s suggested questions on screen to tick off and note answers against.</small>
            </span>
            <FiArrowRight className={styles.choiceGo} size={16} />
          </button>
        </div>
      </BottomSheet>
    </Page>
  );
}

function KycRow({ term, value, note, ok, bad }) {
  return (
    <div className={styles.kycRow}>
      <span className={`${styles.kycMark} ${bad ? styles.kycBad : ok ? styles.kycOk : styles.kycWatch}`}>
        {bad ? <FiX size={12} /> : ok ? <FiCheck size={12} /> : <FiAlertTriangle size={11} />}
      </span>
      <div className={styles.kycBody}>
        <div className={styles.kycLine}><span className={styles.kycTerm}>{term}</span><span className={styles.kycVal}>{value}</span></div>
        <span className={styles.kycNote}>{note}</span>
      </div>
    </div>
  );
}
