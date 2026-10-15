import { useState } from 'react';
import { STAGES, isOpen, nextStage, reachedUpTo, stageColor, stageIndex, stageOf } from '../../utils/fileStages';
import { formatDate } from '../../utils/formatters';
import styles from './FileLifecycle.module.css';

/** Where a loan file stands in the lifecycle. `timeline` is [[date|null, stageId]]; without one, every stage up to `status` counts as done. */
export default function FileLifecycle({ status, timeline, expanded = false }) {
  const [open, setOpen] = useState(expanded);
  if (!status) {
    return (
      <div>
        <div className={styles.now}>Not applied yet</div>
        <div className="hint">The lifecycle starts at {STAGES[0].label}.</div>
        <div className={styles.bar}>{STAGES.map((s) => <span key={s.id} className={styles.seg} />)}</div>
      </div>
    );
  }
  const rejected = status === 'rejected';
  const reached = Object.fromEntries((timeline ?? reachedUpTo(status)).map(([d, s]) => [s, d ?? true]));
  const steps = rejected ? [...STAGES.filter((s) => reached[s.id]), stageOf('rejected')] : STAGES;
  const at = rejected ? steps.length - 1 : stageIndex(status);
  const cur = stageOf(status);
  const next = isOpen(status) && nextStage(status);

  return (
    <div>
      <div className={styles.head}>
        <span className={styles.now} style={{ color: stageColor(status) }}>{cur.label}</span>
        <span className="hint" style={{ flexShrink: 0 }}>{rejected ? 'Closed' : `Stage ${at + 1} of ${STAGES.length}`}</span>
      </div>
      <div className={styles.bar}>
        {steps.map((s, i) => <span key={s.id} className={styles.seg} style={i <= at ? { background: stageColor(i === at ? status : s.id) } : undefined} />)}
      </div>
      <div className="hint">
        {isOpen(status) ? <>Now with <b>{cur.owner}</b>{next && <> · next: {next.label}</>}</> : rejected ? 'File rejected' : 'Loan disbursed'}
      </div>
      {!expanded && <button className={styles.toggle} onClick={() => setOpen((o) => !o)}>{open ? 'Hide stages' : 'See all stages'}</button>}
      {open && (
        <div className={styles.list}>
          {steps.map((s, i) => {
            const d = reached[s.id];
            return (
              <div key={s.id} className={styles.row} style={{ opacity: d ? 1 : 0.45 }}>
                {i < steps.length - 1 && <div className={styles.line} />}
                <div className={styles.dot} style={{ background: d ? stageColor(s.id) : 'var(--border)' }} />
                <div className="grow">
                  <div style={{ fontWeight: s.id === status ? 700 : 600 }}>{s.label}</div>
                  <div className="hint">{typeof d === 'string' ? formatDate(d, { day: 'numeric', month: 'short', year: 'numeric' }) : d ? 'Done' : s.owner}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* The list is long, so it can be closed from its end too. */}
      {open && !expanded && <button className={styles.toggle} onClick={() => setOpen(false)}>Hide stages</button>}
    </div>
  );
}
