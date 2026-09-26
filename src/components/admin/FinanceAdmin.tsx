import { useMemo, useState } from "react";
import {
  dateKeysInRange,
  formatDateShort,
  localDateKey,
  monthLabel,
  shiftMonth,
} from "../../lib/dates";
import {
  buildFinanceOverviewText,
  buildMonthlyReport,
  buildPeriodReport,
  buildPeriodReportText,
  globalFinanceSummary,
  motoboyFinanceSummary,
} from "../../lib/finance";
import { formatKm } from "../../lib/geo";
import {
  formatMoneyBRL,
  resolveMotoboyPricePerKm,
} from "../../lib/labels";
import {
  PAY_METHOD_OPTIONS,
  payMethodLabel,
  type PayMethod,
} from "../../lib/payPrefs";
import { printFinancePdf } from "../../lib/printFinancePdf";
import { printPeriodFinancePdf } from "../../lib/printMonthlyFinancePdf";
import { deleteFinanceRows } from "../../lib/storage";
import type { AppData, FinanceEntry } from "../../lib/types";
import { createId, getRoute } from "../../lib/types";

type Props = {
  data: AppData;
  onChange: (next: AppData) => void;
};

export function FinanceAdmin({ data, onChange }: Props) {
  const today = localDateKey();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const monthStart = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;
  const monthEnd = (() => {
    const last = new Date(viewYear, viewMonth + 1, 0).getDate();
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  })();

  const [motoboyId, setMotoboyId] = useState(data.motoboys[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [rangeFrom, setRangeFrom] = useState(monthStart);
  const [rangeTo, setRangeTo] = useState(today);
  const [reportFrom, setReportFrom] = useState(monthStart);
  const [reportTo, setReportTo] = useState(today);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [settleId, setSettleId] = useState<string | null>(null);
  const [settleMethod, setSettleMethod] = useState<PayMethod>("pix");
  const [boySort, setBoySort] = useState<"earned" | "name">("earned");
  const [showPeriod, setShowPeriod] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [reportText, setReportText] = useState("");
  const [copied, setCopied] = useState(false);

  const selectedMotoboy = data.motoboys.find((m) => m.id === motoboyId);
  const rate = resolveMotoboyPricePerKm(selectedMotoboy, data.pricePerKm);

  const monthReport = useMemo(
    () => buildMonthlyReport(data, viewYear, viewMonth),
    [data, viewYear, viewMonth],
  );
  const period = useMemo(
    () => buildPeriodReport(data, reportFrom, reportTo),
    [data, reportFrom, reportTo],
  );
  const global = useMemo(
    () => globalFinanceSummary(data.finance),
    [data.finance],
  );

  const totalRoutesAll = useMemo(
    () =>
      Object.values(data.routesByDate).filter(
        (r) => r.stops.length > 0 || (r.totalKm || 0) > 0,
      ).length,
    [data.routesByDate],
  );

  const relatedDates = useMemo(
    () => dateKeysInRange(rangeFrom, rangeTo),
    [rangeFrom, rangeTo],
  );

  function shiftViewMonth(delta: number) {
    const next = shiftMonth(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.monthIndex);
    const start = `${next.year}-${String(next.monthIndex + 1).padStart(2, "0")}-01`;
    const last = new Date(next.year, next.monthIndex + 1, 0).getDate();
    const end = `${next.year}-${String(next.monthIndex + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    setRangeFrom(start);
    setRangeTo(end < today ? end : today);
    setReportFrom(start);
    setReportTo(end < today ? end : today);
  }

  function suggestFromDates() {
    if (!relatedDates.length) return;
    let km = 0;
    for (const d of relatedDates) {
      const route = getRoute(data, d);
      if (motoboyId && route.motoboyId && route.motoboyId !== motoboyId) {
        continue;
      }
      km += route.totalKm || 0;
    }
    setAmount(String(Math.round(km * rate * 100) / 100));
    setDescription(
      `Referente a ${formatDateShort(relatedDates[0])}${
        relatedDates.length > 1
          ? ` a ${formatDateShort(relatedDates[relatedDates.length - 1])}`
          : ""
      } (${formatKm(km)} × ${formatMoneyBRL(rate)}/km)`,
    );
  }

  function addEntry() {
    setErr("");
    if (!motoboyId) {
      setErr("Selecione um motoboy.");
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setErr("Informe um valor válido.");
      return;
    }
    const entry: FinanceEntry = {
      id: createId(),
      motoboyId,
      amount: value,
      routeDates: [...relatedDates],
      description: description.trim() || undefined,
      status: "open",
      createdAt: new Date().toISOString(),
      source: "manual",
    };
    onChange({ ...data, finance: [entry, ...data.finance] });
    setAmount("");
    setDescription("");
    setMsg("Lançamento adicionado.");
    setShowManual(false);
  }

  function openSettle(entry: FinanceEntry) {
    const moto = data.motoboys.find((m) => m.id === entry.motoboyId);
    setSettleId(entry.id);
    setSettleMethod(
      (entry.paymentMethod as PayMethod) ||
        moto?.payMethodPreference ||
        "pix",
    );
    setMsg("");
    setErr("");
  }

  function confirmSettle(id?: string, method?: PayMethod) {
    const targetId = id || settleId;
    if (!targetId) return;
    const pay = method || settleMethod;
    onChange({
      ...data,
      finance: data.finance.map((e) =>
        e.id === targetId
          ? {
              ...e,
              status: "paid",
              paymentMethod: pay,
              paidAt: new Date().toISOString(),
            }
          : e,
      ),
    });
    setSettleId(null);
    setMsg(`Marcado como recebido via ${payMethodLabel(pay)}.`);
    setErr("");
  }

  function reopen(id: string) {
    onChange({
      ...data,
      finance: data.finance.map((e) =>
        e.id === id
          ? { ...e, status: "open", paymentMethod: undefined, paidAt: null }
          : e,
      ),
    });
    setMsg("Lançamento reaberto.");
  }

  async function remove(id: string) {
    try {
      await deleteFinanceRows([id]);
      onChange({
        ...data,
        finance: data.finance.filter((e) => e.id !== id),
      });
      setMsg("Lançamento removido.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao remover lançamento.");
    }
  }

  function handlePdf() {
    try {
      printFinancePdf({
        entries: data.finance,
        motoboys: data.motoboys,
        title: "Financeiro — saldo geral",
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao gerar PDF financeiro.");
    }
  }

  function handlePeriodPdf() {
    try {
      printPeriodFinancePdf({
        report: period,
        motoboys: data.motoboys,
        fallbackPricePerKm: data.pricePerKm,
      });
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Falha ao gerar relatório do período.",
      );
    }
  }

  function generateTextReport(kind: "month" | "period" | "overview") {
    const text =
      kind === "month"
        ? buildPeriodReportText(monthReport, data.motoboys)
        : kind === "period"
          ? buildPeriodReportText(period, data.motoboys)
          : buildFinanceOverviewText(
              data.finance,
              data.motoboys,
              totalRoutesAll,
            );
    setReportText(text);
    setCopied(false);
  }

  async function copyReport() {
    if (!reportText) return;
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setMsg("Texto copiado — cole no WhatsApp ou e-mail.");
    } catch {
      setErr("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }

  const monthEntries = useMemo(() => {
    const keys = new Set(dateKeysInRange(monthStart, monthEnd));
    return data.finance.filter((e) => e.routeDates.some((d) => keys.has(d)));
  }, [data.finance, monthStart, monthEnd]);

  return (
    <section className="panel">
      <h2>Registro financeiro</h2>
      <p className="lede">
        Valores das rotas e acertos com motoboys. Saldo em aberto filtra o mês
        selecionado (padrão: mês atual).
      </p>

      <div className="finance-month-nav">
        <button
          type="button"
          className="btn ghost"
          onClick={() => shiftViewMonth(-1)}
        >
          ←
        </button>
        <strong>{monthLabel(viewYear, viewMonth)}</strong>
        <button
          type="button"
          className="btn ghost"
          onClick={() => shiftViewMonth(1)}
        >
          →
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setViewYear(now.getFullYear());
            setViewMonth(now.getMonth());
          }}
        >
          Mês atual
        </button>
      </div>

      <div className="meta-grid" style={{ marginBottom: "1rem" }}>
        <div className="meta-card finance-summary-open">
          <label>Saldo em aberto · {monthLabel(viewYear, viewMonth)}</label>
          <strong>{formatMoneyBRL(monthReport.pending)}</strong>
        </div>
        <div className="meta-card finance-summary-paid">
          <label>Acertado no mês</label>
          <strong>{formatMoneyBRL(monthReport.settled)}</strong>
        </div>
        <div className="meta-card">
          <label>Rotas no mês</label>
          <strong>{monthReport.routeCount}</strong>
        </div>
        <div className="meta-card">
          <label>Total de rotas (geral)</label>
          <strong>{totalRoutesAll}</strong>
          <span className="hint">
            Gerado no mês: {formatMoneyBRL(monthReport.earned)} · histórico{" "}
            {formatMoneyBRL(global.earned)}
          </span>
        </div>
      </div>

      <div className="row-actions" style={{ marginBottom: "0.85rem" }}>
        <button
          type="button"
          className="btn primary"
          onClick={() => generateTextReport("month")}
        >
          Gerar texto do mês
        </button>
        <button type="button" className="btn" onClick={handlePdf}>
          PDF geral
        </button>
      </div>

      {reportText ? (
        <div className="period-box report-text-box" style={{ marginBottom: "1rem" }}>
          <div className="row-actions" style={{ marginBottom: "0.5rem" }}>
            <button type="button" className="btn primary" onClick={() => void copyReport()}>
              {copied ? "Copiado!" : "Copiar texto"}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setReportText("")}
            >
              Fechar
            </button>
          </div>
          <textarea
            className="report-text-area"
            rows={12}
            readOnly
            value={reportText}
          />
        </div>
      ) : null}

      <div className="collapsible-section" style={{ marginBottom: "0.75rem" }}>
        <button
          type="button"
          className="btn ghost collapsible-toggle"
          onClick={() => setShowPeriod((v) => !v)}
        >
          {showPeriod ? "▾" : "▸"} Relatório por período
        </button>
        {showPeriod ? (
          <div className="period-box" style={{ marginTop: "0.55rem" }}>
            <div className="date-range-row">
              <div className="field">
                <label htmlFor="rep-from">De</label>
                <input
                  id="rep-from"
                  type="date"
                  value={reportFrom}
                  onChange={(e) => setReportFrom(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="rep-to">Até</label>
                <input
                  id="rep-to"
                  type="date"
                  value={reportTo}
                  onChange={(e) => setReportTo(e.target.value)}
                />
              </div>
            </div>
            <div className="meta-grid">
              <div className="meta-card">
                <label>Km</label>
                <strong>{formatKm(period.totalKm)}</strong>
              </div>
              <div className="meta-card">
                <label>Rotas</label>
                <strong>{period.routeCount}</strong>
              </div>
              <div className="meta-card">
                <label>Pendente</label>
                <strong>{formatMoneyBRL(period.pending)}</strong>
              </div>
              <div className="meta-card">
                <label>Acertado</label>
                <strong>{formatMoneyBRL(period.settled)}</strong>
              </div>
            </div>
            <div className="row-actions" style={{ marginTop: "0.75rem" }}>
              <button
                type="button"
                className="btn primary"
                onClick={() => generateTextReport("period")}
              >
                Gerar texto
              </button>
              <button
                type="button"
                className="btn"
                onClick={handlePeriodPdf}
                disabled={!reportFrom || !reportTo}
              >
                PDF do período
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="field" style={{ marginBottom: "0.75rem", maxWidth: 280 }}>
        <label htmlFor="boy-sort">Ordenar motoboys</label>
        <select
          id="boy-sort"
          value={boySort}
          onChange={(e) => setBoySort(e.target.value as "earned" | "name")}
        >
          <option value="earned">Por total ganho (mês)</option>
          <option value="name">Por nome</option>
        </select>
      </div>

      <div className="meta-grid finance-boy-grid" style={{ marginBottom: "1rem" }}>
        {[...data.motoboys]
          .sort((a, b) => {
            if (boySort === "name") {
              return a.name.localeCompare(b.name, "pt-BR", {
                sensitivity: "base",
              });
            }
            const ea = motoboyFinanceSummary(monthReport.entries, a.id).earned;
            const eb = motoboyFinanceSummary(monthReport.entries, b.id).earned;
            return eb - ea || a.name.localeCompare(b.name, "pt-BR");
          })
          .map((m) => {
            const t = motoboyFinanceSummary(monthReport.entries, m.id);
            const mRate = resolveMotoboyPricePerKm(m, data.pricePerKm);
            return (
              <div
                className={`meta-card finance-boy-card${
                  t.pending > 0
                    ? " has-open"
                    : t.settled > 0
                      ? " all-settled"
                      : ""
                }`}
                key={m.id}
              >
                <label>
                  {m.name}
                  {m.company ? ` · ${m.company}` : ""}
                </label>
                <strong className="finance-earned">
                  {formatMoneyBRL(t.earned)}
                </strong>
                <div className="finance-chip-row">
                  <span className="finance-chip open">
                    Em aberto {formatMoneyBRL(t.pending)}
                  </span>
                  <span className="finance-chip paid">
                    Acertado {formatMoneyBRL(t.settled)}
                  </span>
                </div>
                <span className="hint">{formatMoneyBRL(mRate)}/km · no mês</span>
              </div>
            );
          })}
      </div>

      <div className="collapsible-section" style={{ marginBottom: "1rem" }}>
        <button
          type="button"
          className="btn ghost collapsible-toggle"
          onClick={() => setShowManual((v) => !v)}
        >
          {showManual ? "▾" : "▸"} Lançamento manual
        </button>
        {showManual ? (
          <div className="form-grid" style={{ marginTop: "0.55rem" }}>
            <div className="field">
              <label htmlFor="fin-moto">Motoboy</label>
              <select
                id="fin-moto"
                value={motoboyId}
                onChange={(e) => setMotoboyId(e.target.value)}
              >
                <option value="">Selecionar…</option>
                {data.motoboys.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.company ? ` (${m.company})` : ""} —{" "}
                    {formatMoneyBRL(
                      resolveMotoboyPricePerKm(m, data.pricePerKm),
                    )}
                    /km
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Datas relacionadas</label>
              <div className="date-range-row">
                <div className="field">
                  <label htmlFor="fin-from">De</label>
                  <input
                    id="fin-from"
                    type="date"
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="fin-to">Até</label>
                  <input
                    id="fin-to"
                    type="date"
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                  />
                </div>
              </div>
              <p className="hint">
                {relatedDates.length
                  ? `${relatedDates.length} dia(s): ${formatDateShort(relatedDates[0])}${
                      relatedDates.length > 1
                        ? ` → ${formatDateShort(relatedDates[relatedDates.length - 1])}`
                        : ""
                    }`
                  : "Escolha o período."}
              </p>
              <div className="row-actions" style={{ marginTop: "0.5rem" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={suggestFromDates}
                  disabled={!relatedDates.length || !motoboyId}
                >
                  Sugerir valor pelos km
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="fin-amount">Valor (R$)</label>
              <input
                id="fin-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="fin-desc">Descrição</label>
              <textarea
                id="fin-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: ajuste / bônus"
              />
            </div>
            <div className="row-actions">
              <button type="button" className="btn primary" onClick={addEntry}>
                Registrar lançamento
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {msg ? <div className="status ok">{msg}</div> : null}
      {err ? <div className="status err">{err}</div> : null}

      <h3 style={{ marginTop: "0.5rem" }}>
        Lançamentos · {monthLabel(viewYear, viewMonth)}
      </h3>
      <div className="motoboy-list" style={{ marginTop: "0.5rem" }}>
        {monthEntries.length === 0 ? (
          <div className="empty">Nenhum lançamento neste mês.</div>
        ) : (
          monthEntries.map((e) => {
            const moto = data.motoboys.find((m) => m.id === e.motoboyId);
            const name = moto?.name || "Motoboy";
            const settlingHere = settleId === e.id;
            return (
              <div
                className={`motoboy-item finance-item finance-entry ${
                  e.status === "open" ? "is-open" : "is-paid"
                }`}
                key={e.id}
              >
                <div style={{ flex: 1 }}>
                  <strong>
                    {name} · {formatMoneyBRL(e.amount)}
                  </strong>
                  <div className="hint">
                    <span
                      className={`finance-chip ${
                        e.status === "open" ? "open" : "paid"
                      }`}
                    >
                      {e.status === "open" ? "Em aberto" : "Acertado"}
                    </span>
                    {e.paymentMethod
                      ? ` · ${payMethodLabel(e.paymentMethod)}`
                      : ""}
                    {e.source === "auto-route" ? " · automático" : " · manual"}
                    {moto?.company ? ` · ${moto.company}` : ""}
                    {e.routeDates.length
                      ? ` · ${
                          e.routeDates.length > 2
                            ? `${formatDateShort(e.routeDates[0])} a ${formatDateShort(e.routeDates[e.routeDates.length - 1])}`
                            : e.routeDates.map(formatDateShort).join(", ")
                        }`
                      : ""}
                  </div>
                  {e.description ? (
                    <div className="hint">{e.description}</div>
                  ) : null}

                  {settlingHere ? (
                    <div className="settle-inline">
                      <div className="field">
                        <label htmlFor={`settle-${e.id}`}>Forma de pagamento</label>
                        <select
                          id={`settle-${e.id}`}
                          value={settleMethod}
                          onChange={(ev) =>
                            setSettleMethod(ev.target.value as PayMethod)
                          }
                        >
                          {PAY_METHOD_OPTIONS.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn primary"
                          onClick={() => confirmSettle(e.id)}
                        >
                          Confirmar recebimento
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => setSettleId(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="row-actions">
                  {e.status === "open" && !settlingHere ? (
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => openSettle(e)}
                    >
                      Marcar recebido
                    </button>
                  ) : null}
                  {e.status === "paid" ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => reopen(e.id)}
                    >
                      Reabrir
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn danger ghost"
                    onClick={() => void remove(e.id)}
                  >
                    Remover
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
