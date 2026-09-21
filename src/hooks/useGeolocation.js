import { useState, useCallback } from 'react';

// Fixed fallback (Pune, FC Road) used when the browser blocks geolocation or in demos.
const MOCK_COORDS = { lat: 18.5204, lng: 73.8567, address: 'FC Road, Shivajinagar, Pune 411005' };

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
