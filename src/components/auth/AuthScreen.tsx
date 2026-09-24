import { useState } from "react";
import {
  type AuthRole,
  completeMotoboyFirstAccess,
  registerWithCode,
  signIn,
  signInWithLogin,
} from "../../lib/auth";

type Props = {
  onAuthenticated: () => void;
  onBack?: () => void;
  onCreateCompany?: () => void;
};

type Mode = "login" | "first-access" | "register";

export function AuthScreen({
  onAuthenticated,
  onBack,
  onCreateCompany,
}: Props) {
  const [role, setRole] = useState<AuthRole>("motoboy");
  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  function switchRole(next: AuthRole) {
    setRole(next);
    setError("");
    setOkMsg("");
    if (next === "company" && mode === "first-access") {
      setMode("login");
    }
  }

  async function submit() {
    setError("");
    setOkMsg("");
    setBusy(true);
    try {
      if (mode === "login") {
        const id = role === "motoboy" ? login.trim() : email.trim();
        if (!id) throw new Error("Informe usuário ou e-mail.");
        if (role === "motoboy") {
          await signInWithLogin(id, password);
        } else {
          await signIn(id, password);
        }
        onAuthenticated();
        return;
      }

      if (mode === "first-access") {
        if (!login.trim()) throw new Error("Informe usuário ou e-mail.");
        if (!accessCode.trim()) throw new Error("Informe o código de 1º acesso.");
        if (password.length < 6) throw new Error("Senha com no mínimo 6 caracteres.");
        const result = await completeMotoboyFirstAccess({
          login: login.trim(),
          accessCode: accessCode.trim(),
          password,
        });
        const resolvedEmail = String(result.email || login.trim());
        await signIn(resolvedEmail, password);
        onAuthenticated();
        return;
      }

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
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na autenticação.");
    } finally {
      setBusy(false);
    }
  }

  const loginReady =
    mode === "login"
      ? Boolean((role === "motoboy" ? login : email).trim() && password)
      : mode === "first-access"
        ? Boolean(login.trim() && accessCode.trim() && password.length >= 6)
        : Boolean(email.trim() && password && fullName.trim() && inviteCode.trim());

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
          Motoboy: entre com usuário ou e-mail. No primeiro acesso, use o código
          que a empresa passou e crie sua senha. Empresa: e-mail e senha.
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
            onClick={() => switchRole("motoboy")}
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
            <small>Usuário · e-mail · senha</small>
          </button>
          <button
            type="button"
            className={`role-card${role === "company" ? " active" : ""}`}
            onClick={() => switchRole("company")}
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
            onClick={() => {
              setMode("login");
              setError("");
              setOkMsg("");
            }}
          >
            Entrar
          </button>
          {role === "motoboy" ? (
            <button
              type="button"
              className={`mode-tab${mode === "first-access" ? " active" : ""}`}
              onClick={() => {
                setMode("first-access");
                setError("");
                setOkMsg("");
              }}
            >
              1º acesso
            </button>
          ) : null}
          <button
            type="button"
            className={`mode-tab${mode === "register" ? " active" : ""}`}
            onClick={() => {
              setMode("register");
              setError("");
              setOkMsg("");
            }}
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

          {mode === "login" || mode === "first-access" ? (
            <div className="field">
              <label>
                {role === "motoboy" ? "Usuário ou e-mail" : "E-mail"}
              </label>
              <input
                type={role === "company" ? "email" : "text"}
                value={role === "motoboy" ? login : email}
                onChange={(e) =>
                  role === "motoboy"
                    ? setLogin(e.target.value)
                    : setEmail(e.target.value)
                }
                placeholder={
                  role === "motoboy" ? "usuario ou seu@email.com" : "seu@email.com"
                }
                autoComplete={role === "motoboy" ? "username" : "email"}
              />
            </div>
          ) : (
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
          )}

          {mode === "first-access" ? (
            <div className="field">
              <label>Código de 1º acesso</label>
              <input
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                placeholder="Código que a empresa passou"
                autoComplete="one-time-code"
              />
              <p className="hint">
                Só você cria a senha. A empresa não vê a senha depois.
              </p>
            </div>
          ) : null}

          <div className="field">
            <label>
              {mode === "first-access" ? "Criar senha" : "Senha"}
            </label>
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
              <p className="hint">Peça ao administrador da sua empresa.</p>
            </div>
          ) : null}

          <button
            type="button"
            className="btn primary"
            disabled={busy || !loginReady}
            onClick={() => void submit()}
          >
            {busy
              ? "Aguarde…"
              : mode === "login"
                ? `Entrar como ${role === "company" ? "empresa" : "motoboy"}`
                : mode === "first-access"
                  ? "Criar senha e entrar"
                  : "Criar conta"}
          </button>

          {error ? <div className="status err">{error}</div> : null}
          {okMsg ? <div className="status ok">{okMsg}</div> : null}

          {onCreateCompany ? (
            <button type="button" className="btn" onClick={onCreateCompany}>
              Obter um plano para minha empresa
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
