import { formatDateShort } from "./dates";
import { formatKm } from "./geo";
import {
  formatMoneyBRL,
  resolveMotoboyPricePerKm,
} from "./labels";
import { esc, printHtmlDocument } from "./printHtml";
import type { PeriodReport } from "./finance";
import type { Motoboy } from "./types";
import { DEFAULT_PRICE_PER_KM } from "./types";

export function printPeriodFinancePdf(input: {
  report: PeriodReport;
  motoboys: Motoboy[];
  fallbackPricePerKm?: number;
}): void {
  const fallback =
    Number.isFinite(input.fallbackPricePerKm) &&
    (input.fallbackPricePerKm as number) > 0
      ? (input.fallbackPricePerKm as number)
      : DEFAULT_PRICE_PER_KM;
  const title = `Relatório — ${input.report.label}`;
  const generatedAt = new Date().toLocaleString("pt-BR");

  const routeRows = input.report.routes
    .filter((r) => r.stops.length > 0 || r.totalKm > 0)
    .map((r) => {
      const moto = input.motoboys.find((m) => m.id === r.motoboyId);
      const rate = resolveMotoboyPricePerKm(moto, fallback);
      const value = Math.round(r.totalKm * rate * 100) / 100;
      return `<tr>
        <td>${esc(formatDateShort(r.date))}</td>
        <td>${esc(moto?.name || "—")}${moto?.company ? `<div class="mini">${esc(moto.company)}</div>` : ""}</td>
        <td>${esc(formatKm(r.totalKm))}</td>
        <td>${esc(formatMoneyBRL(rate))}/km</td>
        <td>${esc(formatMoneyBRL(value))}</td>
        <td>${r.stops.length}</td>
      </tr>`;
    })
    .join("");

  const entryRows = input.report.entries
    .map((e) => {
      const moto = input.motoboys.find((m) => m.id === e.motoboyId);
      const name = moto?.name || "Motoboy";
      return `<tr>
        <td>${esc(name)}</td>
        <td>${esc(e.status === "open" ? "Pendente" : "Acertado")}</td>
        <td>${esc(formatMoneyBRL(e.amount))}</td>
        <td>${esc(
          e.routeDates.length > 2
            ? `${formatDateShort(e.routeDates[0])} a ${formatDateShort(e.routeDates[e.routeDates.length - 1])}`
            : e.routeDates.map(formatDateShort).join(", ") || "—",
        )}</td>
        <td>${esc(e.description || "—")}</td>
      </tr>`;
    })
    .join("");

  const body = `
  <h1>${esc(title)}</h1>
  <p class="sub">Gerado em ${esc(generatedAt)} · valores com preço/km de cada motoboy</p>

  <div class="grid">
    <div><strong>Km no período</strong>${esc(formatKm(input.report.totalKm))}</div>
    <div><strong>Rotas</strong>${input.report.routeCount}</div>
    <div><strong>Pendente</strong>${esc(formatMoneyBRL(input.report.pending))}</div>
    <div><strong>Acertado / recebido</strong>${esc(formatMoneyBRL(input.report.settled))}</div>
    <div><strong>Total gerado</strong>${esc(formatMoneyBRL(input.report.earned))}</div>
  </div>

  <h2>Rotas</h2>
  <table>
    <thead>
      <tr>
        <th>Data</th>
        <th>Motoboy</th>
        <th>Km</th>
        <th>R$/km</th>
        <th>Valor</th>
        <th>Paradas</th>
      </tr>
    </thead>
    <tbody>
      ${routeRows || `<tr><td colspan="6">Sem rotas neste período.</td></tr>`}
    </tbody>
  </table>

  <h2>Lançamentos</h2>
  <table>
    <thead>
      <tr>
        <th>Motoboy</th>
        <th>Status</th>
        <th>Valor</th>
        <th>Datas</th>
        <th>Descrição</th>
      </tr>
    </thead>
    <tbody>
      ${entryRows || `<tr><td colspan="5">Sem lançamentos neste período.</td></tr>`}
    </tbody>
  </table>
  `;

  const styles = `
    h1 { font-size: 18pt; margin: 0 0 4px; }
    h2 { font-size: 13pt; margin: 18px 0 6px; }
    .sub { color: #4a5b66; margin: 0 0 12px; font-size: 9.5pt; }
    .mini { font-size: 8.5pt; color: #5a6b75; }
    .grid {
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;
      margin-bottom: 14px; border: 1px solid #c9d3d9; padding: 10px 12px; border-radius: 6px;
    }
    .grid div strong {
      display: block; font-size: 8.5pt; text-transform: uppercase;
      letter-spacing: 0.04em; color: #5a6b75; font-weight: 600;
    }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #dde4e8; font-size: 10pt; }
    th { font-size: 8.5pt; text-transform: uppercase; color: #5a6b75; }
  `;

  printHtmlDocument(title, body, styles, {
    fileName: title,
    fitOnePage: true,
  });
}

/** Alias antigo */
export function printMonthlyFinancePdf(input: {
  report: PeriodReport;
  motoboys: Motoboy[];
  pricePerKm: number;
}): void {
  printPeriodFinancePdf({
    report: input.report,
    motoboys: input.motoboys,
    fallbackPricePerKm: input.pricePerKm,
  });
}
