import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiPhone, FiChevronRight } from 'react-icons/fi';
import { IoLogoWhatsapp, IoSparkles } from 'react-icons/io5';
import { listContainer, listItem } from '../../components/layout/Page';
import Card from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import Badge, { StatusBadge } from '../../components/ui/Badge';
import { pdCaseStage } from '../../utils/fileStages';
import { customerStage } from '../../utils/channel';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { MiniMetricRow } from '../../components/charts/MiniMetric';
import { useToast } from '../../hooks/useToast';
import { formatINR, timeAgo } from '../../utils/formatters';
import { bankIncome } from '../../services/sarthi/knowledge';
import { pdOutcome } from '../../services/sarthi/repeat';
import { loadFace } from '../../services/sarthi/face';
import styles from './dsa.module.css';

const RISK = { high: ['High risk', 'danger'], medium: ['Medium risk', 'warning'], low: ['Low risk', 'success'] };

/** Sarthi AI's PD queue (seeded files + walk-ins), in the DSA card layout. */
export default function CustomerList({ files, reports, onClear }) {
  const navigate = useNavigate();
  const { toast } = useToast();

  return (
    <>
      {files.length === 0 ? (
        <EmptyState emoji="🔍" title="No customers match" subtitle="Try a different name or clear the filter." actionLabel="Clear filters" onAction={onClear} />
      ) : (
        <motion.div className="stack" variants={listContainer} initial="initial" animate="animate">
          {files.map((c) => {
            const bank = bankIncome(c)?.income ?? null;
            const gap = bank ? Math.round(((c.declaredIncome - bank) / bank) * 100) : null;
            const report = reports.find((r) => r.caseId === c.id);
            const [riskLabel, riskTone] = RISK[c.riskLevel] ?? ['New file', 'neutral'];
            return (
              <motion.div key={c.id} variants={listItem}>
                <Card noChevron padding={16} onClick={() => navigate(`/sarthi/brief/${c.id}`)}>
                  <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                    <Avatar name={c.name} size={48} src={loadFace(c.id)?.dataUrl} />
                    <div className="grow">
                      <div className="row-between">
                        <div className="grow">
                          <div style={{ fontWeight: 600, fontSize: 16 }} className="truncate">{c.name}</div>
                          <div className="hint truncate">{c.business} · {c.area?.split(',')[0]}</div>
                        </div>
                        <div className={styles.quick}>
                          <button onClick={(e) => { e.stopPropagation(); toast(`Calling ${c.name}…`); }} aria-label="Call"><FiPhone size={18} /></button>
                          <button className={styles.wa} onClick={(e) => { e.stopPropagation(); toast(`Opening WhatsApp for ${c.name}`); }} aria-label="WhatsApp"><IoLogoWhatsapp size={20} /></button>
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        {customerStage(c) === 'lead' && <Badge tone="warning" soft>Lead</Badge>}
                        {customerStage(c) === 'existing' && <Badge tone="success" soft>Existing</Badge>}
                        <StatusBadge status={pdCaseStage(c, !!report)} soft />
                        <Badge tone={riskTone}>{riskLabel}</Badge>
                        {report && <Badge tone={pdOutcome(report).badge} soft>{pdOutcome(report).label}</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className={styles.metrics}>
                    <MiniMetricRow items={[
                      { value: formatINR(c.declaredIncome), label: 'says' },
                      { value: bank != null ? formatINR(bank) : '—', label: 'bank', tone: gap > 40 ? 'danger' : undefined },
                      { value: formatINR(c.loanAmountRequested), label: 'asks' },
                    ]} />
                  </div>
                  <div className="row-between" style={{ marginTop: 10 }}>
                    <span className="hint" style={{ color: gap > 40 ? 'var(--danger)' : gap > 15 ? 'var(--warning)' : undefined }}>
                      {gap == null ? 'Nothing on file to compare' : gap > 0 ? `${gap}% above bank` : `${Math.abs(gap)}% below bank`}
                    </span>
                    {report ? (
                      <button className={styles.link} onClick={(e) => { e.stopPropagation(); navigate(`/sarthi/report/${c.id}`); }}>
                        Report {timeAgo(report.createdAt)} <FiChevronRight size={14} />
                      </button>
                    ) : (
                      c.stage === 'disbursed' ? <span className="hint" style={{ color: 'var(--success)', fontWeight: 600 }}>Disbursed · paid</span>
                        : <span className={styles.link}><IoSparkles size={13} /> Start PD</span>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <div className="stack" style={{ marginTop: 16 }}>
        <Button full icon={<IoSparkles size={18} />} onClick={() => navigate('/sarthi/interview/new')}>Interview a new applicant</Button>
        <Button full variant="ghost" onClick={() => navigate('/sarthi/new')}>Or type the details in yourself</Button>
      </div>
    </>
  );
}
