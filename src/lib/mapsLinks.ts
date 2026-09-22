import type { LatLng } from "./geo";

export function googleMapsDirectionsUrl(
  start: string | LatLng,
  stops: (string | LatLng)[],
): string {
  const origin = encodePoint(start);
  const destination = stops.length
    ? encodePoint(stops[stops.length - 1])
    : origin;
  const waypoints = stops
    .slice(0, -1)
    .map(encodePoint)
    .filter(Boolean)
    .join("|");

  // Prefer query form for multi-stop reliability
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function wazeNavigateUrl(point: string | LatLng): string {
  if (typeof point === "string") {
    return `https://waze.com/ul?q=${encodeURIComponent(point)}&navigate=yes`;
  }
  return `https://waze.com/ul?ll=${point.lat},${point.lng}&navigate=yes`;
}

export function wazeMultiStopUrls(
  stops: (string | LatLng)[],
): { label: string; url: string }[] {
  return stops.map((stop, i) => ({
    label: `Parada ${i + 1}`,
    url: wazeNavigateUrl(stop),
  }));
}

function encodePoint(point: string | LatLng): string {
  if (typeof point === "string") return point.trim();
  return `${point.lat},${point.lng}`;
}
