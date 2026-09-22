import { useState } from "react";
import { motoboyFinanceSummary } from "../../lib/finance";
import { formatMoneyBRL } from "../../lib/labels";
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
};

const emptyDraft = (): Draft => ({
  name: "",
  phone: "",
  company: "",
  pricePerKm: String(DEFAULT_PRICE_PER_KM),
});

export function MotoboysAdmin({ data, onChange }: Props) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft>(emptyDraft);
  const [msg, setMsg] = useState("");

  function parsePrice(raw: string): number {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_PRICE_PER_KM;
  }

  function add() {
    const n = draft.name.trim();
    if (!n) {
      setMsg("Informe o nome do motoboy.");
      return;
    }
    const motoboy: Motoboy = {
      id: createId(),
      name: n,
      phone: draft.phone.trim() || undefined,
      company: draft.company.trim() || undefined,
      pricePerKm: parsePrice(draft.pricePerKm),
    };
    onChange({ ...data, motoboys: [...data.motoboys, motoboy] });
    setDraft(emptyDraft());
    setMsg("Motoboy cadastrado.");
  }

  function startEdit(m: Motoboy) {
    setEditingId(m.id);
    setEdit({
      name: m.name,
      phone: m.phone || "",
      company: m.company || "",
      pricePerKm: String(m.pricePerKm ?? DEFAULT_PRICE_PER_KM),
    });
    setMsg("");
  }

  function saveEdit() {
    if (!editingId) return;
    const n = edit.name.trim();
    if (!n) {
      setMsg("Informe o nome.");
      return;
    }
    onChange({
      ...data,
      motoboys: data.motoboys.map((m) =>
        m.id === editingId
          ? {
              ...m,
              name: n,
              phone: edit.phone.trim() || undefined,
              company: edit.company.trim() || undefined,
              pricePerKm: parsePrice(edit.pricePerKm),
            }
          : m,
      ),
    });
    setEditingId(null);
    setEdit(emptyDraft());
    setMsg("Perfil do motoboy atualizado.");
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

  return (
    <section className="panel">
      <h2>Cadastro de motoboys</h2>
      <p className="lede">
        Perfil com nome, telefone, empresa e valor/km. Para dar login ao
        motoboy, gere um código na aba <strong>Códigos</strong> e envie para ele
        se cadastrar (e-mail + senha + código).
      </p>

      <div className="form-grid">
        <div className="moto-profile-grid">
          <div className="field">
            <label htmlFor="m-name">Nome</label>
            <input
              id="m-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Nome"
            />
          </div>
          <div className="field">
            <label htmlFor="m-phone">Telefone</label>
            <input
              id="m-phone"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="(11) 90000-0000"
            />
          </div>
          <div className="field">
            <label htmlFor="m-company">Empresa</label>
            <input
              id="m-company"
              value={draft.company}
              onChange={(e) => setDraft({ ...draft, company: e.target.value })}
              placeholder="Ex: Lambda / Frota X"
            />
          </div>
          <div className="field">
            <label htmlFor="m-price">Valor por km (R$)</label>
            <input
              id="m-price"
              type="number"
              min="0.01"
              step="0.01"
              value={draft.pricePerKm}
              onChange={(e) =>
                setDraft({ ...draft, pricePerKm: e.target.value })
              }
            />
          </div>
        </div>
        <div className="row-actions">
          <button type="button" className="btn primary" onClick={add}>
            Adicionar motoboy
          </button>
        </div>
        {msg ? <div className="status ok">{msg}</div> : null}

        <div className="motoboy-list">
          {data.motoboys.map((m) => {
            const days = Object.values(data.routesByDate).filter(
              (r) => r.motoboyId === m.id,
            ).length;
            const fin = motoboyFinanceSummary(data.finance, m.id);
            const rate = m.pricePerKm ?? DEFAULT_PRICE_PER_KM;
            return (
              <div className="motoboy-item finance-item" key={m.id}>
                {editingId === m.id ? (
                  <div className="form-grid" style={{ flex: 1, width: "100%" }}>
                    <div className="moto-profile-grid">
                      <div className="field">
                        <label>Nome</label>
                        <input
                          value={edit.name}
                          onChange={(e) =>
                            setEdit({ ...edit, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Telefone</label>
                        <input
                          value={edit.phone}
                          onChange={(e) =>
                            setEdit({ ...edit, phone: e.target.value })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Empresa</label>
                        <input
                          value={edit.company}
                          onChange={(e) =>
                            setEdit({ ...edit, company: e.target.value })
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Valor por km (R$)</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={edit.pricePerKm}
                          onChange={(e) =>
                            setEdit({ ...edit, pricePerKm: e.target.value })
                          }
                        />
                      </div>
                    </div>
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
                    <div>
                      <strong>{m.name}</strong>
                      <div className="hint">
                        {m.company ? `${m.company} · ` : ""}
                        {m.phone ? `${m.phone} · ` : ""}
                        {formatMoneyBRL(rate)}/km · {days} dia(s) com rota
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
