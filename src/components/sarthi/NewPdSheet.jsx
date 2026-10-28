import { useNavigate } from 'react-router-dom';
import BottomSheet from '../ui/BottomSheet';
import { MODES, pdOptions } from '../../services/sarthi/repeatPd';
import styles from './NewPdSheet.module.css';

// "Why another PD?" — opened from the PD history, the Sarthi AI button and a PD's report. `pd` is the PD it follows up.
export default function NewPdSheet({ open, onClose, caseId, pd }) {
  const navigate = useNavigate();
  return (
    <BottomSheet open={open} onClose={onClose} title={pd ? `New PD after PD ${pd.pdNo ?? 1}` : 'New PD'}>
      {pdOptions(pd).map((o) => (
        <button
          key={o.mode}
          className={styles.reason}
          onClick={() => { onClose(); navigate(`/sarthi/interview/${caseId}?mode=${o.mode}&from=${pd.id}`); }}
        >
          <strong>{MODES[o.mode].label}</strong>
          <span>{o.why}</span>
        </button>
      ))}
    </BottomSheet>
  );
}
