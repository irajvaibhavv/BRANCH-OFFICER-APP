import { createRoot } from 'react-dom/client';
import './styles/global.css';
import App from './app/App.jsx';

// StrictMode intentionally off for the demo: it double-runs effects in dev (duplicate toasts, timers).
createRoot(document.getElementById('root')).render(<App />);
