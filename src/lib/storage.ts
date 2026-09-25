import { getSupabase, isSupabaseConfigured } from "./supabase";
import type {
  AppData,
  DayRoute,
  FinanceEntry,
  Motoboy,
  SavedAddress,
  Stop,
  Weekday,
} from "./types";
import {
  WEEKDAYS,
  createId,
  emptyRoute,
  DEFAULT_PRICE_PER_KM,
  FALLBACK_START_ADDRESS,
  resolveStopKinds,
  resolveStopNotes,
  normalizeBoxes,
} from "./types";
import { normalizeAddress } from "./parseAddress";
import { cleanNickname, isAutoStopLabel } from "./labels";
import { localDateKey, weekdayFromDateKey } from "./dates";
import { cloneDefaultHours, normalizeHoursPeriods } from "./hours";

type LegacyDayRouteRow = {
  day: Weekday;
  start_address: string;
  start_lat: number | null;
  start_lng: number | null;
  motoboy_id: string | null;
  stops: Stop[] | null;
  total_km: number | null;
  return_to_start?: boolean | null;
  optimized_at: string | null;
};

type DateRouteRow = {
  route_date: string;
  start_address: string;
  start_lat: number | null;
  start_lng: number | null;
  motoboy_id: string | null;
  stops: Stop[] | null;
  total_km: number | null;
  return_to_start?: boolean | null;
  optimized_at: string | null;
  completion_status?: string | null;
  motoboy_report?: string | null;
  motoboy_completed_at?: string | null;
  motoboy_completed_by?: string | null;
  admin_report?: string | null;
  admin_verified_at?: string | null;
  admin_verified_by?: string | null;
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
  complement?: string | null;
  hours?: unknown;
  lat: number | null;
  lng: number | null;
  active?: boolean | null;
  created_at?: string | null;
};

type SettingsRow = {
  id: number;
  price_per_km: number | null;
  preset_start_address?: string | null;
  preset_start_lat?: number | null;
  preset_start_lng?: number | null;
};

type FinanceRow = {
  id: string;
  motoboy_id: string;
  amount: number;
  route_dates: string[] | null;
  description: string | null;
  status: string;
  created_at: string;
  source?: string | null;
  km?: number | null;
  payment_method?: string | null;
  paid_at?: string | null;
};

function mapStops(stops: Stop[] | null | undefined): Stop[] {
  if (!Array.isArray(stops)) return [];
  return stops.map((s) => {
    const kinds = resolveStopKinds(s);
    const notes = resolveStopNotes(s);
    return {
      ...s,
      kinds,
      kind: kinds.length === 1 ? kinds[0] : undefined,
      notes: notes.entrega || notes.retirada || undefined,
      notesEntrega: notes.entrega || undefined,
      notesRetirada: notes.retirada || undefined,
      boxes: normalizeBoxes(s.boxes),
      complement: s.complement?.trim() || undefined,
      hours: s.hours?.length
        ? normalizeHoursPeriods(s.hours)
        : undefined,
    };
  });
}

function mapDateRoute(row: DateRouteRow): DayRoute {
  const date = String(row.route_date).slice(0, 10);
  const rawStatus = (row.completion_status || "open").toLowerCase();
  const completionStatus =
    rawStatus === "verified" || rawStatus === "completed" ? rawStatus : "open";
  return {
    date,
    startAddress: row.start_address || "",
    startLat: row.start_lat,
    startLng: row.start_lng,
    motoboyId: row.motoboy_id,
    stops: mapStops(row.stops),
    totalKm: Number(row.total_km || 0),
    returnToStart: Boolean(row.return_to_start),
    optimizedAt: row.optimized_at,
    completionStatus,
    motoboyReport: row.motoboy_report || "",
    motoboyCompletedAt: row.motoboy_completed_at || null,
    motoboyCompletedBy: row.motoboy_completed_by || "",
    adminReport: row.admin_report || "",
    adminVerifiedAt: row.admin_verified_at || null,
    adminVerifiedBy: row.admin_verified_by || "",
  };
}

function blankData(): AppData {
  return {
    motoboys: [],
    addresses: [],
    routesByDate: {},
    weekdayLegacy: {},
    presetStartAddress: FALLBACK_START_ADDRESS,
    presetStartLat: null,
    presetStartLng: null,
    pricePerKm: DEFAULT_PRICE_PER_KM,
    finance: [],
    coordCache: {},
  };
}

