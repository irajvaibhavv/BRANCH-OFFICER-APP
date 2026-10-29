import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiClock, FiRadio, FiChevronRight, FiX } from 'react-icons/fi';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import RemotePdSheet from './RemotePdSheet';
import { templateById } from '../../utils/pdTemplates';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../hooks/useToast';
import { useSarthiReports } from '../../hooks/useSarthiReports';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_COPY = {
  pending: { label: 'Awaiting customer', tone: 'warning' },
  completed: { label: 'Completed on borrower app', tone: 'success' },
  refused: { label: 'Refused by customer', tone: 'danger' },
  missed: { label: 'No response', tone: 'neutral' },
};
const fmtStamp = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

// Preferred-time banner + Trigger PD action + history of every remote invite for this customer.
export default function RemotePdPanel({ customer, style }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { remotePdsFor, triggerRemotePd, cancelRemotePd } = useAppState();
  const [reports] = useSarthiReports();
  const [sheet, setSheet] = useState(false);
  const items = remotePdsFor(customer.id);
  const sorted = [...items].sort((a, b) => (b.triggeredAt ?? '').localeCompare(a.triggeredAt ?? ''));
  const w = customer.pdWindow;
  const dayLabel = w?.days?.length === 7 ? 'Every day' : w?.days?.length ? w.days.map((d) => DAY_LABELS[d % 7]).join(' · ') : null;

  return (
    <Card padding={16} noChevron style={style}>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600 }}>Surprise PD</div>
        {w && <span className="hint" style={{ color: 'var(--text-2)' }}><FiClock size={11} style={{ verticalAlign: '-1px' }} /> {dayLabel} · {w.from}–{w.to}</span>}
      </div>
      {!w && <p className="hint" style={{ marginBottom: 10 }}>Customer has not set a preferred time in the borrower app. An invite can still be sent — they&apos;ll decide when to pick it up.</p>}
      <button
        onClick={() => setSheet(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '11px 12px', borderRadius: 12, background: 'var(--primary-soft)', color: 'var(--primary)', fontWeight: 600, fontSize: 14, border: '1px dashed color-mix(in srgb, var(--primary) 45%, var(--hairline))', textAlign: 'left' }}
      >
        <FiRadio size={15} /> <span className="grow">Trigger a surprise PD on the borrower app</span> <FiChevronRight size={15} />
      </button>

      {sorted.length > 0 && (
        <>
          <div className="label" style={{ margin: '14px 0 6px' }}>History</div>
          <div className="stack" style={{ gap: 8 }}>
            {sorted.map((r) => {
              const t = templateById(r.templateId);
              const s = STATUS_COPY[r.status] ?? STATUS_COPY.pending;
              const report = r.resultReportId ? reports.find((x) => x.id === r.resultReportId) : null;
              const clickable = r.status === 'completed' && report;
              return (
                <div
                  key={r.id}
                  onClick={clickable ? () => navigate(`/sarthi/report/${report.caseId}?pd=${report.id}`) : undefined}
                  style={{ padding: 12, borderRadius: 12, background: 'var(--bg)', cursor: clickable ? 'pointer' : 'default' }}
                >
                  <div className="row-between">
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t?.label ?? r.templateId}</div>
                    <Badge tone={s.tone} soft>{s.label}</Badge>
                  </div>
                  <div className="hint" style={{ marginTop: 4 }}>Triggered {fmtStamp(r.triggeredAt)}</div>
                  {r.refusalReason && <div className="hint" style={{ marginTop: 4, color: 'var(--danger)' }}>Reason: {r.refusalReason}</div>}
                  {r.status === 'pending' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); cancelRemotePd(r.id); }}
                      style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}
                    >
                      <FiX size={12} /> Cancel invite
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <RemotePdSheet
        open={sheet}
        onClose={() => setSheet(false)}
        customer={customer}
        onPick={(templateId) => {
          triggerRemotePd(customer.id, templateId);
          toast('Invite sent to borrower app', 'success');
        }}
      />
    </Card>
  );
}
