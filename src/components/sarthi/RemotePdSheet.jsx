import BottomSheet from '../ui/BottomSheet';
import { PD_TEMPLATES } from '../../utils/pdTemplates';
import styles from './NewPdSheet.module.css';

// Trigger a remote PD: BO picks a template, invite goes to the customer's borrower app.
export default function RemotePdSheet({ open, onClose, customer, onPick }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={customer ? `Surprise PD — ${customer.name.split(' ')[0]}` : 'Surprise PD'}>
      {PD_TEMPLATES.map((t) => (
        <button
          key={t.id}
          className={styles.reason}
          onClick={() => { onClose(); onPick?.(t.id); }}
        >
          <strong>{t.label} · ~{t.minutes} min</strong>
        </button>
      ))}
    </BottomSheet>
  );
}
