import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiCamera, FiClock, FiMapPin, FiPlay, FiSquare, FiUserPlus, FiCheckCircle, FiAlertTriangle, FiPhone, FiShield, FiSend, FiRotateCcw } from 'react-icons/fi';
import Page from '../../components/layout/Page';
import TopBar from '../../components/layout/TopBar';
import Card from '../../components/ui/Card';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import BottomSheet from '../../components/ui/BottomSheet';
import EmptyState from '../../components/ui/EmptyState';
import { Input, Select } from '../../components/ui/Input';
import CoworkerTags from '../../components/team/CoworkerTags';
import { useAppState } from '../../context/AppStateContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/useToast';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { currentPosition } from '../../hooks/useGeolocation';
import { downscale } from '../../services/sarthi/photo';
import { typeOf, clock } from '../../components/marketing/activityTypes';
import { AREA_COORDS } from '../../utils/areas';
import { START, km } from '../../utils/route';
import { buildNewCase, CUSTOM_CASES_KEY } from '../../services/sarthi/knowledge';
import { PRODUCTS } from '../../utils/loanCalc';
import { formatINR, toISODate } from '../../utils/formatters';
import styles from './marketing.module.css';

const FAR_KM = 3; // a check-in further than this from the planned area is flagged
const hhmm = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const dur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
// Lead verification: one-tap link by SMS. The message is the officer's to edit; {placeholders} are filled per lead.
const DEFAULT_TEMPLATE = 'Hi {name}, this is {officer} from SMFG, {branch}. Thank you for your interest in a {product}. Tap to confirm your details: {link}';
const fill = (tpl, l, officer) => tpl.replace(/\{(\w+)\}/g, (m, k) => ({
  name: l.name.split(' ')[0], officer: officer.name, branch: officer.branch, product: l.product, link: `https://smfg.example/v/${l.id}`,
})[k] ?? m);
const templateOf = (text, l) => {
  const link = `https://smfg.example/v/${l.id}`;
  return text.split(link).join('{link}').split(l.name.split(' ')[0]).join('{name}').split(l.product).join('{product}');
};
const blankLead = (area) => ({ kind: 'customer', name: '', phone: '', business: '', product: PRODUCTS[0], amount: '', area, note: '', tagged: [] });
// A lead met at an activity is also a client, saved as a Lead in Clients: a customer (walk-in case, ready for a PD) or a DSA / connector.
const LEAD_KINDS = [['customer', 'Customer'], ['dsa', 'DSA'], ['connector', 'Connector']];
const KIND_LABEL = { customer: 'Customer lead', dsa: 'DSA lead', connector: 'Connector lead' };

