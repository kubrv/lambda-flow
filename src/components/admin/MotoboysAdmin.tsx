import { useState } from "react";
import {
  adminSetMotoboyPassword,
  provisionMotoboyAccount,
  resetAllMotoboyLogins,
} from "../../lib/auth";
import { motoboyFinanceSummary } from "../../lib/finance";
import { formatMoneyBRL } from "../../lib/labels";
import {
  PAY_DAY_OPTIONS,
  PAY_METHOD_OPTIONS,
  payDayLabel,
  payMethodLabel,
  type PayDayPreference,
  type PayMethod,
} from "../../lib/payPrefs";
import { saveData } from "../../lib/storage";
import type { AppData, Motoboy } from "../../lib/types";
import { DEFAULT_PRICE_PER_KM, createId } from "../../lib/types";

type Props = {
  data: AppData;
  onChange: (next: AppData) => void;
};

type Draft = {
  name: string;
  phone: string;
  company: string;
  pricePerKm: string;
  email: string;
  username: string;
  payDayPreference: PayDayPreference;
  payMethodPreference: PayMethod;
  pixKey: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  phone: "",
  company: "",
  pricePerKm: String(DEFAULT_PRICE_PER_KM),
  email: "",
  username: "",
  payDayPreference: "end_of_route",
  payMethodPreference: "pix",
  pixKey: "",
});

function fromMotoboy(m: Motoboy): Draft {
  return {
    name: m.name,
    phone: m.phone || "",
    company: m.company || "",
    pricePerKm: String(m.pricePerKm ?? DEFAULT_PRICE_PER_KM),
    email: m.email || "",
    username: m.username || "",
    payDayPreference: m.payDayPreference || "end_of_route",
    payMethodPreference: m.payMethodPreference || "pix",
    pixKey: m.pixKey || "",
  };
}

function applyDraft(m: Motoboy, d: Draft, parsePrice: (s: string) => number): Motoboy {
  return {
    ...m,
    name: d.name.trim(),
    phone: d.phone.trim() || undefined,
    company: d.company.trim() || undefined,
    pricePerKm: parsePrice(d.pricePerKm),
    email: d.email.trim().toLowerCase() || undefined,
    username: d.username.trim().toLowerCase() || undefined,
    payDayPreference: d.payDayPreference,
    payMethodPreference: d.payMethodPreference,
    pixKey: d.pixKey.trim() || undefined,
  };
}

