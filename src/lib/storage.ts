import { getSupabase, isSupabaseConfigured } from "./supabase";
import type { AppData, DayRoute, Motoboy, Stop, Weekday } from "./types";
import { WEEKDAYS, emptyRoute } from "./types";

type DayRouteRow = {
  day: Weekday;
  start_address: string;
  start_lat: number | null;
  start_lng: number | null;
  motoboy_id: string | null;
  stops: Stop[] | null;
  total_km: number | null;
  optimized_at: string | null;
};

type CoordRow = {
  address_key: string;
  lat: number;
  lng: number;
};

function blankData(): AppData {
  return {
    motoboys: [],
    routes: Object.fromEntries(
      WEEKDAYS.map((d) => [d.id, emptyRoute(d.id)]),
    ) as Record<Weekday, DayRoute>,
    coordCache: {},
  };
}

export async function loadData(): Promise<AppData> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase não configurado. Configure as variáveis no Vercel.",
    );
  }

  const sb = getSupabase();
  const [motoboysRes, routesRes, cacheRes] = await Promise.all([
    sb.from("motoboys").select("id,name,phone").order("created_at"),
    sb.from("day_routes").select("*"),
    sb.from("coord_cache").select("address_key,lat,lng"),
  ]);

  if (motoboysRes.error) throw new Error(motoboysRes.error.message);
  if (routesRes.error) throw new Error(routesRes.error.message);
  if (cacheRes.error) throw new Error(cacheRes.error.message);

  const data = blankData();
  data.motoboys = (motoboysRes.data || []) as Motoboy[];

  for (const row of (routesRes.data || []) as DayRouteRow[]) {
    data.routes[row.day] = {
      day: row.day,
      startAddress: row.start_address || "",
      startLat: row.start_lat,
      startLng: row.start_lng,
      motoboyId: row.motoboy_id,
      stops: Array.isArray(row.stops) ? row.stops : [],
      totalKm: Number(row.total_km || 0),
      optimizedAt: row.optimized_at,
    };
  }

  for (const row of (cacheRes.data || []) as CoordRow[]) {
    data.coordCache[row.address_key] = { lat: row.lat, lng: row.lng };
  }

  return data;
}

export async function saveData(data: AppData): Promise<void> {
  const sb = getSupabase();

  const existing = await sb.from("motoboys").select("id");
  if (existing.error) throw new Error(existing.error.message);
  const existingIds = new Set((existing.data || []).map((m) => m.id as string));
  const nextIds = new Set(data.motoboys.map((m) => m.id));

  const toDelete = [...existingIds].filter((id) => !nextIds.has(id));
  if (toDelete.length) {
    const del = await sb.from("motoboys").delete().in("id", toDelete);
    if (del.error) throw new Error(del.error.message);
  }

  if (data.motoboys.length) {
    const up = await sb.from("motoboys").upsert(
      data.motoboys.map((m) => ({
        id: m.id,
        name: m.name,
        phone: m.phone ?? null,
      })),
    );
    if (up.error) throw new Error(up.error.message);
  }

  const routeRows = WEEKDAYS.map((d) => {
    const r = data.routes[d.id];
    return {
      day: d.id,
      start_address: r.startAddress,
      start_lat: r.startLat,
      start_lng: r.startLng,
      motoboy_id: r.motoboyId,
      stops: r.stops,
      total_km: r.totalKm,
      optimized_at: r.optimizedAt,
    };
  });

  const routesUp = await sb.from("day_routes").upsert(routeRows);
  if (routesUp.error) throw new Error(routesUp.error.message);

  const cacheRows = Object.entries(data.coordCache).map(([address_key, v]) => ({
    address_key,
    lat: v.lat,
    lng: v.lng,
    updated_at: new Date().toISOString(),
  }));

  if (cacheRows.length) {
    const cacheUp = await sb.from("coord_cache").upsert(cacheRows);
    if (cacheUp.error) throw new Error(cacheUp.error.message);
  }
}

export async function checkLocalApi(): Promise<boolean> {
  return isSupabaseConfigured();
}
