import { useEffect, useMemo, useState } from "react";
import { formatDateLabel } from "../../lib/dates";
import {
  removeAutoRouteFinance,
  upsertAutoRouteFinance,
} from "../../lib/finance";
import { formatKm } from "../../lib/geo";
import { formatHoursLabel, normalizeHoursPeriods } from "../../lib/hours";
import {
  cleanNickname,
  formatMoneyBRL,
  isPresetStart,
  resolveMotoboyPricePerKm,
  resolvePresetStart,
} from "../../lib/labels";
import { optimizeRouteApi } from "../../lib/optimizeApi";
import { normalizeAddress, parsePlaceLine } from "../../lib/parseAddress";
import { upsertSavedAddress } from "../../lib/storage";
import type {
  AppData,
  DayRoute,
  SavedAddress,
  StopKind,
  StopKindFlags,
} from "../../lib/types";
import {
  DEFAULT_PRICE_PER_KM,
  createId,
  flagsToStopKinds,
  getRoute,
  normalizeBoxes,
  resolveStopKinds,
  stopKindsToFlags,
  totalBoxes,
} from "../../lib/types";
import { RouteCompletionPanel } from "../RouteCompletionPanel";

type Props = {
  data: AppData;
  date: string;
  onChange: (next: AppData) => void;
  actorName?: string;
};

type Status = { kind: "idle" | "ok" | "err" | "busy"; text: string };
type StartMode = "default" | "manual";

const DEFAULT_FLAGS: StopKindFlags = { entrega: true, retirada: false };

function hydrateFromRoute(route: DayRoute, addresses: SavedAddress[]) {
  const selectedIds: string[] = [];
  const stopKinds: Record<string, StopKindFlags> = {};
  const stopNotes: Record<string, string> = {};
  const stopBoxes: Record<string, number> = {};

  for (const s of route.stops) {
    const id =
      s.addressId ||
      addresses.find(
        (a) => normalizeAddress(a.address) === normalizeAddress(s.address),
      )?.id;
    if (!id) continue;
    selectedIds.push(id);
    stopKinds[id] = stopKindsToFlags(resolveStopKinds(s));
    if (s.notes) stopNotes[id] = s.notes;
    stopBoxes[id] = normalizeBoxes(s.boxes);
  }

  return { selectedIds, stopKinds, stopNotes, stopBoxes };
}

