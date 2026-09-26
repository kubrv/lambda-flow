import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "../../lib/supabase";
import { AccessHistoryPanel } from "./AccessHistoryPanel";

type CompanyRow = {
  id: string;
  name: string;
  email: string;
  ownerName: string;
  phone: string;
  address: string;
  planStatus: string;
  planPrice: number;
  planPaidUntil: string | null;
  daysLeft: number;
  planMethod: string;
  active: boolean;
  inactive30: boolean;
  clientDays: number;
  createdAt: string;
  isLambda: boolean;
};

type CouponRow = {
  id: string;
  code: string;
  label: string;
  percent_off: number;
  max_uses: number;
  uses: number;
  active: boolean;
  for_first_n: number | null;
  notes: string | null;
};

type Props = {
  companyId: string;
};

async function masterFetch(action: string, body?: Record<string, unknown>) {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Faça login.");
  const res = await fetch("/api/master", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !json.ok) {
    throw new Error(String(json.error || "Falha no Painel Master."));
  }
  return json;
}

export function MasterAdminPanel({ companyId }: Props) {
  const [tab, setTab] = useState<"empresas" | "cupons" | "manutencao" | "acessos">(
    "empresas",
  );
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "inactive30">("all");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [maintMsg, setMaintMsg] = useState("");
  const [whatsapp, setWhatsapp] = useState("5511947200616");
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newMax, setNewMax] = useState("10");
  const [newPct, setNewPct] = useState("100");

  const loadCompanies = useCallback(async () => {
    const json = await masterFetch("list-companies");
    setCompanies((json.companies as CompanyRow[]) || []);
  }, []);

  const loadCoupons = useCallback(async () => {
    const json = await masterFetch("list-coupons");
    setCoupons((json.coupons as CouponRow[]) || []);
  }, []);

  const loadSettings = useCallback(async () => {
    const json = await masterFetch("get-settings");
    const s = json.settings as {
      maintenance?: boolean;
      maintenance_message?: string;
      contact_whatsapp?: string;
    };
    setMaintenance(Boolean(s?.maintenance));
    setMaintMsg(
      s?.maintenance_message ||
        "Rotaz em manutenção rápida. Já voltamos — fale conosco no WhatsApp se precisar.",
    );
    setWhatsapp(s?.contact_whatsapp || "5511947200616");
  }, []);

  useEffect(() => {
    void (async () => {
      setBusy(true);
      setErr("");
      try {
        await Promise.all([loadCompanies(), loadCoupons(), loadSettings()]);
      } catch (e) {
        setErr(
          e instanceof Error
            ? e.message.includes("plan_coupons") ||
              /schema cache|does not exist/i.test(e.message)
              ? "Rode supabase/migration_master_coupons_maintenance.sql no Supabase."
              : e.message
            : "Falha ao carregar Painel Master.",
        );
      } finally {
        setBusy(false);
      }
    })();
  }, [loadCompanies, loadCoupons, loadSettings]);

  const filtered = companies.filter((c) => {
    if (filter === "active") return c.active;
    if (filter === "inactive30") return c.inactive30 && !c.isLambda;
    return true;
  });

  async function saveCoupon() {
    setErr("");
    setMsg("");
    try {
      await masterFetch("upsert-coupon", {
        code: newCode,
        label: newLabel,
        maxUses: Number(newMax) || 10,
        percentOff: Number(newPct) || 100,
        forFirstN: Number(newMax) || 10,
      });
      setNewCode("");
      setNewLabel("");
      setMsg("Cupom salvo.");
      await loadCoupons();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar cupom.");
    }
  }

  async function toggleCoupon(id: string) {
    try {
      await masterFetch("toggle-coupon", { id });
      await loadCoupons();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao alterar cupom.");
    }
  }

  async function saveMaintenance(next: boolean) {
    setErr("");
    setMsg("");
    try {
      await masterFetch("set-maintenance", {
        maintenance: next,
        message: maintMsg,
        whatsapp,
      });
      setMaintenance(next);
      setMsg(next ? "Site em modo manutenção." : "Site online novamente.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar manutenção.");
    }
  }

  return (
    <div className="admin-shell master-shell">
      <div className="admin-mode-banner master-banner" role="status">
        <span className="admin-mode-badge">Painel Master</span>
        <span className="admin-mode-company">
          Conta Lambda · gestão da plataforma Rotaz
        </span>
      </div>
      <div className="admin-shell-head">
        <div>
          <h1>Painel Master Rotaz</h1>
          <p className="lede" style={{ margin: 0 }}>
            Empresas, cupons de plano, manutenção do site e histórico de acessos.
          </p>
        </div>
      </div>

      <nav className="admin-tabs" aria-label="Master">
        {(
          [
            ["empresas", "Empresas"],
            ["cupons", "Cupons"],
            ["manutencao", "Manutenção"],
            ["acessos", "Acessos"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`admin-tab${tab === id ? " active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {busy ? <p className="hint">Carregando…</p> : null}
      {err ? <div className="status err">{err}</div> : null}
      {msg ? <div className="status ok">{msg}</div> : null}

      {tab === "empresas" ? (
        <section className="panel">
          <h2>Empresas no site</h2>
          <div className="access-log-filters">
            {(
              [
                ["all", "Todas"],
                ["active", "Ativas"],
                ["inactive30", "Inativas · 30 dias"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`btn ${filter === id ? "primary" : "ghost"}`}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="motoboy-list">
            {filtered.map((c) => (
              <div className="motoboy-item finance-item" key={c.id}>
                <div style={{ flex: 1 }}>
                  <strong>
                    {c.name}
                    {c.isLambda ? " · Lambda" : ""}
                  </strong>
                  <div className="hint">
                    <span
                      className={`finance-chip ${c.active ? "paid" : "open"}`}
                    >
                      {c.active ? "Ativa" : c.planStatus}
                    </span>
                    {c.inactive30 && !c.active ? " · inativa 30d" : ""}
                    {c.email ? ` · ${c.email}` : ""}
                    {c.phone ? ` · WhatsApp ${c.phone}` : ""}
                  </div>
                  <div className="hint">
                    Plano {formatMoney(c.planPrice)}/mês
                    {c.planMethod ? ` · ${c.planMethod}` : ""}
                    {c.daysLeft > 0
                      ? ` · ${c.daysLeft} dia(s) restantes`
                      : c.active
                        ? ""
                        : " · sem plano ativo"}
                    {` · cliente há ${c.clientDays} dia(s)`}
                  </div>
                  {c.address ? (
                    <div className="hint">Endereço: {c.address}</div>
                  ) : null}
                </div>
              </div>
            ))}
            {!filtered.length ? (
              <div className="empty">Nenhuma empresa neste filtro.</div>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === "cupons" ? (
        <section className="panel">
          <h2>Cupons de plano</h2>
          <p className="lede">
            Ex.: ROTAZ10 — 100% off para os 10 primeiros cadastros de empresa.
          </p>
          <div className="form-grid">
            <div className="field">
              <label>Código</label>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="ROTAZ10"
              />
            </div>
            <div className="field">
              <label>Rótulo</label>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="10 primeiros"
              />
            </div>
            <div className="field">
              <label>% desconto</label>
              <input
                type="number"
                min={0}
                max={100}
                value={newPct}
                onChange={(e) => setNewPct(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Máx. usos</label>
              <input
                type="number"
                min={1}
                value={newMax}
                onChange={(e) => setNewMax(e.target.value)}
              />
            </div>
            <button type="button" className="btn primary" onClick={() => void saveCoupon()}>
              Salvar cupom
            </button>
          </div>
          <div className="motoboy-list" style={{ marginTop: "1rem" }}>
            {coupons.map((c) => (
              <div className="motoboy-item" key={c.id}>
                <div>
                  <strong>{c.code}</strong>
                  <div className="hint">
                    {c.label} · {c.percent_off}% · {c.uses}/{c.max_uses} usos ·{" "}
                    {c.active ? "ativo" : "inativo"}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void toggleCoupon(c.id)}
                >
                  {c.active ? "Desativar" : "Ativar"}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "manutencao" ? (
        <section className="panel">
          <h2>Manutenção do site</h2>
          <p className="lede">
            Status atual:{" "}
            <strong>{maintenance ? "EM MANUTENÇÃO" : "Online"}</strong>
          </p>
          <div className="field">
            <label>Mensagem curta</label>
            <textarea
              rows={3}
              value={maintMsg}
              onChange={(e) => setMaintMsg(e.target.value)}
            />
          </div>
          <div className="field">
            <label>WhatsApp de contato (só dígitos)</label>
            <input
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="55119…"
            />
          </div>
          <div className="row-actions">
            {!maintenance ? (
              <button
                type="button"
                className="btn danger"
                onClick={() => void saveMaintenance(true)}
              >
                Colocar site em manutenção
              </button>
            ) : (
              <button
                type="button"
                className="btn primary"
                onClick={() => void saveMaintenance(false)}
              >
                Tirar manutenção (online)
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => void saveMaintenance(maintenance)}
            >
              Salvar mensagem / WhatsApp
            </button>
          </div>
        </section>
      ) : null}

      {tab === "acessos" ? (
        <AccessHistoryPanel companyId={companyId} />
      ) : null}
    </div>
  );
}

function formatMoney(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
