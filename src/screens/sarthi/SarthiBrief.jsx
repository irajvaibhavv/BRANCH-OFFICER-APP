import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FiAlertTriangle, FiBriefcase, FiCalendar, FiCheck, FiClock, FiCpu, FiCreditCard, FiFileText,
  FiHelpCircle, FiMapPin, FiRefreshCw, FiRepeat, FiSearch, FiShield, FiTrendingDown, FiUser, FiX, FiZap,
  FiPhone, FiMessageSquare, FiChevronRight,
} from 'react-icons/fi';
import { IoLogoWhatsapp, IoSparkles } from 'react-icons/io5';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import EmptyState from '../../components/ui/EmptyState';
import NewPdSheet from '../../components/sarthi/NewPdSheet';
import CustomerPhotoField from '../../components/sarthi/CustomerPhotoField';
import { loadFace, saveFace } from '../../services/sarthi/face';
import Card, { MetricCard } from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import FileLifecycle from '../../components/files/FileLifecycle';
import CustomerPayout from '../../components/files/CustomerPayout';
import { pdCaseStage } from '../../utils/fileStages';
import { useToast } from '../../hooks/useToast';
import { useSarthiReports } from '../../hooks/useSarthiReports';
import { formatINR } from '../../utils/formatters';
import { pdEvents, pdOutcome } from '../../services/sarthi/repeat';
import { getCase, lookupRiskPattern, bankIncome } from '../../services/sarthi/knowledge';
import { computeEligibility } from '../../services/sarthi/verifier';
import { validatePan, maskPan } from '../../services/sarthi/idChecks';
import { loadHot, prepareHotQuestions } from '../../services/sarthi/prep';
import customersRaw from '../../data/mock/customers.json';
import styles from './SarthiBrief.module.css';

const RISK = { low: 'Low risk', medium: 'Medium risk', high: 'High risk' };
const RISK_TONE = { low: 'success', medium: 'warning', high: 'danger' };
const TABS = ['Overview', 'History', 'Money', 'KYC', 'Questions'];
const SECTION = {
  personal: { label: 'Personal', icon: FiUser },
  business: { label: 'Business', icon: FiBriefcase },
  financial: { label: 'Money', icon: FiCreditCard },
  documents: { label: 'Documents', icon: FiFileText },
  loan_purpose: { label: 'Loan', icon: FiZap },
};
const inr = (n) => formatINR(n, { compact: false });
// Audit-trail timestamps: the full date on the PD, the time on each event.
const stamp = (d) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const time = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

