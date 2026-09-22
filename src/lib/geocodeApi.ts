export type GeocodeSuggestion = {
  formattedAddress: string;
  lat: number;
  lng: number;
};

export type GeocodeSuccess = {
  ok: true;
  automatable: true;
  input: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  placeId?: string;
  provider: string;
  fromMapsLink?: boolean;
  suggestions?: GeocodeSuggestion[];
};

export type GeocodeFailure = {
  ok: false;
  automatable: false;
  input: string;
  error: string;
  provider?: string;
};

export type GeocodeResult = GeocodeSuccess | GeocodeFailure;

export async function geocodeAddressApi(
  address: string,
): Promise<GeocodeResult> {
  const res = await fetch("/api/geocode-address", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const data = (await res.json()) as GeocodeResult;
  if (!data || typeof data !== "object") {
    return {
      ok: false,
      automatable: false,
      input: address,
      error: `Falha ao validar endereço (${res.status})`,
    };
  }
  return data;
}

/** Garante lista de opções (pelo menos a principal). */
export function geocodeSuggestions(
  result: GeocodeSuccess,
): GeocodeSuggestion[] {
  if (result.suggestions?.length) return result.suggestions;
  return [
    {
      formattedAddress: result.formattedAddress,
      lat: result.lat,
      lng: result.lng,
    },
  ];
}
