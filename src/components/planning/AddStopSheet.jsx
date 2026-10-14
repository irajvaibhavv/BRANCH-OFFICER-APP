import { useState } from 'react';
import { FiSearch, FiFlag, FiPlus, FiUserPlus, FiAlertTriangle } from 'react-icons/fi';
import BottomSheet from '../ui/BottomSheet';
import Avatar from '../ui/Avatar';
import Button from '../ui/Button';
import { Input, Select, Toggle } from '../ui/Input';
import { useAppState } from '../../context/AppStateContext';
import { useToast } from '../../hooks/useToast';
import { isConnector, CHANNELS } from '../../utils/channel';
import { AREAS, AREA_COORDS } from '../../utils/areas';
import { START, km } from '../../utils/route';
import { toISODate } from '../../utils/formatters';
import styles from './AddStopSheet.module.css';

const BLANK = { name: '', phone: '', area: '', channel: 'dsa' };

/**
 * Plan on the go: add one stop to today without rebuilding the plan — as the next stop or later in the day.
 * An urgent call from someone not in the app yet ("new DSA in Kothrud, come now") is added here too: a lead record
 * pinned to its area's centre, then the stop. A next stop pushes the rest of the day back (addStopNow).
 */
export default function AddStopSheet({ open, onClose }) {
  const { dsas, customers, marketing, todayVisits, addStopNow, addDsa } = useAppState();
  const { toast } = useToast();
  const [next, setNext] = useState(true);
  const [urgent, setUrgent] = useState(false);
  const [q, setQ] = useState('');
  const [fresh, setFresh] = useState(null); // the new-DSA form, or null
  const lined = new Set(todayVisits.filter((v) => v.status === 'upcoming').map((v) => v.dsaId));
  const needle = q.trim().toLowerCase();
  const hit = (s) => !needle || s.toLowerCase().includes(needle);

  const groups = [
    ['Marketing today', marketing.filter((m) => m.date === toISODate() && m.status !== 'done' && hit(`${m.title} ${m.area}`)).map((m) => ({ id: m.id, name: m.title, sub: `${m.start}–${m.end} · ${m.area}`, flag: true }))],
    ['DSAs', dsas.filter((d) => !isConnector(d) && hit(`${d.name} ${d.firm ?? ''} ${d.location} ${d.vendorCode ?? ''}`)).map((d) => ({ id: d.id, name: d.name, sub: `${d.location} · ${d.distanceKm} km` }))],
    ['Connectors', dsas.filter((d) => isConnector(d) && hit(`${d.name} ${d.firm ?? ''} ${d.location} ${d.vendorCode ?? ''}`)).map((d) => ({ id: d.id, name: d.name, sub: `${d.profession ?? 'Connector'} · ${d.location}` }))],
    ['Customers', customers.filter((c) => hit(`${c.name} ${c.business ?? ''} ${c.location}`)).map((c) => ({ id: c.id, name: c.name, sub: `${c.business ?? ''} · ${c.location}` }))],
  ].filter(([, items]) => items.length);

  const done = (name, rec) => {
    const when = next ? 'as your next stop' : `for ${rec.time}`;
    toast(`${name.split(' –')[0]} added ${when}${rec.shifted ? ` · ${rec.shifted} later stop${rec.shifted > 1 ? 's' : ''} moved back` : ''}`, 'success', 2600);
    setQ(''); setFresh(null); setUrgent(false);
    onClose();
  };
  const add = (item) => done(item.name, addStopNow(item.id, { next, urgent }));

  const phoneOk = /^[6-9]\d{9}$/.test(fresh?.phone ?? '');
  const canSave = fresh && fresh.name.trim().length >= 2 && phoneOk && fresh.area;
  const addNew = () => {
    const [lat, lng] = AREA_COORDS[fresh.area];
    const location = `${fresh.area}, Pune`;
    const rec = addDsa({
      name: fresh.name.trim(), phone: `+91 ${fresh.phone.slice(0, 5)} ${fresh.phone.slice(5)}`, firm: null, location, lat, lng,
      distanceKm: +km(START, { lat, lng }).toFixed(1), ...(fresh.channel === 'connector' && { channel: 'connector' }), addedOnRoute: toISODate(),
    });
    done(rec.name, addStopNow(rec.id, { next, urgent, location }));
  };

  return (
    <BottomSheet open={open} onClose={() => { setFresh(null); onClose(); }} title={fresh ? 'New DSA on the way' : 'Add a stop'}>
      <div className={styles.seg}>
        <button className={next ? styles.on : ''} onClick={() => setNext(true)}>Next stop</button>
        <button className={!next ? styles.on : ''} onClick={() => setNext(false)}>Later today</button>
      </div>
      <Toggle checked={urgent} onChange={setUrgent} label="Urgent" description="Flagged on your route" icon={<FiAlertTriangle size={18} />} />

      {fresh ? (
        <div className="stack" style={{ marginTop: 12 }}>
          <div className={styles.seg} style={{ marginBottom: 0 }}>
            {Object.entries(CHANNELS).map(([k, c]) => (
              <button key={k} className={fresh.channel === k ? styles.on : ''} onClick={() => setFresh({ ...fresh, channel: k })}>{c.label}</button>
            ))}
          </div>
          <Input label="Name" value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} placeholder="e.g. Rakesh Jain" autoFocus />
          <Input label="Mobile" prefix="+91" inputMode="numeric" maxLength={10} value={fresh.phone} onChange={(e) => setFresh({ ...fresh, phone: e.target.value.replace(/\D/g, '') })}
            error={fresh.phone.length === 10 && !phoneOk ? 'Enter a valid 10-digit mobile' : undefined} />
          <Select label="Area" value={fresh.area} onChange={(e) => setFresh({ ...fresh, area: e.target.value })} placeholder="Where are they?" options={AREAS.map((a) => ({ value: a, label: a }))} />
          <p className="hint">Saved as a Lead — finish onboarding from their profile after the visit.</p>
          <Button full disabled={!canSave} icon={<FiPlus size={18} />} onClick={addNew}>Add {next ? 'as next stop' : 'later today'}</Button>
          <Button full variant="ghost" onClick={() => setFresh(null)}>Back to search</Button>
        </div>
      ) : (
        <>
          <div className={styles.search} style={{ marginTop: 12 }}>
            <FiSearch size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search DSA, connector, customer, code…" />
          </div>
          <button className={styles.newRow} onClick={() => setFresh({ ...BLANK, name: q.trim() })}>
            <span className="icon-tile" style={{ '--tile': '#7c3aed', width: 32, height: 32, borderRadius: 10, flexShrink: 0 }}><FiUserPlus size={15} /></span>
            <span className="grow" style={{ fontWeight: 600, fontSize: 14 }}>Someone new? Add a DSA / Connector</span>
            <FiPlus size={16} />
          </button>
          <div className={styles.list}>
            {groups.map(([label, items]) => (
              <div key={label}>
                <div className={styles.group}>{label}</div>
                {items.map((it) => (
                  <button key={it.id} className={styles.row} disabled={lined.has(it.id)} onClick={() => add(it)}>
                    {it.flag ? <span className="icon-tile" style={{ '--tile': '#0f766e', width: 32, height: 32, borderRadius: 10, flexShrink: 0 }}><FiFlag size={15} /></span> : <Avatar name={it.name} size={32} />}
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="truncate" style={{ fontWeight: 600, fontSize: 14, display: 'block' }}>{it.name}</span>
                      <span className="hint truncate" style={{ display: 'block' }}>{it.sub}</span>
                    </span>
                    <span className={styles.add}>{lined.has(it.id) ? 'Lined up' : <><FiPlus size={11} style={{ verticalAlign: '-1px' }} /> Add</>}</span>
                  </button>
                ))}
              </div>
            ))}
            {!groups.length && <p className="hint" style={{ textAlign: 'center', padding: 20 }}>Nothing matches “{q}”.</p>}
          </div>
        </>
      )}
    </BottomSheet>
  );
}
