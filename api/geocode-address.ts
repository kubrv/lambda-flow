import type { VercelRequest, VercelResponse } from "@vercel/node";

type GeocodeSuggestion = {
  formattedAddress: string;
  lat: number;
  lng: number;
};

type GeocodeOk = {
  ok: true;
  automatable: true;
  input: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  provider: "openstreetmap";
  fromMapsLink?: boolean;
  /** Alternativas para o usuário escolher (inclui a principal). */
  suggestions?: GeocodeSuggestion[];
};

type GeocodeFail = {
  ok: false;
  automatable: false;
  input: string;
  error: string;
  provider?: string;
};

const UA = "lambda-flow/1.3 (motoboy route planner; contact: vercel.app)";

function looksLikeMapsUrl(s: string): boolean {
  return /(?:https?:\/\/)?(?:www\.)?(?:google\.[^/\s]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(
    s.trim(),
  );
}

function ensureHttp(url: string): string {
  const t = url.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function decodePathSegment(seg: string): string {
  try {
    return decodeURIComponent(seg.replace(/\+/g, " "));
  } catch {
    return seg.replace(/\+/g, " ");
  }
}

/** Último !3d!4d = pin do lugar (mais preciso que o @ do centro do mapa). */
function extractPinCoords(href: string): { lat: number; lng: number } | null {
  const re = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g;
  let m: RegExpExecArray | null;
  let last: { lat: number; lng: number } | null = null;
  while ((m = re.exec(href)) !== null) {
    last = { lat: Number(m[1]), lng: Number(m[2]) };
  }
  return last;
}

function extractAtCoords(href: string): { lat: number; lng: number } | null {
  const at = href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!at) return null;
  return { lat: Number(at[1]), lng: Number(at[2]) };
}

async function expandMapsUrl(url: string): Promise<{ href: string; html: string }> {
  let current = ensureHttp(url);
  let html = "";

  for (let hop = 0; hop < 10; hop++) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });

    const loc = res.headers.get("location");
    if (
      loc &&
      [301, 302, 303, 307, 308].includes(res.status)
    ) {
      current = new URL(loc, current).href;
      continue;
    }

    html = await res.text().catch(() => "");
    const finalUrl = res.url || current;

    // Meta refresh / JS redirect em páginas curtas do goo.gl
    const meta = html.match(
      /content=["']?\d+\s*;\s*url=([^"'>\s]+)/i,
    );
    if (meta?.[1]) {
      current = new URL(meta[1], finalUrl).href;
      continue;
    }

    const canonical =
      html.match(
        /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
      ) ||
      html.match(
        /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,
      );
    if (canonical?.[1] && /google\.[^/]+\/maps/i.test(canonical[1])) {
      current = new URL(canonical[1], finalUrl).href;
      if (current !== finalUrl) continue;
    }

    // Link completo escondido no HTML
    const embedded = html.match(
      /https?:\/\/(?:www\.)?google\.[^"'\\\s]+\/maps\/place\/[^"'\\\s]+/i,
    );
    if (embedded?.[0] && !/\/maps\/place\//i.test(finalUrl)) {
      current = embedded[0].replace(/\\u003d/g, "=").replace(/\\u0026/g, "&");
      continue;
    }

    return { href: finalUrl, html };
  }

  return { href: current, html };
}

export function parseGoogleMapsUrl(
  urlStr: string,
  html = "",
): {
  query?: string;
  placeName?: string;
  lat?: number;
  lng?: number;
} {
  let url: URL;
  try {
    url = new URL(ensureHttp(urlStr));
  } catch {
    return {};
  }

  const href = decodeURIComponent(url.href.replace(/\+/g, "%20"));
  const blob = `${href}\n${html}`;
  const out: {
    query?: string;
    placeName?: string;
    lat?: number;
    lng?: number;
  } = {};

  const pin = extractPinCoords(blob) || extractPinCoords(url.href);
  if (pin) {
    out.lat = pin.lat;
    out.lng = pin.lng;
  } else {
    const at = extractAtCoords(href);
    if (at) {
      out.lat = at.lat;
      out.lng = at.lng;
    }
  }

  // ll= / center=
  for (const key of ["ll", "center", "sll"]) {
    const v = url.searchParams.get(key);
    if (!v) continue;
    const m = v.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (m && out.lat == null) {
      out.lat = Number(m[1]);
      out.lng = Number(m[2]);
    }
  }

  const q =
    url.searchParams.get("q") ||
    url.searchParams.get("query") ||
    url.searchParams.get("destination");
  if (q) {
    const coords = q.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
    if (coords) {
      out.lat = Number(coords[1]);
      out.lng = Number(coords[2]);
    } else {
      out.query = decodePathSegment(q);
    }
  }

  const place = href.match(/\/place\/([^/@]+)/);
  if (place?.[1]) {
    const name = decodePathSegment(place[1]);
    // ignora segmentos que são só IDs
    if (name && !/^0x[0-9a-f]+/i.test(name) && name.length > 2) {
      out.placeName = name;
    }
  }

  // Título da página (útil em short links)
  if (!out.placeName && html) {
    const title =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<title>([^<]+)<\/title>/i);
    if (title?.[1]) {
      const cleaned = title[1]
        .replace(/\s*[-–|]\s*Google\s*Maps.*$/i, "")
        .replace(/\s*-\s*Maps.*$/i, "")
        .trim();
      if (cleaned.length > 2) out.placeName = cleaned;
    }
  }

  const search = href.match(/\/search\/([^/@?]+)/);
  if (search?.[1] && !out.query) {
    out.query = decodePathSegment(search[1]);
  }

  return out;
}

