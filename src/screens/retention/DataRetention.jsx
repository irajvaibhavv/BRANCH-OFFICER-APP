import { FiFileText, FiVideo } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import { Input, PillSelect } from '../../components/ui/Input';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { RETENTION_KEY, RETENTION_DEFAULTS } from '../../services/retention';

const PD_PRESETS = [30, 60, 90, 180];
const VIDEO_PRESETS = [7, 30, 90, 180];
const MAX_DAYS = 3650;

/** /retention — the organisation's policy: how long a PD report stays valid, and how long call video is kept. */
export default function DataRetention() {
  const [policy, setPolicy] = useLocalStorage(RETENTION_KEY, RETENTION_DEFAULTS);
  const p = { ...RETENTION_DEFAULTS, ...policy };
  const set = (k) => (v) => {
    const n = Math.round(Number(v));
    if (n >= 1 && n <= MAX_DAYS) setPolicy({ ...p, [k]: n });
  };

  return (
    <Page mode="slide">
      <TopBar back title="Data retention" subtitle="Set by your organisation" />
      <div className="stack">
        <Card padding={16}>
          <div className="row" style={{ gap: 10, marginBottom: 6 }}><FiFileText size={18} /><h3>PD report validity</h3></div>
          <p className="hint" style={{ marginBottom: 12 }}>
            From the interview date; after it a new PD is needed.
          </p>
          <PillSelect options={PD_PRESETS.map((d) => ({ value: d, label: `${d} days` }))} value={p.pdValidityDays} onChange={set('pdValidityDays')} />
          <Input type="number" min={1} max={MAX_DAYS} suffix="days" label="Or enter days" value={p.pdValidityDays} onChange={(e) => set('pdValidityDays')(e.target.value)} />
        </Card>

        <Card padding={16}>
          <div className="row" style={{ gap: 10, marginBottom: 6 }}><FiVideo size={18} /><h3>Video recording retention</h3></div>
          <p className="hint" style={{ marginBottom: 12 }}>
            From the call; then the video is deleted.
          </p>
          <PillSelect options={VIDEO_PRESETS.map((d) => ({ value: d, label: `${d} days` }))} value={p.videoRetentionDays} onChange={set('videoRetentionDays')} />
          <Input type="number" min={1} max={MAX_DAYS} suffix="days" label="Or enter days" value={p.videoRetentionDays} onChange={(e) => set('videoRetentionDays')(e.target.value)} />
        </Card>

      </div>
    </Page>
  );
}
