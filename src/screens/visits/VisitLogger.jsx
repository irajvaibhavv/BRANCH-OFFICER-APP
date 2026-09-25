import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { FiMapPin, FiCamera, FiCheckCircle, FiMic, FiSquare, FiPlay, FiPause, FiTrash2, FiCheck, FiChevronRight } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import StarRating from '../../components/ui/StarRating';
import { Input, PillSelect, Select } from '../../components/ui/Input';
import { SuccessScreen } from '../../components/ui/SuccessCheck';
import { useAppState } from '../../context/AppStateContext';
import { useOffline } from '../../context/OfflineContext';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useToast } from '../../hooks/useToast';
import { summaryToText, fmtClock } from '../../services/meeting/transcript';
import styles from './visits.module.css';

const VISIT_TYPES = ['Scheduled Visit', 'Walk-in', 'Follow-up'];
const OUTCOMES = [
  { value: 'positive', label: 'Positive', tone: 'success' },
  { value: 'neutral', label: 'Neutral', tone: 'neutral' },
  { value: 'need follow-up', label: 'Need follow-up', tone: 'warning' },
];

export default function VisitLogger() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { dsas, getDsa, addVisit, getRecording, linkRecordingToVisit } = useAppState();
  const { isOnline } = useOffline();
  const { toast } = useToast();
  const geo = useGeolocation();
  const fileRef = useRef();

  // Arriving from the meeting recorder: pre-fill the notes with the AI summary
  const recording = params.get('rec') ? getRecording(params.get('rec')) : null;
  const [dsaId, setDsaId] = useState(params.get('dsa') ?? recording?.dsaId ?? '');
  const [photo, setPhoto] = useState(null);
  const [type, setType] = useState('Scheduled Visit');
  const [notes, setNotes] = useState(recording ? summaryToText(recording.summary) : '');
  const [rating, setRating] = useState(0);
  const [outcome, setOutcome] = useState('');
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(false);

  // Voice note state
  const [rec, setRec] = useState('idle'); // idle | recording | done
  const [secs, setSecs] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (rec !== 'recording') return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [rec]);
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setPlaying(false), secs * 1000);
    return () => clearTimeout(t);
  }, [playing, secs]);

  const dsa = getDsa(dsaId);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setPhoto(r.result); // base64 → localStorage-friendly
    r.readAsDataURL(file);
  };

  const submit = () => {
    const e = {};
    if (!dsaId) e.dsa = 'Select the DSA you visited';
    if (geo.status !== 'done') e.geo = 'Capture your location first';
    if (!notes.trim() && rec !== 'done') e.notes = 'Add a note or a voice note';
    if (!rating) e.rating = 'Rate the meeting';
    if (!outcome) e.outcome = 'Pick an outcome';
    setErrors(e);
    if (Object.keys(e).length) {
      toast('A few fields need attention', 'warning');
      return;
    }
    const saved = addVisit({
      dsaId, type, notes, rating, outcome, location: dsa?.location,
      time: new Date().toTimeString().slice(0, 5),
      geo: geo.coords, photo, voiceNoteSecs: rec === 'done' ? secs : 0,
      recordingId: recording?.id,
    });
    if (recording) linkRecordingToVisit(recording.id, saved.id);
    setDone(true);
    setTimeout(() => navigate('/', { replace: true }), 2600);
  };

  if (done) {
    return (
      <SuccessScreen title="Visit logged" subtitle={isOnline ? `Saved and synced. ${dsa?.name.split(' ')[0]} visit counts toward today's target.` : 'Saved offline. It will sync when you’re back online.'} />
    );
  }

  return (
    <Page mode="slide">
      <TopBar back title="Log visit" hideBell />

      <div className="stack" style={{ gap: 16 }}>
        {/* DSA */}
        {dsa ? (
          <Card padding={16}>
            <div className="row" style={{ gap: 12 }}>
              <Avatar name={dsa.name} size={48} />
              <div className="grow">
                <div style={{ fontWeight: 600, fontSize: 17 }}>{dsa.name}</div>
                <div className="hint row" style={{ gap: 4 }}><FiMapPin size={12} /> {dsa.location}</div>
              </div>
              <button className="link" style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 14 }} onClick={() => setDsaId('')}>Change</button>
            </div>
          </Card>
        ) : (
          <Select label="Which DSA did you visit?" placeholder="Select DSA" value={dsaId} onChange={(e) => setDsaId(e.target.value)} options={dsas.map((d) => ({ value: d.id, label: `${d.name} · ${d.location}` }))} error={errors.dsa} />
        )}

        {/* Geo-tag */}
        <Card padding={16} status={geo.status === 'done' ? 'success' : errors.geo ? 'danger' : undefined}>
          <div className="row-between">
            <div className="grow">
              <div style={{ fontWeight: 600 }}>Location</div>
              {geo.status === 'done' ? (
                <div className="hint">{geo.coords.address}<br />{geo.coords.lat}, {geo.coords.lng}</div>
              ) : (
                <div className="hint">{errors.geo ?? 'Geo-tag this visit to verify you’re on site'}</div>
              )}
            </div>
            {geo.status === 'done' ? (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}><FiCheckCircle size={28} color="var(--success)" /></motion.div>
            ) : (
              <Button size="sm" variant="ghost" loading={geo.status === 'loading'} icon={<FiMapPin />} onClick={geo.capture}>Capture</Button>
            )}
          </div>
        </Card>

        {/* Photo */}
        <div className={styles.photoBox} onClick={() => fileRef.current?.click()}>
          {photo ? (
            <>
              <img src={photo} alt="Visit" />
              <div className={styles.photoCheck}><FiCheck size={18} /></div>
            </>
          ) : (
            <div className={styles.photoEmpty}>
              <FiCamera size={28} />
              <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>Add a photo</span>
              <span className="hint">Shop front, meeting, or signage</span>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
        </div>

        <PillSelect label="Visit type" options={VISIT_TYPES} value={type} onChange={setType} />

        {/* Attached recording */}
        {recording ? (
          <Card padding={14} status="success" onClick={() => navigate(`/recordings/${recording.id}`)}>
            <div className="row" style={{ gap: 10 }}>
              <FiMic size={18} color="var(--success)" />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>Meeting recording attached · {fmtClock(recording.durationSecs)}</div>
                <div className="hint">Transcript + AI summary · notes pre-filled below</div>
              </div>
            </div>
          </Card>
        ) : dsa && !dsa.isCustomer ? (
          <button className="link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--danger)', fontWeight: 600, fontSize: 14, minHeight: 32 }} onClick={() => navigate(`/record?dsa=${dsa.id}`)}>
            <FiMic size={14} /> In the meeting now? Record it for a transcript &amp; summary <FiChevronRight size={14} />
          </button>
        ) : null}

        {/* MOM */}
        <div>
          <Input label={recording ? 'Meeting notes (from AI summary)' : 'Meeting notes'} textarea placeholder="What did you discuss?" value={notes} onChange={(e) => setNotes(e.target.value)} error={errors.notes} style={recording ? { minHeight: 200 } : undefined} />
          <AnimatePresence mode="wait">
            {rec === 'idle' && (
              <motion.button key="mic" className={styles.micBtn} onClick={() => { setSecs(0); setRec('recording'); }} whileTap={{ scale: 0.95 }} exit={{ opacity: 0 }}>
                <FiMic size={18} /> Record voice note
              </motion.button>
            )}
            {rec === 'recording' && (
              <motion.div key="rec" className={styles.recording} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <span className={styles.redDot} />
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>Recording · {fmt(secs)}</span>
                <div className={styles.wave}>{[...Array(12)].map((_, i) => <motion.span key={i} animate={{ height: [6, 18, 8, 22, 6] }} transition={{ repeat: Infinity, duration: 1, delay: i * 0.07 }} />)}</div>
                <button className={styles.stopBtn} onClick={() => setRec('done')} aria-label="Stop"><FiSquare size={14} /></button>
              </motion.div>
            )}
            {rec === 'done' && (
              <motion.div key="player" className={styles.player} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <button className={styles.playBtn} onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <FiPause /> : <FiPlay />}</button>
                <div className="grow">
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Voice note</div>
                  <div className={styles.track}><motion.div className={styles.trackFill} animate={{ width: playing ? '100%' : '0%' }} transition={{ duration: playing ? secs : 0.2, ease: 'linear' }} /></div>
                </div>
                <span className="hint">{fmt(secs)}</span>
                <button className={styles.delBtn} onClick={() => { setRec('idle'); setSecs(0); }} aria-label="Delete"><FiTrash2 size={16} /></button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Rating */}
        <div>
          <span className="label" style={{ display: 'block', marginBottom: 4 }}>How was the meeting?</span>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <StarRating value={rating} onChange={setRating} size={36} gap={4} />
          </div>
          {errors.rating && <span className={styles.err}>{errors.rating}</span>}
        </div>

        <div>
          <PillSelect label="Outcome" options={OUTCOMES} value={outcome} onChange={setOutcome} />
          {errors.outcome && <span className={styles.err}>{errors.outcome}</span>}
        </div>
      </div>

      <div className={styles.footer}>
        <Button full onClick={submit}>Submit visit</Button>
      </div>
    </Page>
  );
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