export function MotoboysAdmin({ data, onChange }: Props) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft>(emptyDraft);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [accessCodes, setAccessCodes] = useState<Record<string, string>>({});
  const [resetPwd, setResetPwd] = useState<Record<string, string>>({});

  function parsePrice(raw: string): number {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_PRICE_PER_KM;
  }

  function add() {
    setErr("");
    const n = draft.name.trim();
    if (!n) {
      setMsg("");
      setErr("Informe o nome do motoboy.");
      return;
    }
    const motoboy: Motoboy = applyDraft(
      { id: createId(), name: n, passwordSet: false },
      draft,
      parsePrice,
    );
    onChange({ ...data, motoboys: [...data.motoboys, motoboy] });
    setDraft(emptyDraft());
    setMsg(
      "Motoboy cadastrado. Preencha e-mail/usuário e clique em «Gerar 1º acesso» para ele criar a senha.",
    );
  }

  function startEdit(m: Motoboy) {
    setEditingId(m.id);
    setEdit(fromMotoboy(m));
    setMsg("");
    setErr("");
  }

  function saveEdit() {
    if (!editingId) return;
    setErr("");
    const n = edit.name.trim();
    if (!n) {
      setErr("Informe o nome.");
      return;
    }
    onChange({
      ...data,
      motoboys: data.motoboys.map((m) =>
        m.id === editingId ? applyDraft(m, edit, parsePrice) : m,
      ),
    });
    setEditingId(null);
    setEdit(emptyDraft());
    setMsg("Perfil atualizado (nome, telefone, e-mail, usuário e preferências).");
  }

  async function generateAccess(m: Motoboy) {
    setErr("");
    setMsg("");
    const email = (editingId === m.id ? edit.email : m.email || "").trim();
    const username = (editingId === m.id ? edit.username : m.username || "")
      .trim()
      .toLowerCase();
    const name = (editingId === m.id ? edit.name : m.name).trim();
    const phone = (editingId === m.id ? edit.phone : m.phone || "").trim();
    if (!email || !username || !name) {
      setErr("Salve nome, e-mail e usuário antes de gerar o 1º acesso.");
      return;
    }
    // persiste campos no perfil local antes da API
    const patched = data.motoboys.map((row) =>
      row.id === m.id
        ? {
            ...row,
            name,
            email: email.toLowerCase(),
            username,
            phone: phone || undefined,
          }
        : row,
    );
    const nextData = { ...data, motoboys: patched };
    onChange(nextData);

    setBusyId(m.id);
    try {
      await saveData(nextData);
      const result = await provisionMotoboyAccount({
        motoboyId: m.id,
        name,
        email,
        username,
        phone,
      });
      const code = String(result.accessCode || "");
      setAccessCodes((prev) => ({ ...prev, [m.id]: code }));
      onChange({
        ...nextData,
        motoboys: patched.map((row) =>
          row.id === m.id
            ? { ...row, passwordSet: false, email: email.toLowerCase(), username }
            : row,
        ),
      });
      setMsg(
        `Código de 1º acesso gerado para ${name}. Entregue só a ele — a senha só ele cria.`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao gerar acesso.");
    } finally {
      setBusyId(null);
    }
  }

  async function resetPassword(m: Motoboy) {
    setErr("");
    setMsg("");
    const pwd = (resetPwd[m.id] || "").trim();
    if (pwd.length < 6) {
      setErr("Senha com no mínimo 6 caracteres.");
      return;
    }
    const email = (m.email || "").trim();
    if (!email) {
      setErr("Salve o e-mail do motoboy antes de criar a senha.");
      return;
    }
    setBusyId(m.id);
    try {
      await saveData(data);
      await adminSetMotoboyPassword(m.id, pwd);
      setResetPwd((prev) => ({ ...prev, [m.id]: "" }));
      onChange({
        ...data,
        motoboys: data.motoboys.map((row) =>
          row.id === m.id ? { ...row, passwordSet: true } : row,
        ),
      });
      setMsg(
        "Senha definida. Não fica visível neste painel — o motoboy pode alterá-la no perfil.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao definir senha.");
    } finally {
      setBusyId(null);
    }
  }

  async function wipeLogins() {
    setErr("");
    setMsg("");
    if (
      !window.confirm(
        "Isso apaga e-mail, usuário e senha de TODOS os motoboys (fica só o nome). Continuar?",
      )
    ) {
      return;
    }
    setBusyId("__reset__");
    try {
      const result = await resetAllMotoboyLogins();
      const cleared = data.motoboys.map((m) => ({
        ...m,
        email: undefined,
        username: undefined,
        userId: undefined,
        passwordSet: false,
      }));
      onChange({ ...data, motoboys: cleared });
      setAccessCodes({});
      setResetPwd({});
      setMsg(
        String(
          result.message ||
            "Acessos zerados. Cadastre e-mail/usuário e gere o 1º acesso.",
        ),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao zerar acessos.");
    } finally {
      setBusyId(null);
    }
  }

  function remove(id: string) {
    const routesByDate = { ...data.routesByDate };
    for (const [key, route] of Object.entries(routesByDate)) {
      if (route.motoboyId === id) {
        routesByDate[key] = { ...route, motoboyId: null };
      }
    }
    onChange({
      ...data,
      motoboys: data.motoboys.filter((m) => m.id !== id),
      routesByDate,
      finance: data.finance.filter((f) => f.motoboyId !== id),
    });
    if (editingId === id) {
      setEditingId(null);
      setEdit(emptyDraft());
    }
  }

  function profileFields(
    value: Draft,
    setValue: (d: Draft) => void,
    idPrefix: string,
  ) {
    return (
      <div className="moto-profile-grid">
        <div className="field">
          <label htmlFor={`${idPrefix}-name`}>Nome completo</label>
          <input
            id={`${idPrefix}-name`}
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
            placeholder="Nome"
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-phone`}>Telefone</label>
          <input
            id={`${idPrefix}-phone`}
            value={value.phone}
            onChange={(e) => setValue({ ...value, phone: e.target.value })}
            placeholder="(11) 90000-0000"
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-email`}>E-mail</label>
          <input
            id={`${idPrefix}-email`}
            type="email"
            value={value.email}
            onChange={(e) => setValue({ ...value, email: e.target.value })}
            placeholder="motoboy@email.com"
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-user`}>Usuário</label>
          <input
            id={`${idPrefix}-user`}
            value={value.username}
            onChange={(e) =>
              setValue({
                ...value,
                username: e.target.value.toLowerCase().replace(/\s+/g, ""),
              })
            }
            placeholder="ex: joao.moto"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-company`}>Empresa</label>
          <input
            id={`${idPrefix}-company`}
            value={value.company}
            onChange={(e) => setValue({ ...value, company: e.target.value })}
            placeholder="Ex: Lambda / Frota X"
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-price`}>Valor por km (R$)</label>
          <input
            id={`${idPrefix}-price`}
            type="number"
            min="0.01"
            step="0.01"
            value={value.pricePerKm}
            onChange={(e) =>
              setValue({ ...value, pricePerKm: e.target.value })
            }
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-payday`}>Dia de pagamento</label>
          <select
            id={`${idPrefix}-payday`}
            value={value.payDayPreference}
            onChange={(e) =>
              setValue({
                ...value,
                payDayPreference: e.target.value as PayDayPreference,
              })
            }
          >
            {PAY_DAY_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-paymethod`}>Método preferido</label>
          <select
            id={`${idPrefix}-paymethod`}
            value={value.payMethodPreference}
            onChange={(e) =>
              setValue({
                ...value,
                payMethodPreference: e.target.value as PayMethod,
              })
            }
          >
            {PAY_METHOD_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-pix`}>Chave PIX (opcional)</label>
          <input
            id={`${idPrefix}-pix`}
            value={value.pixKey}
            onChange={(e) => setValue({ ...value, pixKey: e.target.value })}
            placeholder="CPF, e-mail ou telefone"
          />
        </div>
      </div>
    );
  }

  return (
    <section className="panel">
      <h2>Cadastro de motoboys</h2>
      <p className="lede">
        Cadastre nome, telefone, e-mail e usuário. Você pode{" "}
        <strong>criar a senha</strong> (sem visualizá-la depois) ou gerar o{" "}
        <strong>1º acesso</strong> para o motoboy criar. Depois, ele pode
        alterar a senha no próprio perfil.
      </p>
      <div className="row-actions" style={{ marginBottom: "0.75rem" }}>
        <button
          type="button"
          className="btn danger ghost"
          disabled={busyId === "__reset__"}
          onClick={() => void wipeLogins()}
        >
          {busyId === "__reset__"
            ? "Zerando…"
            : "Zerar e-mails e acessos (reiniciar login)"}
        </button>
      </div>

      <div className="form-grid">
        {profileFields(draft, setDraft, "m")}
        <div className="row-actions">
          <button type="button" className="btn primary" onClick={add}>
            Adicionar motoboy
          </button>
        </div>
        {msg ? <div className="status ok">{msg}</div> : null}
        {err ? <div className="status err">{err}</div> : null}

        <div className="motoboy-list">
          {data.motoboys.map((m) => {
            const days = Object.values(data.routesByDate).filter(
              (r) => r.motoboyId === m.id,
            ).length;
            const fin = motoboyFinanceSummary(data.finance, m.id);
            const rate = m.pricePerKm ?? DEFAULT_PRICE_PER_KM;
            const shownCode = accessCodes[m.id];
            return (
              <div className="motoboy-item finance-item" key={m.id}>
                {editingId === m.id ? (
                  <div className="form-grid" style={{ flex: 1, width: "100%" }}>
                    {profileFields(edit, setEdit, `e-${m.id}`)}
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn primary"
                        onClick={saveEdit}
                      >
                        Salvar perfil
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setEditingId(null);
                          setEdit(emptyDraft());
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <strong>{m.name}</strong>
                      <div className="hint">
                        {m.username ? `@${m.username} · ` : ""}
                        {m.email ? `${m.email} · ` : ""}
                        {m.company ? `${m.company} · ` : ""}
                        {m.phone ? `${m.phone} · ` : ""}
                        {formatMoneyBRL(rate)}/km · {days} dia(s) com rota
                      </div>
                      <div className="hint">
                        Pagamento: {payDayLabel(m.payDayPreference)} ·{" "}
                        {payMethodLabel(m.payMethodPreference)}
                        {m.pixKey ? ` · PIX ${m.pixKey}` : ""}
                      </div>
                      <div className="hint">
                        Acesso:{" "}
                        {m.passwordSet
                          ? "senha definida (admin ou motoboy)"
                          : m.email
                            ? "e-mail ok — defina a senha ou gere 1º acesso"
                            : "sem e-mail/usuário ainda"}
                      </div>
                      <div className="moto-finance-line">
                        <span>
                          Pendente:{" "}
                          <strong>{formatMoneyBRL(fin.pending)}</strong>
                        </span>
                        <span>
                          Acertado:{" "}
                          <strong>{formatMoneyBRL(fin.settled)}</strong>
                        </span>
                        <span>
                          Total ganho:{" "}
                          <strong>{formatMoneyBRL(fin.earned)}</strong>
                        </span>
                      </div>
                      {shownCode ? (
                        <div className="status ok" style={{ marginTop: "0.5rem" }}>
                          Código de 1º acesso (mostre uma vez):{" "}
                          <strong>{shownCode}</strong>
                        </div>
                      ) : null}
                      <div
                        className="row-actions"
                        style={{ marginTop: "0.65rem", flexWrap: "wrap" }}
                      >
                        <button
                          type="button"
                          className="btn"
                          disabled={busyId === m.id}
                          onClick={() => void generateAccess(m)}
                        >
                          {busyId === m.id
                            ? "Gerando…"
                            : m.passwordSet
                              ? "Gerar novo código de 1º acesso"
                              : "Gerar 1º acesso"}
                        </button>
                      </div>
                      {m.email ? (
                        <div
                          className="field"
                          style={{ marginTop: "0.5rem", maxWidth: 320 }}
                        >
                          <label>
                            {m.passwordSet
                              ? "Alterar senha (não fica visível depois)"
                              : "Criar senha (não fica visível depois)"}
                          </label>
                          <input
                            type="password"
                            value={resetPwd[m.id] || ""}
                            onChange={(e) =>
                              setResetPwd((prev) => ({
                                ...prev,
                                [m.id]: e.target.value,
                              }))
                            }
                            placeholder="Digite a senha"
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            className="btn"
                            style={{ marginTop: "0.35rem" }}
                            disabled={busyId === m.id}
                            onClick={() => void resetPassword(m)}
                          >
                            {m.passwordSet ? "Alterar senha" : "Criar senha"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => startEdit(m)}
                      >
                        Editar perfil
                      </button>
                      <button
                        type="button"
                        className="btn danger ghost"
                        onClick={() => remove(m.id)}
                      >
                        Remover
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
