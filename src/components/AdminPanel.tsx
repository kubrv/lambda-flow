import { useEffect, useMemo, useState } from "react";
import { formatKm } from "../lib/geo";
import { optimizeRouteApi } from "../lib/optimizeApi";
import {
  formatPlaceLine,
  normalizeAddress,
  parseCoordsInput,
  parsePlaceLine,
} from "../lib/parseAddress";
import type { AppData, DayRoute, Motoboy, Weekday } from "../lib/types";
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
  const [bulkAddresses, setBulkAddresses] = useState(
    route.stops
      .map((s) => formatPlaceLine(s.address, s.lat, s.lng))
      .join("\n"),
  );
  const [newMotoboy, setNewMotoboy] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });

  useEffect(() => {
    setStartAddress(route.startAddress);
    setStartCoords(
      route.startLat != null && route.startLng != null
        ? `${route.startLat}, ${route.startLng}`
        : "",
    );
    setMotoboyId(route.motoboyId ?? "");
    setBulkAddresses(
      route.stops
        .map((s) => formatPlaceLine(s.address, s.lat, s.lng))
        .join("\n"),
    );
  }, [day, route]);

  const previewKm = useMemo(() => formatKm(route.totalKm), [route.totalKm]);

  function patchRoute(partial: Partial<DayRoute>) {
    onChange({
      ...data,
      routes: {
        ...data.routes,
        [day]: { ...data.routes[day], ...partial },
      },
    });
  }

  function addMotoboy() {
    const name = newMotoboy.trim();
    if (!name) return;
    const motoboy: Motoboy = { id: createId(), name };
    onChange({ ...data, motoboys: [...data.motoboys, motoboy] });
    setNewMotoboy("");
    setMotoboyId(motoboy.id);
  }

  function removeMotoboy(id: string) {
    onChange({
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
    const lines = bulkAddresses
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (!startAddress.trim()) {
      setStatus({ kind: "err", text: "Informe o ponto de partida." });
      return;
    }
    if (!lines.length) {
      setStatus({ kind: "err", text: "Cole ao menos um endereço." });
      return;
    }

    setStatus({
      kind: "busy",
      text: "Calculando rota e km reais (ruas)…",
    });

    try {
      const parsedStart = parsePlaceLine(startAddress);
      const typedStart = parseCoordsInput(startCoords);
      const startLat = typedStart?.lat ?? parsedStart.lat;
      const startLng = typedStart?.lng ?? parsedStart.lng;

      const stopsInput = lines.map((line) => {
        const parsed = parsePlaceLine(line);
        const cached = data.coordCache[normalizeAddress(parsed.address)];
        return {
          id: createId(),
          address: parsed.address,
          lat: parsed.lat ?? cached?.lat ?? null,
          lng: parsed.lng ?? cached?.lng ?? null,
        };
      });

      const result = await optimizeRouteApi({
        startAddress: parsedStart.address.trim(),
        startLat,
        startLng,
        stops: stopsInput,
      });

      const cache = { ...data.coordCache };
      cache[normalizeAddress(parsedStart.address)] = result.start;
      for (const s of result.stops) {
        cache[normalizeAddress(s.address)] = { lat: s.lat!, lng: s.lng! };
      }

      const next: DayRoute = {
        day,
        startAddress: parsedStart.address.trim(),
        startLat: result.start.lat,
        startLng: result.start.lng,
        motoboyId: motoboyId || null,
        stops: result.stops.map((s, i) => ({
          ...s,
          label: `Parada ${i + 1}`,
        })),
        totalKm: result.totalKm,
        optimizedAt: new Date().toISOString(),
      };

      onChange({
        ...data,
        coordCache: cache,
        routes: { ...data.routes, [day]: next },
      });

      setBulkAddresses(
        next.stops
          .map((s) => formatPlaceLine(s.address, s.lat, s.lng))
          .join("\n"),
      );
      setStartAddress(parsedStart.address.trim());
      setStartCoords(`${result.start.lat}, ${result.start.lng}`);

      setStatus({
        kind: "ok",
        text: `Rota de ${dayLabel} salva · ${formatKm(result.totalKm)} (ruas · ${result.provider})`,
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
    patchRoute({ motoboyId: motoboyId || null });
    setStatus({ kind: "ok", text: "Motoboy atualizado para este dia." });
  }

  return (
    <section className="panel">
      <h2>Administração · {dayLabel}</h2>
      <p className="lede">
        Insira os endereços (um por linha). O sistema ordena a rota e calcula os
        km pelas ruas. Opcional:{" "}
        <code>endereço @ -23.55, -46.63</code>
      </p>

      <div className="split">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="start">Ponto de partida</label>
            <input
              id="start"
              value={startAddress}
              onChange={(e) => setStartAddress(e.target.value)}
              placeholder="Ex: Av. Paulista, 1000, São Paulo - SP"
            />
          </div>

          <div className="field">
            <label htmlFor="start-coords">
              Coordenadas do ponto de partida (opcional)
            </label>
            <input
              id="start-coords"
              value={startCoords}
              onChange={(e) => setStartCoords(e.target.value)}
              placeholder="-23.561414, -46.655881"
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
            <label htmlFor="addresses">Endereços do dia</label>
            <textarea
              id="addresses"
              value={bulkAddresses}
              onChange={(e) => setBulkAddresses(e.target.value)}
              placeholder={
                "Rua A, 10, Cidade\nRua B, 20, Cidade @ -23.56, -46.64"
              }
            />
          </div>

          <div className="row-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => void optimizeAndSave()}
              disabled={status.kind === "busy"}
            >
              Organizar rota e salvar
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
            Distância atual: <strong>{previewKm}</strong> · dados no Supabase
          </p>

          {status.text ? (
            <div
              className={`status ${status.kind === "ok" ? "ok" : ""} ${status.kind === "err" ? "err" : ""}`}
            >
              {status.text}
            </div>
          ) : null}
        </div>

        <div>
          <h3>Motoboys</h3>
          <p className="lede" style={{ marginTop: "0.35rem" }}>
            Cadastre quem pode receber rotas.
          </p>

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

          <div className="field" style={{ marginTop: "0.85rem" }}>
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
