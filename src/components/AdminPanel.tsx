import { useEffect, useMemo, useState } from "react";
import { formatKm } from "../lib/geo";
import { optimizeRouteApi } from "../lib/optimizeApi";
import {
  normalizeAddress,
  parseCoordsInput,
  parsePlaceLine,
} from "../lib/parseAddress";
import { upsertSavedAddress } from "../lib/storage";
import type {
  AppData,
  DayRoute,
  Motoboy,
  SavedAddress,
  Weekday,
} from "../lib/types";
import { WEEKDAYS, createId } from "../lib/types";

type Props = {
  data: AppData;
  day: Weekday;
  onChange: (next: AppData) => void;
};

type Status = { kind: "idle" | "ok" | "err" | "busy"; text: string };

export function AdminPanel({ data, day, onChange }: Props) {
  const route = data.routes[day];
  const dayLabel = WEEKDAYS.find((d) => d.id === day)?.label ?? day;

  const [startAddress, setStartAddress] = useState(route.startAddress);
  const [startCoords, setStartCoords] = useState(
    route.startLat != null && route.startLng != null
      ? `${route.startLat}, ${route.startLng}`
      : "",
  );
  const [motoboyId, setMotoboyId] = useState(route.motoboyId ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    route.stops
      .map((s) => s.addressId)
      .filter((id): id is string => Boolean(id)),
  );
  const [historyDay, setHistoryDay] = useState<Weekday | "">("");
  const [newLabel, setNewLabel] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newMotoboy, setNewMotoboy] = useState("");
  const [catalogFilter, setCatalogFilter] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });

  useEffect(() => {
    setStartAddress(route.startAddress);
    setStartCoords(
      route.startLat != null && route.startLng != null
        ? `${route.startLat}, ${route.startLng}`
        : "",
    );
    setMotoboyId(route.motoboyId ?? "");

    const ids = route.stops
      .map((s) => {
        if (s.addressId) return s.addressId;
        const hit = data.addresses.find(
          (a) => normalizeAddress(a.address) === normalizeAddress(s.address),
        );
        return hit?.id;
      })
      .filter((id): id is string => Boolean(id));
    setSelectedIds(ids);
  }, [day, route, data.addresses]);

  const previewKm = useMemo(() => formatKm(route.totalKm), [route.totalKm]);

  const filteredCatalog = useMemo(() => {
    const q = catalogFilter.trim().toLowerCase();
    if (!q) return data.addresses;
    return data.addresses.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.address.toLowerCase().includes(q),
    );
  }, [data.addresses, catalogFilter]);

  function patchData(next: AppData) {
    onChange(next);
  }

  function toggleAddress(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function addFromHistory() {
    if (!historyDay) return;
    const hist = data.routes[historyDay];
    const ids: string[] = [];
    let addresses = [...data.addresses];

    for (const stop of hist.stops) {
      addresses = upsertSavedAddress(addresses, {
        id: stop.addressId || undefined,
        label: stop.label,
        address: stop.address,
        lat: stop.lat,
        lng: stop.lng,
      });
      const saved = addresses.find(
        (a) => normalizeAddress(a.address) === normalizeAddress(stop.address),
      );
      if (saved) ids.push(saved.id);
    }

    if (hist.startAddress && !startAddress.trim()) {
      setStartAddress(hist.startAddress);
      if (hist.startLat != null && hist.startLng != null) {
        setStartCoords(`${hist.startLat}, ${hist.startLng}`);
      }
    }

    patchData({ ...data, addresses });
    setSelectedIds((prev) => [...new Set([...prev, ...ids])]);
    setStatus({
      kind: "ok",
      text: `Endereços de ${WEEKDAYS.find((d) => d.id === historyDay)?.label} adicionados à seleção.`,
    });
  }

  function addAddressToCatalog() {
    const address = newAddress.trim();
    if (!address) return;
    const addresses = upsertSavedAddress(data.addresses, {
      label: newLabel.trim() || address.split(",")[0].trim(),
      address,
    });
    const saved = addresses.find(
      (a) => normalizeAddress(a.address) === normalizeAddress(address),
    )!;
    patchData({ ...data, addresses });
    setSelectedIds((prev) =>
      prev.includes(saved.id) ? prev : [...prev, saved.id],
    );
    setNewLabel("");
    setNewAddress("");
    setStatus({ kind: "ok", text: "Endereço cadastrado na lista." });
  }

  function removeFromCatalog(id: string) {
    patchData({
      ...data,
      addresses: data.addresses.filter((a) => a.id !== id),
    });
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }

  function addMotoboy() {
    const name = newMotoboy.trim();
    if (!name) return;
    const motoboy: Motoboy = { id: createId(), name };
    patchData({ ...data, motoboys: [...data.motoboys, motoboy] });
    setNewMotoboy("");
    setMotoboyId(motoboy.id);
  }

  function removeMotoboy(id: string) {
    patchData({
      ...data,
      motoboys: data.motoboys.filter((m) => m.id !== id),
      routes: Object.fromEntries(
        WEEKDAYS.map((d) => {
          const r = data.routes[d.id];
          return [
            d.id,
            r.motoboyId === id ? { ...r, motoboyId: null } : r,
          ];
        }),
      ) as AppData["routes"],
    });
    if (motoboyId === id) setMotoboyId("");
  }

  async function optimizeAndSave() {
    if (!startAddress.trim()) {
      setStatus({ kind: "err", text: "Informe o ponto de partida." });
      return;
    }
    if (!selectedIds.length) {
      setStatus({
        kind: "err",
        text: "Selecione ao menos um endereço da lista.",
      });
      return;
    }

    const selected = selectedIds
      .map((id) => data.addresses.find((a) => a.id === id))
      .filter((a): a is SavedAddress => Boolean(a));

    if (!selected.length) {
      setStatus({ kind: "err", text: "Nenhum endereço válido selecionado." });
      return;
    }

    setStatus({
      kind: "busy",
      text: "Calculando melhor ordem e km com Google Maps…",
    });

    try {
      const parsedStart = parsePlaceLine(startAddress);
      const typedStart = parseCoordsInput(startCoords);

      const result = await optimizeRouteApi({
        startAddress: parsedStart.address.trim(),
        startLat: typedStart?.lat ?? parsedStart.lat,
        startLng: typedStart?.lng ?? parsedStart.lng,
        stops: selected.map((a) => ({
          id: createId(),
          addressId: a.id,
          address: a.address,
          label: a.label,
          lat: a.lat,
          lng: a.lng,
        })),
      });

      let addresses = [...data.addresses];
      const cache = { ...data.coordCache };
      cache[normalizeAddress(parsedStart.address)] = result.start;

      const stops = result.stops.map((s, i) => {
        const matched =
          selected.find(
            (a) => normalizeAddress(a.address) === normalizeAddress(s.address),
          ) ||
          addresses.find(
            (a) => normalizeAddress(a.address) === normalizeAddress(s.address),
          );

        addresses = upsertSavedAddress(addresses, {
          id: matched?.id || s.addressId || undefined,
          label: matched?.label || s.label,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
        });

        const saved = addresses.find(
          (a) => normalizeAddress(a.address) === normalizeAddress(s.address),
        )!;

        cache[normalizeAddress(s.address)] = { lat: s.lat!, lng: s.lng! };

        return {
          id: s.id,
          addressId: saved.id,
          address: s.address,
          label: saved.label || `Parada ${i + 1}`,
          lat: s.lat,
          lng: s.lng,
        };
      });

      const next: DayRoute = {
        day,
        startAddress: parsedStart.address.trim(),
        startLat: result.start.lat,
        startLng: result.start.lng,
        motoboyId: motoboyId || null,
        stops,
        totalKm: result.totalKm,
        optimizedAt: new Date().toISOString(),
      };

      patchData({
        ...data,
        addresses,
        coordCache: cache,
        routes: { ...data.routes, [day]: next },
      });

      setSelectedIds(stops.map((s) => s.addressId!).filter(Boolean));
      setStartAddress(parsedStart.address.trim());
      setStartCoords(`${result.start.lat}, ${result.start.lng}`);

      setStatus({
        kind: "ok",
        text: `Rota de ${dayLabel} salva · ${formatKm(result.totalKm)} · ordem automática (${result.provider})`,
      });
    } catch (err) {
      setStatus({
        kind: "err",
        text:
          err instanceof Error
            ? err.message
            : "Falha ao otimizar a rota. Tente de novo.",
      });
    }
  }

  function saveMotoboyOnly() {
    onChange({
      ...data,
      routes: {
        ...data.routes,
        [day]: { ...data.routes[day], motoboyId: motoboyId || null },
      },
    });
    setStatus({ kind: "ok", text: "Motoboy atualizado para este dia." });
  }

  return (
    <section className="panel">
      <h2>Administração · {dayLabel}</h2>
      <p className="lede">
        Cadastre endereços uma vez na lista, marque os do dia e salve — o Google
        Maps define sozinho a melhor ordem e o total de km.
      </p>

      <div className="split">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="start">Ponto de partida</label>
            <input
              id="start"
              value={startAddress}
              onChange={(e) => setStartAddress(e.target.value)}
              placeholder="Ex: R. União, 510 - Poá - SP"
            />
          </div>

          <div className="field">
            <label htmlFor="start-coords">Coordenadas (opcional)</label>
            <input
              id="start-coords"
              value={startCoords}
              onChange={(e) => setStartCoords(e.target.value)}
              placeholder="-23.5104581, -46.350281"
            />
          </div>

          <div className="field">
            <label htmlFor="motoboy">Motoboy responsável</label>
            <select
              id="motoboy"
              value={motoboyId}
              onChange={(e) => setMotoboyId(e.target.value)}
            >
              <option value="">Selecionar…</option>
              {data.motoboys.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Usar histórico de outro dia</label>
            <div className="row-actions">
              <select
                value={historyDay}
                onChange={(e) =>
                  setHistoryDay((e.target.value || "") as Weekday | "")
                }
              >
                <option value="">Escolher dia…</option>
                {WEEKDAYS.filter((d) => d.id !== day).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                    {data.routes[d.id].stops.length
                      ? ` (${data.routes[d.id].stops.length})`
                      : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn"
                onClick={addFromHistory}
                disabled={!historyDay}
              >
                Adicionar à seleção
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="catalog-filter">
              Endereços do dia ({selectedIds.length} selecionados)
            </label>
            <input
              id="catalog-filter"
              value={catalogFilter}
              onChange={(e) => setCatalogFilter(e.target.value)}
              placeholder="Filtrar lista…"
            />
          </div>

          <div className="address-checklist">
            {filteredCatalog.length === 0 ? (
              <div className="empty">
                Nenhum endereço no catálogo ainda. Cadastre à direita.
              </div>
            ) : (
              filteredCatalog.map((a) => (
                <label key={a.id} className="address-check">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(a.id)}
                    onChange={() => toggleAddress(a.id)}
                  />
                  <span>
                    <strong>{a.label}</strong>
                    <small>{a.address}</small>
                  </span>
                </label>
              ))
            )}
          </div>

          <div className="row-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => void optimizeAndSave()}
              disabled={status.kind === "busy"}
            >
              Organizar com Google Maps e salvar
            </button>
            <button
              type="button"
              className="btn"
              onClick={saveMotoboyOnly}
              disabled={status.kind === "busy"}
            >
              Só salvar motoboy
            </button>
          </div>

          <p className="hint">
            Distância atual: <strong>{previewKm}</strong>
          </p>

          {status.text ? (
            <div
              className={`status ${status.kind === "ok" ? "ok" : ""} ${status.kind === "err" ? "err" : ""}`}
            >
              {status.text}
            </div>
          ) : null}
        </div>

        <div className="form-grid">
          <h3>Lista de endereços</h3>
          <p className="lede" style={{ marginTop: 0 }}>
            Cadastre uma vez e reutilize em qualquer dia.
          </p>

          <div className="field">
            <label htmlFor="new-label">Nome / apelido</label>
            <input
              id="new-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Ex: GdOdontologia Suzano"
            />
          </div>
          <div className="field">
            <label htmlFor="new-address">Endereço completo</label>
            <input
              id="new-address"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="Av. Francisco Marengo, 2039, Suzano - SP"
              onKeyDown={(e) => {
                if (e.key === "Enter") addAddressToCatalog();
              }}
            />
          </div>
          <div className="row-actions">
            <button type="button" className="btn" onClick={addAddressToCatalog}>
              Cadastrar endereço
            </button>
          </div>

          <div className="motoboy-list" style={{ marginTop: "0.5rem" }}>
            {data.addresses.map((a) => (
              <div className="motoboy-item" key={a.id}>
                <div>
                  <strong>{a.label}</strong>
                  <div className="hint">{a.address}</div>
                </div>
                <button
                  type="button"
                  className="btn danger ghost"
                  onClick={() => removeFromCatalog(a.id)}
                >
                  Remover
                </button>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: "1rem" }}>Motoboys</h3>
          <div className="motoboy-list">
            {data.motoboys.map((m) => (
              <div className="motoboy-item" key={m.id}>
                <strong>{m.name}</strong>
                <button
                  type="button"
                  className="btn danger ghost"
                  onClick={() => removeMotoboy(m.id)}
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
          <div className="field">
            <label htmlFor="new-motoboy">Novo motoboy</label>
            <input
              id="new-motoboy"
              value={newMotoboy}
              onChange={(e) => setNewMotoboy(e.target.value)}
              placeholder="Nome"
              onKeyDown={(e) => {
                if (e.key === "Enter") addMotoboy();
              }}
            />
          </div>
          <div className="row-actions">
            <button type="button" className="btn" onClick={addMotoboy}>
              Adicionar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
