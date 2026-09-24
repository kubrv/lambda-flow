import { useEffect, useRef, useState } from "react";
import {
  geocodeAddressApi,
  geocodeSuggestions,
  type GeocodeResult,
  type GeocodeSuggestion,
} from "../../lib/geocodeApi";
import {
  applyHouseNumber,
  buildAddressQuery,
  googleMapsPlaceUrl,
  looksLikeMapsUrl,
  wazeNavigateUrl,
} from "../../lib/mapsLinks";
import { normalizeAddress } from "../../lib/parseAddress";

export type ResolvedPlace = {
  address: string;
  lat: number;
  lng: number;
};

type InputMode = "typed" | "link";

type VerifyState =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "ok";
      result: Extract<GeocodeResult, { ok: true }>;
      selected: GeocodeSuggestion;
      suggestions: GeocodeSuggestion[];
    }
  | { status: "fail"; error: string };

type Props = {
  idPrefix?: string;
  /** Valor inicial (texto) ao montar / quando a chave muda. */
  initialAddress?: string;
  initialLat?: number | null;
  initialLng?: number | null;
  /** Força reset do formulário (ex.: troca de data). */
  resetKey?: string | number;
  onResolved: (place: ResolvedPlace | null) => void;
};

function toOkState(
  result: Extract<GeocodeResult, { ok: true }>,
  pick?: GeocodeSuggestion,
): Extract<VerifyState, { status: "ok" }> {
  const suggestions = geocodeSuggestions(result);
  const selected =
    pick ||
    suggestions.find(
      (s) =>
        s.lat === result.lat &&
        s.lng === result.lng &&
        s.formattedAddress === result.formattedAddress,
    ) ||
    suggestions[0];
  return { status: "ok", result, selected, suggestions };
}

function finalAddress(
  selected: GeocodeSuggestion,
  houseNumber: string,
  fromLink: boolean,
): string {
  if (fromLink) return selected.formattedAddress;
  return applyHouseNumber(selected.formattedAddress, houseNumber);
}

function splitStoredAddress(address: string): {
  street: string;
  number: string;
  city: string;
} {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { street: address, number: "", city: "São Paulo" };
  const street = parts[0];
  const maybeNum = parts[1] || "";
  const number = /^\d+[A-Za-z\-\/º°]*$/.test(maybeNum) ? maybeNum : "";
  const rest = number ? parts.slice(2) : parts.slice(1);
  const cityGuess =
    rest.find((p) =>
      /são paulo|sao paulo|suzano|mogi|guarulhos|osasco/i.test(p),
    ) ||
    rest.find((p) => !/\d{5}/.test(p) && p.length > 2) ||
    "São Paulo";
  return {
    street,
    number,
    city: cityGuess.replace(/\s*-\s*[A-Z]{2}$/, "").trim(),
  };
}

/**
 * Busca de endereço (digitar / link Maps) igual ao cadastro de endereços,
 * para partida padrão e partida da rota.
 */
