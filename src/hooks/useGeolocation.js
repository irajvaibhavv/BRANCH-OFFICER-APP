import { useState, useCallback, useEffect } from 'react';

// Fixed fallback (Pune, FC Road) used when the browser blocks geolocation or in demos.
const MOCK_COORDS = { lat: 18.5204, lng: 73.8567, address: 'FC Road, Shivajinagar, Pune 411005' };

/** Live position for maps: real GPS when it is near Pune (the demo data), otherwise the mock. */
export function useLivePosition() {
  const { coords, capture, status } = useGeolocation();
  useEffect(() => { if (status === 'idle') capture(); }, [status, capture]);
  if (!coords) return MOCK_COORDS;
  const far = Math.abs(coords.lat - MOCK_COORDS.lat) > 0.5 || Math.abs(coords.lng - MOCK_COORDS.lng) > 0.5;
  return far ? MOCK_COORDS : coords;
}

export function useGeolocation() {
  const [state, setState] = useState({ status: 'idle', coords: null });

  const capture = useCallback(() => {
    setState({ status: 'loading', coords: null });
    const finish = (coords) => setState({ status: 'done', coords });
    if (!navigator.geolocation) return setTimeout(() => finish(MOCK_COORDS), 900);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        finish({
          lat: +pos.coords.latitude.toFixed(5),
          lng: +pos.coords.longitude.toFixed(5),
          address: MOCK_COORDS.address, // reverse geocoding would be a real API call
        }),
      () => setTimeout(() => finish(MOCK_COORDS), 600),
      { timeout: 4000 },
    );
  }, []);

  return { ...state, capture };
}
