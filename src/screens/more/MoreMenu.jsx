import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiTrendingUp, FiFolder, FiAward, FiCalendar,
  FiBarChart2, FiClock, FiHelpCircle, FiUser, FiCheckSquare, FiMic, FiShield,
} from 'react-icons/fi';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Avatar from '../../components/ui/Avatar';
import Card from '../../components/ui/Card';
import { useAuth } from '../../context/AuthContext';
import news from '../../data/mock/news.json';
import styles from './MoreMenu.module.css';

const ITEMS = [
  { to: '/sarthi', label: 'Sarthi AI', sub: 'AI field underwriter · PD on video', icon: FiShield, tone: '#0ea5a4' },
  { to: '/incentive', label: 'Incentives', sub: 'Slab progress & earnings', icon: FiTrendingUp, tone: '#16a34a' },
  { to: '/files', label: 'Loan Files', sub: 'Track every file status', icon: FiFolder, tone: '#4c1d95' },
  { to: '/documents', label: 'Documents', sub: 'Checklists & reminders', icon: FiCheckSquare, tone: '#7c3aed' },
  { to: '/leaderboard', label: 'Leaderboard', sub: 'See where you rank', icon: FiAward, tone: '#f59e0b' },
  { to: '/calendar', label: 'Calendar', sub: 'Daily targets at a glance', icon: FiCalendar, tone: '#db2777' },
  { to: '/reports', label: 'Reports', sub: 'Daily / weekly summary', icon: FiBarChart2, tone: '#7c3aed' },
  { to: '/scheduler', label: 'Meetings', sub: 'Schedule DSA meetings', icon: FiClock, tone: '#ea580c' },
  { to: '/recordings', label: 'Recordings', sub: 'Transcripts & AI summaries', icon: FiMic, tone: '#dc2626' },
  { to: '/help', label: 'Help & FAQ', sub: 'Answers & support', icon: FiHelpCircle, tone: '#0d9488' },
  { to: '/profile', label: 'Profile & Settings', sub: 'Dark mode, PIN, logout', icon: FiUser, tone: '#6b7280' },
];

export default function MoreMenu() {
  const navigate = useNavigate();
  const { officer } = useAuth();

  return (
    <Page>
      <TopBar title="More" />
      <Card onClick={() => navigate('/profile')} className={styles.profile}>
        <div className="row" style={{ gap: 14 }}>
          <Avatar name={officer.name} size={52} />
          <div className="grow">
            <h3 className="truncate">{officer.name}</h3>
            <span className="label">{officer.designation} · {officer.branch}</span>
          </div>
        </div>
      </Card>

      <div className="hscroll" style={{ marginBottom: 16 }}>
        {news.map((n) => (
          <div key={n.id} className={styles.newsChip}><span>{n.emoji}</span><span>{n.text}</span></div>
        ))}
      </div>

      <motion.div className={styles.grid} variants={listContainer} initial="initial" animate="animate">
        {ITEMS.map((it) => (
          <motion.div key={it.to} variants={listItem}>
            <Card onClick={() => navigate(it.to)} noChevron padding={16} className={styles.item}>
              <div className={`icon-tile ${styles.icon}`} style={{ '--tile': it.tone }}>
                <it.icon size={22} />
              </div>
              <div className={styles.text}>
                <div className={styles.label}>{it.label}</div>
                <div className="hint">{it.sub}</div>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </Page>
  );
}
