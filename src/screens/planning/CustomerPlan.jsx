import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCheck, FiPlus, FiPhone, FiMapPin, FiFileText, FiHelpCircle, FiUsers, FiChevronRight } from 'react-icons/fi';
import { IoCalculator, IoSparkles } from 'react-icons/io5';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../hooks/useToast';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { formatINR, formatDate } from '../../utils/formatters';
import { PRODUCT_RATES, PRODUCTS, emi, maxLoan, BASIC_QUESTIONS, FOIR } from '../../utils/loanCalc';
import { START, km, optimise } from './RouteResult';
import styles from './plan.module.css';

/*
  PLAN MY DAY · CUSTOMERS — new walk-ins, leads (file in progress) and existing borrowers (disbursed).
  Each customer opens a prep screen: the basic questions a lender asks + a loan calculator.
*/
const KINDS = [
  { id: 'new', label: 'New', tone: 'primary', long: 'New customer', desc: 'Enquired, no file yet' },
  { id: 'lead', label: 'Leads', tone: 'warning', long: 'Lead', desc: 'File in progress' },
  { id: 'existing', label: 'Existing', tone: 'success', long: 'Existing customer', desc: 'Loan disbursed' },
];
const kindOf = (id) => KINDS.find((k) => k.id === id);
const MEETING_MINS = 30;
const DAY_START = 9 * 60 + 30;

