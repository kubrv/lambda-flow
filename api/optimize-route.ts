import type { VercelRequest, VercelResponse } from "@vercel/node";

type LatLng = { lat: number; lng: number };
type StopIn = {
  id?: string;
  addressId?: string | null;
  address: string;
  label?: string;
  lat?: number | null;
  lng?: number | null;
};

type Body = {
  startAddress: string;
  startLat?: number | null;
  startLng?: number | null;
  stops: StopIn[];
};

function bad(res: VercelResponse, status: number, error: string) {
  return res.status(status).json({ ok: false, error });
}

async function geocodeNominatim(address: string): Promise<LatLng | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "lambda-flow/1.0 (route planner)",
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { lat: string; lon: string }[];
  if (!data.length) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
}

async function geocodeGoogle(
  address: string,
  key: string,
): Promise<LatLng | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", key);
  url.searchParams.set("region", "br");
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status: string;
    results: { geometry: { location: { lat: number; lng: number } } }[];
  };
  if (data.status !== "OK" || !data.results[0]) return null;
  return data.results[0].geometry.location;
}

async function resolvePoint(
  address: string,
  lat: number | null | undefined,
  lng: number | null | undefined,
  googleKey?: string,
): Promise<LatLng | null> {
  if (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng };
  }
  if (googleKey) {
    const g = await geocodeGoogle(address, googleKey);
    if (g) return g;
  }
  return geocodeNominatim(address);
}

function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function pathCost(order: number[], dist: number[][], startIdx: number): number {
  if (!order.length) return 0;
  let total = dist[startIdx][order[0]];
  for (let i = 1; i < order.length; i++) {
    total += dist[order[i - 1]][order[i]];
  }
  return total;
}

function optimizeOrderIndices(dist: number[][], startIdx: number, n: number): number[] {
  const remaining = Array.from({ length: n }, (_, i) => i).filter(
    (i) => i !== startIdx,
  );
  const ordered: number[] = [];
  let current = startIdx;
  while (remaining.length) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = dist[current][remaining[i]];
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const next = remaining.splice(best, 1)[0];
    ordered.push(next);
    current = next;
  }

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < ordered.length - 1; i++) {
      for (let k = i + 1; k < ordered.length; k++) {
        const candidate = [
          ...ordered.slice(0, i),
          ...ordered.slice(i, k + 1).reverse(),
          ...ordered.slice(k + 1),
        ];
        if (
          pathCost(candidate, dist, startIdx) + 1e-9 <
          pathCost(ordered, dist, startIdx)
        ) {
          ordered.splice(0, ordered.length, ...candidate);
          improved = true;
        }
      }
    }
  }
  return ordered;
}

