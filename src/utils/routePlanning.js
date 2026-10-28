// Branch location — the default start of every route.
export const START = { id: 'branch', lat: 18.5308, lng: 73.8475 };

// Haversine distance in km, ×1.3 road factor.
export const km = (a, b) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x)) * 1.3;
};

// Greedy nearest-neighbour; production would call a Directions API.
export function optimise(stops, from = START) {
  const out = [];
  let cur = from;
  const pool = [...stops];
  while (pool.length) {
    pool.sort((a, b) => km(cur, a) - km(cur, b));
    const n = pool.shift();
    out.push(n);
    cur = n;
  }
  return out;
}