export function syncCatalogFromRoutes(data: AppData): AppData {
  // Preserva TODOS os endereços por id (nunca colapsa/descarta por texto
  // normalizado — isso apagava cadastros “parecidos” no save).
  const byId = new Map(
    data.addresses.map((a) => [a.id, { ...a } as SavedAddress]),
  );
  const normToId = new Map<string, string>();
  for (const a of byId.values()) {
    const key = normalizeAddress(a.address);
    if (key && !normToId.has(key)) normToId.set(key, a.id);
  }

  const allStops = [
    ...Object.values(data.routesByDate).flatMap((r) => r.stops),
    ...Object.values(data.weekdayLegacy).flatMap((r) => r?.stops || []),
  ];

  for (const stop of allStops) {
    const key = normalizeAddress(stop.address);
    if (!key) continue;
    const existingId =
      (stop.addressId && byId.has(stop.addressId) ? stop.addressId : null) ||
      normToId.get(key);
    if (existingId) {
      const existing = byId.get(existingId)!;
      if (stop.lat != null && stop.lng != null) {
        existing.lat = stop.lat;
        existing.lng = stop.lng;
      }
      if (isAutoStopLabel(existing.label) && stop.label) {
        existing.label = cleanNickname(stop.label, stop.address);
      }
      if (stop.complement?.trim() && !existing.complement?.trim()) {
        existing.complement = stop.complement.trim();
      }
      if (stop.hours?.length && !existing.hours?.length) {
        existing.hours = normalizeHoursPeriods(stop.hours);
      }
      continue;
    }
    const id = stop.addressId || createId();
    const saved: SavedAddress = {
      id,
      label: cleanNickname(stop.label, stop.address),
      address: stop.address,
      complement: stop.complement?.trim() || "",
      hours: stop.hours?.length
        ? normalizeHoursPeriods(stop.hours)
        : cloneDefaultHours(),
      lat: stop.lat,
      lng: stop.lng,
      active: true,
      createdAt: new Date().toISOString(),
    };
    byId.set(id, saved);
    normToId.set(key, id);
  }

  return { ...data, addresses: [...byId.values()] };
}

export function upsertSavedAddress(
  addresses: SavedAddress[],
  input: {
    id?: string;
    label?: string;
    address: string;
    complement?: string;
    hours?: SavedAddress["hours"];
    lat?: number | null;
    lng?: number | null;
  },
): SavedAddress[] {
  const key = normalizeAddress(input.address);
  const idx = addresses.findIndex(
    (a) =>
      normalizeAddress(a.address) === key || (input.id && a.id === input.id),
  );
  const incoming = cleanNickname(input.label, input.address);
  const prev = addresses[idx];
  const next: SavedAddress = {
    id: input.id || prev?.id || createId(),
    label: !isAutoStopLabel(incoming)
      ? incoming
      : cleanNickname(prev?.label, input.address),
    address: input.address.trim(),
    complement:
      input.complement !== undefined
        ? input.complement.trim()
        : prev?.complement || "",
    hours:
      input.hours !== undefined
        ? normalizeHoursPeriods(input.hours)
        : prev?.hours?.length
          ? normalizeHoursPeriods(prev.hours)
          : cloneDefaultHours(),
    lat: input.lat ?? prev?.lat ?? null,
    lng: input.lng ?? prev?.lng ?? null,
    active: prev?.active !== false,
    createdAt: prev?.createdAt || new Date().toISOString(),
  };
  if (idx >= 0) {
    const copy = [...addresses];
    copy[idx] = next;
    return copy;
  }
  return [...addresses, next];
}

/** Seed da semana atual a partir dos templates antigos (só se não houver date_routes). */
function seedWeekFromLegacy(
  data: AppData,
  legacy: Partial<Record<Weekday, DayRoute>>,
): AppData {
  if (Object.keys(data.routesByDate).length > 0) return data;
  const today = new Date();
  const routesByDate = { ...data.routesByDate };

  for (let offset = -6; offset <= 7; offset++) {
    const d = new Date(today);
    d.setDate(today.getDate() + offset);
    const key = localDateKey(d);
    const wd = weekdayFromDateKey(key);
    const src = legacy[wd];
    if (!src?.stops.length && !src?.startAddress) continue;
    routesByDate[key] = {
      ...src,
      date: key,
    };
  }

  return { ...data, routesByDate };
}