export function AddressLookupField({
  idPrefix = "place",
  initialAddress = "",
  initialLat = null,
  initialLng = null,
  resetKey,
  onResolved,
}: Props) {
  const [mode, setMode] = useState<InputMode>("typed");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [city, setCity] = useState("São Paulo");
  const [mapsLink, setMapsLink] = useState("");
  const [verify, setVerify] = useState<VerifyState>({ status: "idle" });
  const timer = useRef<number | null>(null);
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  useEffect(() => {
    const trimmed = initialAddress.trim();
    if (!trimmed) {
      setStreet("");
      setHouseNumber("");
      setCity("São Paulo");
      setMapsLink("");
      setMode("typed");
      setVerify({ status: "idle" });
      onResolvedRef.current(null);
      return;
    }
    const parts = splitStoredAddress(trimmed);
    setStreet(parts.street);
    setHouseNumber(parts.number);
    setCity(parts.city || "São Paulo");
    setMapsLink("");
    setMode("typed");
    if (initialLat != null && initialLng != null) {
      const selected: GeocodeSuggestion = {
        formattedAddress: trimmed,
        lat: initialLat,
        lng: initialLng,
      };
      setVerify({
        status: "ok",
        result: {
          ok: true,
          automatable: true,
          input: trimmed,
          formattedAddress: trimmed,
          lat: initialLat,
          lng: initialLng,
          provider: "preset",
          suggestions: [selected],
        },
        selected,
        suggestions: [selected],
      });
      onResolvedRef.current({
        address: trimmed,
        lat: initialLat,
        lng: initialLng,
      });
    } else {
      setVerify({ status: "idle" });
      void runVerify(buildAddressQuery(parts), setVerify, (ok) => {
        if (ok) {
          const addr = finalAddress(
            ok.selected,
            parts.number,
            Boolean(ok.result.fromMapsLink),
          );
          onResolvedRef.current({
            address: addr,
            lat: ok.selected.lat,
            lng: ok.selected.lng,
          });
        } else {
          onResolvedRef.current(null);
        }
      });
    }
    // Só reinicia quando resetKey muda (troca de data / modo), não a cada digitação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function queryFromTyped(s: string, n: string, c: string): string {
    return buildAddressQuery({ street: s, number: n, city: c });
  }

  function emitFromOk(
    state: Extract<VerifyState, { status: "ok" }>,
    number: string,
  ) {
    const addr = finalAddress(
      state.selected,
      number,
      Boolean(state.result.fromMapsLink),
    );
    onResolved({
      address: addr,
      lat: state.selected.lat,
      lng: state.selected.lng,
    });
  }

  function scheduleTypedVerify(s: string, n: string, c: string) {
    if (timer.current) window.clearTimeout(timer.current);
    const q = queryFromTyped(s, n, c);
    if (q.replace(/Brasil/gi, "").trim().length < 6) {
      setVerify({ status: "idle" });
      onResolved(null);
      return;
    }
    setVerify({ status: "checking" });
    timer.current = window.setTimeout(() => {
      void runVerify(q, setVerify, (ok) => {
        if (ok) emitFromOk(ok, n);
        else onResolved(null);
      });
    }, 700);
  }

  function onStreetPaste(text: string): boolean {
    if (!looksLikeMapsUrl(text)) return false;
    setMode("link");
    setMapsLink(text.trim());
    setVerify({ status: "checking" });
    void runVerify(text.trim(), setVerify, (ok) => {
      if (ok) emitFromOk(ok, houseNumber);
      else onResolved(null);
    });
    return true;
  }

  function pickSuggestion(s: GeocodeSuggestion) {
    if (verify.status !== "ok") return;
    const next = toOkState(verify.result, s);
    setVerify(next);
    emitFromOk(next, houseNumber);
  }

  return (
    <div className="address-lookup">
      <div className="mode-tabs" role="tablist" aria-label="Como informar o endereço">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "typed"}
          className={`mode-tab${mode === "typed" ? " active" : ""}`}
          onClick={() => {
            setMode("typed");
            setVerify({ status: "idle" });
            onResolved(null);
          }}
        >
          Digitar endereço
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "link"}
          className={`mode-tab${mode === "link" ? " active" : ""}`}
          onClick={() => {
            setMode("link");
            setVerify({ status: "idle" });
            onResolved(null);
          }}
        >
          Link do Google Maps
        </button>
      </div>

      {mode === "typed" ? (
        <div className="addr-typed-grid">
          <div className="field addr-street">
            <label htmlFor={`${idPrefix}-street`}>Rua ou nome do lugar</label>
            <input
              id={`${idPrefix}-street`}
              value={street}
              onChange={(e) => {
                const v = e.target.value;
                if (onStreetPaste(v)) return;
                setStreet(v);
                scheduleTypedVerify(v, houseNumber, city);
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (looksLikeMapsUrl(text)) {
                  e.preventDefault();
                  onStreetPaste(text);
                }
              }}
              placeholder="Ex: Av. Brasil ou Clínica XYZ"
              autoComplete="street-address"
            />
          </div>
          <div className="field addr-number">
            <label htmlFor={`${idPrefix}-n`}>Número</label>
            <input
              id={`${idPrefix}-n`}
              value={houseNumber}
              onChange={(e) => {
                const v = e.target.value;
                setHouseNumber(v);
                scheduleTypedVerify(street, v, city);
              }}
              placeholder="123"
              inputMode="numeric"
            />
          </div>
          <div className="field addr-city">
            <label htmlFor={`${idPrefix}-city`}>Cidade</label>
            <input
              id={`${idPrefix}-city`}
              value={city}
              onChange={(e) => {
                const v = e.target.value;
                setCity(v);
                scheduleTypedVerify(street, houseNumber, v);
              }}
              placeholder="São Paulo"
            />
          </div>
        </div>
      ) : (
        <div className="field">
          <label htmlFor={`${idPrefix}-link`}>Link do Google Maps</label>
          <input
            id={`${idPrefix}-link`}
            value={mapsLink}
            onChange={(e) => {
              const v = e.target.value;
              setMapsLink(v);
              if (timer.current) window.clearTimeout(timer.current);
              if (!v.trim()) {
                setVerify({ status: "idle" });
                onResolved(null);
                return;
              }
              setVerify({ status: "checking" });
              timer.current = window.setTimeout(() => {
                void runVerify(v.trim(), setVerify, (ok) => {
                  if (ok) emitFromOk(ok, houseNumber);
                  else onResolved(null);
                });
              }, 500);
            }}
            placeholder="Cole o link ou compartilhar do Maps"
          />
        </div>
      )}

      <GeoSuggestPanel
        state={verify}
        houseNumber={houseNumber}
        onSelect={pickSuggestion}
      />
    </div>
  );
}

