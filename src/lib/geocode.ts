import type { LatLng } from "./geo";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

export async function geocodeAddress(
  address: string,
): Promise<LatLng | null> {
  const q = address.trim();
  if (!q) return null;

  const url = new URL(NOMINATIM);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) throw new Error(`Geocoding falhou (${res.status})`);
  const data = (await res.json()) as { lat: string; lon: string }[];
  if (!data.length) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
}

/** Geocode sequentially to respect Nominatim usage policy. */
export async function geocodeMany(
  addresses: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<(LatLng | null)[]> {
  const out: (LatLng | null)[] = [];
  for (let i = 0; i < addresses.length; i++) {
    out.push(await geocodeAddress(addresses[i]));
    onProgress?.(i + 1, addresses.length);
    if (i < addresses.length - 1) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }
  return out;
}
