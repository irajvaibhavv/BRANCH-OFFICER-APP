import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiCamera, FiCheckCircle } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import { Input, Select } from '../../components/ui/Input';
import { SuccessScreen } from '../../components/ui/SuccessCheck';
import { useAppState } from '../../context/AppStateContext';
import styles from './dsa.module.css';

const STEPS = ['Basic details', 'Location & area', 'Documents', 'Review'];
const AREAS = ['Kothrud', 'Baner', 'Wakad', 'Hadapsar', 'Deccan', 'Camp', 'Pimpri', 'Katraj', 'Hinjewadi', 'Viman Nagar'];

export default function AddDSA() {
  const navigate = useNavigate();
  const { addDsa } = useAppState();
  const fileRef = useRef();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [done, setDone] = useState(null);
  const [f, setF] = useState({ name: '', phone: '', email: '', firm: '', area: '', address: '', pan: '', idProof: null });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (step === 0) {
      if (f.name.trim().length < 3) e.name = 'Enter the DSA’s full name';
      if (!/^[6-9]\d{9}$/.test(f.phone)) e.phone = 'Enter a valid 10-digit number';
      if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email';
      if (!f.firm.trim()) e.firm = 'Firm name is required';
    }
    if (step === 1) {
      if (!f.area) e.area = 'Pick an area';
      if (f.address.trim().length < 6) e.address = 'Add a short address';
    }
    if (step === 2) {
      if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(f.pan.toUpperCase())) e.pan = 'PAN looks like ABCDE1234F';
      if (!f.idProof) e.idProof = 'Upload an ID proof photo';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (!validate()) return; setDir(1); setStep((s) => s + 1); };
  const back = () => { setDir(-1); setStep((s) => s - 1); };
  const submit = () => {
    const rec = addDsa({ name: f.name.trim(), phone: `+91 ${f.phone.slice(0, 5)} ${f.phone.slice(5)}`, email: f.email, firm: f.firm, location: `${f.area}, Pune`, address: f.address, pan: f.pan.toUpperCase(), idProof: f.idProof });
    setDone(rec);
  };

  // Photo saved as base64 so it survives offline (see OfflineContext for production notes)
  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setF((x) => ({ ...x, idProof: r.result }));
    r.readAsDataURL(file);
  };

  if (done) {
    return (
      <SuccessScreen title="DSA added" subtitle={`${done.name} is now in your directory.`}>
        <div className="stack">
          <Button full onClick={() => navigate(`/dsas/${done.id}`, { replace: true })}>View profile</Button>
          <Button full variant="secondary" onClick={() => navigate('/dsas', { replace: true })}>Back to directory</Button>
        </div>
      </SuccessScreen>
    );
  }

  return (
    <Page mode="slide">
      <TopBar back title="Add new DSA" subtitle={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`} hideBell onBack={step > 0 ? back : undefined} />
      <div className={styles.steps}>
        {STEPS.map((_, i) => (
          <div key={i} className={styles.step}>
            <motion.div className={styles.stepFill} initial={false} animate={{ width: i <= step ? '100%' : '0%' }} transition={{ duration: 0.3 }} />
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait" custom={dir}>
        <motion.div key={step} initial={{ x: dir * 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: dir * -40, opacity: 0 }} transition={{ duration: 0.2 }} className="stack" style={{ gap: 20 }}>
          {step === 0 && (
            <>
              <Input label="Full name" placeholder="e.g. Priya Sharma" value={f.name} onChange={set('name')} error={errors.name} autoFocus />
              <Input label="Mobile number" prefix="+91" type="tel" inputMode="numeric" maxLength={10} placeholder="98765 43210" value={f.phone} onChange={(e) => setF((x) => ({ ...x, phone: e.target.value.replace(/\D/g, '') }))} error={errors.phone} />
              <Input label="Email (optional)" type="email" placeholder="name@firm.in" value={f.email} onChange={set('email')} error={errors.email} />
              <Input label="Firm name" placeholder="e.g. Sharma Finserv" value={f.firm} onChange={set('firm')} error={errors.firm} />
            </>
          )}
          {step === 1 && (
            <>
              <Select label="Area" placeholder="Select area" options={AREAS.map((a) => ({ value: a, label: a }))} value={f.area} onChange={set('area')} error={errors.area} />
              <Input label="Office address" textarea placeholder="Shop no., street, landmark" value={f.address} onChange={set('address')} error={errors.address} />
              <Card padding={16} className="grad-sky" noChevron>
                <div className="hint" style={{ color: 'var(--text-2)' }}>📍 Location will be geo-tagged on your first visit to this DSA.</div>
              </Card>
            </>
          )}
          {step === 2 && (
            <>
              <Input label="PAN number" placeholder="ABCDE1234F" value={f.pan} onChange={(e) => setF((x) => ({ ...x, pan: e.target.value.toUpperCase().slice(0, 10) }))} error={errors.pan} style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }} />
              <div>
                <span className="label" style={{ display: 'block', marginBottom: 8 }}>ID proof photo</span>
                <div className={`${styles.upload} ${f.idProof ? styles.uploadDone : ''}`} onClick={() => fileRef.current?.click()}>
                  {f.idProof ? (
                    <>
                      <img src={f.idProof} alt="ID proof" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 10 }} />
                      <span className="row" style={{ color: 'var(--success)', fontWeight: 600, fontSize: 14 }}><FiCheckCircle /> Uploaded · tap to change</span>
                    </>
                  ) : (
                    <>
                      <FiCamera size={32} />
                      <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>Tap to upload</span>
                      <span className="hint">Aadhaar, Voter ID or Driving Licence</span>
                    </>
                  )}
                </div>
                {errors.idProof && <span style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 500, display: 'block', marginTop: 8 }}>{errors.idProof}</span>}
                <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
              </div>
            </>
          )}
          {step === 3 && (
            <Card>
              <div className="row" style={{ gap: 12, marginBottom: 12 }}>
                <Avatar name={f.name} size={52} />
                <div>
                  <h3>{f.name}</h3>
                  <span className="label">{f.firm}</span>
                </div>
              </div>
              <div className={styles.review}>
                {[['Phone', `+91 ${f.phone}`], ['Email', f.email || '—'], ['Area', `${f.area}, Pune`], ['Address', f.address], ['PAN', f.pan], ['ID proof', f.idProof ? 'Uploaded ✓' : '—']].map(([k, v]) => (
                  <div key={k} className={styles.reviewRow}>
                    <span className="label">{k}</span>
                    <span style={{ fontWeight: 500, textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>

      <div className={styles.footer}>
        {step > 0 && <Button variant="secondary" onClick={back} style={{ flex: 1 }}>Back</Button>}
        {step < STEPS.length - 1 ? (
          <Button onClick={next} style={{ flex: 2 }}>Continue</Button>
        ) : (
          <Button onClick={submit} style={{ flex: 2 }}>Add DSA</Button>
        )}
      </div>
    </Page>
  );
}
