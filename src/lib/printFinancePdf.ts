import { formatDateShort } from "./dates";
import { formatMoneyBRL } from "./labels";
import { esc, printHtmlDocument } from "./printHtml";
import type { FinanceEntry, Motoboy } from "./types";

export function printFinancePdf(input: {
  entries: FinanceEntry[];
  motoboys: Motoboy[];
  title?: string;
}): void {
  const title = input.title || "Registro financeiro — Motoboys";
  const generatedAt = new Date().toLocaleString("pt-BR");

  const open = input.entries.filter((e) => e.status === "open");
  const paid = input.entries.filter((e) => e.status === "paid");
  const totalOpen = open.reduce((s, e) => s + e.amount, 0);
  const totalPaid = paid.reduce((s, e) => s + e.amount, 0);

  const byMotoboy = new Map<string, { open: number; paid: number; rows: FinanceEntry[] }>();
  for (const e of input.entries) {
    const cur = byMotoboy.get(e.motoboyId) || { open: 0, paid: 0, rows: [] };
    if (e.status === "open") cur.open += e.amount;
    else cur.paid += e.amount;
    cur.rows.push(e);
    byMotoboy.set(e.motoboyId, cur);
  }

  const sections = [...byMotoboy.entries()]
    .map(([motoboyId, bag]) => {
      const name =
        input.motoboys.find((m) => m.id === motoboyId)?.name || "Motoboy";
      const rows = bag.rows
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((e) => {
          const dates = e.routeDates.map(formatDateShort).join(", ") || "—";
          return `<tr>
            <td>${esc(e.status === "open" ? "Em aberto" : "Pago")}</td>
            <td>${esc(formatMoneyBRL(e.amount))}</td>
            <td>${esc(dates)}</td>
            <td>${esc(e.description || "—")}</td>
          </tr>`;
        })
        .join("");
      return `
        <h2>${esc(name)}</h2>
        <p class="sub">Em aberto: ${esc(formatMoneyBRL(bag.open))} · Pagos: ${esc(
          formatMoneyBRL(bag.paid),
        )}</p>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Valor</th>
              <th>Datas</th>
              <th>Descrição</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    })
    .join("");

  const body = `
  <h1>${esc(title)}</h1>
  <p class="sub">Gerado em ${esc(generatedAt)}</p>
  <div class="grid">
    <div><strong>Total em aberto</strong>${esc(formatMoneyBRL(totalOpen))}</div>
    <div><strong>Total pago</strong>${esc(formatMoneyBRL(totalPaid))}</div>
    <div><strong>Lançamentos</strong>${input.entries.length}</div>
  </div>
  ${sections || "<p>Nenhum lançamento.</p>"}
  `;

  const styles = `
    h1 { font-size: 18pt; margin: 0 0 4px; }
    h2 { font-size: 13pt; margin: 18px 0 4px; }
    .sub { color: #4a5b66; margin: 0 0 12px; font-size: 9.5pt; }
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

  printHtmlDocument(title, body, styles);
}
