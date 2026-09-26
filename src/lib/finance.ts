import { formatDateShort, monthLabel, dateKeysInRange } from "./dates";
import { formatKm } from "./geo";
import { formatMoneyBRL } from "./labels";
import type { AppData, DayRoute, FinanceEntry } from "./types";
import { DEFAULT_PRICE_PER_KM, createId } from "./types";

export type MotoboyFinanceSummary = {
  pending: number;
  settled: number;
  earned: number;
};

export function isAutoRouteEntry(entry: FinanceEntry, date?: string): boolean {
  const auto =
    entry.source === "auto-route" ||
    /^rota automática/i.test(entry.description || "");
  if (!auto) return false;
  if (!date) return true;
  return entry.routeDates.includes(date);
}

export function motoboyFinanceSummary(
  finance: FinanceEntry[],
  motoboyId: string,
): MotoboyFinanceSummary {
  let pending = 0;
  let settled = 0;
  for (const e of finance) {
    if (e.motoboyId !== motoboyId) continue;
    if (e.status === "open") pending += e.amount;
    else settled += e.amount;
  }
  return {
    pending: roundMoney(pending),
    settled: roundMoney(settled),
    earned: roundMoney(pending + settled),
  };
}

export function globalFinanceSummary(finance: FinanceEntry[]) {
  let pending = 0;
  let settled = 0;
  for (const e of finance) {
    if (e.status === "open") pending += e.amount;
    else settled += e.amount;
  }
  return {
    pending: roundMoney(pending),
    settled: roundMoney(settled),
    earned: roundMoney(pending + settled),
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Cria/atualiza lançamento automático ao gerar rota; remove se sem motoboy/km. */
export function upsertAutoRouteFinance(
  finance: FinanceEntry[],
  input: {
    date: string;
    motoboyId: string | null;
    totalKm: number;
    pricePerKm: number;
  },
): FinanceEntry[] {
  const rate =
    Number.isFinite(input.pricePerKm) && input.pricePerKm > 0
      ? input.pricePerKm
      : DEFAULT_PRICE_PER_KM;

  const withoutDate = finance.filter((e) => !isAutoRouteEntry(e, input.date));

  if (!input.motoboyId || !(input.totalKm > 0)) {
    return withoutDate;
  }

  const amount = roundMoney(input.totalKm * rate);
  const existing = finance.find((e) => isAutoRouteEntry(e, input.date));

  const entry: FinanceEntry = {
    id: existing?.id || createId(),
    motoboyId: input.motoboyId,
    amount,
    routeDates: [input.date],
    description: `Rota automática · ${formatDateShort(input.date)} · ${formatKm(input.totalKm)} × ${formatMoneyBRL(rate)}/km`,
    status: existing?.status === "paid" ? "paid" : "open",
    createdAt: existing?.createdAt || new Date().toISOString(),
    source: "auto-route",
    km: input.totalKm,
  };

  return [entry, ...withoutDate];
}

export function removeAutoRouteFinance(
  finance: FinanceEntry[],
  date: string,
): FinanceEntry[] {
  return finance.filter((e) => !isAutoRouteEntry(e, date));
}

export type PeriodReport = {
  from: string;
  to: string;
  label: string;
  totalKm: number;
  routeCount: number;
  pending: number;
  settled: number;
  earned: number;
  routes: DayRoute[];
  entries: FinanceEntry[];
};

/** @deprecated use buildPeriodReport — mantido para compat. */
export type MonthlyReport = PeriodReport & {
  year: number;
  monthIndex: number;
};

export function buildPeriodReport(
  data: AppData,
  from: string,
  to: string,
): PeriodReport {
  const keys = new Set(dateKeysInRange(from, to));
  const routes = Object.values(data.routesByDate)
    .filter((r) => keys.has(r.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalKm = routes.reduce((s, r) => s + (r.totalKm || 0), 0);
  const entries = data.finance.filter((e) =>
    e.routeDates.some((d) => keys.has(d)),
  );

  let pending = 0;
  let settled = 0;
  for (const e of entries) {
    if (e.status === "open") pending += e.amount;
    else settled += e.amount;
  }

  const start = from <= to ? from : to;
  const end = from <= to ? to : from;

  return {
    from: start,
    to: end,
    label:
      start === end
        ? formatDateShort(start)
        : `${formatDateShort(start)} a ${formatDateShort(end)}`,
    totalKm: Math.round(totalKm * 10) / 10,
    routeCount: routes.filter((r) => r.stops.length > 0 || r.totalKm > 0)
      .length,
    pending: roundMoney(pending),
    settled: roundMoney(settled),
    earned: roundMoney(pending + settled),
    routes,
    entries,
  };
}

export function buildMonthlyReport(
  data: AppData,
  year: number,
  monthIndex: number,
): MonthlyReport {
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}-`;
  const from = `${prefix}01`;
  const last = new Date(year, monthIndex + 1, 0).getDate();
  const to = `${prefix}${String(last).padStart(2, "0")}`;
  const base = buildPeriodReport(data, from, to);
  return {
    ...base,
    year,
    monthIndex,
    label: monthLabel(year, monthIndex),
  };
}

export function buildPeriodReportText(
  report: PeriodReport,
  motoboys: { id: string; name: string }[],
): string {
  const lines: string[] = [];
  lines.push(`Relatório Rotaz — ${report.label}`);
  lines.push("");
  lines.push(`Km no período: ${formatKm(report.totalKm)}`);
  lines.push(`Rotas: ${report.routeCount}`);
  lines.push(`Em aberto: ${formatMoneyBRL(report.pending)}`);
  lines.push(`Acertado: ${formatMoneyBRL(report.settled)}`);
  lines.push(`Total gerado: ${formatMoneyBRL(report.earned)}`);
  lines.push("");
  lines.push("— Rotas —");
  if (!report.routes.length) {
    lines.push("(nenhuma)");
  } else {
    for (const r of report.routes) {
      const boy =
        motoboys.find((m) => m.id === r.motoboyId)?.name || "Sem motoboy";
      const status = r.completionStatus || "open";
      lines.push(
        `• ${formatDateShort(r.date)} · ${boy} · ${formatKm(r.totalKm || 0)} · ${r.stops.length} parada(s) · ${status}`,
      );
    }
  }
  lines.push("");
  lines.push("— Lançamentos —");
  if (!report.entries.length) {
    lines.push("(nenhum)");
  } else {
    for (const e of report.entries) {
      const boy =
        motoboys.find((m) => m.id === e.motoboyId)?.name || "Motoboy";
      const st = e.status === "paid" ? "acertado" : "em aberto";
      const dates = e.routeDates.map(formatDateShort).join(", ") || "—";
      lines.push(
        `• ${boy} · ${formatMoneyBRL(e.amount)} · ${st} · ${dates}${
          e.description ? ` · ${e.description}` : ""
        }`,
      );
    }
  }
  lines.push("");
  lines.push("— Rotaz");
  return lines.join("\n");
}

export function buildFinanceOverviewText(
  finance: FinanceEntry[],
  motoboys: { id: string; name: string }[],
  routeCount: number,
): string {
  const g = globalFinanceSummary(finance);
  const lines: string[] = [];
  lines.push("Financeiro Rotaz — visão geral");
  lines.push("");
  lines.push(`Total de rotas (lançamentos com data): ${routeCount}`);
  lines.push(`Em aberto: ${formatMoneyBRL(g.pending)}`);
  lines.push(`Acertado: ${formatMoneyBRL(g.settled)}`);
  lines.push(`Total gerado: ${formatMoneyBRL(g.earned)}`);
  lines.push("");
  for (const m of motoboys) {
    const t = motoboyFinanceSummary(finance, m.id);
    if (t.earned <= 0) continue;
    lines.push(
      `• ${m.name}: aberto ${formatMoneyBRL(t.pending)} · acertado ${formatMoneyBRL(t.settled)} · total ${formatMoneyBRL(t.earned)}`,
    );
  }
  lines.push("");
  lines.push("— Rotaz");
  return lines.join("\n");
}
