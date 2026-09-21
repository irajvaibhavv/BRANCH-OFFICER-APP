/*
  Simulated weather for the POC. In production this is a forecast API call on the stop's
  lat/lng for the visit hour; here it is deterministic per locality + day + hour so the demo
  is stable across reloads but still differs between stops.
*/
import { IoSunny, IoPartlySunny, IoCloudy, IoRainy, IoThunderstorm } from 'react-icons/io5';
import { toISODate } from './formatters';

const CONDITIONS = [
  { label: 'Sunny', icon: IoSunny, color: '#f59e0b' },
  { label: 'Partly cloudy', icon: IoPartlySunny, color: '#f59e0b' },
  { label: 'Cloudy', icon: IoCloudy, color: '#64748b' },
  { label: 'Light rain', icon: IoRainy, color: '#0284c7', tip: 'Carry an umbrella' },
  { label: 'Thunderstorm', icon: IoThunderstorm, color: '#4c1d95', tip: 'Expect traffic delays' },
];
// Sunny/partly cloudy most often; rain now and then
const WEIGHTS = [3, 3, 2, 2, 1];

const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Forecast for a locality ("Deccan, Pune") at a time ("09:36"). */
export function weatherAt(location = 'Pune', time = '12:00') {
  const hour = Number(String(time).split(':')[0]) || 12;
  const h = hash(`${location}|${toISODate()}|${Math.floor(hour / 3)}`);
  let r = h % WEIGHTS.reduce((a, b) => a + b, 0);
  const cond = CONDITIONS[WEIGHTS.findIndex((w) => (r -= w) < 0)];
  // Pune-ish daily curve: ~24° early morning, peaks ~32° mid-afternoon; rain knocks a few degrees off
  const base = 24 + Math.round(8 * Math.max(0, Math.sin(((hour - 7) / 12) * Math.PI)));
  const temp = base + ((h >> 4) % 3) - 1 - (cond.tip ? 3 : 0);
  return { ...cond, temp, area: location.split(',')[0].trim() };
}