async function runVerify(
  value: string,
  setState: (s: VerifyState) => void,
  onDone?: (ok: Extract<VerifyState, { status: "ok" }> | null) => void,
) {
  const trimmed = value.trim();
  if (!trimmed) {
    setState({ status: "idle" });
    onDone?.(null);
    return;
  }
  setState({ status: "checking" });
  try {
    const result = await geocodeAddressApi(trimmed);
    if (result.ok && result.automatable) {
      const ok = toOkState(result);
      setState(ok);
      onDone?.(ok);
    } else {
      setState({
        status: "fail",
        error: !result.ok
          ? result.error
          : "Endereço não pode ser automatizado no mapa.",
      });
      onDone?.(null);
    }
  } catch (err) {
    setState({
      status: "fail",
      error:
        err instanceof Error
          ? err.message
          : "Falha ao consultar o serviço de mapa.",
    });
    onDone?.(null);
  }
}

function GeoSuggestPanel({
  state,
  houseNumber,
  onSelect,
}: {
  state: VerifyState;
  houseNumber: string;
  onSelect: (s: GeocodeSuggestion) => void;
}) {
  if (state.status === "idle") return null;
  if (state.status === "checking") {
    return <p className="hint geo-check">Localizando no mapa…</p>;
  }
  if (state.status === "ok") {
    const multi = state.suggestions.length > 1;
    const display = finalAddress(
      state.selected,
      houseNumber,
      Boolean(state.result.fromMapsLink),
    );
    const point = { lat: state.selected.lat, lng: state.selected.lng };
    return (
      <div className="geo-suggest">
        <div className="geo-banner ok">
          <strong>
            {state.result.fromMapsLink
              ? "Pin do link (ponto exato)"
              : multi
                ? `${state.suggestions.length} opções — toque na certa`
                : "Local encontrado"}
          </strong>
          <span>{display}</span>
          <small>
            {state.selected.lat.toFixed(5)}, {state.selected.lng.toFixed(5)}
          </small>
          <div className="addr-quick-nav">
            <a
              className="btn btn-maps sm"
              href={googleMapsPlaceUrl(point)}
              target="_blank"
              rel="noreferrer"
            >
              Conferir no Maps
            </a>
            <a
              className="btn btn-waze sm"
              href={wazeNavigateUrl(point)}
              target="_blank"
              rel="noreferrer"
            >
              Conferir no Waze
            </a>
          </div>
        </div>
        {multi ? (
          <ul
            className="geo-suggest-list"
            role="listbox"
            aria-label="Opções de endereço"
          >
            {state.suggestions.map((s, i) => {
              const active =
                s.lat === state.selected.lat &&
                s.lng === state.selected.lng &&
                s.formattedAddress === state.selected.formattedAddress;
              return (
                <li key={`${s.lat}-${s.lng}-${i}`}>
                  <button
                    type="button"
                    className={`geo-suggest-item${active ? " active" : ""}`}
                    role="option"
                    aria-selected={active}
                    onClick={() => onSelect(s)}
                  >
                    <span className="geo-suggest-label">
                      {finalAddress(s, houseNumber, false)}
                    </span>
                    <small>
                      {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    );
  }
  return (
    <div className="geo-banner bad">
      <strong>Não encontrado</strong>
      <span>{state.error}</span>
    </div>
  );
}

/** Confirma se o valor atual já bate com o resultado geocodificado (opcional). */
export function addressesMatch(a: string, b: string): boolean {
  return normalizeAddress(a) === normalizeAddress(b);
}
