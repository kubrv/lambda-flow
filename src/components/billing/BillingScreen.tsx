import { useState } from "react";
import type { Company } from "../../lib/auth";
import { PLAN_PRICE_BRL } from "../../lib/auth";
import { formatMoneyBRL } from "../../lib/labels";

type PayMethod = "pix" | "card" | "boleto";

type Props = {
  company: Company;
  onRefresh: () => void;
};

export function BillingScreen({ company, onRefresh }: Props) {
  const [method, setMethod] = useState<PayMethod>("pix");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const price = company.planPrice || PLAN_PRICE_BRL;

  async function pay() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/billing/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: company.id,
          method,
          amount: price,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        checkoutUrl?: string;
        error?: string;
        manual?: boolean;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Falha ao criar cobrança.");
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (data.manual) {
        setMsg(
          "Cobrança registrada. Configure MERCADOPAGO_ACCESS_TOKEN no Vercel para PIX/cartão/boleto automáticos. Enquanto isso, o suporte pode liberar o plano.",
        );
        onRefresh();
        return;
      }
      setMsg("Preferência criada. Conclua o pagamento na próxima tela.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro no pagamento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel billing-panel">
      <h2>Plano Lambda-Flow</h2>
      <p className="lede">
        Só a empresa paga. Motoboys entram de graça com 1º acesso (código + senha).
        Plano padrão: <strong>{formatMoneyBRL(price)}/mês</strong>.
      </p>

      <div className="meta-grid" style={{ marginBottom: "1rem" }}>
        <div className="meta-card">
          <label>Empresa</label>
          <strong>{company.name}</strong>
        </div>
        <div className="meta-card">
          <label>Status</label>
          <strong>
            {company.planStatus === "active"
              ? "Ativo"
              : company.planStatus === "trial"
                ? "Trial"
                : "Pendente"}
          </strong>
        </div>
        <div className="meta-card">
          <label>Valor</label>
          <strong>{formatMoneyBRL(price)}</strong>
        </div>
      </div>

      <h3>Forma de pagamento</h3>
      <div className="pay-methods">
        {(
          [
            { id: "pix" as const, label: "PIX", hint: "Aprovação rápida" },
            { id: "card" as const, label: "Cartão", hint: "Crédito" },
            { id: "boleto" as const, label: "Boleto", hint: "1–2 dias úteis" },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            className={`pay-method${method === m.id ? " active" : ""}`}
            onClick={() => setMethod(m.id)}
          >
            <strong>{m.label}</strong>
            <small>{m.hint}</small>
          </button>
        ))}
      </div>

      <p className="hint" style={{ marginTop: "0.75rem" }}>
        Pagamentos automatizados via Mercado Pago (PIX, cartão e boleto).
        Alternativas possíveis: Asaas ou Stripe Brasil — o fluxo atual já está
        preparado para o Mercado Pago.
      </p>

      <div className="row-actions" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={() => void pay()}
        >
          {busy ? "Gerando cobrança…" : `Pagar ${formatMoneyBRL(price)}`}
        </button>
        <button type="button" className="btn" onClick={onRefresh}>
          Já paguei — atualizar
        </button>
      </div>
      {msg ? (
        <div
          className={`status ${/falha|erro|configur/i.test(msg) ? "err" : "ok"}`}
          style={{ marginTop: "0.75rem" }}
        >
          {msg}
        </div>
      ) : null}
    </section>
  );
}