export default function CustomerPlan() {
  const navigate = useNavigate();
  const { customers, planDay } = useAppState();
  const { toast } = useToast();
  const [kind, setKind] = useState('new');
  const [picks, setPicks] = useLocalStorage('bo_cust_picks', []);
  const list = customers.filter((c) => c.kind === kind);
  const counts = Object.fromEntries(KINDS.map((k) => [k.id, customers.filter((c) => c.kind === k.id).length]));
  const toggle = (id) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 6 ? (toast('Max 6 meetings in a day', 'warning', 1400), p) : [...p, id]));

  const start = () => {
    const order = optimise(picks.map((id) => customers.find((c) => c.id === id)).filter(Boolean));
    let prev = START, t = DAY_START;
    const stops = order.map((c) => {
      t += Math.round((km(prev, c) / 22) * 60);
      const stop = { dsaId: c.id, time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, location: c.location };
      t += MEETING_MINS; prev = c;
      return stop;
    });
    planDay(stops, [], 'customer');
    setPicks([]);
    toast(`Day planned · ${stops.length} customer meetings`, 'success');
    navigate('/', { replace: true });
  };

  return (
    <Page mode="slide" style={{ paddingBottom: 'calc(var(--tabbar-safe) + 104px)' }}>
      <TopBar back title="Meet customers" subtitle={`${picks.length} of 6 picked`} hideBell />

      <div className={styles.kindSeg}>
        {KINDS.map((k) => <button key={k.id} className={`${styles.kindBtn} ${kind === k.id ? styles.kindOn : ''}`} onClick={() => setKind(k.id)}>{k.label} <b>{counts[k.id]}</b></button>)}
      </div>
      <p className="hint" style={{ marginBottom: 12 }}>{kindOf(kind).long}s · {kindOf(kind).desc}. Tap a card to prep — questions to ask and a loan calculator.</p>

      {list.length === 0 ? (
        <EmptyState emoji="👤" title={`No ${kindOf(kind).label.toLowerCase()} customers`} subtitle="Nothing in this bucket right now." compact />
      ) : (
        <motion.div className="stack" variants={listContainer} initial="initial" animate="animate" key={kind}>
          {list.map((c) => {
            const on = picks.includes(c.id);
            return (
              <motion.div key={c.id} variants={listItem}>
                <Card padding={14} noChevron className={on ? styles.pickedCard : ''} onClick={() => navigate(`/customers/${c.id}`)}>
                  <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                    <Avatar name={c.name} size={44} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row-between">
                        <div style={{ fontWeight: 600 }} className="truncate">{c.name}</div>
                        <Badge tone={kindOf(c.kind).tone} soft>{kindOf(c.kind).label}</Badge>
                      </div>
                      <div className="hint truncate">{c.product} · {formatINR(c.amount)}{c.kind === 'existing' ? ` · EMI ${formatINR(c.emi)}` : ' asked'}</div>
                      <div className="hint truncate"><FiMapPin size={11} style={{ verticalAlign: '-1px' }} /> {c.location} · {c.distanceKm} km</div>
                      <div className="hint clamp2" style={{ marginTop: 6, color: 'var(--text-1)' }}>{c.note}</div>
                      <div className="row-between" style={{ marginTop: 10 }}>
                        <span className="hint" style={{ color: 'var(--primary)', fontWeight: 600 }}>Prep & calculator <FiChevronRight size={12} style={{ verticalAlign: '-2px' }} /></span>
                        <button className={`${styles.addBtn} ${on ? styles.addOn : ''}`} onClick={(e) => { e.stopPropagation(); toggle(c.id); }}>{on ? <><FiCheck size={13} /> Added</> : <><FiPlus size={13} /> Add</>}</button>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <div className={styles.planBar}>
        <Button full disabled={picks.length === 0} icon={<FiCheck size={18} />} onClick={start}>{picks.length === 0 ? 'Add customers to plan' : `Start my day · ${picks.length} meeting${picks.length === 1 ? '' : 's'}`}</Button>
      </div>
    </Page>
  );
}

/* ---------------- Customer prep: basic questions + loan calculator ---------------- */
export function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getCustomer, getDsa, loanFiles } = useAppState();
  const { toast } = useToast();
  const c = getCustomer(id);
  const [picks, setPicks] = useLocalStorage('bo_cust_picks', []);
  const [allAnswers, setAllAnswers] = useLocalStorage('bo_cust_answers', {});
  const [view, setView] = useState('questions');
  const answers = useMemo(() => ({ employment: c?.employment, income: c?.income, existingEmi: c?.existingEmi, age: c?.age, ...(allAnswers[id] ?? {}) }), [allAnswers, id, c]);
  const setAnswer = (k, v) => setAllAnswers((a) => ({ ...a, [id]: { ...(a[id] ?? {}), [k]: v } }));

  // Calculator state seeded from what the customer asked for
  const [product, setProduct] = useState(c?.product ?? PRODUCTS[0]);
  const [amount, setAmount] = useState(c?.amount ?? 1000000);
  const [tenure, setTenure] = useState(Math.min(36, PRODUCT_RATES[c?.product ?? PRODUCTS[0]].maxTenure));
  if (!c) return <Page><TopBar back title="Customer" /><EmptyState emoji="🔍" title="Customer not found" /></Page>;

  const rules = PRODUCT_RATES[product];
  const rate = rules.rate;
  const monthly = emi(amount, rate, tenure);
  const totalPay = monthly * tenure;
  const income = Number(answers.income) || 0, existing = Number(answers.existingEmi) || 0;
  const eligible = maxLoan(income, existing, rate, tenure);
  const fits = income > 0 && amount <= eligible;
  const answered = BASIC_QUESTIONS.filter((q) => answers[q.id] != null && answers[q.id] !== '').length;
  const on = picks.includes(c.id);
  const dsa = c.sourceDsa ? getDsa(c.sourceDsa) : null;
  const file = c.loanFileId ? loanFiles.find((f) => f.id === c.loanFileId) : null;
  const k = kindOf(c.kind);

  return (
    <Page mode="slide" style={{ paddingBottom: 'calc(var(--tabbar-safe) + 104px)' }}>
      <TopBar back title={c.name} subtitle={`${k.long} · ${c.business}`} hideBell />

      <Card padding={16} noChevron>
        <div className="row" style={{ gap: 12 }}>
          <Avatar name={c.name} size={48} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row-between"><div style={{ fontWeight: 700, fontSize: 16 }} className="truncate">{c.name}</div><Badge tone={k.tone} soft>{k.label}</Badge></div>
            <div className="hint truncate"><FiMapPin size={11} style={{ verticalAlign: '-1px' }} /> {c.location} · {c.distanceKm} km</div>
            <div className="hint truncate"><FiPhone size={11} style={{ verticalAlign: '-1px' }} /> {c.phone}</div>
          </div>
        </div>
        <div className="hint" style={{ marginTop: 10, color: 'var(--text-1)', lineHeight: 1.45 }}>{c.note}</div>
        <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <Badge tone="primary" soft>{c.product}</Badge>
          <Badge tone="neutral" soft>{c.kind === 'existing' ? `Disbursed ${formatINR(c.amount)}` : `Asking ${formatINR(c.amount)}`}</Badge>
          {dsa && <button className="link" onClick={() => navigate(`/dsas/${dsa.id}`)}><Badge tone="neutral" soft><FiUsers size={10} style={{ verticalAlign: '-1px' }} /> via {dsa.name.split(' ')[0]}</Badge></button>}
        </div>
        {file && (
          <button className="row-between" style={{ width: '100%', marginTop: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--bg)', textAlign: 'left' }} onClick={() => navigate(`/files/${file.id}`)}>
            <span className="row" style={{ gap: 8 }}><FiFileText size={15} color="var(--primary)" /><span><div style={{ fontWeight: 600, fontSize: 14 }}>{file.id} · {file.product}</div><div className="hint">Disbursed {formatDate(c.disbursedOn)} · EMI {formatINR(c.emi)}/mo</div></span></span>
            <FiChevronRight size={16} color="var(--text-3)" />
          </button>
        )}
      </Card>

      <div className={styles.seg} style={{ margin: '14px 0 12px' }}>
        <button className={`${styles.segBtn} ${view === 'questions' ? styles.segOn : ''}`} onClick={() => setView('questions')}><FiHelpCircle size={14} /> Basic questions · {answered}/{BASIC_QUESTIONS.length}</button>
        <button className={`${styles.segBtn} ${view === 'calc' ? styles.segOn : ''}`} onClick={() => setView('calc')}><IoCalculator size={14} /> Loan calculator</button>
      </div>

      {view === 'questions' && (
        <Card padding={16} noChevron>
          <p className="hint" style={{ marginBottom: 4 }}>What a lender asks before quoting. Answers feed the calculator's eligibility.</p>
          {BASIC_QUESTIONS.map((q, i) => (
            <div key={q.id} className={styles.qRow}>
              <div className={styles.qText}>{i + 1}. {q.q}</div>
              {q.type === 'choice' ? (
                <div className={styles.qOpts}>{q.options.map((o) => <button key={o} className={`${styles.qOpt} ${answers[q.id] === o ? styles.qOptOn : ''}`} onClick={() => setAnswer(q.id, answers[q.id] === o ? '' : o)}>{o}</button>)}</div>
              ) : (
                <input className={styles.qInput} type="number" inputMode="numeric" placeholder={q.type === 'money' ? '₹ per month' : 'Years'} value={answers[q.id] ?? ''} onChange={(e) => setAnswer(q.id, e.target.value)} />
              )}
              <div className={styles.qHint}>{q.hint}</div>
            </div>
          ))}
        </Card>
      )}

      {view === 'calc' && (
        <div className="stack">
          <Card padding={16} noChevron>
            <div className="hint" style={{ fontWeight: 600, marginBottom: 8 }}>Product</div>
            <div className={styles.qOpts}>{PRODUCTS.map((p) => <button key={p} className={`${styles.qOpt} ${product === p ? styles.qOptOn : ''}`} onClick={() => { setProduct(p); setTenure((t) => Math.min(t, PRODUCT_RATES[p].maxTenure)); setAmount((a) => Math.min(Math.max(a, PRODUCT_RATES[p].minAmt), PRODUCT_RATES[p].maxAmt)); }}>{p}</button>)}</div>
            <div className="hint" style={{ marginTop: 6 }}>Indicative rate <b style={{ color: 'var(--text-1)' }}>{rate}% p.a.</b> · up to {rules.maxTenure / 12} years</div>

            <div className="row-between" style={{ marginTop: 16 }}><span className="hint" style={{ fontWeight: 600 }}>Loan amount</span><b>{formatINR(amount)}</b></div>
            <input className={styles.slider} type="range" min={rules.minAmt} max={rules.maxAmt} step={50000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            <div className="row-between" style={{ marginTop: 12 }}><span className="hint" style={{ fontWeight: 600 }}>Tenure</span><b>{tenure} months{tenure >= 12 ? ` · ${(tenure / 12).toFixed(tenure % 12 ? 1 : 0)} yr` : ''}</b></div>
            <input className={styles.slider} type="range" min={6} max={rules.maxTenure} step={6} value={tenure} onChange={(e) => setTenure(Number(e.target.value))} />

            <div className={styles.calcOut}>
              <div className={styles.calcTile}><div className="v" style={{ color: 'var(--primary)' }}>{formatINR(Math.round(monthly))}</div><div className="k">EMI per month</div></div>
              <div className={styles.calcTile}><div className="v">{formatINR(Math.round(totalPay - amount))}</div><div className="k">Total interest</div></div>
              <div className={styles.calcTile}><div className="v">{formatINR(Math.round(totalPay))}</div><div className="k">Total payable</div></div>
              <div className={styles.calcTile}><div className="v" style={{ color: income ? (fits ? 'var(--success)' : 'var(--danger)') : undefined }}>{income ? formatINR(Math.round(eligible)) : '—'}</div><div className="k">Max eligible</div></div>
            </div>
          </Card>
          <Card padding={14} noChevron status={income ? (fits ? 'success' : 'warning') : undefined}>
            {income ? (
              <>
                <div style={{ fontWeight: 600 }}>{fits ? `${formatINR(amount)} fits the customer's repayment capacity` : `Asked amount is above eligibility by ${formatINR(Math.round(amount - eligible))}`}</div>
                <div className="hint" style={{ marginTop: 4 }}>Income {formatINR(income)}/mo · existing EMIs {formatINR(existing)} → room for {formatINR(Math.round(income * FOIR - existing))}/mo (FOIR {FOIR * 100}%).{!fits && ' Try a longer tenure, lower amount or a co-applicant.'}</div>
              </>
            ) : (
              <div className="hint">Fill <b>income</b> and <b>existing EMI</b> in Basic questions to see what the customer is eligible for.</div>
            )}
          </Card>
        </div>
      )}

      <div className={styles.planBar}>
        <div className="row" style={{ gap: 8 }}>
          <Button style={{ flex: 1 }} variant={on ? 'secondary' : 'primary'} icon={on ? <FiCheck size={18} /> : <FiPlus size={18} />} onClick={() => { setPicks((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id])); toast(on ? 'Removed from today' : "Added to today's plan", 'success', 1200); }}>{on ? "In today's plan" : 'Add to today'}</Button>
          <Button style={{ flex: 1 }} variant="secondary" icon={<FiMapPin size={18} />} onClick={() => navigate(`/visits/new?dsa=${c.id}`)}>Log visit</Button>
        </div>
        <button className={styles.aiRow} onClick={() => navigate(`/ai/session?kind=customer&id=${c.id}`)}>
          <IoSparkles size={15} /> <span className="grow">Let <b>SAARTHI AI</b> interview {c.name.split(' ')[0]} and write the report</span> <FiChevronRight size={15} />
        </button>
      </div>
    </Page>
  );
}

export { KINDS as CUSTOMER_KINDS };
