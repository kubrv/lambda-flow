import { formatKm } from "../lib/geo";
import {
  googleMapsDirectionsUrl,
  wazeNavigateUrl,
} from "../lib/mapsLinks";
import type { DayRoute, Motoboy, Weekday } from "../lib/types";
import { WEEKDAYS } from "../lib/types";

type Props = {
  day: Weekday;
  route: DayRoute;
  motoboys: Motoboy[];
};

export function RouteView({ day, route, motoboys }: Props) {
  const dayLabel = WEEKDAYS.find((d) => d.id === day)?.label ?? day;
  const motoboy = motoboys.find((m) => m.id === route.motoboyId);
  const hasStart = route.startAddress.trim().length > 0;
  const hasStops = route.stops.length > 0;

  const googleUrl =
    hasStart && hasStops
      ? googleMapsDirectionsUrl(
          route.startLat != null && route.startLng != null
            ? { lat: route.startLat, lng: route.startLng }
            : route.startAddress,
          route.stops.map((s) =>
            s.lat != null && s.lng != null
              ? { lat: s.lat, lng: s.lng }
              : s.address,
          ),
        )
      : null;

  return (
    <section className="panel">
      <h2>Rota · {dayLabel}</h2>
      <p className="lede">
        Ordem otimizada a partir do ponto de partida. Abra no Google Maps ou
        navegue parada a parada no Waze.
      </p>

      <div className="meta-grid">
        <div className="meta-card">
          <label>Motoboy</label>
          <strong>{motoboy?.name ?? "Não atribuído"}</strong>
        </div>
        <div className="meta-card">
          <label>Total estimado</label>
          <strong>{formatKm(route.totalKm)}</strong>
        </div>
        <div className="meta-card">
          <label>Paradas</label>
          <strong>{route.stops.length}</strong>
        </div>
      </div>

      {!hasStart && !hasStops ? (
        <div className="empty">
          Nenhuma rota montada para este dia ainda.
        </div>
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
                  <a
                    className="btn"
                    href={wazeNavigateUrl(
                      route.startLat != null && route.startLng != null
                        ? { lat: route.startLat, lng: route.startLng }
                        : route.startAddress,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Waze
                  </a>
                ) : null}
              </div>
            </div>

            {route.stops.map((stop, index) => (
              <div className="stop" key={stop.id}>
                <div className="stop-index">{index + 1}</div>
                <div className="stop-body">
                  <strong>{stop.label || `Parada ${index + 1}`}</strong>
                  <p>{stop.address}</p>
                </div>
                <div className="stop-actions">
                  <a
                    className="btn"
                    href={wazeNavigateUrl(
                      stop.lat != null && stop.lng != null
                        ? { lat: stop.lat, lng: stop.lng }
                        : stop.address,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Waze
                  </a>
                </div>
              </div>
            ))}
          </div>

          <div className="row-actions">
            {googleUrl ? (
              <a
                className="btn primary"
                href={googleUrl}
                target="_blank"
                rel="noreferrer"
              >
                Abrir rota no Google Maps
              </a>
            ) : null}
            {route.optimizedAt ? (
              <span className="hint">
                Última otimização:{" "}
                {new Date(route.optimizedAt).toLocaleString("pt-BR")}
              </span>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
