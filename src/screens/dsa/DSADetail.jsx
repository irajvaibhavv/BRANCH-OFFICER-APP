import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { IoSparkles } from 'react-icons/io5';
import { FiPhone, FiCalendar, FiMapPin, FiMic, FiUsers, FiFileText, FiChevronRight, FiPercent, FiMessageSquare } from 'react-icons/fi';
import { IoLogoWhatsapp } from 'react-icons/io5';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card, { MetricCard } from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import Badge, { QualityBadge, StatusBadge } from '../../components/ui/Badge';
import StarRating from '../../components/ui/StarRating';
import EmptyState from '../../components/ui/EmptyState';
import { GroupedBarChart } from '../../components/charts/BarChart';
import { commissionFor, approvedMonthly, productMix } from '../../utils/commission';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../hooks/useToast';
import { formatINR, formatDate } from '../../utils/formatters';
import { fmtTime } from '../home/Dashboard';
import { RecordingCard } from '../recorder/MeetingRecorder';
import BottomSheet from '../../components/ui/BottomSheet';
import QuestionList, { useMeetingQuestions } from '../../components/ui/MeetingPrep';
import { TOPICS } from '../../utils/meetingPrep';
import styles from './dsa.module.css';

const TABS = ['Overview', 'Business', 'Files', 'Meetings', 'Notes'];
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'];