function cityFromDisplayName(displayName: string): string {
  // "Rua X, 10 - Bairro, Cidade - SP, 00000-000, Brasil"
  const parts = displayName.split(",").map((p) => p.trim());
  if (parts.length >= 3) {
    return parts.slice(-4, -1).join(", ");
  }
  return "";
}

type NominatimHit = {
  lat: number;
  lng: number;
  displayName: string;
};

function dedupeHits(hits: NominatimHit[]): NominatimHit[] {
  const seen = new Set<string>();
  const out: NominatimHit[] = [];
  for (const h of hits) {
    const key = `${h.lat.toFixed(5)},${h.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

async function nominatimSearchMany(
  q: string,
  limit = 8,
): Promise<NominatimHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    lat: string;
    lon: string;
    display_name: string;
  }[];
  return dedupeHits(
    data.map((row) => ({
      lat: Number(row.lat),
      lng: Number(row.lon),
      displayName: row.display_name,
    })),
  );
}

async function nominatimReverse(
  lat: number,
  lng: number,
): Promise<{ displayName: string; address?: Record<string, string> } | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "18");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    display_name?: string;
    error?: string;
    address?: Record<string, string>;
  };
  if (!data.display_name || data.error) return null;
  return { displayName: data.display_name, address: data.address };
}

/**
 * Link do Maps: prioriza pin (!3d!4d) + nome do lugar.
 * Não troca a coordenada do pin pelo reverse (que “puxa” para a rua mais perto).
 */
async function resolveFromMapsLink(input: string): Promise<{
  lat: number;
  lng: number;
  displayName: string;
  suggestions: NominatimHit[];
} | null> {
  const { href, html } = await expandMapsUrl(input);
  const parsed = parseGoogleMapsUrl(href, html);

  const hasPin =
    parsed.lat != null &&
    parsed.lng != null &&
    Number.isFinite(parsed.lat) &&
    Number.isFinite(parsed.lng);

  const label = (parsed.placeName || parsed.query || "").trim();

  if (hasPin) {
    const lat = parsed.lat!;
    const lng = parsed.lng!;

    // Nome do Google + cidade do reverse (coordenada fica a do pin)
    if (label) {
      let suffix = "";
      try {
        const rev = await nominatimReverse(lat, lng);
        if (rev?.address) {
          const city =
            rev.address.city ||
            rev.address.town ||
            rev.address.municipality ||
            rev.address.village ||
            "";
          const state = rev.address.state || "";
          const road = rev.address.road || "";
          const house = rev.address.house_number || "";
          const street =
            road && house ? `${road}, ${house}` : road || "";
          const bits = [street, city, state].filter(Boolean);
          if (bits.length) suffix = bits.join(" - ");
        } else if (rev?.displayName) {
          suffix = cityFromDisplayName(rev.displayName);
        }
      } catch {
        // ignore
      }

      const displayName = suffix
        ? `${label} · ${suffix}`
        : label;

      const primary = { lat, lng, displayName };
      return { ...primary, suggestions: [primary] };
    }

    // Só pin: reverse para endereço, mas mantém lat/lng do link
    const rev = await nominatimReverse(lat, lng);
    const primary = {
      lat,
      lng,
      displayName:
        rev?.displayName ||
        `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    };
    return { ...primary, suggestions: [primary] };
  }

  // Sem pin: busca pelo nome do lugar (várias opções)
  const textQueries = [parsed.placeName, parsed.query].filter(
    (x): x is string => Boolean(x?.trim()),
  );
  let all: NominatimHit[] = [];
  for (let i = 0; i < textQueries.length; i++) {
    const q = textQueries[i];
    const variants = [
      q,
      `${q}, Brasil`,
      `${q}, São Paulo, Brasil`,
    ];
    for (let j = 0; j < variants.length; j++) {
      if (i > 0 || j > 0) await new Promise((r) => setTimeout(r, 1100));
      const hits = await nominatimSearchMany(variants[j], 8);
      if (hits.length) {
        all = dedupeHits([...all, ...hits]);
        if (all.length >= 5) break;
      }
    }
    if (all.length >= 5) break;
  }

  if (!all.length) return null;

  const mapped = all.slice(0, 8).map((hit) => ({
    lat: hit.lat,
    lng: hit.lng,
    displayName: label
      ? `${label} · ${cityFromDisplayName(hit.displayName) || hit.displayName}`
      : hit.displayName,
  }));

  return {
    lat: mapped[0].lat,
    lng: mapped[0].lng,
    displayName: mapped[0].displayName,
    suggestions: mapped,
  };
}

