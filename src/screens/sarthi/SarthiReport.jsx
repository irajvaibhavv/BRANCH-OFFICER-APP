import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiCopy } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '../../hooks/useToast';
import { formatDate } from '../../utils/formatters';
import { getCase } from '../../services/sarthi/knowledge';
import { identitySummary } from '../../services/sarthi/idChecks';
import { useSarthiReports } from '../../hooks/useSarthiReports';
import styles from './SarthiReport.module.css';

const VERDICT = {
  green: { word: 'Cleared', line: 'Nothing in the interview contradicts the file. Move it forward.' },
  amber: { word: 'Check', line: 'Parts of the story did not settle. Verify the items below before you proceed.' },
  red: { word: 'Verify', line: 'The interview contradicted the file. Visit before this goes further.' },
};

const MARK = { confirmed: 'holds up', contradicted: 'contradicted', unverified: 'unsettled' };
const DEPTH_MARK = { clear: '✓', vague: '~', redFlag: '✕' };

export default function SarthiReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [reports] = useSarthiReports();
  const caseData = getCase(id);
  const r = reports.find((x) => x.caseId === id);

  const blocks = useMemo(() => parseMarkdown(r?.report ?? ''), [r?.report]);
  // Images live outside the report record so their weight can never break its write.
  const photos = useMemo(() => {
    try { return JSON.parse(window.localStorage.getItem(`bo_sarthi_photos_${id}`)) ?? []; } catch { return []; }
  }, [id]);

  if (!r) {
    return (
      <Page mode="slide" className="sarthi">
        <TopBar back title="No report yet" hideBell />
        <EmptyState
          emoji="🗂️"
          title="This file has not been interviewed"
          subtitle="The report is written the moment the interview ends."
          actionLabel="Open the brief"
          onAction={() => navigate(`/sarthi/brief/${id}`)}
        />
      </Page>
    );
  }

  const key = r.recommendation ?? 'amber';
  const verdict = VERDICT[key] ?? VERDICT.amber;
  const counts = r.evidence.reduce((a, e) => ({ ...a, [e.status]: (a[e.status] ?? 0) + 1 }), {});

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(r.report);
      toast('Report copied', 'success');
    } catch {
      toast('This browser would not let me copy it');
    }
  };

  return (
    <Page mode="slide" className={`sarthi ${styles.page}`}>
      <TopBar back title={r.name} subtitle={`Interviewed ${formatDate(r.createdAt)}`} hideBell />

      {/* the one loud moment: the verdict lands like a stamp */}
      <motion.div
        className={`${styles.stamp} ${styles[key]}`}
        initial={{ scale: 1.5, opacity: 0, rotate: -12 }}
        animate={{ scale: 1, opacity: 1, rotate: -3 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.15 }}
      >
        <span className={styles.stampWord}>{verdict.word}</span>
        <span className={styles.stampSub}>Sarthi AI — advisory</span>
      </motion.div>
      <p className={styles.verdictLine}>{verdict.line}</p>

      <div className={styles.tally}>
        {counts.confirmed > 0 && <span className={styles.tallyClear}>{counts.confirmed} held up</span>}
        {counts.contradicted > 0 && <span className={styles.tallyStamp}>{counts.contradicted} contradicted</span>}
        {counts.unverified > 0 && <span className={styles.tallyWatch}>{counts.unverified} unsettled</span>}
        <span className={styles.tallyTurns}>{r.turns} exchanges</span>
      </div>

      {/* the ledger */}
      <h2 className={styles.head}>What they said, against what we hold</h2>
      {r.evidence.length === 0 ? (
        <p className={styles.empty}>No checkable figures came up in this interview.</p>
      ) : (
        <div className={styles.ledger}>
          {r.evidence.map((e) => (
            <article key={e.id} className={`${styles.entry} ${styles[`e_${e.status}`]}`}>
              <div className={styles.entryTop}>
                <h3 className={styles.claimName}>{e.claim}</h3>
                <span className={`${styles.mark} ${styles[`m_${e.status}`]}`}>{MARK[e.status] ?? e.status}</span>
              </div>
              <div className={styles.against}>
                <div>
                  <div className={styles.againstLabel}>said</div>
                  <div className={styles.againstSaid}>{e.declared}</div>
                </div>
                <div>
                  <div className={styles.againstLabel}>held</div>
                  <div className={styles.againstHeld}>{e.verified}</div>
                </div>
              </div>
              {e.verbatim && <p className={styles.quote}>{e.verbatim}</p>}
              <p className={styles.detail}>{e.detail} <span className={styles.src}>({e.source})</span></p>
            </article>
          ))}
        </div>
      )}

      {/* insider questions — does this person actually run the business? */}
      {r.understanding && (
        <>
          <h2 className={styles.head}>How well they know their business</h2>
          <div className={r.understanding.redFlag + r.understanding.vague >= 2 ? styles.idBad : styles.idOk}>
            <p className={styles.idLine}>
              <strong>{r.understanding.clear} of {r.understanding.total}</strong> insider answers clear
              {r.understanding.vague ? ` · ${r.understanding.vague} vague` : ''}
              {r.understanding.redFlag ? ` · ${r.understanding.redFlag} red flag` : ''}
            </p>
            <ul className={styles.depthList}>
              {r.understanding.items.map((i) => (
                <li key={i.key}>
                  <span className={styles[`depth_${i.status}`]}>{DEPTH_MARK[i.status]}</span>
                  <div>
                    <div className={styles.depthQ}>{i.q}</div>
                    <div className={styles.depthA}>"{i.answer}" <span className={styles.src}>(Turn {i.turn})</span></div>
                    {i.followUp && <div className={styles.depthA}>↳ {i.followUp.q} — "{i.followUp.answer}"</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* the trade's arithmetic, computed in code */}
      {r.tradeMath && (
        <>
          <h2 className={styles.head}>Does the hisaab add up</h2>
          <ul className={styles.idChecks}>
            {r.tradeMath.map((m) => (
              <li key={m.check} className={m.pass ? styles.pass : styles.fail}>{m.pass ? '✓' : '✕'} {m.detail}</li>
            ))}
          </ul>
        </>
      )}

      {/* identity — what was checked, and plainly what was not */}
      {r.identity && (
        <>
          <h2 className={styles.head}>Identity</h2>
          <div className={r.identity.ok ? styles.idOk : styles.idBad}>
            <p className={styles.idLine}>{identitySummary(r.identity)}</p>
            <ul className={styles.idChecks}>
              {r.identity.checks.map((c) => (
                <li key={c.label} className={c.pass ? styles.pass : styles.fail}>
                  {c.pass ? '✓' : '✕'} {c.label} — {c.detail}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* photographs the applicant took during the interview */}
      {photos.length > 0 && (
        <>
          <h2 className={styles.head}>What they photographed</h2>
          <div className={styles.shots}>
            {photos.map((p, i) => (
              <figure key={i} className={styles.shot}>
                {p.dataUrl
                  ? <img src={p.dataUrl} alt={`Submitted as ${p.label}`} />
                  : <div className={styles.noShot}>Not sent</div>}
                <figcaption>
                  <span className={styles.shotLabel}>Sent as {p.label}</span>
                  {p.skipped && <span className={styles.shotWarn}>Refused to photograph — worth asking why</span>}
                  {p.provenance?.source === 'live_camera' && <span className={styles.shotOk}>Taken with the live camera during the interview</span>}
                  {p.provenance?.flags?.map((f, j) => <span key={j} className={styles.shotWarn}>{f.detail}</span>)}
                  {p.observation && <span className={styles.shotObs}>{p.observation}</span>}
                  {!p.observation && !p.skipped && <span className={styles.shotWarn}>{p.note ?? 'Not machine-read. Look at it yourself.'}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
          <p className={styles.shotFoot}>
            An image is evidence for you to weigh, not a verdict. Sarthi describes what is visible and nothing more.
          </p>
        </>
      )}

      {/* the written report */}
      <h2 className={styles.head}>The full report</h2>
      <div className={styles.md}>{blocks}</div>

      {/* citation audit */}
      <section className={`${styles.audit} ${r.validation?.isClean ? styles.auditClean : styles.auditFlag}`}>
        <h2 className={styles.auditHead}>Every claim traced to its source</h2>
        {r.validation?.isClean ? (
          <p>
            All {r.validation.checked?.citations ?? 0} citations point at a real turn in the interview
            or a real field in the file. Eligibility came from the calculator, not the model.
          </p>
        ) : (
          <>
            <p>
              {r.validation?.removedCount ? `${r.validation.removedCount} finding(s) removed for citing something that does not exist. ` : ''}
              {r.validation?.issues?.length ?? 0} issue(s) caught before you saw this:
            </p>
            <ul>
              {(r.validation?.issues ?? []).map((i, n) => <li key={n}>{i.detail}</li>)}
            </ul>
          </>
        )}
        <p className={styles.formula}>{r.eligibility.formula}</p>
      </section>

      <div className={styles.actions}>
        <button className={styles.copy} onClick={copy}><FiCopy size={17} /> Copy the report</button>
        <button className={styles.back} onClick={() => navigate('/sarthi')}>Back to the queue</button>
      </div>

      {caseData && (
        <p className={styles.foot}>
          Sarthi advises. The lending decision on {caseData.name} is yours to make and yours to sign.
        </p>
      )}
    </Page>
  );
}

/* ---------------------------------------------------------------- tiny markdown renderer */

const inline = (text, key) => String(text)
  .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  .filter(Boolean)
  .map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <b key={`${key}-${i}`}>{p.slice(2, -2)}</b>;
    if (p.startsWith('*') && p.endsWith('*')) return <i key={`${key}-${i}`}>{p.slice(1, -1)}</i>;
    return <span key={`${key}-${i}`}>{p}</span>;
  });

/** Handles only what Agent 2 is told to emit: headings, tables, bullets, rules, bold/italic. */
function parseMarkdown(md) {
  const lines = md.split('\n');
  const out = [];
  let list = [];
  let table = null;

  const flushList = () => {
    if (list.length) {
      out.push(<ul key={`ul-${out.length}`} className={styles.ul}>{list.map((t, i) => <li key={i}>{inline(t, `li-${out.length}-${i}`)}</li>)}</ul>);
      list = [];
    }
  };
  const flushTable = () => {
    if (table) {
      const [head, ...rows] = table;
      out.push(
        <div key={`tb-${out.length}`} className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{inline(cell, `td-${i}-${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      table = null;
    }
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();

    if (/^\|/.test(line)) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^-{2,}$/.test(c.replace(/:/g, '')))) return; // separator row
      flushList();
      (table ??= []).push(cells);
      return;
    }
    flushTable();

    if (!line.trim()) { flushList(); return; }

    if (/^#{1,6}\s/.test(line)) {
      flushList();
      out.push(<h3 key={`h-${out.length}`} className={styles.mdH}>{line.replace(/^#+\s*/, '')}</h3>);
      return;
    }
    if (/^(-{3,}|_{3,})$/.test(line.trim())) { flushList(); out.push(<hr key={`hr-${out.length}`} className={styles.hr} />); return; }
    if (/^[-*]\s+/.test(line)) { list.push(line.replace(/^[-*]\s+/, '')); return; }

    flushList();
    out.push(<p key={`p-${out.length}`} className={styles.p}>{inline(line, `p-${out.length}`)}</p>);
  });

  flushList();
  flushTable();
  return out;
}