export default function DSADetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { getDsa, loanFiles, visits, rateDsa, recordings, engagements } = useAppState();
  const { toast } = useToast();
  const [tab, setTab] = useState(TABS.includes(params.get('tab')) ? params.get('tab') : 'Overview');
  const [allEng, setAllEng] = useState(false);
  const [qSheet, setQSheet] = useState(false);
  const [qTopic, setQTopic] = useState(null); // topic filter for the questions sheet (from a chip)
  const openQuestions = (topic = null) => { setQTopic(topic); setQSheet(true); };
  // Every meeting anyone from the company has had with this DSA (BO, Branch Head, Regional Head, CEO…)
  const eng = useMemo(() => engagements.filter((e) => e.dsaId === id), [engagements, id]);
  const senior = eng.filter((e) => e.lead !== 'bo');
  const roleCounts = useMemo(() => {
    const m = {};
    eng.forEach((e) => { const r = e.attendees[0].role.split(' –')[0]; m[r] = (m[r] ?? 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [eng]);
  const dsa = getDsa(id);
  const questions = useMeetingQuestions(dsa);
  if (dsa?.isCustomer) return <Navigate to={`/customers/${dsa.id}`} replace />;
  const mustAsk = questions.filter((x) => x.priority === 'high').length;

  if (!dsa) return <Page mode="slide"><TopBar back title="DSA" /><EmptyState emoji="🤷" title="DSA not found" /></Page>;

  const files = loanFiles.filter((f) => f.dsaId === id);
  const pay = commissionFor(dsa);
  const approved = approvedMonthly(dsa);
  const mix = productMix(dsa);
  const topProduct = [...mix].sort((a, b) => b.disbursed - a.disbursed)[0];
  const meetings = visits.filter((v) => v.dsaId === id).sort((a, b) => b.date.localeCompare(a.date));
  const notes = meetings.filter((m) => m.notes);
  const recs = recordings.filter((r) => r.dsaId === id);

  return (
    <Page mode="slide">
      <TopBar back title={dsa.name} hideBell />

      <div className={styles.detailHead}>
        <Avatar name={dsa.name} size={84} ring />
        <h1 style={{ fontSize: 24 }}>{dsa.name}</h1>
        <span className="label">{dsa.firm} · {dsa.location}</span>
        <QualityBadge quality={dsa.quality} size="md" />
        <StarRating value={dsa.rating} onChange={(n) => { rateDsa(dsa.id, n); toast(`Rated ${n}★`, 'success', 1500); }} size={22} />
        {/* Actions: reach the DSA, then run the meeting. Equal-width cells so nothing wraps or overflows. */}
        <div className={styles.actions}>
          <button className={styles.actBtn} onClick={() => { toast(`Calling ${dsa.phone}`, 'info', 1200); navigate(`/prompter?dsa=${dsa.id}&mode=call`); }}><FiPhone size={16} /> Call</button>
          <button className={styles.actBtn} style={{ color: '#16a34a' }} onClick={() => toast('Opening WhatsApp…')}><IoLogoWhatsapp size={18} /> WhatsApp</button>
          <button className={`${styles.actBtn} ${styles.actRecord}`} onClick={() => navigate(`/prompter?dsa=${dsa.id}&mode=record`)}><FiMic size={16} /> Record</button>
        </div>
        <div className={styles.actions} style={{ marginTop: 8 }}>
          <button className={`${styles.actBtn} ${styles.actAi}`} onClick={() => navigate(`/ai/session?kind=dsa&id=${dsa.id}`)}><IoSparkles size={16} /> SAARTHI AI</button>
          <button className={styles.actBtn} style={{ color: 'var(--primary)' }} onClick={() => navigate(`/scheduler?dsa=${dsa.id}`)}><FiCalendar size={16} /> Schedule meeting</button>
        </div>
      </div>

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.tabOn : ''}`} onClick={() => setTab(t)}>
            {tab === t && <motion.span layoutId="dsa-tab" className={styles.tabPill} transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
            <span style={{ position: 'relative' }}>{t}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
          {tab === 'Overview' && (
            <div className="stack">
              {/* Meeting brief — the top 3 things to raise, as one-liners. Full questions live in the sheet. */}
              <Card className="tint-primary" noChevron padding={12} onClick={() => openQuestions()}>
                <div className="row-between">
                  <div className="hint" style={{ color: 'var(--primary)', fontWeight: 700 }}><FiMessageSquare size={13} style={{ verticalAlign: '-2px' }} /> Meeting brief <span style={{ fontWeight: 500, color: 'var(--text-3)' }}>· {mustAsk} must-ask</span></div>
                  <span className={styles.briefMore}>All {questions.length} <FiChevronRight size={14} /></span>
                </div>
                <div className={styles.briefChips}>
                  {questions.slice(0, 3).map((x) => (
                    <button key={x.id} className={styles.briefChip} style={{ '--tile': TOPICS[x.topic].color }} onClick={(e) => { e.stopPropagation(); openQuestions(x.topic); }}>
                      <span className={styles.briefDot} style={{ background: TOPICS[x.topic].color }} />{x.tag ?? x.nudge ?? x.q}
                    </button>
                  ))}
                </div>
              </Card>
              <div className={styles.metricGrid}>
                <MetricCard value={dsa.filesSubmitted} label="Files submitted" onClick={() => setTab('Business')} />
                <MetricCard value={`${dsa.approvalRate}%`} label="Approval rate" tone={dsa.approvalRate >= 65 ? 'success' : dsa.approvalRate < 45 ? 'danger' : 'warning'} onClick={() => setTab('Business')} />
                <MetricCard value={formatINR(dsa.disbursed)} label="Total disbursed" tone="primary" onClick={() => setTab('Business')} />
                <MetricCard value={dsa.lastVisit ? formatDate(dsa.lastVisit) : '—'} label="Last visit" onClick={() => setTab('Meetings')} />
              </div>
              <Card className="tint-primary" onClick={() => setTab('Meetings')} noChevron>
                <div className="row-between">
                  <div className="hint" style={{ color: 'var(--primary)', fontWeight: 600 }}><FiUsers size={13} style={{ verticalAlign: '-2px' }} /> Relationship with us</div>
                  <FiChevronRight size={18} color="var(--primary)" />
                </div>
                <div className="row" style={{ gap: 20, marginTop: 10 }}>
                  <div><div className="big-number">{eng.length}</div><div className="hint">meetings so far</div></div>
                  <div><div className="big-number" style={{ color: 'var(--primary)' }}>{senior.length}</div><div className="hint">with leadership</div></div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    {senior[0] ? (
                      <>
                        <div style={{ fontWeight: 600, fontSize: 14 }} className="truncate">{senior[0].attendees[0].name}</div>
                        <div className="hint truncate">{senior[0].attendees[0].role.split(' –')[0]} · {formatDate(senior[0].date)}</div>
                      </>
                    ) : <div className="hint">No leadership meeting yet</div>}
                  </div>
                </div>
                <div className={styles.roleRow}>
                  {roleCounts.map(([r, n]) => <span key={r} className={styles.roleChip}><b>{n}</b> {r}</span>)}
                </div>
              </Card>
              <Card padding={16}>
                <div className="row" style={{ gap: 12 }}>
                  <FiMapPin size={20} color="var(--text-2)" />
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{dsa.location}</div>
                    <div className="hint">{dsa.distanceKm} km from branch · {dsa.phone}</div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {tab === 'Business' && (
            <div className="stack">
              <Card>
                <div className="row-between" style={{ marginBottom: 10 }}>
                  <h3>Submitted vs approved</h3>
                  <span className="hint">Last 6 months</span>
                </div>
                <GroupedBarChart data={MONTHS.map((m, i) => ({ label: m, a: dsa.monthly[i], b: approved[i] }))} height={110} />
                <div className="hint" style={{ marginTop: 8 }}>
                  {approved.reduce((x, y) => x + y, 0)} of {dsa.monthly.reduce((x, y) => x + y, 0)} files approved in 6 months · {dsa.approvalRate}% approval rate
                </div>
              </Card>

              {/* Business by product */}
              <Card>
                <div className="row-between" style={{ marginBottom: 12 }}>
                  <h3>Business by product</h3>
                  <span className="hint">{formatINR(dsa.disbursed)} total</span>
                </div>
                <div className={styles.mixBar}>
                  {mix.map((m) => <span key={m.product} style={{ width: `${m.share}%`, background: m.color }} title={m.product} />)}
                </div>
                <div className={styles.mixList}>
                  {mix.map((m) => (
                    <div key={m.product} className={styles.mixRow}>
                      <span className={styles.mixDot} style={{ background: m.color }} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="row-between">
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{m.product}</span>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{formatINR(m.disbursed)}</span>
                        </div>
                        <div className="row-between">
                          <span className="hint">{m.files} files · {m.approved} approved</span>
                          <span className="hint" style={{ fontWeight: 600, color: m.approval >= 65 ? 'var(--success)' : m.approval < 45 ? 'var(--danger)' : 'var(--warning)' }}>{m.approval}% approval</span>
                        </div>
                        <div className={styles.mixTrack}><span style={{ width: `${m.approval}%`, background: m.color }} /></div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hint" style={{ marginTop: 10 }}>
                  Strongest in <b style={{ color: 'var(--text-1)' }}>{topProduct.product}</b> ({topProduct.share}% of disbursal)
                  {mix.some((m) => m.approval < 45) ? ` · coach on ${mix.filter((m) => m.approval < 45).map((m) => m.product).join(', ')}` : ''}
                </div>
              </Card>

              {/* Commission / payout */}
              <Card>
                <div className="row-between" style={{ marginBottom: 12 }}>
                  <h3><FiPercent size={15} style={{ verticalAlign: '-2px', color: 'var(--primary)' }} /> Commission & payout</h3>
                  <Badge tone="warning" soft>{pay.slab} slab</Badge>
                </div>
                <div className={styles.payGrid}>
                  <div><div className="big-number" style={{ fontSize: 22 }}>{pay.blended}%</div><div className="hint">blended payout</div></div>
                  <div><div className="big-number" style={{ fontSize: 22 }}>{formatINR(pay.thisMonth)}</div><div className="hint">earned this month</div></div>
                  <div><div className="big-number" style={{ fontSize: 22, color: 'var(--warning)' }}>{formatINR(pay.pending)}</div><div className="hint">payout pending</div></div>
                  <div><div className="big-number" style={{ fontSize: 22, color: 'var(--success)' }}>{formatINR(pay.paidFY)}</div><div className="hint">paid this FY</div></div>
                </div>
                <div className="hint" style={{ margin: '12px 0 6px', fontWeight: 600 }}>Payout rate by product</div>
                <div className={styles.rateList}>
                  {pay.rates.map((r) => (
                    <div key={r.product} className={styles.rateRow}>
                      <span>{r.product}</span>
                      <span className={styles.rateBar}><span style={{ width: `${(r.rate / 1.5) * 100}%` }} /></span>
                      <b>{r.rate}%</b>
                    </div>
                  ))}
                </div>
                <div className="hint" style={{ marginTop: 10 }}>% of disbursed amount · {dsa.quality === 'high' ? '+0.15 pt Gold slab bonus' : dsa.quality === 'low' ? '\u22120.10 pt below Silver' : 'standard Silver rates'}</div>
              </Card>
            </div>
          )}

          {tab === 'Files' && (
            files.length === 0 ? <EmptyState compact emoji="📁" title="No files yet" subtitle="Files this DSA submits will show up here." /> : (
              <div className="stack">
                {files.map((f) => (
                  <Card key={f.id} padding={16} onClick={() => navigate(`/files?open=${f.id}`)}>
                    <div className="row-between">
                      <div className="grow">
                        <div style={{ fontWeight: 600 }}>{f.borrower}</div>
                        <div className="hint">{f.product} · {f.id}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700 }}>{formatINR(f.amount)}</div>
                        <StatusBadge status={f.status} soft />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )
          )}

          {tab === 'Meetings' && (
            <div className="stack">
              {/* ---- Company-wide meeting history ---- */}
              <div className={styles.engStrip}>
                <div><div className="big-number">{eng.length}</div><div className="hint">Total with us</div></div>
                <div><div className="big-number" style={{ color: 'var(--primary)' }}>{senior.length}</div><div className="hint">Leadership</div></div>
                <div><div className="big-number">{eng[0] ? formatDate(eng[0].date) : '—'}</div><div className="hint">Last contact</div></div>
              </div>
              <div className="section-head" style={{ margin: '8px 0 0' }}>
                <h2 className="section-title" style={{ fontSize: 16 }}>{allEng ? 'All company meetings' : 'Last 5 company meetings'}</h2>
                {eng.length > 5 && <button className="link" onClick={() => setAllEng((v) => !v)}>{allEng ? 'Show less' : `All ${eng.length}`}</button>}
              </div>
              {(allEng ? eng : eng.slice(0, 5)).map((e) => {
                const lead = e.attendees[0];
                const tone = e.outcome === 'Positive' ? 'success' : e.outcome === 'Follow-up needed' ? 'warning' : 'primary';
                return (
                  <Card key={e.id} padding={16} status={e.lead === 'bo' ? undefined : tone} onClick={() => navigate(`/engagements/${e.id}`)} noChevron>
                    <div className="row-between" style={{ alignItems: 'flex-start' }}>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="hint">{formatDate(e.date, { day: 'numeric', month: 'short', year: 'numeric' })} · {e.type}</div>
                        <div style={{ fontWeight: 600, marginTop: 2 }}>{e.agenda}</div>
                      </div>
                      {e.hasTranscript ? <span className={styles.trChip}><FiFileText size={12} /> Key points</span> : <span className={styles.trChip} style={{ opacity: 0.55 }}>No notes</span>}
                    </div>
                    <div className={styles.attendees}>
                      <div className={styles.avStack}>{e.attendees.map((a) => <Avatar key={a.name} name={a.name} size={28} />)}</div>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }} className="truncate">{lead.name}{e.attendees.length > 1 ? ` +${e.attendees.length - 1}` : ''}</div>
                        <div className="hint clamp2">{e.attendees.map((a) => a.role.split(' –')[0]).join(' · ')}</div>
                      </div>
                      <Badge tone={tone} soft>{e.outcome}</Badge>
                    </div>
                  </Card>
                );
              })}

              {/* ---- The officer's own logged visits ---- */}
              <div className="section-head" style={{ margin: '12px 0 0' }}>
                <h2 className="section-title" style={{ fontSize: 16 }}>Your visits</h2>
                <button className="link" onClick={() => navigate(`/visits/new?dsa=${dsa.id}`)}>Log visit</button>
              </div>
              {meetings.length === 0 && <EmptyState compact emoji="📅" title="No visits logged yet" />}
                {meetings.map((m0) => {
                  const m = { ...m0, recordingId: m0.recordingId ?? recs.find((r) => r.visitId === m0.id)?.id };
                  return (
                  <Card key={m.id} padding={16} status={m.status === 'completed' ? 'success' : m.status === 'missed' ? 'danger' : 'primary'}
                    onClick={m.recordingId ? () => navigate(`/recordings/${m.recordingId}`) : m.status === 'upcoming' ? () => navigate(`/record?dsa=${dsa.id}`) : undefined}
                    noChevron={!m.recordingId}>
                    <div className="row-between">
                      <div>
                        <div style={{ fontWeight: 600 }}>{formatDate(m.date, { day: 'numeric', month: 'short', year: 'numeric' })} · {fmtTime(m.time)}</div>
                        <div className="hint">{m.type}{m.outcome ? ` · ${m.outcome}` : ''}</div>
                        {m.recordingId && <span className="hint row" style={{ gap: 4, color: 'var(--danger)', fontWeight: 600, marginTop: 4 }}><FiMic size={12} /> Transcript &amp; summary</span>}
                        {!m.recordingId && m.status === 'upcoming' && <span className="hint row" style={{ gap: 4, color: 'var(--primary)', fontWeight: 600, marginTop: 4 }}><FiMic size={12} /> Tap to record when it starts</span>}
                      </div>
                      <StatusBadge status={m.status} soft />
                    </div>
                    {m.rating && <div style={{ marginTop: 8 }}><StarRating value={m.rating} size={14} /></div>}
                  </Card>
                  );
                })}
            </div>
          )}

          {tab === 'Notes' && (
            notes.length === 0 && recs.length === 0 ? <EmptyState compact emoji="📝" title="No notes yet" subtitle="Record a meeting or log a visit and the notes will appear here." actionLabel="Record meeting" onAction={() => navigate(`/record?dsa=${dsa.id}`)} /> : (
              <div className="stack">
                {recs.length > 0 && (
                  <>
                    <div className="section-head"><h2 className="section-title" style={{ fontSize: 16 }}>AI meeting summaries</h2></div>
                    {recs.map((r) => <RecordingCard key={r.id} rec={r} dsa={dsa} />)}
                    {notes.length > 0 && <div className="section-head" style={{ marginTop: 8 }}><h2 className="section-title" style={{ fontSize: 16 }}>Visit notes</h2></div>}
                  </>
                )}
                {notes.map((m) => (
                  <Card key={m.id}>
                    <div className={styles.note}>
                      <div className="hint" style={{ marginBottom: 6 }}>{formatDate(m.date, { day: 'numeric', month: 'short', year: 'numeric' })} · {m.type}</div>
                      <p style={{ fontSize: 15, lineHeight: 1.55 }}>{m.notes}</p>
                    </div>
                  </Card>
                ))}
              </div>
            )
          )}
        </motion.div>
      </AnimatePresence>


      <BottomSheet open={qSheet} onClose={() => setQSheet(false)} title={qTopic ? `${TOPICS[qTopic].label} · ${dsa.name.split(' ')[0]}` : `Questions for ${dsa.name.split(' ')[0]}`}>
        <p className="hint" style={{ marginBottom: 12 }}>Built from {dsa.name.split(' ')[0]}'s approval rate, product mix, pending files, visit gap and open commitments. Tap a question to see why it matters.</p>
        {qTopic && <button className="link" style={{ marginBottom: 10, fontSize: 13, fontWeight: 600, color: 'var(--primary)' }} onClick={() => setQTopic(null)}>Show all {questions.length} questions</button>}
        <QuestionList questions={qTopic ? questions.filter((x) => x.topic === qTopic) : questions} />
      </BottomSheet>
    </Page>
  );
}
