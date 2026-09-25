import { useEffect, useMemo, useState } from "react";
import {
  dateKeysInMonth,
  formatDateLabel,
  formatDateShort,
  localDateKey,
} from "../../lib/dates";
import {
  removeAutoRouteFinance,
  upsertAutoRouteFinance,
} from "../../lib/finance";
import { formatKm } from "../../lib/geo";
import {
  cleanNickname,
  formatMoneyBRL,
  isPresetStart,
  resolveMotoboyPricePerKm,
  resolvePresetStart,
} from "../../lib/labels";
import { optimizeRouteApi } from "../../lib/optimizeApi";
import { normalizeAddress, parsePlaceLine } from "../../lib/parseAddress";
import { deleteDateRoute, upsertSavedAddress } from "../../lib/storage";
import type {
  AppData,
  DayRoute,
  SavedAddress,
  Stop,
  StopKind,
  StopKindFlags,
} from "../../lib/types";
import {
  DEFAULT_PRICE_PER_KM,
  createId,
  emptyRoute,
  flagsToStopKinds,
  getRoute,
  normalizeBoxes,
  resolveStopKinds,
  resolveStopNotes,
  stopKindsToFlags,
  totalBoxes,
} from "../../lib/types";
import { RouteCompletionPanel } from "../RouteCompletionPanel";
import { AddressLookupField } from "./AddressLookupField";

type Props = {
  data: AppData;
  date: string;
  year?: number;
  monthIndex?: number;
  onChange: (next: AppData) => void;
  actorName?: string;
};

type Status = { kind: "idle" | "ok" | "err" | "busy"; text: string };
type StartMode = "default" | "manual";

const DEFAULT_FLAGS: StopKindFlags = { entrega: true, retirada: false };

function hydrateFromRoute(route: DayRoute, addresses: SavedAddress[]) {
  const selectedIds: string[] = [];
  const stopKinds: Record<string, StopKindFlags> = {};
  const stopNotesEntrega: Record<string, string> = {};
  const stopNotesRetirada: Record<string, string> = {};
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
    const notes = resolveStopNotes(s);
    if (notes.entrega) stopNotesEntrega[id] = notes.entrega;
    if (notes.retirada) stopNotesRetirada[id] = notes.retirada;
    stopBoxes[id] = normalizeBoxes(s.boxes);
  }

  return {
    selectedIds,
    stopKinds,
    stopNotesEntrega,
    stopNotesRetirada,
    stopBoxes,
  };
}

