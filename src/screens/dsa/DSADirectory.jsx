import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiSearch, FiPhone, FiPlus, FiCheck, FiX } from 'react-icons/fi';
import { IoLogoWhatsapp } from 'react-icons/io5';
import Page, { listContainer, listItem } from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import Badge, { QualityBadge } from '../../components/ui/Badge';
import StarRating from '../../components/ui/StarRating';
import EmptyState from '../../components/ui/EmptyState';
import Button from '../../components/ui/Button';
import { MiniMetricRow } from '../../components/charts/MiniMetric';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../hooks/useToast';
import { formatINR } from '../../utils/formatters';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useSarthiReports } from '../../hooks/useSarthiReports';
import { CASES, CUSTOM_CASES_KEY } from '../../services/sarthi/knowledge';
import { CHANNELS, channelOf, CLIENT_STAGES, partnerStage, customerStage } from '../../utils/channel';
import CustomerList from './CustomerList';
import styles from './dsa.module.css';

const FILTERS = ['All', 'High Quality', 'Average', 'Low Quality', 'Nearby', 'Recently Visited'];
const CUSTOMER_FILTERS = ['All', 'High Risk', 'Medium Risk', 'Low Risk', 'Report Ready'];

export default function DSADirectory() {
  const navigate = useNavigate();
  const { dsas, rateDsa } = useAppState();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [stage, setStage] = useState('all'); // all | new | existing | lead
  const [params, setParams] = useSearchParams();
  const view = ['customers', 'connectors'].includes(params.get('tab')) ? params.get('tab') : 'dsas';
  const customers = view === 'customers';
  const channel = view === 'connectors' ? 'connector' : 'dsa';
  const ch = CHANNELS[channel];
  const [reports] = useSarthiReports();
  const [walkIns] = useLocalStorage(CUSTOM_CASES_KEY, []);
  const switchTab = (to) => { setParams(to === 'dsas' ? {} : { tab: to }, { replace: true }); setFilter('All'); setStage('all'); setQ(''); exitSelect(); };
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState([]);

  const list = useMemo(() => {
    let l = dsas.filter((d) => channelOf(d) === channel);
    if (stage !== 'all') l = l.filter((d) => partnerStage(d) === stage);
    if (q) l = l.filter((d) => `${d.name} ${d.firm ?? ''} ${d.location} ${d.vendorCode ?? ''}`.toLowerCase().includes(q.toLowerCase()));
    if (filter === 'High Quality') l = l.filter((d) => d.quality === 'high');
    if (filter === 'Average') l = l.filter((d) => d.quality === 'average');
    if (filter === 'Low Quality') l = l.filter((d) => d.quality === 'low');
    if (filter === 'Nearby') l = [...l].filter((d) => d.distanceKm <= 8).sort((a, b) => a.distanceKm - b.distanceKm);
    if (filter === 'Recently Visited') l = [...l].filter((d) => d.lastVisit).sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
    return l;
  }, [dsas, channel, q, filter, stage]);

  const files = useMemo(() => {
    let l = [...walkIns, ...CASES];
    if (stage !== 'all') l = l.filter((c) => customerStage(c) === stage);
    if (q) l = l.filter((c) => `${c.name} ${c.business} ${c.area}`.toLowerCase().includes(q.toLowerCase()));
    if (filter.endsWith('Risk')) l = l.filter((c) => c.riskLevel === filter.split(' ')[0].toLowerCase());
    if (filter === 'Report Ready') l = l.filter((c) => reports.some((r) => r.caseId === c.id));
    return l;
  }, [walkIns, reports, q, filter, stage]);

  const toggleSel = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 3 ? [...s, id] : s));
  const exitSelect = () => { setSelectMode(false); setSelected([]); };

  const pressTimer = useRef();
  const longPressed = useRef(false);
  const onPointerDown = (id) => {
    longPressed.current = false;
    if (customers) return;
    pressTimer.current = setTimeout(() => { longPressed.current = true; setSelectMode(true); toggleSel(id); }, 500);
  };
  const onPointerUp = () => clearTimeout(pressTimer.current);
  const onCardClick = (id) => {
    if (longPressed.current) { longPressed.current = false; return; }
    if (selectMode) toggleSel(id);
    else navigate(`/dsas/${id}`);
  };

  return (
    <Page>
      <TopBar
        title={selectMode ? `${selected.length} selected` : 'Clients'}
        subtitle={selectMode ? 'Pick 2–3 to compare' : customers ? `${walkIns.length + CASES.length} customers waiting for PD` : `${dsas.filter((d) => channelOf(d) === channel).length} ${ch.plural} · ${dsas.filter((d) => channelOf(d) === channel && d.quality === 'high').length} high quality`}
        hideBell={selectMode}
        right={
          selectMode ? (
            <button className={styles.iconBtn} onClick={exitSelect} aria-label="Cancel"><FiX size={22} /></button>
          ) : (
            <button className={styles.iconBtn} onClick={() => navigate(customers ? '/sarthi/interview/new' : `/dsas/new${channel === 'connector' ? '?channel=connector' : ''}`)} aria-label={customers ? 'New applicant' : `Add ${ch.label}`}><FiPlus size={24} /></button>
          )
        }
      />

      <div className={styles.sticky}>
        {!selectMode && (
          <div className={styles.seg}>
            {[['dsas', 'DSA'], ['connectors', 'Connector'], ['customers', 'Customers']].map(([id, label]) => (
              <button key={id} className={view === id ? styles.segOn : ''} onClick={() => switchTab(id)}>{label}</button>
            ))}
          </div>
        )}
        <div className={styles.search}>
          <FiSearch size={20} color="var(--text-3)" />
          <input placeholder={customers ? 'Search customers...' : `Search ${ch.plural} or vendor code...`} value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button onClick={() => setQ('')} aria-label="Clear"><FiX size={18} /></button>}
        </div>
        <div className={styles.stageRow} role="group" aria-label="Stage">
          {[['all', 'All'], ...Object.entries(CLIENT_STAGES)].map(([k, l]) => (
            <button key={k} className={stage === k ? styles.stageOn : ''} onClick={() => setStage(k)}>{l}</button>
          ))}
        </div>
        <div className="hscroll" style={{ paddingTop: 8, paddingBottom: 8 }}>
          {(customers ? CUSTOMER_FILTERS : FILTERS).map((f) => (
            <button key={f} className={`${styles.chip} ${filter === f ? styles.chipOn : ''}`} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
      </div>

      {customers ? (
        <CustomerList files={files} reports={reports} onClear={() => { setQ(''); setFilter('All'); setStage('all'); }} />
      ) : list.length === 0 ? (
        <EmptyState emoji="🔍" title={`No ${ch.plural} match`} subtitle="Try a different name or clear the filter." actionLabel="Clear filters" onAction={() => { setQ(''); setFilter('All'); setStage('all'); }} />
      ) : (
        <motion.div className="stack" variants={listContainer} initial="initial" animate="animate" key={`${channel}-${filter}-${stage}`}>
          {list.map((d) => {
            const isSel = selected.includes(d.id);
            return (
              <motion.div key={d.id} variants={listItem}>
                <Card
                  noChevron
                  padding={16}
                  className={isSel ? styles.selCard : ''}
                  onClick={() => onCardClick(d.id)}
                  onPointerDown={() => onPointerDown(d.id)}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                >
                  <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                    {selectMode ? (
                      <div className={`${styles.check} ${isSel ? styles.checkOn : ''}`}>{isSel && <FiCheck size={16} />}</div>
                    ) : (
                      <Avatar name={d.name} size={48} />
                    )}
                    <div className="grow">
                      <div className="row-between">
                        <div className="grow">
                          <div style={{ fontWeight: 600, fontSize: 16 }} className="truncate">{d.name}</div>
                          <div className="hint truncate">{[d.profession, d.firm, d.location].filter(Boolean).join(' · ')}</div>
                        </div>
                        {!selectMode && (
                          <div className={styles.quick}>
                            <button onClick={(e) => { e.stopPropagation(); toast(`Calling ${d.name}…`); }} aria-label="Call"><FiPhone size={18} /></button>
                            <button className={styles.wa} onClick={(e) => { e.stopPropagation(); toast(`Opening WhatsApp for ${d.name}`); }} aria-label="WhatsApp"><IoLogoWhatsapp size={20} /></button>
                          </div>
                        )}
                      </div>
                      <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        {partnerStage(d) === 'lead' ? <Badge tone="warning" soft>Lead</Badge> : <QualityBadge quality={d.quality} />}
                        {partnerStage(d) === 'new' && <Badge tone="primary" soft>New</Badge>}
                        {d.vendorCode && <span className={styles.code}>{d.vendorCode}</span>}
                      </div>
                    </div>
                  </div>
                  <div className={styles.metrics}>
                    <MiniMetricRow items={[
                      { value: d.filesSubmitted, label: 'files' },
                      { value: `${d.approvalRate}%`, label: 'approved', tone: d.approvalRate >= 65 ? 'success' : d.approvalRate < 45 ? 'danger' : undefined },
                      { value: formatINR(d.disbursed), label: 'disbursed' },
                    ]} />
                  </div>
                  <div className="row-between" style={{ marginTop: 10 }}>
                    <StarRating value={d.rating} onChange={(n) => { rateDsa(d.id, n); toast(`Rated ${d.name.split(' ')[0]} ${n}★`, 'success', 1500); }} size={18} />
                    <span className="hint">{d.distanceKm} km away</span>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {!selectMode && !customers && <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>Long-press a card to compare {ch.plural}</p>}
      {selectMode && <div style={{ height: 88 }} />}

      <AnimatePresence>
        {selectMode && selected.length >= 2 && (
          <motion.div className={styles.compareBar} initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}>
            <Button full onClick={() => navigate(`/dsas/compare?ids=${selected.join(',')}`)}>Compare {selected.length} {ch.plural}</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  );
}
