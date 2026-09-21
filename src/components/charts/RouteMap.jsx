import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useOffline } from '../../context/OfflineContext';
import { useTheme } from '../../context/ThemeContext';
import styles from './RouteMap.module.css';

/**
 * Live route map: you / branch → stops in the given order, on real map tiles (Leaflet + CARTO,
 * no API key). Markers and the route line are re-rendered from props, so the map updates the
 * moment stops are added, removed or reordered, and the viewport re-fits to the new route.
 * Offline (or tiles blocked) it degrades to the flat SVG preview so demos never show a grey box.
 * Production: swap the tile layer for Google Maps / Mapbox with the same marker logic.
 */
export const START = { id: 'branch', lat: 18.5308, lng: 73.8475 };

const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

const pinIcon = (n, kind) => L.divIcon({ className: '', html: `<div class="${styles.pin} ${kind === 'start' ? styles.pinStart : ''}">${n}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
const youIcon = L.divIcon({ className: '', html: `<div class="${styles.you}"><span></span></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });

/** Keep the viewport on the route whenever it changes. */
function FitRoute({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) { map.setView(points[0], 13, { animate: true }); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [34, 34], maxZoom: 14, animate: true, duration: 0.5 });
  }, [map, points]);
  return null;
}

export default function RouteMap({ stops = [], origin = null, height = 200, label = 'Pune', className = '', empty = 'Add stops to see the route' }) {
  const { isOnline } = useOffline();
  const { theme } = useTheme();
  const from = origin ? { id: 'you', lat: origin.lat, lng: origin.lng } : START;
  const valid = stops.filter((s) => s?.lat != null && s?.lng != null);
  // Stable identity keyed on ids + coords so FitRoute only re-fits when the route really changes
  const sig = `${from.id}:${from.lat},${from.lng}|${valid.map((s) => `${s.id}:${s.lat},${s.lng}`).join('|')}`;
  const all = useMemo(() => [from, ...valid], [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const points = useMemo(() => all.map((p) => [p.lat, p.lng]), [all]);

  if (!isOnline) return <FlatMap all={all} origin={origin} height={height} className={className} label={`${label} · offline`} empty={empty} stopsCount={valid.length} />;

  return (
    <div className={`${styles.map} ${className}`} style={{ height }}>
      <MapContainer center={[from.lat, from.lng]} zoom={12} zoomControl={false} attributionControl={false} scrollWheelZoom={false} className={styles.leaflet}>
        <TileLayer url={theme === 'dark' ? TILES.dark : TILES.light} />
        {points.length > 1 && <Polyline positions={points} pathOptions={{ color: '#4c1d95', weight: 4, opacity: 0.85, dashArray: '8 8', lineCap: 'round', lineJoin: 'round' }} />}
        {all.map((p, i) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={i === 0 ? (origin ? youIcon : pinIcon('🏢', 'start')) : pinIcon(i)} zIndexOffset={i === 0 ? 1000 : i} />
        ))}
        <FitRoute points={points} />
      </MapContainer>
      {valid.length === 0 && <div className={styles.empty}>{empty}</div>}
      <div className={styles.label}>{label}</div>
    </div>
  );
}

/** Offline fallback: the flat projection preview. */
function FlatMap({ all, origin, height, className, label, empty, stopsCount }) {
  const lats = all.map((p) => p.lat), lngs = all.map((p) => p.lng);
  const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLn = Math.min(...lngs), maxLn = Math.max(...lngs);
  const pts = all.map((p) => ({ id: p.id, x: 12 + ((p.lng - minLn) / (maxLn - minLn || 1)) * 76, y: 88 - ((p.lat - minLa) / (maxLa - minLa || 1)) * 76 }));
  return (
    <div className={`${styles.map} ${styles.flat} ${className}`} style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.svg}>
        <defs><pattern id="routemap-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.3" opacity="0.25" /></pattern></defs>
        <rect width="100" height="100" fill="url(#routemap-grid)" />
        {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--primary)" strokeWidth="1.2" strokeDasharray="2 1.5" vectorEffect="non-scaling-stroke" />}
      </svg>
      {pts.map((p, i) => (
        <div key={p.id} className={styles.pinWrap} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
          {i === 0 && origin ? <div className={styles.you}><span /></div> : <div className={`${styles.pin} ${i === 0 ? styles.pinStart : ''}`}>{i === 0 ? '🏢' : i}</div>}
        </div>
      ))}
      {stopsCount === 0 && <div className={styles.empty}>{empty}</div>}
      <div className={styles.label}>{label}</div>
    </div>
  );
}