async function googleDistanceMatrix(
  points: LatLng[],
  key: string,
): Promise<number[][]> {
  const n = points.length;
  const dist = Array.from({ length: n }, () => Array(n).fill(0));
  const chunk = 10;

  for (let oi = 0; oi < n; oi += chunk) {
    for (let di = 0; di < n; di += chunk) {
      const origins = points.slice(oi, oi + chunk);
      const destinations = points.slice(di, di + chunk);
      const url = new URL(
        "https://maps.googleapis.com/maps/api/distancematrix/json",
      );
      url.searchParams.set(
        "origins",
        origins.map((p) => `${p.lat},${p.lng}`).join("|"),
      );
      url.searchParams.set(
        "destinations",
        destinations.map((p) => `${p.lat},${p.lng}`).join("|"),
      );
      url.searchParams.set("mode", "driving");
      url.searchParams.set("language", "pt-BR");
      url.searchParams.set("region", "br");
      url.searchParams.set("key", key);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Distance Matrix HTTP ${res.status}`);
      const data = (await res.json()) as {
        status: string;
        error_message?: string;
        rows: {
          elements: {
            status: string;
            distance?: { value: number };
          }[];
        }[];
      };
      if (data.status !== "OK") {
        throw new Error(data.error_message || `Distance Matrix: ${data.status}`);
      }

      for (let r = 0; r < origins.length; r++) {
        for (let c = 0; c < destinations.length; c++) {
          const el = data.rows[r]?.elements[c];
          const meters =
            el?.status === "OK" && el.distance
              ? el.distance.value
              : haversineKm(origins[r], destinations[c]) * 1000;
          dist[oi + r][di + c] = meters / 1000;
        }
      }
    }
  }
  return dist;
}

async function googleRoadKm(
  start: LatLng,
  ordered: LatLng[],
  key: string,
): Promise<number> {
  if (!ordered.length) return 0;

  const destination = ordered[ordered.length - 1];
  const middle = ordered.slice(0, -1);
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${start.lat},${start.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("region", "br");
  url.searchParams.set("key", key);
  if (middle.length) {
    url.searchParams.set(
      "waypoints",
      middle.map((s) => `${s.lat},${s.lng}`).join("|"),
    );
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Google Directions HTTP ${res.status}`);
  const data = (await res.json()) as {
    status: string;
    error_message?: string;
    routes: { legs: { distance: { value: number } }[] }[];
  };
  if (data.status !== "OK" || !data.routes[0]) {
    throw new Error(data.error_message || `Google Directions: ${data.status}`);
  }
  const meters = data.routes[0].legs.reduce(
    (sum, leg) => sum + (leg.distance?.value || 0),
    0,
  );
  return Math.round((meters / 1000) * 10) / 10;
}

/** Google: matriz de distâncias + otimização + Directions para km final. */
async function optimizeGoogle(
  start: LatLng,
  stops: (StopIn & LatLng)[],
  key: string,
): Promise<{ ordered: (StopIn & LatLng)[]; totalKm: number; provider: string }> {
  if (!stops.length) {
    return { ordered: [], totalKm: 0, provider: "google-maps" };
  }

  const points = [start, ...stops];
  const dist = await googleDistanceMatrix(points, key);
  const orderIdx = optimizeOrderIndices(dist, 0, points.length);
  const ordered = orderIdx.map((i) => stops[i - 1]);
  const totalKm = await googleRoadKm(start, ordered, key);

  return { ordered, totalKm, provider: "google-maps" };
}

async function optimizeOsrm(
  start: LatLng,
  stops: (StopIn & LatLng)[],
): Promise<{ ordered: (StopIn & LatLng)[]; totalKm: number; provider: string }> {
  if (stops.length === 0) {
    return { ordered: [], totalKm: 0, provider: "osrm" };
  }

  const points = [start, ...stops];
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url =
    `https://router.project-osrm.org/trip/v1/driving/${coords}` +
    `?source=first&roundtrip=false&destination=any&overview=false&steps=false`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
  const data = (await res.json()) as {
    code: string;
    message?: string;
    trips?: { distance: number }[];
    waypoints?: { waypoint_index: number }[];
  };

  if (data.code !== "Ok" || !data.trips?.[0] || !data.waypoints) {
    throw new Error(data.message || `OSRM: ${data.code}`);
  }

  const indexed = stops.map((stop, i) => ({
    stop,
    order: data.waypoints![i + 1].waypoint_index,
  }));
  indexed.sort((a, b) => a.order - b.order);

  return {
    ordered: indexed.map((x) => x.stop),
    totalKm: Math.round((data.trips[0].distance / 1000) * 10) / 10,
    provider: "osrm-driving",
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return bad(res, 405, "Method not allowed");

  try {
    const body = (
      typeof req.body === "string" ? JSON.parse(req.body) : req.body
    ) as Body;

    if (!body?.startAddress?.trim()) {
      return bad(res, 400, "Ponto de partida obrigatório");
    }
    if (!Array.isArray(body.stops) || body.stops.length === 0) {
      return bad(res, 400, "Informe ao menos uma parada");
    }

    const googleKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

    const start = await resolvePoint(
      body.startAddress,
      body.startLat,
      body.startLng,
      googleKey,
    );
    if (!start) {
      return bad(
        res,
        400,
        "Não foi possível localizar o ponto de partida.",
      );
    }

    const resolvedStops: (StopIn & LatLng)[] = [];
    for (const stop of body.stops) {
      const point = await resolvePoint(
        stop.address,
        stop.lat,
        stop.lng,
        googleKey,
      );
      if (!point) {
        return bad(res, 400, `Não foi possível localizar: ${stop.address}`);
      }
      resolvedStops.push({ ...stop, ...point });
      if (!googleKey && (stop.lat == null || stop.lng == null)) {
        await new Promise((r) => setTimeout(r, 1100));
      }
    }

    let result;
    if (googleKey) {
      try {
        result = await optimizeGoogle(start, resolvedStops, googleKey);
      } catch (err) {
        const fallback = await optimizeOsrm(start, resolvedStops);
        result = {
          ...fallback,
          provider: `${fallback.provider} (fallback após Google: ${
            err instanceof Error ? err.message : "erro"
          })`,
        };
      }
    } else {
      result = await optimizeOsrm(start, resolvedStops);
    }

    const ordered = result.ordered.map((s, i) => ({
      id: s.id || crypto.randomUUID(),
      addressId: s.addressId ?? null,
      address: s.address,
      label: s.label || s.address.split(",")[0].trim() || `Parada ${i + 1}`,
      lat: s.lat,
      lng: s.lng,
    }));

    return res.status(200).json({
      ok: true,
      start,
      stops: ordered,
      totalKm: result.totalKm,
      provider: result.provider,
      usedGoogle: Boolean(googleKey) && result.provider.startsWith("google"),
    });
  } catch (err) {
    return bad(
      res,
      500,
      err instanceof Error ? err.message : "Falha ao calcular rota",
    );
  }
}
