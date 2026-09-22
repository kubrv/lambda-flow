import { useEffect, useRef, useState } from "react";
import {
  geocodeAddressApi,
  geocodeSuggestions,
  type GeocodeResult,
  type GeocodeSuggestion,
} from "../../lib/geocodeApi";
import {
  cloneDefaultHours,
  formatHoursLabel,
  normalizeHoursPeriods,
  type HoursPeriod,
} from "../../lib/hours";
import { cleanNickname } from "../../lib/labels";
import {
  applyHouseNumber,
  buildAddressQuery,
  googleMapsNavigateToUrl,
  googleMapsPlaceUrl,
  looksLikeMapsUrl,
  pointFromCoords,
  wazeNavigateUrl,
} from "../../lib/mapsLinks";
import { normalizeAddress } from "../../lib/parseAddress";
import { upsertSavedAddress } from "../../lib/storage";
import type { AppData, SavedAddress } from "../../lib/types";

type Props = {
  data: AppData;
  onChange: (next: AppData) => void;
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
    rest.find((p) => /são paulo|sao paulo|suzano|mogi|guarulhos|osasco/i.test(p)) ||
    rest.find((p) => !/\d{5}/.test(p) && p.length > 2) ||
    "São Paulo";
  return { street, number, city: cityGuess.replace(/\s*-\s*[A-Z]{2}$/, "").trim() };
}