export function RouteEditor({
  data,
  date,
  year,
  monthIndex,
  onChange,
  actorName = "Admin",
}: Props) {
  const saved = getRoute(data, date);
  const dayLabel = formatDateLabel(date);
  const preset = resolvePresetStart(data);
  const completion = saved.completionStatus || "open";
  const locked = completion === "completed" || completion === "verified";
  const completedBy =
    saved.motoboyCompletedBy ||
    data.motoboys.find((m) => m.id === saved.motoboyId)?.name ||
    "";
  const calYear = year ?? Number(date.slice(0, 4));
  const calMonth = monthIndex ?? Number(date.slice(5, 7)) - 1;

  const [startMode, setStartMode] = useState<StartMode>("default");
  const [startAddress, setStartAddress] = useState(preset.address);
  const [startLat, setStartLat] = useState<number | null>(preset.lat);
  const [startLng, setStartLng] = useState<number | null>(preset.lng);
  const [motoboyId, setMotoboyId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [stopKinds, setStopKinds] = useState<Record<string, StopKindFlags>>({});
  const [stopNotesEntrega, setStopNotesEntrega] = useState<
    Record<string, string>
  >({});
  const [stopNotesRetirada, setStopNotesRetirada] = useState<
    Record<string, string>
  >({});
  const [stopBoxes, setStopBoxes] = useState<Record<string, number>>({});
  const [returnToStart, setReturnToStart] = useState(true);
  const [filter, setFilter] = useState("");
  const [addrSort, setAddrSort] = useState<"added" | "alpha">("alpha");
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [moveTarget, setMoveTarget] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });
  const [formEpoch, setFormEpoch] = useState(0);
  const [liveKm, setLiveKm] = useState(0);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

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
    // Novas rotas: retorno ligado por padrão; rotas já salvas respeitam o valor gravado.
    setReturnToStart(
      route.stops.length > 0 || route.optimizedAt
        ? Boolean(route.returnToStart)
        : true,
    );
    const h = hydrateFromRoute(route, data.addresses);
    setSelectedIds(h.selectedIds);
    setStopKinds(h.stopKinds);
    setStopNotesEntrega(h.stopNotesEntrega);
    setStopNotesRetirada(h.stopNotesRetirada);
    setStopBoxes(h.stopBoxes);
    setLiveKm(Number(route.totalKm) || 0);
    setExpandedIds([]);
    setFilter("");
    setShowAddPicker(false);
    setMoveTarget({});
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

  const selectedMotoboy = data.motoboys.find((m) => m.id === motoboyId);
  const liveRate = resolveMotoboyPricePerKm(
    selectedMotoboy,
    data.pricePerKm || DEFAULT_PRICE_PER_KM,
  );
  const liveFare = Math.round(liveKm * liveRate * 100) / 100;

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = data.addresses.filter((a) => {
      const selected = selectedIds.includes(a.id);
      if (a.active === false && !selected) {
        // Inativos só aparecem se já estiverem na rota ou na busca
        if (!q) return false;
      }
      if (!q) return a.active !== false || selected;
      const nick = cleanNickname(a.label, a.address).toLowerCase();
      return (
        nick.includes(q) ||
        a.address.toLowerCase().includes(q) ||
        (a.complement || "").toLowerCase().includes(q)
      );
    });
    if (addrSort === "alpha") {
      list = [...list].sort((a, b) =>
        cleanNickname(a.label, a.address).localeCompare(
          cleanNickname(b.label, b.address),
          "pt-BR",
          { sensitivity: "base" },
        ),
      );
    } else {
      list = [...list].sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        if (ta && tb && ta !== tb) return ta - tb;
        return (
          data.addresses.findIndex((x) => x.id === a.id) -
          data.addresses.findIndex((x) => x.id === b.id)
        );
      });
    }
    return list;
  }, [data.addresses, filter, addrSort, selectedIds]);

  useEffect(() => {
    if (locked) return;
    if (!selectedIds.length) {
      setLiveKm(0);
      return;
    }
    const start = resolvedStart();
    if (!start.address.trim()) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const selected = selectedIds
            .map((id) => data.addresses.find((a) => a.id === id))
            .filter((a): a is SavedAddress => Boolean(a));
          if (!selected.length) return;
          const parsedStart = parsePlaceLine(start.address);
          const cached =
            data.coordCache[normalizeAddress(parsedStart.address)];
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
                id: a.id,
                addressId: a.id,
                address: a.address,
                label: cleanNickname(a.label, a.address),
                kinds,
                kind: kinds.length === 1 ? kinds[0] : undefined,
                ...notesFor(a.id),
                boxes: normalizeBoxes(stopBoxes[a.id]),
                complement: a.complement?.trim() || undefined,
                hours: a.hours,
                lat: a.lat,
                lng: a.lng,
              };
            }),
          });
          if (!cancelled) setLiveKm(Number(result.totalKm) || 0);
        } catch {
          // Mantém o último km conhecido no preview.
        }
      })();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- preview ao mudar seleção
  }, [
    selectedIds,
    returnToStart,
    startMode,
    startAddress,
    startLat,
    startLng,
    locked,
    date,
  ]);

  function resolvedStart() {
    if (startMode === "default") {
      const p = resolvePresetStart(data);
      return { address: p.address, lat: p.lat, lng: p.lng };
    }
    return { address: startAddress.trim(), lat: startLat, lng: startLng };
  }

  function notesFor(id: string) {
    const entrega = (stopNotesEntrega[id] || "").trim();
    const retirada = (stopNotesRetirada[id] || "").trim();
    return {
      notesEntrega: entrega || undefined,
      notesRetirada: retirada || undefined,
      notes: entrega || retirada || undefined,
    };
  }

  function toggleAddress(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        setStopKinds((k) => {
          const n = { ...k };
          delete n[id];
          return n;
        });
        setStopNotesEntrega((n) => {
          const x = { ...n };
          delete x[id];
          return x;
        });
        setStopNotesRetirada((n) => {
          const x = { ...n };
          delete x[id];
          return x;
        });
        setStopBoxes((b) => {
          const x = { ...b };
          delete x[id];
          return x;
        });
        setExpandedIds((e) => e.filter((x) => x !== id));
        return prev.filter((x) => x !== id);
      }
      setStopKinds((k) => ({ ...k, [id]: k[id] || { ...DEFAULT_FLAGS } }));
      setStopBoxes((b) => ({ ...b, [id]: b[id] ?? 0 }));
      setShowAddPicker(false);
      setExpandedIds((e) => (e.includes(id) ? e : [...e, id]));
      return [...prev, id];
    });
  }

  function moveStopToDate(addressId: string, targetDate: string) {
    if (!targetDate || targetDate === date) {
      setStatus({ kind: "err", text: "Escolha outro dia no calendário." });
      return;
    }
    if (locked) {
      setStatus({
        kind: "err",
        text: "Rota concluída — reabra para mover endereços.",
      });
      return;
    }
    const addr = data.addresses.find((a) => a.id === addressId);
    if (!addr) return;
    const kinds = flagsToStopKinds(stopKinds[addressId] || DEFAULT_FLAGS);
    const n = notesFor(addressId);
    const stop: Stop = {
      id: createId(),
      addressId,
      address: addr.address,
      label: cleanNickname(addr.label, addr.address),
      kinds,
      kind: kinds.length === 1 ? kinds[0] : undefined,
      notes: n.notes,
      notesEntrega: n.notesEntrega,
      notesRetirada: n.notesRetirada,
      boxes: normalizeBoxes(stopBoxes[addressId]),
      complement: addr.complement?.trim() || undefined,
      hours: addr.hours,
      lat: addr.lat,
      lng: addr.lng,
    };

    const target = getRoute(data, targetDate);
    const targetStops = target.stops.filter(
      (s) =>
        s.addressId !== addressId &&
        normalizeAddress(s.address) !== normalizeAddress(addr.address),
    );
    const nextTarget: DayRoute = {
      ...emptyRoute(targetDate),
      ...target,
      date: targetDate,
      stops: [...targetStops, stop],
      // Mantém km antigo até reotimizar o dia destino
      totalKm: target.totalKm || 0,
      optimizedAt: target.optimizedAt,
    };

    const current = getRoute(data, date);
    const nextCurrentStops = current.stops.filter(
      (s) =>
        s.addressId !== addressId &&
        normalizeAddress(s.address) !== normalizeAddress(addr.address),
    );
    const nextCurrent: DayRoute = {
      ...current,
      date,
      stops: nextCurrentStops,
    };

    const routesByDate = { ...data.routesByDate };
    if (nextCurrentStops.length || nextCurrent.startAddress.trim()) {
      routesByDate[date] = nextCurrent;
    } else {
      delete routesByDate[date];
    }
    routesByDate[targetDate] = nextTarget;

    onChange({ ...data, routesByDate });
    toggleAddress(addressId);
    setStatus({
      kind: "ok",
      text: `Endereço movido para ${formatDateShort(targetDate)} (com observações). Reotimize aquele dia se precisar.`,
    });
    setFormEpoch((n) => n + 1);
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleKindFlag(id: string, flag: StopKind) {
    setStopKinds((prev) => {
      const current = prev[id] || { ...DEFAULT_FLAGS };
      const next = { ...current, [flag]: !current[flag] };
      if (!next.entrega && !next.retirada) next[flag] = true;
      return { ...prev, [id]: next };
    });
  }

  async function clearRoute() {
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

    try {
      await deleteDateRoute(date);
    } catch (e) {
      setStatus({
        kind: "err",
        text:
          e instanceof Error
            ? e.message
            : "Falha ao limpar a rota no banco.",
      });
      return;
    }

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
    if (!motoboyId) {
      setStatus({
        kind: "err",
        text: "Selecione um motoboy antes de salvar a rota.",
      });
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
            ...notesFor(a.id),
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
          notesEntrega:
            (matched && notesFor(matched.id).notesEntrega) ||
            s.notesEntrega ||
            undefined,
          notesRetirada:
            (matched && notesFor(matched.id).notesRetirada) ||
            s.notesRetirada ||
            undefined,
          notes:
            (matched && notesFor(matched.id).notes) || s.notes || undefined,
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
      setLiveKm(Number(result.totalKm) || 0);
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
            <option value="manual">Buscar outro endereço</option>
          </select>
        </div>

        {startMode === "manual" ? (
          <div className="field">
            <label>Endereço de partida</label>
            <AddressLookupField
              idPrefix={`route-start-${date}`}
              initialAddress={startAddress}
              initialLat={startLat}
              initialLng={startLng}
              resetKey={`${date}-${formEpoch}-${startMode}`}
              onResolved={(place) => {
                if (!place) {
                  setStartLat(null);
                  setStartLng(null);
                  return;
                }
                setStartAddress(place.address);
                setStartLat(place.lat);
                setStartLng(place.lng);
              }}
            />
            {startAddress.trim() && startLat != null && startLng != null ? (
              <p className="hint" style={{ marginTop: "0.45rem" }}>
                Partida desta rota: <strong>{startAddress}</strong>
              </p>
            ) : (
              <p className="hint" style={{ marginTop: "0.45rem" }}>
                Digite a rua ou cole um link do Maps e confirme o ponto.
              </p>
            )}
          </div>
        ) : (
          <p className="hint">
            Usando a partida padrão. Para outro lugar, escolha{" "}
            <strong>Outro endereço</strong> e busque no mapa.
          </p>
        )}

        <div className="field">
          <label htmlFor="motoboy">Motoboy (obrigatório)</label>
          <select
            id="motoboy"
            value={motoboyId}
            onChange={(e) => setMotoboyId(e.target.value)}
            required
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
          {!motoboyId ? (
            <p className="hint">Escolha o motoboy para poder salvar a rota.</p>
          ) : null}
        </div>

        <label className="address-check return-check">
          <input
            type="checkbox"
            checked={returnToStart}
            onChange={(e) => setReturnToStart(e.target.checked)}
          />
          <span>
            <strong>Retornar ao ponto de partida no fim</strong>
            <small>Ligado por padrão</small>
          </span>
        </label>

        <div className="live-fare-bar" role="status">
          <div>
            <label>Valor estimado da rota</label>
            <strong>{formatMoneyBRL(liveFare)}</strong>
          </div>
          <div>
            <label>Km</label>
            <strong>{formatKm(liveKm)}</strong>
          </div>
          <div>
            <label>Paradas</label>
            <strong>{selectedIds.length}</strong>
          </div>
          <div>
            <label>Caixas a entregar</label>
            <strong>{draftBoxesTotal}</strong>
          </div>
        </div>

        <div className="route-stops-head">
          <div>
            <h3 className="route-stops-title">
              Paradas da rota ({selectedIds.length})
            </h3>
            <p className="hint" style={{ margin: 0 }}>
              Só entram na rota os endereços que você adicionar. Detalhes e
              observações ficam em cada parada.
            </p>
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={locked}
            onClick={() => setShowAddPicker((v) => !v)}
          >
            {showAddPicker ? "Fechar busca" : "Adicionar endereço"}
          </button>
        </div>

        {showAddPicker ? (
          <div className="route-addr-picker">
            <div className="addr-list-toolbar">
              <div className="field" style={{ flex: 1, minWidth: "10rem" }}>
                <label htmlFor="filter">Buscar no cadastro</label>
                <input
                  id="filter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Apelido ou endereço…"
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="route-addr-sort">Ordenar</label>
                <select
                  id="route-addr-sort"
                  value={addrSort}
                  onChange={(e) =>
                    setAddrSort(e.target.value as "added" | "alpha")
                  }
                >
                  <option value="alpha">Alfabética</option>
                  <option value="added">Ordem de adição</option>
                </select>
              </div>
            </div>
            <div className="route-addr-picker-list">
              {filtered.filter((a) => !selectedIds.includes(a.id)).length ===
              0 ? (
                <div className="empty">
                  {filter.trim()
                    ? "Nenhum endereço encontrado."
                    : "Todos os endereços ativos já estão na rota."}
                </div>
              ) : (
                filtered
                  .filter((a) => !selectedIds.includes(a.id))
                  .map((a) => {
                    const nick = cleanNickname(a.label, a.address);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className="route-addr-pick-item"
                        onClick={() => toggleAddress(a.id)}
                      >
                        <span className="route-addr-pick-plus" aria-hidden>
                          +
                        </span>
                        <span>
                          <strong>{nick}</strong>
                          {a.active === false ? (
                            <small className="addr-extra-hint">Inativo</small>
                          ) : null}
                          <small className="addr-extra-hint">{a.address}</small>
                        </span>
                      </button>
                    );
                  })
              )}
            </div>
          </div>
        ) : null}

        <div className="route-stops-list">
          {selectedIds.length === 0 ? (
            <div className="empty route-stops-empty">
              Nenhuma parada ainda. Clique em <strong>Adicionar endereço</strong>.
            </div>
          ) : (
            selectedIds
              .map((id) => data.addresses.find((a) => a.id === id))
              .filter((a): a is SavedAddress => Boolean(a))
              .sort((a, b) =>
                cleanNickname(a.label, a.address).localeCompare(
                  cleanNickname(b.label, b.address),
                  "pt-BR",
                  { sensitivity: "base" },
                ),
              )
              .map((a) => {
              const expanded = expandedIds.includes(a.id);
              const flags = stopKinds[a.id] || DEFAULT_FLAGS;
              const nick = cleanNickname(a.label, a.address);
              const n = notesFor(a.id);
              const hasExtras =
                Boolean(n.notesEntrega || n.notesRetirada) ||
                normalizeBoxes(stopBoxes[a.id]) > 0 ||
                flags.retirada ||
                !flags.entrega;
              const monthKeys = dateKeysInMonth(calYear, calMonth).filter(
                (k) => k !== date,
              );
              return (
                <div
                  key={a.id}
                  className={`route-stop-card${expanded ? " expanded" : ""}`}
                >
                  <div className="route-stop-card-main">
                    <div>
                      <strong>{nick}</strong>
                      {!expanded && hasExtras ? (
                        <small className="addr-extra-hint">
                          {[
                            flags.entrega ? "Entrega" : null,
                            flags.retirada ? "Retirada" : null,
                            normalizeBoxes(stopBoxes[a.id]) > 0
                              ? `${normalizeBoxes(stopBoxes[a.id])} cx`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      ) : null}
                    </div>
                    <div className="route-stop-card-actions">
                      <button
                        type="button"
                        className={`addr-expand-btn big${expanded ? " open" : ""}`}
                        aria-expanded={expanded}
                        onClick={() => toggleExpanded(a.id)}
                      >
                        {expanded ? "Fechar" : "Detalhes"}
                      </button>
                      <button
                        type="button"
                        className="btn danger ghost"
                        disabled={locked}
                        onClick={() => toggleAddress(a.id)}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                  {expanded ? (
                    <div className="stop-extra">
                      <div className="kind-toggles" role="group" aria-label="Tipo">
                        <button
                          type="button"
                          className={`kind-pill${flags.entrega ? " on" : ""}`}
                          onClick={() => toggleKindFlag(a.id, "entrega")}
                        >
                          Entrega
                        </button>
                        <button
                          type="button"
                          className={`kind-pill${flags.retirada ? " on" : ""}`}
                          onClick={() => toggleKindFlag(a.id, "retirada")}
                        >
                          Retirada
                        </button>
                      </div>
                      <div className="stop-extra-row">
                        <label className="boxes-field">
                          <span>Caixas a serem entregues</span>
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
                      </div>
                      {flags.entrega ? (
                        <label className="notes-field">
                          <span>Observações da entrega</span>
                          <textarea
                            className="notes-input"
                            rows={2}
                            value={stopNotesEntrega[a.id] || ""}
                            onChange={(e) =>
                              setStopNotesEntrega((prev) => ({
                                ...prev,
                                [a.id]: e.target.value,
                              }))
                            }
                            placeholder="Obs. só da entrega (opcional)"
                          />
                        </label>
                      ) : null}
                      {flags.retirada ? (
                        <label className="notes-field">
                          <span>Observações da retirada</span>
                          <textarea
                            className="notes-input"
                            rows={2}
                            value={stopNotesRetirada[a.id] || ""}
                            onChange={(e) =>
                              setStopNotesRetirada((prev) => ({
                                ...prev,
                                [a.id]: e.target.value,
                              }))
                            }
                            placeholder="Obs. só da retirada (opcional)"
                          />
                        </label>
                      ) : null}
                      <div className="move-stop-row">
                        <label className="field" style={{ flex: 1 }}>
                          <span>Mover para outro dia</span>
                          <select
                            value={moveTarget[a.id] || ""}
                            onChange={(e) =>
                              setMoveTarget((prev) => ({
                                ...prev,
                                [a.id]: e.target.value,
                              }))
                            }
                            disabled={locked}
                          >
                            <option value="">Escolher data…</option>
                            {monthKeys.map((k) => (
                              <option key={k} value={k}>
                                {formatDateShort(k)}
                                {k === localDateKey() ? " (hoje)" : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="btn"
                          disabled={locked || !moveTarget[a.id]}
                          onClick={() =>
                            moveStopToDate(a.id, moveTarget[a.id] || "")
                          }
                        >
                          Mover
                        </button>
                      </div>
                      <p className="hint">
                        Leva entrega/retirada, caixas e observações para o dia
                        escolhido.
                      </p>
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
            disabled={status.kind === "busy" || !motoboyId || !selectedIds.length}
          >
            Salvar alterações
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => void clearRoute()}
            disabled={status.kind === "busy"}
          >
            Limpar rota
          </button>
        </div>

        <p className="hint">
          Distância: <strong>{formatKm(liveKm || saved.totalKm)}</strong>
          {" · "}
          Valor:{" "}
          <strong>
            {formatMoneyBRL(
              liveKm > 0
                ? liveFare
                : saved.totalKm *
                    resolveMotoboyPricePerKm(
                      data.motoboys.find(
                        (m) => m.id === (motoboyId || saved.motoboyId),
                      ),
                      data.pricePerKm || DEFAULT_PRICE_PER_KM,
                    ),
            )}
          </strong>
          {" · "}
          Caixas a entregar:{" "}
          <strong className="boxes-total-inline">{draftBoxesTotal}</strong>
          {saved.stops.length ? (
            <>
              {" "}
              · salvas:{" "}
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
