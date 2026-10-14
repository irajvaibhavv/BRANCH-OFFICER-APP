import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiLock, FiPlus, FiMapPin, FiClock, FiCheck } from 'react-icons/fi';
import { ACTIVITY_TYPES, typeOf, clock } from '../../components/marketing/activityTypes';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import BottomSheet from '../../components/ui/BottomSheet';
import MonthGrid from '../../components/ui/MonthGrid';
import { Input, Select } from '../../components/ui/Input';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../hooks/useToast';
import { toISODate, formatDate } from '../../utils/formatters';
import { AREAS } from '../../utils/areas';
import styles from './marketing.module.css';

const blank = (date) => ({ type: 'loan_mela', title: '', date, start: '10:00', end: '13:00', area: '', spot: '', assignees: [] });

/** Marketing activity calendar: what is planned, where, and which of the field force is on it. */
export default function MarketingPlan() {
  const navigate = useNavigate();
  const { marketing, saveMarketing, removeMarketing, team } = useAppState();
  const { toast } = useToast();
  const today = toISODate();
  const [params, setParams] = useSearchParams();
  const target = marketing.find((a) => a.id === params.get('open')); // a Branch Head notification deep-links here
  const [sel, setSel] = useState(target?.date ?? today);
  const [form, setForm] = useState(() => (target ? { ...target } : null)); // null = closed; has `id` when editing
  const [errors, setErrors] = useState({});
  const bhOnly = params.get('from') === 'bh'; // "From Branch Head" filter; the notification links here

  const shown = bhOnly ? marketing.filter((a) => a.assignedBy) : marketing;
  const toAccept = marketing.filter((a) => a.assignedBy && !a.accepted && a.date >= today);
  const byDay = useMemo(() => shown.reduce((m, a) => ({ ...m, [a.date]: [...(m[a.date] ?? []), a] }), {}), [shown]);
  const day = [...(byDay[sel] ?? [])].sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = marketing.filter((a) => a.date >= today && a.status !== 'done').length;
  const member = (code) => team.find((t) => t.empCode === code);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const toggleMember = (code) => setForm((f) => ({ ...f, assignees: f.assignees.includes(code) ? f.assignees.filter((x) => x !== code) : [...f.assignees, code] }));
  const save = () => {
    const e = {};
    if (!form.area) e.area = 'Pick the area';
    if (!form.assignees.length) e.assignees = 'Assign at least one person';
    // Saving a Branch Head activity is accepting it — the BO has now staffed it.
    if (form.end <= form.start) e.end = 'Ends before it starts';
    setErrors(e);
    if (Object.keys(e).length) return;
    const rec = saveMarketing({ ...form, ...(form.assignedBy && { accepted: true }), title: form.title.trim() || `${typeOf(form.type).label} – ${form.area}` });
    toast(form.id ? 'Activity updated' : `Planned for ${formatDate(rec.date)}`, 'success');
    setSel(rec.date);
    setForm(null);
  };

  return (
    <Page mode="slide" style={{ paddingBottom: 'calc(var(--tabbar-safe) + 24px)' }}>
      <TopBar back title="Marketing activities" subtitle={toAccept.length ? `${toAccept.length} from Branch Head to accept` : `${upcoming} planned ahead`} hideBell
        right={<button onClick={() => { setErrors({}); setForm(blank(sel < today ? today : sel)); }} aria-label="Plan activity" style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}><FiPlus size={24} /></button>} />

      <div className="hscroll" style={{ paddingBottom: 12 }}>
        {[[false, 'All activities'], [true, `From Branch Head${toAccept.length ? ` · ${toAccept.length} new` : ''}`]].map(([v, label]) => (
          <button key={label} className={`${styles.chip} ${bhOnly === v ? styles.chipOn : ''}`} onClick={() => setParams(v ? { from: 'bh' } : {}, { replace: true })}>{label}</button>
        ))}
      </div>

      <Card padding={16} noChevron>
        <MonthGrid key={sel.slice(0, 7)} selected={sel} onSelect={setSel} dots={(iso) => (byDay[iso] ?? []).map((a) => typeOf(a.type).tone)} />
        <div className={styles.legend}>
          {ACTIVITY_TYPES.map((t) => <span key={t.id}><i style={{ background: t.tone }} />{t.label}</span>)}
        </div>
      </Card>

      <AnimatePresence mode="wait">
        <motion.div key={sel} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <div className="section-head">
            <h2 className="section-title">{sel === today ? 'Today' : formatDate(sel, { weekday: 'long', day: 'numeric', month: 'short' })}</h2>
          </div>
          {day.length === 0 ? (
            <Card padding={20} noChevron style={{ textAlign: 'center' }}>
              <div className="hint" style={{ marginBottom: 12 }}>No activity planned for this day</div>
              {sel >= today && <Button variant="secondary" icon={<FiPlus size={16} />} onClick={() => { setErrors({}); setForm(blank(sel)); }}>Plan an activity</Button>}
            </Card>
          ) : (
            <motion.div className="stack" variants={listContainer} initial="initial" animate="animate">
              {day.map((a) => {
                const t = typeOf(a.type);
                const done = a.status === 'done' || a.date < today;
                return (
                  <motion.div key={a.id} variants={listItem}>
                    {/* Tap opens the activity (start, photos, leads); a Branch Head one not yet accepted opens the accept sheet */}
                    <Card padding={16} onClick={() => (a.assignedBy && !a.accepted ? (setErrors({}), setForm({ ...a })) : navigate(`/marketing/${a.id}`))}>
                      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                        <span className={styles.typeIcon} style={{ '--tile': t.tone }}><t.icon size={20} /></span>
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="row-between" style={{ gap: 8 }}>
                            <div style={{ fontWeight: 600 }} className="truncate">{a.title}</div>
                            <Badge tone={done ? 'success' : a.assignedBy && !a.accepted ? 'warning' : 'primary'} soft>{a.startedAt && !a.endedAt ? 'Live' : done ? 'Completed' : a.assignedBy && !a.accepted ? 'To accept' : 'Planned'}</Badge>
                          </div>
                          <div className="hint"><FiClock size={11} style={{ verticalAlign: '-1px' }} /> {clock(a.start)} – {clock(a.end)} · {t.label}</div>
                          <div className="hint truncate"><FiMapPin size={11} style={{ verticalAlign: '-1px' }} /> {[a.spot, a.area].filter(Boolean).join(', ')}</div>
                        </div>
                      </div>
                      {a.assignedBy && <div className={styles.from}>From {a.assignedBy.role} · {a.assignedBy.name} ({a.assignedBy.empCode})</div>}
                      <div className={styles.people}>
                        {!a.assignees.length && <span className="hint">No field force yet</span>}
                        {a.assignees.map((code) => (
                          <span key={code} className={styles.person}><Avatar name={member(code)?.name ?? code} size={20} />{member(code)?.name.split(' ')[0] ?? code} · {code}</span>
                        ))}
                      </div>
                      {a.assignedBy && !a.accepted && !done && (
                        <Button size="sm" full style={{ marginTop: 12 }} icon={<FiCheck size={16} />}
                          onClick={(e) => { e.stopPropagation(); setErrors({}); setForm({ ...a }); }}>Review &amp; accept</Button>
                      )}
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      <BottomSheet open={!!form} onClose={() => setForm(null)} title={form?.assignedBy && !form.accepted ? 'Accept activity' : form?.id ? 'Edit activity' : 'Plan marketing activity'}>
        {form && (
          <div className="stack" style={{ gap: 16 }}>
            {form.assignedBy && (
              <div className={styles.from} style={{ marginTop: 0 }}>
                <FiLock size={12} style={{ verticalAlign: '-1px' }} /> Scheduled by {form.assignedBy.name} ({form.assignedBy.role}, {form.assignedBy.empCode}). You can staff it; what, when and where are set by them.
              </div>
            )}
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Activity</div>
              <div className={styles.types}>
                {ACTIVITY_TYPES.map((t) => (
                  <button key={t.id} type="button" disabled={!!form.assignedBy} className={`${styles.type} ${form.type === t.id ? styles.typeOn : ''}`} style={{ '--tile': t.tone }} onClick={() => set('type')(t.id)}>
                    <t.icon size={18} />{t.label}
                  </button>
                ))}
              </div>
            </div>
            <Input label="Title (optional)" disabled={!!form.assignedBy} placeholder={`${typeOf(form.type).label} – ${form.area || 'area'}`} value={form.title} onChange={set('title')} />
            <Input label="Date" type="date" disabled={!!form.assignedBy} min={form.id ? undefined : today} value={form.date} onChange={set('date')} />
            <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
              <Input label="Starts" type="time" disabled={!!form.assignedBy} value={form.start} onChange={set('start')} />
              <Input label="Ends" type="time" disabled={!!form.assignedBy} value={form.end} onChange={set('end')} error={errors.end} />
            </div>
            <Select label="Area" disabled={!!form.assignedBy} placeholder="Where to run it" value={form.area} onChange={set('area')} error={errors.area} options={AREAS.map((a) => ({ value: a, label: a }))} />
            <Input label="Exact spot (optional)" disabled={!!form.assignedBy} placeholder="e.g. Karve Road, near the depot" value={form.spot} onChange={set('spot')} />
            <div>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <span className="label">Field force</span>
                <span className="hint" style={{ color: errors.assignees ? 'var(--danger)' : undefined }}>{errors.assignees ?? `${form.assignees.length} assigned`}</span>
              </div>
              <Card padding={0} noChevron>
                {team.map((m) => {
                  const on = form.assignees.includes(m.empCode);
                  return (
                    <button key={m.empCode} type="button" className={styles.pick} onClick={() => toggleMember(m.empCode)}>
                      <span className={`${styles.check} ${on ? styles.checkOn : ''}`}>{on && <FiCheck size={14} />}</span>
                      <Avatar name={m.name} size={32} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}{m.empCode === team[0].empCode ? ' (you)' : ''}</div>
                        <div className="hint">{m.role} · {m.empCode}</div>
                      </div>
                    </button>
                  );
                })}
              </Card>
            </div>
            <div className="row" style={{ gap: 12 }}>
              {form.id && !form.assignedBy && <Button variant="secondary" style={{ flex: 1 }} onClick={() => { removeMarketing(form.id); setForm(null); toast('Activity removed'); }}>Delete</Button>}
              <Button style={{ flex: 2 }} onClick={save}>{form.assignedBy && !form.accepted ? 'Accept & assign' : form.id ? 'Save changes' : 'Plan activity'}</Button>
            </div>
          </div>
        )}
      </BottomSheet>
    </Page>
  );
}
