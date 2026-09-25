import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiCheck, FiPhone, FiFileText, FiCalendar, FiUsers, FiChevronRight, FiHome } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../hooks/useToast';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { toISODate } from '../../utils/formatters';
import styles from './plan.module.css';

// No-travel day: tasks built from live data. Ticks persist for the day.
const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : 999);

export default function BranchPlan() {
  const navigate = useNavigate();
  const { loanFiles, dsas, meetings, getDsa, planDay, dayPlan } = useAppState();
  const { toast } = useToast();
  const today = toISODate();
  const [doneMap, setDoneMap] = useLocalStorage('bo_branch_done', {});
  const done = doneMap[today] ?? [];
  const toggle = (id) => setDoneMap((m) => ({ ...m, [today]: done.includes(id) ? done.filter((x) => x !== id) : [...done, id] }));

  const tasks = useMemo(() => {
    const t = [];
    loanFiles.filter((f) => f.docs.some(([, s]) => s !== 'done')).forEach((f) => {
      const missing = f.docs.filter(([, s]) => s !== 'done').map(([d]) => d);
      t.push({ id: `docs-${f.id}`, group: 'Chase documents', icon: FiFileText, tone: '#dc2626', title: `${f.borrower} — ${missing.slice(0, 2).join(', ')}${missing.length > 2 ? ` +${missing.length - 2}` : ''}`, sub: `Call ${getDsa(f.dsaId)?.name.split(' ')[0] ?? 'DSA'} · ${f.id}`, to: `/files/${f.id}` });
    });
    loanFiles.filter((f) => f.status === 'under review' || f.status === 'submitted').forEach((f) => {
      t.push({ id: `rev-${f.id}`, group: 'Follow up with credit', icon: FiFileText, tone: '#4c1d95', title: `${f.borrower} · ${f.status}`, sub: `Check status with credit team · ${f.id}`, to: `/files/${f.id}` });
    });
    dsas.filter((d) => daysSince(d.lastVisit) > 14).forEach((d) => {
      t.push({ id: `call-${d.id}`, group: 'Calls to make', icon: FiPhone, tone: '#0f766e', title: `Call ${d.name}`, sub: `${daysSince(d.lastVisit)} days since last visit · ${d.firm}`, to: `/dsas/${d.id}` });
    });
    meetings.filter((m) => m.date > today).slice(0, 3).forEach((m) => {
      t.push({ id: `mtg-${m.id}`, group: 'Confirm meetings', icon: FiCalendar, tone: '#d97706', title: `Confirm ${getDsa(m.dsaId)?.name ?? 'meeting'} · ${m.date.slice(5).replace('-', '/')}`, sub: `${m.time} · ${m.agenda ?? 'Scheduled'}`, to: '/calendar' });
    });
    t.push({ id: 'report', group: 'Admin', icon: FiUsers, tone: '#2563eb', title: 'Send weekly DSA report to Branch Head', sub: 'Generate from Reports', to: '/reports' });
    return t;
  }, [loanFiles, dsas, meetings, getDsa, today]);

  const groups = [...new Set(tasks.map((t) => t.group))];
  const started = dayPlan?.date === today && dayPlan.mode === 'branch';
  const start = () => {
    planDay([], [], 'branch');
    toast(`Branch day · ${tasks.length} tasks`, 'success');
    navigate('/', { replace: true });
  };

  return (
    <Page mode="slide" style={{ paddingBottom: 'calc(var(--tabbar-safe) + 104px)' }}>
      <TopBar back title="Work from branch" subtitle={`${done.length}/${tasks.length} done · built from your files & DSAs`} hideBell />

      <Card padding={14} noChevron className="tint-primary" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          <span className="icon-tile" style={{ '--tile': '#d97706', width: 40, height: 40, borderRadius: 12 }}><FiHome size={18} /></span>
          <div className="grow"><div style={{ fontWeight: 600 }}>No field visits today</div><div className="hint">These are the things that move files forward from your desk.</div></div>
        </div>
      </Card>

      {groups.map((g) => (
        <div key={g} style={{ marginBottom: 14 }}>
          <div className={styles.secHead}><div className={styles.secTitle}>{g}</div><Badge tone="neutral" soft>{tasks.filter((t) => t.group === g && done.includes(t.id)).length}/{tasks.filter((t) => t.group === g).length}</Badge></div>
          <Card padding={14} noChevron>
            {tasks.filter((t) => t.group === g).map((t) => {
              const on = done.includes(t.id);
              return (
                <div key={t.id} className={styles.task}>
                  <button className={`${styles.taskTick} ${on ? styles.taskOn : ''}`} onClick={() => toggle(t.id)} aria-label={on ? 'Mark not done' : 'Mark done'}>{on && <FiCheck size={14} />}</button>
                  <button className="grow" style={{ minWidth: 0, textAlign: 'left' }} onClick={() => navigate(t.to)}>
                    <div className={`${on ? styles.taskDone : ''}`} style={{ fontWeight: 600, fontSize: 14 }}>{t.title}</div>
                    <div className="hint clamp2">{t.sub}</div>
                  </button>
                  <FiChevronRight size={16} color="var(--text-3)" style={{ marginTop: 4 }} />
                </div>
              );
            })}
          </Card>
        </div>
      ))}

      <div className={styles.planBar}>
        <Button full icon={<FiCheck size={18} />} onClick={start}>{started ? 'Back to home' : `Start branch day · ${tasks.length} tasks`}</Button>
      </div>
    </Page>
  );
}
