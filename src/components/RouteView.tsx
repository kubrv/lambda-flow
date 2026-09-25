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
import { printDayRoutePdf } from "../lib/printRoutePdf";
import type { DayRoute, Motoboy } from "../lib/types";
import {
  DEFAULT_PRICE_PER_KM,
  normalizeBoxes,
  resolveStopKinds,
  resolveStopNotes,
  totalBoxes,
} from "../lib/types";
import { RouteCompletionPanel } from "./RouteCompletionPanel";

type Props = {
  date: string;
  route: DayRoute;
  motoboys: Motoboy[];
  /** Fallback legado se o motoboy não tiver preço. */
  pricePerKm?: number;
  role?: "company" | "motoboy";
  actorName?: string;
  onRouteChange?: (next: DayRoute) => void;
};

export function RouteView({
  date,
  route,
  motoboys,
  pricePerKm,
  role = "motoboy",
  actorName = "",
  onRouteChange,
}: Props) {
  const dayLabel = formatDateLabel(date);
  const motoboy = motoboys.find((m) => m.id === route.motoboyId);
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
  const completedBy =
    route.motoboyCompletedBy || motoboy?.name || "";

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

  function handlePrintPdf() {
    try {
      printDayRoutePdf({ date, route, motoboys, pricePerKm: rate });
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Não foi possível gerar o PDF.",
      );
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
                      Maps
                    </a>
                    <a
                      className="btn btn-waze"
                      href={wazeNavigateUrl(startPoint)}
                      target="_blank"
                      rel="noreferrer"
                    >
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
                  </div>
                  <div className="stop-actions">
                    <a
                      className="btn btn-maps"
                      href={googleMapsNavigateToUrl(point)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Maps
                    </a>
                    <a
                      className="btn btn-waze"
                      href={wazeNavigateUrl(point)}
                      target="_blank"
                      rel="noreferrer"
                    >
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
                    Maps
                  </a>
                  <a
                    className="btn btn-waze"
                    href={wazeNavigateUrl(startPoint)}
                    target="_blank"
                    rel="noreferrer"
                  >
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
                Abrir rota completa no Google Maps
              </a>
            ) : null}
            <button type="button" className="btn" onClick={handlePrintPdf}>
              PDF com botões Maps/Waze
            </button>
            {route.optimizedAt ? (
              <span className="hint">
                Última otimização:{" "}
                {new Date(route.optimizedAt).toLocaleString("pt-BR")}
              </span>
            ) : null}
          </div>

          {onRouteChange ? (
            <RouteCompletionPanel
              route={route}
              role={role}
              actorName={actorName}
              assignedMotoboyName={motoboy?.name || ""}
              canComplete={hasStart || hasStops}
              onUpdate={onRouteChange}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
