import { useState } from "react";
import { formatKm } from "../lib/geo";
import { formatDateLabel } from "../lib/dates";
import { formatHoursLabel, normalizeHoursPeriods } from "../lib/hours";
import {
  formatMoneyBRL,
  motoboyStopTitle,
  resolveMotoboyPricePerKm,
} from "../lib/labels";
import {
  googleMapsDirectionsUrl,
  googleMapsNavigateToUrl,
  pointFromCoords,
  wazeNavigateUrl,
} from "../lib/mapsLinks";
import { printDayRoutePdf, buildDayRouteText } from "../lib/printRoutePdf";
import type {
  DayRoute,
  Motoboy,
  SavedAddress,
  StopVisitOutcome,
} from "../lib/types";
import {
  DEFAULT_PRICE_PER_KM,
  normalizeBoxes,
  resolveStopKinds,
  resolveStopNotes,
  totalBoxes,
} from "../lib/types";
import {
  formatWhatsappDisplay,
  whatsappDeliveryNotifyUrl,
  type VisitOutcome,
} from "../lib/whatsapp";
import { sendWhatsappDeliveryNotify } from "../lib/whatsappApi";
import { GoogleMapsIcon, WazeIcon } from "./NavBrandIcons";
import { RouteCompletionPanel } from "./RouteCompletionPanel";

type WaSendState = "idle" | "sending" | "sent" | "error";

type Props = {
  date: string;
  route: DayRoute;
  motoboys: Motoboy[];
  addresses?: SavedAddress[];
  pricePerKm?: number;
  role?: "company" | "motoboy";
  actorName?: string;
  /** ID do motoboy logado (só role motoboy). */
  viewerMotoboyId?: string | null;
  onRouteChange?: (next: DayRoute) => void;
};

function outcomeLabel(o?: StopVisitOutcome | null): string {
  if (o === "ok") return "Entregue / retirado";
  if (o === "destinatario_ausente") return "Destinatário ausente";
  if (o === "consultorio_fechado") return "Consultório fechado";
  return "";
}

