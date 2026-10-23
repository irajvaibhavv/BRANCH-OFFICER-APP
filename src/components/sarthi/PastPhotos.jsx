import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { FiClock, FiExternalLink } from 'react-icons/fi';
import { useOffline } from '../../context/OfflineContext';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import {
  SAT_ZOOM, hasGoogle, hasMapillary, satelliteTimeline, streetPhotos, streetViewDate, streetViewImage, streetViewLink, vintageCheck,
} from '../../services/sarthi/pastPhotos';
import styles from './PastPhotos.module.css';

const KIND = { shop: 'Shop', home: 'Home' };

/** "Was this shop / house really there?" — past satellite and street photos of each pin on file, and the officer's read. */
export default function PastPhotos({ caseId, locations, claimedVintage }) {
  const kinds = Object.keys(KIND).filter((k) => locations?.[k]);
  const [kind, setKind] = useState(kinds[0]);
  const [seen, setSeen] = useLocalStorage(`bo_sarthi_pastphotos_${caseId}`, {});
  const { isOnline } = useOffline();
  if (!kinds.length) return null;
  const p = locations[kind];

  return (
    <section className={styles.card}>
      <div className={styles.top}>
        <span className={styles.title}><FiClock size={14} /> Past photos</span>
        {kinds.length > 1 && (
          <div className={styles.tabs}>
            {kinds.map((k) => <button key={k} type="button" className={k === kind ? styles.tabOn : styles.tab} onClick={() => setKind(k)}>{KIND[k]}</button>)}
          </div>
        )}
      </div>
      {isOnline
        ? <Photos key={kind} p={p} kind={kind} seen={seen[kind] ?? null} onSeen={(v) => setSeen((s) => ({ ...s, [kind]: v }))} claimed={kind === 'shop' ? claimedVintage : null} />
        : <p className={styles.note}>Needs internet — the photos load from Esri, Mapillary and Google.</p>}
    </section>
  );
}

function Photos({ p, kind, seen, onSeen, claimed }) {
  const [sat, setSat] = useState(null); // null = loading, [] = none / failed
  const [street, setStreet] = useState([]);
  const [svDate, setSvDate] = useState(null);
  const [svFailed, setSvFailed] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    let live = true;
    satelliteTimeline(p).then((t) => { if (live) { setSat(t); setI(t.length - 1); } }, () => live && setSat([]));
    streetPhotos(p).then((s) => live && setStreet(s), () => {});
    streetViewDate(p).then((d) => live && setSvDate(d));
    return () => { live = false; };
  }, [p]);

  const shot = sat?.[i];
  const years = [...new Set([...(sat ?? []).map((s) => s.year), ...street.map((s) => s.year)])].sort();
  const check = vintageCheck(seen, claimed, years[0]);

  return (
    <>
      <span className={styles.kicker}>From above · Esri Wayback</span>
      <div className={styles.sat}>
        {shot && (
          <MapContainer center={[p.lat, p.lng]} zoom={SAT_ZOOM} maxZoom={19} zoomControl={false} attributionControl={false} className={styles.leaflet}>
            <TileLayer key={shot.id} url={shot.url} maxNativeZoom={19} />
            <CircleMarker center={[p.lat, p.lng]} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: '#ff5a4e', fillOpacity: 0.9 }} />
          </MapContainer>
        )}
        {!shot && <div className={styles.empty}>{sat ? 'Satellite history could not load' : 'Loading satellite history…'}</div>}
        {shot && <span className={styles.stamp}>{shot.label}</span>}
      </div>
      {sat?.length > 1 && (
        <>
          <input type="range" className={styles.slider} min={0} max={sat.length - 1} value={i} onChange={(e) => setI(+e.target.value)} aria-label="Photo year" />
          <div className={styles.ends}><span>{sat[0].year}</span><span>{sat.at(-1).year}</span></div>
        </>
      )}

      <span className={styles.kicker}>From the street</span>
      {hasGoogle && !svFailed && (
        <figure className={styles.sv}>
          <img src={streetViewImage(p)} alt={`Street View of the ${kind}`} onError={() => setSvFailed(true)} />
          <figcaption>Google Street View{svDate ? ` · ${svDate}` : ''} · latest only</figcaption>
        </figure>
      )}
      {hasGoogle && svFailed && <p className={styles.note}>No Google Street View at this pin.</p>}
      {street.length > 0 && (
        <div className={styles.strip}>
          {street.map((s) => (
            <figure key={s.id} className={styles.thumb}><img src={s.url} alt={`Street photo ${s.year}`} loading="lazy" /><figcaption>{s.year}</figcaption></figure>
          ))}
        </div>
      )}
      {hasMapillary && street.length === 0 && <p className={styles.note}>No Mapillary street photos within 60 m.</p>}
      <a className={styles.link} href={streetViewLink(p)} target="_blank" rel="noreferrer">
        <FiExternalLink size={13} /> Older Street View in Google Maps — tap the clock / &ldquo;See more dates&rdquo;
      </a>

      {years.length > 0 && (
        <>
          <span className={styles.kicker}>First visible in</span>
          <div className={styles.chips}>
            {years.map((y) => <button key={y} type="button" className={seen === y ? styles.chipOn : styles.chip} onClick={() => onSeen(seen === y ? null : y)}>{y}</button>)}
            <button type="button" className={seen === 'never' ? styles.chipOn : styles.chip} onClick={() => onSeen(seen === 'never' ? null : 'never')}>Not in any</button>
          </div>
          {check && <p className={`${styles.verdict} ${styles[check.tone]}`}>{check.text}</p>}
        </>
      )}
      <p className={styles.credit}>Imagery © Esri, Maxar, Earthstar Geographics{street.length ? ' · © Mapillary' : ''}{hasGoogle ? ' · © Google' : ''}</p>
    </>
  );
}
