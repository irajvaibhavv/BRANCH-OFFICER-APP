import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight, FiCheck, FiX } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { buildNewCase, CUSTOM_CASES_KEY, matchPattern } from '../../services/sarthi/knowledge';
import { validateId, PAN_HOLDER } from '../../services/sarthi/idChecks';
import { parseLatLng, NEAR_M } from '../../services/sarthi/geo';
import businessKnowledge from '../../data/sarthi/businessKnowledge.json';
import locationKnowledge from '../../data/sarthi/locationKnowledge.json';
import styles from './SarthiNewCase.module.css';

// Walk-in intake. No financial figure is invented — an empty file stays empty.

const TRADES = Object.entries(businessKnowledge).map(([key, v]) => ({ key, label: v.label }));
const VINTAGES = ['Under 1 year', '1–3 years', '3–5 years', '5+ years'];
const PURPOSES = ['Working capital', 'Expand business', 'Buy equipment', 'Property', 'Personal need'];

export default function SarthiNewCase() {
  const navigate = useNavigate();
  const [cases, setCases] = useLocalStorage(CUSTOM_CASES_KEY, []);
  const [f, setF] = useState({
    name: '', phone: '', age: '', area: '', businessKey: TRADES[0].key,
    businessName: '', businessVintage: VINTAGES[1], loanPurpose: PURPOSES[0],
    loanAmountRequested: '', declaredIncome: '', shopLocation: '', homeLocation: '',
    employment: 'Self-employed', employer: '', designation: '',
  });
  const salaried = f.employment === 'Salaried';
  const [idKind, setIdKind] = useState('pan');
  const [idValue, setIdValue] = useState('');

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  // Checked as they type, so a wrong document is caught before the interview starts.
  const idResult = useMemo(
    () => (idValue.replace(/\s/g, '').length >= (idKind === 'pan' ? 10 : 12) ? validateId(idKind, idValue, f.name) : null),
    [idKind, idValue, f.name],
  );

  const areaHit = useMemo(
    () => Object.keys(locationKnowledge.specific).find((k) => f.area.toLowerCase().includes(k.toLowerCase())) ?? null,
    [f.area],
  );
  const pattern = useMemo(() => (salaried ? null : matchPattern(areaHit, f.businessKey)), [salaried, areaHit, f.businessKey]);

  const badPins = [f.shopLocation, f.homeLocation].some((v) => v.trim() && !parseLatLng(v));
  const ready = !badPins && f.name.trim() && f.area.trim() && (salaried ? f.employer.trim() && f.designation.trim() : f.businessName.trim()) && Number(f.loanAmountRequested) > 0 && idResult?.ok;

  const start = () => {
    const trade = TRADES.find((t) => t.key === f.businessKey);
    const record = buildNewCase({
      ...f,
      // A salaried applicant has no trade: no business data, so no trade questions or hisaab.
      ...(salaried ? { businessKey: '', businessName: f.employer, business: `Salaried — ${f.designation}` } : { business: trade.label }),
      identity: idResult,
    });
    setCases([record, ...cases]);
    navigate(`/sarthi/brief/${record.id}`);
  };

  return (
    <Page mode="slide" className={`sarthi ${styles.page}`}>
      <TopBar back title="New applicant" subtitle="Nothing on file — build it from scratch" hideBell />

      <p className={styles.lead}>
        We hold no bureau record or bank statement for a walk-in. Sarthi will lean on the document
        check, the trade questions and the photographs instead — and the report will say plainly
        which claims nobody could confirm.
      </p>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Who is in front of you</legend>
        <Field label="Full name" value={f.name} onChange={set('name')} placeholder="As written on the document" />
        <div className={styles.pair}>
          <Field label="Phone" value={f.phone} onChange={set('phone')} inputMode="numeric" placeholder="10 digits" />
          <Field label="Age" value={f.age} onChange={set('age')} inputMode="numeric" placeholder="Years" />
        </div>
        <Field label={salaried ? 'Where they live' : 'Where they live and trade'} value={f.area} onChange={set('area')} placeholder="Locality, city" />
        {f.area.trim() && (
          <p className={areaHit ? styles.hintGood : styles.hintFlat}>
            {areaHit
              ? `We hold local rents and landmarks for ${areaHit}, so Sarthi can ask verification questions about the area.`
              : 'No local data for this area, so Sarthi will skip area questions rather than guess at rents or landmarks.'}
          </p>
        )}
        <div className={styles.pair}>
          {!salaried && <Field label="Shop location (optional)" value={f.shopLocation} onChange={set('shopLocation')} placeholder="lat, lng or Maps link" />}
          <Field label="Home location (optional)" value={f.homeLocation} onChange={set('homeLocation')} placeholder="lat, lng or Maps link" />
        </div>
        {(f.shopLocation || f.homeLocation) && (
          <p className={badPins ? styles.hintFlat : styles.hintGood}>
            {badPins
              ? 'Could not read a location — paste it as "28.65, 77.19" or a Google Maps link that shows the coordinates.'
              : `The photos Sarthi asks for will be checked against these pins (within ${NEAR_M} m).`}
          </p>
        )}
        {!f.shopLocation && !f.homeLocation && (
          <p className={styles.hintFlat}>No pins? The report will show where each photo was taken, for you to check.</p>
        )}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>{salaried ? 'The job' : 'The business'}</legend>
        <div className={styles.toggle}>
          {['Self-employed', 'Salaried'].map((e) => (
            <button key={e} className={f.employment === e ? styles.toggleOn : styles.toggleOff} onClick={() => setF((prev) => ({ ...prev, employment: e }))}>{e}</button>
          ))}
        </div>
        {salaried ? (
          <>
            <Field label="Company / employer" value={f.employer} onChange={set('employer')} placeholder="Where they work" />
            <Field label="Designation" value={f.designation} onChange={set('designation')} placeholder="e.g. Software engineer, accountant, driver" />
            <p className={styles.hintFlat}>Sarthi will ask about the job, salary, bonus and increments, and test the role with questions only someone doing that work can answer.</p>
          </>
        ) : (
          <>
            <Field label="Business name" value={f.businessName} onChange={set('businessName')} placeholder="As it appears on the shop" />
            <Select label="Trade" value={f.businessKey} onChange={set('businessKey')} options={TRADES.map((t) => [t.key, t.label])} />
          </>
        )}
        <div className={styles.pair}>
          <Select label={salaried ? 'In this job for' : 'Trading for'} value={f.businessVintage} onChange={set('businessVintage')} options={VINTAGES.map((v) => [v, v])} />
          <Select label="Loan is for" value={f.loanPurpose} onChange={set('loanPurpose')} options={PURPOSES.map((v) => [v, v])} />
        </div>
        <div className={styles.pair}>
          <Field label="Amount asked" value={f.loanAmountRequested} onChange={set('loanAmountRequested')} inputMode="numeric" placeholder="₹" />
          <Field label={salaried ? 'In-hand salary' : 'Income claimed'} value={f.declaredIncome} onChange={set('declaredIncome')} inputMode="numeric" placeholder="₹ per month" />
        </div>
        {pattern && (
          <p className={styles.patternHit}>
            This area and trade match {pattern.patternId}. {Math.round(pattern.failureRate * 100)}% of those files failed —
            Sarthi will press on it during the interview.
          </p>
        )}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Identity document</legend>
        <div className={styles.toggle}>
          <button className={idKind === 'pan' ? styles.toggleOn : styles.toggleOff} onClick={() => { setIdKind('pan'); setIdValue(''); }}>PAN</button>
          <button className={idKind === 'aadhaar' ? styles.toggleOn : styles.toggleOff} onClick={() => { setIdKind('aadhaar'); setIdValue(''); }}>Aadhaar</button>
        </div>
        <Field
          label={idKind === 'pan' ? 'PAN number' : 'Aadhaar number'}
          value={idValue}
          onChange={(e) => setIdValue(idKind === 'pan' ? e.target.value.toUpperCase() : e.target.value)}
          placeholder={idKind === 'pan' ? 'ABCPG1234K' : '1234 5678 9012'}
          inputMode={idKind === 'aadhaar' ? 'numeric' : 'text'}
        />

        {idResult && (
          <div className={idResult.ok ? styles.idOk : styles.idBad}>
            <div className={styles.idHead}>
              {idResult.ok ? 'Document checks out' : 'Document does not check out'}
              <span className={styles.masked}>{idResult.masked}</span>
            </div>
            <ul className={styles.checks}>
              {idResult.checks.map((c) => (
                <li key={c.label} className={c.pass ? styles.pass : styles.fail}>
                  {c.pass ? <FiCheck size={14} /> : <FiX size={14} />}
                  <span><b>{c.label}</b> — {c.detail}</span>
                </li>
              ))}
            </ul>
            <p className={styles.idFoot}>
              {idKind === 'pan'
                ? `Structure and ${PAN_HOLDER.P.toLowerCase()} rules only. Not checked against NSDL records.`
                : 'Checksum only. Not checked against UIDAI records — this is not eKYC.'}
            </p>
          </div>
        )}
      </fieldset>

      <button className={styles.start} disabled={!ready} onClick={start}>
        Open the file <FiArrowRight size={18} />
      </button>
      {!ready && (
        <p className={styles.blocked}>
          Name, area, {salaried ? 'employer and designation' : 'business'}, amount and a document that passes its checks are needed before the interview.
        </p>
      )}
    </Page>
  );
}

function Field({ label, ...rest }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input className={styles.input} {...rest} />
    </label>
  );
}

function Select({ label, options, ...rest }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <select className={styles.input} {...rest}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
