import type { LatLng } from "./geo";
import type { Stop } from "./types";

export type OptimizeResult = {
  ok: true;
  start: LatLng;
  stops: Stop[];
  totalKm: number;
  provider: string;
  usedGoogle?: boolean;
};

export type OptimizeError = {
  ok: false;
  error: string;
};

export async function optimizeRouteApi(input: {
  startAddress: string;
  startLat: number | null;
  startLng: number | null;
  stops: {
    id?: string;
    addressId?: string | null;
    address: string;
    label?: string;
    lat: number | null;
    lng: number | null;
  }[];
}): Promise<OptimizeResult> {
  const res = await fetch("/api/optimize-route", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await res.json()) as OptimizeResult | OptimizeError;
  if (!res.ok || !data.ok) {
    throw new Error(
      !data.ok ? data.error : `Falha ao otimizar rota (${res.status})`,
    );
  }
  return data;
}
