export type LatLng = { lat: number; lng: number };

const EARTH_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Nearest-neighbor from start, then 2-opt polish. */
export function optimizeOrder<T extends LatLng>(
  start: LatLng,
  points: T[],
): { ordered: T[]; totalKm: number } {
  if (points.length === 0) return { ordered: [], totalKm: 0 };
  if (points.length === 1) {
    return { ordered: [...points], totalKm: haversineKm(start, points[0]) };
  }

  const remaining = [...points];
  const ordered: T[] = [];
  let current = start;

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    current = next;
  }

  const polished = twoOpt(start, ordered);
  return { ordered: polished, totalKm: pathKm(start, polished) };
}

function pathKm(start: LatLng, points: LatLng[]): number {
  if (!points.length) return 0;
  let total = haversineKm(start, points[0]);
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return total;
}

function twoOpt<T extends LatLng>(start: LatLng, route: T[]): T[] {
  let best = [...route];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        if (pathKm(start, candidate) + 1e-9 < pathKm(start, best)) {
          best = candidate;
          improved = true;
        }
      }
    }
  }
  return best;
}

export function formatKm(km: number): string {
  if (!Number.isFinite(km) || km <= 0) return "0 km";
  return `${km.toFixed(1).replace(".", ",")} km`;
}
