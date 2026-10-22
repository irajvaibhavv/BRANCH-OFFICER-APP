import { useState } from 'react';
import { FiCamera, FiCheck } from 'react-icons/fi';
import PhotoCapture from './PhotoCapture';
import { downscale } from '../../services/sarthi/photo';
import styles from './CustomerPhotoField.module.css';

const TIPS = [
  'Customer se poochh lijiye — photo sirf pehchaan ke liye hai',
  'Chehra seedha, kandhe tak, achhi roshni mein',
  'Chashma ya topi ho toh hata lijiye',
];

// The customer's photo, taken by the BO with the live camera after the customer agrees. Sarthi compares it with the
// person on the video call (services/sarthi/face.js). `value` is a data URL; `onChange` gets the new one.
export default function CustomerPhotoField({ value, onChange }) {
  const [consent, setConsent] = useState(!!value);
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.field}>
      <div className={styles.row}>
        <div className={styles.thumb}>{value ? <img src={value} alt="Customer" /> : <FiCamera size={22} />}</div>
        <div className={styles.side}>
          <span className={styles.label}>Customer photo</span>
          <label className={styles.consent}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>Customer agreed to a photo for the identity check on the PD call</span>
          </label>
          <button type="button" className={styles.take} disabled={!consent} onClick={() => setOpen(true)}>
            {value ? <><FiCheck size={14} /> Retake photo</> : <><FiCamera size={14} /> Take photo</>}
          </button>
        </div>
      </div>
      {open && (
        <PhotoCapture
          kind="customer"
          quiet
          title="Customer ki photo"
          hint="Chehra frame ke beech mein"
          tips={TIPS}
          onCapture={({ dataUrl }) => { onChange(dataUrl); setOpen(false); }}
          onUpload={async (file) => { onChange(await downscale(file)); setOpen(false); }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  );
}
