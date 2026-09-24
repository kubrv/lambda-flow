import type { VercelRequest, VercelResponse } from "@vercel/node";

type LatLng = { lat: number; lng: number };
type StopIn = {
  id?: string;
  addressId?: string | null;
  address: string;
  label?: string;
  kind?: string;
  kinds?: string[];
  notes?: string;
  boxes?: number;
  complement?: string;
  hours?: { open: string; close: string }[];
  lat?: number | null;
  lng?: number | null;
};

type Body = {
  startAddress: string;
  startLat?: number | null;
  startLng?: number | null;
  returnToStart?: boolean;
  stops: StopIn[];
};

const UA = "lambda-flow/1.1 (motoboy route planner; contact: vercel.app)";

function bad(res: VercelResponse, status: number, error: string) {
  return res.status(status).json({ ok: false, error });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

/** Nominatim (OpenStreetMap) — Brasil, com tentativas extras. */
async function geocodeNominatim(address: string): Promise<LatLng | null> {
  const queries = [
    address,
    /brasil|brazil|\bbr\b/i.test(address) ? address : `${address}, Brasil`,
    /são paulo|sao paulo|\bsp\b/i.test(address)
      ? address
      : `${address}, São Paulo, Brasil`,
  ];
  const unique = [...new Set(queries.map((q) => q.trim()).filter(Boolean))];

  for (let i = 0; i < unique.length; i++) {
    if (i > 0) await sleep(1100);
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", unique[i]);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("addressdetails", "0");

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": UA },
    });
    if (!res.ok) continue;
    const data = (await res.json()) as { lat: string; lon: string }[];
    if (!data.length) continue;
    return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
  }
  return null;
}

async function resolvePoint(
  address: string,
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<LatLng | null> {
  if (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng };
  }
  return geocodeNominatim(address);
}

function optimizeOrderIndices(
  dist: number[][],
  startIdx: number,
  n: number,
): number[] {
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
    current = remaining.splice(best, 1)[0];
    ordered.push(current);
  }
  return ordered;
}

async function osrmTableKm(points: LatLng[]): Promise<number[][]> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=distance`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM table HTTP ${res.status}`);
  const data = (await res.json()) as {
    code: string;
    message?: string;
    distances?: (number | null)[][];
  };
  if (data.code !== "Ok" || !data.distances) {
    throw new Error(data.message || `OSRM table: ${data.code}`);
  }
  return data.distances.map((row, i) =>
    row.map((meters, j) => {
      if (meters == null || !Number.isFinite(meters)) {
        return haversineKm(points[i], points[j]);
      }
      return meters / 1000;
    }),
  );
}

