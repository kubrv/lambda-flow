import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!moto) return;
    setPayDay(moto.payDayPreference || "end_of_route");
    setPayMethod(moto.payMethodPreference || "pix");
    setPixKey(moto.pixKey || "");
  }, [moto?.id, moto?.payDayPreference, moto?.payMethodPreference, moto?.pixKey]);

  if (!moto) {
    return (
      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2>Meu pagamento</h2>
        <p className="lede">
          Seu perfil ainda não está vinculado a um motoboy. Peça ao admin para
          gerar o 1º acesso com seu usuário.
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

  return (
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
  );
}
