import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { FiCalendar, FiClock, FiSearch, FiX, FiRefreshCw, FiTrash2 } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import BottomSheet from '../../components/ui/BottomSheet';
import EmptyState from '../../components/ui/EmptyState';
import { Input, PillSelect } from '../../components/ui/Input';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../hooks/useToast';
import { toISODate, formatDate } from '../../utils/formatters';
import { fmtTime } from '../home/Dashboard';
import styles from './scheduler.module.css';

const PRIORITIES = [
  { value: 'Normal', label: 'Normal', tone: 'neutral' },
  { value: 'Important', label: 'Important', tone: 'warning' },
  { value: 'Urgent', label: 'Urgent', tone: 'danger' },
];
const P_TONE = { Normal: 'neutral', Important: 'warning', Urgent: 'danger' };

export default function MeetingScheduler() {
  const [params] = useSearchParams();
  const { dsas, getDsa, meetings, addMeeting, updateMeeting, cancelMeeting } = useAppState();
  const { toast } = useToast();
  const [dsaId, setDsaId] = useState(params.get('dsa') ?? '');
  const [pick, setPick] = useState(false);
  const [q, setQ] = useState('');
  const [date, setDate] = useState(toISODate());
  const [time, setTime] = useState('10:00');
  const [agenda, setAgenda] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [errors, setErrors] = useState({});
  const [resched, setResched] = useState(null);

  const upcoming = useMemo(() => meetings.filter((m) => m.date >= toISODate()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)), [meetings]);
  const filteredDsas = dsas.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()));

  const save = () => {
    const e = {};
    if (!dsaId) e.dsa = 'Choose a DSA';
    if (!date || date < toISODate()) e.date = 'Pick today or a future date';
    if (!agenda.trim()) e.agenda = 'What is this meeting about?';
    setErrors(e);
    if (Object.keys(e).length) return;
    addMeeting({ dsaId, date, time, agenda: agenda.trim(), priority });
    toast('Meeting scheduled. Added to calendar and home.', 'success');
    setAgenda(''); setPriority('Normal'); setDsaId('');
  };

  return (
    <Page mode="slide">
      <TopBar back title="Meetings" subtitle={`${upcoming.length} upcoming`} />

      <Card>
        <h3 style={{ marginBottom: 16 }}>Schedule a meeting</h3>
        <div className="stack" style={{ gap: 16 }}>
          <div>
            <span className="label" style={{ display: 'block', marginBottom: 8 }}>DSA</span>
            <button className={`${styles.picker} ${errors.dsa ? styles.pickerErr : ''}`} onClick={() => setPick(true)}>
              {dsaId ? (
                <span className="row" style={{ gap: 10 }}><Avatar name={getDsa(dsaId)?.name} size={28} /> {getDsa(dsaId)?.name}</span>
              ) : <span style={{ color: 'var(--text-3)' }}>Select DSA</span>}
              <FiSearch size={18} color="var(--text-3)" />
            </button>
            {errors.dsa && <span className={styles.err}>{errors.dsa}</span>}
          </div>
          <div className="row" style={{ gap: 12 }}>
            <Input label="Date" type="date" value={date} min={toISODate()} onChange={(e) => setDate(e.target.value)} error={errors.date} />
            <Input label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <Input label="Agenda" placeholder="e.g. Review pending LAP file" value={agenda} onChange={(e) => setAgenda(e.target.value)} error={errors.agenda} />
          <PillSelect label="Priority" options={PRIORITIES} value={priority} onChange={setPriority} />
          <Button full icon={<FiCalendar />} onClick={save}>Save meeting</Button>
        </div>
      </Card>

      <div className="section-head"><h2 className="section-title">Upcoming</h2><span className="hint">Swipe left to reschedule / cancel</span></div>
      {upcoming.length === 0 ? <EmptyState compact emoji="🗓️" title="Nothing scheduled" subtitle="Your next meetings will show here." /> : (
        <div className="stack">
          <AnimatePresence initial={false}>
            {upcoming.map((m) => (
              <SwipeRow key={m.id} onReschedule={() => setResched(m)} onCancel={() => { cancelMeeting(m.id); toast('Meeting cancelled', 'info'); }}>
                <Card padding={16} noChevron status={P_TONE[m.priority] === 'neutral' ? 'primary' : P_TONE[m.priority]}>
                  <div className="row" style={{ gap: 12 }}>
                    <Avatar name={getDsa(m.dsaId)?.name} size={44} />
                    <div className="grow">
                      <div className="row-between">
                        <span style={{ fontWeight: 600 }} className="truncate">{getDsa(m.dsaId)?.name}</span>
                        <Badge tone={P_TONE[m.priority]} soft>{m.priority}</Badge>
                      </div>
                      <div className="hint row" style={{ gap: 4 }}><FiClock size={12} /> {m.date === toISODate() ? 'Today' : formatDate(m.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {fmtTime(m.time)}</div>
                      <div style={{ fontSize: 14, marginTop: 4 }}>{m.agenda}</div>
                    </div>
                  </div>
                </Card>
              </SwipeRow>
            ))}
          </AnimatePresence>
        </div>
      )}

      <BottomSheet open={pick} onClose={() => setPick(false)} title="Choose DSA">
        <div className={styles.search}><FiSearch size={18} color="var(--text-3)" /><input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />{q && <button onClick={() => setQ('')}><FiX size={16} /></button>}</div>
        <div className="stack" style={{ marginTop: 12 }}>
          {filteredDsas.map((d) => (
            <Card key={d.id} padding={12} noChevron onClick={() => { setDsaId(d.id); setPick(false); setQ(''); }}>
              <div className="row" style={{ gap: 12 }}><Avatar name={d.name} size={36} /><div><div style={{ fontWeight: 600 }}>{d.name}</div><div className="hint">{d.location}</div></div></div>
            </Card>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={!!resched} onClose={() => setResched(null)} title="Reschedule">
        {resched && <RescheduleForm m={resched} onSave={(patch) => { updateMeeting(resched.id, patch); toast('Meeting rescheduled', 'success'); setResched(null); }} />}
      </BottomSheet>
    </Page>
  );
}

function RescheduleForm({ m, onSave }) {
  const [date, setDate] = useState(m.date);
  const [time, setTime] = useState(m.time);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ gap: 12 }}>
        <Input label="New date" type="date" value={date} min={toISODate()} onChange={(e) => setDate(e.target.value)} />
        <Input label="New time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <Button full onClick={() => onSave({ date, time })}>Save</Button>
    </div>
  );
}

/** Swipe left reveals Reschedule + Cancel actions. */
function SwipeRow({ children, onReschedule, onCancel }) {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-140, -40, 0], [1, 0.4, 0]);
  return (
    <motion.div layout exit={{ opacity: 0, height: 0, marginBottom: -12 }} className={styles.swipeWrap}>
      <motion.div className={styles.actions} style={{ opacity }}>
        <button className={styles.act} style={{ background: 'var(--warning)' }} onClick={onReschedule}><FiRefreshCw size={18} /><span>Move</span></button>
        <button className={styles.act} style={{ background: 'var(--danger)' }} onClick={onCancel}><FiTrash2 size={18} /><span>Cancel</span></button>
      </motion.div>
      <motion.div drag="x" dragConstraints={{ left: -140, right: 0 }} dragElastic={0.1} style={{ x }} onDragEnd={(_, i) => { animate(x, i.offset.x < -70 ? -140 : 0, { type: 'spring', stiffness: 400, damping: 30 }); }} className={styles.swipeItem}>
        {children}
      </motion.div>
    </motion.div>
  );
}
