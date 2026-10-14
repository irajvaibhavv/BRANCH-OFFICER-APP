import { FiGift, FiUmbrella, FiHome, FiUsers, FiFileText, FiBriefcase, FiStar } from 'react-icons/fi';

// Marketing activity kinds — shared by the Marketing screen and the activity screen.
export const ACTIVITY_TYPES = [
  { id: 'loan_mela', label: 'Loan mela', icon: FiGift, tone: '#dc2626' },
  { id: 'canopy', label: 'Canopy / stall', icon: FiUmbrella, tone: '#7c3aed' },
  { id: 'society', label: 'Society / market camp', icon: FiHome, tone: '#0f766e' },
  { id: 'association', label: 'Trade association meet', icon: FiBriefcase, tone: '#ea580c' },
  { id: 'leaflet', label: 'Leaflet drive', icon: FiFileText, tone: '#2563eb' },
  { id: 'dsa_meet', label: 'DSA / Connector meet', icon: FiUsers, tone: '#db2777' },
  { id: 'event', label: 'Branch event', icon: FiStar, tone: '#f59e0b' },
];
export const typeOf = (id) => ACTIVITY_TYPES.find((t) => t.id === id) ?? ACTIVITY_TYPES[0];
export const clock = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
