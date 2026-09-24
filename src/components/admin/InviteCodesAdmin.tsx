import { useEffect, useState } from "react";
import {
  type AuthRole,
  type InviteCode,
  createInviteCode,
  listInviteCodes,
} from "../../lib/auth";

type Props = {
  companyId: string;
};

export function InviteCodesAdmin({ companyId }: Props) {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [role, setRole] = useState<AuthRole>("motoboy");
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const list = await listInviteCodes(companyId);
      setCodes(list);
    } catch (err) {
      setMsg(
        err instanceof Error
          ? err.message
          : "Falha ao carregar códigos (rode a migration de auth).",
      );
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function create() {
    setBusy(true);
    setMsg("");
    try {
      const created = await createInviteCode({
        companyId,
        role,
        label:
          label.trim() ||
          (role === "motoboy" ? "Acesso motoboy" : "Acesso equipe"),
      });
      setCodes((prev) => [created, ...prev]);
      setLabel("");
      setMsg(`Código criado: ${created.code}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha ao criar código.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setMsg(`Copiado: ${code}`);
    } catch {
      setMsg(code);
    }
  }

  return (
    <section className="panel">
      <h2>Códigos de acesso</h2>
      <p className="lede">
        Gere códigos para cadastro de motoboys ou da equipe. No registro, a
        pessoa informa e-mail, senha e este código.
      </p>

      <div className="form-grid">
        <div className="field">
          <label>Tipo</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AuthRole)}
          >
            <option value="motoboy">Motoboy</option>
            <option value="company">Equipe da empresa</option>
          </select>
        </div>
        <div className="field">
          <label>Rótulo (opcional)</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex: Motoboys Suzano"
          />
        </div>
        <div className="row-actions">
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void create()}
          >
            Gerar código
          </button>
        </div>
        {msg ? <div className="status ok">{msg}</div> : null}

        <div className="motoboy-list">
          {codes.length === 0 ? (
            <div className="empty">Nenhum código ainda.</div>
          ) : (
            codes.map((c) => (
              <div className="motoboy-item finance-item" key={c.id}>
                <div>
                  <strong>{c.code}</strong>
                  <div className="hint">
                    {c.role === "motoboy" ? "Motoboy" : "Empresa"} · {c.label} ·{" "}
                    {c.uses}/{c.maxUses} usos
                    {!c.active ? " · inativo" : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void copy(c.code)}
                >
                  Copiar
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
