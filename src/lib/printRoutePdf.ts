import { formatKm } from "./geo";
import { formatMoneyBRL, motoboyStopTitle } from "./labels";
import { formatDateLabel, formatDateShort } from "./dates";
import { formatHoursLabel, normalizeHoursPeriods } from "./hours";
import {
  googleMapsDirectionsUrl,
  googleMapsNavigateToUrl,
  pointFromCoords,
  wazeNavigateUrl,
} from "./mapsLinks";
import { esc, printHtmlDocument } from "./printHtml";
import type { DayRoute, Motoboy } from "./types";
import {
  DEFAULT_PRICE_PER_KM,
  normalizeBoxes,
  resolveStopKinds,
  resolveStopNotes,
  totalBoxes,
} from "./types";

/** Logo embutido (badge) para o PDF — não depende de rede. */
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40" aria-hidden="true">
  <rect width="64" height="64" rx="14" fill="#38E8FF"/>
  <g fill="#031018" transform="translate(8 8) scale(0.75)">
    <path d="M18 54 L32 10 L38 10 L24 54 Z"/>
    <path d="M28 34 L50 54 L42 54 L26 38 Z"/>
  </g>
</svg>`;

function navButtonsHtml(
  mapsUrl: string,
  wazeUrl: string,
  mapsLabel = "Maps",
  wazeLabel = "Waze",
): string {
  return `
    <div class="nav-btns">
      <a class="nav-btn maps" href="${esc(mapsUrl)}" target="_blank" rel="noreferrer">${esc(mapsLabel)}</a>
      <a class="nav-btn waze" href="${esc(wazeUrl)}" target="_blank" rel="noreferrer">${esc(wazeLabel)}</a>
    </div>`;
}

/** Nome do arquivo: Rota-dia-DD-MM-AAAA */
export function dayRouteFileName(dateKey: string): string {
  const short = formatDateShort(dateKey).replace(/\//g, "-");
  return `Rota-dia-${short}`;
}

function outcomeText(o?: string | null): string {
  if (o === "ok") return "Entregue / retirado";
  if (o === "destinatario_ausente") return "Destinatário ausente";
  if (o === "consultorio_fechado") return "Consultório fechado";
  return "";
}

/** Texto completo da rota do dia — para copiar / WhatsApp. */
export function buildDayRouteText(input: {
  date: string;
  route: DayRoute;
  motoboys: Motoboy[];
  pricePerKm: number;
}): string {
  const dayLabel = formatDateLabel(input.date);
  const motoboy = input.motoboys.find((m) => m.id === input.route.motoboyId);
  const rate =
    Number.isFinite(input.pricePerKm) && input.pricePerKm > 0
      ? input.pricePerKm
      : DEFAULT_PRICE_PER_KM;
  const fare = input.route.totalKm * rate;
  const boxesSum = totalBoxes(input.route.stops);
  const completion = input.route.completionStatus || "open";
  const lines: string[] = [];

  lines.push(`Rota Rotaz — ${dayLabel}`);
  lines.push("");
  lines.push(
    `Motoboy: ${motoboy?.name || "Não atribuído"}${
      motoboy?.company ? ` · ${motoboy.company}` : ""
    }`,
  );
  lines.push(`Km: ${formatKm(input.route.totalKm || 0)}`);
  lines.push(
    `Valor estimado: ${formatMoneyBRL(fare)} (${formatMoneyBRL(rate)}/km)`,
  );
  lines.push(`Paradas: ${input.route.stops.length}`);
  if (boxesSum > 0) {
    lines.push(
      `Total de caixas: ${boxesSum} ${boxesSum === 1 ? "caixa" : "caixas"}`,
    );
  }
  lines.push(
    `Status: ${
      completion === "verified"
        ? "Verificada"
        : completion === "completed"
          ? "Concluída"
          : "Em andamento"
    }${
      input.route.motoboyCompletedBy
        ? ` · ${input.route.motoboyCompletedBy}`
        : ""
    }`,
  );
  if (input.route.returnToStart) {
    lines.push("Retorno ao ponto de partida: sim");
  }
  lines.push("");

  lines.push("— Partida —");
  lines.push(input.route.startAddress.trim() || "(sem endereço de partida)");
  lines.push("");

  lines.push("— Paradas —");
  if (!input.route.stops.length) {
    lines.push("(nenhuma)");
  } else {
    input.route.stops.forEach((stop, index) => {
      const kinds = resolveStopKinds(stop);
      const notes = resolveStopNotes(stop);
      const boxes = normalizeBoxes(stop.boxes);
      const kindLabel =
        kinds.includes("entrega") && kinds.includes("retirada")
          ? "Entrega e Retirada"
          : kinds.includes("retirada")
            ? "Retirada"
            : "Entrega";
      const title = motoboyStopTitle(index, stop.label, stop.address);
      lines.push(`${index + 1}. ${title}`);
      lines.push(`   Endereço: ${stop.address}`);
      if (stop.complement?.trim()) {
        lines.push(`   Complemento: ${stop.complement.trim()}`);
      }
      lines.push(
        `   Horário: ${formatHoursLabel(normalizeHoursPeriods(stop.hours))}`,
      );
      lines.push(`   Tipo: ${kindLabel}`);
      if (boxes > 0) {
        lines.push(
          `   Caixas: ${boxes} ${boxes === 1 ? "caixa" : "caixas"}`,
        );
      }
      if (notes.entrega) lines.push(`   Obs. entrega: ${notes.entrega}`);
      if (notes.retirada) lines.push(`   Obs. retirada: ${notes.retirada}`);
      if (stop.whatsapp?.trim()) {
        lines.push(`   WhatsApp: ${stop.whatsapp.trim()}`);
      }
      const out = outcomeText(stop.visitOutcome);
      if (out) lines.push(`   Resultado: ${out}`);
      lines.push("");
    });
  }

  if (input.route.returnToStart && input.route.startAddress.trim()) {
    lines.push("— Retorno —");
    lines.push(input.route.startAddress.trim());
    lines.push("");
  }

  if (input.route.motoboyReport?.trim()) {
    lines.push("— Relatório do motoboy —");
    lines.push(input.route.motoboyReport.trim());
    lines.push("");
  }
  if (input.route.adminReport?.trim()) {
    lines.push("— Relatório do administrador —");
    lines.push(input.route.adminReport.trim());
    lines.push("");
  }

  lines.push("— Rotaz");
  return lines.join("\n");
}

export function printDayRoutePdf(input: {
  date: string;
  route: DayRoute;
  motoboys: Motoboy[];
  pricePerKm: number;
}): void {
  const dayLabel = formatDateLabel(input.date);
  const fileName = dayRouteFileName(input.date);
  const motoboy = input.motoboys.find((m) => m.id === input.route.motoboyId);
  const rate =
    Number.isFinite(input.pricePerKm) && input.pricePerKm > 0
      ? input.pricePerKm
      : DEFAULT_PRICE_PER_KM;
  const fare = input.route.totalKm * rate;
  const boxesSum = totalBoxes(input.route.stops);
  const generatedAt = new Date().toLocaleString("pt-BR");

  const startPoint = pointFromCoords(
    input.route.startLat,
    input.route.startLng,
    input.route.startAddress,
  );
  const stopPoints = input.route.stops.map((s) =>
    pointFromCoords(s.lat, s.lng, s.address),
  );

  const fullRouteUrl =
    input.route.startAddress.trim() && input.route.stops.length
      ? googleMapsDirectionsUrl(startPoint, stopPoints, {
          returnToStart: input.route.returnToStart,
        })
      : null;

  const stopsHtml = input.route.stops
    .map((stop, index) => {
      const kinds = resolveStopKinds(stop);
      const notes = resolveStopNotes(stop);
      const boxes = normalizeBoxes(stop.boxes);
      const point = pointFromCoords(stop.lat, stop.lng, stop.address);
      const complement = stop.complement?.trim();
      const hoursLabel = formatHoursLabel(normalizeHoursPeriods(stop.hours));
      const tags = [
        kinds.includes("entrega")
          ? `<span class="tag entrega">Entrega</span>`
          : "",
        kinds.includes("retirada")
          ? `<span class="tag retirada">Retirada</span>`
          : "",
        boxes > 0
          ? `<span class="boxes-qty">${boxes} ${
              boxes === 1 ? "caixa a entregar" : "caixas a entregar"
            }</span>`
          : "",
      ]
        .filter(Boolean)
        .join(" ");

      const notesHtml = [
        notes.entrega
          ? `<div class="notes"><strong>Obs. entrega:</strong> ${esc(
              notes.entrega,
            ).replace(/\n/g, "<br/>")}</div>`
          : "",
        notes.retirada
          ? `<div class="notes"><strong>Obs. retirada:</strong> ${esc(
              notes.retirada,
            ).replace(/\n/g, "<br/>")}</div>`
          : "",
      ].join("");

      return `
        <tr>
          <td class="num">${index + 1}</td>
          <td>
            <div class="title">${esc(motoboyStopTitle(index, stop.label, stop.address))}</div>
            <div class="addr">${esc(stop.address)}</div>
            ${
              complement
                ? `<div class="extra"><strong>Complemento:</strong> ${esc(complement)}</div>`
                : ""
            }
            <div class="extra"><strong>Horário:</strong> ${esc(hoursLabel)}</div>
            <div class="meta">${tags}</div>
            ${notesHtml}
            ${navButtonsHtml(
              googleMapsNavigateToUrl(point),
              wazeNavigateUrl(point),
              "Abrir no Maps",
              "Abrir no Waze",
            )}
          </td>
        </tr>`;
    })
    .join("");

  const returnRow = input.route.returnToStart
    ? `
      <tr>
        <td class="num">R</td>
        <td>
          <div class="title">Retorno ao ponto de partida</div>
          <div class="addr">${esc(input.route.startAddress || "—")}</div>
          <div class="meta"><span class="tag retorno">Retorno</span></div>
          ${navButtonsHtml(
            googleMapsNavigateToUrl(startPoint),
            wazeNavigateUrl(startPoint),
            "Abrir no Maps",
            "Abrir no Waze",
          )}
        </td>
      </tr>`
    : "";

  const body = `
  <header class="brand-head">
    <div class="brand-mark">${LOGO_SVG}</div>
    <div class="brand-text">
      <div class="brand-name">Rotaz</div>
      <h1>Relatório do dia — ${esc(dayLabel)}</h1>
      <p class="sub">Gerado em ${esc(generatedAt)}</p>
    </div>
  </header>

  ${
    fullRouteUrl
      ? `<div class="route-cta">
          <a class="nav-btn maps big" href="${esc(fullRouteUrl)}" target="_blank" rel="noreferrer">
            Abrir rota completa no Google Maps
          </a>
          ${
            input.route.stops[0]
              ? `<a class="nav-btn waze big" href="${esc(
                  wazeNavigateUrl(
                    pointFromCoords(
                      input.route.stops[0].lat,
                      input.route.stops[0].lng,
                      input.route.stops[0].address,
                    ),
                  ),
                )}" target="_blank" rel="noreferrer">
                  Waze · 1ª parada
                </a>`
              : ""
          }
          <p class="cta-hint">Toque nos botões para abrir no celular/PC. No PDF salvo, os links continuam clicáveis.</p>
        </div>`
      : ""
  }

  <div class="boxes-banner">
    <span>Total de caixas a serem entregues</span>
    <strong class="boxes-qty">${boxesSum}</strong>
  </div>

  <div class="grid">
    <div><strong>Motoboy</strong>${esc(motoboy?.name ?? "Não atribuído")}</div>
    <div><strong>Paradas</strong>${input.route.stops.length}${
      input.route.returnToStart ? " + retorno" : ""
    }</div>
    <div><strong>Km estimado</strong>${esc(formatKm(input.route.totalKm))}</div>
    <div><strong>Valor estimado</strong>${esc(formatMoneyBRL(fare))} (${esc(
      formatMoneyBRL(rate),
    )}/km)</div>
    <div style="grid-column:1/-1"><strong>Partida</strong>${esc(
      input.route.startAddress || "—",
    )}</div>
  </div>

  <table>
    <tbody>
      <tr>
        <td class="num">P</td>
        <td>
          <div class="title">Ponto de partida</div>
          <div class="addr">${esc(input.route.startAddress || "—")}</div>
          ${
            input.route.startAddress.trim()
              ? navButtonsHtml(
                  googleMapsNavigateToUrl(startPoint),
                  wazeNavigateUrl(startPoint),
                  "Abrir no Maps",
                  "Abrir no Waze",
                )
              : ""
          }
        </td>
      </tr>
      ${stopsHtml}
      ${returnRow}
    </tbody>
  </table>

  <div class="fare">
    <strong>Valor estimado da rota:</strong> ${esc(formatMoneyBRL(fare))}
    (${esc(formatKm(input.route.totalKm))} × ${esc(formatMoneyBRL(rate))}/km)
    <div class="disclaimer">
      Estimativa com base nos km calculados. O valor real no fim da corrida pode ser diferente.
    </div>
  </div>

  ${
    fullRouteUrl
      ? `<div class="route-cta bottom">
          <a class="nav-btn maps big" href="${esc(fullRouteUrl)}" target="_blank" rel="noreferrer">
            Abrir rota completa no Google Maps
          </a>
        </div>`
      : ""
  }`;

  const styles = `
    .brand-head {
      display: flex; align-items: center; gap: 12px;
      margin: 0 0 14px; padding-bottom: 10px;
      border-bottom: 2px solid #0d6e7a;
    }
    .brand-mark { flex-shrink: 0; line-height: 0; }
    .brand-mark svg { display: block; }
    .brand-name {
      font-size: 11pt; font-weight: 800; letter-spacing: 0.04em;
      color: #0d6e7a; margin: 0 0 2px;
    }
    h1 { font-size: 15pt; margin: 0 0 2px; line-height: 1.2; }
    .sub { color: #4a5b66; margin: 0; font-size: 9pt; }
    .route-cta {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      margin: 0 0 14px; padding: 12px;
      border: 2px solid #0d6e7a; border-radius: 8px; background: #eef9fb;
    }
    .route-cta.bottom { margin-top: 14px; margin-bottom: 0; }
    .cta-hint {
      flex-basis: 100%; margin: 2px 0 0; font-size: 8.5pt; color: #4a5b66;
    }
    .nav-btns {
      display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;
    }
    .nav-btn {
      display: inline-block; text-decoration: none; font-weight: 700;
      font-size: 9pt; padding: 6px 10px; border-radius: 6px;
      border: 1px solid transparent; color: #fff !important;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .nav-btn.maps { background: #1a73e8; border-color: #1557b0; }
    .nav-btn.waze { background: #33c3f0; border-color: #1a9ec4; color: #062028 !important; }
    .nav-btn.big {
      font-size: 11pt; padding: 10px 14px; border-radius: 8px;
    }
    .boxes-banner {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; margin: 0 0 14px; padding: 12px 14px;
      border: 2px solid #111; border-radius: 8px; background: #f7f7f7;
    }
    .boxes-banner span {
      font-size: 10pt; text-transform: uppercase; letter-spacing: 0.05em;
      font-weight: 700; color: #111;
    }
    .boxes-qty {
      color: #000 !important;
      font-weight: 800;
      font-size: 16pt;
    }
    .boxes-banner .boxes-qty { font-size: 22pt; }
    .grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px;
      margin-bottom: 14px; border: 1px solid #c9d3d9; padding: 10px 12px; border-radius: 6px;
    }
    .grid div strong {
      display: block; font-size: 8.5pt; text-transform: uppercase;
      letter-spacing: 0.04em; color: #5a6b75; font-weight: 600;
    }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 8px 0; border-bottom: 1px solid #dde4e8; }
    td.num { width: 28px; font-weight: 700; color: #0d6e7a; padding-right: 8px; }
    .title { font-weight: 700; }
    .addr { color: #334650; margin-top: 2px; }
    .extra { margin-top: 4px; font-size: 10pt; color: #1a2a33; }
    .meta { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .tag {
      display: inline-block; border-radius: 4px;
      padding: 2px 7px; font-size: 8.5pt; text-transform: uppercase;
      letter-spacing: 0.03em; font-weight: 700;
    }
    .tag.entrega {
      color: #0a7a2f;
      border: 1px solid #0a7a2f;
      background: #e8f8ee;
    }
    .tag.retirada {
      color: #c45a00;
      border: 1px solid #c45a00;
      background: #fff0e4;
    }
    .tag.retorno {
      color: #0d6e7a;
      border: 1px solid #9bb0ba;
    }
    .meta .boxes-qty { font-size: 11pt; }
    .notes {
      margin-top: 6px; padding: 6px 8px; background: #f3f7f9;
      border-left: 3px solid #0d6e7a; font-size: 10pt; white-space: pre-wrap;
    }
    .fare { margin-top: 14px; padding: 10px 12px; border: 1px solid #c9d3d9; border-radius: 6px; }
    .disclaimer { margin-top: 6px; font-size: 8.5pt; color: #5a6b75; }
  `;

  printHtmlDocument(fileName, body, styles, {
    fileName,
    fitOnePage: false,
  });
}
