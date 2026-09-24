import { useMemo, useState } from "react";
import {
  dateKeysInRange,
  formatDateShort,
  localDateKey,
} from "../../lib/dates";
import {
  buildPeriodReport,
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
import type { AppData, FinanceEntry } from "../../lib/types";
import { createId, getRoute } from "../../lib/types";

type Props = {
  data: AppData;
  onChange: (next: AppData) => void;
};

export function FinanceAdmin({ data, onChange }: Props) {
  const today = localDateKey();
  const monthStart = `${today.slice(0, 8)}01`;

  const [motoboyId, setMotoboyId] = useState(data.motoboys[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [rangeFrom, setRangeFrom] = useState(monthStart);
  const [rangeTo, setRangeTo] = useState(today);
  const [reportFrom, setReportFrom] = useState(monthStart);
  const [reportTo, setReportTo] = useState(today);
  const [msg, setMsg] = useState("");
  const [settleId, setSettleId] = useState<string | null>(null);
  const [settleMethod, setSettleMethod] = useState<PayMethod>("pix");

  const selectedMotoboy = data.motoboys.find((m) => m.id === motoboyId);
  const rate = resolveMotoboyPricePerKm(
    selectedMotoboy,
    data.pricePerKm,
  );

  const global = useMemo(
    () => globalFinanceSummary(data.finance),
    [data.finance],
  );
  const period = useMemo(
    () => buildPeriodReport(data, reportFrom, reportTo),
    [data, reportFrom, reportTo],
  );

  const relatedDates = useMemo(
    () => dateKeysInRange(rangeFrom, rangeTo),
    [rangeFrom, rangeTo],
  );

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
    if (!motoboyId) {
      setMsg("Selecione um motoboy.");
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setMsg("Informe um valor válido.");
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
  }

  function openSettle(entry: FinanceEntry) {
    const moto = data.motoboys.find((m) => m.id === entry.motoboyId);
    setSettleId(entry.id);
    setSettleMethod(
      (entry.paymentMethod as PayMethod) ||
        moto?.payMethodPreference ||
        "pix",
    );
  }

  function confirmSettle() {
    if (!settleId) return;
    onChange({
      ...data,
      finance: data.finance.map((e) =>
        e.id === settleId
          ? {
              ...e,
              status: "paid",
              paymentMethod: settleMethod,
              paidAt: new Date().toISOString(),
            }
          : e,
      ),
    });
    setSettleId(null);
    setMsg(`Marcado como recebido via ${payMethodLabel(settleMethod)}.`);
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
  }

  function remove(id: string) {
    onChange({
      ...data,
      finance: data.finance.filter((e) => e.id !== id),
    });
  }

  function handlePdf() {
    try {
      printFinancePdf({
        entries: data.finance,
        motoboys: data.motoboys,
        title: "Financeiro — saldo geral",
      });
    } catch (err) {
      setMsg(
        err instanceof Error ? err.message : "Falha ao gerar PDF financeiro.",
      );
    }
  }

  function handlePeriodPdf() {
    try {
      printPeriodFinancePdf({
        report: period,
        motoboys: data.motoboys,
        fallbackPricePerKm: data.pricePerKm,
      });
    } catch (err) {
      setMsg(
        err instanceof Error ? err.message : "Falha ao gerar relatório do período.",
      );
    }
  }

  const settling = settleId
    ? data.finance.find((e) => e.id === settleId)
    : null;

  return (
    <section className="panel">
      <h2>Registro financeiro</h2>
      <p className="lede">
        Ao gerar a rota, o valor usa o km × preço/km do motoboy. Ao marcar
        recebido, escolha a forma de pagamento (PIX, dinheiro, transferência…).
      </p>

      <div className="meta-grid" style={{ marginBottom: "1rem" }}>
        <div className="meta-card">
          <label>Saldo pendente</label>
          <strong>{formatMoneyBRL(global.pending)}</strong>
        </div>
        <div className="meta-card">
          <label>Valores acertados</label>
          <strong>{formatMoneyBRL(global.settled)}</strong>
        </div>
        <div className="meta-card">
          <label>Total já recebido*</label>
          <strong>{formatMoneyBRL(global.settled)}</strong>
          <span className="hint">*valores marcados como pagos</span>
        </div>
        <div className="meta-card">
          <label>Total gerado</label>
          <strong>{formatMoneyBRL(global.earned)}</strong>
        </div>
      </div>

      <div className="period-box" style={{ marginBottom: "1rem" }}>
        <h3>Relatório por período</h3>
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
            <label>Km no período</label>
            <strong>{formatKm(period.totalKm)}</strong>
          </div>
          <div className="meta-card">
            <label>Rotas com atividade</label>
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
            onClick={handlePeriodPdf}
            disabled={!reportFrom || !reportTo}
          >
            PDF do período
          </button>
          <button type="button" className="btn" onClick={handlePdf}>
            PDF financeiro geral
          </button>
        </div>
      </div>

      <div className="meta-grid" style={{ marginBottom: "1rem" }}>
        {data.motoboys.map((m) => {
          const t = motoboyFinanceSummary(data.finance, m.id);
          const mRate = resolveMotoboyPricePerKm(m, data.pricePerKm);
          return (
            <div className="meta-card" key={m.id}>
              <label>
                {m.name}
                {m.company ? ` · ${m.company}` : ""}
              </label>
              <strong>{formatMoneyBRL(t.pending)}</strong>
              <span className="hint">
                {formatMoneyBRL(mRate)}/km · pendente · acertado{" "}
                {formatMoneyBRL(t.settled)} · ganho {formatMoneyBRL(t.earned)}
              </span>
            </div>
          );
        })}
      </div>

      {settling ? (
        <div className="period-box" style={{ marginBottom: "1rem" }}>
          <h3>Confirmar recebimento</h3>
          <p className="hint">
            {data.motoboys.find((m) => m.id === settling.motoboyId)?.name ||
              "Motoboy"}{" "}
            · {formatMoneyBRL(settling.amount)}
          </p>
          <div className="field">
            <label htmlFor="settle-method">Forma de pagamento</label>
            <select
              id="settle-method"
              value={settleMethod}
              onChange={(e) => setSettleMethod(e.target.value as PayMethod)}
            >
              {PAY_METHOD_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="row-actions" style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              className="btn primary"
              onClick={confirmSettle}
            >
              Confirmar recebimento
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setSettleId(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="form-grid">
        <h3>Lançamento manual</h3>
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
                {formatMoneyBRL(resolveMotoboyPricePerKm(m, data.pricePerKm))}
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
              Sugerir valor pelos km (preço do motoboy)
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
        {msg ? <div className="status ok">{msg}</div> : null}

        <div className="motoboy-list" style={{ marginTop: "0.5rem" }}>
          {data.finance.length === 0 ? (
            <div className="empty">Nenhum lançamento ainda.</div>
          ) : (
            data.finance.map((e) => {
              const moto = data.motoboys.find((m) => m.id === e.motoboyId);
              const name = moto?.name || "Motoboy";
              return (
                <div className="motoboy-item finance-item" key={e.id}>
                  <div>
                    <strong>
                      {name} · {formatMoneyBRL(e.amount)}
                    </strong>
                    <div className="hint">
                      {e.status === "open" ? "Pendente" : "Acertado / pago"}
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
                  </div>
                  <div className="row-actions">
                    {e.status === "open" ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => openSettle(e)}
                      >
                        Marcar recebido
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => reopen(e.id)}
                      >
                        Reabrir
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn danger ghost"
                      onClick={() => remove(e.id)}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