/** Running a marketing activity: start/end with a geo check-in, timestamped photos, and leads captured on the spot. */
export default function ActivityRun() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { marketing, saveMarketing, team, addDsa } = useAppState();
  const [, setCases] = useLocalStorage(CUSTOM_CASES_KEY, []);
  const { officer } = useAuth();
  const { toast } = useToast();
  // Photos live apart from the activity record so their weight cannot break its write.
  const [photos, setPhotos] = useLocalStorage(`bo_mk_photos_${id}`, []);
  const [busy, setBusy] = useState(null); // 'start' | 'end' | 'photo'
  const [lead, setLead] = useState(null);
  const [verify, setVerify] = useState(null); // { lead, text } while the verification sheet is open
  const [template, setTemplate] = useLocalStorage('bo_otp_template', DEFAULT_TEMPLATE);
  const [errors, setErrors] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const fileRef = useRef();
  const a = marketing.find((x) => x.id === id);
  const running = !!a?.startedAt && !a?.endedAt;

  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  if (!a) return <Page mode="slide"><TopBar back title="Activity" /><EmptyState emoji="🔍" title="Activity not found" /></Page>;

  const t = typeOf(a.type);
  const centre = AREA_COORDS[a.area] && { lat: AREA_COORDS[a.area][0], lng: AREA_COORDS[a.area][1] };
  const away = (g) => (g && centre ? +km(centre, g).toFixed(1) : null);
  const leads = a.leads ?? [];
  const isToday = a.date === toISODate();
  const untracked = a.date < toISODate() && !a.startedAt; // ran before in-app tracking

  const checkIn = async (kind) => {
    setBusy(kind);
    const g = await currentPosition();
    const at = new Date().toISOString();
    saveMarketing(kind === 'start' ? { id: a.id, startedAt: at, startGeo: g } : { id: a.id, endedAt: at, endGeo: g, status: 'done' });
    setBusy(null);
    const d = away(g);
    toast(kind === 'start' ? `Started · ${d != null ? `${d} km from ${a.area}` : 'location saved'}` : 'Activity ended', d > FAR_KM ? 'warning' : 'success');
    if (kind === 'start') setNow(new Date(at).getTime());
  };

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('photo');
    try {
      const [src, g] = await Promise.all([downscale(file), currentPosition()]);
      setPhotos((p) => [...p, { id: `ph${crypto.randomUUID().slice(0, 8)}`, src, at: new Date().toISOString(), lat: g.lat, lng: g.lng, mock: g.mock }]);
      toast('Photo added · time & location stamped', 'success', 1500);
    } catch {
      toast('Could not read that photo', 'error');
    }
    setBusy(null);
  };

  const setL = (k) => (e) => setLead((l) => ({ ...l, [k]: e.target.value }));
  const patchLead = (id, patch) => saveMarketing({ id: a.id, leads: leads.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const sendLink = () => {
    const { lead: l, text, keep } = verify;
    if (keep) setTemplate(templateOf(text, l));
    patchLead(l.id, { verify: 'sent', sentAt: new Date().toISOString() });
    window.open(`sms:+91${l.phone}?&body=${encodeURIComponent(text)}`, '_self');
    toast(`Link sent to +91 ${l.phone}`, 'success');
    setVerify(null);
  };
  const saveLead = () => {
    const e = {};
    if (lead.name.trim().length < 3) e.name = 'Enter the name';
    if (!/^[6-9]\d{9}$/.test(lead.phone)) e.phone = 'Enter a 10-digit mobile number';
    setErrors(e);
    if (Object.keys(e).length) return;
    const name = lead.name.trim();
    let clientId;
    if (lead.kind === 'customer') {
      const c = buildNewCase({
        name, phone: lead.phone, age: '', area: lead.area, business: lead.business.trim() || 'Business not yet known', businessKey: '', // trade asked on the PD; '' not null — matchPattern lowercases it
        businessName: lead.business.trim(), businessVintage: '', loanPurpose: lead.product, loanAmountRequested: lead.amount, declaredIncome: 0,
      });
      setCases((prev) => [{ ...c, fromActivity: a.id }, ...prev]);
      clientId = c.id;
    } else {
      const [lat, lng] = AREA_COORDS[lead.area] ?? [START.lat, START.lng];
      clientId = addDsa({
        name, phone: `+91 ${lead.phone.slice(0, 5)} ${lead.phone.slice(5)}`, firm: lead.business.trim() || null, location: `${lead.area}, Pune`,
        lat, lng, distanceKm: +km(START, { lat, lng }).toFixed(1), ...(lead.kind === 'connector' && { channel: 'connector' }), fromActivity: a.id,
      }).id;
    }
    const rec = { ...lead, id: `ld${crypto.randomUUID().slice(0, 8)}`, name, amount: Number(lead.amount) || null, at: new Date().toISOString(), by: officer.id, activityId: a.id, clientId };
    saveMarketing({ id: a.id, leads: [...leads, rec] });
    const names = rec.tagged.map((c) => team.find((m) => m.empCode === c)?.name.split(' ')[0]).filter(Boolean);
    toast(`${rec.name} saved as a ${KIND_LABEL[rec.kind].toLowerCase()} in Clients${names.length ? ` · ${names.join(', ')} tagged` : ''}`, 'success', 2600);
    setLead(null);
  };

  const checks = [
    a.startGeo && { label: `Started ${hhmm(a.startedAt)}`, d: away(a.startGeo), mock: a.startGeo.mock },
    ...photos.map((p, i) => ({ label: `Photo ${i + 1} · ${hhmm(p.at)}`, d: away(p), mock: p.mock })),
    a.endGeo && { label: `Ended ${hhmm(a.endedAt)}`, d: away(a.endGeo), mock: a.endGeo.mock },
  ].filter(Boolean);
  const farCount = checks.filter((c) => c.d > FAR_KM).length;

  return (
    <Page mode="slide" style={{ paddingBottom: 'calc(var(--tabbar-safe) + 24px)' }}>
      <TopBar back title={a.title} subtitle={`${t.label} · ${a.area}`} hideBell />

      {/* Status: planned → running (live timer) → ended (actual times) */}
      <Card padding={16} noChevron status={running ? 'primary' : a.endedAt ? 'success' : undefined}>
        <div className="row" style={{ gap: 12 }}>
          <span className={styles.typeIcon} style={{ '--tile': t.tone }}><t.icon size={20} /></span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="hint"><FiClock size={11} style={{ verticalAlign: '-1px' }} /> Planned {clock(a.start)} – {clock(a.end)}</div>
            <div className="hint truncate"><FiMapPin size={11} style={{ verticalAlign: '-1px' }} /> {[a.spot, a.area].filter(Boolean).join(', ')}</div>
          </div>
          <Badge tone={running ? 'primary' : a.endedAt ? 'success' : 'neutral'} soft>{running ? 'Live' : a.endedAt ? 'Completed' : untracked ? 'Not tracked' : 'Not started'}</Badge>
        </div>
        {running && (
          <div style={{ marginTop: 14 }}>
            <div className="big-number" style={{ fontVariantNumeric: 'tabular-nums' }}>{new Date(now - new Date(a.startedAt)).toISOString().slice(11, 19)}</div>
            <div className="hint">running since {hhmm(a.startedAt)}</div>
          </div>
        )}
        {a.endedAt && (
          <div className="row" style={{ gap: 20, marginTop: 14 }}>
            <div><div className="big-number">{hhmm(a.startedAt)}</div><div className="hint">started</div></div>
            <div><div className="big-number">{hhmm(a.endedAt)}</div><div className="hint">ended</div></div>
            <div><div className="big-number">{dur(new Date(a.endedAt) - new Date(a.startedAt))}</div><div className="hint">on site</div></div>
          </div>
        )}
        {!a.startedAt && !untracked && (
          <Button full style={{ marginTop: 14 }} icon={<FiPlay size={16} />} loading={busy === 'start'} disabled={!isToday} onClick={() => checkIn('start')}>
            {isToday ? 'Start activity' : `Can start on ${a.date.slice(8)}/${a.date.slice(5, 7)}`}
          </Button>
        )}
        {!a.startedAt && !untracked && <div className="hint" style={{ marginTop: 8, textAlign: 'center' }}>Start it on site — that unlocks photos and leads, with time and location stamped.</div>}
        {untracked && <div className="hint" style={{ marginTop: 10 }}>This ran before it was tracked in the app — no check-ins, photos or leads.</div>}
        {running && <Button full variant="secondary" style={{ marginTop: 14 }} icon={<FiSquare size={16} />} loading={busy === 'end'} onClick={() => checkIn('end')}>End activity</Button>}
      </Card>

      {/* Geo-tag monitoring: every check-in measured against the planned area */}
      {checks.length > 0 && (
        <Card padding={16} noChevron style={{ marginTop: 12 }} status={farCount ? 'danger' : undefined}>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <h3>Location checks</h3>
            <Badge tone={farCount ? 'danger' : 'success'} soft>{farCount ? `${farCount} away from ${a.area}` : `All in ${a.area}`}</Badge>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {checks.map((c) => (
              <div key={c.label} className="row" style={{ gap: 10 }}>
                {c.d > FAR_KM ? <FiAlertTriangle size={16} color="var(--danger)" /> : <FiCheckCircle size={16} color="var(--success)" />}
                <span className="grow" style={{ fontSize: 14 }}>{c.label}</span>
                <span className="hint" style={{ color: c.d > FAR_KM ? 'var(--danger)' : undefined }}>{c.d != null ? `${c.d} km away` : '—'}{c.mock ? ' · demo GPS' : ''}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Photos — from the camera, each stamped with time and position */}
      <div className="section-head"><h2 className="section-title">Photos</h2><span className="hint">{photos.length}</span></div>
      <div className={styles.photos}>
        {photos.map((p) => (
          <figure key={p.id} className={styles.photo}>
            <img src={p.src} alt="Activity" />
            <figcaption>{hhmm(p.at)} · {p.lat.toFixed(4)}, {p.lng.toFixed(4)}</figcaption>
          </figure>
        ))}
        {(running || a.endedAt) && (
          <button className={styles.addPhoto} onClick={() => fileRef.current?.click()} disabled={busy === 'photo'}>
            <FiCamera size={22} /><span>{busy === 'photo' ? 'Stamping…' : 'Add photo'}</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
      </div>
      {!a.startedAt && !photos.length && <p className="hint">{untracked ? 'No photos.' : 'Start the activity to add photos.'}</p>}

      {/* Leads captured at the activity */}
      <div className="section-head">
        <h2 className="section-title">Leads</h2>
        {(running || a.endedAt) && <button className="link" style={{ color: 'var(--primary)', fontWeight: 600, fontSize: 14 }} onClick={() => { setErrors({}); setLead(blankLead(a.area)); }}><FiUserPlus size={14} style={{ verticalAlign: '-2px' }} /> Add lead</button>}
      </div>
      {leads.length === 0 ? (
        <p className="hint">{a.startedAt ? 'No leads yet — add each interested customer as you meet them.' : 'Leads can be added once the activity starts.'}</p>
      ) : (
        <Card padding={0} noChevron>
          {leads.map((l) => (
            <div key={l.id} className={styles.pick} style={{ cursor: 'default' }}>
              <Avatar name={l.name} size={36} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</div>
                <div className="hint truncate">{[l.business, (l.kind ?? 'customer') === 'customer' && l.product, l.amount && formatINR(l.amount)].filter(Boolean).join(' · ')}</div>
                {l.clientId && <button type="button" className={styles.clientChip} onClick={() => navigate(l.kind === 'customer' ? `/sarthi/brief/${l.clientId}` : `/dsas/${l.clientId}`)}>{KIND_LABEL[l.kind]} · open in Clients</button>}
                {l.tagged?.length > 0 && <div className="hint truncate" style={{ color: 'var(--primary)', fontWeight: 600 }}>@ {l.tagged.map((c) => `${team.find((m) => m.empCode === c)?.name.split(' ')[0] ?? c} (${c})`).join(', ')}</div>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {l.verify === 'verified'
                  ? <Badge tone="success" soft><FiShield size={10} style={{ verticalAlign: '-1px' }} /> Verified</Badge>
                  : <button className={styles.verifyBtn} onClick={() => setVerify({ lead: l, text: fill(template, l, officer), keep: false })}>
                      {l.verify === 'sent' ? <><FiRotateCcw size={12} /> Resend</> : <><FiShield size={12} /> Verify</>}
                    </button>}
                {l.verify === 'sent' && (
                  <button className={styles.simBtn} onClick={() => { patchLead(l.id, { verify: 'verified', verifiedAt: new Date().toISOString() }); toast(`${l.name.split(' ')[0]} confirmed · lead verified`, 'success'); }}>Simulate tap</button>
                )}
              </div>
              <a href={`tel:${l.phone}`} aria-label={`Call ${l.name}`} style={{ color: 'var(--primary)', padding: 8 }}><FiPhone size={18} /></a>
            </div>
          ))}
        </Card>
      )}

      {/* Team */}
      <div className="section-head"><h2 className="section-title">Team</h2></div>
      <div className={styles.people} style={{ marginTop: 0 }}>
        {a.assignees.map((code) => {
          const m = team.find((x) => x.empCode === code);
          return <span key={code} className={styles.person}><Avatar name={m?.name ?? code} size={20} />{m?.name ?? code} · {code}</span>;
        })}
      </div>
      {!a.endedAt && !untracked && <Button full variant="ghost" style={{ marginTop: 16 }} onClick={() => navigate(`/marketing?open=${a.id}`)}>{a.assignedBy ? 'Change field force' : 'Edit plan'}</Button>}

      <BottomSheet open={!!lead} onClose={() => setLead(null)} title="Add lead">
        {lead && (
          <div className="stack" style={{ gap: 14 }}>
            <div className={styles.kindSeg} role="group" aria-label="This is a">
              {LEAD_KINDS.map(([k, l]) => <button key={k} type="button" className={lead.kind === k ? styles.kindOn : ''} onClick={() => setLead((x) => ({ ...x, kind: k }))}>{l}</button>)}
            </div>
            <Input label="Name" placeholder="e.g. Ramesh Pawar" value={lead.name} onChange={setL('name')} error={errors.name} />
            <Input label="Mobile number" inputMode="numeric" maxLength={10} prefix="+91" placeholder="98XXXXXXXX" value={lead.phone} onChange={(e) => setLead((l) => ({ ...l, phone: e.target.value.replace(/\D/g, '') }))} error={errors.phone} />
            <Input label={lead.kind === 'customer' ? 'Business (optional)' : 'Firm (optional)'} placeholder={lead.kind === 'customer' ? 'e.g. Pawar Hardware' : 'e.g. Pawar Finserv'} value={lead.business} onChange={setL('business')} />
            {lead.kind === 'customer' && <>
              <Select label="Interested in" value={lead.product} onChange={setL('product')} options={PRODUCTS.map((p) => ({ value: p, label: p }))} />
              <Input label="Amount needed (optional)" inputMode="numeric" prefix="₹" placeholder="500000" value={lead.amount} onChange={(e) => setLead((l) => ({ ...l, amount: e.target.value.replace(/\D/g, '') }))} />
            </>}
            <Input label="Note (optional)" textarea placeholder="What they need, best time to call…" value={lead.note} onChange={setL('note')} />
            <CoworkerTags label="Tag a co-worker to follow up (optional)" value={lead.tagged} onChange={(tagged) => setLead((l) => ({ ...l, tagged }))} />
            <Button full onClick={saveLead}>Save lead</Button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={!!verify} onClose={() => setVerify(null)} title="Verify lead">
        {verify && (
          <div className="stack" style={{ gap: 14 }}>
            <div className="hint">A one-tap link goes to <b>+91 {verify.lead.phone}</b>. When {verify.lead.name.split(' ')[0]} taps it, the lead is marked verified.</div>
            <Input label="Message" textarea value={verify.text} onChange={(e) => setVerify((v) => ({ ...v, text: e.target.value }))} style={{ minHeight: 130 }} />
            <label className="row" style={{ gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
              <input type="checkbox" checked={verify.keep} onChange={(e) => setVerify((v) => ({ ...v, keep: e.target.checked }))} />
              Use this wording for future leads
            </label>
            <div className="row" style={{ gap: 12 }}>
              <Button variant="secondary" style={{ flex: 1 }} onClick={() => setVerify((v) => ({ ...v, text: fill(DEFAULT_TEMPLATE, v.lead, officer) }))}>Reset</Button>
              <Button style={{ flex: 2 }} icon={<FiSend size={16} />} onClick={sendLink}>Send link</Button>
            </div>
          </div>
        )}
      </BottomSheet>
    </Page>
  );
}
