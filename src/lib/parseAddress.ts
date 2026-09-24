export type ParsedPlace = {
  address: string;
  lat: number | null;
  lng: number | null;
};

/** Accepts: "Rua X, 10" or "Rua X, 10 @ -23.55, -46.63" */
export function parsePlaceLine(line: string): ParsedPlace {
  const raw = line.trim();
  const at = raw.lastIndexOf("@");
  if (at === -1) {
    return { address: raw, lat: null, lng: null };
  }

  const address = raw.slice(0, at).trim();
  const coords = raw.slice(at + 1).trim();
  const match = coords.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/,
  );
  if (!match) {
    return { address: raw, lat: null, lng: null };
  }

  return {
    address: address || raw,
    lat: Number(match[1]),
    lng: Number(match[2]),
  };
}

export function parseCoordsInput(value: string): { lat: number; lng: number } | null {
  const match = value
    .trim()
    .match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  return { lat: Number(match[1]), lng: Number(match[2]) };
}

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, " ");
}

export function formatPlaceLine(
  address: string,
  lat: number | null,
  lng: number | null,
): string {
  if (lat != null && lng != null) {
    return `${address} @ ${lat}, ${lng}`;
  }
  return address;
}