async function resolvePlainAddress(input: string): Promise<{
  lat: number;
  lng: number;
  displayName: string;
  suggestions: NominatimHit[];
} | null> {
  const queries = [
    input,
    /brasil|brazil|\bbr\b/i.test(input) ? input : `${input}, Brasil`,
    /são paulo|sao paulo|\bsp\b/i.test(input)
      ? input
      : `${input}, São Paulo, Brasil`,
  ];
  const unique = [...new Set(queries)];

  let all: NominatimHit[] = [];
  for (let i = 0; i < unique.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1100));
    const hits = await nominatimSearchMany(unique[i], 8);
    if (hits.length) {
      all = dedupeHits([...all, ...hits]);
      // Já temos opções suficientes — não precisa esgotar todos os sufixos
      if (all.length >= 5) break;
    }
  }

  if (!all.length) return null;
  const top = all[0];
  return {
    lat: top.lat,
    lng: top.lng,
    displayName: top.displayName,
    suggestions: all.slice(0, 8),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      automatable: false,
      input: "",
      error: "Use POST",
    } satisfies GeocodeFail);
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as {
    address?: string;
  };
  const input = (body.address || "").trim();
  if (!input) {
    return res.status(400).json({
      ok: false,
      automatable: false,
      input: "",
      error: "Informe o endereço ou cole um link do Google Maps.",
    } satisfies GeocodeFail);
  }

  try {
    const fromLink = looksLikeMapsUrl(input);
    if (fromLink) {
      const hit = await resolveFromMapsLink(input);
      if (!hit) {
        return res.status(404).json({
          ok: false,
          automatable: false,
          input,
          error:
            "Não deu para ler o ponto exato deste link. No Google Maps: Compartilhar → Copiar link (não o link curto se falhar), ou digite o endereço com número.",
          provider: "openstreetmap",
        } satisfies GeocodeFail);
      }
      const suggestions: GeocodeSuggestion[] = hit.suggestions.map((s) => ({
        formattedAddress: s.displayName,
        lat: s.lat,
        lng: s.lng,
      }));
      const payload: GeocodeOk = {
        ok: true,
        automatable: true,
        input,
        formattedAddress: hit.displayName,
        lat: hit.lat,
        lng: hit.lng,
        provider: "openstreetmap",
        fromMapsLink: true,
        suggestions,
      };
      return res.status(200).json(payload);
    }

    const hit = await resolvePlainAddress(input);
    if (!hit) {
      return res.status(404).json({
        ok: false,
        automatable: false,
        input,
        error:
          "Não encontramos este endereço. Use rua + número + cidade, ou cole o link do Maps.",
        provider: "openstreetmap",
      } satisfies GeocodeFail);
    }

    const suggestions: GeocodeSuggestion[] = hit.suggestions.map((s) => ({
      formattedAddress: s.displayName,
      lat: s.lat,
      lng: s.lng,
    }));

    const payload: GeocodeOk = {
      ok: true,
      automatable: true,
      input,
      formattedAddress: hit.displayName,
      lat: hit.lat,
      lng: hit.lng,
      provider: "openstreetmap",
      fromMapsLink: false,
      suggestions,
    };
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(502).json({
      ok: false,
      automatable: false,
      input,
      error:
        err instanceof Error
          ? err.message
          : "Falha ao consultar o serviço de mapa",
      provider: "openstreetmap",
    } satisfies GeocodeFail);
  }
}
