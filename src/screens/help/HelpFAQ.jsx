import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FiSearch, FiChevronDown, FiPhone, FiX, FiAlertOctagon } from 'react-icons/fi';
import Page from '../../components/navigation/Page';
import TopBar from '../../components/navigation/TopBar';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import { useToast } from '../../hooks/useToast';
import faq from '../../data/dummyFAQ.json';
import styles from './help.module.css';

export default function HelpFAQ() {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(null);
  const [open, setOpen] = useState(null);

  const results = useMemo(() => {
    if (!q) return null;
    return faq.flatMap((c) => c.items.filter((i) => `${i.q} ${i.a}`.toLowerCase().includes(q.toLowerCase())).map((i) => ({ ...i, cat: c.title })));
  }, [q]);
  const current = faq.find((c) => c.id === cat);

  return (
    <Page mode="slide">
      <TopBar back title={current ? current.title : 'Help & FAQ'} onBack={current ? () => setCat(null) : undefined} />

      {!current && (
        <div className={styles.search}>
          <FiSearch size={20} color="var(--text-3)" />
          <input placeholder="Search for help..." value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button onClick={() => setQ('')}><FiX size={18} /></button>}
        </div>
      )}

      <div style={{ marginTop: 16, paddingBottom: 150 }}>
        {results ? (
          results.length === 0 ? <EmptyState compact emoji="🤔" title="No answers found" subtitle="Try different words, or call support below." /> : <Accordion items={results} open={open} setOpen={setOpen} prefix="search" />
        ) : current ? (
          <Accordion items={current.items} open={open} setOpen={setOpen} prefix={cat} />
        ) : (
          <div className={styles.grid}>
            {faq.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card padding={16} onClick={() => setCat(c.id)} noChevron className={styles.catCard}>
                  <div className={styles.emoji}>{c.emoji}</div>
                  <div style={{ fontWeight: 600 }}>{c.title}</div>
                  <div className="hint">{c.items.length} questions</div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <div className="row" style={{ gap: 10 }}>
          <Button variant="secondary" full size="sm" icon={<FiPhone />} onClick={() => toast('Calling Branch Head — Sunil Patil')}>Branch Head</Button>
          <Button variant="secondary" full size="sm" icon={<FiPhone />} onClick={() => toast('Calling HR helpdesk')}>HR</Button>
        </div>
        <Button variant="danger" full icon={<FiAlertOctagon />} onClick={() => toast('Connecting to emergency support…', 'error', 4000)}>SOS · Emergency support</Button>
        <p className="hint" style={{ textAlign: 'center' }}>In case of emergency, tap SOS to call support immediately</p>
      </div>
    </Page>
  );
}

function Accordion({ items, open, setOpen, prefix }) {
  return (
    <Card padding={0}>
      {items.map((it, i) => {
        const key = `${prefix}-${i}`;
        const on = open === key;
        return (
          <div key={key} style={{ borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <button className={styles.qHead} onClick={() => setOpen(on ? null : key)}>
              <div>
                {it.cat && <div className="hint" style={{ marginBottom: 2 }}>{it.cat}</div>}
                <span style={{ fontWeight: 600, fontSize: 15 }}>{it.q}</span>
              </div>
              <motion.span animate={{ rotate: on ? 180 : 0 }} style={{ color: 'var(--text-3)', flexShrink: 0 }}><FiChevronDown size={20} /></motion.span>
            </button>
            <AnimatePresence>
              {on && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                  <p className={styles.answer}>{it.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </Card>
  );
}
