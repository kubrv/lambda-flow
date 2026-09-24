import { useEffect, useState } from "react";
import { changeOwnPassword } from "../lib/auth";
import {
  PAY_DAY_OPTIONS,
  PAY_METHOD_OPTIONS,
  type PayDayPreference,
  type PayMethod,
} from "../lib/payPrefs";
import type { AppData, Motoboy } from "../lib/types";

type Props = {
  data: AppData;
  motoboyId: string | null;
  onChange: (next: AppData) => void;
};

export function MotoboyPrefsPanel({ data, motoboyId, onChange }: Props) {
  const moto = data.motoboys.find((m) => m.id === motoboyId) || null;
  const [payDay, setPayDay] = useState<PayDayPreference>(
    moto?.payDayPreference || "end_of_route",
  );
  const [payMethod, setPayMethod] = useState<PayMethod>(
    moto?.payMethodPreference || "pix",
  );
  const [pixKey, setPixKey] = useState(moto?.pixKey || "");
  const [msg, setMsg] = useState("");
  const [pwdErr, setPwdErr] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  useEffect(() => {
    if (!moto) return;
    setPayDay(moto.payDayPreference || "end_of_route");
    setPayMethod(moto.payMethodPreference || "pix");
    setPixKey(moto.pixKey || "");
  }, [moto?.id, moto?.payDayPreference, moto?.payMethodPreference, moto?.pixKey]);

  if (!moto) {
    return (
      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Meu perfil</h2>
        <p className="lede">
          Seu perfil ainda não está vinculado a um motoboy. Peça ao admin para
          cadastrar e-mail/usuário e liberar o acesso.
        </p>
      </section>
    );
  }

  function save() {
    const next: Motoboy = {
      ...moto!,
      payDayPreference: payDay,
      payMethodPreference: payMethod,
      pixKey: pixKey.trim() || undefined,
    };
    onChange({
      ...data,
      motoboys: data.motoboys.map((m) => (m.id === next.id ? next : m)),
    });
    setMsg("Preferências salvas.");
  }

  async function savePassword() {
    setPwdErr("");
    setPwdMsg("");
    if (!currentPwd) {
      setPwdErr("Informe a senha atual.");
      return;
    }
    if (newPwd.length < 6) {
      setPwdErr("Nova senha com no mínimo 6 caracteres.");
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdErr("A confirmação não confere com a nova senha.");
      return;
    }
    setPwdBusy(true);
    try {
      await changeOwnPassword(currentPwd, newPwd);
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setPwdMsg("Senha alterada com sucesso.");
    } catch (e) {
      setPwdErr(e instanceof Error ? e.message : "Falha ao alterar senha.");
    } finally {
      setPwdBusy(false);
    }
  }

  return (
    <>
      <section className="panel" style={{ marginTop: "0" }}>
        <h2>Meu perfil</h2>
        <p className="lede">
          Preferências de pagamento e senha. Volte às rotas pelo menu{" "}
          <strong>Visualizar rotas como motoboy</strong>.
        </p>
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Preferências de pagamento</h2>
        <p className="lede">
          Escolha quando e como prefere receber. Padrão: no fim da rota · PIX.
        </p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="boy-payday">Dia de pagamento</label>
            <select
              id="boy-payday"
              value={payDay}
              onChange={(e) => setPayDay(e.target.value as PayDayPreference)}
            >
              {PAY_DAY_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="boy-paymethod">Método de pagamento</label>
            <select
              id="boy-paymethod"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PayMethod)}
            >
              {PAY_METHOD_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="boy-pix">Chave PIX (opcional)</label>
            <input
              id="boy-pix"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="CPF, e-mail ou telefone"
            />
          </div>
          <div className="row-actions">
            <button type="button" className="btn primary" onClick={save}>
              Salvar preferências
            </button>
          </div>
          {msg ? <div className="status ok">{msg}</div> : null}
        </div>
      </section>

      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Alterar minha senha</h2>
        <p className="lede">
          Informe a senha atual e a nova. A empresa não consegue ver sua senha.
        </p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="boy-cur-pwd">Senha atual</label>
            <input
              id="boy-cur-pwd"
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="field">
            <label htmlFor="boy-new-pwd">Nova senha</label>
            <input
              id="boy-new-pwd"
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              autoComplete="new-password"
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div className="field">
            <label htmlFor="boy-confirm-pwd">Confirmar nova senha</label>
            <input
              id="boy-confirm-pwd"
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="btn primary"
              disabled={pwdBusy}
              onClick={() => void savePassword()}
            >
              {pwdBusy ? "Salvando…" : "Alterar senha"}
            </button>
          </div>
          {pwdErr ? <div className="status err">{pwdErr}</div> : null}
          {pwdMsg ? <div className="status ok">{pwdMsg}</div> : null}
        </div>
      </section>
    </>
  );
}
