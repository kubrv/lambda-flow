import { useState } from "react";
import {
  type AuthRole,
  registerWithCode,
  signIn,
} from "../../lib/auth";

type Props = {
  onAuthenticated: () => void;
  onBack?: () => void;
  onCreateCompany?: () => void;
};

type Mode = "login" | "register";

export function AuthScreen({
  onAuthenticated,
  onBack,
  onCreateCompany,
}: Props) {
  const [role, setRole] = useState<AuthRole>("motoboy");
  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email.trim(), password);
      } else {
        if (!fullName.trim()) throw new Error("Informe o nome.");
        if (!inviteCode.trim()) throw new Error("Informe o código da empresa.");
        await registerWithCode({
          role,
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          inviteCode: inviteCode.trim(),
        });
        try {
          await signIn(email.trim(), password);
        } catch {
          // ok se já logado
        }
      }
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na autenticação.");
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
        <p className="lede">
          Acesse como motoboy ou empresa. Motoboys veem as rotas; empresas
          gerenciam o painel e o plano.
        </p>
        {onBack ? (
          <button type="button" className="btn ghost" onClick={onBack}>
            ← Voltar à apresentação
          </button>
        ) : null}

        <div className="role-pick" role="tablist" aria-label="Tipo de acesso">
          <button
            type="button"
            className={`role-card${role === "motoboy" ? " active" : ""}`}
            onClick={() => setRole("motoboy")}
          >
            <span className="role-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28">
                <path
                  fill="currentColor"
                  d="M5 17a3 3 0 1 0 0.01 0zm14 0a3 3 0 1 0 0.01 0zM5 15h1.5l1.3-3.5h5.3L15 15h2l-1.8-5H9.6L8.2 13H5v2zm7-9 1.2 3H17l1.5-3H12z"
                />
              </svg>
            </span>
            <strong>Motoboy</strong>
            <small>Ver rotas · Maps · Waze</small>
          </button>
          <button
            type="button"
            className={`role-card${role === "company" ? " active" : ""}`}
            onClick={() => setRole("company")}
          >
            <span className="role-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28">
                <path
                  fill="currentColor"
                  d="M3 21V7l9-4 9 4v14h-6v-6H9v6H3zm2-2h2v-4h10v4h2V8.3L12 5.1 5 8.3V19z"
                />
              </svg>
            </span>
            <strong>Empresa</strong>
            <small>Admin · rotas · financeiro</small>
          </button>
        </div>

        <div className="mode-tabs compact">
          <button
            type="button"
            className={`mode-tab${mode === "login" ? " active" : ""}`}
            onClick={() => setMode("login")}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`mode-tab${mode === "register" ? " active" : ""}`}
            onClick={() => setMode("register")}
          >
            Cadastrar com código
          </button>
        </div>

        <div className="form-grid">
          {mode === "register" ? (
            <div className="field">
              <label>Nome</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome"
                autoComplete="name"
              />
            </div>
          ) : null}

          <div className="field">
            <label>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label>Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </div>

          {mode === "register" ? (
            <div className="field">
              <label>Código da empresa</label>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="Código recebido"
                autoComplete="off"
              />
              <p className="hint">
                Peça ao administrador da sua empresa.
              </p>
            </div>
          ) : null}

          <button
            type="button"
            className="btn primary"
            disabled={busy || !email.trim() || !password}
            onClick={() => void submit()}
          >
            {busy
              ? "Aguarde…"
              : mode === "login"
                ? `Entrar como ${role === "company" ? "empresa" : "motoboy"}`
                : "Criar conta"}
          </button>

          {error ? <div className="status err">{error}</div> : null}

          {onCreateCompany ? (
            <button
              type="button"
              className="btn"
              onClick={onCreateCompany}
            >
              Obter um plano para minha empresa
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