export function RouteEditor({ data, date, onChange, actorName = "Admin" }: Props) {
  const saved = getRoute(data, date);
  const dayLabel = formatDateLabel(date);
  const preset = resolvePresetStart(data);
  const completion = saved.completionStatus || "open";
  const locked = completion === "completed" || completion === "verified";
  const completedBy =
    saved.motoboyCompletedBy ||
    data.motoboys.find((m) => m.id === saved.motoboyId)?.name ||
    "";

  const [startMode, setStartMode] = useState<StartMode>("default");
  const [startAddress, setStartAddress] = useState(preset.address);
  const [startLat, setStartLat] = useState<number | null>(preset.lat);
  const [startLng, setStartLng] = useState<number | null>(preset.lng);
  const [motoboyId, setMotoboyId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [stopKinds, setStopKinds] = useState<Record<string, StopKindFlags>>({});
  const [stopNotes, setStopNotes] = useState<Record<string, string>>({});
  const [stopBoxes, setStopBoxes] = useState<Record<string, number>>({});
  const [returnToStart, setReturnToStart] = useState(false);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });
  const [formEpoch, setFormEpoch] = useState(0);

  // Recarrega ao trocar a data ou após limpar (formEpoch).
  useEffect(() => {
    const route = getRoute(data, date);
    const p = resolvePresetStart(data);
    if (!route.startAddress.trim() || isPresetStart(route.startAddress, data)) {
      setStartMode("default");
      setStartAddress(p.address);
      setStartLat(p.lat);
      setStartLng(p.lng);
    } else {
      setStartMode("manual");
      setStartAddress(route.startAddress);
      setStartLat(route.startLat);
      setStartLng(route.startLng);
    }
    setMotoboyId(route.motoboyId ?? "");
    setReturnToStart(Boolean(route.returnToStart));
    const h = hydrateFromRoute(route, data.addresses);
    setSelectedIds(h.selectedIds);
    setStopKinds(h.stopKinds);
    setStopNotes(h.stopNotes);
    setStopBoxes(h.stopBoxes);
    setFilter("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intencional
  }, [date, formEpoch]);

  useEffect(() => {
    setStatus({ kind: "idle", text: "" });
  }, [date]);

  const draftBoxesTotal = useMemo(
    () =>
      selectedIds.reduce(
        (sum, id) => sum + normalizeBoxes(stopBoxes[id]),
        0,
      ),
    [selectedIds, stopBoxes],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return data.addresses;
    return data.addresses.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.address.toLowerCase().includes(q),
    );
  }, [data.addresses, filter]);

  function resolvedStart() {
    if (startMode === "default") {
      const p = resolvePresetStart(data);
      return { address: p.address, lat: p.lat, lng: p.lng };
    }
    return { address: startAddress.trim(), lat: startLat, lng: startLng };
  }

  function toggleAddress(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        setStopKinds((k) => {
          const n = { ...k };
          delete n[id];
          return n;
        });
        setStopNotes((n) => {
          const x = { ...n };
          delete x[id];
          return x;
        });
        setStopBoxes((b) => {
          const x = { ...b };
          delete x[id];
          return x;
        });
        return prev.filter((x) => x !== id);
      }
      setStopKinds((k) => ({ ...k, [id]: k[id] || { ...DEFAULT_FLAGS } }));
      setStopBoxes((b) => ({ ...b, [id]: b[id] ?? 0 }));
      return [...prev, id];
    });
  }

  function toggleKindFlag(id: string, flag: StopKind) {
    setStopKinds((prev) => {
      const current = prev[id] || { ...DEFAULT_FLAGS };
      const next = { ...current, [flag]: !current[flag] };
      if (!next.entrega && !next.retirada) next[flag] = true;
      return { ...prev, [id]: next };
    });
  }

  function clearRoute() {
    if (locked) {
      setStatus({
        kind: "err",
        text: "Rota concluída — reabra a conclusão para editar ou limpar.",
      });
      return;
    }
    if (status.kind === "busy") {
      setStatus({
        kind: "err",
        text: "Aguarde o cálculo terminar antes de limpar.",
      });
      return;
    }
    const ok = window.confirm(
      `Limpar a rota de ${dayLabel}? Isso remove paradas, km, atribuições e o valor automático deste dia.`,
    );
    if (!ok) return;

    const nextRoutes = { ...data.routesByDate };
    delete nextRoutes[date];

    onChange({
      ...data,
      routesByDate: nextRoutes,
      finance: removeAutoRouteFinance(data.finance, date),
    });
    setStatus({ kind: "ok", text: "Rota limpa. Pode montar de novo." });
    setFormEpoch((n) => n + 1);
  }

  async function optimizeAndSave() {
    if (locked) {
      setStatus({
        kind: "err",
        text: "Rota concluída — reabra a conclusão para alterar ordem, valores ou motoboy.",
      });
      return;
    }
    const start = resolvedStart();
    if (!start.address) {
      setStatus({ kind: "err", text: "Informe o ponto de partida." });
      return;
    }
    if (!selectedIds.length) {
      setStatus({ kind: "err", text: "Selecione ao menos um endereço." });
      return;
    }

    const selected = selectedIds
      .map((id) => data.addresses.find((a) => a.id === id))
      .filter((a): a is SavedAddress => Boolean(a));

    if (!selected.length) {
      setStatus({ kind: "err", text: "Nenhum endereço válido." });
      return;
    }

    setStatus({
      kind: "busy",
      text: "Calculando melhor ordem e km…",
    });

    try {
      const parsedStart = parsePlaceLine(start.address);
      const cached = data.coordCache[normalizeAddress(parsedStart.address)];

      const result = await optimizeRouteApi({
        startAddress: parsedStart.address.trim(),
        startLat: start.lat ?? parsedStart.lat ?? cached?.lat ?? null,
        startLng: start.lng ?? parsedStart.lng ?? cached?.lng ?? null,
        returnToStart,
        stops: selected.map((a) => {
          const kinds = flagsToStopKinds(
            stopKinds[a.id] || { ...DEFAULT_FLAGS },
          );
          return {
            id: createId(),
            addressId: a.id,
            address: a.address,
            label: cleanNickname(a.label, a.address),
            kinds,
            kind: kinds.length === 1 ? kinds[0] : undefined,
            notes: stopNotes[a.id] || undefined,
            boxes: normalizeBoxes(stopBoxes[a.id]),
            complement: a.complement?.trim() || undefined,
            hours: a.hours,
            lat: a.lat,
            lng: a.lng,
          };
        }),
      });

      let addresses = [...data.addresses];
      const cache = { ...data.coordCache };
      cache[normalizeAddress(parsedStart.address)] = result.start;

      const stops = result.stops.map((s) => {
        const matched =
          selected.find(
            (a) => normalizeAddress(a.address) === normalizeAddress(s.address),
          ) ||
          addresses.find(
            (a) => normalizeAddress(a.address) === normalizeAddress(s.address),
          );

        const nickname = cleanNickname(matched?.label || s.label, s.address);
        addresses = upsertSavedAddress(addresses, {
          id: matched?.id || s.addressId || undefined,
          label: nickname,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
        });
        const savedAddr = addresses.find(
          (a) => normalizeAddress(a.address) === normalizeAddress(s.address),
        )!;
        cache[normalizeAddress(s.address)] = { lat: s.lat!, lng: s.lng! };

        const kinds = resolveStopKinds({
          kinds: matched
            ? flagsToStopKinds(stopKinds[matched.id] || DEFAULT_FLAGS)
            : s.kinds,
          kind: s.kind,
        });

        return {
          id: s.id,
          addressId: savedAddr.id,
          address: s.address,
          label: savedAddr.label,
          kinds,
          kind: kinds.length === 1 ? kinds[0] : undefined,
          notes:
            (matched && stopNotes[matched.id]) || s.notes || undefined,
          boxes: normalizeBoxes(
            (matched && stopBoxes[matched.id]) ?? s.boxes,
          ),
          complement:
            matched?.complement?.trim() ||
            savedAddr.complement?.trim() ||
            s.complement ||
            undefined,
          hours: matched?.hours || savedAddr.hours || s.hours,
          lat: s.lat,
          lng: s.lng,
        };
      });

      const next: DayRoute = {
        date,
        startAddress: parsedStart.address.trim(),
        startLat: result.start.lat,
        startLng: result.start.lng,
        motoboyId: motoboyId || null,
        stops,
        totalKm: result.totalKm,
        returnToStart,
        optimizedAt: new Date().toISOString(),
        completionStatus: saved.completionStatus || "open",
        motoboyReport: saved.motoboyReport || "",
        motoboyCompletedAt: saved.motoboyCompletedAt || null,
        motoboyCompletedBy: saved.motoboyCompletedBy || "",
        adminReport: saved.adminReport || "",
        adminVerifiedAt: saved.adminVerifiedAt || null,
        adminVerifiedBy: saved.adminVerifiedBy || "",
      };

      const price = resolveMotoboyPricePerKm(
        data.motoboys.find((m) => m.id === next.motoboyId),
        data.pricePerKm || DEFAULT_PRICE_PER_KM,
      );
      const finance = upsertAutoRouteFinance(data.finance, {
        date,
        motoboyId: next.motoboyId,
        totalKm: next.totalKm,
        pricePerKm: price,
      });

      onChange({
        ...data,
        addresses,
        coordCache: cache,
        finance,
        routesByDate: { ...data.routesByDate, [date]: next },
      });

      const fare = result.totalKm * price;
      const financeNote =
        next.motoboyId && fare > 0
          ? ` · ${formatMoneyBRL(fare)} na conta do motoboy (${formatMoneyBRL(price)}/km)`
          : "";
      setStatus({
        kind: "ok",
        text: `Rota atualizada · ${formatKm(result.totalKm)} · ~${formatMoneyBRL(fare)} (${result.provider})${financeNote}`,
      });
    } catch (err) {
      setStatus({
        kind: "err",
        text:
          err instanceof Error ? err.message : "Falha ao otimizar a rota.",
      });
    }
  }

  return (
    <section className="panel">
      <h2>Editar rota · {dayLabel}</h2>
      {locked ? (
        <div className="status ok" style={{ marginBottom: "0.75rem" }}>
          Rota {completion === "verified" ? "verificada" : "concluída"}
          {completedBy ? (
            <>
              {" "}
              por <strong>{completedBy}</strong>
            </>
          ) : null}
          . Ordem, valores e motoboy estão bloqueados — use{" "}
          <strong>Reabrir</strong> em Conclusão da rota para editar.
        </div>
      ) : (
        <p className="lede">
          <strong>Salvar alterações</strong> já recalcula a ordem e os km
          automaticamente (e lança o valor na conta do motoboy).
        </p>
      )}

      <fieldset
        disabled={locked}
        style={{
          border: 0,
          margin: 0,
          padding: 0,
          minWidth: 0,
          opacity: locked ? 0.72 : 1,
        }}
      >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="start-mode">Ponto de partida</label>
          <select
            id="start-mode"
            value={startMode}
            onChange={(e) => {
              const mode = e.target.value as StartMode;
              setStartMode(mode);
              if (mode === "default") {
                const p = resolvePresetStart(data);
                setStartAddress(p.address);
                setStartLat(p.lat);
                setStartLng(p.lng);
              }
            }}
          >
            <option value="default">Padrão: {preset.address}</option>
            <option value="manual">Outro endereço (manual)</option>
          </select>
        </div>

        {startMode === "manual" ? (
          <div className="field">
            <label htmlFor="start">Endereço de partida</label>
            <input
              id="start"
              value={startAddress}
              onChange={(e) => {
                setStartAddress(e.target.value);
                setStartLat(null);
                setStartLng(null);
              }}
            />
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="motoboy">Motoboy</label>
          <select
            id="motoboy"
            value={motoboyId}
            onChange={(e) => setMotoboyId(e.target.value)}
          >
            <option value="">Selecionar…</option>
            {data.motoboys.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.company ? ` · ${m.company}` : ""} —{" "}
                {formatMoneyBRL(
                  resolveMotoboyPricePerKm(m, data.pricePerKm || DEFAULT_PRICE_PER_KM),
                )}
                /km
              </option>
            ))}
          </select>
        </div>

        <label className="address-check return-check">
          <input
            type="checkbox"
            checked={returnToStart}
            onChange={(e) => setReturnToStart(e.target.checked)}
          />
          <span>
            <strong>Retornar ao ponto de partida no fim</strong>
          </span>
        </label>

        <div className="field">
          <label htmlFor="filter">
            Endereços do dia ({selectedIds.length} selecionados)
          </label>
          <input
            id="filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar…"
          />
        </div>

        <div className="address-checklist tall">
          {filtered.length === 0 ? (
            <div className="empty">
              Cadastre endereços na aba Endereços do painel.
            </div>
          ) : (
            filtered.map((a) => {
              const selected = selectedIds.includes(a.id);
              const flags = stopKinds[a.id] || DEFAULT_FLAGS;
              return (
                <div key={a.id} className="address-check-row">
                  <label className="address-check">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleAddress(a.id)}
                    />
                    <span>
                      <strong>{cleanNickname(a.label, a.address)}</strong>
                      <small>{a.address}</small>
                      {a.complement?.trim() ? (
                        <small className="addr-extra-line">
                          Complemento: {a.complement.trim()}
                        </small>
                      ) : null}
                      <small className="addr-extra-line">
                        Horário: {formatHoursLabel(normalizeHoursPeriods(a.hours))}
                      </small>
                    </span>
                  </label>
                  {selected ? (
                    <div className="stop-extra">
                      <div className="kind-checks">
                        <label className="kind-check">
                          <input
                            type="checkbox"
                            checked={flags.entrega}
                            onChange={() => toggleKindFlag(a.id, "entrega")}
                          />
                          Entrega
                        </label>
                        <label className="kind-check">
                          <input
                            type="checkbox"
                            checked={flags.retirada}
                            onChange={() => toggleKindFlag(a.id, "retirada")}
                          />
                          Retirada
                        </label>
                      </div>
                      <label className="boxes-field">
                        <span>Caixas</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className="boxes-input"
                          value={stopBoxes[a.id] ?? 0}
                          onChange={(e) =>
                            setStopBoxes((prev) => ({
                              ...prev,
                              [a.id]: normalizeBoxes(e.target.value),
                            }))
                          }
                        />
                      </label>
                      <textarea
                        className="notes-input"
                        rows={4}
                        value={stopNotes[a.id] || ""}
                        onChange={(e) =>
                          setStopNotes((prev) => ({
                            ...prev,
                            [a.id]: e.target.value,
                          }))
                        }
                        placeholder="Observações (texto livre, sem limite curto)"
                      />
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <div className="row-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => void optimizeAndSave()}
            disabled={status.kind === "busy"}
          >
            Salvar alterações
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={clearRoute}
            disabled={status.kind === "busy"}
          >
            Limpar rota
          </button>
        </div>

        <p className="hint">
          Distância salva: <strong>{formatKm(saved.totalKm)}</strong>
          {saved.totalKm > 0 ? (
            <>
              {" "}
              · ~
              <strong>
                {formatMoneyBRL(
                  saved.totalKm *
                    resolveMotoboyPricePerKm(
                      data.motoboys.find((m) => m.id === (motoboyId || saved.motoboyId)),
                      data.pricePerKm || DEFAULT_PRICE_PER_KM,
                    ),
                )}
              </strong>
            </>
          ) : null}
          {" · "}
          Caixas na seleção:{" "}
          <strong className="boxes-total-inline">{draftBoxesTotal}</strong>
          {saved.stops.length ? (
            <>
              {" "}
              · na rota salva:{" "}
              <strong className="boxes-total-inline">
                {totalBoxes(saved.stops)}
              </strong>
            </>
          ) : null}
        </p>

        {status.text ? (
          <div
            className={`status ${status.kind === "ok" ? "ok" : ""} ${
              status.kind === "err" ? "err" : ""
            }`}
          >
            {status.text}
          </div>
        ) : null}
      </div>
      </fieldset>

        <RouteCompletionPanel
          route={saved}
          role="company"
          actorName={actorName}
          assignedMotoboyName={
            data.motoboys.find((m) => m.id === saved.motoboyId)?.name || ""
          }
          canComplete={
            Boolean(saved.startAddress.trim()) || saved.stops.length > 0
          }
          onUpdate={(next) => {
            onChange({
              ...data,
              routesByDate: { ...data.routesByDate, [date]: next },
            });
          }}
        />
    </section>
  );
}