export function AddressesAdmin({ data, onChange }: Props) {
  const [mode, setMode] = useState<InputMode>("typed");
  const [label, setLabel] = useState("");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [city, setCity] = useState("São Paulo");
  const [complement, setComplement] = useState("");
  const [hours, setHours] = useState<HoursPeriod[]>(() => cloneDefaultHours());
  const [mapsLink, setMapsLink] = useState("");
  const [verify, setVerify] = useState<VerifyState>({ status: "idle" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<InputMode>("typed");
  const [editLabel, setEditLabel] = useState("");
  const [editStreet, setEditStreet] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editCity, setEditCity] = useState("São Paulo");
  const [editComplement, setEditComplement] = useState("");
  const [editHours, setEditHours] = useState<HoursPeriod[]>(() =>
    cloneDefaultHours(),
  );
  const [editLink, setEditLink] = useState("");
  const [editVerify, setEditVerify] = useState<VerifyState>({ status: "idle" });
  /** Snapshot do ponto no mapa ao abrir edição — evita re-buscar sem necessidade. */
  const [editMapSnapshot, setEditMapSnapshot] = useState<{
    address: string;
    street: string;
    number: string;
    city: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const verifyTimer = useRef<number | null>(null);
  const editTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (verifyTimer.current) window.clearTimeout(verifyTimer.current);
      if (editTimer.current) window.clearTimeout(editTimer.current);
    };
  }, []);

  /** Busca do mapa: só rua/nº/cidade — complemento NÃO entra aqui. */
  function queryFromTyped(
    s: string,
    n: string,
    c: string,
  ): string {
    return buildAddressQuery({ street: s, number: n, city: c });
  }

  function scheduleTypedVerify(s: string, n: string, c: string) {
    if (verifyTimer.current) window.clearTimeout(verifyTimer.current);
    const q = queryFromTyped(s, n, c);
    if (q.replace(/Brasil/gi, "").trim().length < 6) {
      setVerify({ status: "idle" });
      return;
    }
    setVerify({ status: "checking" });
    verifyTimer.current = window.setTimeout(() => {
      void runVerify(q, setVerify);
    }, 700);
  }

  function scheduleEditTypedVerify(s: string, n: string, c: string) {
    if (editTimer.current) window.clearTimeout(editTimer.current);
    const q = queryFromTyped(s, n, c);
    if (q.replace(/Brasil/gi, "").trim().length < 6) {
      setEditVerify({ status: "idle" });
      return;
    }
    setEditVerify({ status: "checking" });
    editTimer.current = window.setTimeout(() => {
      void runVerify(q, setEditVerify);
    }, 700);
  }

  async function runVerify(
    value: string,
    setState: (s: VerifyState) => void,
  ) {
    const trimmed = value.trim();
    if (!trimmed) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "checking" });
    try {
      const result = await geocodeAddressApi(trimmed);
      if (result.ok && result.automatable) {
        setState(toOkState(result));
      } else {
        setState({
          status: "fail",
          error: !result.ok
            ? result.error
            : "Endereço não pode ser automatizado no mapa.",
        });
      }
    } catch (err) {
      setState({
        status: "fail",
        error:
          err instanceof Error
            ? err.message
            : "Falha ao consultar o serviço de mapa.",
      });
    }
  }

  function resetForm() {
    setLabel("");
    setStreet("");
    setHouseNumber("");
    setCity("São Paulo");
    setComplement("");
    setHours(cloneDefaultHours());
    setMapsLink("");
    setVerify({ status: "idle" });
  }

  async function add() {
    setBusy(true);
    setMsg("");
    try {
      const fromLink = mode === "link";
      const input = fromLink
        ? mapsLink.trim()
        : queryFromTyped(street, houseNumber, city);

      if (!input || (!fromLink && !street.trim())) {
        setMsg(
          fromLink
            ? "Cole o link do Google Maps."
            : "Informe pelo menos a rua ou o nome do lugar.",
        );
        return;
      }

      let okState =
        verify.status === "ok" &&
        normalizeAddress(verify.result.input) === normalizeAddress(input)
          ? verify
          : null;

      if (!okState) {
        const result = await geocodeAddressApi(input);
        if (!result.ok || !result.automatable) {
          setVerify({
            status: "fail",
            error: !result.ok
              ? result.error
              : "Não foi possível automatizar este endereço.",
          });
          setMsg(
            !result.ok
              ? result.error
              : "Endereço não encontrado no mapa — não cadastrado.",
          );
          return;
        }
        okState = toOkState(result);
        setVerify(okState);
      }

      const addrText = finalAddress(
        okState.selected,
        houseNumber,
        fromLink || Boolean(okState.result.fromMapsLink),
      );
      const addresses = upsertSavedAddress(data.addresses, {
        label:
          label.trim() ||
          addrText.split(",")[0].trim() ||
          street.trim() ||
          "Endereço",
        address: addrText,
        complement: complement.trim(),
        hours: normalizeHoursPeriods(hours),
        lat: okState.selected.lat,
        lng: okState.selected.lng,
      });
      const cache = {
        ...data.coordCache,
        [normalizeAddress(addrText)]: {
          lat: okState.selected.lat,
          lng: okState.selected.lng,
        },
      };
      onChange({ ...data, addresses, coordCache: cache });
      resetForm();
      setMsg("Endereço cadastrado. Pode abrir no Maps ou Waze na lista abaixo.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(a: SavedAddress) {
    setEditingId(a.id);
    setEditLabel(cleanNickname(a.label, a.address));
    setEditMode("typed");
    const parsed = splitStoredAddress(a.address);
    setEditStreet(parsed.street);
    setEditNumber(parsed.number);
    setEditCity(parsed.city || "São Paulo");
    setEditComplement(a.complement || "");
    setEditHours(normalizeHoursPeriods(a.hours));
    setEditLink("");
    if (a.lat != null && a.lng != null) {
      setEditMapSnapshot({
        address: a.address,
        street: parsed.street,
        number: parsed.number,
        city: parsed.city || "São Paulo",
        lat: a.lat,
        lng: a.lng,
      });
      setEditVerify(
        toOkState({
          ok: true,
          automatable: true,
          input: a.address,
          formattedAddress: a.address,
          lat: a.lat,
          lng: a.lng,
          provider: "cache",
          suggestions: [
            {
              formattedAddress: a.address,
              lat: a.lat,
              lng: a.lng,
            },
          ],
        }),
      );
    } else {
      setEditMapSnapshot(null);
      setEditVerify({ status: "idle" });
    }
    setMsg("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel("");
    setEditStreet("");
    setEditNumber("");
    setEditCity("São Paulo");
    setEditComplement("");
    setEditHours(cloneDefaultHours());
    setEditLink("");
    setEditMapSnapshot(null);
    setEditVerify({ status: "idle" });
  }

  function editMapFieldsUnchanged(): boolean {
    if (!editMapSnapshot) return false;
    if (editMode === "link") {
      // Link vazio = não trocou o ponto; link preenchido = quer novo ponto
      return !editLink.trim();
    }
    return (
      editStreet.trim() === editMapSnapshot.street &&
      editNumber.trim() === editMapSnapshot.number &&
      editCity.trim() === editMapSnapshot.city
    );
  }

  async function saveEdit() {
    if (!editingId) return;
    setBusy(true);
    setMsg("");
    try {
      const fromLink = editMode === "link";
      const input = fromLink
        ? editLink.trim()
        : queryFromTyped(editStreet, editNumber, editCity);

      const keepExistingPoint =
        Boolean(editMapSnapshot) &&
        editMapFieldsUnchanged() &&
        (editVerify.status === "ok" || editMapSnapshot != null);

      let okState: Extract<VerifyState, { status: "ok" }> | null = null;
      let addrText = "";

      if (keepExistingPoint && editMapSnapshot) {
        // Complemento / horário / apelido: não mexe no GPS nem reconsulta o mapa
        const selected = {
          formattedAddress: editMapSnapshot.address,
          lat: editMapSnapshot.lat,
          lng: editMapSnapshot.lng,
        };
        okState =
          editVerify.status === "ok"
            ? { ...editVerify, selected }
            : toOkState({
                ok: true,
                automatable: true,
                input: editMapSnapshot.address,
                formattedAddress: editMapSnapshot.address,
                lat: editMapSnapshot.lat,
                lng: editMapSnapshot.lng,
                provider: "cache",
                suggestions: [selected],
              });
        addrText = editMapSnapshot.address;
      } else {
        if (!input) {
          setMsg("Informe o endereço ou o link do Maps.");
          return;
        }

        if (
          editVerify.status === "ok" &&
          normalizeAddress(editVerify.result.input) === normalizeAddress(input)
        ) {
          okState = editVerify;
        }

        if (!okState) {
          const result = await geocodeAddressApi(input);
          if (!result.ok || !result.automatable) {
            setEditVerify({
              status: "fail",
              error: !result.ok
                ? result.error
                : "Não foi possível automatizar este endereço.",
            });
            setMsg(
              !result.ok
                ? result.error
                : "Mapa não validou o endereço — edição não salva.",
            );
            return;
          }
          okState = toOkState(result);
          setEditVerify(okState);
        }

        addrText = finalAddress(
          okState.selected,
          editNumber,
          fromLink || Boolean(okState.result.fromMapsLink),
        );
      }

      const addresses = upsertSavedAddress(data.addresses, {
        id: editingId,
        label: editLabel.trim() || addrText.split(",")[0].trim(),
        address: addrText,
        complement: editComplement.trim(),
        hours: normalizeHoursPeriods(editHours),
        lat: okState.selected.lat,
        lng: okState.selected.lng,
      });
      const cache = {
        ...data.coordCache,
        [normalizeAddress(addrText)]: {
          lat: okState.selected.lat,
          lng: okState.selected.lng,
        },
      };
      onChange({ ...data, addresses, coordCache: cache });
      cancelEdit();
      setMsg("Endereço atualizado.");
    } finally {
      setBusy(false);
    }
  }

  function remove(id: string) {
    onChange({
      ...data,
      addresses: data.addresses.filter((a) => a.id !== id),
    });
    if (editingId === id) cancelEdit();
  }

  function onStreetPaste(text: string) {
    if (looksLikeMapsUrl(text)) {
      setMode("link");
      setMapsLink(text.trim());
      setStreet("");
      setVerify({ status: "idle" });
      void runVerify(text.trim(), setVerify);
      return true;
    }
    return false;
  }

  const canSearchTyped =
    street.trim().length >= 3 || houseNumber.trim().length > 0;
  const canSearchLink = mapsLink.trim().length >= 12;

  return (
    <section className="panel">
      <h2>Cadastro de endereços</h2>
      <p className="lede">
        Localize o ponto no mapa (rua/número ou link). Complemento e horário
        são só para o motoboy — não interferem na pesquisa.
      </p>

      <div className="mode-tabs" role="tablist" aria-label="Como informar o endereço">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "typed"}
          className={`mode-tab${mode === "typed" ? " active" : ""}`}
          onClick={() => {
            setMode("typed");
            setVerify({ status: "idle" });
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
          }}
        >
          Link do Google Maps
        </button>
      </div>

      <div className="form-grid addr-form">
        <div className="field">
          <label htmlFor="nick">Apelido (como aparece na rota)</label>
          <input
            id="nick"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex: GdOdontologia Suzano"
          />
        </div>

        {mode === "typed" ? (
          <div className="addr-typed-grid">
            <div className="field addr-street">
              <label htmlFor="street">Rua ou nome do lugar</label>
              <input
                id="street"
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
              />
            </div>
            <div className="field addr-number">
              <label htmlFor="house-n">Número</label>
              <input
                id="house-n"
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
              <label htmlFor="city">Cidade</label>
              <input
                id="city"
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
            <label htmlFor="maps-link">Cole o link exato do Google Maps</label>
            <textarea
              id="maps-link"
              className="maps-link-input"
              rows={3}
              value={mapsLink}
              onChange={(e) => {
                setMapsLink(e.target.value);
                setVerify({ status: "idle" });
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text").trim();
                if (looksLikeMapsUrl(text)) {
                  window.setTimeout(() => {
                    setMapsLink(text);
                    void runVerify(text, setVerify);
                  }, 0);
                }
              }}
              placeholder="https://maps.app.goo.gl/… ou https://www.google.com/maps/place/…"
            />
            <p className="hint">
              No Maps: <strong>Compartilhar → Copiar link</strong>. Se o curto
              falhar, abra o lugar e copie a URL completa da barra (com{" "}
              <code>/place/</code>). O pin do link vira o ponto exato.
            </p>
          </div>
        )}

        <div className="row-actions">
          <button
            type="button"
            className="btn"
            disabled={
              busy ||
              (mode === "typed" ? !canSearchTyped : !canSearchLink)
            }
            onClick={() =>
              void runVerify(
                mode === "typed"
                  ? queryFromTyped(street, houseNumber, city)
                  : mapsLink.trim(),
                setVerify,
              )
            }
          >
            {mode === "link" ? "Ler link e localizar" : "Buscar opções"}
          </button>
        </div>

        <VerifyBanner
          state={verify}
          houseNumber={mode === "typed" ? houseNumber : ""}
          onSelect={(s) => {
            if (verify.status !== "ok") return;
            setVerify({ ...verify, selected: s });
          }}
        />

        <div className="boy-help-box">
          <p className="boy-help-title">Só para ajudar o motoboy</p>
          <p className="hint">
            Não entra na busca do mapa nem muda o ponto GPS — só aparece na
            rota e no PDF.
          </p>
          <div className="field">
            <label htmlFor="complement">Complemento</label>
            <input
              id="complement"
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
              placeholder="Ex: Sala 12, 2º andar, portão azul, fundo"
            />
          </div>
          <HoursEditor hours={hours} onChange={setHours} />
        </div>

        <div className="row-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => void add()}
            disabled={busy || verify.status === "fail" || verify.status === "checking"}
          >
            Cadastrar
          </button>
        </div>

        {msg ? (
          <div
            className={`status ${
              /não|falha|maps|encontr|configur|informe|cole/i.test(msg) &&
              !/cadastrado|atualizado/i.test(msg)
                ? "err"
                : "ok"
            }`}
          >
            {msg}
          </div>
        ) : null}

        <div className="motoboy-list">
          {data.addresses.map((a) => {
            const automatable = a.lat != null && a.lng != null;
            const point = pointFromCoords(a.lat, a.lng, a.address);
            return (
              <div className="motoboy-item finance-item" key={a.id}>
                {editingId === a.id ? (
                  <div className="form-grid" style={{ flex: 1, width: "100%" }}>
                    <div className="mode-tabs compact">
                      <button
                        type="button"
                        className={`mode-tab${editMode === "typed" ? " active" : ""}`}
                        onClick={() => setEditMode("typed")}
                      >
                        Digitar
                      </button>
                      <button
                        type="button"
                        className={`mode-tab${editMode === "link" ? " active" : ""}`}
                        onClick={() => setEditMode("link")}
                      >
                        Link Maps
                      </button>
                    </div>
                    <div className="field">
                      <label>Apelido</label>
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                      />
                    </div>
                    {editMode === "typed" ? (
                      <div className="addr-typed-grid">
                        <div className="field addr-street">
                          <label>Rua ou lugar</label>
                          <input
                            value={editStreet}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditStreet(v);
                              scheduleEditTypedVerify(v, editNumber, editCity);
                            }}
                          />
                        </div>
                        <div className="field addr-number">
                          <label>Número</label>
                          <input
                            value={editNumber}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditNumber(v);
                              scheduleEditTypedVerify(editStreet, v, editCity);
                            }}
                            placeholder="123"
                          />
                        </div>
                        <div className="field addr-city">
                          <label>Cidade</label>
                          <input
                            value={editCity}
                            onChange={(e) => {
                              const v = e.target.value;
                              setEditCity(v);
                              scheduleEditTypedVerify(editStreet, editNumber, v);
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="field">
                        <label>Link do Google Maps</label>
                        <textarea
                          className="maps-link-input"
                          rows={2}
                          value={editLink}
                          onChange={(e) => setEditLink(e.target.value)}
                          placeholder="Cole o link exato…"
                        />
                      </div>
                    )}
                    <div className="boy-help-box">
                      <p className="boy-help-title">Só para ajudar o motoboy</p>
                      <p className="hint">
                        Não entra na busca do mapa — só na rota/PDF.
                      </p>
                      <div className="field">
                        <label>Complemento</label>
                        <input
                          value={editComplement}
                          onChange={(e) => setEditComplement(e.target.value)}
                          placeholder="Sala, andar, portão…"
                        />
                      </div>
                      <HoursEditor hours={editHours} onChange={setEditHours} />
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          void runVerify(
                            editMode === "typed"
                              ? queryFromTyped(editStreet, editNumber, editCity)
                              : editLink.trim(),
                            setEditVerify,
                          )
                        }
                      >
                        Buscar
                      </button>
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => void saveEdit()}
                        disabled={busy || editVerify.status === "fail"}
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={cancelEdit}
                      >
                        Cancelar
                      </button>
                    </div>
                    <VerifyBanner
                      state={editVerify}
                      houseNumber={editMode === "typed" ? editNumber : ""}
                      onSelect={(s) => {
                        if (editVerify.status !== "ok") return;
                        setEditVerify({ ...editVerify, selected: s });
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <strong>{cleanNickname(a.label, a.address)}</strong>
                      <div className="hint">{a.address}</div>
                      {a.complement?.trim() ? (
                        <div className="hint addr-complement">
                          Complemento: {a.complement.trim()}
                        </div>
                      ) : null}
                      <div className="hint addr-hours">
                        Horário:{" "}
                        {formatHoursLabel(normalizeHoursPeriods(a.hours))}
                      </div>
                      <div className="addr-flags">
                        {automatable ? (
                          <span className="addr-flag ok">No mapa</span>
                        ) : (
                          <span className="addr-flag bad">Sem ponto no mapa</span>
                        )}
                      </div>
                      {automatable ? (
                        <div className="addr-quick-nav">
                          <a
                            className="btn btn-maps sm"
                            href={googleMapsPlaceUrl(point)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver no Maps
                          </a>
                          <a
                            className="btn btn-maps sm"
                            href={googleMapsNavigateToUrl(point)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ir no Maps
                          </a>
                          <a
                            className="btn btn-waze sm"
                            href={wazeNavigateUrl(point)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Waze
                          </a>
                        </div>
                      ) : null}
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => startEdit(a)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn danger ghost"
                        onClick={() => remove(a.id)}
                      >
                        Remover
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function HoursEditor({
  hours,
  onChange,
}: {
  hours: HoursPeriod[];
  onChange: (next: HoursPeriod[]) => void;
}) {
  return (
    <div className="field hours-field">
      <label>Horário de funcionamento</label>
      <p className="hint">
        Padrão: 9h–12h e 13h–17h. Ajuste se o lugar for diferente.
      </p>
      <div className="hours-periods">
        {hours.map((p, i) => (
          <div className="hours-row" key={i}>
            <input
              type="time"
              value={p.open}
              onChange={(e) => {
                const next = hours.map((h, idx) =>
                  idx === i ? { ...h, open: e.target.value } : h,
                );
                onChange(next);
              }}
              aria-label={`Abre período ${i + 1}`}
            />
            <span className="hours-sep">até</span>
            <input
              type="time"
              value={p.close}
              onChange={(e) => {
                const next = hours.map((h, idx) =>
                  idx === i ? { ...h, close: e.target.value } : h,
                );
                onChange(next);
              }}
              aria-label={`Fecha período ${i + 1}`}
            />
            {hours.length > 1 ? (
              <button
                type="button"
                className="btn sm ghost"
                onClick={() => onChange(hours.filter((_, idx) => idx !== i))}
              >
                Remover
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="row-actions">
        <button
          type="button"
          className="btn sm"
          onClick={() =>
            onChange([...hours, { open: "09:00", close: "12:00" }])
          }
        >
          + Período
        </button>
        <button
          type="button"
          className="btn sm"
          onClick={() => onChange(cloneDefaultHours())}
        >
          Restaurar padrão 9–12 / 13–17
        </button>
      </div>
    </div>
  );
}

function VerifyBanner({
  state,
  onSelect,
  houseNumber,
}: {
  state: VerifyState;
  onSelect: (s: GeocodeSuggestion) => void;
  houseNumber: string;
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
