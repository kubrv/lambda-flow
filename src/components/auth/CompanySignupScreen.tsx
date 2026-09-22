import { useState } from "react";
import { PLAN_PRICE_BRL, signIn } from "../../lib/auth";
import { formatMoneyBRL } from "../../lib/labels";

type Props = {
  onAuthenticated: () => void;
  onBack: () => void;
};

export function CompanySignupScreen({ onAuthenticated, onBack }: Props) {
  const [companyName, setCompanyName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [method, setMethod] = useState<"pix" | "card" | "boleto">("pix");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");

  async function submit() {
    setError("");
    setHint("");
    setBusy(true);
    try {
      if (!companyName.trim()) throw new Error("Informe o nome da empresa.");
      if (!ownerName.trim()) throw new Error("Informe o seu nome.");
      if (!email.trim()) throw new Error("Informe o e-mail.");
      if (!phone.trim()) throw new Error("Informe o WhatsApp / telefone.");
      if (password.length < 6) throw new Error("Senha com pelo menos 6 caracteres.");

      const res = await fetch("/api/register-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          ownerName: ownerName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          password,
          method,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        checkoutUrl?: string;
        manual?: boolean;
        message?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Não foi possível criar a empresa.");
      }

      await signIn(email.trim(), password);

      if (json.checkoutUrl) {
        window.location.href = json.checkoutUrl;
        return;
      }

      setHint(
        json.message ||
          "Empresa criada. Complete o pagamento no painel para ativar o plano.",
      );
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no cadastro.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand-row">
          <img
            className="brand-mark"
            src="/badge.svg"
            alt=""
            width={56}
            height={56}
          />
          <img
            className="brand-wordmark"
            src="/wordmark.svg"
            alt="Lambda-Flow"
            height={32}
          />
        </div>
        <h2 className="auth-title">Obter um plano para minha empresa</h2>
        <p className="lede">
          Preencha os dados e pague {formatMoneyBRL(PLAN_PRICE_BRL)}/mês para
          liberar o painel. Motoboys entram depois com o código que você gerar.
        </p>
        <button type="button" className="btn ghost" onClick={onBack}>
          ← Voltar
        </button>

        <div className="form-grid">
          <div className="field">
            <label>Nome da empresa</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Ex.: Lab Central"
              autoComplete="organization"
            />
          </div>
          <div className="field">
            <label>Seu nome</label>
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Responsável"
              autoComplete="name"
            />
          </div>
          <div className="field">
            <label>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label>WhatsApp / telefone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 90000-0000"
              autoComplete="tel"
            />
          </div>
          <div className="field">
            <label>Senha de acesso</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label>Forma de pagamento</label>
            <div className="pay-method-row">
              {(
                [
                  ["pix", "PIX"],
                  ["card", "Cartão"],
                  ["boleto", "Boleto"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`pay-chip${method === id ? " active" : ""}`}
                  onClick={() => setMethod(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy
              ? "Criando…"
              : `Criar e pagar ${formatMoneyBRL(PLAN_PRICE_BRL)}`}
          </button>

          {error ? <div className="status err">{error}</div> : null}
          {hint ? <p className="hint">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}
