import type { LatLng } from "./geo";

export function googleMapsDirectionsUrl(
  start: string | LatLng,
  stops: (string | LatLng)[],
  options?: { returnToStart?: boolean },
): string {
  const origin = encodePoint(start);
  const returnToStart = Boolean(options?.returnToStart);

  let destination: string;
  let waypoints: string;

  if (returnToStart) {
    destination = origin;
    waypoints = stops.map(encodePoint).filter(Boolean).join("|");
  } else if (stops.length) {
    destination = encodePoint(stops[stops.length - 1]);
    waypoints = stops
      .slice(0, -1)
      .map(encodePoint)
      .filter(Boolean)
      .join("|");
  } else {
    destination = origin;
    waypoints = "";
  }

  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Abre o Google Maps navegando até o ponto (origem = localização atual). */
export function googleMapsNavigateToUrl(point: string | LatLng): string {
  const params = new URLSearchParams({
    api: "1",
    destination: encodePoint(point),
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Mostra o lugar no mapa (sem iniciar navegação). */
export function googleMapsPlaceUrl(point: string | LatLng): string {
  const params = new URLSearchParams({
    api: "1",
    query: encodePoint(point),
  });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export function wazeNavigateUrl(point: string | LatLng): string {
  if (typeof point === "string") {
    return `https://waze.com/ul?q=${encodeURIComponent(point.trim())}&navigate=yes`;
  }
  return `https://waze.com/ul?ll=${point.lat}%2C${point.lng}&navigate=yes`;
}

function encodePoint(point: string | LatLng): string {
  if (typeof point === "string") return point.trim();
  return `${point.lat},${point.lng}`;
}

export function looksLikeMapsUrl(s: string): boolean {
  return /(?:https?:\/\/)?(?:www\.)?(?:google\.[^/\s]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(
    s.trim(),
  );
}

/** Monta texto de busca no padrão BR: Rua, nº - Cidade. */
export function buildAddressQuery(parts: {
  street: string;
  number?: string;
  city?: string;
}): string {
  const street = parts.street.trim();
  const number = (parts.number || "").trim();
  const city = (parts.city || "").trim();
  if (!street && !number) return "";
  const line = number ? `${street || "Endereço"}, ${number}` : street;
  if (city) return `${line}, ${city}, Brasil`;
  return `${line}, Brasil`;
}

/** Garante que o número do lugar apareça no endereço salvo. */
export function applyHouseNumber(
  formatted: string,
  number: string,
): string {
  const n = number.trim();
  if (!n) return formatted;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(,\\s*|\\s+)${escaped}\\b`, "i").test(formatted)) {
    return formatted;
  }
  const parts = formatted.split(",").map((p) => p.trim());
  if (!parts.length) return `${formatted}, ${n}`;
  return [parts[0], n, ...parts.slice(1)].join(", ");
}

export function pointFromCoords(
  lat: number | null | undefined,
  lng: number | null | undefined,
  fallback: string,
): string | LatLng {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return fallback;
}
