import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useSarthiReports } from '../../hooks/useSarthiReports';
import { formatINR, timeAgo } from '../../utils/formatters';
import { CASES, CUSTOM_CASES_KEY, bankIncome } from '../../services/sarthi/knowledge';
import styles from './SarthiHome.module.css';

const RISK_WORD = { high: 'High risk', medium: 'Medium risk', low: 'Low risk' };

export default function SarthiHome() {
  const navigate = useNavigate();
  const [reports] = useSarthiReports();
  const [walkIns] = useLocalStorage(CUSTOM_CASES_KEY, []);
  const files = [...walkIns, ...CASES];
  const flagged = files.filter((c) => c.riskPatternMatch).length;

  return (
    <Page mode="slide" className={`sarthi ${styles.page}`}>
      <TopBar back title="Sarthi AI" subtitle="Personal discussion, run by AI" hideBell />

      <div className={styles.hero}>
        <div className={styles.heroCount}>
          <span className={styles.heroNum}>{files.length}</span>
          <span className={styles.heroLabel}>{files.length === 1 ? 'file' : 'files'} waiting for PD</span>
        </div>
        {flagged > 0 && (
          <span className={styles.heroFlag}>
            {flagged} {flagged === 1 ? 'matches' : 'match'} a past failure pattern
          </span>
        )}
        <p className={styles.intro}>
          Sarthi runs the interview, checks every answer against bureau, bank and area data, and
          hands you a report. You make the call.
        </p>
      </div>

      <p className={styles.sectionLabel}>Queue</p>

      <div className={styles.list}>
        {files.map((c, i) => {
          const declared = c.declaredIncome;
          const verified = bankIncome(c)?.income ?? null;
          const gap = verified ? Math.round(((declared - verified) / verified) * 100) : null;
          const widest = Math.max(declared, verified ?? 0) || 1;
          const report = reports.find((r) => r.caseId === c.id);

          return (
            <motion.div
              key={c.id}
              className={styles.file}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <button className={styles.fileMain} onClick={() => navigate(`/sarthi/brief/${c.id}`)}>
              <span className={styles.fileHead}>
                <span className={styles.name}>{c.name}</span>
                <span className={`${styles.risk} ${styles[c.riskLevel]}`}>{RISK_WORD[c.riskLevel]}</span>
              </span>
              <span className={styles.trade}>{c.business}, {c.area.split(',')[0]}</span>

              {/* the confrontation, stated before anything else */}
              <span className={styles.bars}>
                <span className={styles.barRow}>
                  <span className={styles.barLabel}>says</span>
                  <span className={styles.barTrack}>
                    <span className={`${styles.bar} ${styles.barSaid}`} style={{ width: `${(declared / widest) * 100}%` }} />
                  </span>
                  <span className={styles.barValue}>{formatINR(declared)}</span>
                </span>
                <span className={styles.barRow}>
                  <span className={styles.barLabel}>bank</span>
                  <span className={styles.barTrack}>
                    {verified != null && <span className={`${styles.bar} ${styles.barBank}`} style={{ width: `${(verified / widest) * 100}%` }} />}
                  </span>
                  <span className={styles.barValue}>{verified != null ? formatINR(verified) : '—'}</span>
                </span>
              </span>

              <span className={styles.fileFoot}>
                <span className={gap == null ? styles.gapNone : gap > 40 ? styles.gapBad : gap > 15 ? styles.gapWatch : styles.gapOk}>
                  {gap == null
                    ? 'Nothing on file to compare'
                    : gap > 0 ? `${gap}% above bank` : `${Math.abs(gap)}% below bank`}
                </span>
                <span className={styles.ask}>asks {formatINR(c.loanAmountRequested)}</span>
              </span>

              {c.riskPatternMatch && (
                <span className={styles.pattern}>
                  {c.riskPatternMatch.patternId} — {Math.round(c.riskPatternMatch.failureRate * 100)}% failed
                </span>
              )}

              </button>

              {report && (
                <button className={styles.done} onClick={() => navigate(`/sarthi/report/${c.id}`)}>
                  Report ready {timeAgo(report.createdAt)} →
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      <button className={styles.add} onClick={() => navigate('/sarthi/interview/new')}>
        Interview a new applicant
      </button>
      <p className={styles.addNote}>
        Hand them the phone — Sarthi asks for name, household, work, income, photos of the shop
        and home, then PAN and Aadhaar, and opens the file from their answers.
      </p>
      <button className={styles.addAlt} onClick={() => navigate('/sarthi/new')}>
        Or type the details in yourself
      </button>
    </Page>
  );
}
