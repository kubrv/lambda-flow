import { useMemo, useState } from "react";
import { formatKm, optimizeOrder } from "../lib/geo";
import { geocodeAddress } from "../lib/geocode";
import type { AppData, DayRoute, Motoboy, Stop, Weekday } from "../lib/types";
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
  const [motoboyId, setMotoboyId] = useState(route.motoboyId ?? "");
  const [bulkAddresses, setBulkAddresses] = useState(
    route.stops.map((s) => s.address).join("\n"),
  );
  const [newMotoboy, setNewMotoboy] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });

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
    const addresses = bulkAddresses
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (!startAddress.trim()) {
      setStatus({ kind: "err", text: "Informe o ponto de partida." });
      return;
    }
    if (!addresses.length) {
      setStatus({ kind: "err", text: "Cole ao menos um endereço." });
      return;
    }

    setStatus({
      kind: "busy",
      text: "Geocodificando e organizando a rota… isso pode levar alguns segundos.",
    });

    try {
      const start = await geocodeAddress(startAddress);
      if (!start) {
        setStatus({
          kind: "err",
          text: "Não encontrei o ponto de partida. Tente um endereço mais completo (rua, número, cidade).",
        });
        return;
      }

      const stopsRaw: Stop[] = [];
      for (let i = 0; i < addresses.length; i++) {
        setStatus({
          kind: "busy",
          text: `Geocodificando endereço ${i + 1} de ${addresses.length}…`,
        });
        const coords = await geocodeAddress(addresses[i]);
        stopsRaw.push({
          id: createId(),
          address: addresses[i],
          label: `Parada ${i + 1}`,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        });
        if (i < addresses.length - 1) {
          await new Promise((r) => setTimeout(r, 1100));
        }
      }

      const withCoords = stopsRaw.filter(
        (s): s is Stop & { lat: number; lng: number } =>
          s.lat != null && s.lng != null,
      );
      const missing = stopsRaw.length - withCoords.length;

      if (!withCoords.length) {
        setStatus({
          kind: "err",
          text: "Nenhum endereço foi localizado. Revise a lista e tente novamente.",
        });
        return;
      }

      const { ordered, totalKm } = optimizeOrder(start, withCoords);
      const orderedIds = new Set(ordered.map((s) => s.id));
      const leftovers = stopsRaw.filter((s) => !orderedIds.has(s.id));
      const finalStops = [
        ...ordered.map((s, i) => ({ ...s, label: `Parada ${i + 1}` })),
        ...leftovers.map((s, i) => ({
          ...s,
          label: `Sem coords ${i + 1}`,
        })),
      ];

      const next: DayRoute = {
        day,
        startAddress: startAddress.trim(),
        startLat: start.lat,
        startLng: start.lng,
        motoboyId: motoboyId || null,
        stops: finalStops,
        totalKm,
        optimizedAt: new Date().toISOString(),
      };

      onChange({
        ...data,
        routes: { ...data.routes, [day]: next },
      });

      setBulkAddresses(finalStops.map((s) => s.address).join("\n"));
      setStatus({
        kind: "ok",
        text:
          `Rota de ${dayLabel} salva · ${formatKm(totalKm)}` +
          (missing
            ? ` · ${missing} endereço(s) sem coordenadas ficaram no fim.`
            : ""),
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
        Insira os endereços (um por linha). O sistema geocodifica, ordena a
        partir do ponto de partida e calcula o total de km.
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
              placeholder={"Rua A, 10, Cidade\nRua B, 20, Cidade\n..."}
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
            Distância atual salva: <strong>{previewKm}</strong> · links Waze /
            Google Maps são gerados na visualização da rota.
          </p>

          {status.text ? (
            <div className={`status ${status.kind === "ok" ? "ok" : ""} ${status.kind === "err" ? "err" : ""}`}>
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