export default function SarthiBrief() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = getCase(id);
  const [hot, setHot] = useState(() => loadHot(id));
  const [preparing, setPreparing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [openWhy, setOpenWhy] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [reports] = useSarthiReports();
  const [sheetFor, setSheetFor] = useState(null); // the PD a new one follows up
  const [face, setFace] = useState(() => loadFace(id)?.dataUrl ?? null);
  const { toast } = useToast();
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
    { icon: FiFileText, term: 'Filed as income', value: b.itrIncome == null ? 'No ITR' : `${inr(b.itrIncome)}/yr`, note: b.gstRegistered ? `GST since ${b.gstVintage}${b.gstin ? ` · ${b.gstin}` : ''}` : 'Not GST registered', tone: b.itrIncome == null ? 'watch' : undefined },
    { icon: FiCalendar, term: 'Trading for', value: c.businessVintage || '—', note: c.businessName },
    { icon: FiMapPin, term: 'Area default', value: b.areaDefaultRate != null ? `${Math.round(b.areaDefaultRate * 100)}%` : '—', note: b.areaDefaultRate != null ? 'of loans in this locality' : 'No lending history', tone: b.areaDefaultRate > 0.15 ? 'stamp' : b.areaDefaultRate > 0.1 ? 'watch' : undefined },
    ...(b.bank ? [{ icon: FiTrendingDown, term: 'Bounces', value: b.bank.bounces, note: `${b.bank.cashCreditPct}% cash · ${b.bank.upiCreditPct}% UPI`, tone: b.bank.bounces ? 'stamp' : 'clear' }] : []),
  ];

  // Every PD of this person, newest first. The first starts at once; after that the BO / CO picks why another is needed.
  const pds = reports.filter((r) => r.caseId === c.id);
  const report = pds[0];
  const start = () => (report ? setSheetFor(report) : navigate(`/sarthi/interview/${c.id}`));
  const tabs = isNew ? TABS.filter((t) => t !== 'Questions') : TABS;

  return (
    <Page mode="slide" className={`sarthi ${styles.page}`}>
      <TopBar back title={c.name} hideBell />

      {/* Same header as a DSA: who, how to reach them, then the PD */}
      <div className={styles.detailHead}>
        {/* the customer's photo, if the BO took one — tap to add or retake it on the KYC tab */}
        <button type="button" className={styles.avatarBtn} onClick={() => setTab('KYC')} aria-label="Customer photo">
          <Avatar name={c.name} size={84} ring src={face} />
          {!face && <span className={styles.avatarAdd}>+ photo</span>}
        </button>
        <h1 style={{ fontSize: 24 }}>{c.name}</h1>
        <span className="label">{c.business} · {c.area.split(',')[0]}</span>
        {c.riskLevel && <Badge tone={RISK_TONE[c.riskLevel]} size="md">{RISK[c.riskLevel]}</Badge>}
        <div className={styles.actions}>
          <button className={styles.actBtn} onClick={() => toast(`Calling ${c.name}…`)}><FiPhone size={16} /> Call</button>
          <button className={styles.actBtn} style={{ color: '#16a34a' }} onClick={() => toast('Opening WhatsApp…')}><IoLogoWhatsapp size={18} /> WhatsApp</button>
          <button className={styles.actBtn} style={{ color: 'var(--primary)' }} onClick={() => toast(`Opening maps for ${c.area}`)}><FiMapPin size={16} /> Location</button>
        </div>
        <div className={styles.actions} style={{ marginTop: 8 }}>
          <button className={`${styles.actBtn} ${styles.actAi}`} onClick={start}><IoSparkles size={16} /> {report ? 'New PD' : 'Sarthi AI'}</button>
          {report
            ? <button className={styles.actBtn} style={{ color: 'var(--primary)' }} onClick={() => navigate(`/sarthi/report/${c.id}`)}><FiFileText size={16} /> View report</button>
            : !isNew && <button className={styles.actBtn} style={{ color: 'var(--primary)' }} onClick={() => navigate(`/sarthi/officer/${c.id}`)}><FiUser size={16} /> Take PD yourself</button>}
        </div>
      </div>

      <NewPdSheet open={!!sheetFor} onClose={() => setSheetFor(null)} caseId={c.id} pd={sheetFor} />

      <Card padding={16} noChevron>
        <div className="label" style={{ marginBottom: 8 }}>Loan file stage</div>
        <FileLifecycle status={pdCaseStage(c, !!report)} />
      </Card>
      {/* PD files carry no source DSA; a customer who came through one is linked in customers.json */}
      <CustomerPayout amount={c.loanAmountRequested} product={c.product} stage={pdCaseStage(c, !!report)}
        dsaId={c.sourceDsa ?? customersRaw.find((x) => x.sarthiCase === c.id)?.sourceDsa}
        paidOn={c.disbursedOn} feePaidOn={c.payoutPaidOn} feeUtr={c.payoutUtr} style={{ marginBottom: 14 }} />

      <div className={styles.tabs}>
        {tabs.map((t) => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.tabOn : ''}`} onClick={() => setTab(t === 'History' && tab === t ? 'Overview' : t)}>
            {tab === t && <motion.span layoutId="cust-tab" className={styles.tabPill} transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
            <span style={{ position: 'relative' }}>{t}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
          {tab === 'Overview' && (
            <div className="stack">
              {!isNew && (
                <Card className="tint-primary" noChevron padding={12} onClick={() => setTab('Questions')}>
                  <div className="row-between">
                    <div className="hint" style={{ color: 'var(--primary)', fontWeight: 700 }}><FiMessageSquare size={13} style={{ verticalAlign: '-2px' }} /> PD brief <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>· Sarthi suggests</span></div>
                    <span className={styles.briefMore}>All {questions.length} <FiChevronRight size={14} /></span>
                  </div>
                  <div className={styles.briefChips}>
                    {questions.length
                      ? questions.slice(0, 3).map((h) => <span key={h.id} className={`${styles.briefChip} ${styles[`sec_${h.section}`] ?? ''}`}><span className={styles.briefDot} />{h.q}</span>)
                      : <span className="hint">Sarthi is reading the file…</span>}
                  </div>
                </Card>
              )}
              <div className={styles.metricGrid}>
                <MetricCard value={formatINR(c.loanAmountRequested)} label="Asking" tone="primary" onClick={() => setTab('Money')} />
                <MetricCard value={c.declaredIncome ? formatINR(c.declaredIncome) : '—'} label="Declared income" onClick={() => setTab('Money')} />
                <MetricCard value={noBank ? '—' : formatINR(bank.income)} label="Bank supports" tone={noBank ? undefined : gap > 40 ? 'danger' : gap > 10 ? 'warning' : 'success'} onClick={() => setTab('Money')} />
                <MetricCard value={b.bureauScore ?? '—'} label="Bureau score" tone={b.bureauScore == null ? undefined : b.bureauScore >= 750 ? 'success' : b.bureauScore >= 700 ? 'warning' : 'danger'} onClick={() => setTab('KYC')} />
              </div>

              <Card padding={16} noChevron>
                <div className="hint" style={{ color: 'var(--primary)', fontWeight: 600, marginBottom: 12 }}>Said vs bank</div>
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
                <p className={styles.heroNote}>
                  {noBank
                    ? <>No bank statement on file. Sarthi will rebuild income from their answers (footfall, bill size and the trade&apos;s margin) and mark it unverified.</>
                    : <>{b.bankStatementMonths} months of statements: {inr(bank.credits)} a month of credits{bank.marginPct != null ? <>, about {inr(bank.income)} of income at the trade&apos;s {bank.marginPct}% margin</> : null}.</>}
                </p>
              </Card>

              <Card padding={16} noChevron>
                <div className="row" style={{ gap: 12 }}>
                  <FiMapPin size={22} color="var(--text-2)" />
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{c.area}</div>
                    <div className="hint">{[c.businessName, c.businessVintage, c.loanPurpose].filter(Boolean).join(' · ')}</div>
                  </div>
                </div>
              </Card>

              {(b.largeDeposits.length > 0 || (!b.docsSubmitted && b.missingDocs.length > 0)) && (
                <div className={styles.alerts}>
                  {b.largeDeposits.map((d, i) => (
                    <div key={i} className={styles.alert}><FiAlertTriangle size={15} /> <span><b>{formatINR(d.amount)}</b> landed in {d.month} with no source on file{d.note ? ` — ${d.note.toLowerCase()}` : ''}</span></div>
                  ))}
                  {!b.docsSubmitted && b.missingDocs.map((d) => <div key={d} className={styles.alert}><FiX size={15} /> <span>{d} never arrived</span></div>)}
                </div>
              )}

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
            </div>
          )}

          {tab === 'Money' && (
            <>
              <section className={styles.card} style={{ marginTop: 0 }}>
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
            </>
          )}

          {/* the customer's photo: Sarthi compares it with the person on the video call */}
          {tab === 'KYC' && (
            <Card padding={16} noChevron style={{ marginBottom: 14 }}>
              <CustomerPhotoField value={face} onChange={(d) => (saveFace(id, d) ? setFace(d) : toast('Phone storage is full — the photo was not saved'))} />
            </Card>
          )}
          {tab === 'KYC' && (
            (b.kyc || b.bank || b.bureau) ? (
              <section className={styles.card} style={{ marginTop: 0 }}>
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
            ) : <EmptyState emoji="🪪" title="No documents on file" subtitle="Sarthi asks for PAN and Aadhaar during the interview." />
          )}

          {/* the audit trail: every PD as timestamped events, newest first — and a new PD from any of them */}
          {tab === 'History' && (
            <div className="stack">
              <div className="row-between">
                <div className="label">Audit trail · {pds.length} PD{pds.length === 1 ? '' : 's'}</div>
                {report && <button className={styles.pdNew} onClick={() => setSheetFor(report)}><FiRefreshCw size={13} /> New PD</button>}
              </div>
              {pds.length === 0 && <EmptyState emoji="🗂️" title="No PD yet" subtitle="Every PD Sarthi runs with this customer is logged here, with its timestamps." />}
              {pds.map((p) => (
                <Card key={p.id} padding={16} noChevron>
                  <div className={styles.trailTop}>
                    <strong>PD {p.pdNo ?? 1}</strong>
                    <Badge tone={pdOutcome(p).badge} soft>{pdOutcome(p).label}</Badge>
                    <span className={styles.trailWhen}>{stamp(p.startedAt ?? p.createdAt)}</span>
                  </div>
                  <ol className={styles.trail}>
                    {pdEvents(p, pds).map((e) => (
                      <li key={e.title} className={`${styles.trailItem} ${styles[`tone_${e.tone}`]}`}>
                        <div className={styles.trailHead}><strong>{e.title}</strong><span className={styles.trailWhen}>{e.at ? time(e.at) : ''}</span></div>
                        <div className={styles.trailWhy}>{e.text}</div>
                        {e.flags?.map((f) => <div key={f} className={styles.trailFlag}>• {f}</div>)}
                      </li>
                    ))}
                  </ol>
                  <div className={styles.trailActions}>
                    <button onClick={() => navigate(`/sarthi/report/${c.id}?pd=${p.id}`)}><FiFileText size={13} /> Report</button>
                    <button onClick={() => setSheetFor(p)}><IoSparkles size={13} /> New PD from here</button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {tab === 'Questions' && !isNew && (
        <section className={styles.suggest} style={{ marginTop: 0 }}>
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
        </motion.div>
      </AnimatePresence>

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