export function RouteView({
  date,
  route,
  motoboys,
  addresses = [],
  pricePerKm,
  role = "motoboy",
  actorName = "",
  viewerMotoboyId = null,
  onRouteChange,
}: Props) {
  const [waSendByStop, setWaSendByStop] = useState<
    Record<string, { state: WaSendState; message?: string }>
  >({});
  const [routeText, setRouteText] = useState("");
  const [textCopied, setTextCopied] = useState(false);
  const dayLabel = formatDateLabel(date);
  const motoboy = motoboys.find((m) => m.id === route.motoboyId);
  const isAssignedBoy =
    role === "company" ||
    (Boolean(viewerMotoboyId) &&
      Boolean(route.motoboyId) &&
      viewerMotoboyId === route.motoboyId);

  if (role === "motoboy" && !isAssignedBoy) {
    return (
      <section className="panel">
        <h2>Rota · {dayLabel}</h2>
        <div className="status err" style={{ marginTop: "0.75rem" }}>
          Rota indisponível para visualização: você não é o motoboy responsável
          {motoboy?.name ? (
            <>
              {" "}
              (atribuída a <strong>{motoboy.name}</strong>)
            </>
          ) : (
            " (nenhum motoboy atribuído)"
          )}
          .
        </div>
        <p className="hint" style={{ marginTop: "0.75rem" }}>
          Só o motoboy da rota pode ver as paradas, avisar no WhatsApp e marcar
          como concluída.
        </p>
      </section>
    );
  }

  const rate = resolveMotoboyPricePerKm(
    motoboy,
    pricePerKm || DEFAULT_PRICE_PER_KM,
  );
  const hasStart = route.startAddress.trim().length > 0;
  const hasStops = route.stops.length > 0;
  const estimatedFare = route.totalKm * rate;
  const boxesSum = totalBoxes(route.stops);
  const completion = route.completionStatus || "open";
  const locked = completion === "completed" || completion === "verified";
  const completedBy = route.motoboyCompletedBy || motoboy?.name || "";
  const canEditStops = Boolean(onRouteChange) && !locked;

  const startPoint = pointFromCoords(
    route.startLat,
    route.startLng,
    route.startAddress,
  );

  const stopPoints = route.stops.map((s) =>
    pointFromCoords(s.lat, s.lng, s.address),
  );

  const googleUrl =
    hasStart && hasStops
      ? googleMapsDirectionsUrl(startPoint, stopPoints, {
          returnToStart: route.returnToStart,
        })
      : null;

  const firstStop = route.stops[0];
  const firstWaze =
    firstStop != null
      ? wazeNavigateUrl(
          pointFromCoords(firstStop.lat, firstStop.lng, firstStop.address),
        )
      : hasStart
        ? wazeNavigateUrl(startPoint)
        : null;

  function patchStop(
    stopId: string,
    patch: Partial<(typeof route.stops)[number]>,
  ) {
    if (!onRouteChange) return;
    onRouteChange({
      ...route,
      stops: route.stops.map((s) =>
        s.id === stopId ? { ...s, ...patch } : s,
      ),
    });
  }

  function handlePrintPdf() {
    try {
      printDayRoutePdf({ date, route, motoboys, pricePerKm: rate });
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Não foi possível gerar o PDF.",
      );
    }
  }

  function handleGenerateRouteText() {
    const text = buildDayRouteText({
      date,
      route,
      motoboys,
      pricePerKm: rate,
    });
    setRouteText(text);
    setTextCopied(false);
    void navigator.clipboard.writeText(text).then(
      () => setTextCopied(true),
      () => {
        /* mostra o texto para copiar manualmente */
      },
    );
  }

  async function handleCopyRouteText() {
    const text =
      routeText ||
      buildDayRouteText({ date, route, motoboys, pricePerKm: rate });
    if (!routeText) setRouteText(text);
    try {
      await navigator.clipboard.writeText(text);
      setTextCopied(true);
    } catch {
      window.alert("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  async function handleMetaNotify(input: {
    stopId: string;
    phone: string;
    placeName: string;
    address: string;
    boxes: number;
    kinds: Array<"entrega" | "retirada">;
    notesEntrega: string;
    notesRetirada: string;
    outcome?: VisitOutcome;
  }) {
    setWaSendByStop((prev) => ({
      ...prev,
      [input.stopId]: { state: "sending" },
    }));
    try {
      await sendWhatsappDeliveryNotify({
        phone: input.phone,
        placeName: input.placeName,
        address: input.address,
        kinds: input.kinds,
        boxes: input.boxes,
        notesEntrega: input.notesEntrega,
        notesRetirada: input.notesRetirada,
        motoboyName: motoboy?.name || actorName,
        dateLabel: dayLabel,
        outcome: input.outcome,
      });
      setWaSendByStop((prev) => ({
        ...prev,
        [input.stopId]: { state: "sent", message: "Mensagem enviada no WhatsApp." },
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao enviar via Meta.";
      setWaSendByStop((prev) => ({
        ...prev,
        [input.stopId]: { state: "error", message },
      }));
    }
  }

  return (
    <section className="panel">
      <h2>Rota · {dayLabel}</h2>
      <p className="lede">
        Ordem do dia. Use os botões grandes para abrir a rota completa ou
        navegar parada a parada.
      </p>

      {locked ? (
        <div className="status ok" style={{ marginBottom: "0.75rem" }}>
          {completion === "verified" ? "Verificada" : "Concluída"}
          {completedBy ? (
            <>
              {" "}
              por <strong>{completedBy}</strong>
            </>
          ) : null}
          . Ordem e valores desta rota estão fechados.
        </div>
      ) : null}

      {hasStart || hasStops ? (
        <div className="route-nav-bar">
          {googleUrl ? (
            <a
              className="btn primary route-nav-main"
              href={googleUrl}
              target="_blank"
              rel="noreferrer"
            >
              <GoogleMapsIcon size={18} />
              Abrir rota completa no Google Maps
            </a>
          ) : null}
          {firstWaze ? (
            <a
              className="btn btn-waze route-nav-main"
              href={firstWaze}
              target="_blank"
              rel="noreferrer"
            >
              <WazeIcon size={18} />
              Waze · {firstStop ? "1ª parada" : "partida"}
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="meta-grid">
        <div className="meta-card">
          <label>Motoboy</label>
          <strong>
            {motoboy?.name ?? "Não atribuído"}
            {motoboy?.company ? ` · ${motoboy.company}` : ""}
          </strong>
          {motoboy ? (
            <span className="hint">{formatMoneyBRL(rate)}/km</span>
          ) : null}
        </div>
        <div className="meta-card">
          <label>Total estimado</label>
          <strong>{formatKm(route.totalKm)}</strong>
        </div>
        <div className="meta-card">
          <label>Paradas</label>
          <strong>
            {route.stops.length}
            {route.returnToStart ? " + retorno" : ""}
          </strong>
        </div>
        <div className="meta-card">
          <label>Valor estimado</label>
          <strong>{formatMoneyBRL(estimatedFare)}</strong>
        </div>
      </div>

      {hasStops ? (
        <div className="boxes-total-banner" role="status">
          <span>Total de caixas</span>
          <strong className="boxes-qty">{boxesSum}</strong>
        </div>
      ) : null}

      {!hasStart && !hasStops ? (
        <div className="empty">Nenhuma rota montada para este dia ainda.</div>
      ) : (
        <>
          <div className="stops" style={{ marginBottom: "0.85rem" }}>
            <div className="stop">
              <div className="stop-index">P</div>
              <div className="stop-body">
                <strong>Ponto de partida</strong>
                <p>{route.startAddress || "—"}</p>
              </div>
              <div className="stop-actions">
                {hasStart ? (
                  <>
                    <a
                      className="btn btn-maps"
                      href={googleMapsNavigateToUrl(startPoint)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <GoogleMapsIcon />
                      Maps
                    </a>
                    <a
                      className="btn btn-waze"
                      href={wazeNavigateUrl(startPoint)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <WazeIcon />
                      Waze
                    </a>
                  </>
                ) : null}
              </div>
            </div>

            {route.stops.map((stop, index) => {
              const kinds = resolveStopKinds(stop);
              const boxes = normalizeBoxes(stop.boxes);
              const notes = resolveStopNotes(stop);
              const point = pointFromCoords(stop.lat, stop.lng, stop.address);
              const catalog = stop.addressId
                ? addresses.find((a) => a.id === stop.addressId)
                : addresses.find(
                    (a) =>
                      a.address.trim().toLowerCase() ===
                      stop.address.trim().toLowerCase(),
                  );
              const waPhone =
                stop.whatsapp?.trim() || catalog?.whatsapp?.trim() || "";
              const placeName =
                stop.label ||
                catalog?.label ||
                stop.address.split(",")[0] ||
                "destino";
              const outcome = stop.visitOutcome || undefined;
              const notifyPayload = {
                stopId: stop.id,
                phone: waPhone,
                placeName,
                address: stop.address,
                boxes,
                kinds,
                notesEntrega: notes.entrega,
                notesRetirada: notes.retirada,
                outcome: outcome as VisitOutcome | undefined,
              };
              const waUrl = waPhone
                ? whatsappDeliveryNotifyUrl({
                    phone: waPhone,
                    placeName,
                    address: stop.address,
                    kinds,
                    boxes,
                    notesEntrega: notes.entrega,
                    notesRetirada: notes.retirada,
                    motoboyName: motoboy?.name || actorName,
                    dateLabel: dayLabel,
                    outcome: outcome as VisitOutcome | undefined,
                  })
                : null;
              const waSend = waSendByStop[stop.id] || { state: "idle" as const };
              const doneLabel =
                kinds.includes("entrega") && kinds.includes("retirada")
                  ? "Entregue / retirado"
                  : kinds.includes("retirada")
                    ? "Retirado"
                    : "Entregue";

              return (
                <div className="stop" key={stop.id}>
                  <div className="stop-index">{index + 1}</div>
                  <div className="stop-body">
                    <strong>
                      {motoboyStopTitle(index, stop.label, stop.address)}
                    </strong>
                    <p>{stop.address}</p>
                    {stop.complement?.trim() ? (
                      <p className="stop-complement">
                        <strong>Complemento:</strong> {stop.complement.trim()}
                      </p>
                    ) : null}
                    <p className="stop-hours">
                      <strong>Horário:</strong>{" "}
                      {formatHoursLabel(normalizeHoursPeriods(stop.hours))}
                    </p>
                    <div className="kind-badges">
                      {kinds.includes("entrega") ? (
                        <span className="kind-badge entrega">Entrega</span>
                      ) : null}
                      {kinds.includes("retirada") ? (
                        <span className="kind-badge retirada">Retirada</span>
                      ) : null}
                      {boxes > 0 ? (
                        <span className="boxes-qty">
                          {boxes}{" "}
                          {boxes === 1
                            ? "caixa a entregar"
                            : "caixas a entregar"}
                        </span>
                      ) : null}
                      {outcome ? (
                        <span className={`kind-badge outcome-${outcome}`}>
                          {outcomeLabel(outcome)}
                        </span>
                      ) : null}
                    </div>
                    {notes.entrega ? (
                      <p className="stop-notes">
                        <strong>Obs. entrega:</strong> {notes.entrega}
                      </p>
                    ) : null}
                    {notes.retirada ? (
                      <p className="stop-notes">
                        <strong>Obs. retirada:</strong> {notes.retirada}
                      </p>
                    ) : null}
                    {waPhone ? (
                      <p className="hint" style={{ marginTop: "0.35rem" }}>
                        WhatsApp destino: {formatWhatsappDisplay(waPhone)}
                      </p>
                    ) : (
                      <p className="hint" style={{ marginTop: "0.35rem" }}>
                        Sem WhatsApp no cadastro deste endereço.
                      </p>
                    )}
                    {waSend.state === "sent" ? (
                      <p className="status ok" style={{ marginTop: "0.4rem" }}>
                        {waSend.message || "Aviso enviado."}
                      </p>
                    ) : null}
                    {waSend.state === "error" ? (
                      <p className="status err" style={{ marginTop: "0.4rem" }}>
                        {waSend.message}
                      </p>
                    ) : null}

                    {canEditStops ? (
                      <div className="stop-outcome-row">
                        <button
                          type="button"
                          className={`btn ${outcome === "ok" ? "primary" : "ghost"}`}
                          onClick={() =>
                            patchStop(stop.id, { visitOutcome: "ok" })
                          }
                        >
                          {doneLabel}
                        </button>
                        <button
                          type="button"
                          className={`btn ${outcome === "destinatario_ausente" ? "primary" : "ghost"}`}
                          onClick={() =>
                            patchStop(stop.id, {
                              visitOutcome: "destinatario_ausente",
                            })
                          }
                        >
                          Destinatário ausente
                        </button>
                        <button
                          type="button"
                          className={`btn ${outcome === "consultorio_fechado" ? "primary" : "ghost"}`}
                          onClick={() =>
                            patchStop(stop.id, {
                              visitOutcome: "consultorio_fechado",
                            })
                          }
                        >
                          Consultório fechado
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="stop-actions">
                    {waPhone ? (
                      <button
                        type="button"
                        className="btn btn-whatsapp"
                        disabled={waSend.state === "sending"}
                        onClick={() => void handleMetaNotify(notifyPayload)}
                      >
                        {waSend.state === "sending"
                          ? "Enviando…"
                          : "Enviar WhatsApp"}
                      </button>
                    ) : null}
                    {waUrl ? (
                      <a
                        className="btn btn-whatsapp-alt"
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir WhatsApp
                      </a>
                    ) : null}
                    <a
                      className="btn btn-maps"
                      href={googleMapsNavigateToUrl(point)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <GoogleMapsIcon />
                      Maps
                    </a>
                    <a
                      className="btn btn-waze"
                      href={wazeNavigateUrl(point)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <WazeIcon />
                      Waze
                    </a>
                  </div>
                </div>
              );
            })}

            {route.returnToStart && hasStart ? (
              <div className="stop">
                <div className="stop-index">R</div>
                <div className="stop-body">
                  <strong>Retorno ao ponto de partida</strong>
                  <p>{route.startAddress}</p>
                  <span className="kind-badge retorno">Retorno</span>
                </div>
                <div className="stop-actions">
                  <a
                    className="btn btn-maps"
                    href={googleMapsNavigateToUrl(startPoint)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <GoogleMapsIcon />
                    Maps
                  </a>
                  <a
                    className="btn btn-waze"
                    href={wazeNavigateUrl(startPoint)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <WazeIcon />
                    Waze
                  </a>
                </div>
              </div>
            ) : null}
          </div>

          {route.totalKm > 0 ? (
            <div className="fare-box">
              <p>
                <strong>Valor estimado da rota:</strong>{" "}
                {formatMoneyBRL(estimatedFare)} ({formatKm(route.totalKm)} ×{" "}
                {formatMoneyBRL(rate)}/km)
              </p>
              <p className="hint">
                Este valor é apenas uma estimativa. O valor real no fim da
                corrida pode ser diferente.
              </p>
            </div>
          ) : null}

          <div className="route-nav-bar bottom">
            {googleUrl ? (
              <a
                className="btn primary route-nav-main"
                href={googleUrl}
                target="_blank"
                rel="noreferrer"
              >
                <GoogleMapsIcon size={18} />
                Abrir rota completa no Google Maps
              </a>
            ) : null}
            <button type="button" className="btn" onClick={handlePrintPdf}>
              PDF com botões Maps/Waze
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={handleGenerateRouteText}
            >
              Copiar em texto
            </button>
            {route.optimizedAt ? (
              <span className="hint">
                Última otimização:{" "}
                {new Date(route.optimizedAt).toLocaleString("pt-BR")}
              </span>
            ) : null}
          </div>

          {routeText ? (
            <div className="period-box report-text-box" style={{ marginTop: "0.85rem" }}>
              <div className="row-actions" style={{ marginBottom: "0.5rem" }}>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void handleCopyRouteText()}
                >
                  {textCopied ? "Copiado!" : "Copiar texto"}
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setRouteText("");
                    setTextCopied(false);
                  }}
                >
                  Fechar
                </button>
              </div>
              <textarea
                className="report-text-area"
                rows={14}
                readOnly
                value={routeText}
              />
            </div>
          ) : null}

          {onRouteChange ? (
            <RouteCompletionPanel
              route={route}
              role={role}
              actorName={actorName}
              assignedMotoboyName={motoboy?.name || ""}
              canComplete={
                (hasStart || hasStops) &&
                (role === "company" || isAssignedBoy)
              }
              isAssignedMotoboy={isAssignedBoy}
              onUpdate={onRouteChange}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
