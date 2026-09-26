import { useState } from "react";
import {
  adminSetMotoboyPassword,
  provisionMotoboyAccount,
  resetOneMotoboyLogin,
} from "../../lib/auth";
import { motoboyFinanceSummary } from "../../lib/finance";
import { formatMoneyBRL } from "../../lib/labels";
import {
  PAY_DAY_OPTIONS,
  PAY_METHOD_OPTIONS,
  type PayDayPreference,
  type PayMethod,
} from "../../lib/payPrefs";
import { deleteFinanceRows, deleteMotoboyRow, saveData } from "../../lib/storage";
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
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft>(emptyDraft);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);
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
    setShowAdd(false);
    setMsg(
      "Motoboy cadastrado. Abra Gerenciar e informe usuário + celular para gerar o 1º acesso.",
    );
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
    const username = (editingId === m.id ? edit.username : m.username || "")
      .trim()
      .toLowerCase();
    const name = (editingId === m.id ? edit.name : m.name).trim();
    const phone = (editingId === m.id ? edit.phone : m.phone || "").trim();
    const email = (editingId === m.id ? edit.email : m.email || "")
      .trim()
      .toLowerCase();
    if (!phone || !name) {
      setErr("Salve nome e celular. Informe o e-mail (obrigatório) para o acesso.");
      return;
    }
    if (!email) {
      setErr("E-mail é obrigatório para o acesso do motoboy. Usuário é opcional.");
      return;
    }
    const patched = data.motoboys.map((row) =>
      row.id === m.id
        ? {
            ...row,
            name,
            username: username || undefined,
            phone,
            email,
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
        username: username || undefined,
        phone,
        email,
      });
      const code = String(result.accessCode || "");
      setAccessCodes((prev) => ({ ...prev, [m.id]: code }));
      onChange({
        ...nextData,
        motoboys: patched.map((row) =>
          row.id === m.id
            ? {
                ...row,
                passwordSet: false,
                username: username || undefined,
                phone,
                email: email || String(result.email || "") || undefined,
              }
            : row,
        ),
      });
      setMsg(
        `Senha provisória (4 dígitos) para ${name}: ${code}. No 1º acesso ele troca pela senha definitiva. Login: ${email}${username ? ` ou @${username}` : ""}.`,
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

  async function resetOneLogin(m: Motoboy) {
    setErr("");
    setMsg("");
    if (
      !window.confirm(
        `Resetar o login de ${m.name}? Ele precisará de um novo 1º acesso.`,
      )
    ) {
      return;
    }
    setBusyId(m.id);
    try {
      await resetOneMotoboyLogin(m.id);
      onChange({
        ...data,
        motoboys: data.motoboys.map((row) =>
          row.id === m.id
            ? { ...row, userId: undefined, passwordSet: false }
            : row,
        ),
      });
      setAccessCodes((prev) => {
        const n = { ...prev };
        delete n[m.id];
        return n;
      });
      setMsg("Login resetado. Gere um novo 1º acesso (senha de 4 dígitos).");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao resetar login.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    const ok = window.confirm("Remover este motoboy?");
    if (!ok) return;
    const finIds = data.finance
      .filter((f) => f.motoboyId === id)
      .map((f) => f.id);
    try {
      await deleteMotoboyRow(id);
      if (finIds.length) await deleteFinanceRows(finIds);
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao remover motoboy.");
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
          <label htmlFor={`${idPrefix}-phone`}>Celular (obrigatório p/ acesso)</label>
          <input
            id={`${idPrefix}-phone`}
            value={value.phone}
            onChange={(e) => setValue({ ...value, phone: e.target.value })}
            placeholder="(11) 90000-0000"
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-email`}>E-mail (obrigatório p/ acesso)</label>
          <input
            id={`${idPrefix}-email`}
            type="email"
            value={value.email}
            onChange={(e) => setValue({ ...value, email: e.target.value })}
            placeholder="ex: joao@empresa.com"
            autoComplete="off"
            name={`${idPrefix}-email`}
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-user`}>Usuário (opcional — facilita o login)</label>
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
        Cadastre com nome, <strong>usuário</strong> e <strong>celular</strong>.
        Em Gerenciar, gere o 1º acesso (senha de 4 dígitos). E-mail e preferências
        são opcionais.
      </p>
      <div className="row-actions" style={{ marginBottom: "0.75rem" }}>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            setShowAdd((v) => !v);
            setErr("");
            setMsg("");
          }}
        >
          {showAdd ? "Fechar formulário" : "Adicionar motoboy"}
        </button>
      </div>

      <div className="form-grid">
        {showAdd ? (
          <>
            {profileFields(draft, setDraft, "m")}
            <div className="row-actions">
              <button type="button" className="btn primary" onClick={add}>
                Salvar motoboy
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setShowAdd(false);
                  setDraft(emptyDraft());
                }}
              >
                Cancelar
              </button>
            </div>
          </>
        ) : null}
        {msg ? <div className="status ok">{msg}</div> : null}
        {err ? <div className="status err">{err}</div> : null}

        <div className="motoboy-list">
          {data.motoboys.map((m) => {
            const days = Object.values(data.routesByDate).filter(
              (r) => r.motoboyId === m.id,
            ).length;
            const completedRoutes = Object.values(data.routesByDate).filter(
              (r) =>
                r.motoboyId === m.id &&
                (r.completionStatus === "completed" ||
                  r.completionStatus === "verified"),
            ).length;
            const fin = motoboyFinanceSummary(data.finance, m.id);
            const rate = m.pricePerKm ?? DEFAULT_PRICE_PER_KM;
            const shownCode = accessCodes[m.id];
            const managing = managingId === m.id;
            return (
              <div className="motoboy-item finance-item" key={m.id}>
                <div style={{ flex: 1, width: "100%" }}>
                  <div className="moto-card-head">
                    <div>
                      <strong>{m.name}</strong>
                      <div className="hint">
                        {m.username ? `@${m.username}` : "sem usuário"}
                        {m.phone ? ` · ${m.phone}` : ""}
                        {" · "}
                        {formatMoneyBRL(rate)}/km · {days} dia(s) ·{" "}
                        {completedRoutes} rota
                        {completedRoutes === 1 ? "" : "s"} concluída
                        {completedRoutes === 1 ? "" : "s"}
                      </div>
                      <div className="hint">
                        Acesso:{" "}
                        {m.passwordSet
                          ? "senha definitiva ok"
                          : m.username
                            ? "aguardo 1º acesso / senha provisória"
                            : "cadastre usuário e celular"}
                      </div>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => {
                          setManagingId(managing ? null : m.id);
                          if (!managing) {
                            setEditingId(m.id);
                            setEdit(fromMotoboy(m));
                          } else {
                            setEditingId(null);
                            setEdit(emptyDraft());
                          }
                          setErr("");
                          setMsg("");
                        }}
                      >
                        {managing ? "Fechar" : "Gerenciar motoboy"}
                      </button>
                      <button
                        type="button"
                        className="btn danger ghost"
                        onClick={() => void remove(m.id)}
                      >
                        Remover
                      </button>
                    </div>
                  </div>

                  {managing ? (
                    <div className="moto-manage-panel">
                      {profileFields(edit, setEdit, `e-${m.id}`)}
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn primary"
                          onClick={saveEdit}
                        >
                          Salvar perfil
                        </button>
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
                          Total: <strong>{formatMoneyBRL(fin.earned)}</strong>
                        </span>
                      </div>
                      {shownCode ? (
                        <div className="status ok" style={{ marginTop: "0.5rem" }}>
                          Senha provisória (4 dígitos):{" "}
                          <strong style={{ fontSize: "1.25rem" }}>
                            {shownCode}
                          </strong>
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
                            : "Gerar 1º acesso (4 dígitos)"}
                        </button>
                        <button
                          type="button"
                          className="btn danger ghost"
                          disabled={busyId === m.id}
                          onClick={() => void resetOneLogin(m)}
                        >
                          Resetar login deste motoboy
                        </button>
                      </div>
                      <div
                        className="field"
                        style={{ marginTop: "0.5rem", maxWidth: 320 }}
                      >
                        <label>Definir senha definitiva (opcional)</label>
                        <input
                          type="password"
                          value={resetPwd[m.id] || ""}
                          onChange={(e) =>
                            setResetPwd((prev) => ({
                              ...prev,
                              [m.id]: e.target.value,
                            }))
                          }
                          placeholder="Mín. 6 caracteres"
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="btn"
                          style={{ marginTop: "0.35rem" }}
                          disabled={busyId === m.id}
                          onClick={() => void resetPassword(m)}
                        >
                          Salvar senha
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
