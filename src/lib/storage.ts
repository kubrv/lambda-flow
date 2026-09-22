import { getSupabase, isSupabaseConfigured } from "./supabase";
import type {
  AppData,
  DayRoute,
  Motoboy,
  SavedAddress,
  Stop,
  Weekday,
} from "./types";
import { WEEKDAYS, createId, emptyRoute } from "./types";
import { normalizeAddress } from "./parseAddress";
import { cleanNickname, isAutoStopLabel } from "./labels";

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

type AddressRow = {
  id: string;
  label: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
};

function blankData(): AppData {
  return {
    motoboys: [],
    addresses: [],
    routes: Object.fromEntries(
      WEEKDAYS.map((d) => [d.id, emptyRoute(d.id)]),
    ) as Record<Weekday, DayRoute>,
    coordCache: {},
  };
}

/** Garante que paradas históricas entrem no catálogo. */
export function syncCatalogFromRoutes(data: AppData): AppData {
  const byKey = new Map(
    data.addresses.map((a) => [normalizeAddress(a.address), a]),
  );

  for (const day of WEEKDAYS) {
    for (const stop of data.routes[day.id].stops) {
      const key = normalizeAddress(stop.address);
      if (!key) continue;
      const existing = byKey.get(key);
      if (existing) {
        if (stop.lat != null && stop.lng != null) {
          existing.lat = stop.lat;
          existing.lng = stop.lng;
        }
        if (isAutoStopLabel(existing.label) && stop.label) {
          existing.label = cleanNickname(stop.label, stop.address);
        }
        continue;
      }
      const saved: SavedAddress = {
        id: stop.addressId || createId(),
        label: cleanNickname(stop.label, stop.address),
        address: stop.address,
        lat: stop.lat,
        lng: stop.lng,
      };
      byKey.set(key, saved);
    }
  }

  return { ...data, addresses: [...byKey.values()] };
}

export function upsertSavedAddress(
  addresses: SavedAddress[],
  input: {
    id?: string;
    label?: string;
    address: string;
    lat?: number | null;
    lng?: number | null;
  },
): SavedAddress[] {
  const key = normalizeAddress(input.address);
  const idx = addresses.findIndex(
    (a) => normalizeAddress(a.address) === key || (input.id && a.id === input.id),
  );
  const incoming = cleanNickname(input.label, input.address);
  const prev = addresses[idx];
  const next: SavedAddress = {
    id: input.id || prev?.id || createId(),
    label:
      !isAutoStopLabel(incoming)
        ? incoming
        : cleanNickname(prev?.label, input.address),
    address: input.address.trim(),
    lat: input.lat ?? prev?.lat ?? null,
    lng: input.lng ?? prev?.lng ?? null,
  };
  if (idx >= 0) {
    const copy = [...addresses];
    copy[idx] = next;
    return copy;
  }
  return [...addresses, next];
}

export async function loadData(): Promise<AppData> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase não configurado. Configure as variáveis no Vercel.",
    );
  }

  const sb = getSupabase();
  const [motoboysRes, routesRes, cacheRes, addressesRes] = await Promise.all([
    sb.from("motoboys").select("id,name,phone").order("created_at"),
    sb.from("day_routes").select("*"),
    sb.from("coord_cache").select("address_key,lat,lng"),
    sb.from("addresses").select("id,label,address,lat,lng").order("created_at"),
  ]);

  if (motoboysRes.error) throw new Error(motoboysRes.error.message);
  if (routesRes.error) throw new Error(routesRes.error.message);
  if (cacheRes.error) throw new Error(cacheRes.error.message);

  const data = blankData();
  data.motoboys = (motoboysRes.data || []) as Motoboy[];

  if (!addressesRes.error && addressesRes.data) {
    data.addresses = (addressesRes.data as AddressRow[]).map((row) => ({
      id: row.id,
      label: row.label || row.address.split(",")[0].trim(),
      address: row.address,
      lat: row.lat,
      lng: row.lng,
    }));
  }

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

  return syncCatalogFromRoutes(data);
}

export async function saveData(data: AppData): Promise<void> {
  const sb = getSupabase();
  const synced = syncCatalogFromRoutes(data);

  const existing = await sb.from("motoboys").select("id");
  if (existing.error) throw new Error(existing.error.message);
  const existingIds = new Set((existing.data || []).map((m) => m.id as string));
  const nextIds = new Set(synced.motoboys.map((m) => m.id));

  const toDelete = [...existingIds].filter((id) => !nextIds.has(id));
  if (toDelete.length) {
    const del = await sb.from("motoboys").delete().in("id", toDelete);
    if (del.error) throw new Error(del.error.message);
  }

  if (synced.motoboys.length) {
    const up = await sb.from("motoboys").upsert(
      synced.motoboys.map((m) => ({
        id: m.id,
        name: m.name,
        phone: m.phone ?? null,
      })),
    );
    if (up.error) throw new Error(up.error.message);
  }

  const addrExisting = await sb.from("addresses").select("id");
  if (addrExisting.error) {
    // Tabela ainda não migrada: catálogo vive nas rotas até rodar migration_addresses.sql
    console.warn("addresses table unavailable:", addrExisting.error.message);
  } else {
    const existingAddr = new Set(
      (addrExisting.data || []).map((a) => a.id as string),
    );
    const nextAddr = new Set(synced.addresses.map((a) => a.id));
    const delAddr = [...existingAddr].filter((id) => !nextAddr.has(id));
    if (delAddr.length) {
      await sb.from("addresses").delete().in("id", delAddr);
    }
    if (synced.addresses.length) {
      const addrUp = await sb.from("addresses").upsert(
        synced.addresses.map((a) => ({
          id: a.id,
          label: a.label,
          address: a.address,
          lat: a.lat,
          lng: a.lng,
        })),
      );
      if (addrUp.error) throw new Error(addrUp.error.message);
    }
  }

  const routeRows = WEEKDAYS.map((d) => {
    const r = synced.routes[d.id];
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

  const cacheRows = Object.entries(synced.coordCache).map(([address_key, v]) => ({
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