export async function loadData(): Promise<AppData> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase não configurado. Configure as variáveis no Vercel.",
    );
  }

  const sb = getSupabase();
  const [
    motoboysRes,
    legacyRes,
    dateRoutesRes,
    cacheRes,
    addressesRes,
    settingsRes,
    financeRes,
  ] = await Promise.all([
    sb.from("motoboys").select("*").order("created_at"),
    sb.from("day_routes").select("*"),
    sb.from("date_routes").select("*"),
    sb.from("coord_cache").select("address_key,lat,lng"),
    sb.from("addresses").select("*").order("created_at"),
    sb.from("app_settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("finance_entries").select("*").order("created_at"),
  ]);

  if (motoboysRes.error) throw new Error(motoboysRes.error.message);
  if (legacyRes.error) throw new Error(legacyRes.error.message);
  if (cacheRes.error) throw new Error(cacheRes.error.message);

  const data = blankData();
  data.motoboys = ((motoboysRes.data || []) as {
    id: string;
    name: string;
    phone?: string | null;
    company?: string | null;
    price_per_km?: number | null;
    email?: string | null;
    username?: string | null;
    user_id?: string | null;
    password_set?: boolean | null;
    pay_day_preference?: string | null;
    pay_method_preference?: string | null;
    pix_key?: string | null;
  }[]).map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone?.trim() || undefined,
    company: row.company?.trim() || undefined,
    pricePerKm:
      row.price_per_km != null && Number(row.price_per_km) > 0
        ? Number(row.price_per_km)
        : undefined,
    email: row.email?.trim() || undefined,
    username: row.username?.trim() || undefined,
    userId: row.user_id || undefined,
    passwordSet: Boolean(row.password_set),
    payDayPreference:
      (row.pay_day_preference as Motoboy["payDayPreference"]) || "end_of_route",
    payMethodPreference:
      (row.pay_method_preference as Motoboy["payMethodPreference"]) || "pix",
    pixKey: row.pix_key?.trim() || undefined,
  }));

  if (!settingsRes.error && settingsRes.data) {
    const row = settingsRes.data as SettingsRow;
    if (row.price_per_km != null && Number(row.price_per_km) > 0) {
      data.pricePerKm = Number(row.price_per_km);
    }
    if (row.preset_start_address?.trim()) {
      data.presetStartAddress = row.preset_start_address.trim();
      data.presetStartLat = row.preset_start_lat ?? null;
      data.presetStartLng = row.preset_start_lng ?? null;
    }
  }

  if (!addressesRes.error && addressesRes.data) {
    data.addresses = (addressesRes.data as AddressRow[]).map((row) => ({
      id: row.id,
      label: row.label || row.address.split(",")[0].trim(),
      address: row.address,
      complement: row.complement?.trim() || "",
      hours: normalizeHoursPeriods(row.hours),
      lat: row.lat,
      lng: row.lng,
      active: row.active !== false,
      createdAt: row.created_at || undefined,
    }));
  } else if (addressesRes.error) {
    // Fallback se select * falhar por coluna nova / tabela antiga
    const legacyAddr = await sb
      .from("addresses")
      .select("id,label,address,lat,lng,created_at")
      .order("created_at");
    if (legacyAddr.error) {
      const hint = /Could not find the table|does not exist|schema cache/i.test(
        addressesRes.error.message,
      )
        ? " Rode no Supabase SQL Editor: supabase/migration_addresses_catalog.sql"
        : "";
      throw new Error(
        `Falha ao carregar endereços: ${addressesRes.error.message}.${hint}`,
      );
    }
    data.addresses = (legacyAddr.data as AddressRow[]).map((row) => ({
      id: row.id,
      label: row.label || row.address.split(",")[0].trim(),
      address: row.address,
      complement: "",
      hours: cloneDefaultHours(),
      lat: row.lat,
      lng: row.lng,
      active: true,
      createdAt: row.created_at || undefined,
    }));
  }

  const legacy: Partial<Record<Weekday, DayRoute>> = {};
  for (const row of (legacyRes.data || []) as LegacyDayRouteRow[]) {
    legacy[row.day] = {
      date: row.day,
      startAddress: row.start_address || "",
      startLat: row.start_lat,
      startLng: row.start_lng,
      motoboyId: row.motoboy_id,
      stops: mapStops(row.stops),
      totalKm: Number(row.total_km || 0),
      returnToStart: Boolean(row.return_to_start),
      optimizedAt: row.optimized_at,
    };
  }
  data.weekdayLegacy = legacy;

  if (!data.presetStartAddress?.trim() || data.presetStartAddress === FALLBACK_START_ADDRESS) {
    const sun = legacy.dom;
    if (sun?.startAddress?.trim()) {
      data.presetStartAddress = sun.startAddress.trim();
      data.presetStartLat = sun.startLat;
      data.presetStartLng = sun.startLng;
    }
  }

  if (!dateRoutesRes.error && dateRoutesRes.data) {
    for (const row of dateRoutesRes.data as DateRouteRow[]) {
      const mapped = mapDateRoute(row);
      data.routesByDate[mapped.date] = mapped;
    }
  } else if (dateRoutesRes.error) {
    console.warn("date_routes:", dateRoutesRes.error.message);
  }

  const seeded = seedWeekFromLegacy(data, legacy);

  if (!financeRes.error && financeRes.data) {
    seeded.finance = (financeRes.data as FinanceRow[]).map((row) => {
      const desc = row.description || undefined;
      const source: FinanceEntry["source"] =
        row.source === "auto-route" || /^rota automática/i.test(desc || "")
          ? "auto-route"
          : "manual";
      return {
        id: row.id,
        motoboyId: row.motoboy_id,
        amount: Number(row.amount || 0),
        routeDates: Array.isArray(row.route_dates) ? row.route_dates : [],
        description: desc,
        status: row.status === "paid" ? ("paid" as const) : ("open" as const),
        createdAt: row.created_at,
        source,
        km: row.km != null ? Number(row.km) : undefined,
        paymentMethod: (row.payment_method as FinanceEntry["paymentMethod"]) || undefined,
        paidAt: row.paid_at || null,
      };
    });
  }

  for (const row of (cacheRes.data || []) as CoordRow[]) {
    seeded.coordCache[row.address_key] = { lat: row.lat, lng: row.lng };
  }

  const withCatalog = syncCatalogFromRoutes(seeded);

  // Se rotas tinham paradas que não estavam no catálogo (ex.: tabela recriada
  // vazia), grava de volta sem apagar nada — recuperação automática.
  const recovered = withCatalog.addresses.filter(
    (a) => !seeded.addresses.some((b) => b.id === a.id),
  );
  if (recovered.length) {
    try {
      await upsertAddressesOnly(recovered);
    } catch (err) {
      console.warn(
        "Recuperação de endereços a partir das rotas falhou:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return withCatalog;
}

async function upsertAddressesOnly(addresses: SavedAddress[]): Promise<void> {
  if (!addresses.length) return;
  const sb = getSupabase();
  const rows = addresses.map((a) => ({
    id: a.id,
    label: a.label,
    address: a.address,
    complement: a.complement?.trim() || "",
    hours: normalizeHoursPeriods(a.hours),
    lat: a.lat,
    lng: a.lng,
    active: a.active !== false,
  }));
  let up = await sb.from("addresses").upsert(rows);
  if (up.error && /active|complement|hours|column/i.test(up.error.message)) {
    up = await sb.from("addresses").upsert(
      rows.map(({ active: _a, complement, hours, ...rest }) => ({
        ...rest,
        complement,
        hours,
      })),
    );
  }
  if (up.error && /complement|hours|column/i.test(up.error.message)) {
    up = await sb.from("addresses").upsert(
      rows.map(({ id, label, address, lat, lng }) => ({
        id,
        label,
        address,
        lat,
        lng,
      })),
    );
  }
  if (up.error && /duplicate|unique|addresses_address/i.test(up.error.message)) {
    // Índice único antigo: tenta um a um para não perder o lote inteiro
    for (const row of rows) {
      const one = await sb.from("addresses").upsert({
        id: row.id,
        label: row.label,
        address: row.address,
        lat: row.lat,
        lng: row.lng,
      });
      if (one.error && !/duplicate|unique/i.test(one.error.message)) {
        console.warn("address upsert:", one.error.message, row.address);
      }
    }
    return;
  }
  if (up.error) throw new Error(up.error.message);
}

/** Remoção explícita — nunca apagar por “sumiu do estado do browser”. */
export async function deleteSavedAddress(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("addresses").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteMotoboyRow(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("motoboys").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteFinanceRows(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const sb = getSupabase();
  const { error } = await sb.from("finance_entries").delete().in("id", ids);
  if (error) throw new Error(error.message);
}

export async function deleteDateRoute(routeDate: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("date_routes")
    .delete()
    .eq("route_date", routeDate);
  if (error) throw new Error(error.message);
}

export async function saveData(data: AppData): Promise<void> {
  const sb = getSupabase();
  const synced = syncCatalogFromRoutes(data);

  // Upsert-only: NÃO apagar linhas ausentes no cliente.
  // Deploy / aba antiga / carga parcial não podem limpar o banco.
  if (synced.motoboys.length) {
    const fullRows = synced.motoboys.map((m) => ({
      id: m.id,
      name: m.name,
      phone: m.phone ?? null,
      company: m.company?.trim() || null,
      price_per_km:
        m.pricePerKm != null && m.pricePerKm > 0 ? m.pricePerKm : null,
      email: m.email?.trim().toLowerCase() || null,
      username: m.username?.trim().toLowerCase() || null,
      user_id: m.userId || null,
      password_set: Boolean(m.passwordSet),
      pay_day_preference: m.payDayPreference || "end_of_route",
      pay_method_preference: m.payMethodPreference || "pix",
      pix_key: m.pixKey?.trim() || null,
    }));
    const up = await sb.from("motoboys").upsert(fullRows);
    if (up.error) {
      if (/email|username|pay_day|pay_method|pix_key|password_set|user_id|column/i.test(up.error.message)) {
        const mid = await sb.from("motoboys").upsert(
          synced.motoboys.map((m) => ({
            id: m.id,
            name: m.name,
            phone: m.phone ?? null,
            company: m.company?.trim() || null,
            price_per_km:
              m.pricePerKm != null && m.pricePerKm > 0 ? m.pricePerKm : null,
          })),
        );
        if (mid.error && /company|price_per_km|column/i.test(mid.error.message)) {
          const fallback = await sb.from("motoboys").upsert(
            synced.motoboys.map((m) => ({
              id: m.id,
              name: m.name,
              phone: m.phone ?? null,
            })),
          );
          if (fallback.error) throw new Error(fallback.error.message);
          console.warn(
            "Rode supabase/migration_motoboy_accounts.sql para contas e preferências.",
          );
        } else if (mid.error) {
          throw new Error(mid.error.message);
        } else {
          console.warn(
            "Rode supabase/migration_motoboy_accounts.sql para contas e preferências.",
          );
        }
      } else {
        throw new Error(up.error.message);
      }
    }
  }

  if (synced.addresses.length) {
    try {
      await upsertAddressesOnly(synced.addresses);
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  const dateRows = Object.values(synced.routesByDate).map((r) => ({
    route_date: r.date,
    start_address: r.startAddress,
    start_lat: r.startLat,
    start_lng: r.startLng,
    motoboy_id: r.motoboyId,
    stops: r.stops,
    total_km: r.totalKm,
    return_to_start: r.returnToStart,
    optimized_at: r.optimizedAt,
    completion_status: r.completionStatus || "open",
    motoboy_report: r.motoboyReport || null,
    motoboy_completed_at: r.motoboyCompletedAt || null,
    motoboy_completed_by: r.motoboyCompletedBy || null,
    admin_report: r.adminReport || null,
    admin_verified_at: r.adminVerifiedAt || null,
    admin_verified_by: r.adminVerifiedBy || null,
  }));

  // Rotas: só upsert. Limpar um dia chama deleteDateRoute() explicitamente.
  if (dateRows.length) {
    let dateUp = await sb.from("date_routes").upsert(dateRows);
    if (
      dateUp.error &&
      /completion_status|motoboy_report|admin_report|column/i.test(
        dateUp.error.message,
      )
    ) {
      console.warn(
        "Rode supabase/migration_route_completion.sql para salvar conclusão/relatórios.",
      );
      dateUp = await sb.from("date_routes").upsert(
        dateRows.map(
          ({
            completion_status: _c,
            motoboy_report: _mr,
            motoboy_completed_at: _mca,
            motoboy_completed_by: _mcb,
            admin_report: _ar,
            admin_verified_at: _ava,
            admin_verified_by: _avb,
            ...rest
          }) => rest,
        ),
      );
    }
    if (dateUp.error && /does not exist|relation|return_to_start/i.test(dateUp.error.message)) {
      if (/return_to_start/i.test(dateUp.error.message)) {
        dateUp = await sb.from("date_routes").upsert(
          dateRows.map(
            ({
              return_to_start: _,
              completion_status: _c,
              motoboy_report: _mr,
              motoboy_completed_at: _mca,
              motoboy_completed_by: _mcb,
              admin_report: _ar,
              admin_verified_at: _ava,
              admin_verified_by: _avb,
              ...rest
            }) => rest,
          ),
        );
      }
    }
    if (dateUp.error && !/does not exist|relation/i.test(dateUp.error.message)) {
      throw new Error(dateUp.error.message);
    }
    if (dateUp.error) {
      console.warn("date_routes save:", dateUp.error.message);
    }
  }

  // Templates semanais = espelho das rotas por data (sem manter lixo de dias limpos)
  const byWeekday: Partial<Record<Weekday, DayRoute>> = {};
  for (const r of Object.values(synced.routesByDate)) {
    const wd = weekdayFromDateKey(r.date);
    const prev = byWeekday[wd];
    if (!prev || r.date >= (prev.date || "")) byWeekday[wd] = r;
  }
  const legacyRows = WEEKDAYS.map((d) => {
    const r = byWeekday[d.id] || emptyRoute(d.id);
    return {
      day: d.id,
      start_address: r.startAddress,
      start_lat: r.startLat,
      start_lng: r.startLng,
      motoboy_id: r.motoboyId,
      stops: r.stops,
      total_km: r.totalKm,
      return_to_start: r.returnToStart,
      optimized_at: r.optimizedAt,
    };
  });
  let legacyUp = await sb.from("day_routes").upsert(legacyRows);
  if (legacyUp.error && /return_to_start/i.test(legacyUp.error.message)) {
    legacyUp = await sb.from("day_routes").upsert(
      legacyRows.map(({ return_to_start: _, ...rest }) => rest),
    );
  }
  if (legacyUp.error) throw new Error(legacyUp.error.message);

  const settingsPayload = {
    id: 1,
    price_per_km: synced.pricePerKm,
    preset_start_address: synced.presetStartAddress,
    preset_start_lat: synced.presetStartLat,
    preset_start_lng: synced.presetStartLng,
  };
  let settingsUp = await sb.from("app_settings").upsert(settingsPayload);
  if (settingsUp.error && /preset_start/i.test(settingsUp.error.message)) {
    settingsUp = await sb.from("app_settings").upsert({
      id: 1,
      price_per_km: synced.pricePerKm,
    });
  }
  if (
    settingsUp.error &&
    !/does not exist|relation/i.test(settingsUp.error.message)
  ) {
    console.warn("app_settings save:", settingsUp.error.message);
  }

  if (synced.finance.length) {
    const rows = synced.finance.map((f) => ({
      id: f.id,
      motoboy_id: f.motoboyId,
      amount: f.amount,
      route_dates: f.routeDates,
      description: f.description ?? null,
      status: f.status,
      created_at: f.createdAt,
      source: f.source ?? "manual",
      km: f.km ?? null,
      payment_method: f.paymentMethod ?? null,
      paid_at: f.paidAt ?? null,
    }));
    let finUp = await sb.from("finance_entries").upsert(rows);
    if (finUp.error && /payment_method|paid_at|column/i.test(finUp.error.message)) {
      finUp = await sb.from("finance_entries").upsert(
        rows.map(({ payment_method: _p, paid_at: _a, ...rest }) => rest),
      );
      console.warn(
        "Rode supabase/migration_motoboy_accounts.sql para formas de pagamento.",
      );
    }
    if (finUp.error && /source|column|km/i.test(finUp.error.message)) {
      finUp = await sb.from("finance_entries").upsert(
        rows.map(
          ({
            source: _s,
            km: _k,
            payment_method: _p,
            paid_at: _a,
            ...rest
          }) => rest,
        ),
      );
    }
    if (finUp.error) throw new Error(finUp.error.message);
  }

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

export type { FinanceEntry };
