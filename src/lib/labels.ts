import { normalizeAddress } from "./parseAddress";
import type { AppData, Motoboy } from "./types";
import { DEFAULT_PRICE_PER_KM, FALLBACK_START_ADDRESS } from "./types";

export function resolvePresetStart(data: AppData): {
  address: string;
  lat: number | null;
  lng: number | null;
} {
  if (data.presetStartAddress?.trim()) {
    return {
      address: data.presetStartAddress.trim(),
      lat: data.presetStartLat,
      lng: data.presetStartLng,
    };
  }

  const sundays = Object.values(data.routesByDate)
    .filter((r) => r.startAddress.trim())
    .filter((r) => {
      const [y, m, d] = r.date.split("-").map(Number);
      return new Date(y, m - 1, d).getDay() === 0;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  if (sundays[0]) {
    return {
      address: sundays[0].startAddress.trim(),
      lat: sundays[0].startLat,
      lng: sundays[0].startLng,
    };
  }

  const legacy = data.weekdayLegacy.dom;
  if (legacy?.startAddress?.trim()) {
    return {
      address: legacy.startAddress.trim(),
      lat: legacy.startLat,
      lng: legacy.startLng,
    };
  }

  const cached = data.coordCache[normalizeAddress(FALLBACK_START_ADDRESS)];
  return {
    address: FALLBACK_START_ADDRESS,
    lat: cached?.lat ?? null,
    lng: cached?.lng ?? null,
  };
}

export function isPresetStart(address: string, data: AppData): boolean {
  return (
    normalizeAddress(address) ===
    normalizeAddress(resolvePresetStart(data).address)
  );
}

export function isAutoStopLabel(label?: string | null): boolean {
  return !label?.trim() || /^parada\s*\d+$/i.test(label.trim());
}

export function cleanNickname(
  label?: string | null,
  address?: string,
): string {
  const t = (label || "").trim();
  if (!t || isAutoStopLabel(t)) {
    return address?.split(",")[0].trim() || "Endereço";
  }
  return t;
}

export function motoboyStopTitle(
  index: number,
  label?: string | null,
  address?: string,
): string {
  return `Parada ${index + 1} - ${cleanNickname(label, address)}`;
}

export function formatMoneyBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Valor/km do motoboy; fallback só se o perfil não tiver preço. */
export function resolveMotoboyPricePerKm(
  motoboy: Motoboy | null | undefined,
  fallback: number = DEFAULT_PRICE_PER_KM,
): number {
  if (
    motoboy?.pricePerKm != null &&
    Number.isFinite(motoboy.pricePerKm) &&
    motoboy.pricePerKm > 0
  ) {
    return motoboy.pricePerKm;
  }
  if (Number.isFinite(fallback) && fallback > 0) return fallback;
  return DEFAULT_PRICE_PER_KM;
}

export function stopKindLabel(kind?: string | null): string {
  return kind === "retirada" ? "Retirada" : "Entrega";
}

export function stopKindsLabel(
  kinds?: string[] | null,
  legacyKind?: string | null,
): string {
  const list = (kinds || []).filter(
    (k) => k === "entrega" || k === "retirada",
  );
  let entrega = list.includes("entrega");
  let retirada = list.includes("retirada");

  if (!list.length) {
    const raw = (legacyKind || "").toLowerCase();
    if (raw.includes("entrega") && raw.includes("retirada")) {
      entrega = true;
      retirada = true;
    } else if (raw === "retirada") {
      retirada = true;
    } else {
      entrega = true;
    }
  }

  if (entrega && retirada) return "Entrega e Retirada";
  if (retirada) return "Retirada";
  return "Entrega";
}