async function osrmRouteKm(points: LatLng[]): Promise<number> {
  if (points.length < 2) return 0;
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM route HTTP ${res.status}`);
  const data = (await res.json()) as {
    code: string;
    message?: string;
    routes?: { distance: number }[];
  };
  if (data.code !== "Ok" || !data.routes?.[0]) {
    throw new Error(data.message || `OSRM route: ${data.code}`);
  }
  return Math.round((data.routes[0].distance / 1000) * 10) / 10;
}

async function optimizeOsrmTrip(
  start: LatLng,
  stops: (StopIn & LatLng)[],
  returnToStart: boolean,
): Promise<{ ordered: (StopIn & LatLng)[]; totalKm: number; provider: string }> {
  if (!stops.length) {
    return { ordered: [], totalKm: 0, provider: "osrm" };
  }

  const points = [start, ...stops];
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const roundtrip = returnToStart ? "true" : "false";
  const dest = returnToStart ? "any" : "any";
  const url =
    `https://router.project-osrm.org/trip/v1/driving/${coords}` +
    `?source=first&roundtrip=${roundtrip}&destination=${dest}&overview=false&steps=false`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM trip HTTP ${res.status}`);
  const data = (await res.json()) as {
    code: string;
    message?: string;
    trips?: { distance: number }[];
    waypoints?: { waypoint_index: number }[];
  };

  if (data.code !== "Ok" || !data.trips?.[0] || !data.waypoints) {
    throw new Error(data.message || `OSRM trip: ${data.code}`);
  }

  const indexed = stops.map((stop, i) => ({
    stop,
    order: data.waypoints![i + 1].waypoint_index,
  }));
  indexed.sort((a, b) => a.order - b.order);

  return {
    ordered: indexed.map((x) => x.stop),
    totalKm: Math.round((data.trips[0].distance / 1000) * 10) / 10,
    provider: "osrm-trip",
  };
}

/** Fallback: tabela OSRM + vizinho mais próximo + rota real. */
async function optimizeOsrmTable(
  start: LatLng,
  stops: (StopIn & LatLng)[],
  returnToStart: boolean,
): Promise<{ ordered: (StopIn & LatLng)[]; totalKm: number; provider: string }> {
  const points = [start, ...stops];
  const dist = await osrmTableKm(points);
  const orderIdx = optimizeOrderIndices(dist, 0, points.length);
  const ordered = orderIdx.map((i) => stops[i - 1]);
  const path: LatLng[] = [start, ...ordered];
  if (returnToStart) path.push(start);

  let totalKm = 0;
  try {
    totalKm = await osrmRouteKm(path);
  } catch {
    let sum = 0;
    let cur = 0;
    for (const idx of orderIdx) {
      sum += dist[cur][idx];
      cur = idx;
    }
    if (returnToStart) sum += dist[cur][0];
    totalKm = Math.round(sum * 10) / 10;
  }

  return { ordered, totalKm, provider: "osrm-table" };
}

async function optimizeRoute(
  start: LatLng,
  stops: (StopIn & LatLng)[],
  returnToStart: boolean,
): Promise<{ ordered: (StopIn & LatLng)[]; totalKm: number; provider: string }> {
  try {
    return await optimizeOsrmTrip(start, stops, returnToStart);
  } catch (err) {
    try {
      return await optimizeOsrmTable(start, stops, returnToStart);
    } catch (err2) {
      // último recurso: ordem gulosa por haversine + km OSRM se possível
      const points = [start, ...stops];
      const dist = points.map((a) =>
        points.map((b) => haversineKm(a, b)),
      );
      const orderIdx = optimizeOrderIndices(dist, 0, points.length);
      const ordered = orderIdx.map((i) => stops[i - 1]);
      const path: LatLng[] = [start, ...ordered];
      if (returnToStart) path.push(start);
      let totalKm = 0;
      try {
        totalKm = await osrmRouteKm(path);
      } catch {
        let sum = 0;
        for (let i = 0; i < path.length - 1; i++) {
          sum += haversineKm(path[i], path[i + 1]);
        }
        totalKm = Math.round(sum * 10) / 10;
      }
      return {
        ordered,
        totalKm,
        provider: `osrm-fallback (${err instanceof Error ? err.message : "trip"}; ${
          err2 instanceof Error ? err2.message : "table"
        })`,
      };
    }
  }
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

    const start = await resolvePoint(
      body.startAddress,
      body.startLat,
      body.startLng,
    );
    if (!start) {
      return bad(res, 400, "Não foi possível localizar o ponto de partida.");
    }

    const resolvedStops: (StopIn & LatLng)[] = [];
    for (let i = 0; i < body.stops.length; i++) {
      const stop = body.stops[i];
      const needsGeo = stop.lat == null || stop.lng == null;
      if (needsGeo && i > 0) await sleep(1100);
      const point = await resolvePoint(stop.address, stop.lat, stop.lng);
      if (!point) {
        return bad(res, 400, `Não foi possível localizar: ${stop.address}`);
      }
      resolvedStops.push({ ...stop, ...point });
    }

    const returnToStart = Boolean(body.returnToStart);
    const result = await optimizeRoute(start, resolvedStops, returnToStart);
    const totalKm = result.totalKm;

    const ordered = result.ordered.map((s, i) => {
      const kinds = Array.isArray(s.kinds)
        ? s.kinds.filter((k) => k === "entrega" || k === "retirada")
        : [];
      const resolvedKinds =
        kinds.length > 0
          ? [...new Set(kinds)]
          : s.kind === "retirada"
            ? ["retirada"]
            : ["entrega"];
      return {
        id: s.id || crypto.randomUUID(),
        addressId: s.addressId ?? null,
        address: s.address,
        label: s.label || s.address.split(",")[0].trim() || `Parada ${i + 1}`,
        kinds: resolvedKinds,
        kind: resolvedKinds.length === 1 ? resolvedKinds[0] : undefined,
        notes: typeof s.notes === "string" ? s.notes : undefined,
        boxes:
          typeof s.boxes === "number" && Number.isFinite(s.boxes) && s.boxes > 0
            ? Math.floor(s.boxes)
            : 0,
        complement:
          typeof s.complement === "string" && s.complement.trim()
            ? s.complement.trim()
            : undefined,
        hours: Array.isArray(s.hours) ? s.hours : undefined,
        lat: s.lat,
        lng: s.lng,
      };
    });

    return res.status(200).json({
      ok: true,
      start,
      stops: ordered,
      totalKm,
      returnToStart,
      provider: result.provider,
      usedGoogle: false,
    });
  } catch (err) {
    return bad(
      res,
      500,
      err instanceof Error ? err.message : "Falha ao calcular rota",
    );
  }
}
